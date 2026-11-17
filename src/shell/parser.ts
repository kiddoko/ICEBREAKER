/**
 * Command-line parser: quotes, escapes, $VARS, pipes, redirections and
 * chaining — the subset of POSIX sh people use daily.
 *
 *   grep -i "neon city" *.md | sort > found.txt && echo done
 *
 * Output is a list of pipelines joined by ; && ||
 */

export interface Word {
  value: string;
  /** Unquoted words with * or ? get glob-expanded. */
  glob: boolean;
}

export interface SimpleCommand {
  words: Word[];
  /** `> file` / `>> file` */
  output?: { path: string; append: boolean };
  /** `< file` */
  input?: string;
}

export interface Pipeline {
  commands: SimpleCommand[];
  /** How this pipeline connects to the NEXT one. */
  next: ";" | "&&" | "||" | null;
}

type Token = { kind: "word"; word: Word } | { kind: "op"; op: string };

export class ParseError extends Error {}

export function tokenize(line: string, env: Record<string, string>): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  let cur = "";
  let inWord = false;
  let glob = false;

  const flush = () => {
    if (inWord) tokens.push({ kind: "word", word: { value: cur, glob } });
    cur = "";
    inWord = false;
    glob = false;
  };
  const expandVar = (): string => {
    // at line[i] === "$"
    if (line[i + 1] === "{") {
      const end = line.indexOf("}", i);
      if (end === -1) throw new ParseError("unterminated ${");
      const name = line.slice(i + 2, end);
      i = end + 1;
      return env[name] ?? "";
    }
    const m = line.slice(i + 1).match(/^(\?|[A-Za-z_][A-Za-z0-9_]*)/);
    if (!m) {
      i++;
      return "$";
    }
    i += 1 + m[1].length;
    return env[m[1]] ?? "";
  };

  while (i < line.length) {
    const c = line[i];
    if (c === " " || c === "\t") {
      flush();
      i++;
    } else if (c === "#" && !inWord) {
      break; // comment
    } else if (c === "'") {
      const end = line.indexOf("'", i + 1);
      if (end === -1) throw new ParseError("unterminated '");
      cur += line.slice(i + 1, end);
      inWord = true;
      i = end + 1;
    } else if (c === '"') {
      inWord = true;
      i++;
      while (i < line.length && line[i] !== '"') {
        if (line[i] === "\\" && i + 1 < line.length && '"\\$`'.includes(line[i + 1])) {
          cur += line[i + 1];
          i += 2;
        } else if (line[i] === "$") cur += expandVar();
        else cur += line[i++];
      }
      if (line[i] !== '"') throw new ParseError('unterminated "');
      i++;
    } else if (c === "\\" && i + 1 < line.length) {
      cur += line[i + 1];
      inWord = true;
      i += 2;
    } else if (c === "$") {
      cur += expandVar();
      inWord = true;
    } else if ("|&;<>".includes(c)) {
      flush();
      const two = line.slice(i, i + 2);
      if (two === "&&" || two === "||" || two === ">>") {
        tokens.push({ kind: "op", op: two });
        i += 2;
      } else if (c === "&") {
        throw new ParseError("background jobs (&) are not supported");
      } else {
        tokens.push({ kind: "op", op: c });
        i++;
      }
    } else {
      if (c === "*" || c === "?") glob = true;
      cur += c;
      inWord = true;
      i++;
    }
  }
  flush();
  return tokens;
}

export function parse(line: string, env: Record<string, string>): Pipeline[] {
  const tokens = tokenize(line, env);
  const pipelines: Pipeline[] = [];
  let commands: SimpleCommand[] = [];
  let cmd: SimpleCommand = { words: [] };

  const endCommand = () => {
    if (cmd.words.length === 0) {
      if (cmd.output || cmd.input) throw new ParseError("redirection without a command");
      return false;
    }
    commands.push(cmd);
    cmd = { words: [] };
    return true;
  };

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.kind === "word") {
      cmd.words.push(t.word);
      continue;
    }
    switch (t.op) {
      case ">":
      case ">>":
      case "<": {
        const target = tokens[++i];
        if (!target || target.kind !== "word") throw new ParseError(`expected a file name after ${t.op}`);
        if (t.op === "<") cmd.input = target.word.value;
        else cmd.output = { path: target.word.value, append: t.op === ">>" };
        break;
      }
      case "|":
        if (!endCommand()) throw new ParseError("syntax error near |");
        break;
      default: // ; && ||
        if (!endCommand() && commands.length === 0) {
          if (t.op === ";") continue;
          throw new ParseError(`syntax error near ${t.op}`);
        }
        pipelines.push({ commands, next: t.op as Pipeline["next"] });
        commands = [];
    }
  }
  endCommand();
  if (commands.length) pipelines.push({ commands, next: null });
  else if (pipelines.length && pipelines[pipelines.length - 1].next !== ";") throw new ParseError("unexpected end of line");
  return pipelines;
}

/**
 * Flag parsing for commands: `-la`, `-n 5`, `-n5`, `--all`, `--name=x`, `--`.
 * `withValue` lists flags that take a value.
 */
export function parseFlags(args: string[], withValue: string[] = []): { flags: Record<string, string | true>; rest: string[] } {
  const flags: Record<string, string | true> = {};
  const rest: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--") {
      rest.push(...args.slice(i + 1));
      break;
    }
    if (a.startsWith("--") && a.length > 2) {
      const [k, v] = a.slice(2).split("=", 2);
      if (v !== undefined) flags[k] = v;
      else if (withValue.includes(k) && i + 1 < args.length) flags[k] = args[++i];
      else flags[k] = true;
    } else if (a.startsWith("-") && a.length > 1 && !/^-\d/.test(a)) {
      const letters = a.slice(1);
      for (let j = 0; j < letters.length; j++) {
        const f = letters[j];
        if (withValue.includes(f)) {
          const v = letters.slice(j + 1) || args[++i];
          if (v !== undefined) flags[f] = v;
          break;
        }
        flags[f] = true;
      }
    } else if (/^-\d+$/.test(a) && withValue.includes("n")) {
      flags.n = a.slice(1); // `head -5` shorthand
    } else rest.push(a);
  }
  return { flags, rest };
}
