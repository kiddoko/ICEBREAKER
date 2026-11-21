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
- **Step 2 (done): the arrangement is saved and can change.** Where each frame sits is
  `settings.layout` (`src/workspace/layout/arrange.ts`): `layout preset <name>` (classic,
  shell-right, panel-left, tree-bottom), `frame move <tree|panel|shell> <side>`,
  `layout reset`; ⌘Z undoes each. **Nothing saved = the classic arrangement = today's
  screen**, so every account keeps its screen with no migration step (tested on the
  rects, and on a copy of a real account's settings). What's shown stays today's
  switches (⌘B the tree, ⌘⇧P the panel, ctrl+` the shell): a hidden frame gives its room
  to its neighbours. ⌘⌥ arrows go to the part really in that direction.
- **Step 2b (done): drag any border, fold a frame.** The border between two frames —
  the gap column between side-by-side frames, the top line of the lower one — drags to
  resize (one ⌘Z step per drag; a dragged size becomes fixed cells, a fill side keeps
  sharing). `frame fold <tree|panel|shell>` folds a frame into a one-cell strip with its
  name; a click on the strip (or `frame unfold`, ⌘B for the tree, anything that needs the
  shell) opens it again. A folded frame never keeps the focus.
- **Step 3a (done): thicker, readable tabs** (`src/workspace/tabstrip.ts`). The top bar
  was two rows (3b moved the tabs onto the frames): each tab is its name (an icon for what it is, the title, × on the one shown
  or hovered) with a half-block bar under it — a row and a half tall, the one shown in the
  accent. No number in front of the name: the numbers (⌘1…9) show only while ⌘ / ctrl is
  held (`InputManager.modHeld`). 15–24 cells each; the icon goes before the name gets
  short; the rest in "▾ +N". Drag a tab sideways to move it (`tab move <n> <m>`).
- **Tab groups (done)** (`src/workspace/tabgroups.ts`, pure): drop a tab onto the middle of
  another (or `tab group <n> <m> [name]`) and they become one chip `▣ name 3` at the first
  one's place; hovering it lists its tabs (click: show it, ⇱ take it out, × close it);
  right-click: rename, take the shown tab out, ungroup them all (`tab ungroup <n>`,
  `tab groupname <n> <name>`). A group of one dissolves; closed tabs leave their groups;
  groups are saved with the session (checked when read back).
- **Step 3b, first part (done): tabs on every frame's border.** The top bar is one row:
  **◆ ICEBREAKER ▾** (the deck's menu: MODULES, STORE, NEXUS, settings, the manual, what's
  new, updates, log out — `workspace/menus.ts` deckMenu; their keys and commands are
  unchanged), UPLINK ■ and the clock. Each frame's top is two rows: its tabs' names, then
  its line, where each tab's half-block bar sits (`tabbedBox`, `soloTab`, `chipStyle`,
  `drawChip` in `tabstrip.ts`). The page's frame has the tabs; the shell's has your
  terminals, ibsh and the log, with its buttons on the right; VAULT and PANEL one tab
  each. The tab shown is lit in the accent when its frame has the focus, dimmer
  otherwise. A page without a tab (STORE, settings…) shows first in the page's frame,
  lit, × closes it. **HOME is pinned**: always the first tab, ⌂, no × (⌘W, `tab close`,
  "close others" leave it), never moved or grouped. Both header rows grab a frame's top
  border. Folded frames are one-cell strips with their name down the strip.
- **Step 3b, second part (done): a tab in any frame** (`src/workspace/tabplaces.ts`,
  pure). Drag a tab onto another frame (it's outlined while you drag), or
  `tab move <n> tree|panel|shell|main`, or right-click → *Move to*: it sits after that
  frame's own tab (VAULT, PANEL, the terminals) and the frame shows it instead of its own
  content — a click on the frame's own tab brings that back. HOME too (still pinned: no ×).
  Keys go to the page the focused frame shows, and so does the status bar. ⌘1…9 on a tab
  that lives elsewhere shows it there; ctrl+tab steps through the page frame's tabs only.
  The page's frame keeps at least one tab (HOME comes back to it otherwise). Where each
  tab lives and what each frame shows are saved with the session (`session.places`,
  `session.shows`, checked when read back). A narrow frame shows the tab it shows first,
  the rest in "+N".
- The terminals stay together in the shell's frame: `term new` opens beside them
  (`term max` still turns the shell into a big tab of the page's frame, `term dock` puts it back).
- **Step 3 is done (0.6.0).** Next: step 4, each tab's history (back / forward); step 5,
  the INFO panel; the battery in the top bar (it needs a native call).

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

## The arrangement (step 2)

```
settings.layout  ──parseArrangement──►  arrangement (or CLASSIC)
       + switches (tree, panel, shell shown)  ──effectiveLayout──►  tree  ──solveLayout──►  rects
```

- An arrangement holds the four frames (`vault`, `main`, `panel`, `shell`), each exactly
  once, in splits at most 4 deep. A size is `{ auto: id }` (that frame's own size along the
  split: today's rules — the tree 18 % of the screen within 20–34 cells, the panel 20 %
  within 24–36, the shell its share of the height), `{ cells }` or `{ fill }`.
- **Checked before it's used** (`parseArrangement`): anything else — a missing or doubled
  frame, an unknown size, too deep, another version — and the classic arrangement is used.
- `effectiveLayout` leaves out the frames switched off; a split left with one child is that
  child; a split with no `fill` child gives its last one the rest.
- `moveFrame(arr, id, side)`: the frame goes along that edge of the whole screen at its own
  size; the rest keeps its arrangement. The page never moves: the others move around it.
- `setFolded`, `resizeBetween(arr, a, b, dir, aLen, bLen)` (the border between the parts
  holding frames `a` and `b`), and `bordersOf(tree, rects)` (layout/solve.ts: every border
  and the cells to grab) are pure and tested.
- The maximized shell (`term max` from the panel's □, or `shellMax`) keeps its own layout.
- The shell's top border resizes it only when the shell is along the bottom; HOME's edit
  band spans the page and the panel wherever the panel sits.

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

- `tests/frames.test.ts`: same rects as the old code (the reference is kept in the test) for
  today's layout and for the classic arrangement; the solver's rules; saved arrangements
  checked; every preset and every move keeps frames inside and apart at 30 sizes; ⌘⌥ arrows
  behave as before on the classic layout and follow the frames elsewhere.
- `debug layout` / `debug layout pages` (docs/LAYOUT.md): nothing new cut or overlapping.
- In the app: the same screen as before with the tree, the panel and the shell on and off,
  and the shell maximized (`term max` / `term dock`), at a few window sizes.

The design of the next steps (moves, tabs on frames, groups, history, INFO; the
compatibility facade; saving and migrating the layout; breakerMED's `rawKeys` and esc)
is in the Refonte UI plan.
