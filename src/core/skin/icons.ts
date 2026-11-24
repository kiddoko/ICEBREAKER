/**
 * ICON IDS (themes v2, milestone 1): the deck asks for an icon by a stable id —
 * `icon("file.python")` — never writes the glyph itself, so a theme can swap any of them
 * (the `icons` component, milestone 3: the same idea as VS Code's product icon ids). The glyphs
 * here are the deck's own, unchanged. Add an id here before drawing a new icon.
 */
export const ICONS = {
  "file.folder": "▸",
  "file.note": "≡",
  "file.python": "∿",
  "file.js": "ʝ",
  "file.script": "❯",
  "file.code": "λ",
  "file.config": "⚙",
  "file.table": "▥",
  "file.web": "◇",
  "file.text": "≡",
  "file.image": "▣",
  "file.pdf": "▤",
  "file.audio": "♪",
  "file.video": "▶",
  "file.archive": "▦",
  "file.canvas": "◫",
  "file.other": "◦",
} as const;

export type IconId = keyof typeof ICONS;

/** the active theme's glyphs ([icons], core/skin/parts.ts), set by the deck when the theme changes */
let current: Partial<Record<IconId, string>> = {};
export function setIconGlyphs(glyphs: Partial<Record<IconId, string>>): void {
  current = glyphs;
}

/** the glyph for an icon id: the theme's ([icons]), else the deck's */
export function icon(id: IconId): string {
  return current[id] ?? ICONS[id];
}
