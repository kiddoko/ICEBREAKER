import { mix } from "../core/color";
import type { Action } from "../core/input";
import type { Rect } from "../core/grid";
import type { MenuEntry, UI } from "./ui";

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
  /** one click is enough for these (a folder folds / unfolds); the others wait for a double-click */
  clickActivates?: (item: T) => boolean;
  /** Shell command a click on this item runs (shown in the shell and in the tooltip). */
  cmdOf?: (item: T) => string | undefined;
  tipOf?: (item: T) => string | undefined;
  /** Right-click menu of a row (the row gets selected first). */
  menuOf?: (item: T, index: number) => MenuEntry[];
  /** Called when the selection moves (e.g. to show a preview). */
  onSelect?: (item: T, index: number) => void;
  /**
   * Drag a row onto another (or onto the empty space under the rows: target
   * undefined). Set it to make rows draggable; one-click activation then waits
   * for the button to come up, so a drag never folds a folder.
   */
  onDrop?: (item: T, target: T | undefined) => void;
  /** a row lit as a drop target by something outside the list (files from the Finder) */
  hoverDrop: number | null = null;
  private lastRect: Rect = { x: 0, y: 0, w: 0, h: 0 };

  /** The item index at a screen cell (rows past the last: items.length), or -1 outside the list. */
  indexAt(x: number, y: number): number {
    const r = this.lastRect;
    if (x < r.x || x >= r.x + r.w || y < r.y || y >= r.y + r.h) return -1;
    return Math.min(this.items.length, Math.round(this.shownTop) + (y - r.y));
  }

  /** shown under the last row while a drag hovers there (target undefined) */
  dropEndLabel?: string;
  /** may `item` land on `target`? (else the target isn't lit) */
  canDrop?: (item: T, target: T | undefined) => boolean;
  /** a row being dragged: where it started, where the pointer is */
  private drag: { idx: number; x: number; y: number; over: number; active: boolean; outside: boolean } | null = null;
  /** a one-click activation waiting for the button to come up (drag-enabled lists) */
  private pending: number | null = null;

  /** the row being dragged, while a drag is on */
  get dragging(): T | undefined {
    return this.drag?.active ? this.items[this.drag.idx] : undefined;
  }
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
      // round at the ends: the last row is one step above the first
      case "up": this.select(this.selected === 0 ? this.items.length - 1 : this.selected - 1); return true;
      case "down": this.select(this.selected >= this.items.length - 1 ? 0 : this.selected + 1); return true;
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
    this.lastRect = r;
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
      const dragOn = this.drag?.active ? this.drag : null;
      const dropHere = dragOn && !dragOn.outside && dragOn.over === idx && idx !== dragOn.idx && (this.canDrop?.(this.items[dragOn.idx], item) ?? true);
      if (dropHere || this.hoverDrop === idx) ui.fill(row, { bg: mix(ui.c.accent, ui.c.panel, 0.55) });
      else if (isSel) ui.fill(row, { bg: age < 80 ? mix(ui.c.highlight, selBg, age / 80) : selBg });
      else if (idx === this.prevSel && age < 160) ui.fill(row, { bg: mix(selBg, ui.c.panel, age / 160) });
      else if (ui.hovered(row)) ui.fill(row, { bg: ui.c.highlight });
      // the row's hit goes first, so clickable bits drawn inside the row sit on top of it
      ui.hit(row, {
        cmd: this.cmdOf?.(item),
        tip: this.tipOf?.(item),
        menu: this.menuOf ? () => (this.select(idx), this.menuOf!(item, idx)) : undefined,
        onClick: (m) => {
          this.select(idx);
          if (this.onDrop) {
            this.drag = { idx, x: m.x, y: m.y, over: idx, active: false, outside: false };
            if (this.clickActivates?.(item)) this.pending = idx;
          } else if (this.clickActivates?.(item)) this.onActivate?.(item, idx);
        },
        onDrag: this.onDrop
          ? (m) => {
              const d = this.drag;
              if (!d) return;
              if (!d.active && (Math.abs(m.y - d.y) >= 1 || Math.abs(m.x - d.x) >= 3)) (d.active = true), (this.pending = null);
              d.outside = m.x < r.x || m.x >= r.x + r.w || m.y < r.y || m.y >= r.y + r.h;
              // near the top / bottom edge: the list scrolls
              if (d.active && m.y <= r.y && this.scrollTop > 0) this.scrollTop--;
              else if (d.active && m.y >= r.y + r.h - 1 && this.scrollTop < this.items.length - this.viewH) this.scrollTop++;
              d.over = Math.round(this.shownTop) + (m.y - r.y);
              ui.animate(16);
            }
          : undefined,
        onUp: this.onDrop
          ? () => {
              const d = this.drag;
              this.drag = null;
              if (d?.active) {
                const target = d.over >= 0 && d.over < this.items.length ? this.items[d.over] : undefined;
                const item = this.items[d.idx];
                if (!d.outside && item !== undefined && d.over !== d.idx && (this.canDrop?.(item, target) ?? true)) this.onDrop!(item, target);
              } else if (this.pending !== null) {
                const it = this.items[this.pending];
                if (it !== undefined) this.onActivate?.(it, this.pending);
              }
              this.pending = null;
            }
          : undefined,
        onDouble: () => {
          this.select(idx);
          if (!this.clickActivates?.(item)) this.onActivate?.(item, idx);
        },
      });
      drawRow(item, row, isSel, idx);
    }

    // dragging below the last row: it lands at the root (or wherever the list says)
    const dg = this.drag?.active ? this.drag : null;
    if ((this.hoverDrop !== null && this.hoverDrop >= this.items.length && this.dropEndLabel) || (dg && !dg.outside && dg.over >= this.items.length && this.dropEndLabel && (this.canDrop?.(this.items[dg.idx], undefined) ?? true))) {
      const y = r.y + this.items.length - top;
      if (y < r.y + r.h) ui.text(r.x + 1, y, this.dropEndLabel, { fg: ui.c.panel, bg: ui.c.accent });
    }
    if (this.items.length > this.viewH) {
      const thumbH = Math.max(1, Math.round((this.viewH * this.viewH) / this.items.length));
      const thumbY = r.y + Math.round((this.scrollTop / (this.items.length - this.viewH)) * (this.viewH - thumbH));
      ui.vline(r.x + r.w - 1, thumbY, thumbH, { fg: focused ? ui.c.accent : ui.c.subtle }, "▐");
    }
    ui.hit(r, { onWheel: (d) => (this.scrollTop = Math.max(0, this.scrollTop + d)) });
  }
}
