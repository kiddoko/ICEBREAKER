# Frames — the screen as a layout tree

The UI overhaul (the README's roadmap) turns the screen into **frames** you can arrange:
the tree, the page, the side panel, the shell — later INFO and any tab — side by side or
stacked, moved, split, folded. This page is how it works and where it stands.

## Where it stands

- **Step 1 (done): the engine, with today's screen.** The screen is drawn from a layout
  tree (`src/workspace/layout/tree.ts`) solved into one rect per frame
  (`src/workspace/layout/solve.ts`). The tree is built **every frame from today's
  switches** (tree shown, panel shown, shell shown or maximized, the shell's height), so
  nothing moves: `tests/frames.test.ts` proves the rects are the very ones the old code
  computed, at 30 window sizes × every combination of those switches (1 400+ screens).
- Step 2: the tree becomes the thing you change and save (`settings.layout`): move a frame
  (`frame move shell left`), drag a border, fold a frame, 3 ready-made layouts, ⌘Z.
- Step 3: tabs on every frame, tab groups, terminals as a group of tabs, thicker tabs.
- Step 4: each tab's history (back / forward). Step 5: the INFO panel.

## The model

```ts
type Node = Split | Frame;
interface Split { kind: "split"; dir: "row" | "col"; gap: number; children: Node[]; sizes: Size[] }
interface Frame { kind: "frame"; id: string; items: string[]; active: number;
                  min?: { w; h }; foldable?: boolean; foldOrder?: number }
type Size = { cells: number } | { fill: number };
```

- A **split** puts its children side by side (`row`) or stacked (`col`), `gap` cells apart
  (today: 1 between columns, 0 between the page and the shell).
- A **frame** is a box with a stable `id` (`vault`, `main`, `panel`, `shell`) and the
  `items` it holds, by key (`tool:vault`, `main`, `tool:panel`, `tool:shell`; step 3 puts
  tabs there).
- A child's **size**: exactly `cells`, or a `fill` share of what's left.

Today's screen (`todayLayout`):

```
col ─┬─ row ─┬─ vault  (18 % of the screen, 20–34 cells)
     │       ├─ main   (the rest; at least 40 cells)
     │       └─ panel  (20 %, 24–36 cells; foldable)
     └─ shell          (the shell's share of the height, 5 rows at least)

maximized shell:   row ─┬─ vault (full height)
                        └─ col ─┬─ shell (the rest)
                                └─ row ─┬─ main (the strip: 30 % of the height)
                                        └─ panel
```

## The solver

`solveLayout(tree, rect)` → `{ rects: Map<frameId, Rect>, folded: Set<frameId> }`:

1. along a split, the `cells` children get their cells, the `fill` ones share the rest by
   weight (largest remainder: they add up exactly), `gap` cells between two;
2. a child below its `min` → the **foldable** frames among its siblings are folded away,
   lowest `foldOrder` first (today: the side panel goes when the page would keep less than
   40 cells — the old `mainR.w - panelW - 1 >= 40`);
3. never a negative rect: when even the fixed cells don't fit, they shrink, the last ones
   first (the old code drew negative widths in a tiny window).

It's pure: no deck, no drawing — the tests run it without a screen.

## In the workspace

`Workspace.render` builds `todayLayout(…)`, solves it in the body (between the top bar and
the status bar), and draws each frame in its rect, in the same order as before (tree,
panel, page, shell). `ws.layout` holds this frame's tree; `ws.rects` is filled from the
frames as before, so the tour, the side panel's drop, the mouse's focus and `debug state`
are unchanged. Every member the rest of the code uses (`sidebarVisible`, `shellVisible`,
`shellMax`, `shellRatio`, `focus`, `tabs`…) keeps its meaning: nothing outside
`workspace.ts` changed.

## Checking

- `tests/frames.test.ts`: same rects as the old code (the reference is kept in the test),
  the solver's rules, frames inside the body and never overlapping.
- `debug layout` / `debug layout pages` (docs/LAYOUT.md): nothing new cut or overlapping.
- In the app: the same screen as before with the tree, the panel and the shell on and off,
  and the shell maximized (`term max` / `term dock`), at a few window sizes.

The design of the next steps (moves, tabs on frames, groups, history, INFO; the
compatibility facade; saving and migrating the layout; breakerMED's `rawKeys` and esc)
is in the Refonte UI plan.
