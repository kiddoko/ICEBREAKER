import { mix } from "../core/color";
import type { Rect } from "../core/grid";
import { dots } from "./dots";
import type { UI } from "./ui";

/**
 * THE perspective floor under a ring of things (NEXUS, MODULES): a horizon line
 * and a fine grid of braille dots — rails converging on the vanishing point,
 * cross lines rolling toward you as `travel` grows. Braille draws thin
 * continuous lines (2×4 dots a cell), so it moves smoothly instead of jumping a
 * whole cell at a time. Quiet on purpose: it's the stage, not the show.
 *
 *   r        the floor, from the horizon line (r.y) down
 *   cx       the vanishing point's column
 *   travel   how far you've moved (the ring's position, plus any drift)
 */
export function perspectiveFloor(ui: UI, r: Rect, cx: number, travel: number): void {
  const c = ui.c;
  ui.hline(r.x, r.y, r.w, { fg: mix(c.bg, c.accent, 0.4) }, "─");
  const depthRows = Math.max(1, r.h - 1);
  const floorR = { x: r.x, y: r.y + 1, w: r.w, h: depthRows };
  const A = ui.cellAspect;
  const vx = (cx - r.x) * A; // vanishing point x, in cell-height units
  const spacing = Math.max(2.5, (r.w * A) / 16); // rail spacing at the bottom edge
  const near = mix(c.bg, c.accent, 0.36), far = mix(c.bg, c.accent, 0.14);
  dots(ui, floorR, [far, near], (X, Y) => {
    const k = (Y + 0.5) / (depthRows + 0.5); // 0 at the horizon → 1 at the bottom
    if (k <= 0.02) return 0;
    const off = (X - vx) / (spacing * k);
    const rail = Math.abs(off - Math.round(off)) * spacing * k < 0.07 + k * 0.05;
    const z = 1 / k + travel * 3;
    const cross = k > 0.08 && Math.abs(z - Math.round(z)) < Math.min(0.12, 0.022 / k);
    if (!rail && !cross) return 0;
    return k > 0.45 ? 2 : 1;
  });
}
