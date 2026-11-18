import { mix } from "../core/color";
import type { Action } from "../core/input";
import type { Rect } from "../core/grid";
import type { UI } from "./ui";

/**
 * A scrollable, selectable list. You give it items and a function that draws
 * one row; it handles selection, scrolling, mouse, keyboard and gamepad.
 *
 *   const list = new ListView<string>();
 *   list.items = ["a", "b"];
 *   list.onActivate = (item) => open(item);
 *   list.render(ui, rect, focused, (item, row, selected) => ui.text(row.x, row.y, item));
 */
export class ListView<T> {
  items: T[] = [];
  selected = 0;
  scrollTop = 0;
  /** where the view really is (eases toward scrollTop: page jumps glide) */
  private shownTop = 0;
  private prevSel = -1;
  private selAt = 0;
  onActivate?: (item: T, index: number) => void;
  /** Shell command a click on this item runs (shown in the shell and in the tooltip). */
  cmdOf?: (item: T) => string | undefined;
  tipOf?: (item: T) => string | undefined;
  /** Called when the selection moves (e.g. to show a preview). */
  onSelect?: (item: T, index: number) => void;
  private viewH = 1;
  private reveal = false;

  get current(): T | undefined {
    return this.items[this.selected];
  }

  select(i: number): void {
    if (this.items.length === 0) {
      this.selected = 0;
      return;
    }
    const n = Math.max(0, Math.min(this.items.length - 1, i));
    const changed = n !== this.selected;
    if (changed) {
      this.prevSel = this.selected;
      this.selAt = performance.now();
    }
    this.selected = n;
    this.reveal = true; // scrolled into view at the next render, when the height is known
    if (changed) this.onSelect?.(this.items[n], n);
  }

  /** Navigation shared by keyboard and gamepad. Returns true if handled. */
  onAction(a: Action): boolean {
    switch (a) {
      case "up": this.select(this.selected - 1); return true;
      case "down": this.select(this.selected + 1); return true;
      case "page-up": this.select(this.selected - this.viewH + 1); return true;
      case "page-down": this.select(this.selected + this.viewH - 1); return true;
      case "home": this.select(0); return true;
      case "end": this.select(this.items.length - 1); return true;
      case "scroll-up": this.select(this.selected - 3); return true;
      case "scroll-down": this.select(this.selected + 3); return true;
      case "confirm": {
        const item = this.current;
        if (item !== undefined) this.onActivate?.(item, this.selected);
        return item !== undefined;
      }
      default: return false;
    }
  }

  render(ui: UI, r: Rect, focused: boolean, drawRow: (item: T, row: Rect, selected: boolean, index: number) => void): void {
    this.viewH = Math.max(1, r.h);
    if (this.reveal) {
      if (this.selected < this.scrollTop) this.scrollTop = this.selected;
      if (this.selected >= this.scrollTop + this.viewH) this.scrollTop = this.selected - this.viewH + 1;
      this.reveal = false;
    }
    this.scrollTop = Math.max(0, Math.min(this.scrollTop, Math.max(0, this.items.length - this.viewH)));
    if (this.selected >= this.items.length) this.selected = Math.max(0, this.items.length - 1);
    // smooth scroll: the view eases toward its target, a few rows per frame
    const gap = this.scrollTop - this.shownTop;
    if (Math.abs(gap) > 0.5 && Math.abs(gap) < this.viewH * 3) {
      this.shownTop += gap * 0.45;
      ui.animate(16);
    } else this.shownTop = this.scrollTop;
    const top = Math.round(this.shownTop);
    // the selection glides: the new row fades in, the old one fades out
    const age = performance.now() - this.selAt;
    if (age < 160) ui.animate(16);
    const selBg = focused ? ui.c.selection : ui.c.highlight;

    for (let i = 0; i < this.viewH; i++) {
      const idx = top + i;
      const item = this.items[idx];
      if (item === undefined) break;
      const row = { x: r.x, y: r.y + i, w: r.w, h: 1 };
      const isSel = idx === this.selected;
      if (isSel) ui.fill(row, { bg: age < 80 ? mix(ui.c.highlight, selBg, age / 80) : selBg });
      else if (idx === this.prevSel && age < 160) ui.fill(row, { bg: mix(selBg, ui.c.panel, age / 160) });
      else if (ui.hovered(row)) ui.fill(row, { bg: ui.c.highlight });
      // the row's hit goes first, so clickable bits drawn inside the row sit on top of it
      ui.hit(row, {
        cmd: this.cmdOf?.(item),
        tip: this.tipOf?.(item),
        onClick: () => this.select(idx),
        onDouble: () => {
          this.select(idx);
          this.onActivate?.(item, idx);
        },
      });
      drawRow(item, row, isSel, idx);
    }

    if (this.items.length > this.viewH) {
      const thumbH = Math.max(1, Math.round((this.viewH * this.viewH) / this.items.length));
      const thumbY = r.y + Math.round((this.scrollTop / (this.items.length - this.viewH)) * (this.viewH - thumbH));
      ui.vline(r.x + r.w - 1, thumbY, thumbH, { fg: focused ? ui.c.accent : ui.c.subtle }, "▐");
    }
    ui.hit(r, { onWheel: (d) => (this.scrollTop = Math.max(0, this.scrollTop + d)) });
  }
}
