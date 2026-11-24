import type { Rect } from "../../core/grid";

/**
 * THE TOP ROW (0.8, docs/FRAMES.md): there is no menu bar any more. The window's first row is
 * the frames' tabs, with the deck's menu "◆ icebreaker ▾" in its left corner and "uplink ■ │
 * date time" in its right corner, whatever the frames' arrangement. A frame whose header
 * (its tabs' row) is on that row keeps its tabs between the two. Pure: the tests check it.
 */

/** the corners' forms for a window `cols` wide: the full ones, or "◆ ▾" and "■ 19:07" */
export function topRowForms(cols: number): { logoCompact: boolean; clockNarrow: boolean } {
  // one row is shared by the menu, the tabs and the clock: they fold before the tabs do
  return { logoCompact: cols < 170, clockNarrow: cols < 150 };
}

/** a frame under a corner keeps at least this many header cells, or the corner takes its short form */
export const MIN_HEADER = 16;

/**
 * The corners for this frame: the forms the window's width allows, shortened further when a
 * narrow frame sits under one (the tree moved to the right, under the clock). `widths` gives
 * each form's width in cells; `tops` are the frames whose header is on row `y`.
 */
export function fitCorners(cols: number, y: number, tops: Rect[], widths: { logo: [number, number]; clock: [number, number] }): TopCorners {
  const f = topRowForms(cols);
  const corners = (lc: boolean, cn: boolean) => ({ y, logoEnd: widths.logo[lc ? 1 : 0], clockStart: cols - widths.clock[cn ? 1 : 0], logoCompact: lc, clockNarrow: cn });
  const room = (c: TopCorners, edge: "left" | "right") => {
    const r = tops.find((t) => t.y === y && (edge === "left" ? t.x < c.logoEnd + GAP : t.x + t.w > c.clockStart - GAP));
    if (!r) return Infinity;
    const s = headerSpan(r, c);
    return s.xEnd - s.x;
  };
  let lc = f.logoCompact, cn = f.clockNarrow;
  if (!lc && room(corners(lc, cn), "left") < MIN_HEADER) lc = true;
  if (!cn && room(corners(lc, cn), "right") < MIN_HEADER) cn = true;
  return corners(lc, cn);
}

/** what the two corners hold on the top row `y`: columns [0, logoEnd) and [clockStart, cols) */
export interface TopCorners {
  y: number;
  logoEnd: number;
  clockStart: number;
  /** their short forms: "◆ ▾", "■ 19:07" */
  logoCompact?: boolean;
  clockNarrow?: boolean;
}

/** one cell from a frame's corner, like every frame's tabs */
const INSET = 1;
/** one cell between a corner and the tabs beside it */
const GAP = 1;

/**
 * The columns where frame `r` can draw its header (its label, its tabs, its buttons): its own
 * width less one cell each side, and clear of the corners when its header is on the top row.
 */
export function headerSpan(r: Rect, top: TopCorners): { x: number; xEnd: number } {
  let x = r.x + INSET;
  let xEnd = r.x + r.w - INSET;
  if (r.y === top.y) {
    if (x < top.logoEnd + GAP) x = Math.min(xEnd, top.logoEnd + GAP);
    if (xEnd > top.clockStart - GAP) xEnd = Math.max(x, top.clockStart - GAP);
  }
  return { x, xEnd };
}

/**
 * A folded frame's strip (one cell wide, its name down it) that starts on the top row under a
 * corner: it starts one row lower, so the corner doesn't hide its first letter.
 */
export function stripClear(r: Rect, top: TopCorners): Rect {
  const under = r.y === top.y && (r.x < top.logoEnd || r.x + r.w > top.clockStart);
  return under && r.h > 1 ? { ...r, y: r.y + 1, h: r.h - 1 } : r;
}
