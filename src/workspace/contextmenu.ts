import { BOLD, type Rect } from "../core/grid";
import type { Action, KeyInput } from "../core/input";
import { strWidth } from "../core/unicode";
import type { MenuEntry, MenuItem, UI } from "../ui/ui";
import type { Overlay } from "./overlays";

interface Level {
  items: MenuEntry[];
  /** where the menu wants to be (top-left); clamped to the screen when drawn */
  x: number;
  y: number;
  sel: number;
  /** last drawn box */
  box?: Rect;
  opened: number;
}

const selectable = (e: MenuEntry | undefined): e is MenuItem => !!e && e !== "-" && !e.disabled;
const subOf = (it: MenuItem): MenuEntry[] => (typeof it.sub === "function" ? it.sub() : it.sub ?? []);

/**
 * The right-click menu: a small box at the mouse with actions for the thing
 * under it. Keyboard (↑↓ enter → ← esc, a letter jumps), mouse and gamepad.
 * Sub-menus (colours, icons…) open on the right.
 */
export class ContextMenu implements Overlay {
  modal = true;
  done = false;
  private levels: Level[];
  private lastMouse = { x: -1, y: -1 };
  /** index of this menu's first hit in the frame (what's below it comes before) */
  hitStart = 0;

  constructor(
    items: MenuEntry[],
    x: number,
    y: number,
    private readonly runItem: (it: MenuItem) => void,
    private readonly title?: string,
  ) {
    this.levels = [{ items: tidy(items), x, y, sel: -1, opened: performance.now() }];
    this.levels[0].sel = this.next(this.levels[0], -1, 1);
  }

  private get top(): Level {
    return this.levels[this.levels.length - 1];
  }

  /** the next selectable line after `from` going `dir` (wraps) */
  private next(l: Level, from: number, dir: 1 | -1): number {
    const n = l.items.length;
    for (let k = 1; k <= n; k++) {
      const i = (((from + dir * k) % n) + n) % n;
      if (selectable(l.items[i])) return i;
    }
    return -1;
  }

  private activate(depth = this.levels.length - 1): void {
    const l = this.levels[depth];
    const it = l.items[l.sel];
    if (!selectable(it)) return;
    if (it.sub) return this.openSub(depth);
    this.done = true;
    this.runItem(it);
  }

  private openSub(depth: number): void {
    const l = this.levels[depth];
    const it = l.items[l.sel];
    this.levels.length = depth + 1;
    if (!selectable(it) || !it.sub) return;
    const items = tidy(subOf(it));
    if (!items.length) return;
    const b = l.box ?? { x: l.x, y: l.y, w: 20, h: 3 };
    const sub: Level = { items, x: b.x + b.w - 1, y: b.y + l.sel, sel: -1, opened: performance.now() };
    sub.sel = this.next(sub, -1, 1);
    this.levels.push(sub);
  }

  private back(): void {
    if (this.levels.length > 1) this.levels.pop();
    else this.done = true;
  }

  onKey(k: KeyInput): boolean {
    const l = this.top;
    if (k.key === "esc") this.back();
    else if (k.key === "up") l.sel = this.next(l, l.sel, -1);
    else if (k.key === "down" || k.combo === "tab") l.sel = this.next(l, l.sel, 1);
    else if (k.key === "left") this.back();
    else if (k.key === "right") {
      const it = l.items[l.sel];
      if (selectable(it) && it.sub) this.openSub(this.levels.length - 1);
    } else if (k.key === "enter" || k.key === "space") this.activate();
    else if (k.key === "home") l.sel = this.next(l, -1, 1);
    else if (k.key === "end") l.sel = this.next(l, 0, -1);
    else if (k.combo === "contextmenu" || k.combo === "shift+f10") this.done = true;
    return true;
  }

  /** a letter jumps to the next line starting with it */
  onText(t: string): boolean {
    const l = this.top;
    const ch = t.trim().toLowerCase();
    if (!ch) return true;
    const n = l.items.length;
    for (let k = 1; k <= n; k++) {
      const i = (l.sel + k) % n;
      const it = l.items[i];
      if (selectable(it) && it.label.toLowerCase().startsWith(ch)) {
        l.sel = i;
        break;
      }
    }
    return true;
  }

  onAction(a: Action): boolean {
    const l = this.top;
    if (a === "up") l.sel = this.next(l, l.sel, -1);
    else if (a === "down" || a === "item-next") l.sel = this.next(l, l.sel, 1);
    else if (a === "confirm" || a === "right") this.activate();
    else if (a === "back" || a === "left" || a === "menu") this.back();
    return true;
  }

  /** Is (x, y) on one of the menu's boxes? */
  contains(x: number, y: number): boolean {
    return this.levels.some((l) => l.box && x >= l.box.x && y >= l.box.y && x < l.box.x + l.box.w && y < l.box.y + l.box.h);
  }

  render(ui: UI, screen: Rect): void {
    const c = ui.c;
    this.hitStart = ui.hits.length;
    const moved = ui.mouse.x !== this.lastMouse.x || ui.mouse.y !== this.lastMouse.y;
    this.lastMouse = { ...ui.mouse };
    // anything outside closes it (left or right click)
    ui.hit(screen, { onClick: () => (this.done = true), onRight: () => (this.done = true), onWheel: () => {}, block: true });

    this.levels.forEach((l, depth) => {
      const items = l.items;
      const labelW = Math.max(6, ...items.map((e) => (e === "-" ? 0 : strWidth(e.label) + (e.color !== undefined || e.checked !== undefined ? 2 : 0))));
      const hintW = Math.max(0, ...items.map((e) => (e === "-" ? 0 : e.sub ? 1 : strWidth(e.hint ?? ""))));
      const titleW = depth === 0 && this.title ? strWidth(this.title) + 4 : 0;
      let w = Math.min(screen.w - 2, Math.max(titleW, labelW + (hintW ? hintW + 3 : 0) + 4));
      const h = Math.min(screen.h - 2, items.length + 2);
      let x = l.x;
      let y = l.y;
      // flip to the left of the mouse / parent when it would leave the screen
      if (x + w > screen.x + screen.w - 1) {
        const parent = this.levels[depth - 1]?.box;
        x = parent ? parent.x - w + 1 : x - w;
      }
      x = Math.max(screen.x, Math.min(x, screen.x + screen.w - w));
      if (y + h > screen.y + screen.h - 1) y = depth === 0 ? Math.max(screen.y, l.y - h + 1) : screen.y + screen.h - h - 1;
      y = Math.max(screen.y, y);
      w = Math.max(4, w);
      const box = { x, y, w, h };
      l.box = box;

      // a quick unfold, line by line
      const age = performance.now() - l.opened;
      const shown = Math.min(items.length, Math.ceil(age / 14) + 1);
      if (shown < items.length) ui.animate(16);

      const inner = ui.box({ ...box, h: Math.min(h, shown + 2) }, { bg: c.panelAlt, border: "single", focused: depth === this.levels.length - 1, title: depth === 0 ? this.title : undefined });
      // the box itself swallows clicks between lines
      ui.hit(box, { onClick: () => {}, onRight: () => {}, block: true });
      for (let i = 0; i < Math.min(shown, inner.h); i++) {
        const e = items[i];
        const ry = inner.y + i;
        if (e === "-") {
          ui.hline(inner.x, ry, inner.w, { fg: c.faint, bg: c.panelAlt }, "┄");
          continue;
        }
        const row = { x: inner.x, y: ry, w: inner.w, h: 1 };
        if (moved && ui.hovered(row) && !e.disabled && l.sel !== i) {
          l.sel = i;
          this.levels.length = depth + 1;
          if (e.sub) this.openSub(depth);
        }
        const sel = l.sel === i && !e.disabled;
        const bg = sel ? (e.danger ? c.error : c.accent) : c.panelAlt;
        const fg = e.disabled ? c.faint : sel ? c.panel : e.danger ? c.error : c.fg;
        ui.fill(row, { bg });
        let tx = inner.x + 1;
        if (e.checked !== undefined) tx = ui.text(tx, ry, e.checked ? "✓ " : "  ", { fg: sel ? c.panel : c.accent, bg });
        else if (e.color !== undefined) tx = ui.text(tx, ry, "● ", { fg: e.color, bg });
        ui.text(tx, ry, e.label, { fg, bg, attrs: sel ? BOLD : 0 }, inner.w - (tx - inner.x) - (hintW ? hintW + 2 : 1));
        const right = e.sub ? "▸" : e.hint ?? "";
        if (right) ui.textRight(inner.x + inner.w - 1, ry, right, { fg: sel ? c.panel : c.subtle, bg });
        ui.hit(row, {
          onClick: () => {
            l.sel = i;
            this.levels.length = depth + 1;
            this.activate(depth);
          },
          onRight: () => {
            l.sel = i;
            this.levels.length = depth + 1;
            this.activate(depth);
          },
          block: true,
        });
      }
    });
  }
}

/** No separator at the start, the end, or twice in a row. */
function tidy(items: MenuEntry[]): MenuEntry[] {
  const out: MenuEntry[] = [];
  for (const e of items) {
    if (e === "-" && (!out.length || out[out.length - 1] === "-")) continue;
    out.push(e);
  }
  while (out[out.length - 1] === "-") out.pop();
  return out;
}
