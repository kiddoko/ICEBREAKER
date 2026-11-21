import type { RGB } from "../core/color";
import type { UI } from "./ui";

/** A canvas of braille dots (2 × 4 per cell); several colours, one per layer, drawn by priority. */
export class Braille {
  readonly bits: Uint8Array;
  readonly owner: Int8Array;
  constructor(readonly w: number, readonly h: number) {
    this.bits = new Uint8Array(w * h);
    this.owner = new Int8Array(w * h).fill(-1);
  }
  set(px: number, py: number, layer: number): void {
    const x = Math.round(px), y = Math.round(py);
    if (x < 0 || y < 0 || x >= this.w * 2 || y >= this.h * 4) return;
    const cx = x >> 1, cy = y >> 2, sx = x & 1, sy = y & 3;
    const bit = sy < 3 ? (sx ? 3 : 0) + sy : sx ? 7 : 6;
    const i = cy * this.w + cx;
    this.bits[i] |= 1 << bit;
    if (layer > this.owner[i]) this.owner[i] = layer;
  }
  line(x0: number, y0: number, x1: number, y1: number, layer: number): void {
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
    for (let i = 0; i <= n; i++) this.set(x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n, layer);
  }
  draw(ui: UI, x: number, y: number, colors: RGB[]): void {
    for (let cy = 0; cy < this.h; cy++)
      for (let cx = 0; cx < this.w; cx++) {
        const i = cy * this.w + cx;
        if (this.bits[i]) ui.text(x + cx, y + cy, String.fromCodePoint(0x2800 + this.bits[i]), { fg: colors[Math.max(0, this.owner[i])] });
      }
  }
}

/**
 * A ring of dots (dot units: centre, radius), lit on its first `lit` fraction from the top,
 * clockwise (layer 1), the rest on layer 0 — a timer's ring, a progress dial.
 * `aspect`: how much wider a dot is than tall (2 × ui.cellAspect; 1 = square dots).
 */
export function ring(b: Braille, cx: number, cy: number, r: number, lit: number, aspect = 1, thick = 1): void {
  const steps = Math.max(24, Math.round(r * 8));
  for (let k = 0; k < steps; k++) {
    const a = (k / steps) * Math.PI * 2;
    const on = k / steps < lit ? 1 : 0;
    for (let t = 0; t < thick; t++) b.set(cx + (Math.sin(a) * (r - t * 0.8)) / aspect, cy - Math.cos(a) * (r - t * 0.8), on);
  }
}
