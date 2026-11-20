import type { RGB } from "../core/color";
import { BOLD } from "../core/grid";
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
