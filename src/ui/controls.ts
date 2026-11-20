import type { RGB } from "../core/color";
import { BOLD } from "../core/grid";
import { strWidth } from "../core/unicode";
import type { UI } from "./ui";

/**
 * THE small controls — one look each, for the deck and for modules (ib.lib.kit,
 * docs/UI_KIT.md). Each one draws itself, registers its own clicks and returns
 * where it ends, so a row is built left to right.
 *
 *   checkbox  [■] label           a box you tick (a "some" state: [▪])
 *   choice    ‹ value ›           one of several: ←→, a click on its left / right half
 *   tabs      ▌ ONE ▐  two  three  one page among several
 *
 * (The others: Field — ui/field.ts, slider — ui/slider.ts, ui.button, ListView,
 * FilterBar, the file browser, the dialogs; all listed in ui/kit.ts.)
 */

/** In plain text (the shell, a menu's label): the same box. */
export const BOX_ON = "☑";
export const BOX_OFF = "☐";

export interface CheckboxOptions {
  /** after the box */
  label?: string;
  /** the row it's on is the one you're on (brighter brackets) */
  hot?: boolean;
  disabled?: boolean;
  bg?: RGB;
  onClick?: () => void;
  tip?: string;
}

/** [■] / [ ] / [▪] (some), and its label. Returns the x after it. */
export function checkbox(ui: UI, x: number, y: number, on: boolean | "some", o: CheckboxOptions = {}): number {
  const c = ui.c;
  const st = o.bg !== undefined ? { bg: o.bg } : {};
  const edge = o.disabled ? c.faint : o.hot ? c.fg : c.subtle;
  ui.text(x, y, "[", { fg: edge, ...st });
  ui.text(x + 1, y, on === true ? "■" : on === "some" ? "▪" : " ", { fg: o.disabled ? c.faint : c.accent, attrs: BOLD, ...st });
  ui.text(x + 2, y, "]", { fg: edge, ...st });
  let end = x + 3;
  if (o.label) {
    end = ui.text(x + 4, y, o.label, { fg: o.disabled ? c.faint : on ? c.fg : c.subtle, attrs: o.hot ? BOLD : 0, ...st });
  }
  if (o.onClick && !o.disabled) ui.hit({ x, y, w: end - x, h: 1 }, { onClick: o.onClick, tip: o.tip });
  return end;
}

export interface ChoiceOptions {
  /** ‹ › show (on the row you're on); the value is always clickable */
  arrows?: boolean;
  /** -1 back, +1 forward */
  onStep?: (dir: 1 | -1) => void;
  fg?: RGB;
  bg?: RGB;
  attrs?: number;
  tip?: string;
}

/** ‹ value ›, the value starting at x (the ‹ two cells before it). A click on its left half goes back, the right half forward. Returns the x after ›. */
export function choice(ui: UI, x: number, y: number, value: string, o: ChoiceOptions = {}): number {
  const c = ui.c;
  const st = o.bg !== undefined ? { bg: o.bg } : {};
  const w = strWidth(value);
  ui.text(x, y, value, { fg: o.fg ?? c.accent, attrs: o.attrs ?? 0, ...st });
  if (o.onStep) {
    const half = Math.floor(w / 2);
    ui.hit({ x, y, w: half, h: 1 }, { onClick: () => o.onStep!(-1), tip: o.tip });
    ui.hit({ x: x + half, y, w: w - half, h: 1 }, { onClick: () => o.onStep!(1), tip: o.tip });
  }
  const arrow = (ax: number, ch: string, dir: 1 | -1) => {
    const ar = { x: ax - 1, y, w: 2, h: 1 };
    if (o.arrows) ui.text(ax, y, ch, { fg: ui.hovered(ar) ? c.fg : c.accent, attrs: BOLD, ...st });
    if (o.onStep) ui.hit(ar, { onClick: () => o.onStep!(dir) });
  };
  arrow(x - 2, "‹", -1);
  arrow(x + w + 1, "›", 1);
  return x + w + 2;
}

export interface TabsOptions {
  /** the first cell it may not use: tabs that don't fit aren't drawn (never over what follows) */
  end?: number;
  tip?: string;
  /** what each tab says (default: the tab itself) */
  label?: (tab: string) => string;
}

/** A row of tabs; the current one lit. Returns the x after the last one. */
export function tabs(ui: UI, x: number, y: number, list: readonly string[], current: string, onPick: (tab: string) => void, o: TabsOptions = {}): number {
  const c = ui.c;
  for (const tb of list) {
    const label = ` ${o.label ? o.label(tb) : tb} `;
    const rect = { x, y, w: strWidth(label), h: 1 };
    if (o.end !== undefined && x + rect.w > o.end) break; // no room: the rest aren't drawn (tab still reaches them)
    const on = tb === current;
    ui.text(x, y, label, on ? { fg: c.panel, bg: c.accent, attrs: BOLD } : { fg: ui.hovered(rect) ? c.accent : c.fg, bg: c.highlight });
    ui.hit(rect, { onClick: () => onPick(tb), tip: o.tip });
    x += rect.w + 1;
  }
  return x;
}
