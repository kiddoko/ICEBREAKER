import { dateLocale, t } from "../core/i18n";
import { Glide } from "../ui/glide";
import { mix } from "../core/color";
import { BOLD, DIM, type Rect } from "../core/grid";
import { IS_MAC, type Action, type KeyInput } from "../core/input";
import { strWidth } from "../core/unicode";
import type { App } from "../apps/types";
import type { Deck } from "../deck";
import { basename, dirname, display, resolvePath } from "../vault/paths";
import type { UI } from "../ui/ui";
import { copyToClipboard } from "../core/clipboard";
import { selectionHit, TextSelection, type SelectionSource, type TextPos } from "../ui/textselect";
import pkg from "../../package.json";
import type { Origin } from "./origin";

const APP_VERSION: string = pkg.version;
import { ShellExecutor } from "./exec";
import { commandWords, quoteWord, subCompletions, wordAtCursor } from "./complete";
import { TerminalBuffer } from "./terminal";
import { looksSecret } from "../core/redact";
import type { ReadOptions } from "./types";

interface Reading {
  label: string;
  opts: ReadOptions;
  sel: number;
  done(v: string | null): void;
  /** stops the command that asked (^C): whichever shell runs it, this one or a side one */
  interrupt(): void;
}

/**
 * The cancel key: ctrl+C everywhere (the real Control key on a Mac too), and ⌘X on a
 * Mac, where ⌘C is copy. It stops the command running or the question it asks.
 */
export function isCancelKey(k: KeyInput): boolean {
  return k.combo === "ctrl+c" || (IS_MAC && !!k.rawMeta && k.combo === "ctrl+x");
}

/** The cancel key as the status bar says it. */
export const CANCEL_KEY = IS_MAC ? "⌘X" : "ctrl+C";

const HISTORY_FILE = ".icebreaker/shell_history";

/**
 * The shell panel: scrollback + a prompt with fish-style niceties
 * (live syntax coloring, history autosuggestions, Tab completion).
 */

/**
 * What the shell history (.icebreaker/shell_history, in the vault) keeps: not a line
 * that starts with a space (like bash's ignorespace: type " cmd" to leave no trace),
 * nor one that holds what looks like a secret (an API key, a token, a password=, recovery words).
 */
export function keepInHistory(line: string): boolean {
  if (!line.trim() || line.startsWith(" ")) return false;
  // a key, a password or recovery words typed on the line (core/redact.ts)
  return !looksSecret(line);
}
export class ShellApp implements App {
  readonly kind = "shell";
  readonly key = "shell";
  readonly term = new TerminalBuffer();
  readonly exec: ShellExecutor;
  /** ibsh, ibsh 2…: each ibsh tab its own number (the smallest free one) */
  readonly number: number;
  private static used = new Set<number>();
  /** the name you gave its tab (term rename, right-click); "" = "ibsh" / "ibsh 2" */
  ownLabel = "";
  /** its tab was closed while it was the last ibsh: kept (clicks and questions need a shell), shown again by the next ibsh */
  hidden = false;
  get name(): string {
    return this.ownLabel || (this.number === 1 ? "ibsh" : `ibsh ${this.number}`);
  }
  /** its tab is gone for good: its number is free again */
  dispose(): void {
    ShellApp.used.delete(this.number);
  }

  private input = "";
  private cursor = 0;
  private histIndex = -1;
  private histDraft = "";
  private scroll = 0;
  /** the wheel's glide (ui/glide.ts) */
  private readonly glide = new Glide();
  private lastInputAt = 0;
  /** An interactive command is waiting for an answer (ctx.read). */
  private reading: Reading | null = null;
  /**
   * Mouse selection over the output (ui/textselect.ts, the same engine as the real terminal's):
   * lines are the wrapped rows at the width last drawn.
   */
  private readonly sel = new TextSelection();
  /** the output's place on screen and its first row, as last drawn */
  private outR: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private outFirst = 0;
  private readonly src: SelectionSource = {
    cells: (row) => this.term.rowCells(row, this.outR.w),
    wrapped: (row) => this.term.rowWrapped(row, this.outR.w),
  };

  constructor(private readonly deck: Deck) {
    let n = 1;
    while (ShellApp.used.has(n)) n++;
    this.number = n;
    ShellApp.used.add(n);
    this.exec = new ShellExecutor(
      deck,
      (text, isError) => {
        this.term.write(text, isError ? { fg: deck.theme.ansi[1] } : undefined);
        this.scroll = 0;
      },
      () => this.term.clear(),
    );
    this.exec.readLine = (label, opts, signal, interrupt) => this.readLine(label, opts, signal, interrupt);
  }

  private readLine(label: string, opts: ReadOptions, signal: AbortSignal, interrupt: () => void): Promise<string | null> {
    // no shell panel (the TERMINAL module is off): what a command asks comes as a dialog
    if (!this.deck.workspace.terminalOn) {
      const ch = opts.choices ?? [];
      if (ch.length && !opts.allowText) return this.deck.choose(label, ch.map((c) => ({ label: c }))).then((i) => (i === null ? null : ch[i]));
      return this.deck.prompt(label, { mask: opts.mask, placeholder: opts.placeholder, suggestions: ch.length ? ch : undefined });
    }
    return new Promise((resolve) => {
      this.input = "";
      this.cursor = 0;
      const done = (v: string | null) => {
        if (this.reading !== r) return;
        this.reading = null;
        // a password shows as the same bullets whatever its length (the scrollback keeps it)
        const shown = v === null ? "^C" : opts.mask ? "••••••••" : v || "—";
        this.term.write(`\x1b[2m${label} ❯\x1b[0m ${shown}\n`);
        this.input = "";
        this.cursor = 0;
        this.deck.sound.play(v === null ? "back" : "confirm");
        resolve(v);
        this.deck.requestFrame();
      };
      const r: Reading = { label, opts, sel: 0, done, interrupt };
      this.reading = r;
      if (signal.aborted) return done(null);
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
    if (this.reading) return t(this.reading.opts.choices?.length ? "1-9 or click to answer · esc or {key} stop" : "type your answer · enter next · esc or {key} stop", { key: CANCEL_KEY });
    return this.exec.running ? t("running… {key} to interrupt", { key: CANCEL_KEY }) : `${display(this.exec.cwd)} · ${t("tab complete · ↑ history")}`;
  }

  /** ^C: stop the question asked and the command asking it, or the command running, or drop the line typed. */
  cancel(): void {
    const r = this.reading;
    if (r) {
      r.interrupt();
      r.done(null); // (a shell already stopped: the question goes anyway)
    } else if (this.exec.running) this.exec.interrupt();
    else {
      this.echoPrompt(this.input + "^C");
      this.input = "";
      this.cursor = 0;
    }
    this.deck.requestFrame();
  }

  // ── selection ────────────────────────────────────────────────────────────

  hasSelection(): boolean {
    return this.sel.has();
  }

  /** Copy the selection (⌘C on a Mac, ctrl+C elsewhere when something is selected, right-click → copy). */
  copySelection(): boolean {
    const t = this.sel.text(this.src);
    if (!t) return false;
    copyToClipboard(t);
    this.deck.notify("copied", "success");
    return true;
  }

  selectAll(): void {
    const w = this.outR.w;
    if (w > 0) this.sel.all(this.term.rowCount(w) - 1, w);
    this.deck.requestFrame();
  }

  /** where a cell of the screen is in the output's rows (out of the area: it scrolls, a drag goes on) */
  private posAt(x: number, y: number): TextPos {
    const r = this.outR;
    if (y < r.y) this.scroll++;
    else if (y >= r.y + r.h && this.scroll > 0) this.scroll--;
    const row = Math.max(0, Math.min(r.h - 1, y - r.y));
    return { line: this.outFirst + row, col: Math.max(0, Math.min(r.w, x - r.x)) };
  }

  /** Print the login banner and load history (call once the vault is mounted). */
  motd(): void {
    void this.loadHistory();
    const handle = this.deck.settings.data.user.handle;
    // in the deck's language (it was English on a French deck)
    this.term.write(`\x1b[2m${t("ICEBREAKER shell · ibsh {v} · type ", { v: APP_VERSION })}\x1b[0m\x1b[35mhelp\x1b[0m\x1b[2m${t(" to list commands, ")}\x1b[0m\x1b[35mman <cmd>\x1b[0m\x1b[2m${t(" for details")}\x1b[0m\n`);
    this.term.write(`\x1b[2m${t("last login: {when} on deck as ", { when: new Date().toLocaleString(dateLocale()) })}\x1b[0m\x1b[95m${handle}\x1b[0m\n`);
  }

  /** Run a command line as if typed (used by the palette and buttons). */
  async runLine(line: string, echo = true): Promise<number> {
    if (echo) this.echoPrompt(line);
    if (keepInHistory(line) && this.exec.history[this.exec.history.length - 1] !== line) {
      this.exec.history.push(line);
      this.saveHistory(line);
    }
    const code = await this.exec.run(line);
    if (line.trim()) this.deck.log.add("cmd", line, { failed: code !== 0 });
    if (line.trim()) void this.deck.stats.add("deck.commands", 1, "deck", { label: "commands run", kind: "counter" }).catch(() => {});
    this.term.ensureNewline();
    this.deck.requestFrame();
    return code;
  }

  /** `from`: who ran it when it isn't you typing (a module's id, "terminal") — said next to the line */
  private echoPrompt(line: string, from = ""): void {
    this.term.ensureNewline();
    this.term.write(`\x1b[35m${display(this.exec.cwd)}\x1b[0m \x1b[95m❯\x1b[0m ${line}${from ? `  \x1b[2m◂ ${from}\x1b[0m` : ""}\n`);
  }

  /**
   * Run what a click did as a visible shell command (so the mouse teaches the
   * command line). If the shell is busy (a chat, a question), it runs on the
   * side without disturbing it.
   */
  /**
   * A line that isn't yours — a module's (ib.shell.run, a click on one of its areas) or
   * a program's in your real terminal: on the side like a click, with its origin
   * (shell/origin.ts) for its whole run. Privileged commands are refused
   * (shell/privileged.ts); a module's line reads and writes only what its permissions allow.
   */
  async runUntrusted(line: string, origin: Origin): Promise<number> {
    const cmd = this.deck.commands.get(line.trim().split(/\s+/)[0] ?? "");
    // a line that will be refused never opens your shell or writes in it: it goes to the LOG
    if (cmd?.interactive && !this.exec.refuses(line)) {
      // it asks questions: in the ibsh tab like a click. The origin goes with THIS run only
      // (never a flag on the shared shell: another line finishing must not lift it)
      this.deck.workspace.showShellTab("ibsh");
      this.echoPrompt(line, origin.source);
      const code = await this.exec.run(line, origin);
      if (line.trim()) this.deck.log.add("cmd", line, { failed: code !== 0, source: origin.source });
      this.term.ensureNewline();
      this.deck.requestFrame();
      return code;
    }
    const entry = this.deck.log.add("action", line, { source: origin.source });
    const side = new ShellExecutor(this.deck, (text) => this.deck.log.append(entry, text), () => {});
    side.origin = origin;
    side.cwd = this.exec.cwd;
    side.env = { ...this.exec.env };
    side.readLine = (label, opts, signal, interrupt) => this.exec.readLine?.(`[${origin.source}] ${label}`, opts, signal, interrupt) ?? Promise.resolve(null);
    const code = await side.run(line);
    if (code !== 0) entry.failed = true;
    this.deck.requestFrame();
    return code;
  }

  async runAction(line: string): Promise<number> {
    const cmd = this.deck.commands.get(line.trim().split(/\s+/)[0] ?? "");
    // commands that ask questions run where you can answer them
    if (cmd?.interactive) {
      this.deck.workspace.showShellTab("ibsh");
      return this.runLine(line);
    }
    if (keepInHistory(line) && this.exec.history[this.exec.history.length - 1] !== line) {
      this.exec.history.push(line);
      this.saveHistory(line);
    }
    // the LOG tab shows it, with its output (the terminals stay clean)
    const entry = this.deck.log.add("action", line);
    const side = new ShellExecutor(this.deck, (text) => this.deck.log.append(entry, text), () => {});
    side.cwd = this.exec.cwd;
    side.env = this.exec.env;
    const code = await side.run(line);
    if (code !== 0) entry.failed = true;
    this.deck.requestFrame();
    return code;
  }

  // ── input ────────────────────────────────────────────────────────────────

  onText(t: string): boolean {
    this.sel.clear();
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
    // copy what the mouse selected: ⌘C on a Mac (the real Control+C still interrupts), ctrl+C
    // elsewhere; with nothing selected ctrl+C interrupts, as always
    if (this.sel.has() && k.key === "c" && k.ctrl && !k.alt && (IS_MAC ? !!k.rawMeta : true)) {
      if (this.copySelection()) this.sel.clear();
      return true;
    }
    if (!["shift", "control", "alt", "meta"].includes(k.key)) this.sel.clear(); // a key drops the selection
    if (isCancelKey(k)) return this.cancel(), true;
    if (k.combo === "ctrl+l") {
      this.term.clear();
      return true;
    }
    const rd = this.reading;
    if (rd) {
      const n = rd.opts.choices?.length ?? 0;
      if (k.combo === "esc") return this.cancel(), true;
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
      case "ctrl+backspace":
      case "alt+backspace": {
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
    // you're typing commands: the page one of them opens (launch, open, explore…) doesn't take
    // the keyboard away — the next line you type is still a command (tab or a click goes to the page)
    const ws = this.deck.workspace;
    const typing = ws.focus === "shell";
    await this.runLine(line);
    if (typing && ws.focus !== "shell" && ws.shellVisible && !this.deck.locked) ws.focusShell();
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

  /**
   * Tab completion: commands for the first word, then the command's own words (its sub-commands:
   * Command.complete, shell/complete.ts subCompletions), vault paths otherwise. Read like the parser
   * reads the line (shell/complete.ts): a name with spaces comes back quoted,
   * `cd STA<Tab>` → `cd "START HERE/"`.
   */
  private complete(): void {
    const before = this.input.slice(0, this.cursor);
    const w = wordAtCursor(before);
    const word = w.value;
    // the names it could be (what the shell will read), and how the list shows them
    let names: string[];
    let display_: string[];

    // a command's own words after its name (`med <tab>`: new, open, export…; Command.complete)
    const prev = w.first ? [] : commandWords(before);
    const cmd = prev.length ? this.deck.commands.get(prev[0]) : undefined;
    const own = cmd && !word.includes("/") ? subCompletions(cmd.complete === "command" ? () => this.deck.commands.names() : cmd.complete, prev.slice(1), word) : null;

    if (w.first && !word.includes("/")) {
      names = this.deck.commands.names().filter((n) => n.startsWith(word));
      display_ = names;
    } else if (own) {
      names = own;
      display_ = own;
    } else {
      const slash = word.lastIndexOf("/");
      const typedDir = slash >= 0 ? word.slice(0, slash + 1) : "";
      const prefix = word.slice(slash + 1);
      const dir = resolvePath(this.exec.cwd, typedDir || ".");
      const entries = this.deck.vault.entries.filter((e) => dirname(e.path) === dir && e.name.toLowerCase().startsWith(prefix.toLowerCase()));
      names = entries.map((e) => typedDir + e.name + (e.isDir ? "/" : ""));
      display_ = entries.map((e) => basename(e.path) + (e.isDir ? "/" : ""));
    }

    if (names.length === 0) return;
    let value = names[0];
    if (names.length > 1) {
      value = commonPrefix(names);
      if (value.length <= word.length) {
        // nothing more to add: show the options, like bash's double-tab
        this.echoPrompt(this.input);
        this.term.write(columns(display_, 80) + "\n");
        return;
      }
    }
    const completion = quoteWord(value, w.open, names.length === 1);
    this.input = before.slice(0, w.start) + completion + this.input.slice(this.cursor);
    this.cursor = w.start + completion.length;
  }

  // ── drawing ──────────────────────────────────────────────────────────────

  render(ui: UI, r: Rect, focused: boolean): void {
    const promptH = this.reading?.opts.choices?.length ? 2 : 1;
    const total = this.term.rowCount(r.w);
    const outH = Math.min(total, r.h - promptH);
    const maxScroll = Math.max(0, total - outH);
    this.scroll = this.glide.follow(ui, Math.min(this.scroll, maxScroll), maxScroll);
    const first = total - outH - this.scroll;
    const out = { x: r.x, y: r.y, w: r.w, h: outH };
    // the rows the selection counts are those of one width: another width, another text
    if (r.w !== this.outR.w) this.sel.clear();
    this.term.render(ui, out, first);
    this.outR = out;
    this.outFirst = first;
    this.sel.paint(ui, out, first, this.src);

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
    ui.hit(r, { onWheel: (d) => this.glide.push(-d) });
    // drag to select, double-click a word, triple-click a line; ⌘C / ctrl+C copies
    if (outH > 0) ui.hit(out, { onWheel: (d) => this.glide.push(-d), ...selectionHit({ sel: this.sel, src: this.src, at: (m) => this.posAt(m.x, m.y), redraw: () => this.deck.requestFrame() }) });
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
      // (in the deck's language: it was English under account delete's password on a French deck)
      const hint = rd.opts.placeholder ?? (ch.length && !rd.opts.allowText ? t("1-9 · ←→ · enter") : t("enter = skip · esc or {key} = stop", { key: CANCEL_KEY }));
      ui.text(x, y, hint, { fg: c.faint }, room);
    } else ui.text(x, y, [...shown].slice(off).join(""), { fg: c.fg, raw: true }, room); // what you type: no keycaps
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
    for (const part of colored) {
      for (const ch of part.text) {
        if (cx >= startX && cx < x0 + w) ui.text(cx, y, ch, part.style);
        cx += strWidth(ch);
      }
    }
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

  /**
   * Every ibsh tab's lines, in the order they were typed: what the history file keeps (like
   * bash: each tab walks its own history with ↑, a new tab starts with all of it).
   */
  private static shared: string[] | null = null;
  private static saveTimer: ReturnType<typeof setTimeout> | undefined;

  private async loadHistory(): Promise<void> {
    try {
      if (!ShellApp.shared) ShellApp.shared = (await this.deck.vault.exists(HISTORY_FILE)) ? (await this.deck.vault.read(HISTORY_FILE)).split("\n").filter(Boolean).slice(-1000) : [];
      // what this tab typed before the file was read stays after it
      this.exec.history = [...ShellApp.shared, ...this.exec.history.filter((l) => !ShellApp.shared!.includes(l))].slice(-1000);
    } catch {
      /* no history yet */
    }
  }

  private saveHistory(line: string): void {
    const all = (ShellApp.shared ??= []);
    all.push(line);
    if (all.length > 1000) all.splice(0, all.length - 1000);
    clearTimeout(ShellApp.saveTimer);
    ShellApp.saveTimer = setTimeout(() => {
      void this.deck.vault.write(HISTORY_FILE, all.join("\n") + "\n").catch(() => {});
    }, 1000);
  }

  /** a new account or vault (logging in again): its own history file */
  static forgetHistory(): void {
    ShellApp.shared = null;
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
