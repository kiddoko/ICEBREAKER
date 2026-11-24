import { CMD_HINT, shellFamily, wrapWords } from "./bridgeshell";
import { Terminal, type IBufferCell } from "@xterm/headless";
import { mix, NONE, type RGB } from "../core/color";
import { BOLD, ITALIC, UNDERLINE, type Rect } from "../core/grid";
import { IS_MAC, type Action, type KeyInput } from "../core/input";
import type { Deck } from "../deck";
import type { UI } from "../ui/ui";
import { copyToClipboard } from "../core/clipboard";
import { t as tr } from "../core/i18n";
import { selectionHit, TextSelection, type SelectionSource, type TextPos } from "../ui/textselect";

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
 * macOS's login asks for a user and ignores ctrl+C (typed for logout, you were stuck), and
 * macOS's say spoke with the system's voice, not the one chosen in Settings → VOICE
 * (`command say` is still macOS's)
 */
const CORE_IN_TERMINAL = ["reboot", "logout", "login", "say"];

/** ⌘X on a Mac: ctrl+C for the shell (⌘C is copy there) */
const macInterrupt = (k: KeyInput) => IS_MAC && !!k.rawMeta && k.combo === "ctrl+x";

/** the smallest number not in `used`, from 1 */
export function freeNumber(used: ReadonlySet<number>): number {
  let n = 1;
  while (used.has(n)) n++;
  return n;
}

export class SystemTerminal {
  readonly term: Terminal;
  readonly id = `pty${Math.random().toString(36).slice(2, 8)}`;
  /**
   * The shell this terminal runs, as the native side named it when it started. Until it
   * answers (Windows' ConPTY can take a moment, and a restart asks again), the last shell any
   * terminal started — so the tab doesn't flip "terminal" ↔ "powershell".
   */
  shellName = SystemTerminal.lastShell();
  private static known = "";
  private static lastShell(): string {
    if (SystemTerminal.known) return SystemTerminal.known;
    try {
      return localStorage.getItem("icebreaker.lastShell") || "terminal";
    } catch {
      return "terminal";
    }
  }
  private static remember(name: string): void {
    SystemTerminal.known = name;
    try {
      localStorage.setItem("icebreaker.lastShell", name);
    } catch {
      /* the name is a nicety */
    }
  }
  /**
   * The tab's name: the shell it runs — zsh, bash, powershell — then "zsh 2"… the way a
   * terminal app names its tabs; yours once renamed (term rename, right-click).
   */
  get name(): string {
    if (this.ownName) return this.ownName;
    const shell = this.shellName.split(/[\\/]/).pop()!.replace(/\.exe$/i, "").toLowerCase() || "terminal";
    return this.number === 1 ? shell : `${shell} ${this.number}`;
  }
  set name(v: string) {
    this.ownName = v.trim();
  }
  private ownName = "";
  /** the name you gave it ("" = the shell's own): kept across a relaunch */
  get ownLabel(): string {
    return this.ownName;
  }
  private readonly number: number;
  /** the numbers in use: a new terminal takes the smallest free one (closing zsh then opening one gave "zsh 2" alone) */
  private static usedBy = new Map<string, Set<number>>();
  /** the shell's name its number counts in, fixed at its start (the login shell's name can change once it answers) */
  private family = "";
  private get used(): Set<number> {
    // by the shell's name: the login shell (no `shell`) and the same one chosen in « + » are one
    // family — a 2nd powershell was « powershell », not « powershell 2 » (Windows bench)
    const k = (this.family ||= (this.shell ?? SystemTerminal.lastShell()).split(/[\\/]/).pop()!.replace(/\.exe$/i, "").toLowerCase());
    let set = SystemTerminal.usedBy.get(k);
    if (!set) SystemTerminal.usedBy.set(k, (set = new Set()));
    return set;
  }
  private started = false;
  /** the native shell is really running (pty_spawn answered) */
  private spawned = false;
  /** what you typed before the native shell was there (just opened, just restarted): sent once it is */
  private early = "";
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
  /** mouse selection, in buffer lines (scrollback included) and columns (ui/textselect.ts, shared with ibsh) */
  private readonly sel = new TextSelection();
  /** what the selection reads: xterm's buffer lines, as cells */
  private readonly src: SelectionSource = {
    cells: (l) => {
      const line = this.term.buffer.active.getLine(l);
      if (!line) return undefined;
      const out: string[] = [];
      for (let x = 0; x < this.cols; x++) {
        const cell = (this.cell = line.getCell(x, this.cell));
        out.push(!cell ? " " : cell.getWidth() === 0 ? "" : cell.getChars() || " ");
      }
      return out;
    },
    wrapped: (l) => !!this.term.buffer.active.getLine(l)?.isWrapped,
  };
  private lastR: Rect = { x: 0, y: 0, w: 0, h: 0 };

  /**
   * `shell`: which of this computer's shells it runs ("bash", "/opt/homebrew/bin/fish", "pwsh" —
   * from platform.pty.shells()); none: the login shell. Each shell numbers its own tabs: zsh, zsh 2, bash.
   */
  constructor(private readonly deck: Deck, readonly shell?: string) {
    if (shell) this.shellName = shell;
    this.number = freeNumber(this.used);
    this.used.add(this.number);
    this.term = new Terminal({ cols: 80, rows: 24, scrollback: 10000, allowProposedApi: true });
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
        this.ready();
        if (data.includes(EXIT_MARK)) {
          // said once, even if the native side says it twice (Windows: its watcher and its reader)
          data = data.replace(EXIT_MARK, this.exited ? "" : "\r\n\x1b[2m[process exited — press enter to start a new shell]\x1b[0m\r\n").replaceAll(EXIT_MARK, "");
          this.exited = true;
        }
        this.term.write(data, () => this.deck.requestFrame());
      }, this.moduleCommands(), this.deck.settings.data.shell.prompt ?? "icebreaker", this.shell)
      .then((name) => {
        // an empty answer keeps the name it had (it went back to "terminal")
        if (name?.trim()) {
          this.shellName = name.trim();
          // the login shell's name, for the next terminal's tab until its shell answers
          if (!this.shell) SystemTerminal.remember(this.shellName);
          // cmd has no "command not found" hook: say once where the deck's commands are
          // (cut between words: the terminal itself cut « powershel / l »)
          if (shellFamily(this.shellName) === "cmd") this.term.write(`\x1b[2m${wrapWords(tr(CMD_HINT), (this.term.cols || this.cols || 80) - 1).join("\r\n")}\x1b[0m\r\n`, () => this.deck.requestFrame());
        }
        this.ready();
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

  /** the native shell is there: what was typed meanwhile goes to it, in order */
  private ready(): void {
    this.spawned = true;
    if (!this.early) return;
    const keys = this.early;
    this.early = "";
    void this.deck.platform.pty?.write(this.id, keys)?.catch(() => {});
  }

  restart(): void {
    this.generation++; // what the old shell still sends is dropped
    void this.deck.platform.pty?.kill(this.id);
    this.term.reset();
    this.started = false;
    this.spawned = false;
    // a new shell comes at the next frame: what you type from now on is for it
    this.exited = false;
    this.early = "";
    this.deck.requestFrame();
  }

  dispose(): void {
    this.used.delete(this.number);
    void this.deck.platform.pty?.kill(this.id);
  }

  write(data: string): void {
    // not started yet (just opened, restarted): kept for the shell that's coming (see `early`)
    if (this.exited) return;
    this.lastInputAt = performance.now();
    // typing jumps back to the live screen
    this.term.scrollToBottom();
    // the native shell may not be there yet (just opened, restarted): kept until it is — an
    // `exit` typed right after enter used to vanish (only the enter got through)
    if (this.spawned) void this.deck.platform.pty?.write(this.id, data)?.catch(() => {});
    else this.early = (this.early + data).slice(-4096);
  }

  // ── input ────────────────────────────────────────────────────────────────

  onText(t: string): boolean {
    if (this.exited) return true;
    if (t.length > 1 && (t.includes("\n") || t.length > 32) && this.term.modes.bracketedPasteMode) this.write(`\x1b[200~${t.replace(/\n/g, "\r")}\x1b[201~`);
    // several lines pasted where the shell would run each at once (no bracketed paste): ask, like
    // Windows Terminal — the first lines ran before you saw what you pasted
    else if (t.length > 1 && /\n./.test(t.replace(/\n+$/, "") + "")) void this.pasteLines(t);
    else this.write(t.replace(/\n/g, "\r"));
    return true;
  }

  private async pasteLines(t: string): Promise<void> {
    const n = t.replace(/\n+$/, "").split("\n").length;
    if (await this.deck.confirm(tr("paste {n} lines?", { n }), tr("each line runs as you paste it"))) this.write(t.replace(/\n/g, "\r"));
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

  hasSelection(): boolean {
    return this.sel.has();
  }

  /** The selected text (lines joined with \n, trailing spaces trimmed). */
  selectedText(): string {
    return this.sel.text(this.src);
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
    this.sel.all(buf.baseY + this.rows - 1, this.cols);
  }

  private posAt(x: number, y: number): TextPos {
    const r = this.lastR;
    const buf = this.term.buffer.active;
    const row = Math.max(0, Math.min(r.h - 1, y - r.y));
    if (y < r.y) this.term.scrollLines(-1);
    else if (y >= r.y + r.h) this.term.scrollLines(1);
    return { line: buf.viewportY + row, col: Math.max(0, Math.min(this.cols, x - r.x)) };
  }

  onKey(k: KeyInput): boolean {
    if (macInterrupt(k) && !this.exited) return this.sel.clear(), this.write("\x03"), true;
    // copy: ⌘C on a Mac; elsewhere ctrl+C copies when something is selected (else it interrupts), ctrl+shift+C always
    if (k.ctrl && k.key === "c" && (k.rawMeta || k.shift || this.hasSelection())) {
      if (this.copySelection()) this.sel.clear();
      return true;
    }
    if (k.rawMeta && k.key === "a") return this.selectAll(), true;
    if (!k.rawMeta && !(k.ctrl && k.shift)) this.sel.clear(); // typing drops the selection
    if (this.exited) {
      if (k.key === "enter") this.restart();
      return true;
    }
    // shift+PgUp / PgDn: through what scrolled away, like every terminal (any key went back down)
    if (k.shift && (k.key === "pageup" || k.key === "pagedown")) return this.term.scrollPages(k.key === "pageup" ? -1 : 1), true;
    // ctrl+← → (Windows, Linux): a word at a time, as the shell reads it (it moved one character)
    if (k.rawCtrl && !k.alt && (k.key === "left" || k.key === "right")) return this.write(k.key === "left" ? "\x1b[1;5D" : "\x1b[1;5C"), true;
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
    this.sel.paint(ui, r, buf.viewportY, this.src);
    if (!atBottom) ui.textRight(r.x + r.w, r.y + r.h - 1, ` ↓ ${buf.baseY - buf.viewportY} lines · type to return `, { fg: c.panel, bg: c.accent });
    else if (focused && this.alive) ui.cursor(r.x + Math.min(buf.cursorX, r.w - 1), r.y + buf.cursorY, this.lastInputAt);
    this.lastR = r;
    ui.hit(r, {
      // drag to select, double-click a word, triple-click a line (the shell's own mouse modes aside: vim, htop keep the wheel)
      ...selectionHit({ sel: this.sel, src: this.src, at: (m) => this.posAt(m.x, m.y), redraw: () => this.deck.requestFrame() }),
      onWheel: (d) => {
        if (buf.type === "alternate") this.write((d < 0 ? (this.term.modes.applicationCursorKeysMode ? "\x1bOA" : "\x1b[A") : this.term.modes.applicationCursorKeysMode ? "\x1bOB" : "\x1b[B").repeat(Math.min(10, Math.abs(d))));
        else this.term.scrollLines(d);
        this.deck.requestFrame();
      },
    });
  }
}
