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
}

/**
 * The boot sequence: a BIOS-style POST with real information about your
 * machine and vault, then the logo "decrypts" over falling glyphs.
 * Any key skips. `boot.mode` = full | fast | off.
 */
export class BootScreen {
  done = false;
  private t0 = performance.now();
  private rain = new Rain(0.7);
  private readonly lineMs: number;
  private readonly postEnd: number;
  private readonly logoEnd: number;
  private readonly end: number;

  constructor(
    private readonly lines: BootLine[],
    private readonly memMB: number,
    mode: "full" | "fast",
  ) {
    this.lineMs = mode === "full" ? 85 : 0;
    this.postEnd = mode === "full" ? lines.length * this.lineMs + 500 : 0;
    this.logoEnd = this.postEnd + (mode === "full" ? 1500 : 700);
    this.end = this.logoEnd + (mode === "full" ? 1600 : 300);
  }

  private get elapsed(): number {
    return performance.now() - this.t0;
  }

  /** A key was pressed: jump ahead (first to the logo, then out). */
  skip(): void {
    if (this.elapsed < this.postEnd) this.t0 = performance.now() - this.postEnd;
    else if (this.elapsed < this.logoEnd) this.t0 = performance.now() - this.logoEnd;
    else this.done = true;
  }

  render(ui: UI): void {
    const t = this.elapsed;
    if (t >= this.end) {
      this.done = true;
      return;
    }
    ui.animate(16);
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
    const tag = "OPEN-SOURCE CYBERDECK ENVIRONMENT";
    ui.textCenter(screen, ly + logo.length + 1, decrypt(tag, p, ui.now), { fg: c.muted, attrs: BOLD });
    if (t > this.logoEnd) {
      const blink = Math.floor(ui.now / 450) % 2 === 0;
      ui.textCenter(screen, ly + logo.length + 3, blink ? "[ PRESS ANY KEY TO JACK IN ]" : "", { fg: c.accent, attrs: BOLD });
    }
  }

  private renderPost(ui: UI, t: number): void {
    const c = ui.c;
    const n = this.lineMs ? Math.min(this.lines.length, Math.floor(t / this.lineMs) + 1) : this.lines.length;
    const x = 2;
    let y = 1;
    ui.text(x, y++, "ICEBREAKER BIOS v0.1.0 · open firmware · no warranty, no masters", { fg: c.accent, attrs: BOLD });
    ui.text(x, y++, "(c) the ICEBREAKER contributors — MIT licensed — https://github.com/", { fg: c.subtle, attrs: DIM });
    y++;
    // memory check counts up
    const memP = Math.min(1, t / Math.max(1, this.postEnd * 0.4));
    ui.text(x, y++, `MEM  testing ${String(Math.floor(this.memMB * memP)).padStart(6)} MB ${memP >= 1 ? "OK" : ""}`, { fg: c.fg });
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
      ui.text(lx, y, l.text, { fg: l.status ? c.fg : c.muted }, ui.cols - lx - 2);
    }
    if (n < this.lines.length || Math.floor(ui.now / 300) % 2) ui.text(x, y, "█", { fg: c.accent });
    ui.textRight(ui.cols - 2, ui.rows - 1, "any key to skip", { fg: c.faint });
  }
}
