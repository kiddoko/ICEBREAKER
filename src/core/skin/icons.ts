/**
 * ICON IDS (themes v2, milestone 1): the deck asks for an icon by a stable id —
 * `icon("file.python")` — never writes the glyph itself, so a theme can swap any of them later
 * (the `icons` component, milestone 3; the same idea as VS Code's product icon ids). The glyphs
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

/** the glyph for an icon id (today the deck's; a theme's once the icons component lands) */
export function icon(id: IconId): string {
  return ICONS[id];
}
