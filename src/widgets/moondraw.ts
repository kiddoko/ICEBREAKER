/**
 * THE MOON, DRAWN: a shaded disc in half blocks (▀ — two pixels a cell, the top one in
 * the glyph's colour, the bottom one in the cell's background), lit from the side the
 * sun is on for that day, with its seas (the dark maria), a grain of craters, a slightly
 * darker rim, and the faint earthshine on its night side.
 *
 * Any size: the MOON page draws it big, its widget small, the calendar tiny; under two
 * rows it's a glyph (moonphase.ts phaseGlyph).
 */
import { channels, mix, type RGB } from "../core/color";
import type { Rect } from "../core/grid";
import type { UI } from "../ui/ui";
import { moonPhase, phaseGlyph } from "./moonphase";

/** the seas, as soft ellipses on the face we see (x right, y down, the disc is -1…1): x, y, rx, ry, how dark */
const MARIA: [number, number, number, number, number][] = [
  [-0.55, -0.02, 0.3, 0.45, 0.32], // Oceanus Procellarum
  [-0.3, -0.45, 0.28, 0.2, 0.38], // Mare Imbrium
  [0.15, -0.38, 0.15, 0.13, 0.4], // Mare Serenitatis
  [0.3, -0.08, 0.2, 0.16, 0.38], // Mare Tranquillitatis
  [0.68, -0.3, 0.1, 0.09, 0.42], // Mare Crisium
  [0.55, 0.17, 0.12, 0.15, 0.32], // Mare Fecunditatis
  [-0.18, 0.36, 0.2, 0.14, 0.28], // Mare Nubium
  [-0.5, 0.36, 0.1, 0.09, 0.32], // Mare Humorum
];

/** a smooth pseudo-random value 0…1 at (x, y) (value noise) */
function noise(x: number, y: number): number {
  const h = (i: number, j: number) => {
    const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453;
    return s - Math.floor(s);
  };
  const i = Math.floor(x), j = Math.floor(y);
  const fx = x - i, fy = y - j;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  return h(i, j) * (1 - u) * (1 - v) + h(i + 1, j) * u * (1 - v) + h(i, j + 1) * (1 - u) * v + h(i + 1, j + 1) * u * v;
}

/** how bright the ground is at (x, y) on the face, about 0.55…1.05 */
function albedo(x: number, y: number): number {
  let dark = 0;
  for (const [ex, ey, rx, ry, d] of MARIA) {
    const e = ((x - ex) / rx) ** 2 + ((y - ey) / ry) ** 2;
    if (e < 1) dark = Math.max(dark, d * (1 - e) ** 0.6);
  }
  // Tycho, the bright crater at the bottom
  const ty = (x + 0.12) ** 2 + (y - 0.72) ** 2;
  const bright = ty < 0.004 ? 0.15 : 0;
  const grain = (noise(x * 7 + 3, y * 7) - 0.5) * 0.1 + (noise(x * 19, y * 19 + 5) - 0.5) * 0.08;
  return 1 - dark + bright + grain;
}

/** a light theme (paper, e-ink…): the page is lighter than its text */
function lightTheme(ui: UI): boolean {
  const [r, g, b] = channels(ui.c.bg);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 128;
}

/** the moon's colour where fully lit (a warm grey, a touch of the theme) */
function litTone(ui: UI): RGB {
  return lightTheme(ui) ? 0xf3eddf : mix(mix(ui.c.fg, 0xf4ecd8, 0.55), ui.c.warning, 0.08);
}

/** the moon's colour for words about it (the theme's text on a light theme, where a pale grey wouldn't read) */
export function moonTone(ui: UI): RGB {
  return lightTheme(ui) ? ui.c.fg : litTone(ui);
}

/** Where the moon goes in `r` (as big as fits, centred): its cells. */
export function moonBox(ui: UI, r: Rect): Rect {
  const a = ui.cellAspect;
  const size = Math.min(r.w * a, r.h);
  const w = Math.min(r.w, Math.ceil(size / a)), h = Math.min(r.h, Math.ceil(size));
  return { x: r.x + Math.floor((r.w - w) / 2), y: r.y + Math.floor((r.h - h) / 2), w, h };
}

/**
 * Draw the moon as it is at time `t` in `r`, as big as fits and centred.
 * `earthshine`: how much of the night side shows (0 none, ~0.08 a faint disc).
 */
export function drawMoon(ui: UI, r: Rect, t = Date.now(), o: { earthshine?: number } = {}): void {
  const c = ui.c;
  if (r.w < 1 || r.h < 1) return;
  // too small to draw: the glyph, in the middle
  if (r.h < 2 || r.w < 3) return void ui.textCenter(r, r.y + Math.floor((r.h - 1) / 2), phaseGlyph(t), { fg: moonTone(ui) });
  const a = ui.cellAspect;
  // the disc, in cell heights: as big as the rect allows, centred
  const R = Math.min(r.w * a, r.h) / 2;
  const { x: x0, y: y0, w: cols, h: rows } = moonBox(ui, r);
  const cx = (cols * a) / 2, cy = rows / 2;
  const th = moonPhase(t) * 2 * Math.PI;
  const sx = Math.sin(th), sz = -Math.cos(th);
  const shine = o.earthshine ?? 0.07;
  // a light theme: the moon in its own night (a dark disc, its lit part bright) — drawn on the
  // page's light, the night side vanished and the lit side came out darker than it
  const tone = litTone(ui);
  const bg = lightTheme(ui) ? mix(c.bg, 0x14161c, 0.9) : c.bg;
  /** a pixel's colour, or null outside the disc */
  const px = (x: number, y: number): RGB | null => {
    const nx = (x - cx) / R, ny = (y - cy) / R;
    const d2 = nx * nx + ny * ny;
    if (d2 > 1) return null;
    const nz = Math.sqrt(1 - d2);
    const light = nx * sx + nz * sz;
    // the terminator: soft over a few pixels
    const lit = Math.min(1, Math.max(0, (light + 0.04) / 0.16));
    const b = albedo(nx, ny) * Math.max(shine, lit * (0.6 + 0.4 * Math.max(0, light))) * (0.82 + 0.18 * nz);
    // the rim fades into the night a little (no hard staircase at the edge)
    const edge = Math.min(1, (1 - Math.sqrt(d2)) * R * 4);
    return mix(bg, tone, Math.max(0, Math.min(1, b)) * (0.35 + 0.65 * edge));
  };
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x = (col + 0.5) * a;
      const top = px(x, row + 0.25), bot = px(x, row + 0.75);
      if (!top && !bot) continue;
      if (top && bot) ui.text(x0 + col, y0 + row, "▀", { fg: top, bg: bot });
      else if (top) ui.text(x0 + col, y0 + row, "▀", { fg: top });
      else ui.text(x0 + col, y0 + row, "▄", { fg: bot! });
    }
  }
}
