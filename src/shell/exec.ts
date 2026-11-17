import { fmt, stripAnsi } from "../core/ansi";
import { levenshtein } from "../core/fuzzy";
import type { Deck } from "../deck";
import { basename, dirname, globToRegex, resolvePath } from "../vault/paths";
import { parse, ParseError, type SimpleCommand, type Word } from "./parser";
import type { ShellContext, ShellControls } from "./types";

/**
 * Runs parsed command lines. Pipelines run one command after another, each
 * one's stdout becoming the next one's stdin (simple and predictable).
 */
export class ShellExecutor {
  cwd = "";
  env: Record<string, string> = {};
  history: string[] = [];
  lastStatus = 0;
  private abort: AbortController | null = null;

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

  async run(line: string): Promise<number> {
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
    if (outer) this.abort = new AbortController();
    try {
      let status = 0;
      let prevNext: string | null = null;
      for (const p of pipelines) {
        if (prevNext === "&&" && status !== 0) break;
        if (prevNext === "||" && status === 0) break;
        status = await this.runPipeline(p.commands);
        prevNext = p.next;
        if (this.abort?.signal.aborted) break;
      }
      return (this.lastStatus = status);
    } finally {
      if (outer) this.abort = null;
    }
  }

  private async runPipeline(cmds: SimpleCommand[]): Promise<number> {
    let input = "";
    let status = 0;
    for (let i = 0; i < cmds.length; i++) {
      const c = cmds[i];
      const last = i === cmds.length - 1;
      if (c.input !== undefined) {
        try {
          input = await this.deck.vault.read(resolvePath(this.cwd, c.input));
        } catch (e) {
          this.print(`ibsh: ${c.input}: ${errMsg(e)}\n`, true);
          return 1;
        }
      }
      const toScreen = last && !c.output;
      const res = await this.runCommand(this.expand(c.words), input, toScreen);
      status = res.status;
      input = res.stdout;
      if (c.output) {
        const path = resolvePath(this.cwd, c.output.path);
        const text = stripAnsi(res.stdout);
        try {
          if (c.output.append) await this.deck.vault.append(path, text);
          else await this.deck.vault.write(path, text);
        } catch (e) {
          this.print(`ibsh: ${c.output.path}: ${errMsg(e)}\n`, true);
          return 1;
        }
      }
    }
    return status;
  }

  /** Expand globs like *.md against the vault index. Unmatched globs stay literal (like bash). */
  private expand(words: Word[]): string[] {
    const out: string[] = [];
    for (const w of words) {
      if (!w.glob) {
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

  private async runCommand(argv: string[], stdin: string, isTTY: boolean): Promise<{ status: number; stdout: string }> {
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

    let stdout = "";
    const self = this;
    const controls: ShellControls = {
      cd: (p) => (self.cwd = p),
      clear: () => self.clearScreen(),
      history: () => [...self.history],
      run: (line) => self.run(line),
    };
    const ctx: ShellContext = {
      args,
      stdin,
      isTTY,
      cwd: this.cwd,
      env: this.env,
      deck: this.deck,
      shell: controls,
      signal: this.abort!.signal,
      out: (t) => {
        if (isTTY) self.print(t, false);
        else stdout += t;
        self.deck.requestFrame();
      },
      err: (t) => {
        self.print(t, true);
        self.deck.requestFrame();
      },
      resolve: (p) => resolvePath(self.cwd, p),
    };
    try {
      const code = await cmd.run(ctx);
      return { status: typeof code === "number" ? code : 0, stdout };
    } catch (e) {
      if (this.abort?.signal.aborted) {
        this.print("^C\n", true);
        return { status: 130, stdout };
      }
      this.print(`${name}: ${errMsg(e)}\n`, true);
      return { status: 1, stdout };
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
