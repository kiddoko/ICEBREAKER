import { BOLD, type Rect } from "./grid";
import { hex, mix, type RGB } from "./color";
import type { UI } from "../ui/ui";

/**
 * Profile icons: little pixel-art faces (5×3 characters) and single glyphs,
 * in a colour of your choice. Yours is in settings (user.avatar); the login
 * screen, Settings → YOU and `whoami` show it, and the chat will use it.
 *
 *   avatar                 the picker
 *   avatar <id> [colour]   e.g. avatar visor cyan
 */
export interface Avatar {
  id: string;
  name: string;
  /** 3 lines of 5 columns (pixel art), or one glyph */
  art: string[] | string;
}

export const AVATARS: Avatar[] = [
  { id: "visor", name: "visor", art: ["▗▄▄▄▖", "▐▀▀▀▌", "▝▄▄▄▘"] },
  { id: "netrunner", name: "netrunner", art: ["┌▄▄▄┐", "│▓▓▓│", "└┬─┬┘"] },
  { id: "hood", name: "hood", art: [" ▄▀▄ ", "▐ ▪ ▌", "▐▄▄▄▌"] },
  { id: "robot", name: "robot", art: ["╭─┴─╮", "│◉ ◉│", "╰┬─┬╯"] },
  { id: "skull", name: "skull", art: ["▄███▄", "█▀█▀█", " ▀▀▀ "] },
  { id: "alien", name: "alien", art: ["▗▄▄▄▖", "▐◣ ◢▌", " ▝▀▘ "] },
  { id: "cat", name: "cat", art: ["▲   ▲", "◕ ᴥ ◕", " ─── "] },
  { id: "ghost", name: "ghost", art: ["▄▀▀▀▄", "█ ▪ ▪", "▀▄▀▄▀"] },
  { id: "mask", name: "mask", art: ["▄▄▄▄▄", "▀▄ ▄▀", " ▀▀▀ "] },
  { id: "oni", name: "oni", art: ["▲▄▄▄▲", "█◥ ◤█", "▀▀▼▀▀"] },
  { id: "drone", name: "drone", art: ["─┬─┬─", " ▐◎▌ ", "─┴─┴─"] },
  { id: "eye", name: "eye", art: [" ▄▄▄ ", "◀ ◉ ▶", " ▀▀▀ "] },
  ...["☠", "⚡", "♞", "◆", "✦", "λ", "⌬", "☢", "☾", "★", "♥", "∞", "Ω", "▲", "◎", "⚙", "⛧", "☯", "♠", "❖"].map((g) => ({ id: g, name: g, art: g })),
];

/** The colours an icon can wear: the theme's accent, or the tag colours. */
export const AVATAR_COLORS: Record<string, string> = {
  accent: "",
  red: "#ff4d5e",
  orange: "#ff9a3c",
  yellow: "#ffd84a",
  green: "#5be37d",
  cyan: "#3ee6e6",
  blue: "#4d8dff",
  purple: "#a66bff",
  pink: "#ff6bc8",
  white: "#e8e8f0",
};

export const avatarOf = (id: string | undefined): Avatar => AVATARS.find((a) => a.id === id) ?? AVATARS[0];
export const avatarRGB = (ui: UI, color: string | undefined): RGB => (color && AVATAR_COLORS[color] ? hex(AVATAR_COLORS[color]) : ui.c.accent);

/** One character: for a line of text (the chat, a list). */
export function avatarGlyph(a: Avatar): string {
  if (typeof a.art === "string") return a.art;
  return { visor: "▣", netrunner: "▓", hood: "▲", robot: "◉", skull: "☠", alien: "◣", cat: "ᴥ", ghost: "▪", mask: "▼", oni: "◥", drone: "◎", eye: "◉" }[a.id] ?? "◆";
}

/** The 5×3 picture, centred in `r` (a glyph sits in a little frame). */
export function drawAvatar(ui: UI, r: Rect, a: Avatar, color: RGB, opts: { bg?: RGB; dim?: boolean } = {}): void {
  const c = ui.c;
  const fg = opts.dim ? mix(color, c.bg, 0.5) : color;
  const x = r.x + Math.floor((r.w - 5) / 2);
  const y = r.y + Math.floor((r.h - 3) / 2);
  const bg = opts.bg !== undefined ? { bg: opts.bg } : {};
  if (typeof a.art === "string") {
    const edge = mix(fg, c.bg, 0.55);
    ui.text(x, y, "┌───┐", { fg: edge, ...bg });
    ui.text(x, y + 1, "│", { fg: edge, ...bg });
    ui.text(x + 2, y + 1, a.art, { fg, attrs: BOLD, ...bg });
    ui.text(x + 4, y + 1, "│", { fg: edge, ...bg });
    ui.text(x, y + 2, "└───┘", { fg: edge, ...bg });
    return;
  }
  a.art.forEach((line, i) => ui.text(x, y + i, line, { fg, attrs: BOLD, ...bg }));
}
