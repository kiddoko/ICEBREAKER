import { css, mix, type RGB } from "./color";
import { CAP_END, CAP_PAD_L, CAP_PAD_R, CAP_START } from "./grid";

/**
 * THE KEYS (0.8): every shortcut written on screen sits on a key — one key per shortcut,
 * across all its cells ("esc", "ctrl+K", "⌘⇧P" are each one wider key). The renderer draws
 * the key behind the cells (Grid.cap / capEdge), snapped to device pixels; the characters on
 * it are the font's own, drawn like all the text — as sharp as the rest of the grid.
 *
 * The deck's key (BEVELLED): a 1-device-pixel outline, a lighter top edge, a darker lip along
 * the bottom for depth, rounded ends — reaching half a cell into the spaces beside it so its
 * text has room. A theme can change any of that (KeycapLook, Theme.keys).
 *
 * Each cell draws its slice of the key (the key's full shape, clipped to the cell), so a
 * change in one cell repaints only that cell, like everything the renderer draws.
 */

const WHITE = 0xffffff, BLACK = 0x000000;

/** relative luminance, 0…1 (rough: the key's edges only need to know light from dark) */
function light(c: RGB): number {
  return (0.2126 * ((c >> 16) & 255) + 0.7152 * ((c >> 8) & 255) + 0.0722 * (c & 255)) / 255;
}

/**
 * HOW A KEY LOOKS — a theme hook (docs/THEMES.md): a theme can give its own (Theme.keys, any
 * part of it); what it leaves out is the bevelled key's. Sizes are shares of the cell, so a key
 * looks the same at every font size and on every screen; they're turned into whole device pixels.
 */
export interface KeycapLook {
  /** the corners' radius, as a share of the cell's height (0: square) */
  radius: number;
  /** the outline, in device pixels (0: none) */
  border: number;
  /** depth: the darker lip along the bottom, as a share of the cell's height (0: flat) */
  lip: number;
  /** the lighter line along the top edge, in device pixels (0: none) */
  shine: number;
  /** how far a key reaches into the spaces beside it, as a share of a cell's width */
  reach: number;
  /** room above and below the key, as shares of the cell's height */
  top: number;
  bottom: number;
  /** the key's face: null = from the theme's colours (a raised tone of the panel: ui/ui.ts keyFace) */
  face: RGB | null;
  /** its text in bold */
  bold: boolean;
}

/** the deck's keys: bevelled (the user's choice, 0.8) */
export const BEVELLED: KeycapLook = { radius: 0.17, border: 1, lip: 0.12, shine: 1, reach: 0.42, top: 0.1, bottom: 0.06, face: null, bold: true };

/** A theme's key look: its own parts over the bevelled key (numbers kept in sane bounds). */
export function keycapLook(own?: Partial<KeycapLook>): KeycapLook {
  const k = { ...BEVELLED, ...(own ?? {}) };
  const clamp = (v: number, lo: number, hi: number, d: number) => (Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d);
  return {
    ...k,
    radius: clamp(k.radius, 0, 0.5, BEVELLED.radius),
    border: Math.round(clamp(k.border, 0, 4, BEVELLED.border)),
    lip: clamp(k.lip, 0, 0.3, BEVELLED.lip),
    shine: Math.round(clamp(k.shine, 0, 3, BEVELLED.shine)),
    reach: clamp(k.reach, 0, 0.5, BEVELLED.reach),
    top: clamp(k.top, 0, 0.3, BEVELLED.top),
    bottom: clamp(k.bottom, 0, 0.3, BEVELLED.bottom),
  };
}

/** The key's geometry in a cell of `cw` × `ch` device pixels: whole pixels, the same at every size. */
export function capGeometry(cw: number, ch: number, look: KeycapLook = BEVELLED): { top: number; bottom: number; inset: number; radius: number; lip: number; pad: number } {
  return {
    // how far a key reaches into the space beside it
    pad: Math.round(cw * look.reach),
    top: Math.max(look.top ? 1 : 0, Math.round(ch * look.top)),
    bottom: Math.max(look.bottom ? 1 : 0, Math.round(ch * look.bottom)),
    inset: Math.max(1, Math.round(cw * 0.08)),
    radius: Math.round(Math.min(ch * look.radius, cw * 0.4)),
    lip: look.lip ? Math.max(2, Math.round(ch * look.lip)) : 0,
  };
}

/** The colours of a key with face `face`: its outline, its lip, its top edge. */
export function capColors(face: RGB): { border: RGB; lip: RGB; shine: RGB } {
  const dark = light(face) < 0.5;
  return { border: mix(face, BLACK, 0.6), lip: mix(face, BLACK, 0.48), shine: mix(face, WHITE, dark ? 0.38 : 0.6) };
}

function roundRect(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, r: number): void {
  r = Math.max(0, Math.min(r, (x1 - x0) / 2, (y1 - y0) / 2));
  ctx.beginPath();
  ctx.moveTo(x0 + r, y0);
  ctx.arcTo(x1, y0, x1, y1, r);
  ctx.arcTo(x1, y1, x0, y1, r);
  ctx.arcTo(x0, y1, x0, y0, r);
  ctx.arcTo(x0, y0, x1, y0, r);
  ctx.closePath();
  ctx.fill();
}

/**
 * Draw cell (x, y, cw, ch)'s slice of a key (device pixels): `edge` says whether the key starts
 * (CAP_START) and / or ends (CAP_END) in this cell, or the cell is the space beside it it reaches
 * into (CAP_PAD_L / CAP_PAD_R). The text on it is drawn afterwards, by the caller.
 */
export function drawCapSlice(ctx: CanvasRenderingContext2D, x: number, y: number, cw: number, ch: number, face: RGB, edge: number, look: KeycapLook = BEVELLED): void {
  const g = capGeometry(cw, ch, look);
  const col = capColors(face);
  // the key's whole shape: past the cell where the key goes on, clipped to the cell
  const over = g.radius + 2;
  // a key starts at its first cell (a pixel in), or part of a cell into the space before it
  const x0 = edge & CAP_PAD_L ? x + cw - g.pad : edge & CAP_START ? x + g.inset : x - over;
  const x1 = edge & CAP_PAD_R ? x + g.pad : edge & CAP_END ? x + cw - g.inset : x + cw + over;
  if (x1 <= x0) return;
  const y0 = y + g.top, y1 = y + ch - g.bottom;
  const b = look.border;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, cw, ch);
  ctx.clip();
  // the outline: the whole shape; then what's inside it, `border` device pixels in
  if (b) {
    ctx.fillStyle = css(col.border);
    roundRect(ctx, x0, y0, x1, y1, g.radius);
  }
  const r = Math.max(0, g.radius - b);
  // depth: the lip shows along the bottom, the face sits above it, a lighter line on its top edge
  if (g.lip) {
    ctx.fillStyle = css(col.lip);
    roundRect(ctx, x0 + b, y0 + b, x1 - b, y1 - b, r);
  }
  ctx.fillStyle = css(face);
  roundRect(ctx, x0 + b, y0 + b, x1 - b, y1 - b - g.lip, r);
  if (look.shine) {
    ctx.fillStyle = css(col.shine);
    ctx.fillRect(x0 + Math.max(r, 1), y0 + b, Math.max(0, x1 - x0 - 2 * Math.max(r, 1)), look.shine);
  }
  ctx.restore();
}
