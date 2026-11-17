import { mix, NONE, type RGB } from "../core/color";
import type { Rect } from "../core/grid";
import type { UI } from "../ui/ui";

/**
 * The slowly drifting "data fog" behind the panels: value noise sampled at
 * every cell, mapped to a ramp of glyphs. Runs at ~12fps — it's ambience,
 * not an action scene — so it costs almost nothing.
 */
const RAMP = [" ", " ", " ", "·", "·", ":", "∙", "+", "×", "◇"];
const FPS = 12;

export function drawAmbient(ui: UI, r: Rect, intensity = 1, color: RGB = ui.c.ambient, accent: RGB = ui.c.accent, seconds = ui.now / 1000): void {
  const t = seconds;
  const dim = color;
  const bright = mix(color, accent, 0.35);
  for (let y = r.y; y < r.y + r.h; y++) {
    for (let x = r.x; x < r.x + r.w; x++) {
      const n = fbm(x * 0.09, y * 0.18 - t * 0.12, t * 0.08);
      const v = Math.max(0, Math.min(0.999, (n - 0.35) * 1.9 * intensity));
      const ch = RAMP[Math.floor(v * RAMP.length)];
      if (ch === " ") continue;
      ui.grid.set(x, y, ch.codePointAt(0)!, v > 0.85 ? bright : dim, NONE, 0);
    }
  }
  ui.animate(1000 / FPS);
}

// ── tiny value noise (no dependencies, deterministic) ─────────────────────

function hash(x: number, y: number, z: number): number {
  let h = (x * 374761393 + y * 668265263 + z * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

const smooth = (t: number) => t * t * (3 - 2 * t);

function noise3(x: number, y: number, z: number): number {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = smooth(x - xi), yf = smooth(y - yi), zf = smooth(z - zi);
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  const c = (dx: number, dy: number, dz: number) => hash(xi + dx, yi + dy, zi + dz);
  return lerp(
    lerp(lerp(c(0, 0, 0), c(1, 0, 0), xf), lerp(c(0, 1, 0), c(1, 1, 0), xf), yf),
    lerp(lerp(c(0, 0, 1), c(1, 0, 1), xf), lerp(c(0, 1, 1), c(1, 1, 1), xf), yf),
    zf,
  );
}

function fbm(x: number, y: number, z: number): number {
  return noise3(x, y, z) * 0.65 + noise3(x * 2.1, y * 2.1, z * 1.7) * 0.35;
}
