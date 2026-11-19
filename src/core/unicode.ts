/**
 * How many terminal cells a character occupies.
 * CJK / fullwidth / most emoji take 2 cells, combining marks take 0.
 * (Same idea as wcwidth(3) — trimmed down to the ranges that matter.)
 */
export function charWidth(cp: number): 0 | 1 | 2 {
  if (cp < 0x300) return 1; // fast path: ASCII + Latin
  // combining marks
  if ((cp >= 0x300 && cp <= 0x36f) || (cp >= 0x200b && cp <= 0x200f) || cp === 0xfe0f) return 0;
  if (
    cp >= 0x1100 &&
    (cp <= 0x115f ||
      cp === 0x2329 ||
      cp === 0x232a ||
      (cp >= 0x2e80 && cp <= 0xa4cf && cp !== 0x303f) ||
      (cp >= 0xac00 && cp <= 0xd7a3) ||
      (cp >= 0xf900 && cp <= 0xfaff) ||
      (cp >= 0xfe30 && cp <= 0xfe6f) ||
      (cp >= 0xff00 && cp <= 0xff60) ||
      (cp >= 0xffe0 && cp <= 0xffe6) ||
      (cp >= 0x1f300 && cp <= 0x1f64f) ||
      (cp >= 0x1f900 && cp <= 0x1f9ff) ||
      (cp >= 0x20000 && cp <= 0x3fffd))
  ) {
    return 2;
  }
  return 1;
}

/** Display width of a string, in cells. */
export function strWidth(s: string): number {
  let w = 0;
  for (const ch of s) w += charWidth(ch.codePointAt(0)!);
  return w;
}

/** Cut a string to fit `max` cells, adding an ellipsis when something was cut. */
export function truncate(s: string, max: number, ellipsis = "…"): string {
  if (max <= 0) return "";
  if (strWidth(s) <= max) return s;
  let out = "";
  let w = 0;
  for (const ch of s) {
    const cw = charWidth(ch.codePointAt(0)!);
    if (w + cw > max - 1) break;
    out += ch;
    w += cw;
  }
  return out + ellipsis;
}

/** Pad with spaces on the right up to `width` cells. */
export function padEnd(s: string, width: number): string {
  const w = strWidth(s);
  return w >= width ? s : s + " ".repeat(width - w);
}

export function padStart(s: string, width: number): string {
  const w = strWidth(s);
  return w >= width ? s : " ".repeat(width - w) + s;
}

/**
 * Words to lines of at most `w` columns (the one word-wrap of the deck: the tour,
 * the setup, the chat widget, the news…). Line breaks in the text are kept; a word
 * longer than a line is cut.
 */
export function wrapWords(s: string, w: number): string[] {
  const width = Math.max(1, w);
  const out: string[] = [];
  for (const para of s.split("\n")) {
    let line = "";
    for (let word of para.split(/ +/)) {
      while (strWidth(word) > width) {
        if (line) (out.push(line), (line = ""));
        const chars = [...word];
        let cut = 0, cw = 0;
        while (cut < chars.length && cw + strWidth(chars[cut]) <= width) cw += strWidth(chars[cut++]);
        out.push(chars.slice(0, Math.max(1, cut)).join(""));
        word = chars.slice(Math.max(1, cut)).join("");
      }
      if (!word) continue;
      if (line && strWidth(line) + 1 + strWidth(word) > width) {
        out.push(line);
        line = word;
      } else line = line ? `${line} ${word}` : word;
    }
    out.push(line);
  }
  return out;
}

/** The deck's one easing: fast, then settling (0 → 1). */
export function easeOut(k: number): number {
  return 1 - Math.pow(1 - Math.min(1, Math.max(0, k)), 3);
}
