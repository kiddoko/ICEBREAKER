import { fmt, stripAnsi } from "../core/ansi";
import { levenshtein } from "../core/fuzzy";
import type { Deck } from "../deck";
import { basename, dirname, globToRegex, resolvePath } from "../vault/paths";
import { AI_COMMANDS, allows, guardedDeck, guardedVault, type Origin } from "./origin";
import { isPrivileged } from "./privileged";
import { parse, ParseError, type SimpleCommand, type Word } from "./parser";
import { helpText, wantsHelp } from "./help";
import type { ReadOptions, ShellContext, ShellControls } from "./types";

/**
 * Runs parsed command lines. Pipelines run one command after another, each
 * one's stdout becoming the next one's stdin (simple and predictable).
 */

/** `> /dev/null` throws the output away and `< /dev/null` reads nothing, like any shell (no file is made). */
const DEV_NULL = "/dev/null";

export class ShellExecutor {
  cwd = "";
  env: Record<string, string> = {};
  history: string[] = [];
  lastStatus = 0;
  private abort: AbortController | null = null;
  /**
   * Who this shell's lines come from when they aren't yours (shell/origin.ts): a side
   * shell made for one module's line. The main shell has none; a line that isn't yours
   * run there passes its origin to `run`.
   */
  origin: Origin | null = null;
  /** Set by the shell panel: shows a question and resolves with the answer. */
  readLine: ((label: string, opts: ReadOptions, signal: AbortSignal, interrupt: () => void) => Promise<string | null>) | null = null;
  /** a question is on screen (it shows "^C" itself when cancelled) */
  private asking = 0;
  /** "^C" was said for this line (aliases and scripts run lines inside lines: once is enough) */
  private stopShown = false;

  constructor(
    private readonly deck: Deck,
    /** Where TTY output goes (the terminal buffer). */
    private readonly print: (text: string, isError: boolean) => void,
    private readonly clearScreen: () => void,
  ) {
    const handle = deck.settings.data.user.handle;
    this.env = { USER: handle, HOME: "~", SHELL: "ibsh", TERM: "icebreaker-256color", EDITOR: "ib-edit", PS1: "❯ " };
  }

  get running(): boolean {
    return this.abort !== null;
  }

  /** Ctrl+C */
  interrupt(): void {
    this.abort?.abort();
  }

  async run(line: string, origin: Origin | null = this.origin): Promise<number> {
    const trimmed = line.trim();
    if (!trimmed) return 0;
    let pipelines;
    try {
      pipelines = parse(trimmed, { ...this.env, "?": String(this.lastStatus) });
    } catch (e) {
      this.print(`ibsh: ${e instanceof ParseError ? e.message : String(e)}\n`, true);
      return (this.lastStatus = 2);
    }
    const outer = this.abort === null;
    if (outer) (this.abort = new AbortController()), (this.stopShown = false);
    try {
      let status = 0;
      let prevNext: string | null = null;
      for (const p of pipelines) {
        if (prevNext === "&&" && status !== 0) break;
        if (prevNext === "||" && status === 0) break;
        status = await this.runPipeline(p.commands, origin);
        prevNext = p.next;
        if (this.abort?.signal.aborted) break;
      }
      return (this.lastStatus = status);
    } finally {
      if (outer) this.abort = null;
    }
  }

  /** Would any command of this line be refused to a module or your real terminal? (a line that doesn't parse: yes) */
  refuses(line: string): boolean {
    try {
      return parse(line.trim(), { ...this.env, "?": String(this.lastStatus) }).some((p) =>
        p.commands.some((c) => {
          const [name, ...args] = c.words.map((w) => w.value);
          const cmd = this.deck.commands.get(name ?? "");
          return !!cmd && isPrivileged(cmd.name, args);
        }),
      );
    } catch {
      return true;
    }
  }

  private async runPipeline(cmds: SimpleCommand[], origin: Origin | null): Promise<number> {
    let input = "";
    let status = 0;
    // a module's line: what it captures (a pipe, `<`) is reading, what it redirects (`>`) is writing
    if (origin) {
      const captures = cmds.length > 1 || cmds.some((c) => c.input !== undefined && c.input !== DEV_NULL);
      if (captures && !allows(origin, "vault:read")) return this.print(`ibsh: ${origin.source} needs the "vault:read" permission to pipe or read (| <)\n`, true), 126;
      if (cmds.some((c) => c.output && c.output.path !== DEV_NULL) && !allows(origin, "vault:write")) return this.print(`ibsh: ${origin.source} needs the "vault:write" permission to write (>)\n`, true), 126;
    }
    const vault = origin ? guardedVault(this.deck.vault, origin) : this.deck.vault;
    for (let i = 0; i < cmds.length; i++) {
      const c = cmds[i];
      const last = i === cmds.length - 1;
      if (c.input === DEV_NULL) input = "";
      else if (c.input !== undefined) {
        try {
          input = await vault.read(resolvePath(this.cwd, c.input));
        } catch (e) {
          this.print(`ibsh: ${c.input}: ${errMsg(e)}\n`, true);
          return 1;
        }
      }
      const toScreen = last && !c.output;
      // file names are the vault's too: no * for a line without "vault:read"
      const res = await this.runCommand(this.expand(c.words, allows(origin, "vault:read")), input, toScreen, origin);
      status = res.status;
      input = res.stdout;
      if (c.output && c.output.path !== DEV_NULL) {
        const path = resolvePath(this.cwd, c.output.path);
        const text = stripAnsi(res.stdout);
        try {
          if (c.output.append) await vault.append(path, text);
          else await vault.write(path, text);
        } catch (e) {
          this.print(`ibsh: ${c.output.path}: ${errMsg(e)}\n`, true);
          return 1;
        }
      }
    }
    return status;
  }

  /** Expand globs like *.md against the vault index. Unmatched globs stay literal (like bash). */
  private expand(words: Word[], globs = true): string[] {
    const out: string[] = [];
    for (const w of words) {
      if (!w.glob || !globs) {
        out.push(w.value);
        continue;
      }
      const full = resolvePath(this.cwd, w.value);
      const dir = dirname(full);
      const re = globToRegex(basename(full));
      const matches = this.deck.vault.entries
        .filter((e) => dirname(e.path) === dir && re.test(e.name))
        .map((e) => (w.value.startsWith("/") || w.value.startsWith("~") ? "/" + e.path : relativeTo(this.cwd, e.path)));
      if (matches.length) out.push(...matches.sort());
      else out.push(w.value);
    }
    return out;
  }

  private async runCommand(argv: string[], stdin: string, isTTY: boolean, origin: Origin | null): Promise<{ status: number; stdout: string }> {
    const [name, ...args] = argv;
    const cmd = this.deck.commands.get(name);
    if (!cmd) {
      const guess = this.deck.commands
        .names()
        .map((n) => ({ n, d: levenshtein(name, n) }))
        .sort((a, b) => a.d - b.d)[0];
      const hint = guess && guess.d <= 2 ? ` — did you mean ${fmt.bold(guess.n)}?` : "";
      this.print(`ibsh: command not found: ${name}${hint}\n`, true);
      return { status: 127, stdout: "" };
    }

    if (origin && isPrivileged(cmd.name, args)) {
      this.print(`${name}: not allowed from a module or your real terminal — type it in ibsh\n`, true);
      return { status: 126, stdout: "" };
    }
    if (origin && AI_COMMANDS.has(cmd.name) && !allows(origin, "ai")) {
      this.print(`${name}: ${origin.source} needs the "ai" permission\n`, true);
      return { status: 126, stdout: "" };
    }
    // Another module's command (`todo add`, `remind`, `cal add`…) keeps that module's own data,
    // out of reach of the vault's guard: a STORE / vault module changes your data through
    // them only with "vault:write" (as through their functions: `todo.add`). The deck's own
    // commands and the features packaged with it go through the guarded vault below.
    if (origin && origin.grants !== "all" && cmd.source && cmd.source !== "core" && cmd.source !== origin.source && !allows(origin, "vault:write")) {
      const owner = this.deck.plugins.list().find((p) => p.manifest.id === cmd.source);
      // (a module from the vault can write "core" in its plugin.json: only one that ships with the deck counts)
      if (!(owner?.source === "builtin" && owner.manifest.core)) {
        this.print(`${name}: ${origin.source} needs the "vault:write" permission to run ${cmd.source}'s commands\n`, true);
        return { status: 126, stdout: "" };
      }
    }
    // while this command runs, the deck it sees keeps the origin: its vault, and what it runs in turn
    const live = { on: true };
    const deck = origin ? guardedDeck(this.deck, origin, (l) => self.run(l, origin), live) : this.deck;
    let stdout = "";
    const self = this;
    const controls: ShellControls = {
      cd: (p) => (self.cwd = p),
      clear: () => self.clearScreen(),
      history: () => [...self.history],
      run: (line) => self.run(line, origin),
    };
    const signal = this.abort!.signal;
    if (signal.aborted) return (live.on = false), { status: 130, stdout: "" }; // stopped before its turn (a | b, a; b)
    const ctx: ShellContext = {
      args,
      stdin,
      isTTY,
      cwd: this.cwd,
      env: this.env,
      deck,
      shell: controls,
      signal,
      out: (t) => {
        if (signal.aborted) return; // stopped (^C): like a killed program, it says nothing more
        if (isTTY) self.print(t, false);
        else stdout += t;
        self.deck.requestFrame();
      },
      err: (t) => {
        if (signal.aborted) return;
        self.print(t, true);
        self.deck.requestFrame();
      },
      resolve: (p) => resolvePath(self.cwd, p),
      read: (label, opts = {}) => {
        if (!self.readLine || signal.aborted) return Promise.resolve(null);
        self.asking++;
        return self.readLine(label, opts, signal, () => self.interrupt()).finally(() => self.asking--);
      },
    };
    if (wantsHelp(args)) {
      ctx.out(helpText(cmd, isTTY));
      return { status: 0, stdout };
    }
    // ^C stops the command at once, even one that doesn't listen to the signal:
    // the prompt comes back, what it does after that is never shown
    // (a question on screen when it's stopped already says "^C": shell/shell.ts readLine)
    let asked = false;
    const stopped = new Promise<"stopped">((res) => signal.addEventListener("abort", () => ((asked = this.asking > 0), res("stopped")), { once: true }));
    const stop = () => {
      if (!this.stopShown && !asked) this.print("^C\n", true);
      this.stopShown = true;
      return { status: 130, stdout };
    };
    try {
      const running = Promise.resolve(cmd.run(ctx));
      running.catch(() => {}); // stopped first: its later error isn't anyone's
      const code = await Promise.race([running, stopped]);
      if (code === "stopped" || signal.aborted) return stop();
      return { status: typeof code === "number" ? code : 0, stdout };
    } catch (e) {
      if (signal.aborted) return stop();
      this.print(`${name}: ${errMsg(e)}\n`, true);
      return { status: 1, stdout };
    } finally {
      // what happens later in what the command opened (a pop-up, a page) is you
      live.on = false;
    }
  }
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** Path of `target` as typed from `cwd` (for glob results). */
export function relativeTo(cwd: string, target: string): string {
  if (!cwd) return target;
  if (target.startsWith(cwd + "/")) return target.slice(cwd.length + 1);
  return "/" + target;
}
