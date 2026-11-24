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
  // typographic double quotes (a phone, a word processor, macOS smart quotes) quote like "
  // (not ‘ ’: ’ is an apostrophe in French text — journal l’idée)
  line = line.replace(/[“”„]/g, '"');
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
    } else if (c === "#" && !inWord && (!line.slice(0, i).trim() || /\s/.test(line[i + 1] ?? " "))) {
      // a comment: "# …" or a line starting with #. "#ff2e88" or "#tag" stay arguments.
      break;
    } else if (c === "'") {
      const end = line.indexOf("'", i + 1);
      if (end === -1) throw new ParseError("a ' isn't closed — add the closing ' (or write \\' for an apostrophe)");
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
      if (line[i] !== '"') throw new ParseError('a " isn\'t closed — add the closing "');
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

/**
 * The line cut where `;`, `&&` and `||` are (not inside quotes, after a \, in ${…} or in a
 * comment), each piece with the operator that follows it. ibsh parses a piece only when it
 * runs, with the variables of that moment: `export X=1; echo $X` prints 1, as in bash (the
 * whole line was expanded first, and printed nothing). Empty pieces are left out.
 */
export function segments(line: string): { text: string; next: string | null }[] {
  line = line.replace(/[“”„]/g, '"');
  const out: { text: string; next: string | null }[] = [];
  let start = 0;
  let i = 0;
  const cut = (end: number, op: string | null, skip: number) => {
    const text = line.slice(start, end).trim();
    if (text) out.push({ text, next: op });
    else if (op && out.length) out[out.length - 1].next = op;
    i = start = end + skip;
  };
  while (i < line.length) {
    const c = line[i];
    const atWordStart = i === 0 || /\s/.test(line[i - 1]);
    if (c === "'") {
      const end = line.indexOf("'", i + 1);
      i = end === -1 ? line.length : end + 1;
    } else if (c === '"') {
      i++;
      while (i < line.length && line[i] !== '"') i += line[i] === "\\" ? 2 : 1;
      i++;
    } else if (c === "\\") i += 2;
    else if (c === "$" && line[i + 1] === "{") {
      const end = line.indexOf("}", i);
      i = end === -1 ? line.length : end + 1;
    } else if (c === "#" && atWordStart && (!line.slice(start, i).trim() || /\s/.test(line[i + 1] ?? " "))) break;
    else if (c === ";") cut(i, ";", 1);
    else if ((c === "&" && line[i + 1] === "&") || (c === "|" && line[i + 1] === "|")) cut(i, c + c, 2);
    else i++;
  }
  cut(line.length, null, 0);
  if (out.length) out[out.length - 1].next = out[out.length - 1].next === ";" ? null : out[out.length - 1].next;
  return out;
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
