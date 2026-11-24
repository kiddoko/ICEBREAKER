/**
 * WHAT A SHORTCUT LOOKS LIKE ON SCREEN (0.8): ui/keycaps.ts finds the keys in a text
 * ("⌘K menu", "esc close"); this says what to draw in their cells —
 *
 *   - on the keyboard: its text on a key (core/keycap.ts, drawn by the renderer behind the text);
 *   - while a pad is used (deck.padInput: a pad button pressed, until a keyboard key):
 *     the button of the pad you hold that does the same thing (core/padglyphs.ts: A on
 *     an Xbox pad, ✕ on a PlayStation one, the right button on a Nintendo one) — a key
 *     the pad has no button for stays a key.
 *
 * Always exactly as many cells as the text it replaces: no layout moves when you switch.
 */
import type { RGB } from "../core/color";
import type { Action } from "../core/input";
import { padButtonFor } from "../core/gamepad";
import { padIcon, type PadButton, type PadKind } from "../core/padglyphs";
import { strWidth } from "../core/unicode";

/** the modifiers as written ("⌘", "cmd", "⇧", "maj"…) → one name each */
const MODS: Record<string, string> = {
  "⌘": "ctrl", "⌃": "ctrl", cmd: "ctrl", ctrl: "ctrl", meta: "ctrl",
  "⇧": "shift", shift: "shift", maj: "shift",
  "⌥": "alt", alt: "alt", option: "alt", opt: "alt",
};
/** the keys as written → one name each */
const KEYS: Record<string, string> = {
  enter: "enter", return: "enter", "⏎": "enter", entrée: "enter", entree: "enter",
  esc: "esc", escape: "esc", échap: "esc", echap: "esc",
  "↑": "up", "↓": "down", "←": "left", "→": "right", up: "up", down: "down", left: "left", right: "right",
  pgup: "pageup", pageup: "pageup", pgdn: "pagedown", pagedown: "pagedown",
  tab: "tab", "⇥": "tab",
};

/** what a key does, by its name with its modifiers ("ctrl+k") — only the ones a pad button also does */
const DOES: Record<string, Action | "dpad"> = {
  enter: "confirm", esc: "back",
  up: "up", down: "down", left: "left", right: "right",
  pageup: "page-up", pagedown: "page-down",
  "ctrl+k": "palette", "shift+shift": "palette",
  "ctrl+tab": "tab-next", "ctrl+shift+tab": "tab-prev",
  f10: "menu",
};

/** "⌘K" → "ctrl+k", "ctrl+shift+Tab" → "ctrl+shift+tab", "←→" → "arrows", "⇧⇧" → "shift+shift" */
function combo(written: string): string {
  const s = written.trim().toLowerCase();
  // two or more arrows: the cross
  if (/^[←→↑↓]{2,4}$/.test(s)) return "arrows";
  if (s === "⇧⇧") return "shift+shift";
  const parts: string[] = [];
  let rest = s;
  // the symbols in front: ⌘⇧P
  while (rest && MODS[rest[0]] && rest.length > 1) {
    parts.push(MODS[rest[0]]);
    rest = rest.slice(1);
  }
  const words = rest.split("+").filter(Boolean);
  const key = words.pop() ?? "";
  for (const w of words) if (MODS[w]) parts.push(MODS[w]);
  const order = ["ctrl", "alt", "shift"].filter((m) => parts.includes(m));
  return [...order, KEYS[key] ?? key].join("+");
}

/** The pad button that does what this key does ("enter" → south), or null. */
export function padButtonOfKey(written: string): PadButton | null {
  const c = combo(written);
  if (c === "arrows") return "dpad";
  const a = DOES[c];
  if (!a) return null;
  return a === "dpad" ? "dpad" : padButtonFor(a);
}

const cache = new Map<string, { text: string; color: RGB | null } | null>();

/**
 * The pad's button to draw in place of the key written `written`, when `pad` (the pad in use)
 * has one that does the same — `color` is the button's own (A green…): two cells (one, smaller,
 * for a one-character key). Never wider than the key; what's left is the caller's (ui.text puts
 * it after the whole text, so no blank sits before the icon). Null: draw the key itself.
 */
export function padCells(written: string, pad: PadKind | null): { text: string; color: RGB | null } | null {
  if (!pad) return null;
  const id = `${pad}\u0000${written}`;
  if (cache.has(id)) return cache.get(id)!;
  let out: { text: string; color: RGB | null } | null = null;
  const w = strWidth(written);
  const button = padButtonOfKey(written);
  if (button) {
    const icon = padIcon(button, pad);
    if (w === 1 && icon.small) out = { text: icon.small, color: icon.color };
    else if (w >= 2 && icon.text) out = { text: icon.text, color: icon.color };
  }
  if (cache.size > 2000) cache.clear();
  cache.set(id, out);
  return out;
}
