/**
 * Key hints written the Mac way in the interface ("⌘K", "⇧⌘Z", "⌘⇧P") shown the
 * way the keyboard in front of you reads: unchanged on a Mac, "Ctrl+K",
 * "Ctrl+Shift+Z", "Ctrl+Shift+P" on Windows and Linux (the deck's ⌘ shortcuts are
 * Ctrl ones there: core/input.ts).
 *
 * t() (core/i18n.ts) passes every UI string through it, so a hint written once
 * in English or French is right on every OS. Text that names the Mac on purpose
 * ("⌘⌫ on a Mac", "⌃⌘F on macOS") is left alone. A hint that gives both forms
 * ("⌘Z / ctrl+Z") becomes one ("Ctrl+Z").
 *
 * For a key from the shortcut table ("ctrl+shift+n"), use displayKeys
 * (core/shortcuts.ts) instead.
 */
import { IS_MAC } from "./input";

const MODS: Record<string, string> = { "⌘": "Ctrl", "⌃": "Ctrl", "⌥": "Alt", "⇧": "Shift" };
const NAMED: Record<string, string> = { "⏎": "Enter", "⌫": "Backspace", "⌦": "Del", "⇥": "Tab" };
// a run of Mac modifiers with at least one of ⌘ ⌥ ⌃ (⇧⇧ alone is "shift twice": the same everywhere), then its key
const COMBO = /[⌘⌥⌃⇧]*[⌘⌥⌃][⌘⌥⌃⇧]*(F1[0-2]|F[1-9]|Space|Esc|Tab|Enter|[A-Za-z0-9]|[[\]/\\`,.;'=\-]|[←→↑↓⏎⌫⌦⇥])?(…[0-9])?/g;

const cache = new Map<string, string>();

/** "⌘K menu · ⇧⌘Z redo" → "Ctrl+K menu · Ctrl+Shift+Z redo" on Windows / Linux; as is on a Mac. */
export function osKeys(s: string, mac = IS_MAC): string {
  if (mac || !/[⌘⌥⌃]/.test(s)) return s;
  const hit = cache.get(s);
  if (hit !== undefined) return hit;
  let out = s.replace(COMBO, (m: string, key: string | undefined, range: string | undefined, at: number) => {
    // "⌘⌫ on a Mac", "(F11, ⌃⌘F on macOS)": about the Mac on purpose
    const clause = s.slice(at + m.length).split(/[·()\n;]/)[0];
    if (/\bmac(os)?\b/i.test(clause)) return m;
    const mods = new Set<string>();
    for (const ch of m.slice(0, m.length - (key?.length ?? 0) - (range?.length ?? 0))) if (MODS[ch]) mods.add(MODS[ch]);
    const parts = ["Ctrl", "Alt", "Shift"].filter((x) => mods.has(x));
    if (key) parts.push(NAMED[key] ?? (key.length === 1 ? key.toUpperCase() : key));
    return parts.join("+") + (range ?? "");
  });
  // "⌘Z / ctrl+Z" → "Ctrl+Z / ctrl+Z" → "Ctrl+Z"
  out = out.replace(/(?<![\w+])((?:Ctrl|Alt|Shift)\+\S+) \/ \1(?![\w+])/gi, "$1");
  if (cache.size > 2000) cache.clear();
  cache.set(s, out);
  return out;
}
