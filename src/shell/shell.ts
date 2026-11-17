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

  constructor(private readonly deck: Deck) {
    this.exec = new ShellExecutor(
      deck,
      (text, isError) => {
        this.term.write(text, isError ? { fg: deck.theme.ansi[1] } : undefined);
        this.scroll = 0;
      },
      () => this.term.clear(),
    );
  }

  title(): string {
    return "shell";
  }

  status(): string {
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
    this.term.ensureNewline();
    this.deck.requestFrame();
    return code;
  }

  private echoPrompt(line: string): void {
    this.term.ensureNewline();
    this.term.write(`\x1b[35m${display(this.exec.cwd)}\x1b[0m \x1b[95m❯\x1b[0m ${line}\n`);
  }

  // ── input ────────────────────────────────────────────────────────────────

  onText(t: string): boolean {
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
    if (this.exec.running) return k.key !== "esc";

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
    const promptH = 1;
    const total = this.term.rowCount(r.w);
    const outH = Math.min(total, r.h - promptH);
    const maxScroll = Math.max(0, total - outH);
    this.scroll = Math.min(this.scroll, maxScroll);
    const first = total - outH - this.scroll;
    this.term.render(ui, { x: r.x, y: r.y, w: r.w, h: outH }, first);

    const py = r.y + outH;
    if (this.scroll > 0) {
      ui.textRight(r.x + r.w, r.y + r.h - 1, ` ↓ scrolled ${this.scroll} `, { fg: ui.c.panel, bg: ui.c.accent });
    } else if (this.exec.running) {
      ui.text(r.x, py, `${ui.spinner()} `, { fg: ui.c.accent });
    } else {
      this.drawPrompt(ui, r.x, py, r.w, focused);
    }
    ui.hit(r, { onWheel: (d) => this.onAction(d < 0 ? "scroll-up" : "scroll-down") });
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
