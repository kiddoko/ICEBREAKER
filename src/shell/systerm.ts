import { Terminal, type IBufferCell } from "@xterm/headless";
import { mix, NONE, type RGB } from "../core/color";
import { BOLD, ITALIC, UNDERLINE, type Rect } from "../core/grid";
import { IS_MAC, type Action, type KeyInput } from "../core/input";
import type { Deck } from "../deck";
import type { UI } from "../ui/ui";
import { copyToClipboard } from "../core/clipboard";

const EXIT_MARK = "\x1b]ib-exit\x07";

/**
 * What the keys do in a real terminal, for the status bar. A Mac keeps ⌘ for the deck
 * (⌘C ⌘V copy and paste, ⌘X sends ctrl+C); on Windows / Linux every ctrl key goes to the
 * shell, except ctrl+C over a selection (copy) and ctrl+V (paste).
 */
export function terminalKeysHint(): string {
  return IS_MAC
    ? "ctrl = Control (nano: ctrl+X quits) · ⌘C ⌘V copy/paste · ⌘X interrupt (ctrl+C)"
    : "ctrl+C copies a selection, else interrupts · ctrl+shift+C copy · ctrl+V paste";
}

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
/**
 * deck commands that win over the system shell's own: zsh's logout would close the terminal,
 * and macOS's login asks for a user and ignores ctrl+C (typed for logout, you were stuck)
 */
const CORE_IN_TERMINAL = ["reboot", "logout", "login"];

/** ⌘X on a Mac: ctrl+C for the shell (⌘C is copy there) */
const macInterrupt = (k: KeyInput) => IS_MAC && !!k.rawMeta && k.combo === "ctrl+x";

export class SystemTerminal {
  readonly term: Terminal;
  readonly id = `pty${Math.random().toString(36).slice(2, 8)}`;
  shellName = "terminal";
  /** the tab's name: icbrkr_trm, icbrkr_trm2… (term rename, right-click) */
  name: string;
  private static count = 0;
  private started = false;
  /** the native shell is really running (pty_spawn answered) */
  private spawned = false;
  private exited = false;
  /** which start this is: what an older shell still sends (its end, after a restart) is dropped */
  private generation = 0;
  private error = "";
  private cols = 0;
  private rows = 0;
  /** the size the native terminal was last given: it must always match xterm's, or the shell
   * redraws its prompt on the wrong rows (it vanished on Windows) */
  private ptySize = "";
  private cell: IBufferCell | undefined;
  private lastInputAt = 0;
  /** mouse selection, in buffer lines (scrollback included) and columns; head = where the mouse is */
  private sel: { a: { line: number; col: number }; h: { line: number; col: number } } | null = null;
  private lastR: Rect = { x: 0, y: 0, w: 0, h: 0 };

  constructor(private readonly deck: Deck) {
    const n = ++SystemTerminal.count;
    this.name = n === 1 ? "icbrkr_trm" : `icbrkr_trm${n}`;
    this.term = new Terminal({ cols: 80, rows: 24, scrollback: 5000, allowProposedApi: true });
    // The terminal's own answers (cursor position, device attributes…) go back to
    // the shell. Windows' ConPTY asks where the cursor is at start-up and shows
    // nothing until it hears back: without this, PowerShell stayed blank.
    this.term.onData((d) => {
      if (this.alive && this.spawned) void this.deck.platform.pty?.write(this.id, d)?.catch(() => {});
    });
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
    const gen = ++this.generation;
    this.term.resize(cols, rows);
    this.ptySize = `${cols}x${rows}`;
    pty
      .spawn(this.id, cols, rows, (data) => {
        if (gen !== this.generation) return;
        // output means the native side has this terminal: it can take our answers now. Windows'
        // ConPTY asks where the cursor is the moment it starts, often before pty_spawn has
        // answered: that answer used to be dropped, and ConPTY waited 3 s for it before
        // showing anything (a new PowerShell took ages to show its prompt)
        this.spawned = true;
        if (data.includes(EXIT_MARK)) {
          // said once, even if the native side says it twice (Windows: its watcher and its reader)
          data = data.replace(EXIT_MARK, this.exited ? "" : "\r\n\x1b[2m[process exited — press enter to start a new shell]\x1b[0m\r\n").replaceAll(EXIT_MARK, "");
          this.exited = true;
        }
        this.term.write(data, () => this.deck.requestFrame());
      }, this.moduleCommands(), this.deck.settings.data.shell.prompt ?? "icebreaker")
      .then((name) => {
        this.shellName = name;
        this.spawned = true;
      })
      .catch((e) => {
        this.error = String(e);
        this.exited = true;
        this.deck.requestFrame();
      });
  }

  /** Module commands (and aliases): in this shell they win over system programs with the same name (macOS `cal`…). */
  private moduleCommands(): string[] {
    const mods = this.deck.commands
      .all()
      .filter((c) => c.source && c.source !== "core")
      .flatMap((c) => [c.name, ...(c.aliases ?? [])]);
    // deck commands that share a name with a system one and mean the deck here (`command reboot` is still the system's)
    return [...mods, ...CORE_IN_TERMINAL].filter((n) => /^[a-z][a-z0-9_-]*$/.test(n));
  }

  restart(): void {
    this.generation++; // what the old shell still sends is dropped
    void this.deck.platform.pty?.kill(this.id);
    this.term.reset();
    this.started = false;
    this.spawned = false;
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
    // the native shell may not be there yet (just opened, or shown again): never an error for that
    if (this.spawned) void this.deck.platform.pty?.write(this.id, data)?.catch(() => {});
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
    if (macInterrupt(k)) return true;
    if (k.rawMeta) return false; // ⌘ shortcuts stay the deck's; the terminal uses the real Control key
    if (k.combo === "ctrl+tab" || k.combo === "ctrl+shift+tab" || k.key === "f11" || k.key === "f12") return false;
    if (k.rawCtrl && k.code === "Backquote") return false; // ctrl+` toggles the panel
    return true;
  }

  // ── selection ────────────────────────────────────────────────────────────

  /** start/end of the selection, in reading order (null: nothing selected) */
  private range(): [{ line: number; col: number }, { line: number; col: number }] | null {
    const s = this.sel;
    if (!s || (s.a.line === s.h.line && s.a.col === s.h.col)) return null;
    return s.a.line < s.h.line || (s.a.line === s.h.line && s.a.col <= s.h.col) ? [s.a, s.h] : [s.h, s.a];
  }

  hasSelection(): boolean {
    return !!this.range();
  }

  /** The selected text (lines joined with \n, trailing spaces trimmed). */
  selectedText(): string {
    const r = this.range();
    if (!r) return "";
    const buf = this.term.buffer.active;
    const out: string[] = [];
    for (let l = r[0].line; l <= r[1].line; l++) {
      const line = buf.getLine(l);
      if (!line) continue;
      const from = l === r[0].line ? r[0].col : 0;
      const to = l === r[1].line ? r[1].col : this.cols;
      const text = line.translateToString(true, from, to);
      // a wrapped line continues the one before it: no line break
      if (out.length && line.isWrapped) out[out.length - 1] += text;
      else out.push(text);
    }
    return out.join("\n");
  }

  /** Copy the selection (⌘C, ctrl+C when something is selected, right-click → copy). */
  copySelection(): boolean {
    const t = this.selectedText();
    if (!t) return false;
    copyToClipboard(t);
    this.deck.notify("copied", "success");
    return true;
  }

  selectAll(): void {
    const buf = this.term.buffer.active;
    this.sel = { a: { line: 0, col: 0 }, h: { line: buf.baseY + this.rows - 1, col: this.cols } };
  }

  private posAt(x: number, y: number): { line: number; col: number } {
    const r = this.lastR;
    const buf = this.term.buffer.active;
    const row = Math.max(0, Math.min(r.h - 1, y - r.y));
    if (y < r.y) this.term.scrollLines(-1);
    else if (y >= r.y + r.h) this.term.scrollLines(1);
    return { line: buf.viewportY + row, col: Math.max(0, Math.min(this.cols, x - r.x)) };
  }

  /** double-click: the word under the mouse */
  private selectWord(x: number, y: number): void {
    const p = this.posAt(x, y);
    const text = this.term.buffer.active.getLine(p.line)?.translateToString(false) ?? "";
    const isWord = (ch: string | undefined) => !!ch && /[^\s"'`()[\]{}<>|;]/.test(ch);
    if (!isWord(text[p.col])) return;
    let a = p.col, b = p.col;
    while (a > 0 && isWord(text[a - 1])) a--;
    while (b < text.length && isWord(text[b])) b++;
    this.sel = { a: { line: p.line, col: a }, h: { line: p.line, col: b } };
  }

  onKey(k: KeyInput): boolean {
    if (macInterrupt(k) && !this.exited) return (this.sel = null), this.write("\x03"), true;
    // copy: ⌘C on a Mac; elsewhere ctrl+C copies when something is selected (else it interrupts), ctrl+shift+C always
    if (k.ctrl && k.key === "c" && (k.rawMeta || k.shift || this.hasSelection())) {
      if (this.copySelection()) this.sel = null;
      return true;
    }
    if (k.rawMeta && k.key === "a") return this.selectAll(), true;
    if (!k.rawMeta && !(k.ctrl && k.shift)) this.sel = null; // typing drops the selection
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
    }
    // a size change while the shell was starting is sent once it's there
    if (this.alive && this.spawned && this.ptySize !== `${r.w}x${r.h}`) {
      this.ptySize = `${r.w}x${r.h}`;
      void this.deck.platform.pty?.resize(this.id, r.w, r.h)?.catch(() => {});
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
    // the selection
    const sr = this.range();
    if (sr) {
      for (let y = 0; y < r.h; y++) {
        const l = buf.viewportY + y;
        if (l < sr[0].line || l > sr[1].line) continue;
        // only real text (and the spaces between words), never the empty end of a line
        const used = buf.getLine(l)?.translateToString(true).length ?? 0;
        const from = l === sr[0].line ? sr[0].col : 0;
        const to = Math.min(l === sr[1].line ? sr[1].col : r.w, used);
        if (to > from) ui.tint({ x: r.x + from, y: r.y + y, w: Math.min(r.w, to) - from, h: 1 }, c.fg, c.selection);
      }
    }
    if (!atBottom) ui.textRight(r.x + r.w, r.y + r.h - 1, ` ↓ ${buf.baseY - buf.viewportY} lines · type to return `, { fg: c.panel, bg: c.accent });
    else if (focused && this.alive) ui.cursor(r.x + Math.min(buf.cursorX, r.w - 1), r.y + buf.cursorY, this.lastInputAt);
    this.lastR = r;
    ui.hit(r, {
      // drag to select (the shell's own mouse modes aside: vim, htop keep the wheel)
      onClick: (m) => {
        const p = this.posAt(m.x, m.y);
        this.sel = { a: p, h: { ...p } };
      },
      onDrag: (m) => {
        if (this.sel) this.sel.h = this.posAt(m.x, m.y);
        this.deck.requestFrame();
      },
      onDouble: (m) => this.selectWord(m.x, m.y),
      onWheel: (d) => {
        if (buf.type === "alternate") this.write((d < 0 ? (this.term.modes.applicationCursorKeysMode ? "\x1bOA" : "\x1b[A") : this.term.modes.applicationCursorKeysMode ? "\x1bOB" : "\x1b[B").repeat(Math.min(10, Math.abs(d))));
        else this.term.scrollLines(d);
        this.deck.requestFrame();
      },
    });
  }
}
