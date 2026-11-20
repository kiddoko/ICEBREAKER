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
