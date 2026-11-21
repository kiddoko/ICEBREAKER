import type { Rect } from "../../core/grid";
import type { Frame, Node, Size } from "./tree";

/**
 * THE SOLVER (docs/FRAMES.md): a layout tree and a rect → one rect per frame.
 * Pure, so the tests can prove it gives today's rects at every size.
 *
 * Along a split: the fixed children (`cells`) get their cells, the `fill` ones share
 * what's left by weight, `gap` cells between two children. When a child would end
 * below its minimum (`min`), the foldable frames among its siblings are folded away,
 * the lowest `foldOrder` first, until it fits (today: the side panel goes when the
 * page would keep less than 40 cells). Never a negative rect: when even the fixed
 * cells don't fit, they shrink, the last ones first.
 */
export interface Solved {
  rects: Map<string, Rect>;
  /** frames folded away for lack of room */
  folded: Set<string>;
}

export function solveLayout(root: Node, r: Rect): Solved {
  const out: Solved = { rects: new Map(), folded: new Set() };
  place(root, { x: r.x, y: r.y, w: Math.max(0, r.w), h: Math.max(0, r.h) }, out);
  return out;
}

/** a node's minimum along a direction (a frame's own; a split adds or takes the largest) */
function minAlong(n: Node, dir: "row" | "col", folded: Set<string>): number {
  if (n.kind === "frame") return folded.has(n.id) ? 0 : dir === "row" ? (n.min?.w ?? 0) : (n.min?.h ?? 0);
  const live = n.children.filter((c) => !gone(c, folded));
  if (n.dir === dir) return live.reduce((s, c) => s + minAlong(c, dir, folded), 0) + n.gap * Math.max(0, live.length - 1);
  return live.reduce((m, c) => Math.max(m, minAlong(c, dir, folded)), 0);
}

/** a frame folded, or a split whose frames are all folded */
function gone(n: Node, folded: Set<string>): boolean {
  return n.kind === "frame" ? folded.has(n.id) : n.children.every((c) => gone(c, folded));
}

/** Lengths along the split for each live child (sum + gaps = len, none negative). */
function share(sizes: Size[], len: number, gap: number): number[] {
  const avail = Math.max(0, len - gap * Math.max(0, sizes.length - 1));
  const fixed = sizes.map((s) => ("cells" in s ? Math.max(0, s.cells) : 0));
  let fixedSum = fixed.reduce((a, b) => a + b, 0);
  // not even the fixed cells fit: they shrink, the last ones first
  for (let i = fixed.length - 1; i >= 0 && fixedSum > avail; i--) {
    const cut = Math.min(fixed[i], fixedSum - avail);
    fixed[i] -= cut;
    fixedSum -= cut;
  }
  const room = avail - fixedSum;
  const weights = sizes.map((s) => ("fill" in s ? Math.max(0, s.fill) : 0));
  const total = weights.reduce((a, b) => a + b, 0);
  const out = sizes.map((s, i) => ("fill" in s ? 0 : fixed[i]));
  if (total > 0) {
    // largest remainder: the shares add up to the room exactly
    const exact = weights.map((w) => (room * w) / total);
    const floors = exact.map(Math.floor);
    let left = room - floors.reduce((a, b) => a + b, 0);
    const order = exact.map((e, i) => [e - floors[i], i] as const).filter(([, i]) => weights[i] > 0).sort((a, b) => b[0] - a[0]);
    for (const [, i] of order) if (left > 0) (floors[i] += 1), left--;
    weights.forEach((w, i) => w > 0 && (out[i] = floors[i]));
  }
  return out;
}

function place(n: Node, r: Rect, out: Solved): void {
  if (n.kind === "frame") {
    if (!out.folded.has(n.id)) out.rects.set(n.id, r);
    return;
  }
  const along = n.dir === "row" ? "w" : "h";
  const len = r[along];
  // fold foldable frames while a child ends below its minimum
  for (;;) {
    const idx = n.children.map((_, i) => i).filter((i) => !gone(n.children[i], out.folded));
    const lens = share(idx.map((i) => n.sizes[i]), len, n.gap);
    const short = idx.some((i, k) => lens[k] < minAlong(n.children[i], n.dir, out.folded));
    const foldable = idx
      .map((i) => n.children[i])
      .filter((c): c is Frame => c.kind === "frame" && !!c.foldable)
      .sort((a, b) => (a.foldOrder ?? 0) - (b.foldOrder ?? 0));
    if (!short || !foldable.length) {
      let pos = n.dir === "row" ? r.x : r.y;
      idx.forEach((i, k) => {
        const cr = n.dir === "row" ? { x: pos, y: r.y, w: lens[k], h: r.h } : { x: r.x, y: pos, w: r.w, h: lens[k] };
        place(n.children[i], cr, out);
        pos += lens[k] + n.gap;
      });
      return;
    }
    out.folded.add(foldable[0].id);
  }
}
