/**
 * Tab completion helpers, read the way the parser reads a line (shell/parser.ts):
 * quotes and backslashes included, so a name with spaces completes to something
 * ibsh understands — `cd STA<Tab>` → `cd "START HERE/"`.
 */

export interface WordAtCursor {
  /** where the word starts in the text before the cursor (its opening quote included) */
  start: number;
  /** the word as the shell will read it: quotes and backslashes taken out */
  value: string;
  /** the quote still open at the cursor, if any */
  open: '"' | "'" | null;
  /** the word is the command's name (first of its command: start of line, after | ; && ||) */
  first: boolean;
}

/** The word being typed at the end of `before` (the text left of the cursor). */
export function wordAtCursor(before: string): WordAtCursor {
  let start = before.length;
  let value = "";
  let inWord = false;
  let open: '"' | "'" | null = null;
  let words = 0; // words before this one, in this command
  for (let i = 0; i < before.length; i++) {
    const c = before[i];
    if (open) {
      if (c === open) open = null;
      else if (open === '"' && c === "\\" && i + 1 < before.length && '"\\$`'.includes(before[i + 1])) value += before[++i];
      else value += c;
      continue;
    }
    if (c === " " || c === "\t") {
      if (inWord) words++;
      inWord = false;
      continue;
    }
    if ("|&;<>".includes(c)) {
      if (inWord) words++;
      inWord = false;
      // a redirection's file isn't a command name; a pipe / chain starts a new command
      if (c !== "<" && c !== ">") words = 0;
      else words = Math.max(words, 1);
      continue;
    }
    if (!inWord) {
      inWord = true;
      start = i;
      value = "";
    }
    if (c === '"' || c === "'") open = c;
    else if (c === "\\" && i + 1 < before.length) value += before[++i];
    else value += c;
  }
  if (!inWord && !open) return { start: before.length, value: "", open: null, first: words === 0 };
  return { start, value, open, first: words === 0 };
}

/** characters a bare word can't hold as they are (the parser would split or expand them) */
const SPECIAL = /[\s"'\\$`|&;<>*?#()]/;

/**
 * A completed word, written back so the shell reads `value`. `done`: the whole name
 * (the quote is closed, a file gets its trailing space); else a common prefix, left
 * open so you can keep typing inside the quotes.
 */
export function quoteWord(value: string, open: '"' | "'" | null, done: boolean): string {
  const space = done && !value.endsWith("/") ? " " : "";
  const quote = open ?? (SPECIAL.test(value) ? '"' : null);
  if (!quote) return value + space;
  const body = quote === "'" ? value.replace(/'/g, `'\\''`) : value.replace(/["\\$`]/g, "\\$&");
  return `${quote}${body}${done ? quote : ""}${space}`;
}

/**
 * The words of the command being typed, before the word at the cursor (its name first):
 * `ls | med export w` → ["med", "export"]. A redirection's file isn't one of them.
 */
export function commandWords(before: string): string[] {
  const words: string[] = [];
  let cur = "";
  let inWord = false;
  let open: '"' | "'" | null = null;
  let redirect = false;
  const end = () => {
    if (inWord && !redirect) words.push(cur);
    else if (inWord) redirect = false;
    inWord = false;
    cur = "";
  };
  for (let i = 0; i < before.length; i++) {
    const c = before[i];
    if (open) {
      if (c === open) open = null;
      else if (open === '"' && c === "\\" && i + 1 < before.length && '"\\$`'.includes(before[i + 1])) cur += before[++i];
      else cur += c;
      continue;
    }
    if (c === " " || c === "\t") {
      end();
      continue;
    }
    if ("|&;<>".includes(c)) {
      end();
      if (c === "<" || c === ">") redirect = true;
      else words.length = 0;
      continue;
    }
    inWord = true;
    if (c === '"' || c === "'") open = c;
    else if (c === "\\" && i + 1 < before.length) cur += before[++i];
    else cur += c;
  }
  // the word at the cursor (still being typed) isn't one of them
  return words;
}

/**
 * What Tab offers after a command's name, from its `complete`: a function without arguments
 * (or a list a module sent) gives the first word's choices; one that takes the words typed so
 * far (`(args) => …`) or a record (`{ "": ["export"], "export": ["wav", "mod"] }`) the next
 * one's. null: nothing of its own here (Tab completes paths).
 */
export function subCompletions(spec: unknown, args: string[], prefix: string): string[] | null {
  let all: unknown;
  if (typeof spec === "function") {
    if (spec.length === 0 && args.length) return null;
    all = (spec as (a: string[]) => unknown)(args);
  } else if (Array.isArray(spec)) all = args.length ? null : spec;
  else if (spec && typeof spec === "object") all = (spec as Record<string, unknown>)[args.join(" ")];
  if (!Array.isArray(all)) return null;
  const hit = all.filter((x): x is string => typeof x === "string" && x.startsWith(prefix));
  return hit.length ? hit : null;
}
