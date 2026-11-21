import type { RGB } from "../core/color";
import { BOLD, type Rect } from "../core/grid";
import { strWidth } from "../core/unicode";
import { checkbox, choice, type CheckboxOptions, type ChoiceOptions } from "./controls";
import type { Style, UI } from "./ui";

/**
 * THE SPACING RULES, in cells (docs/LAYOUT.md). Use these numbers, never a
 * literal 1, 2 or 3 between things — then nothing is ever stuck together, cut,
 * or one cell off from its neighbour.
 *
 *   INSET     content starts this far inside a frame's inner rect (and stops as far from its right edge)
 *   GAP       between two things on one row: buttons, a field and its button, a value and the next label
 *   LABEL     between a label and its value ("FACE ‹ dots ›")
 *   SECTION   blank rows between two groups (a title starts each group)
 */
export const INSET = 1;
export const GAP = 2;
export const LABEL = 1;
export const SECTION = 1;

/**
 * A row of things, left to right, each GAP apart, never past `end` — what
 * doesn't fit isn't drawn (and `overflow` says so) instead of overlapping.
 *
 *   const row = new Row(ui, inner.x + INSET, y, inner.x + inner.w - INSET);
 *   row.button(t("install"), install);
 *   row.button(t("remove"), remove, { accent: c.error });
 *   row.text(t("v1.2"), { fg: c.faint });
 */
export class Row {
  /** where the next thing would start (before its gap) */
  x: number;
  /** something didn't fit */
  overflow = false;
  private first = true;
  /** the gap before the next thing (GAP; LABEL right after a label) */
  private nextGap = GAP;

  constructor(
    private readonly ui: UI,
    x: number,
    readonly y: number,
    /** the first cell it may not use */
    readonly end: number,
  ) {
    this.x = x;
  }

  /** the cells still free (after the next gap) */
  get room(): number {
    return Math.max(0, this.end - this.x - (this.first ? 0 : this.nextGap));
  }

  /** Where a thing `w` wide goes, or null (it doesn't fit). */
  private place(w: number, gap?: number): number | null {
    const x = this.first ? this.x : this.x + (gap ?? this.nextGap);
    if (x + w > this.end) {
      this.overflow = true;
      return null;
    }
    this.first = false;
    this.nextGap = GAP;
    return x;
  }

  button(label: string, onClick: () => void, o: Parameters<UI["button"]>[4] = {}): boolean {
    const x = this.place(strWidth(label) + 2);
    if (x === null) return false;
    this.x = x + this.ui.button(x, this.y, label, onClick, o);
    return true;
  }

  /** Text; `fit` cuts it to the room left instead of leaving it out. */
  text(s: string, style: Style = {}, o: { fit?: boolean; gap?: number } = {}): boolean {
    const w = strWidth(s);
    let x = this.place(w, o.gap);
    if (x === null && o.fit && this.room > 1) {
      this.overflow = false;
      x = this.first ? this.x : this.x + (o.gap ?? this.nextGap);
      this.first = false;
      this.nextGap = GAP;
    }
    if (x === null) return false;
    this.x = this.ui.text(x, this.y, s, style, this.end - x);
    return true;
  }

  /** A label, then (LABEL apart) what follows it. */
  label(s: string, fg?: RGB): boolean {
    if (!this.text(s, { fg: fg ?? this.ui.c.subtle, attrs: BOLD })) return false;
    this.nextGap = LABEL;
    return true;
  }

  checkbox(on: boolean | "some", o: CheckboxOptions = {}): boolean {
    const w = 3 + (o.label ? 1 + strWidth(o.label) : 0);
    const x = this.place(w);
    if (x === null) return false;
    this.x = checkbox(this.ui, x, this.y, on, o);
    return true;
  }

  /** ‹ value › (the ‹ needs 2 cells before the value: counted in) */
  choice(value: string, o: ChoiceOptions = {}): boolean {
    const x = this.place(strWidth(value) + 4);
    if (x === null) return false;
    this.x = choice(this.ui, x + 2, this.y, value, o);
    return true;
  }

  /** more room before the next thing */
  space(n: number): void {
    this.x += n;
  }
}

// ── sizes ─────────────────────────────────────────────────────────────────────

/**
 * How big a frame is, in four steps — the same thresholds everywhere, so a page
 * chooses its layout from the room it has (a page in a narrow frame of a big
 * screen is "s"), never from the window.
 *
 *   xs   under 30 × 8     one line of what matters, nothing else
 *   s    under 60 × 16    the essentials, short labels
 *   m    under 110 × 32   the normal page
 *   l    bigger           room for the extras (a second column, a chart, the help)
 */
export type SizeClass = "xs" | "s" | "m" | "l";
export const SIZE_STEPS: { size: SizeClass; w: number; h: number }[] = [
  { size: "xs", w: 30, h: 8 },
  { size: "s", w: 60, h: 16 },
  { size: "m", w: 110, h: 32 },
];

/** The size class of a rect: the smallest step its width OR its height falls under. */
export function sizeClass(r: { w: number; h: number }): SizeClass {
  for (const s of SIZE_STEPS) if (r.w < s.w || r.h < s.h) return s.size;
  return "l";
}

/** Is the rect at least this big? `atLeast(r, "m")` */
export function atLeast(r: { w: number; h: number }, size: SizeClass): boolean {
  const order: SizeClass[] = ["xs", "s", "m", "l"];
  return order.indexOf(sizeClass(r)) >= order.indexOf(size);
}

// ── a bar: a row where the least important things go first ──────────────────

interface BarItem {
  w: number;
  /** the narrowest it may get: a `fit` text shrinks (cut with …) down to this before anything is left out */
  minW: number;
  priority: number;
  side: "left" | "right";
  draw: (x: number, w: number) => void;
  order: number;
}

/**
 * A row of things on both sides — a status bar, a page's header — that never
 * overlaps and never cuts: when they don't all fit, the LEAST IMPORTANT go first
 * (not just the last ones), then a text marked `fit` shrinks (cut with …).
 * Nothing is drawn until `draw()`. Things are GAP apart (or `gap`).
 *
 *   const bar = new Bar(ui, r.x, r.y, r.x + r.w);
 *   bar.text(" HOME ", { fg, bg }, { priority: 10 });                  // left, always
 *   bar.text(status, { fg: c.muted }, { priority: 1, fit: 8 });        // left, shrinks to 8 cells
 *   bar.text("⌘K menu", { fg: c.muted }, { side: "right", priority: 9 });
 *   bar.button("◨", togglePanel, { cmd: "panel" }, { side: "right", priority: 8 });
 *   bar.draw();                                                         // bar.dropped: what didn't fit
 */
export class Bar {
  private items: BarItem[] = [];
  /** how many things were left out by the last draw() */
  dropped = 0;

  constructor(
    private readonly ui: UI,
    readonly x: number,
    readonly y: number,
    /** the first cell it may not use */
    readonly end: number,
    private readonly gap = GAP,
  ) {}

  /** Anything `w` wide, drawn by `draw(x, w)` (w: the width it got, ≤ the one asked when it shrinks). */
  item(w: number, draw: (x: number, w: number) => void, o: { priority?: number; side?: "left" | "right"; fit?: number } = {}): this {
    this.items.push({ w, minW: o.fit !== undefined ? Math.min(w, Math.max(1, o.fit)) : w, priority: o.priority ?? 5, side: o.side ?? "left", draw, order: this.items.length });
    return this;
  }

  /** A text. `fit: n` lets it shrink down to n cells (cut with …) instead of disappearing. */
  text(s: string, style: Style = {}, o: { priority?: number; side?: "left" | "right"; fit?: number } = {}): this {
    return this.item(strWidth(s), (x, w) => this.ui.text(x, this.y, s, style, w), o);
  }

  /** A button (ui.button: its label with a space on each side). */
  button(label: string, onClick: () => void, b: Parameters<UI["button"]>[4] = {}, o: { priority?: number; side?: "left" | "right" } = {}): this {
    return this.item(strWidth(label) + 2, (x) => this.ui.button(x, this.y, label, onClick, b), o);
  }

  /** Lay out and draw. Returns the cells left free between the two sides. */
  draw(): number {
    const room = Math.max(0, this.end - this.x);
    const kept = layoutBar(this.items, room, this.gap);
    this.dropped = this.items.length - kept.length;
    let x = this.x;
    for (const k of kept.filter((k) => k.item.side === "left")) {
      k.item.draw(x, k.w);
      x += k.w + this.gap;
    }
    let xr = this.end;
    for (const k of kept.filter((k) => k.item.side === "right").reverse()) {
      xr -= k.w;
      k.item.draw(xr, k.w);
      xr -= this.gap;
    }
    return Math.max(0, xr - x + this.gap);
  }
}

/**
 * What a Bar keeps, and how wide: drop the least important (the latest added
 * first among equals) until the minimum widths fit, then give the shrinkable ones
 * back as much as there is room for. Exported for the tests.
 */
export function layoutBar<T extends { w: number; minW: number; priority: number; side: "left" | "right"; order: number }>(items: T[], room: number, gap: number): { item: T; w: number }[] {
  let kept = [...items];
  // the widths, and a gap between neighbours (the last on the left and the first on the right too)
  const need = (list: T[], wide: (i: T) => number) => list.reduce((n, i) => n + wide(i), 0) + gap * Math.max(0, list.length - 1);
  while (kept.length && need(kept, (i) => i.minW) > room) {
    const worst = kept.reduce((a, b) => (b.priority < a.priority || (b.priority === a.priority && b.order > a.order) ? b : a));
    kept = kept.filter((i) => i !== worst);
  }
  let spare = room - need(kept, (i) => i.minW);
  return kept
    .sort((a, b) => a.order - b.order)
    .map((item) => {
      const grow = Math.min(item.w - item.minW, spare);
      spare -= grow;
      return { item, w: item.minW + grow };
    });
}

// ── a stack: sections down a frame ───────────────────────────────────────────

export interface StackPart {
  /** rows it needs at least (default: `h`, or 1) */
  min?: number;
  /** a fixed height (min = want = h) */
  h?: number;
  /** takes a share of the rows left (weight; default 0 = only what it asks) */
  fill?: number;
  /** never taller than this */
  max?: number;
  /** who goes first when rows are missing: the lowest (default 5) */
  priority?: number;
}

/**
 * Sections down a frame — a header, a list, a help line… — that share its rows.
 * When there aren't enough, the least important sections are left out (null)
 * instead of squeezing everything; the rest get their height, and the `fill`
 * ones share what's left. SECTION rows apart (or `gap`).
 *
 *   const [head, list, help] = stack(inner, [{ h: 1, priority: 9 }, { min: 3, fill: 1, priority: 8 }, { h: 2, priority: 1 }]);
 *   if (help) drawHelp(help);
 */
export function stack(r: Rect, parts: StackPart[], gap = SECTION): (Rect | null)[] {
  const min = (p: StackPart) => Math.max(0, p.h ?? p.min ?? 1);
  const want = (p: StackPart) => (p.h !== undefined ? p.h : Math.max(min(p), p.min ?? 1));
  let kept = parts.map((p, i) => ({ p, i }));
  const total = (list: typeof kept, f: (p: StackPart) => number) => list.reduce((n, k) => n + f(k.p), 0) + gap * Math.max(0, list.length - 1);
  while (kept.length && total(kept, min) > r.h) {
    const worst = kept.reduce((a, b) => ((b.p.priority ?? 5) < (a.p.priority ?? 5) || ((b.p.priority ?? 5) === (a.p.priority ?? 5) && b.i > a.i) ? b : a));
    kept = kept.filter((k) => k !== worst);
  }
  const heights = new Map(kept.map((k) => [k.i, min(k.p)]));
  let spare = r.h - total(kept, min);
  // first up to what each one wants, then the fill ones share the rest by weight
  for (const k of kept) {
    const more = Math.min(spare, want(k.p) - min(k.p));
    heights.set(k.i, heights.get(k.i)! + more);
    spare -= more;
  }
  const fills = kept.filter((k) => (k.p.fill ?? 0) > 0);
  for (let pass = 0; pass < 4 && spare > 0 && fills.length; pass++) {
    const open = fills.filter((k) => heights.get(k.i)! < (k.p.max ?? Infinity));
    const weight = open.reduce((n, k) => n + k.p.fill!, 0);
    if (!weight) break;
    let given = 0;
    open.forEach((k, j) => {
      const share = j === open.length - 1 ? spare - given : Math.floor((spare * k.p.fill!) / weight);
      const add = Math.min(share, (k.p.max ?? Infinity) - heights.get(k.i)!);
      heights.set(k.i, heights.get(k.i)! + add);
      given += add;
    });
    spare -= given;
    if (!given) break;
  }
  const out: (Rect | null)[] = parts.map(() => null);
  let y = r.y;
  for (const k of kept) {
    const h = heights.get(k.i)!;
    out[k.i] = { x: r.x, y, w: r.w, h };
    y += h + gap;
  }
  return out;
}

// ── cards: things in rows that reflow with the width ─────────────────────────

/**
 * `n` cards (the days of a forecast, modules, clocks…) at least `minW` wide, as
 * many on a row as fit, GAP apart (or `gap`), rows SECTION apart (or `gapY`).
 * Cards share the width (never wider than `maxW`, then the row is centred).
 * `rects` holds every card's place, from the top of `r` — the ones below `r`
 * are there too (to scroll to); `shown` is how many fit entirely.
 *
 *   const { rects, shown } = cards(inner, days.length, { minW: 12, h: 5 });
 *   rects.slice(0, shown).forEach((cr, i) => drawDay(days[i], cr));
 */
export function cards(r: Rect, n: number, o: { minW: number; h: number; maxW?: number; gap?: number; gapY?: number }): { rects: Rect[]; perRow: number; rows: number; shown: number } {
  const gap = o.gap ?? GAP, gapY = o.gapY ?? SECTION;
  if (n <= 0 || r.w <= 0) return { rects: [], perRow: 0, rows: 0, shown: 0 };
  const perRow = Math.max(1, Math.min(n, Math.floor((r.w + gap) / (o.minW + gap))));
  const w = Math.max(1, Math.min(o.maxW ?? Infinity, Math.floor((r.w - gap * (perRow - 1)) / perRow)));
  const rowW = w * perRow + gap * (perRow - 1);
  const x0 = r.x + Math.max(0, Math.floor((r.w - rowW) / 2));
  const rects: Rect[] = [];
  for (let i = 0; i < n; i++) {
    const row = Math.floor(i / perRow), col = i % perRow;
    rects.push({ x: x0 + col * (w + gap), y: r.y + row * (o.h + gapY), w, h: o.h });
  }
  const rows = Math.ceil(n / perRow);
  const shown = rects.filter((c) => c.y + c.h <= r.y + r.h).length;
  return { rects, perRow, rows, shown };
}
