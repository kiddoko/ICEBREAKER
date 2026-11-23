/**
 * Keycaps: every keyboard shortcut written anywhere in the interface (status bars,
 * tips, the tour, settings, pop-ups, menus…) is drawn on a little key of its own,
 * so it stands out from the words around it — "⌘⇧P", "ctrl+K", "F2", "esc",
 * "←→", and the letters of hint lines like "e edit · a add · x remove".
 *
 * `ui.text` asks `keySpans(s)` where the keys are and colours them (ui/ui.ts);
 * the text keeps its width, so no layout moves. Text that is content, not
 * interface (a note, the terminal, the chat), is drawn a character at a time
 * and never matches; a whole line of typed text passes `raw: true`.
 */

const MOD = "(?:ctrl|cmd|alt|shift|option|opt|meta|maj|super|win)";
const NAMED = "(?:esc|escape|enter|return|tab|space|backspace|delete|del|up|down|left|right|pageup|pagedown|pgup|pgdn|home|end|insert|f1[0-2]|f[1-9])";
const KEY = `(?:${NAMED}|[a-z0-9]|[\\[\\]/\\\\\`,.;'=\\-]|[←→↑↓⏎⌫⌦⇥]|…)`;

const PATTERNS: RegExp[] = [
  // ctrl+shift+k · cmd+/ · alt+← · ctrl+1…9
  new RegExp(`(?<![\\w+])${MOD}(?:\\+${MOD})*\\+${KEY}(?:…[0-9])?(?![\\w+])`, "gi"),
  // ⌘⇧P · ⌘/ · ⌥⌘← · ⇧F10 · ⌘1…9 · ⇧⇧ (shift twice)
  /[⌘⇧⌥⌃]+(?:F1[0-2]|F[1-9]|Space|Esc|Tab|Enter|[A-Za-z0-9]|[[\]/\\`,.;'=\-]|[←→↑↓⏎⌫⌦⇥])?(?:…[0-9])?/g,
  // F1 … F12 on their own
  /(?<![\w+])F(?:1[0-2]|[1-9])(?![\w+])/g,
  // the named keys people write in hints
  // the named keys people write in hints: lowercase always; capitalised, not before a proper noun or
  // an article — then it's a word (« Space Mono », « Delete the account? »)
  /(?<![\w+])(?:esc|échap|enter|entrée|del|suppr|space|backspace|pgup|pgdn)(?![\w+])/g,
  /(?<![\w+])(?:Esc|Échap|Enter|Entrée|Delete|Del|Suppr|Space|Backspace|Tab|PgUp|PgDn)(?![\w+])(?!\s+(?:\p{Lu}\p{Ll}|the\b|a\b|an\b|this\b|that\b|all\b|names?\b|le\b|la\b|les\b|un\b|une\b|ce\b|cette\b))/gu,
  // arrows as keys: "←→ choose", "↑↓" — not the arrows of data ("↑08:05", "↓9°", "17 km/h ↗")
  /(?<![\p{L}\d)]\s)[←↑↓→]{1,4}(?![\d°%.,:+\-…])|[⏎⌫⌦⇥]/gu,
  // hint lines: "e edit · a add · [ ] pages" — a letter key at the start of a · segment; "a" only
  // before the verb it runs ("a full path…" is the article: it was drawn as a key)
  /(?:^|(?<=·\s))(?:[aA](?=\s+(?:add|adds|ajouter|ajoute|archive|ask)\b)|[b-zB-Z]|tab|\[ \]|[[\]/?:])(?=\s+\p{L})/gu,
];

const cache = new Map<string, [number, number][]>();

/** Where the keys are in `s`, as [start, end) ranges over its code points. Cached. */
export function keySpans(s: string): [number, number][] {
  const hit = cache.get(s);
  if (hit) return hit;
  const spans: [number, number][] = [];
  // quick no: nothing that can start a key — or one arrow drawn on its own (a data icon: ↑ 13°)
  if (s.length < 1 || /^\s*[←↑↓→]\s*$/.test(s) || !/[⌘⇧⌥⌃⏎⌫⌦⇥←↑↓→+·]|F[1-9]|esc|Esc|enter|Enter|Entrée|entrée|Échap|échap|del|Del|Suppr|suppr|space|Space|Tab|ackspace|pg[UD]|Pg[UD]/.test(s)) {
    remember(s, spans);
    return spans;
  }
  // regex indices are UTF-16; the drawing walks code points
  const toCp = cpIndex(s);
  for (const re of PATTERNS) {
    re.lastIndex = 0;
    for (const m of s.matchAll(re)) {
      if (!m[0]) continue;
      const a = toCp[m.index!], b = toCp[m.index! + m[0].length];
      if (!spans.some(([x, y]) => a < y && x < b)) spans.push([a, b]);
    }
  }
  spans.sort((p, q) => p[0] - q[0]);
  remember(s, spans);
  return spans;
}

function remember(s: string, spans: [number, number][]): void {
  if (cache.size > 4000) cache.clear();
  cache.set(s, spans);
}

/** UTF-16 index → code point index (one entry per UTF-16 unit, plus the end). */
function cpIndex(s: string): number[] {
  const out: number[] = [];
  let cp = 0;
  for (let i = 0; i < s.length; i++) {
    out.push(cp);
    const c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) {
      out.push(cp);
      i++;
    }
    cp++;
  }
  out.push(cp);
  return out;
}

/** The keys of `s` as text, for tests and debugging: "e edit · ⌘K menu" → ["e", "⌘K"]. */
export function keysIn(s: string): string[] {
  const chars = [...s];
  return keySpans(s).map(([a, b]) => chars.slice(a, b).join(""));
}
