import { Terminal, type IBufferCell } from "@xterm/headless";
import { mix, NONE, type RGB } from "../core/color";
import { BOLD, ITALIC, UNDERLINE, type Rect } from "../core/grid";
import type { Action, KeyInput } from "../core/input";
import type { Deck } from "../deck";
import type { UI } from "../ui/ui";

const EXIT_MARK = "\x1b]ib-exit\x07";

/** xterm's 256 colors: 16 from the theme, a 6×6×6 cube, 24 greys. */
function color256(n: number, ansi: RGB[]): RGB {
  if (n < 16) return ansi[n];
  if (n < 232) {
    const i = n - 16;
    const v = (x: number) => (x ? 55 + x * 40 : 0);
    return (v(Math.floor(i / 36)) << 16) | (v(Math.floor(i / 6) % 6) << 8) | v(i % 6);
  }
  const g = 8 + (n - 232) * 10;
  return (g << 16) | (g << 8) | g;
}

/**
 * Your real shell (zsh, bash, PowerShell) in the shell panel: a PTY on the
 * native side, xterm's terminal engine here (colors, cursor, vim, htop, ssh…),
 * drawn in the deck's grid with the theme's colors.
 */
export class SystemTerminal {
  readonly term: Terminal;
  readonly id = `pty${Math.random().toString(36).slice(2, 8)}`;
  shellName = "terminal";
  private started = false;
  private exited = false;
  private error = "";
  private cols = 0;
  private rows = 0;
  private cell: IBufferCell | undefined;
  private lastInputAt = 0;

  constructor(private readonly deck: Deck) {
    this.term = new Terminal({ cols: 80, rows: 24, scrollback: 5000, allowProposedApi: true });
  }

  get alive(): boolean {
    return this.started && !this.exited;
  }

  private start(cols: number, rows: number): void {
    const pty = this.deck.platform.pty;
    if (!pty) {
      this.error = "the system terminal needs the desktop app";
      return;
    }
    this.started = true;
    this.exited = false;
    this.term.resize(cols, rows);
    pty
      .spawn(this.id, cols, rows, (data) => {
        if (data.includes(EXIT_MARK)) {
          this.exited = true;
          data = data.replace(EXIT_MARK, "\r\n\x1b[2m[process exited — press enter to start a new shell]\x1b[0m\r\n");
        }
        this.term.write(data, () => this.deck.requestFrame());
      })
      .then((name) => (this.shellName = name))
      .catch((e) => {
        this.error = String(e);
        this.exited = true;
        this.deck.requestFrame();
      });
  }

  restart(): void {
    void this.deck.platform.pty?.kill(this.id);
    this.term.reset();
    this.started = false;
    this.deck.requestFrame();
  }

  dispose(): void {
    void this.deck.platform.pty?.kill(this.id);
  }

  write(data: string): void {
    if (!this.alive) return;
    this.lastInputAt = performance.now();
    // typing jumps back to the live screen
    this.term.scrollToBottom();
    void this.deck.platform.pty?.write(this.id, data);
  }

  // ── input ────────────────────────────────────────────────────────────────

  onText(t: string): boolean {
    if (this.exited) return true;
    if (t.length > 1 && (t.includes("\n") || t.length > 32) && this.term.modes.bracketedPasteMode) this.write(`\x1b[200~${t.replace(/\n/g, "\r")}\x1b[201~`);
    else this.write(t.replace(/\n/g, "\r"));
    return true;
  }

  /** Which keys belong to the terminal (the rest stay app shortcuts). */
  wants(k: KeyInput): boolean {
    if (k.rawMeta) return false; // ⌘-combos on macOS: the deck's
    if (k.combo === "ctrl+tab" || k.combo === "ctrl+shift+tab" || k.key === "f11" || k.key === "f12") return false;
    if (k.rawCtrl && k.code === "Backquote") return false; // ctrl+` toggles the panel
    return true;
  }

  onKey(k: KeyInput): boolean {
    if (this.exited) {
      if (k.key === "enter") this.restart();
      return true;
    }
    const app = this.term.modes.applicationCursorKeysMode;
    const cur = (c: string) => (app ? `\x1bO${c}` : `\x1b[${c}`);
    const map: Record<string, string> = {
      enter: "\r", backspace: k.alt ? "\x1b\x7f" : "\x7f", tab: k.shift ? "\x1b[Z" : "\t", esc: "\x1b",
      up: cur("A"), down: cur("B"), right: cur("C"), left: cur("D"),
      home: "\x1b[H", end: "\x1b[F", pageup: "\x1b[5~", pagedown: "\x1b[6~", delete: "\x1b[3~", insert: "\x1b[2~",
      f1: "\x1bOP", f2: "\x1bOQ", f3: "\x1bOR", f4: "\x1bOS", f5: "\x1b[15~", f6: "\x1b[17~", f7: "\x1b[18~", f8: "\x1b[19~", f9: "\x1b[20~", f10: "\x1b[21~",
    };
    // option/alt + arrows: word jumps, like most terminals
    if (k.alt && (k.key === "left" || k.key === "right")) return this.write(k.key === "left" ? "\x1bb" : "\x1bf"), true;
    if (map[k.key] && !k.rawCtrl) return this.write(map[k.key]), true;
    if (k.rawCtrl || (k.ctrl && !k.rawMeta)) {
      const key = k.key.toLowerCase();
      if (/^[a-z]$/.test(key)) return this.write(String.fromCharCode(key.charCodeAt(0) - 96)), true;
      const special: Record<string, string> = { "[": "\x1b", "\\": "\x1c", "]": "\x1d", " ": "\x00", space: "\x00", "/": "\x1f" };
      if (special[key]) return this.write(special[key]), true;
      if (map[k.key]) return this.write(map[k.key]), true;
    }
    if (k.alt && k.key.length === 1) return this.write(`\x1b${k.key}`), true;
    return true; // everything else is swallowed: it's the terminal's keyboard
  }

  onAction(a: Action): boolean {
    if (a === "scroll-up") this.term.scrollLines(-3);
    else if (a === "scroll-down") this.term.scrollLines(3);
    else return false;
    return true;
  }

  // ── drawing ──────────────────────────────────────────────────────────────

  render(ui: UI, r: Rect, focused: boolean): void {
    const c = ui.c;
    if (r.w < 10 || r.h < 2) return;
    if (this.error && !this.started) return void ui.text(r.x, r.y, `⚠ ${this.error}`, { fg: c.error }, r.w);
    if (!this.started) this.start(r.w, r.h);
    if (r.w !== this.cols || r.h !== this.rows) {
      this.cols = r.w;
      this.rows = r.h;
      this.term.resize(r.w, r.h);
      if (this.alive) void this.deck.platform.pty?.resize(this.id, r.w, r.h);
    }
    const buf = this.term.buffer.active;
    const ansi = ui.theme.ansi;
    const fgOf = (cell: IBufferCell, def: RGB): RGB =>
      cell.isFgDefault() ? def : cell.isFgPalette() ? color256(cell.getFgColor(), ansi) : cell.isFgRGB() ? cell.getFgColor() : def;
    const bgOf = (cell: IBufferCell): RGB =>
      cell.isBgDefault() ? NONE : cell.isBgPalette() ? color256(cell.getBgColor(), ansi) : cell.isBgRGB() ? cell.getBgColor() : NONE;
    for (let y = 0; y < r.h; y++) {
      const line = buf.getLine(buf.viewportY + y);
      if (!line) continue;
      for (let x = 0; x < r.w; x++) {
        const cell = (this.cell = line.getCell(x, this.cell));
        if (!cell || cell.getWidth() === 0) continue;
        let fg = fgOf(cell, c.fg);
        let bg = bgOf(cell);
        if (cell.isInverse()) [fg, bg] = [bg === NONE ? c.bg : bg, fg];
        if (cell.isDim()) fg = mix(fg, c.bg, 0.45);
        const ch = cell.getChars() || " ";
        if (ch === " " && bg === NONE) continue;
        const attrs = (cell.isBold() ? BOLD : 0) | (cell.isItalic() ? ITALIC : 0) | (cell.isUnderline() ? UNDERLINE : 0);
        ui.text(r.x + x, r.y + y, ch, { fg, bg, attrs });
      }
    }
    const atBottom = buf.viewportY === buf.baseY;
    if (!atBottom) ui.textRight(r.x + r.w, r.y + r.h - 1, ` ↓ ${buf.baseY - buf.viewportY} lines · type to return `, { fg: c.panel, bg: c.accent });
    else if (focused && this.alive) ui.cursor(r.x + Math.min(buf.cursorX, r.w - 1), r.y + buf.cursorY, this.lastInputAt);
    ui.hit(r, {
      onWheel: (d) => {
        if (buf.type === "alternate") this.write((d < 0 ? (this.term.modes.applicationCursorKeysMode ? "\x1bOA" : "\x1b[A") : this.term.modes.applicationCursorKeysMode ? "\x1bOB" : "\x1b[B").repeat(3));
        else this.term.scrollLines(d < 0 ? -3 : 3);
        this.deck.requestFrame();
      },
    });
  }
}
