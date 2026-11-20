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

## Where this is going

The global spacing pass (chantier 2 in the to-do: margins everywhere, HOME keeping
its proportions) moves every page onto these constants and `Row`; new code uses them
from now on.
