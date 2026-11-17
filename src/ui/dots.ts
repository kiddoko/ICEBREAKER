import type { RGB } from "../core/color";
import type { Rect } from "../core/grid";
import type { UI } from "./ui";

/**
 * Braille "pixel" drawing with the real cell shape taken into account.
 *
 * A braille glyph has 2×4 dots, but a cell is not twice as tall as it is wide
 * (it's closer to 1:1.8), so a circle drawn in raw dot coordinates comes out
 * as an egg. `dots()` hands your callback physical coordinates instead, in
 * units of one cell *height*: x goes 0 → w·aspect, y goes 0 → h. A circle in
 * those units is round on screen.
 *
 * The callback returns a palette index: 0 = dot off, 1+ = on with that color.
 * When a cell mixes colors, the highest index wins (use it for "on top").
 */
export function dots(ui: UI, r: Rect, palette: RGB[], fn: (x: number, y: number) => number): void {
  const a = ui.cellAspect;
  for (let cy = 0; cy < r.h; cy++)
    for (let cx = 0; cx < r.w; cx++) {
      let bits = 0;
      let best = 0;
      for (let dy = 0; dy < 4; dy++)
        for (let dx = 0; dx < 2; dx++) {
          const v = fn((cx + (dx + 0.5) / 2) * a, cy + (dy + 0.5) / 4);
          if (!v) continue;
          bits |= BIT[dy][dx];
          if (v > best) best = v;
        }
      if (bits) ui.text(r.x + cx, r.y + cy, String.fromCodePoint(0x2800 + bits), { fg: palette[Math.min(palette.length, best) - 1] });
    }
}

const BIT = [[0x1, 0x8], [0x2, 0x10], [0x4, 0x20], [0x40, 0x80]];

/** Cells needed for a shape `size` cell-heights wide. */
export function cellsFor(ui: UI, size: number): number {
  return Math.ceil(size / ui.cellAspect);
}

/* ─────────── 5×7 dot-matrix digits (LED style) ───────────
 * Each bitmap pixel is one braille dot (or s×s dots at scale s), so a digit
 * is 3 cells × 2 rows at scale 1: big enough to read across the room, small
 * enough to sit in a card without shouting. */

const FONT: Record<string, string[]> = {
  "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
  "3": ["11111", "00010", "00100", "00010", "00001", "10001", "01110"],
  "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  "5": ["11111", "10000", "11110", "00001", "00001", "10001", "01110"],
  "6": ["00110", "01000", "10000", "11110", "10001", "10001", "01110"],
  "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  "9": ["01110", "10001", "10001", "01111", "00001", "00010", "01100"],
  ":": ["0", "0", "1", "0", "1", "0", "0"],
  " ": ["0", "0", "0", "0", "0", "0", "0"],
  "-": ["00000", "00000", "00000", "11111", "00000", "00000", "00000"],
  "°": ["0110", "1001", "1001", "0110", "0000", "0000", "0000"],
};

function layout(s: string, scale: number): { glyph: string[]; x: number }[] {
  let x = 0;
  return [...s].map((ch) => {
    const glyph = FONT[ch] ?? FONT[" "];
    const at = { glyph, x };
    x += (glyph[0].length + 1) * scale;
    return at;
  });
}

/** Size in cells of `s` drawn with matrixText at `scale`. */
export function matrixSize(s: string, scale = 1): { w: number; h: number } {
  const l = layout(s, scale);
  const last = l[l.length - 1];
  const dotsW = last ? last.x + last.glyph[0].length * scale : 0;
  return { w: Math.ceil(dotsW / 2), h: Math.ceil((7 * scale) / 4) };
}

/** Largest scale (≤ max) at which `s` fits in w×h cells, or 0. */
export function fitMatrix(s: string, w: number, h: number, max = 2): number {
  for (let k = max; k >= 1; k--) {
    const d = matrixSize(s, k);
    if (d.w <= w && d.h <= h) return k;
  }
  return 0;
}

/** Draw `s` as dot-matrix digits; `color(row)` lets you shade top → bottom. */
export function matrixText(ui: UI, x: number, y: number, s: string, scale: number, color: (row: number, rows: number) => RGB): void {
  const l = layout(s, scale);
  const { w, h } = matrixSize(s, scale);
  const on = (px: number, py: number): boolean => {
    const gy = Math.floor(py / scale);
    if (gy >= 7) return false;
    for (const g of l) {
      const gx = Math.floor((px - g.x) / scale);
      if (px >= g.x && gx < g.glyph[0].length) return g.glyph[gy][gx] === "1";
    }
    return false;
  };
  for (let cy = 0; cy < h; cy++)
    for (let cx = 0; cx < w; cx++) {
      let bits = 0;
      for (let dy = 0; dy < 4; dy++) for (let dx = 0; dx < 2; dx++) if (on(cx * 2 + dx, cy * 4 + dy)) bits |= BIT[dy][dx];
      if (bits) ui.text(x + cx, y + cy, String.fromCodePoint(0x2800 + bits), { fg: color(cy, h) });
    }
}
