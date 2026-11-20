# Layout rules — nothing stuck, nothing cut, nothing one cell off

The deck is a grid of cells. These rules say how far apart things are, everywhere.
They live in code as constants (`src/ui/layout.ts`, `ib.lib.*` for modules): use the
names, never a literal `1`, `2` or `3` between things.

| name | cells | between |
|---|---|---|
| `INSET` | 1 | a frame's inner edge and what's inside it (left **and** right) |
| `GAP` | 2 | two things on one row: two buttons, a field and its button, a value and the next label |
| `LABEL` | 1 | a label and its value: `FACE ‹ dots ›` |
| `SECTION` | 1 | two groups (blank rows); each group starts with its title |

## The rules

1. **Inside a frame**, content starts at `inner.x + INSET` and stops at
   `inner.x + inner.w - INSET`. A title row is the frame's own (`ui.box` title).
2. **On one row**, things are `GAP` apart. Build the row with `Row`: it places each
   thing after the previous one plus the gap, and **doesn't draw what doesn't fit**
   (no overlap): `row.button(…)`, `row.text(…)`, `row.checkbox(…)`, `row.choice(…)`,
   `row.label(…)` (then the value is `LABEL` away).
3. **Every text has a width limit**: `ui.text(x, y, s, style, maxW)` — never a text
   that can run over its neighbour or out of its frame. Long text ends with `…`
   (`truncate`) or wraps (`wrapWords`), never cut mid-glyph.
4. **Widths are measured, never counted**: `strWidth(s)`, not `s.length` (emoji,
   Japanese, accents written as two characters).
5. **Right-aligned things** use `ui.textRight(xEnd, …)`; a right column ends at the
   same `xEnd` on every row.
6. **Lists** are `ListView` (it keeps the selection visible and scrolls); a list never
   draws past its rect — rows beyond it scroll, they aren't dropped.
7. **Clicks**: the last `ui.hit` registered wins. Register a row's own click first,
   then the buttons on it — or the row swallows them.
8. **Groups** are `SECTION` apart and start with a title (`subtle`, bold).
9. **One look per thing**: a field is a `Field`, a box a `checkbox`… (docs/UI_KIT.md).
   A page never redraws one.
10. **Check it narrow**: every page at the smallest window (and the side panel at its
    narrowest) — nothing overlaps, `Row` drops what doesn't fit.

## When the room runs out

A page never decides from the window's size: it looks at **its own frame**, which
may be a narrow column on a big screen.

- **`sizeClass(rect)`** → `xs` (under 30 × 8) · `s` (under 60 × 16) · `m` (under 110 × 32)
  · `l`. The same steps everywhere: `if (atLeast(inner, "m")) drawTheChart()`.
- **`Bar`** — a row on both sides (a status bar, a header) where each thing has a
  `priority`: when they don't fit, a `fit` text shrinks first (cut with `…`), then the
  **least important** things are left out, not the last ones. Nothing overlaps:

  ```ts
  const bar = new Bar(ui, r.x, r.y, r.x + r.w);
  bar.text(" HOME ", { fg: c.panel, bg: c.accent }, { priority: 10 });
  bar.text(status, { fg: c.muted }, { priority: 1, fit: 8 });
  bar.text("⌘K menu", { fg: c.muted }, { side: "right", priority: 9 });
  bar.draw();
  ```
- **`stack(rect, parts)`** — sections down a frame (a header, a list, a help line):
  fixed ones get their `h`, `fill` ones share the rest (`max` caps one); when rows are
  missing, the lowest `priority` sections come back `null` instead of everything
  getting squeezed. `SECTION` rows apart.
- **`cards(rect, n, { minW, h })`** — the days of a forecast, the modules, clocks: as
  many on a row as fit, sharing the width (`maxW` caps it, then the row is centred),
  `GAP` apart; `shown` says how many fit entirely (the rest scroll).

Modules get the same: `ib.lib.Bar`, `ib.lib.stack`, `ib.lib.cards`, `ib.lib.sizeClass`.

## Checking a page

- **`debug layout`** draws the screen as it is now, off screen, at 14 sizes (a small
  window with a big interface scale, 80×24, laptops, 1440p, 4K, 21:9, 32:9, portrait,
  half a screen, a short strip) and lists what is **cut** (a text partly outside its
  frame: it needed a `maxW`, a `Row` or a `Bar`) or **overlapping** (a text written
  over another one, with no fill in between), with the function that drew it.
  `debug layout 100x30 300x60` tries those sizes only; `--json` gives everything.
- **`debug layout pages`** does it for every page and module page, one after the other.
- A drawing that overlaps **on purpose** (an animated background, NEXUS's 3D, art over
  a frame) goes inside `ui.art(() => …)`: the probe doesn't look there.
- **`debug layout show`** marks it on the screen while you use the deck: the first
  hidden letter of a cut text in red, an overlap in yellow. Resize the window and watch.
- **The ratchet** (`tests/layout.test.ts`): spacing written by hand (`r.x + 2`,
  `inner.w - 4`) may never grow. Each file keeps at most what it had
  (`tests/layout-baseline.json`), a new file has none. When you clean a file, lower
  its number: `UPDATE_LAYOUT_BASELINE=1 npx vitest run tests/layout.test.ts` rewrites
  the baseline and refuses to raise anything.

## Where this is going

The UI overhaul (the README's roadmap) moves every page onto these constants, `Row`,
`Bar`, `stack` and `cards`, page by page, with `debug layout` as the judge; new code
uses them from now on.
