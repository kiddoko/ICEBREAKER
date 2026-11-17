import type { Deck } from "../deck";

/**
 * What a shell command receives when it runs. Write output with `out` (it may
 * contain ANSI color codes, see `fmt` in core/ansi.ts) and errors with `err`.
 * Return an exit code (0 = success) or nothing.
 */
export interface ShellContext {
  /** Arguments after the command name, globs already expanded. */
  args: string[];
  /** Text piped in (`a | b`) or redirected (`b < file`). Empty otherwise. */
  stdin: string;
  /** True when output goes to the screen (false when piped/redirected → skip colors). */
  isTTY: boolean;
  /** Current directory, vault-relative ("" = root). */
  cwd: string;
  env: Record<string, string>;
  deck: Deck;
  shell: ShellControls;
  /** Aborted when the user presses Ctrl+C. */
  signal: AbortSignal;
  out(text: string): void;
  err(text: string): void;
  /** Resolve a user-typed path against cwd → vault path. */
  resolve(path: string): string;
  /**
   * Ask the user something and wait for the answer (interactive commands).
   * With `choices`, quick answers are shown as numbered chips: 1-9, arrows or
   * a click pick one. Resolves "" when they skip (enter on empty), null when
   * they cancel (esc / ctrl+c) or when output isn't a terminal.
   */
  read(label: string, opts?: ReadOptions): Promise<string | null>;
}

export interface ReadOptions {
  choices?: string[];
  /** With choices: also accept free text (digits still pick a chip). */
  allowText?: boolean;
  placeholder?: string;
  /** Hide what's typed (passwords). */
  mask?: boolean;
}

export interface ShellControls {
  cd(path: string): void;
  clear(): void;
  history(): string[];
  /** Run another command line (used by aliases and scripts). */
  run(line: string): Promise<number>;
}

export interface Command {
  name: string;
  aliases?: string[];
  /** One line for `help`. */
  summary: string;
  /** e.g. "ls [-la] [path]" */
  usage?: string;
  /** Longer description for `man`. */
  man?: string;
  /** What Tab completes for arguments. */
  complete?: "path" | "command" | "none" | (() => string[]);
  /** Who registered it: "core" or a plugin id. */
  source?: string;
  run(ctx: ShellContext): Promise<number | void> | number | void;
}

export class CommandRegistry {
  private commands = new Map<string, Command>();
  private aliases = new Map<string, string>();

  register(cmd: Command): void {
    this.commands.set(cmd.name, cmd);
    for (const a of cmd.aliases ?? []) this.aliases.set(a, cmd.name);
  }

  unregisterSource(source: string): void {
    for (const [name, c] of this.commands) {
      if (c.source !== source) continue;
      this.commands.delete(name);
      for (const a of c.aliases ?? []) this.aliases.delete(a);
    }
  }

  get(name: string): Command | undefined {
    return this.commands.get(name) ?? this.commands.get(this.aliases.get(name) ?? "");
  }

  all(): Command[] {
    return [...this.commands.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  /** Every name you can type, aliases included. */
  names(): string[] {
    return [...this.commands.keys(), ...this.aliases.keys()].sort();
  }
}
