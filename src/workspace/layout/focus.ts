import type { Rect } from "../../core/grid";

/**
 * The pane in direction `dir` from pane `from`, by where they were drawn: the nearest
 * one entirely on that side, the one sharing the most of the other axis first.
 */
export function paneToward<P extends string>(rects: Partial<Record<P, Rect>>, from: P, dir: "left" | "right" | "up" | "down"): P | null {
  const c = rects[from];
  if (!c) return null;
  let best: { p: P; overlap: number; dist: number } | null = null;
  for (const [p, r] of Object.entries(rects) as [P, Rect | undefined][]) {
    if (p === from || !r || r.w <= 0 || r.h <= 0) continue;
    const side = dir === "left" ? r.x + r.w <= c.x : dir === "right" ? r.x >= c.x + c.w : dir === "up" ? r.y + r.h <= c.y : r.y >= c.y + c.h;
    if (!side) continue;
    const across = dir === "left" || dir === "right" ? Math.min(r.y + r.h, c.y + c.h) - Math.max(r.y, c.y) : Math.min(r.x + r.w, c.x + c.w) - Math.max(r.x, c.x);
    if (across <= 0) continue;
    const dist = dir === "left" ? c.x - (r.x + r.w) : dir === "right" ? r.x - (c.x + c.w) : dir === "up" ? c.y - (r.y + r.h) : r.y - (c.y + c.h);
    if (!best || dist < best.dist || (dist === best.dist && across > best.overlap)) best = { p, overlap: across, dist };
  }
  return best?.p ?? null;
}
