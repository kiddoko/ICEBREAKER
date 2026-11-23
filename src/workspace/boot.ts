import pkg from "../../package.json";
import { mix } from "../core/color";
import { BOLD, DIM } from "../core/grid";
import { strWidth } from "../core/unicode";
import { decrypt, SCRAMBLE_BLOCKS } from "../fx/glitch";
import { Rain } from "../fx/rain";
import { bigText, SMALL_LOGO } from "../ui/bigtext";
import type { UI } from "../ui/ui";

export interface BootLine {
  text: string;
  status?: "OK" | "WARN" | "FAIL" | "INFO";
  /** how long the step really took */
  ms?: number;
}

/**
 * The boot sequence: a BIOS-style POST that runs live. Each line appears when
 * the startup step it describes has really finished (with its real duration),
 * then the logo "decrypts" over falling glyphs. Any key skips.
 * `boot.mode` = full | fast | off.
 */
export class BootScreen {
  done = false;
  private t0 = performance.now();
  private rain = new Rain(0.7);
  private readonly lineMs: number;
  private readonly mode: "full" | "fast";
  /** when each line became visible (ms since t0) */
  private shownAt: number[] = [];
  private finished = false;
  /** set once startup is over: the POST ends, then the logo */
  private postEnd = Infinity;
  private logoEnd = Infinity;
  private end = Infinity;
  memMB = 0;

  constructor(mode: "full" | "fast", private readonly lines: BootLine[] = []) {
    this.mode = mode;
    // in full mode lines come in at a readable pace, never before their step is done
    this.lineMs = mode === "full" ? 70 : 0;
    if (lines.length) this.finish();
  }

  private get elapsed(): number {
    return performance.now() - this.t0;
  }

  /** The same POST again, from the start (`reboot`). */
  replay(): BootScreen {
    const b = new BootScreen("full", [...this.lines]);
    b.memMB = this.memMB;
    return b;
  }

  /** A startup step finished. */
  log(line: BootLine): void {
    this.lines.push(line);
  }

  /** Startup is over: let the POST play out, then the logo. */
  finish(): void {
    this.finished = true;
  }

  /** The last line is on screen (at `at`): time the pause and the logo from there. */
  private schedule(at: number): void {
    this.postEnd = at + (this.mode === "full" ? 500 : 0);
    this.logoEnd = this.postEnd + (this.mode === "full" ? 1500 : 700);
    this.end = this.logoEnd + (this.mode === "full" ? 1600 : 300);
  }

  /** A key was pressed: jump ahead (first to the logo, then out). */
  skip(): void {
    const t = this.elapsed;
    this.shownAt = this.lines.map(() => 0); // show everything loaded so far
    if (!this.finished) return; // can't get ahead of the real startup
    if (!Number.isFinite(this.postEnd)) this.schedule(t);
    if (t < this.postEnd) this.t0 = performance.now() - this.postEnd;
    else if (t < this.logoEnd) this.t0 = performance.now() - this.logoEnd;
    else this.done = true;
  }

  render(ui: UI): void {
    // "PRESS ANY KEY TO JACK IN" waits for a key: it never moves on by itself
    const t = Math.min(this.elapsed, this.end - 1);
    // 30 frames a second while it plays; 12 once it waits on "press any key" (the cursor
    // blinks, the rain falls — a full core went to it at the screen's rate)
    const waiting = this.elapsed >= this.end - 1;
    this.rain.frameMs = waiting ? 80 : 33;
    ui.animate(waiting ? 80 : 33);
    const c = ui.c;
    const screen = { x: 0, y: 0, w: ui.cols, h: ui.rows };

    if (t < this.postEnd) {
      this.renderPost(ui, t);
      return;
    }

    // logo phase
    this.rain.render(ui, screen);
    ui.tint(screen, mix(c.bg, c.accent, 0.25)); // push the rain back
    const big = bigText("ICEBREAKER");
    const logo = ui.cols >= strWidth(big[0]) + 4 ? big : SMALL_LOGO;
    const lw = strWidth(logo[0]);
    const lx = Math.floor((ui.cols - lw) / 2);
    const ly = Math.floor((ui.rows - logo.length) / 2) - 2;
    const p = Math.min(1, (t - this.postEnd) / (this.logoEnd - this.postEnd));
    ui.fill({ x: lx - 2, y: ly - 1, w: lw + 4, h: logo.length + 5 }, { bg: c.bg });
    logo.forEach((line, i) => {
      const shown = decrypt(line, Math.min(1, p * 1.3 - i * 0.05), ui.now, SCRAMBLE_BLOCKS);
      ui.gradientText(lx, ly + i, shown, ui.theme.gradient, BOLD, p < 1 ? 0 : (ui.now / 3000) % 0.15);
    });
    const tag = "open-source cyberdeck environment";
    ui.textCenter(screen, ly + logo.length + 1, decrypt(tag, p, ui.now), { fg: c.muted, attrs: BOLD });
    if (t > this.logoEnd) {
      const blink = Math.floor(ui.now / 450) % 2 === 0;
      ui.textCenter(screen, ly + logo.length + 3, blink ? "[ press any key to jack in ]" : "", { fg: c.accent, attrs: BOLD });
    }
  }

  private renderPost(ui: UI, t: number): void {
    const c = ui.c;
    // a line shows once its step is done AND the previous one has had its moment
    for (let i = this.shownAt.length; i < this.lines.length; i++) {
      const at = Math.max(t, (this.shownAt[i - 1] ?? 0) + this.lineMs);
      if (at > t) break;
      this.shownAt.push(at);
    }
    const n = this.shownAt.length;
    if (this.finished && n === this.lines.length && !Number.isFinite(this.postEnd)) this.schedule(this.shownAt[n - 1] ?? t);
    const x = 2;
    let y = 1;
    ui.text(x, y++, `ICEBREAKER BIOS v${pkg.version} · open firmware · no warranty, no masters`, { fg: c.accent, attrs: BOLD });
    ui.text(x, y++, "(c) the ICEBREAKER contributors — MIT licensed — https://github.com/kiddoko/ICEBREAKER", { fg: c.subtle, attrs: DIM });
    ui.text(x, y++, "⚠ test software, never audited: store nothing sensitive · back up your vault · report bugs (DISCLAIMER.md)", { fg: c.warning });
    y++;
    // memory check counts up
    const memP = this.memMB ? Math.min(1, t / 400) : 0;
    ui.text(x, y++, `MEM  ${this.memMB ? "testing" : "probing"} ${String(Math.floor(this.memMB * memP)).padStart(6)} MB ${memP >= 1 ? "OK" : ""}`, { fg: c.fg });
    y++;
    for (let i = 0; i < n && y < ui.rows - 2; i++, y++) {
      const l = this.lines[i];
      let lx = x;
      if (l.status) {
        const color = { OK: c.success, WARN: c.warning, FAIL: c.error, INFO: c.info }[l.status];
        lx = ui.text(lx, y, "[", { fg: c.subtle });
        lx = ui.text(lx, y, ` ${l.status.padEnd(4).slice(0, 4)} `.slice(0, 6), { fg: color, attrs: BOLD });
        lx = ui.text(lx, y, "] ", { fg: c.subtle });
      }
      const ms = l.ms === undefined ? "" : l.ms < 1 ? "<1 ms" : `${Math.round(l.ms)} ms`;
      const msW = ms ? strWidth(ms) + 2 : 0;
      ui.text(lx, y, l.text, { fg: l.status ? c.fg : c.muted }, ui.cols - lx - 2 - msW);
      if (ms) ui.textRight(ui.cols - 2, y, ms, { fg: (l.ms ?? 0) > 500 ? c.warning : c.subtle, attrs: DIM });
    }
    // still loading: a spinner on the next line; loaded: the blinking cursor
    if (!this.finished && n === this.lines.length && y < ui.rows - 2) ui.text(x, y, `[  ${ui.spinner()}   ] working…`, { fg: c.subtle });
    else if (n < this.lines.length || Math.floor(ui.now / 300) % 2) ui.text(x, y, "█", { fg: c.accent });
    if (this.elapsed < this.logoEnd) ui.textRight(ui.cols - 2, ui.rows - 1, "any key to skip", { fg: c.subtle });
  }
}
