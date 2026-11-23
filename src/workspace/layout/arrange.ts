import { col, frame, row, todaySizes, type Frame, type Node, type Size, type Today } from "./tree";

/**
 * THE ARRANGEMENT (docs/FRAMES.md, step 2) — where each frame sits, saved in
 * `settings.layout`. It holds the four frames (vault, main, panel, shell) in splits;
 * a frame's size is `{ auto: id }` (its own default size along the split: today's
 * rules) or fixed cells / a fill share.
 *
 * What's shown stays today's switches (the tree, the panel, the shell — ⌘B, ⌘⇧P,
 * ctrl+`): a hidden frame is left out and its neighbours take the room. So:
 *
 *   arrangement (saved)  +  switches  →  effectiveLayout()  →  solveLayout()  →  rects
 *
 * Nothing saved (every account before step 2, or after `layout reset`) = today's
 * arrangement, which gives exactly today's screen (tests/frames.test.ts).
 */

/**
 * a size in a saved arrangement: today's sizes (`auto`), a share of the screen along the split
 * (`frac`: what a dragged border leaves — another font, so another number of cells, keeps the
 * proportions), or the solver's own kinds
 */
export type ArrangedSize = Size | { auto: FrameId } | { frac: number };

export type FrameId = "vault" | "main" | "panel" | "shell";
export const FRAME_IDS: FrameId[] = ["vault", "main", "panel", "shell"];

/** what each frame holds (step 3 puts real tabs here) */
const ITEMS: Record<FrameId, string> = { vault: "tool:vault", main: "main", panel: "tool:panel", shell: "tool:shell" };

export interface ASplit {
  kind: "split";
  dir: "row" | "col";
  gap: number;
  children: ANode[];
  sizes: ArrangedSize[];
}
export interface AFrame {
  kind: "frame";
  id: FrameId;
  /** folded into a one-cell strip (`frame fold`); the page never folds */
  folded?: boolean;
}
export type ANode = ASplit | AFrame;

/** what's saved: `{}` (today's) or this */
export interface SavedLayout {
  version: 1;
  /** the preset it came from, if untouched since ("classic", "shell-right"…) */
  preset?: string;
  root: ANode;
}

const f = (id: FrameId): AFrame => ({ kind: "frame", id });
const split = (dir: "row" | "col", parts: [ANode, ArrangedSize][]): ASplit => ({ kind: "split", dir, gap: dir === "row" ? 1 : 0, children: parts.map((p) => p[0]), sizes: parts.map((p) => p[1]) });

/** Today's arrangement: the tree, the page and the panel side by side, the shell under them. */
export const CLASSIC: ANode = split("col", [
  [split("row", [[f("vault"), { auto: "vault" }], [split("row", [[f("main"), { fill: 1 }], [f("panel"), { auto: "panel" }]]), { fill: 1 }]]), { fill: 1 }],
  [f("shell"), { auto: "shell" }],
]);

/** Ready-made arrangements (`layout preset <name>`). */
export const PRESETS: Record<string, { doc: string; root: ANode }> = {
  classic: { doc: "the tree, the page, the panel; the shell at the bottom (as always)", root: CLASSIC },
  "shell-right": {
    doc: "a wide screen: the tree and the panel stacked on the left, the page, the shell on the right",
    root: split("row", [
      [split("col", [[f("vault"), { fill: 1 }], [f("panel"), { auto: "panel" }]]), { auto: "vault" }],
      [f("main"), { fill: 1 }],
      [f("shell"), { auto: "shell" }],
    ]),
  },
  "panel-left": {
    doc: "the panel on the left above the tree, the page on the right, the shell at the bottom",
    root: split("col", [
      [split("row", [[split("col", [[f("panel"), { auto: "panel" }], [f("vault"), { fill: 1 }]]), { auto: "panel" }], [f("main"), { fill: 1 }]]), { fill: 1 }],
      [f("shell"), { auto: "shell" }],
    ]),
  },
  "tree-bottom": {
    doc: "the page and the panel on top, the tree and the shell side by side at the bottom",
    root: split("col", [
      [split("row", [[f("main"), { fill: 1 }], [f("panel"), { auto: "panel" }]]), { fill: 1 }],
      [split("row", [[f("vault"), { auto: "vault" }], [f("shell"), { fill: 1 }]]), { auto: "shell" }],
    ]),
  },
};

// ── reading a saved arrangement (it may come from another version, another computer) ──

/**
 * A saved arrangement, checked: the four frames exactly once each, known sizes,
 * at most 4 levels deep. Anything else → null (today's arrangement is used).
 */
export function parseArrangement(raw: unknown): ANode | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Partial<SavedLayout>;
  if (r.version !== 1 || !r.root) return null;
  const seen = new Set<string>();
  const ok = (n: unknown, depth: number): n is ANode => {
    if (!n || typeof n !== "object" || depth > 4) return false;
    const o = n as Record<string, unknown>;
    if (o.kind === "frame") {
      if (typeof o.id !== "string" || !FRAME_IDS.includes(o.id as FrameId) || seen.has(o.id)) return false;
      if (o.folded !== undefined && (typeof o.folded !== "boolean" || o.id === "main")) return false;
      seen.add(o.id);
      return true;
    }
    if (o.kind !== "split" || (o.dir !== "row" && o.dir !== "col")) return false;
    if (typeof o.gap !== "number" || o.gap < 0 || o.gap > 2) return false;
    if (!Array.isArray(o.children) || !Array.isArray(o.sizes) || o.children.length < 1 || o.children.length > 4 || o.sizes.length !== o.children.length) return false;
    if (!o.sizes.every(validSize)) return false;
    return o.children.every((c) => ok(c, depth + 1));
  };
  if (!ok(r.root, 0) || seen.size !== FRAME_IDS.length) return null;
  return r.root;
}

function validSize(s: unknown): boolean {
  if (!s || typeof s !== "object") return false;
  const o = s as Record<string, unknown>;
  if ("cells" in o) return typeof o.cells === "number" && Number.isFinite(o.cells) && o.cells >= 0 && o.cells <= 1000;
  if ("fill" in o) return typeof o.fill === "number" && Number.isFinite(o.fill) && o.fill > 0 && o.fill <= 100;
  if ("auto" in o) return typeof o.auto === "string" && FRAME_IDS.includes(o.auto as FrameId);
  if ("frac" in o) return typeof o.frac === "number" && Number.isFinite(o.frac) && o.frac > 0 && o.frac < 1;
  return false;
}

// ── from the arrangement to what the solver draws ─────────────────────────────

/**
 * A frame's own size along a split, from today's rules: the tree 18 % of the screen
 * (20–34 cells), the panel 20 % (24–36), the shell its share of the height (5 rows at
 * least, 8 left above it). Across (a tree at the bottom, a shell on the right):
 * sensible equivalents.
 */
export function autoLength(id: FrameId, dir: "row" | "col", s: Today): number {
  const z = todaySizes(s);
  const across = Math.max(6, Math.min(Math.max(6, s.bodyH - 8), Math.round(s.bodyH * 0.35)));
  switch (id) {
    case "vault": return dir === "row" ? z.sideW : across;
    case "panel": return dir === "row" ? z.panelW : across;
    case "shell": return dir === "col" ? z.shellH : Math.max(30, Math.min(s.cols - 50, Math.round(s.cols * 0.38)));
    default: return 0;
  }
}

/** a saved size in the solver's terms: `auto` and `frac` become cells on this screen */
function resolve(size: ArrangedSize, dir: "row" | "col", s: Today): Size {
  if ("auto" in size) return { cells: autoLength(size.auto, dir, s) };
  if ("frac" in size) return { cells: Math.max(1, Math.round(size.frac * (dir === "row" ? s.cols : s.bodyH))) };
  return size;
}

/** a frame's real thing: its minimum, whether it folds away when the page needs room */
function toFrame(id: FrameId): Frame {
  if (id === "main") return frame("main", [ITEMS.main], { min: { w: 40, h: 1 } });
  if (id === "panel") return frame("panel", [ITEMS.panel], { foldable: true, foldOrder: 1 });
  return frame(id, [ITEMS[id]]);
}

/**
 * The tree the solver draws: the arrangement without the frames switched off (their
 * neighbours take the room; a split left with one child is that child), sizes resolved.
 */
export function effectiveLayout(arr: ANode, s: Today): Node {
  const shown = (id: FrameId) => id === "main" || (id === "vault" ? s.sidebar : id === "panel" ? s.panel : s.shell);
  const build = (n: ANode): { node: Node; first: FrameId; strip?: boolean } | null => {
    if (n.kind === "frame") return shown(n.id) ? (n.folded && n.id !== "main" ? { node: { ...toFrame(n.id), strip: true, foldable: false }, first: n.id, strip: true } : { node: toFrame(n.id), first: n.id }) : null;
    const parts: [Node, Size][] = [];
    const strips = new Set<number>();
    let first: FrameId | null = null;
    n.children.forEach((c, i) => {
      const b = build(c);
      if (!b) return;
      first ??= b.first;
      if (b.strip) strips.add(parts.length);
      const size = n.sizes[i];
      // a folded frame: one cell along the split, whatever its size was
      parts.push([b.node, b.strip ? { cells: 1 } : resolve(size, n.dir, s)]);
    });
    if (!parts.length || !first) return null;
    // one child left: it is the split (its size is the split's own, decided by the parent)
    if (parts.length === 1) return { node: parts[0][0], first };
    // the page must always be able to grow: a split with no fill child gets its last one as
    // fill (not a folded strip: that stays one cell)
    if (!parts.some(([, sz]) => "fill" in sz)) {
      const open = parts.map((_, k) => k).filter((k) => !strips.has(k));
      parts[open.length ? open[open.length - 1] : parts.length - 1][1] = { fill: 1 };
    }
    return { node: n.dir === "row" ? row(n.gap, parts) : col(n.gap, parts), first };
  };
  return build(arr)?.node ?? toFrame("main");
}

// ── changing it ───────────────────────────────────────────────────────────────

export type Side = "left" | "right" | "top" | "bottom";

/** the arrangement without frame `id` (its split collapses when one child is left) */
function without(n: ANode, id: FrameId): ANode | null {
  if (n.kind === "frame") return n.id === id ? null : n;
  const kids: [ANode, ArrangedSize][] = [];
  n.children.forEach((c, i) => {
    const k = without(c, id);
    if (k) kids.push([k, n.sizes[i]]);
  });
  if (!kids.length) return null;
  if (kids.length === 1) return kids[0][0];
  return { ...n, children: kids.map((k) => k[0]), sizes: kids.map((k) => k[1]) };
}

/**
 * Frame `id` moved to one side of the whole screen, at its own size: `frame move shell
 * right` puts the shell along the right edge, the rest keeps its arrangement. The page
 * (main) doesn't move: everything else moves around it.
 */
export function moveFrame(arr: ANode, id: FrameId, side: Side): ANode {
  if (id === "main") return arr;
  const rest = without(arr, id);
  if (!rest) return arr;
  const dir = side === "left" || side === "right" ? "row" : "col";
  const me: [ANode, ArrangedSize] = [f(id), { auto: id }];
  const others: [ANode, ArrangedSize] = [rest, { fill: 1 }];
  return split(dir, side === "left" || side === "top" ? [me, others] : [others, me]);
}

/** Where a frame sits, in words ("left of the page", "bottom"…), for `layout`. */
export function describe(arr: ANode): string[] {
  const out: string[] = [];
  const walk = (n: ANode, depth: number, size?: ArrangedSize) => {
    const pad = "  ".repeat(depth);
    const sz = !size ? "" : "auto" in size ? "" : "frac" in size ? ` (${Math.round(size.frac * 100)} %)` : "cells" in size ? ` (${size.cells} cells)` : size.fill !== 1 ? ` (×${size.fill})` : " (the rest)";
    if (n.kind === "frame") out.push(`${pad}${n.id}${sz}`);
    else {
      out.push(`${pad}${n.dir === "row" ? "side by side" : "stacked"}${sz}`);
      n.children.forEach((c, i) => walk(c, depth + 1, n.sizes[i]));
    }
  };
  walk(arr, 0);
  return out;
}

/** The ids of the frames, in reading order. */
export function arrangedIds(arr: ANode): FrameId[] {
  return arr.kind === "frame" ? [arr.id] : arr.children.flatMap(arrangedIds);
}

/** Frame `id` folded into a strip (or opened again); the page never folds. */
export function setFolded(arr: ANode, id: FrameId, folded: boolean): ANode {
  if (id === "main") return arr;
  const walk = (n: ANode): ANode => (n.kind === "frame" ? (n.id === id ? (folded ? { ...n, folded: true } : { kind: "frame", id: n.id }) : n) : { ...n, children: n.children.map(walk) });
  return walk(arr);
}

/** Is frame `id` folded in this arrangement? */
export function isFolded(arr: ANode, id: FrameId): boolean {
  const walk = (n: ANode): boolean => (n.kind === "frame" ? n.id === id && !!n.folded : n.children.some(walk));
  return walk(arr);
}

/**
 * A border dragged: the border between the part holding frame `a` and the part holding
 * frame `b` (neighbours in a split along `dir`) moves so that `a`'s part is `aLen` cells
 * and `b`'s `bLen` along it. The part with a fixed size (auto or cells) takes its new
 * length in cells; two fill parts change their shares. Returns the arrangement unchanged
 * when `a` and `b` aren't neighbours along `dir`.
 */
export function resizeBetween(arr: ANode, a: FrameId, b: FrameId, dir: "row" | "col", aLen: number, bLen: number, screen?: number): ANode {
  // with the screen's length along `dir` (its columns, or the body's rows), a fixed side keeps a
  // share of it, so a theme with another font doesn't stretch it; without, cells (older callers)
  const fixed = (len: number): ArrangedSize => (screen && screen > 0 ? { frac: Math.max(0.01, Math.min(0.99, Math.round((len / screen) * 10000) / 10000)) } : { cells: Math.max(1, Math.round(len)) });
  const holds = (n: ANode, id: FrameId): boolean => (n.kind === "frame" ? n.id === id : n.children.some((c) => holds(c, id)));
  const walk = (n: ANode): ANode => {
    if (n.kind === "frame") return n;
    const ia = n.children.findIndex((c) => holds(c, a));
    const ib = n.children.findIndex((c) => holds(c, b));
    if (ia < 0 || ib < 0) return n;
    // both inside one child: the border is further down
    if (ia === ib) return { ...n, children: n.children.map((c, i) => (i === ia ? walk(c) : c)) };
    if (n.dir !== dir) return n;
    const sizes = [...n.sizes];
    const sa = sizes[ia], sb = sizes[ib];
    const fill = (s: ArrangedSize) => "fill" in s;
    if (fill(sa) && fill(sb)) {
      const total = (sa as { fill: number }).fill + (sb as { fill: number }).fill;
      const share = Math.max(0.05, Math.min(0.95, aLen / Math.max(1, aLen + bLen)));
      sizes[ia] = { fill: Math.round(total * share * 1000) / 1000 };
      sizes[ib] = { fill: Math.round(total * (1 - share) * 1000) / 1000 };
    } else {
      if (!fill(sa)) sizes[ia] = fixed(aLen);
      if (!fill(sb)) sizes[ib] = fixed(bLen);
    }
    return { ...n, sizes };
  };
  return walk(arr);
}
