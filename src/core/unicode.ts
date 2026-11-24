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
      (cp >= 0x1f000 && cp <= 0x1faff && isWideEmoji(cp)) ||
      (cp >= 0x20000 && cp <= 0x3fffd))
  ) {
    return 2;
  }
  // the symbols that are drawn as emoji (⏰ ⚡ ✅ ⛅…): 2 cells, or they get squeezed
  if (cp >= 0x231a && cp <= 0x2b55 && EMOJI_BMP.has(cp)) return 2;
  return 1;
}

/** Emoji (colour pictures) beyond the BMP: faces, objects, transport, flags… */
function isWideEmoji(cp: number): boolean {
  return (
    cp === 0x1f004 || cp === 0x1f0cf || cp === 0x1f18e ||
    (cp >= 0x1f191 && cp <= 0x1f19a) ||
    (cp >= 0x1f1e6 && cp <= 0x1f1ff) ||
    (cp >= 0x1f201 && cp <= 0x1f251) ||
    (cp >= 0x1f300 && cp <= 0x1f64f) ||
    (cp >= 0x1f680 && cp <= 0x1f6ff) ||
    (cp >= 0x1f7e0 && cp <= 0x1f7eb) ||
    (cp >= 0x1f90c && cp <= 0x1f9ff) ||
    (cp >= 0x1fa70 && cp <= 0x1faff)
  );
}

/** The BMP characters shown as emoji by default (Unicode's Emoji_Presentation). */
const EMOJI_BMP = new Set<number>(
  [
    [0x231a, 0x231b], [0x23e9, 0x23ec], [0x23f0, 0x23f0], [0x23f3, 0x23f3], [0x25fd, 0x25fe], [0x2614, 0x2615],
    [0x2648, 0x2653], [0x267f, 0x267f], [0x2693, 0x2693], [0x26a1, 0x26a1], [0x26aa, 0x26ab], [0x26bd, 0x26be],
    [0x26c4, 0x26c5], [0x26ce, 0x26ce], [0x26d4, 0x26d4], [0x26ea, 0x26ea], [0x26f2, 0x26f3], [0x26f5, 0x26f5],
    [0x26fa, 0x26fa], [0x26fd, 0x26fd], [0x2705, 0x2705], [0x270a, 0x270b], [0x2728, 0x2728], [0x274c, 0x274c],
    [0x274e, 0x274e], [0x2753, 0x2755], [0x2757, 0x2757], [0x2795, 0x2797], [0x27b0, 0x27b0], [0x27bf, 0x27bf],
    [0x2b1b, 0x2b1c], [0x2b50, 0x2b50], [0x2b55, 0x2b55],
  ].flatMap(([a, b]) => Array.from({ length: b - a + 1 }, (_, i) => a + i)),
);

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

/**
 * wrapWords, at most `n` lines: when the text needs more, the last line kept ends
 * with « … » (a cut answer must say it's cut).
 */
export function wrapLines(s: string, w: number, n: number): string[] {
  const lines = wrapWords(s, w);
  if (lines.length <= n) return lines;
  const kept = lines.slice(0, Math.max(1, n));
  kept[kept.length - 1] = truncate(`${kept[kept.length - 1]}…`, Math.max(1, w));
  return kept;
}

/**
 * `{key}` in a template replaced by `value`, the whole at most `w` wide: the value
 * (a nickname, a name) is what gets shortened with « … », never the words around it.
 * The value keeps its case.
 */
export function fillName(template: string, key: string, value: string, w: number): string {
  const tag = `{${key}}`;
  if (!template.includes(tag)) return truncate(template, w);
  const around = strWidth(template) - strWidth(tag);
  return truncate(template.split(tag).join(truncate(value, Math.max(2, w - around))), w);
}

/**
 * A line of hints ("enter open · n new note · esc back") in `w` cells: whole when it
 * fits, else its last hints are left out (they're written most useful first), so no
 * hint is ever cut in the middle (« échap r… »). One hint alone too long: cut with ….
 */
export function fitHints(s: string, w: number): string {
  if (strWidth(s) <= w) return s;
  const parts = s.split(" · ");
  while (parts.length > 1) {
    parts.pop();
    const line = parts.join(" · ");
    if (strWidth(line) <= w) return line;
  }
  return truncate(parts[0] ?? "", w);
}

/** The deck's one easing: fast, then settling (0 → 1). */
export function easeOut(k: number): number {
  return 1 - Math.pow(1 - Math.min(1, Math.max(0, k)), 3);
}
