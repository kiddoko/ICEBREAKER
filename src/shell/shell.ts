import { mix } from "../core/color";
import { BOLD, DIM, type Rect } from "../core/grid";
import type { Action, KeyInput } from "../core/input";
import { strWidth } from "../core/unicode";
import type { App } from "../apps/types";
import type { Deck } from "../deck";
import { basename, dirname, display, resolvePath } from "../vault/paths";
import type { UI } from "../ui/ui";
import { ShellExecutor } from "./exec";
import { TerminalBuffer } from "./terminal";
import type { ReadOptions } from "./types";

interface Reading {
  label: string;
  opts: ReadOptions;
  sel: number;
  done(v: string | null): void;
}

const HISTORY_FILE = ".icebreaker/shell_history";

/**
 * The shell panel: scrollback + a prompt with fish-style niceties
 * (live syntax coloring, history autosuggestions, Tab completion).
 */
export class ShellApp implements App {
  readonly kind = "shell";
  readonly key = "shell";
  readonly term = new TerminalBuffer();
  readonly exec: ShellExecutor;

  private input = "";
  private cursor = 0;
  private histIndex = -1;
  private histDraft = "";
  private scroll = 0;
  private lastInputAt = 0;
  private saveTimer: ReturnType<typeof setTimeout> | undefined;
  /** An interactive command is waiting for an answer (ctx.read). */
  private reading: Reading | null = null;

  constructor(private readonly deck: Deck) {
    this.exec = new ShellExecutor(
      deck,
      (text, isError) => {
        this.term.write(text, isError ? { fg: deck.theme.ansi[1] } : undefined);
        this.scroll = 0;
      },
      () => this.term.clear(),
    );
    this.exec.readLine = (label, opts, signal) => this.readLine(label, opts, signal);
  }

  private readLine(label: string, opts: ReadOptions, signal: AbortSignal): Promise<string | null> {
    return new Promise((resolve) => {
      this.input = "";
      this.cursor = 0;
      const done = (v: string | null) => {
        if (this.reading !== r) return;
        this.reading = null;
        const shown = v === null ? "^C" : opts.mask ? "•".repeat(Math.min(12, v.length)) : v || "—";
        this.term.write(`\x1b[2m${label} ❯\x1b[0m ${shown}\n`);
        this.input = "";
        this.cursor = 0;
        this.deck.sound.play(v === null ? "back" : "confirm");
        resolve(v);
        this.deck.requestFrame();
      };
      const r: Reading = { label, opts, sel: 0, done };
      this.reading = r;
      signal.addEventListener("abort", () => done(null));
      this.deck.workspace.focusShellIfHidden();
      this.deck.requestFrame();
    });
  }

  /** Is the shell waiting for an answer? (the workspace keeps focus here) */
  get waiting(): boolean {
    return this.reading !== null;
  }

  private answer(): void {
    const r = this.reading;
    if (!r) return;
    const ch = r.opts.choices ?? [];
    const t = this.input.trim();
    const n = /^[1-9]$/.test(t) ? Number(t) : 0;
    if (ch.length && n >= 1 && n <= ch.length) return r.done(ch[n - 1]);
    if (ch.length && !r.opts.allowText) return r.done(t ? (ch.find((c) => c.toLowerCase().startsWith(t.toLowerCase())) ?? ch[r.sel]) : ch[r.sel]);
    r.done(this.input);
  }

  title(): string {
    return "shell";
  }

  status(): string {
    if (this.reading) return this.reading.opts.choices?.length ? "1-9 or click to answer · esc stop" : "type your answer · enter next · esc stop";
    return this.exec.running ? "running… ctrl+c to interrupt" : `${display(this.exec.cwd)} · tab complete · ↑ history`;
  }

  /** Print the login banner and load history (call once the vault is mounted). */
  motd(): void {
    void this.loadHistory();
    const handle = this.deck.settings.data.user.handle;
    this.term.write(`\x1b[2mICEBREAKER shell · ibsh 0.1 · type \x1b[0m\x1b[35mhelp\x1b[0m\x1b[2m to list commands, \x1b[0m\x1b[35mman <cmd>\x1b[0m\x1b[2m for details\x1b[0m\n`);
    this.term.write(`\x1b[2mlast login: ${new Date().toLocaleString()} on deck as \x1b[0m\x1b[95m${handle}\x1b[0m\n`);
  }

  /** Run a command line as if typed (used by the palette and buttons). */
  async runLine(line: string, echo = true): Promise<number> {
    if (echo) this.echoPrompt(line);
    if (line.trim() && this.exec.history[this.exec.history.length - 1] !== line) {
      this.exec.history.push(line);
      this.saveHistory();
    }
    const code = await this.exec.run(line);
    if (line.trim()) void this.deck.stats.add("deck.commands", 1, "deck", { label: "commands run", kind: "counter" }).catch(() => {});
    this.term.ensureNewline();
    this.deck.requestFrame();
    return code;
  }

  private echoPrompt(line: string, fromClick = false): void {
    this.term.ensureNewline();
    this.term.write(`\x1b[35m${display(this.exec.cwd)}\x1b[0m \x1b[95m❯\x1b[0m ${line}${fromClick ? "  \x1b[2m◂ ui\x1b[0m" : ""}\n`);
  }

  /**
   * Run what a click did as a visible shell command (so the mouse teaches the
   * command line). If the shell is busy (a chat, a question), it runs on the
   * side without disturbing it.
   */
  async runAction(line: string): Promise<number> {
    const cmd = this.deck.commands.get(line.trim().split(/\s+/)[0] ?? "");
    // commands that ask questions run where you can answer them
    if (cmd?.interactive) {
      this.deck.workspace.showShellTab("ibsh");
      return this.runLine(line);
    }
    if (this.exec.history[this.exec.history.length - 1] !== line) {
      this.exec.history.push(line);
      this.saveHistory();
    }
    const time = new Date().toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    this.history.ensureNewline();
    this.history.write(`\x1b[2m${time}\x1b[0m \x1b[95m❯\x1b[0m ${line}\n`);
    const side = new ShellExecutor(this.deck, (text, isError) => this.history.write(text, isError ? { fg: this.deck.theme.ansi[1] } : undefined), () => this.history.clear());
    side.cwd = this.exec.cwd;
    side.env = this.exec.env;
    const code = await side.run(line);
    this.history.ensureNewline();
    if (!this.deck.workspace.isShellTab("history")) this.unseen++;
    this.historyScroll = 0;
    this.deck.requestFrame();
    return code;
  }

  /** What clicks ran (the "history" tab), so the terminals stay clean. */
  readonly history = new TerminalBuffer();
  unseen = 0;
  private historyScroll = 0;

  readonly historyPane = {
    onAction: (a: Action): boolean => {
      if (a === "scroll-up" || a === "up") this.historyScroll += 3;
      else if (a === "scroll-down" || a === "down") this.historyScroll = Math.max(0, this.historyScroll - 3);
      else return false;
      return true;
    },
    onKey: (k: KeyInput): boolean => {
      if (k.combo === "pageup") return (this.historyScroll += 10), true;
      if (k.combo === "pagedown") return (this.historyScroll = Math.max(0, this.historyScroll - 10)), true;
      return false;
    },
  };

  renderHistory(ui: UI, r: Rect): void {
    this.unseen = 0;
    const total = this.history.rowCount(r.w);
    if (!total) return void ui.text(r.x, r.y, "commands run by clicking appear here, with their output — type them yourself next time", { fg: ui.c.faint }, r.w);
    const maxScroll = Math.max(0, total - r.h);
    this.historyScroll = Math.min(this.historyScroll, maxScroll);
    this.history.render(ui, r, Math.max(0, total - r.h - this.historyScroll));
    ui.hit(r, { onWheel: (d) => (this.historyScroll = Math.max(0, this.historyScroll - d)) });
  }

  // ── input ────────────────────────────────────────────────────────────────

  onText(t: string): boolean {
    const r = this.reading;
    if (r) {
      const ch = r.opts.choices ?? [];
      // quick answers: a digit picks a chip right away (unless typing free text)
      if (ch.length && /^[1-9]$/.test(t) && (!r.opts.allowText || !this.input) && Number(t) <= ch.length) {
        r.done(ch[Number(t) - 1]);
        return true;
      }
      this.insert(t.replace(/\n+$/, "").replace(/\n/g, " "));
      if (t.endsWith("\n")) this.answer();
      return true;
    }
    if (this.exec.running) return true;
    const clean = t.replace(/\n+$/, "");
    if (clean.includes("\n")) {
      // pasted several lines: run them one by one
      const lines = clean.split("\n");
      this.insert(lines[0]);
      void (async () => {
        for (const [i, l] of lines.entries()) {
          if (i === 0) await this.submit();
          else await this.runLine(l);
        }
      })();
      return true;
    }
    this.insert(clean);
    if (t.endsWith("\n")) void this.submit();
    return true;
  }

  private insert(s: string): void {
    this.input = this.input.slice(0, this.cursor) + s + this.input.slice(this.cursor);
    this.cursor += s.length;
    this.touched();
  }

  private touched(): void {
    this.lastInputAt = performance.now();
    this.histIndex = -1;
    this.scroll = 0;
  }

  onKey(k: KeyInput): boolean {
    if (k.combo === "ctrl+c") {
      if (this.exec.running) this.exec.interrupt();
      else {
        this.echoPrompt(this.input + "^C");
        this.input = "";
        this.cursor = 0;
      }
      return true;
    }
    if (k.combo === "ctrl+l") {
      this.term.clear();
      return true;
    }
    const rd = this.reading;
    if (rd) {
      const n = rd.opts.choices?.length ?? 0;
      if (k.combo === "esc") return this.exec.interrupt(), true;
      if (k.combo === "enter") return this.answer(), true;
      if (n && (k.combo === "up" || k.combo === "left") && !this.input) return (rd.sel = (rd.sel - 1 + n) % n), this.deck.sound.play("move"), true;
      if (n && (k.combo === "down" || k.combo === "right" || k.combo === "tab") && !this.input) return (rd.sel = (rd.sel + 1) % n), this.deck.sound.play("move"), true;
      if (k.combo === "up" || k.combo === "down" || k.combo === "tab") return true;
    } else if (this.exec.running) return k.key !== "esc";

    switch (k.combo) {
      case "enter":
        void this.submit();
        return true;
      case "backspace":
        if (this.cursor > 0) {
          this.input = this.input.slice(0, this.cursor - 1) + this.input.slice(this.cursor);
          this.cursor--;
        }
        this.touched();
        return true;
      case "delete":
        this.input = this.input.slice(0, this.cursor) + this.input.slice(this.cursor + 1);
        this.touched();
        return true;
      case "left":
        this.cursor = Math.max(0, this.cursor - 1);
        this.lastInputAt = performance.now();
        return true;
      case "right": {
        const ghost = this.suggestion();
        if (this.cursor === this.input.length && ghost) {
          this.input += ghost;
          this.cursor = this.input.length;
        } else this.cursor = Math.min(this.input.length, this.cursor + 1);
        this.lastInputAt = performance.now();
        return true;
      }
      case "home":
      case "ctrl+a":
        this.cursor = 0;
        return true;
      case "end":
      case "ctrl+e":
        this.cursor = this.input.length;
        return true;
      case "ctrl+u":
        this.input = this.input.slice(this.cursor);
        this.cursor = 0;
        return true;
      case "ctrl+k":
        this.input = this.input.slice(0, this.cursor);
        return true;
      case "ctrl+w":
      case "ctrl+backspace": {
        const before = this.input.slice(0, this.cursor).replace(/\S+\s*$/, "");
        this.input = before + this.input.slice(this.cursor);
        this.cursor = before.length;
        return true;
      }
      case "up":
        this.historyStep(-1);
        return true;
      case "down":
        this.historyStep(1);
        return true;
      case "tab":
        this.complete();
        return true;
      case "pageup":
        this.scroll += 10;
        return true;
      case "pagedown":
        this.scroll = Math.max(0, this.scroll - 10);
        return true;
    }
    return false;
  }

  onAction(a: Action): boolean {
    if (this.reading && a === "confirm") return this.answer(), true;
    if (a === "scroll-up") this.scroll += 3;
    else if (a === "scroll-down") this.scroll = Math.max(0, this.scroll - 3);
    else if (a === "confirm") void this.submit();
    else return false;
    return true;
  }

  private async submit(): Promise<void> {
    const line = this.input;
    this.input = "";
    this.cursor = 0;
    this.histIndex = -1;
    await this.runLine(line);
  }

  private historyStep(dir: -1 | 1): void {
    const h = this.exec.history;
    if (!h.length) return;
    if (this.histIndex === -1) {
      if (dir === 1) return;
      this.histDraft = this.input;
      this.histIndex = h.length - 1;
    } else {
      this.histIndex += dir;
      if (this.histIndex >= h.length) {
        this.histIndex = -1;
        this.input = this.histDraft;
        this.cursor = this.input.length;
        return;
      }
      this.histIndex = Math.max(0, this.histIndex);
    }
    this.input = h[this.histIndex];
    this.cursor = this.input.length;
  }

  /** Fish-style ghost text: the most recent history entry that starts with what you typed. */
  private suggestion(): string {
    if (!this.input || this.cursor !== this.input.length) return "";
    for (let i = this.exec.history.length - 1; i >= 0; i--) {
      const h = this.exec.history[i];
      if (h.startsWith(this.input) && h !== this.input) return h.slice(this.input.length);
    }
    return "";
  }

  /** Tab completion: commands for the first word, vault paths after. */
  private complete(): void {
    const before = this.input.slice(0, this.cursor);
    const m = before.match(/(\S*)$/)!;
    const word = m[1];
    const isFirst = !before.slice(0, before.length - word.length).trim() || /[|;&]\s*$/.test(before.slice(0, before.length - word.length));
    let candidates: string[];
    let display_: string[];

    if (isFirst && !word.includes("/")) {
      candidates = this.deck.commands.names().filter((n) => n.startsWith(word)).map((n) => n + " ");
      display_ = candidates.map((c) => c.trim());
    } else {
      const slash = word.lastIndexOf("/");
      const typedDir = slash >= 0 ? word.slice(0, slash + 1) : "";
      const prefix = word.slice(slash + 1);
      const dir = resolvePath(this.exec.cwd, typedDir || ".");
      const entries = this.deck.vault.entries.filter((e) => dirname(e.path) === dir && e.name.toLowerCase().startsWith(prefix.toLowerCase()));
      candidates = entries.map((e) => typedDir + e.name + (e.isDir ? "/" : " "));
      display_ = entries.map((e) => basename(e.path) + (e.isDir ? "/" : ""));
    }

    if (candidates.length === 0) return;
    let completion = candidates[0];
    if (candidates.length > 1) {
      completion = commonPrefix(candidates);
      if (completion.length <= word.length) {
        // nothing more to add: show the options, like bash's double-tab
        this.echoPrompt(this.input);
        this.term.write(columns(display_, 80) + "\n");
        return;
      }
    }
    this.input = before.slice(0, before.length - word.length) + completion + this.input.slice(this.cursor);
    this.cursor = before.length - word.length + completion.length;
  }

  // ── drawing ──────────────────────────────────────────────────────────────

  render(ui: UI, r: Rect, focused: boolean): void {
    const promptH = this.reading?.opts.choices?.length ? 2 : 1;
    const total = this.term.rowCount(r.w);
    const outH = Math.min(total, r.h - promptH);
    const maxScroll = Math.max(0, total - outH);
    this.scroll = Math.min(this.scroll, maxScroll);
    const first = total - outH - this.scroll;
    this.term.render(ui, { x: r.x, y: r.y, w: r.w, h: outH }, first);

    const py = r.y + outH;
    if (this.scroll > 0) {
      ui.textRight(r.x + r.w, r.y + r.h - 1, ` ↓ scrolled ${this.scroll} `, { fg: ui.c.panel, bg: ui.c.accent });
    } else if (this.reading) {
      this.drawReading(ui, r.x, py, r.w, focused);
    } else if (this.exec.running) {
      ui.text(r.x, py, `${ui.spinner()} `, { fg: ui.c.accent });
    } else {
      this.drawPrompt(ui, r.x, py, r.w, focused);
    }
    ui.hit(r, { onWheel: (d) => (this.scroll = Math.max(0, this.scroll - d)) });
  }

  /** The question line: numbered quick-answer chips, then "label ❯ answer". */
  private drawReading(ui: UI, x0: number, y: number, w: number, focused: boolean): void {
    const c = ui.c;
    const rd = this.reading!;
    const ch = rd.opts.choices ?? [];
    if (ch.length) {
      let x = x0;
      ch.forEach((label, i) => {
        const chip = ` ${i + 1} ${label} `;
        const cw = strWidth(chip);
        if (x + cw > x0 + w) return;
        const rect = { x, y, w: cw, h: 1 };
        const sel = i === rd.sel && !this.input;
        const hot = ui.hovered(rect);
        ui.text(x, y, chip, sel ? { fg: c.panel, bg: c.accent, attrs: BOLD } : { fg: hot ? c.accent : c.fg, bg: c.highlight });
        ui.text(x + 1, y, String(i + 1), { fg: sel ? c.panel : c.accent, bg: sel ? c.accent : c.highlight, attrs: BOLD });
        ui.hit(rect, { onClick: () => rd.done(label) });
        x += cw + 1;
      });
      y++;
    }
    let x = ui.text(x0, y, ` ${rd.label} `, { fg: c.panel, bg: focused ? c.accentAlt : c.subtle, attrs: BOLD });
    x = ui.text(x, y, " ❯ ", { fg: c.accentAlt, attrs: BOLD });
    const shown = rd.opts.mask ? "•".repeat(this.input.length) : this.input;
    const room = x0 + w - x - 1;
    const cw = strWidth(shown.slice(0, this.cursor));
    const off = Math.max(0, cw - room + 1);
    if (!this.input) {
      const hint = rd.opts.placeholder ?? (ch.length && !rd.opts.allowText ? "1-9 · ←→ · enter" : "enter = skip · esc = stop");
      ui.text(x, y, hint, { fg: c.faint }, room);
    } else ui.text(x, y, [...shown].slice(off).join(""), { fg: c.fg }, room);
    if (focused) ui.cursor(x + cw - off, y, this.lastInputAt);
  }

  private drawPrompt(ui: UI, x0: number, y: number, w: number, focused: boolean): void {
    const c = ui.c;
    const handle = this.deck.settings.data.user.handle;
    const seg1 = ` ${handle} `;
    const seg2 = ` ${display(this.exec.cwd)} `;
    const accent = focused ? c.accent : c.subtle;
    let x = ui.text(x0, y, seg1, { fg: c.panel, bg: accent, attrs: BOLD });
    x = ui.text(x, y, "", { fg: accent, bg: c.highlight });
    x = ui.text(x, y, seg2, { fg: c.fg, bg: c.highlight });
    x = ui.text(x, y, "", { fg: c.highlight });
    x = ui.text(x, y, this.exec.lastStatus === 0 ? " ❯ " : ` ✖${this.exec.lastStatus} ❯ `, {
      fg: this.exec.lastStatus === 0 ? accent : c.error,
      attrs: BOLD,
    });

    const startX = x;
    const room = x0 + w - startX - 1;
    // horizontal scroll if the line is longer than the panel
    const cursorW = strWidth(this.input.slice(0, this.cursor));
    const offset = Math.max(0, cursorW - room + 1);
    const colored = this.highlight(ui);
    let cx = startX - offset;
    let cellPos = 0;
    for (const part of colored) {
      for (const ch of part.text) {
        if (cx >= startX && cx < x0 + w) ui.text(cx, y, ch, part.style);
        cx += strWidth(ch);
        cellPos++;
      }
    }
    void cellPos;
    const ghost = this.suggestion();
    if (ghost && focused) ui.text(cx, y, ghost, { fg: c.subtle, attrs: DIM }, Math.max(0, x0 + w - cx));
    if (focused) ui.cursor(startX + cursorW - offset, y, this.lastInputAt);
  }

  /** fish-like live coloring: known commands green, unknown red, strings yellow… */
  private highlight(ui: UI): { text: string; style: { fg: number; attrs?: number } }[] {
    const t = ui.theme;
    const parts: { text: string; style: { fg: number; attrs?: number } }[] = [];
    const re = /("[^"]*"?|'[^']*'?|\s+|[|;&<>]+|\$\{?\w+\}?|[^\s|;&<>"']+)/g;
    let expectCommand = true;
    for (const m of this.input.matchAll(re)) {
      const tok = m[0];
      let fg = t.c.fg;
      let attrs = 0;
      if (/^\s+$/.test(tok)) {
        parts.push({ text: tok, style: { fg } });
        continue;
      }
      if (/^[|;&]+$/.test(tok)) {
        fg = t.c.accent;
        attrs = BOLD;
        expectCommand = true;
      } else if (/^[<>]+$/.test(tok)) fg = t.c.accent;
      else if (tok.startsWith('"') || tok.startsWith("'")) fg = t.ansi[3];
      else if (tok.startsWith("$")) fg = t.ansi[13];
      else if (expectCommand) {
        fg = this.deck.commands.get(tok) ? t.ansi[2] : t.ansi[1];
        attrs = BOLD;
        expectCommand = false;
      } else if (tok.startsWith("-")) fg = t.ansi[6];
      else fg = mix(t.c.fg, t.c.muted, 0.2);
      parts.push({ text: tok, style: { fg, attrs } });
    }
    return parts;
  }

  // ── history persistence (.icebreaker/shell_history in the vault) ─────────

  private async loadHistory(): Promise<void> {
    try {
      if (await this.deck.vault.exists(HISTORY_FILE)) {
        this.exec.history = (await this.deck.vault.read(HISTORY_FILE)).split("\n").filter(Boolean).slice(-1000);
      }
    } catch {
      /* no history yet */
    }
  }

  private saveHistory(): void {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      void this.deck.vault.write(HISTORY_FILE, this.exec.history.slice(-1000).join("\n") + "\n").catch(() => {});
    }, 1000);
  }
}

function commonPrefix(items: string[]): string {
  let p = items[0];
  for (const s of items) while (!s.startsWith(p)) p = p.slice(0, -1);
  return p;
}

/** Lay out names in columns, like `ls` does. */
export function columns(items: string[], width: number): string {
  if (!items.length) return "";
  const colW = Math.min(width, Math.max(...items.map(strWidth)) + 2);
  const perRow = Math.max(1, Math.floor(width / colW));
  const rows = Math.ceil(items.length / perRow);
  const lines: string[] = [];
  for (let r = 0; r < rows; r++) {
    let line = "";
    for (let c = 0; c < perRow; c++) {
      const it = items[c * rows + r];
      if (it === undefined) continue;
      line += it + " ".repeat(Math.max(1, colW - strWidth(it)));
    }
    lines.push(line.trimEnd());
  }
  return lines.join("\n");
}
