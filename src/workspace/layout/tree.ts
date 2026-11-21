/**
 * THE LAYOUT TREE (docs/FRAMES.md) — the screen as frames side by side or stacked.
 * Pure data and pure functions: no drawing, no deck. `solve.ts` turns a tree and a
 * rect into one rect per frame; `Workspace.render` draws each frame there.
 *
 *   col ─┬─ row ─┬─ frame "vault"   (the tree)
 *        │       ├─ frame "main"    (the tabs, the page)
 *        │       └─ frame "panel"   (the side panel's widgets)
 *        └─ frame "shell"            (terminals, ibsh, the log)
 *
 * Step 1 of the overhaul: the tree is built from today's switches (tree shown, shell
 * shown or maximized, panel shown, the shell's height) every frame, so the screen is
 * exactly today's. Step 2 makes the tree itself the thing you change and save
 * (settings.layout): frames moved, split, folded.
 */

/** how much room a child of a split takes along the split's direction */
export type Size =
  /** exactly this many cells (the solver shrinks it only when there isn't even that) */
  | { cells: number }
  /** a share of what the fixed ones leave (weight; usually 1) */
  | { fill: number };

export interface Split {
  kind: "split";
  /** "row": children side by side · "col": stacked */
  dir: "row" | "col";
  /** empty cells between two children (today: 1 between columns, 0 between rows) */
  gap: number;
  children: Node[];
  /** one per child */
  sizes: Size[];
}

export interface Frame {
  kind: "frame";
  /** stable name: "vault", "main", "panel", "shell" (later: "f7"…) */
  id: string;
  /** what it holds, by key (step 3 puts tabs and groups here) */
  items: string[];
  /** the one shown */
  active: number;
  /** below this it doesn't work: the solver folds foldable neighbours to keep it */
  min?: { w: number; h: number };
  /** may be folded away when a neighbour is below its minimum (the lowest foldOrder goes first) */
  foldable?: boolean;
  foldOrder?: number;
}

export type Node = Split | Frame;

export const frame = (id: string, items: string[], o: Partial<Omit<Frame, "kind" | "id" | "items">> = {}): Frame => ({ kind: "frame", id, items, active: 0, ...o });
export const row = (gap: number, parts: [Node, Size][]): Split => ({ kind: "split", dir: "row", gap, children: parts.map((p) => p[0]), sizes: parts.map((p) => p[1]) });
export const col = (gap: number, parts: [Node, Size][]): Split => ({ kind: "split", dir: "col", gap, children: parts.map((p) => p[0]), sizes: parts.map((p) => p[1]) });

/** Every frame of the tree, in reading order (left to right, top to bottom). */
export function frames(n: Node): Frame[] {
  return n.kind === "frame" ? [n] : n.children.flatMap(frames);
}

/** The frame with this id, or undefined. */
export function findFrame(n: Node, id: string): Frame | undefined {
  return frames(n).find((f) => f.id === id);
}

/** The frame that holds this item key, or undefined. */
export function frameOf(n: Node, key: string): Frame | undefined {
  return frames(n).find((f) => f.items.includes(key));
}

// ── today's screen, as a tree ────────────────────────────────────────────────

/** today's switches (Workspace) and the screen's size */
export interface Today {
  sidebar: boolean;
  shell: boolean;
  /** the shell takes the big area, the page goes to a strip at the bottom */
  shellMax: boolean;
  panel: boolean;
  /** the shell's share of the body's height (0.15–0.8) */
  shellRatio: number;
  /** the grid's columns (the tree's and the panel's widths follow the whole screen) */
  cols: number;
  /** the body's rows (between the top bar and the status bar) */
  bodyH: number;
}

/** today's sizes, exactly as Workspace.render computed them (0.5.x) */
export function todaySizes(s: Today): { sideW: number; panelW: number; shellH: number; stripH: number } {
  return {
    sideW: Math.max(20, Math.min(34, Math.round(s.cols * 0.18))),
    panelW: Math.max(24, Math.min(36, Math.round(s.cols * 0.2))),
    shellH: Math.max(5, Math.min(s.bodyH - 8, Math.round(s.bodyH * s.shellRatio))),
    stripH: Math.max(6, Math.round(s.bodyH * 0.3)),
  };
}

/**
 * Today's screen as a tree: the tree on the left, the page, the panel on the right
 * (folded when the page would keep less than 40 cells), the shell under them all —
 * or, maximized, the shell on top of a strip that holds the page and the panel.
 */
export function todayLayout(s: Today): Node {
  const z = todaySizes(s);
  const main = frame("main", ["main"], { min: { w: 40, h: 1 } });
  const panel = frame("panel", ["tool:panel"], { foldable: true, foldOrder: 1 });
  const vault = frame("vault", ["tool:vault"]);
  const shell = frame("shell", ["tool:shell"]);
  const pageRow = (): Node => (s.panel ? row(1, [[main, { fill: 1 }], [panel, { cells: z.panelW }]]) : main);
  const withVault = (n: Node): Node => (s.sidebar ? row(1, [[vault, { cells: z.sideW }], [n, { fill: 1 }]]) : n);
  if (s.shell && s.shellMax) return withVault(col(0, [[shell, { fill: 1 }], [pageRow(), { cells: z.stripH }]]));
  const top = withVault(pageRow());
  return s.shell ? col(0, [[top, { fill: 1 }], [shell, { cells: z.shellH }]]) : top;
}
