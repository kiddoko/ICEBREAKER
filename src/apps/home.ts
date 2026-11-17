import { BOLD, type Rect } from "../core/grid";
import type { Action, KeyInput } from "../core/input";
import type { Deck } from "../deck";
import { drawAmbient } from "../fx/ambient";
import type { UI } from "../ui/ui";
import { DEFAULT_LAYOUT } from "../widgets/builtin";
import type { WidgetPlacement } from "../widgets/types";
import type { App, AppSpec } from "./types";

/** Grid geometry: 12 columns, one row unit = 2 text rows. */
const COLS = 12;
const ROW = 2;

/**
 * HOME — a dashboard of widgets on a 12-column grid.
 *
 *   ←↑↓→ / click   select a widget       enter   open it (calendar → journal…)
 *   e              edit the layout       m       MODULES (all apps)
 *
 * In edit mode: arrows move, shift+arrows resize, a adds, x removes, r resets,
 * esc/e/enter is done. The mouse drags widgets around too.
 * The layout is saved in settings.json → home.widgets.
 */
export class HomeApp implements App {
  readonly kind = "home";
  readonly key = "home";
  private selected = 0;
  private editing = false;
  private drag: { index: number; dx: number; dy: number } | null = null;
  private colW = 1;
  private origin = { x: 0, y: 0 };

  constructor(private readonly deck: Deck) {}

  title(): string {
    return "home";
  }

  status(): string {
    return this.editing
      ? "EDIT · arrows move · shift+arrows resize · a add · x remove · r reset · esc done"
      : "←↑↓→ select · enter open · e edit layout · m modules · ctrl+k everything else";
  }

  private get layout(): WidgetPlacement[] {
    const saved = this.deck.settings.data.home.widgets;
    return saved.length ? saved : DEFAULT_LAYOUT;
  }

  private save(layout: WidgetPlacement[]): void {
    this.deck.settings.set("home.widgets", layout.map((p) => ({ ...p })));
  }

  /** Widgets whose spec is loaded (a plugin may have been removed). */
  private placed(): { p: WidgetPlacement; i: number }[] {
    return this.layout.map((p, i) => ({ p, i })).filter(({ p }) => this.deck.widgets.get(p.id));
  }

  private overlaps(layout: WidgetPlacement[], i: number, c: WidgetPlacement): boolean {
    return layout.some((o, j) => j !== i && c.x < o.x + o.w && o.x < c.x + c.w && c.y < o.y + o.h && o.y < c.y + c.h);
  }

  /** Move/resize widget i if the result stays on the grid and doesn't overlap. */
  private change(i: number, f: (p: WidgetPlacement) => WidgetPlacement): void {
    const layout = this.layout.map((p) => ({ ...p }));
    const cur = layout[i];
    if (!cur) return;
    const spec = this.deck.widgets.get(cur.id);
    const min = spec?.min ?? { w: 1, h: 1 };
    const next = f({ ...cur });
    if (next.x < 0 || next.y < 0 || next.x + next.w > COLS || next.w < min.w || next.h < min.h) return;
    if (this.overlaps(layout, i, next)) return;
    layout[i] = next;
    this.save(layout);
  }

  private async add(): Promise<void> {
    const used = new Set(this.layout.map((p) => p.id));
    const free = this.deck.widgets.list().filter((s) => !used.has(s.id));
    if (!free.length) return this.deck.notify("every widget is already on the grid");
    const pick = await this.deck.prompt(`add widget: ${free.map((s) => s.id).join(", ")}`, { initial: free[0].id });
    const spec = free.find((s) => s.id === pick?.trim());
    if (!spec) return;
    const layout = this.layout.map((p) => ({ ...p }));
    const bottom = layout.reduce((m, p) => Math.max(m, p.y + p.h), 0);
    const w = Math.min(COLS, spec.size.w);
    // first free spot, scanning rows top to bottom
    for (let y = 0; y <= bottom; y++) {
      for (let x = 0; x + w <= COLS; x++) {
        const cand = { id: spec.id, x, y, w, h: spec.size.h };
        if (!this.overlaps(layout, -1, cand)) {
          layout.push(cand);
          this.selected = layout.length - 1;
          return this.save(layout);
        }
      }
    }
  }

  private remove(i: number): void {
    const layout = this.layout.filter((_, j) => j !== i);
    this.selected = Math.max(0, Math.min(this.selected, layout.length - 1));
    this.save(layout);
  }

  /** Pick the nearest widget in a direction (for keyboard/gamepad navigation). */
  private neighbor(dir: "left" | "right" | "up" | "down"): number {
    const items = this.placed();
    const cur = this.layout[this.selected];
    if (!cur) return items[0]?.i ?? 0;
    const cx = cur.x + cur.w / 2;
    const cy = cur.y + cur.h / 2;
    let best = this.selected;
    let bestD = Infinity;
    for (const { p, i } of items) {
      if (i === this.selected) continue;
      const dx = p.x + p.w / 2 - cx;
      const dy = p.y + p.h / 2 - cy;
      const ok = dir === "left" ? dx < 0 : dir === "right" ? dx > 0 : dir === "up" ? dy < 0 : dy > 0;
      if (!ok) continue;
      const d = dir === "left" || dir === "right" ? Math.abs(dx) + Math.abs(dy) * 2 : Math.abs(dy) + Math.abs(dx) * 2;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  }

  /** Letters arrive as text (they're printable), so route them to the same shortcuts. */
  onText(t: string): boolean {
    if (t.length !== 1 || !"emaxr".includes(t)) return false;
    return this.onKey({ key: t, code: "", ctrl: false, alt: false, shift: false, meta: false, combo: t });
  }

  onKey(k: KeyInput): boolean {
    if (!this.editing) {
      if (k.combo === "e") return (this.editing = true);
      if (k.combo === "m") return void this.deck.openApp("modules"), true;
      return false;
    }
    const i = this.selected;
    switch (k.combo) {
      case "left": this.change(i, (p) => ({ ...p, x: p.x - 1 })); return true;
      case "right": this.change(i, (p) => ({ ...p, x: p.x + 1 })); return true;
      case "up": this.change(i, (p) => ({ ...p, y: p.y - 1 })); return true;
      case "down": this.change(i, (p) => ({ ...p, y: p.y + 1 })); return true;
      case "shift+left": this.change(i, (p) => ({ ...p, w: p.w - 1 })); return true;
      case "shift+right": this.change(i, (p) => ({ ...p, w: p.w + 1 })); return true;
      case "shift+up": this.change(i, (p) => ({ ...p, h: p.h - 1 })); return true;
      case "shift+down": this.change(i, (p) => ({ ...p, h: p.h + 1 })); return true;
      case "tab": this.selected = (this.selected + 1) % Math.max(1, this.layout.length); return true;
      case "a": void this.add(); return true;
      case "x": case "delete": case "backspace": this.remove(i); return true;
      case "r": this.save([]); this.selected = 0; return true;
      case "e": case "esc": case "enter": this.editing = false; return true;
      default: return false;
    }
  }

  onAction(a: Action): boolean {
    switch (a) {
      case "left": case "right": case "up": case "down": this.selected = this.neighbor(a); return true;
      case "confirm": {
        const p = this.layout[this.selected];
        const spec = p && this.deck.widgets.get(p.id);
        spec?.activate?.({ deck: this.deck, focused: true });
        return true;
      }
      default: return false;
    }
  }

  render(ui: UI, r: Rect, focused: boolean): void {
    const c = ui.c;
    if (this.deck.settings.data.fx.ambient && !this.editing) drawAmbient(ui, r, 0.6);
    const area = { x: r.x + 1, y: r.y + 1, w: r.w - 2, h: r.h - 1 };
    // Columns stretch to the full width (cell edges are rounded, so they never drift).
    this.colW = Math.max(4, area.w / COLS);
    this.origin = { x: area.x, y: area.y };
    const colX = (n: number) => this.origin.x + Math.round(n * this.colW);
    const toRect = (p: WidgetPlacement): Rect => ({
      x: colX(p.x),
      y: this.origin.y + p.y * ROW,
      w: colX(p.x + p.w) - colX(p.x) - 1,
      h: p.h * ROW - 1,
    });

    if (this.editing) {
      // grid dots so you can see where things snap
      for (let gy = 0; this.origin.y + gy * ROW < r.y + r.h; gy++)
        for (let gx = 0; gx <= COLS; gx++) ui.text(colX(gx) - (gx ? 1 : 0), this.origin.y + gy * ROW, "·", { fg: c.faint });
    }

    if (!this.placed().length) {
      ui.textCenter(r, r.y + Math.floor(r.h / 2), "empty deck — press e then a to add a widget", { fg: c.muted });
    }
    this.selected = Math.min(this.selected, Math.max(0, this.layout.length - 1));

    for (const { p, i } of this.placed()) {
      const spec = this.deck.widgets.get(p.id)!;
      const rect = toRect(p);
      if (rect.y >= r.y + r.h || rect.h < 2) continue;
      rect.h = Math.min(rect.h, r.y + r.h - rect.y);
      const sel = focused && i === this.selected;
      const inner = ui.box(rect, {
        title: spec.title.toUpperCase(),
        info: this.editing && sel ? `${p.w}×${p.h}` : undefined,
        focused: sel,
        border: this.editing && sel ? "heavy" : "round",
      });
      ui.hit(rect, {
        onClick: (m) => {
          this.selected = i;
          if (this.editing) this.drag = { index: i, dx: m.x - rect.x, dy: m.y - rect.y };
        },
        onDrag: (m) => {
          const d = this.drag;
          if (!this.editing || !d || d.index !== i) return;
          const nx = Math.round((m.x - this.origin.x - d.dx) / this.colW);
          const ny = Math.round((m.y - this.origin.y - d.dy) / ROW);
          this.change(i, (q) => ({ ...q, x: Math.max(0, Math.min(COLS - q.w, nx)), y: Math.max(0, ny) }));
        },
        onDouble: () => !this.editing && spec.activate?.({ deck: this.deck, focused: true }),
      });
      ui.clip(inner, () => {
        try {
          spec.render(ui, inner, { deck: this.deck, focused: sel });
        } catch (e) {
          ui.text(inner.x, inner.y, `⚠ ${e instanceof Error ? e.message : e}`, { fg: c.error }, inner.w);
        }
      });
    }

    if (this.editing) ui.textRight(r.x + r.w - 1, r.y, " EDIT LAYOUT ", { fg: c.panel, bg: c.accent, attrs: BOLD });
  }
}

export const homeSpec: AppSpec = {
  kind: "home",
  title: "Home",
  create: (deck) => new HomeApp(deck),
};
