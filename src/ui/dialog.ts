import type { RGB } from "../core/color";
import type { Rect } from "../core/grid";
import { t } from "../core/i18n";
import { strWidth } from "../core/unicode";
import { GAP, INSET } from "./layout";
import type { UI } from "./ui";

/**
 * THE BUTTONS OF A DIALOG — one place, one rule (docs/UI_KIT.md): always in the
 * bottom-right corner, the way out on the left, the way forward on the right —
 * No | Yes, cancel | OK, close | open. Yes is always the last cell before the
 * frame's edge (INSET from it), whatever the text above says, so the hand learns
 * where it is.
 *
 *   dialogButtons(ui, inner, [
 *     { label: NO(), run: () => finish(false), selected: !choice, accent: c.error },
 *     { label: YES(), run: () => finish(true), selected: choice },
 *   ]);
 *
 * Give them in reading order (the way out first). Returns the x where the first
 * button starts: the room on its left is for a hint ("esc closes").
 */
export interface DialogButton {
  label: string;
  run: () => void;
  /** lit: what enter does now */
  selected?: boolean;
  accent?: RGB;
  tip?: string;
  disabled?: boolean;
}

export function dialogButtons(ui: UI, inner: Rect, buttons: DialogButton[], y = inner.y + inner.h - 1): number {
  let x = inner.x + inner.w - INSET;
  for (const b of [...buttons].reverse()) {
    const w = strWidth(b.label) + 2;
    if (x - w < inner.x) break; // never out of the frame (debug layout would say "cut")
    x -= w;
    ui.button(x, y, b.label, b.run, { selected: b.selected, accent: b.accent, tip: b.tip, disabled: b.disabled });
    x -= GAP;
  }
  return x + GAP;
}

/** The labels, translated (functions: the language can change while the deck runs). */
export const YES = () => t("[Y]es");
export const NO = () => t("[N]o");
export const OK = () => t("OK  ⏎");
export const CANCEL = () => t("cancel  esc");
export const CLOSE = () => t("close  esc");
