import { allWidgetKeys, focusWidget, forgetWidget, keyOf, newWidgetKey, widgetIdOf } from "../widgets/instances";
import { Glide } from "../ui/glide";
import { t } from "../core/i18n";
import { mix } from "../core/color";
import { strWidth } from "../core/unicode";
import { BOLD, type Rect } from "../core/grid";
import { IS_MAC, type Action, type KeyInput } from "../core/input";
import type { Deck } from "../deck";
import { drawBackground } from "../fx/backgrounds";
import { inside, type MenuEntry, type UI } from "../ui/ui";
import { DEFAULT_LAYOUT } from "../widgets/builtin";
import type { WidgetPlacement } from "../widgets/types";
import type { App, AppSpec } from "./types";
import { WidgetPicker } from "../workspace/widgetpicker";
import { INSET } from "../ui/layout";

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
  /** edit mode is the workspace's: HOME and the side panel are edited together */
  private get editing(): boolean {
    return this.deck.workspace.editing;
  }
  private set editing(on: boolean) {
    this.deck.workspace.editing = on;
  }
  /** edit mode is on (the side panel shows its own edit controls then) */
  get isEditing(): boolean {
    return this.editing;
  }
  /** a widget being dragged: where it was grabbed, where the mouse is, where it would land */
  private drag: { index: number; dx: number; dy: number; mx: number; my: number; spot: WidgetPlacement | null } | null = null;
  private colW = 1;
  /** a widget being resized by its corner (index), -1 none */
  private sizing = -1;
  private origin = { x: 0, y: 0 };
  /** Vertical scroll in text rows (the grid can be taller than the screen). */
  private scroll = 0;
  /** the wheel's glide (ui/glide.ts) */
  private readonly glide = new Glide();
  private areaH = 40;
  /** Scroll so the selected widget is visible on the next frame. */
  private reveal = false;
  // animation clocks (ui.now ms)
  private shownAt = 0;
  private selAt = 0;
  private lastSel = -1;

  constructor(private readonly deck: Deck) {}

  title(): string {
    return "home";
  }

  status(): string {
    return this.editing
      ? t("EDIT · arrows move · shift+arrows resize · a add · x remove · r reset · esc done")
      : t("←↑↓→ select · enter open · [ ] pages · ctrl+e edit layout · m modules · ctrl+k everything else");
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
    return (this.editing ? this.layout : this.compact(this.layout)).map((p, i) => ({ p, i })).filter(({ p }) => (p.page ?? 0) === this.page && this.deck.widgets.get(p.id));
  }

  private overlaps(layout: WidgetPlacement[], i: number, c: WidgetPlacement): boolean {
    return layout.some((o, j) => j !== i && (o.page ?? 0) === (c.page ?? 0) && c.x < o.x + o.w && o.x < c.x + c.w && c.y < o.y + o.h && o.y < c.y + c.h);
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
    if (spec?.max && (next.w > spec.max.w || next.h > spec.max.h)) return; // a shortcut square stays 1×1
    if (this.overlaps(layout, i, next)) return;
    layout[i] = next;
    this.want = { i, w: next.w, h: next.h }; // a deliberate resize sets the size to come back to
    this.save(layout);
  }

  /** Size a widget would like to have while it's moved around (its size before it had to shrink). */
  private want: { i: number; w: number; h: number } | null = null;
  /** screen lines per grid row (ROW at least; more when the page has room) */
  private rowH = ROW;

  /** Biggest size ≤ the wanted one (≥ the widget's minimum) that fits at (x, y), or null. */
  private fitAt(layout: WidgetPlacement[], i: number, x: number, y: number): WidgetPlacement | null {
    const cur = layout[i];
    const min = this.deck.widgets.get(cur.id)?.min ?? { w: 1, h: 1 };
    const want = this.want?.i === i ? this.want : { w: cur.w, h: cur.h };
    if (x < 0 || y < 0 || x + min.w > COLS) return null;
    const sizes: [number, number][] = [];
    for (let h = want.h; h >= min.h; h--) for (let w = Math.min(want.w, COLS - x); w >= min.w; w--) sizes.push([w, h]);
    sizes.sort((a, b) => b[0] * b[1] - a[0] * a[1]);
    for (const [w, h] of sizes) {
      const cand = { ...cur, x, y, w, h };
      if (!this.overlaps(layout, i, cand)) return cand;
    }
    return null;
  }

  /**
   * Keyboard move: one step in a direction. If the widget doesn't fit there it
   * shrinks (down to its minimum); if even that is blocked, it hops over what's
   * in the way to the next spot that works. It grows back when there's room.
   */
  private move(i: number, dx: number, dy: number): void {
    const layout = this.layout.map((p) => ({ ...p }));
    const cur = layout[i];
    if (!cur) return;
    if (this.want?.i !== i) this.want = { i, w: cur.w, h: cur.h };
    const bottom = layout.filter((p) => ((p.page ?? 0) === this.page)).reduce((m, p) => Math.max(m, p.y + p.h), 0);
    for (let step = 1; step <= Math.max(COLS, bottom + 2); step++) {
      const x = cur.x + dx * step, y = cur.y + dy * step;
      if (x < 0 || y < 0 || x >= COLS || y > bottom + 1) return;
      const spot = this.fitAt(layout, i, x, y);
      if (spot) return this.place2(layout, i, spot);
    }
  }

  private place2(layout: WidgetPlacement[], i: number, spot: WidgetPlacement): void {
    const was = layout[i];
    layout[i] = spot;
    this.reveal = true;
    this.save(layout);
    const w = this.want;
    if (w && (spot.w < w.w || spot.h < w.h) && (was.w >= w.w && was.h >= w.h)) this.deck.notify(`${this.deck.widgets.get(spot.id)?.title ?? spot.id}: shrunk to fit — it grows back where there's room (shift+arrows to resize)`);
  }

  /** The widget picker (list + description + live preview). */
  add(): void {
    this.deck.workspace.push(new WidgetPicker(this.deck));
  }

  /**
   * Put a widget on the grid: the first free spot that's on screen, trying
   * the default size then smaller ones down to the minimum; else below the
   * rest (the HOME scrolls). Returns false if it's already there or unknown.
   */
  place(what: string, keep = false): boolean {
    // a widget can be placed several times: each copy has its own key (widgets/instances.ts);
    // `keep` (a widget moving here from the side panel) keeps its key, and its settings
    const id = widgetIdOf(what);
    // (the keys on screen count too: HOME's default layout isn't saved until it changes, and a
    // second NEWS was refused as "already on the grid")
    const key = keep || what.includes("#") ? what : newWidgetKey(this.deck, id, this.layout.map(keyOf));
    const spec = this.deck.widgets.get(id);
    if (!spec || this.layout.some((p) => keyOf(p) === key)) return false;
    const layout = this.layout.map((p) => ({ ...p }));
    const visible = Math.max(1, Math.floor(this.areaH / this.rowH));
    const sizes: [number, number][] = [];
    const min = spec.min ?? { w: 1, h: 1 };
    // shrink a little to fit on screen, never down to a useless sliver
    const minH = Math.max(min.h, Math.ceil((spec.size.h + min.h) / 2));
    for (let h = spec.size.h; h >= minH; h--) for (let w = Math.min(COLS, spec.size.w); w >= min.w; w--) sizes.push([w, h]);
    const fit = (page: number, maxY: number): WidgetPlacement | null => {
      for (const [w, h] of sizes)
        for (let y = 0; y + h <= maxY; y++)
          for (let x = 0; x + w <= COLS; x++) {
            const cand: WidgetPlacement = { id, ...(key !== id ? { key } : {}), page, x, y, w, h };
            if (!this.overlaps(layout, -1, cand)) return cand;
          }
      return null;
    };
    // here if it fits on screen; else the next page with room; else a new page.
    // Never below the bottom of the screen, where nobody would see it.
    const pages = this.pageCount();
    let spot = fit(this.page, visible);
    for (let k = 1; !spot && k < pages; k++) spot = fit((this.page + k) % pages, visible);
    spot ??= fit(pages, visible) ?? { id, ...(key !== id ? { key } : {}), page: pages, x: 0, y: 0, w: Math.min(COLS, spec.size.w), h: spec.size.h };
    layout.push(spot);
    this.selected = layout.length - 1;
    this.reveal = true;
    this.save(layout);
    if ((spot.page ?? 0) !== this.page) {
      this.setPage(spot.page ?? 0);
      this.deck.notify(t("{name}: no room here — it's on page {n}", { name: t(spec.title), n: (spot.page ?? 0) + 1 }));
    }
    return true;
  }

  /** Current page (0-based). Widgets live on one page each (placement.page). */
  page = 0;

  /** Pages that exist: the highest page used, plus the one we're on. */
  pageCount(): number {
    return Math.max(this.page, ...this.layout.map((p) => p.page ?? 0)) + 1;
  }

  /** Go to a page; one past the last makes a new empty page. */
  setPage(n: number): void {
    this.page = Math.max(0, Math.min(this.pageCount(), n));
    this.scroll = 0;
    this.selected = this.placed()[0]?.i ?? 0;
    this.deck.notify(`HOME page ${this.page + 1}/${this.pageCount()}`);
  }

  /** Send a widget to another page (`home move <widget> <page>`). */
  moveToPage(id: string, n: number): boolean {
    const layout = this.layout.map((p) => ({ ...p }));
    const p = layout.find((x) => keyOf(x) === id) ?? layout.find((x) => x.id === id);
    if (!p) return false;
    const target = Math.max(0, n);
    const others = layout.filter((o) => o !== p && (o.page ?? 0) === target);
    p.page = target;
    p.y = others.reduce((m, o) => Math.max(m, o.y + o.h), 0); // at the bottom of that page, free for sure
    p.x = 0;
    this.save(layout);
    return true;
  }

  /** where the page numbers were drawn (a widget dropped on one goes to that page) */
  private pageRects: { n: number; rect: Rect }[] = [];
  private pageAt(m: { x: number; y: number }): number | null {
    return this.pageRects.find(({ rect }) => inside(rect, m.x, m.y))?.n ?? null;
  }

  /** Right-click on an empty spot of HOME. */
  /** First in every right-click on HOME: into edit mode, or out of it. */
  private editEntry(): MenuEntry {
    return { label: this.editing ? t("Done editing") : t("Edit layout"), cmd: this.editing ? "home done" : "home edit", hint: this.editing ? "esc" : IS_MAC ? "⌘E" : "ctrl+E" };
  }

  menu(): MenuEntry[] {
    return [
      this.editEntry(),
      "-",
      { label: t("Add widget…"), run: () => this.add(), hint: "a" },
      { label: t("New page"), cmd: "home page new" },
      "-",
      { label: t("Reset layout"), tip: t("back to the widgets of the start (asks first)"), run: async () => { if (await this.deck.confirm(t("Back to the default layout?"), t("Your widgets go back to where they were at the start."))) void this.deck.act("home reset"); }, danger: true },
    ];
  }

  /** The pointer is over the side panel (a widget dragged there goes to it). */
  private overPanel(m: { x: number; y: number }): boolean {
    const r = this.deck.workspace.panelArea;
    return !!r && inside(r, m.x, m.y);
  }

  /** Right-click on a widget. */
  private widgetMenu(i: number): MenuEntry[] {
    const p = this.layout[i];
    const spec = p && this.deck.widgets.get(p.id);
    if (!p || !spec) return this.menu();
    this.selected = i;
    const has = spec.popup || spec.activate || spec.open;
    return [
      this.editEntry(),
      "-",
      ...(has ? [{ label: t("Open"), tip: spec.popup ? t("its pop-up: bigger, with its settings") : undefined, cmd: `widget ${keyOf(p)}`, hint: "enter" }] : []),
      ...(spec.open ? [{ label: t("Open module"), cmd: `widget ${keyOf(p)} open` }] : []),
      "-",
      {
        label: t("Move to page"),
        tip: t("in edit mode: [ ] moves the chosen widget, or drag it onto a page number"),
        sub: [
          ...Array.from({ length: this.pageCount() }, (_, n) => ({ label: `${t("Page")} ${n + 1}`, cmd: `home move ${keyOf(p)} ${n + 1}`, disabled: n === (p.page ?? 0), checked: n === (p.page ?? 0) })),
          { label: t("A new page"), cmd: `home move ${keyOf(p)} ${this.pageCount() + 1}` },
        ],
      },
      { label: t("Move to panel"), tip: t("the side panel on the right: always in view"), run: () => void this.deck.history.groupAsync(`${p.id} → panel`, async () => { await this.deck.act(`panel add --keep ${keyOf(p)}`); await this.deck.act(`home rm ${keyOf(p)}`); }) },
      { label: t("Duplicate"), tip: t("the same widget once more, with its own settings"), cmd: `home add ${p.id}` },
      { label: t("Add widget…"), run: () => this.add(), hint: "a" },
      "-",
      { label: t("Remove"), cmd: `home rm ${keyOf(p)}`, danger: true, hint: "x" },
    ];
  }

  /** Edit mode on/off (`home edit`). */
  setEditing(on: boolean): void {
    if (this.editing && !on) this.settle();
    this.editing = on;
  }

  /**
   * Widgets stay exactly where you put them — holes included (no gravity: a
   * gap is yours to keep). Kept as one place in case a layout ever needs
   * tidying before it's shown.
   */
  private compact(layout: WidgetPlacement[]): WidgetPlacement[] {
    return layout.map((p) => ({ ...p }));
  }
  private settle(): void {}

  /** Back to the default layout. */
  resetLayout(): void {
    this.save([]);
    this.selected = 0;
  }

  /** Remove a widget by id. */
  unplace(id: string): boolean {
    let i = this.layout.findIndex((p) => keyOf(p) === id);
    if (i < 0) i = this.layout.findIndex((p) => p.id === id);
    if (i < 0) return false;
    const key = keyOf(this.layout[i]);
    this.remove(i);
    // its own settings go with the last copy of that key (a move to the panel keeps them)
    if (!allWidgetKeys(this.deck).includes(key)) forgetWidget(this.deck, key);
    return true;
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
    // the selected widget first: it may type (the chat box)
    if (!this.editing) {
      const p = this.layout[this.selected];
      const spec = p && (p.page ?? 0) === this.page ? this.deck.widgets.get(p.id) : undefined;
      if (spec?.onText?.(t, { deck: this.deck, focused: true, key: keyOf(p) })) return true;
    }
    // edit mode: [ ] take the chosen widget to the page before / after (and go there with it)
    const chosen = this.editing ? this.layout[this.selected] : undefined;
    if (chosen && (t === "[" || t === "]")) {
      const to = (chosen.page ?? 0) + (t === "]" ? 1 : -1);
      if (to >= 0) void this.deck.act(`home move ${keyOf(chosen)} ${to + 1}`);
      return true;
    }
    if (t === "]" || t === ">") return this.setPage(this.page + 1), true;
    if (t === "[" || t === "<") return this.setPage(this.page - 1), true;
    if (t.length !== 1 || !"emaxr".includes(t)) return false;
    return this.onKey({ key: t, code: "", ctrl: false, alt: false, shift: false, meta: false, combo: t });
  }

  onKey(k: KeyInput): boolean {
    // ⌘E / ctrl+E: in and out of edit mode, before any widget sees it (the chat box would type
    // an "e"); only here, so the shell keeps ctrl+E (end of line)
    if (k.combo === "ctrl+e") return this.setEditing(!this.editing), true;
    if (!this.editing) {
      // the selected widget first (Delete on the entry under the mouse, its own letters…)
      const p = this.layout[this.selected];
      const spec = p && (p.page ?? 0) === this.page ? this.deck.widgets.get(p.id) : undefined;
      if (spec?.onKey?.(k, { deck: this.deck, focused: true, key: keyOf(p) })) return true;
      if (k.combo === "e") return (this.editing = true);
      if (k.combo === "m") return void this.deck.openApp("modules"), true;
      return false;
    }
    const i = this.selected;
    switch (k.combo) {
      case "left": this.move(i, -1, 0); return true;
      case "right": this.move(i, 1, 0); return true;
      case "up": this.move(i, 0, -1); return true;
      case "down": this.move(i, 0, 1); return true;
      // shift+→ ↓ grow, shift+← ↑ shrink
      case "shift+left": this.change(i, (p) => ({ ...p, w: p.w - 1 })); return true;
      case "shift+right": this.change(i, (p) => ({ ...p, w: p.w + 1 })); return true;
      case "shift+up": this.change(i, (p) => ({ ...p, h: p.h - 1 })); return true;
      case "shift+down": this.change(i, (p) => ({ ...p, h: p.h + 1 })); return true;
      case "tab": this.selected = (this.selected + 1) % Math.max(1, this.layout.length); return true;
      case "a": void this.add(); return true;
      case "x": case "delete": case "backspace": this.remove(i); return true;
      case "r": this.save([]); this.selected = 0; return true;
      case "e": case "esc": case "enter": this.setEditing(false); return true;
      default: return false;
    }
  }

  onAction(a: Action): boolean {
    switch (a) {
      case "left": case "right": case "up": case "down": this.selected = this.neighbor(a); this.reveal = true; return true;
      case "confirm": {
        const p = this.layout[this.selected];
        const spec = p && this.deck.widgets.get(p.id);
        if (spec && (spec.popup || spec.activate || spec.open)) void this.deck.act(`widget ${keyOf(p)}`);
        return true;
      }
      default: return false;
    }
  }

  render(ui: UI, r: Rect, focused: boolean): void {
    const c = ui.c;
    const anim = this.deck.settings.data.fx.glitch;
    if (!this.shownAt) this.shownAt = ui.now; // widgets boot in once, not on every return
    if (this.selected !== this.lastSel) {
      this.lastSel = this.selected;
      this.selAt = ui.now;
    }
    if (this.deck.settings.data.fx.ambient && !this.editing) drawBackground(ui, r, ui.theme, 0.8);
    // one free cell on each side (a widget's right edge already leaves a 1-cell gap)
    const area = { x: r.x + 1, y: r.y + 1, w: r.w - 1, h: r.h - 1 };
    // Columns stretch to the full width (cell edges are rounded, so they never drift).
    this.colW = Math.max(4, area.w / COLS);
    this.origin = { x: area.x, y: area.y };
    const colX = (n: number) => this.origin.x + Math.round(n * this.colW);
    this.areaH = area.h;
    // Rows stretch to fill the page (themes have different font sizes, so a fixed
    // row height left half the screen empty on one and overflowed on another);
    // the same in and out of edit mode. Too much to fit: 2 lines a row, and it scrolls.
    const used = this.compact(this.layout).filter((p) => (p.page ?? 0) === this.page && this.deck.widgets.get(p.id)).reduce((m, p) => Math.max(m, p.y + p.h), 0);
    this.rowH = used ? Math.max(ROW, Math.min(4, (area.h + 1) / used)) : ROW;
    const contentH = (this.editing ? this.layout : this.compact(this.layout)).filter((p) => ((p.page ?? 0) === this.page)).reduce((m, p) => Math.max(m, Math.round((p.y + p.h) * this.rowH) - 1), 0); // the last row is a gap, not content
    const maxScroll = Math.max(0, contentH - area.h);
    // widgets sit where they were placed: top-left, the same in and out of edit mode
    if (this.reveal) {
      const p = (this.editing ? this.layout : this.compact(this.layout))[this.selected];
      if (p) {
        const top = Math.round(p.y * this.rowH), bot = Math.round((p.y + p.h) * this.rowH) - 1;
        if (top < this.scroll) this.scroll = top;
        else if (bot > this.scroll + area.h) this.scroll = bot - area.h + 1;
      }
      this.reveal = false;
    }
    this.scroll = this.glide.follow(ui, this.scroll, maxScroll);
    const toRect = (p: WidgetPlacement): Rect => ({
      x: colX(p.x),
      y: this.origin.y + Math.round(p.y * this.rowH) - this.scroll,
      w: colX(p.x + p.w) - colX(p.x) - 1,
      h: Math.round((p.y + p.h) * this.rowH) - Math.round(p.y * this.rowH) - 1,
    });
    ui.hit(area, { onWheel: (d) => this.glide.push(d) });

    if (this.editing) {
      // grid dots so you can see where things snap
      for (let gy = 0; this.origin.y + Math.round(gy * this.rowH) < r.y + r.h; gy++)
        for (let gx = 0; gx <= COLS; gx++) ui.text(colX(gx) - (gx ? 1 : 0), this.origin.y + Math.round(gy * this.rowH), "·", { fg: c.faint });
    }

    if (!this.placed().length) {
      ui.textCenter(r, r.y + Math.floor(r.h / 2), t("empty deck — press e then a to add a widget"), { fg: c.muted });
    }
    this.selected = Math.min(this.selected, Math.max(0, this.layout.length - 1));

    ui.grid.pushClip(area);
    for (const { p, i } of this.placed()) {
      const spec = this.deck.widgets.get(p.id)!;
      const rect = toRect(p);
      if (rect.y >= area.y + area.h || rect.y + rect.h <= area.y || rect.h < 1) continue;
      const sel = focused && i === this.selected;
      // a widget one row high (a shortcut square when rows don't stretch) has no room
      // for a frame: it's drawn as a flat chip instead, so it never just disappears
      const flat = rect.h < 3 || !!spec.frameless;
      // a frameless widget (a shortcut square) draws its own tile: its slot stays bare,
      // or it would look taller than it is (shown only while editing, to see the room)
      const inner = flat
        ? (!spec.frameless || this.editing ? ui.fill(rect, { bg: sel ? mix(c.panel, c.accent, 0.3) : this.editing ? c.highlight : mix(c.panel, c.fg, 0.06) }) : undefined, rect)
        : ui.box(rect, {
            title: t(spec.title).toLowerCase(),
            info: this.editing && sel ? `${p.w}×${p.h}` : undefined,
            focused: sel,
            border: this.editing && sel ? "heavy" : ui.theme.widgetFrame,
          });
      const frameHit = {
        onClick: (m: { x: number; y: number }) => {
          this.selected = i;
          if (!this.editing && spec.clickActivates && spec.activate) return void spec.activate({ deck: this.deck, focused: true });
          if (this.editing) this.drag = { index: i, dx: m.x - rect.x, dy: m.y - rect.y, mx: m.x, my: m.y, spot: null };
        },
        // the widget follows the mouse as a ghost; the spot it would land on lights up; it lands on release
        onDrag: (m: { x: number; y: number }) => {
          const d = this.drag;
          if (!this.editing || !d || d.index !== i) return;
          // over the side panel: it lights up, the widget can go there
          this.deck.workspace.panelDrop = this.overPanel(m) ? { key: keyOf(p), y: m.y } : null;
          d.mx = m.x;
          d.my = m.y;
          const nx = Math.round((m.x - this.origin.x - d.dx) / this.colW);
          const ny = Math.round((m.y - this.origin.y - d.dy + this.scroll) / this.rowH);
          const ww = this.want?.i === i ? this.want.w : p.w;
          const x = Math.max(0, Math.min(COLS - ww, nx)), y = Math.max(0, ny);
          if (this.want?.i !== i) this.want = { i, w: p.w, h: p.h };
          const cur = this.layout[i];
          d.spot = !cur ? null : cur.x === x && cur.y === y ? { ...cur } : this.fitAt(this.layout.map((q) => ({ ...q })), i, x, y);
          this.deck.requestFrame();
        },
        onUp: (m: { x: number; y: number }) => {
          const d = this.drag;
          this.drag = null;
          this.deck.workspace.panelDrop = null;
          // dropped on the side panel: it moves there, where the line showed
          if (d?.index === i && this.overPanel(m)) return this.deck.workspace.sidePanel.dropFromHome(keyOf(p), m.y);
          // dropped on a page number at the bottom: it goes to that page
          const pg = this.pageAt(m);
          if (d?.index === i && pg !== null && pg !== (p.page ?? 0)) return void this.deck.act(`home move ${keyOf(p)} ${pg + 1}`);
          const cur = this.layout[i];
          if (!d?.spot || d.index !== i || !cur || (cur.x === d.spot.x && cur.y === d.spot.y && cur.w === d.spot.w)) return;
          this.place2(this.layout.map((q) => ({ ...q })), i, d.spot);
        },
        onDouble: () => !this.editing && (spec.popup || spec.activate || spec.open) && void this.deck.act(`widget ${keyOf(p)}`),
        menu: () => this.widgetMenu(i),
        tip: this.editing ? "drag to move · shift+arrows resize · x remove" : spec.popup || spec.activate || spec.open ? `${spec.description ?? spec.title}\ndouble-click / enter → widget ${keyOf(p)}` : spec.description,
      };
      // normally the widget's own buttons sit on top of its frame; while editing,
      // the frame covers everything, so a click only selects (and drags)
      if (!this.editing) ui.hit(rect, frameHit);
      ui.clip(inner, () => {
        try {
          // the copy you're on is the one its commands change (clock style next…)
          if (sel && focused) focusWidget(keyOf(p));
          // the chosen widget's long texts scroll by themselves, as under the mouse
          const zone = ui.marqueeZone;
          if (sel && focused) ui.marqueeZone = inner;
          spec.render(ui, inner, { deck: this.deck, focused: sel, key: keyOf(p), select: () => void (this.selected = i) });
          ui.marqueeZone = zone;
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          ui.text(inner.x, inner.y, `⚠ ${msg}`, { fg: c.error }, inner.w);
          // once per widget and message, in the error log (E502)
          const key = `${p.id}:${msg}`;
          if (!loggedWidgetErrors.has(key)) {
            loggedWidgetErrors.add(key);
            this.deck.errors.add(`widget ${p.id}: ${msg}`, "E502");
            this.deck.sound.play("error");
          }
        }
        // too small to draw anything: show its name, so it never just vanishes
        if (inner.w > 0 && inner.h > 0 && blank(ui, inner)) {
          ui.textCenter(inner, inner.y + Math.floor((inner.h - 1) / 2), spec.title, { fg: c.subtle });
          if (inner.h > 2) ui.textCenter(inner, inner.y + Math.floor((inner.h - 1) / 2) + 1, t("bigger: e, shift+arrows"), { fg: c.faint });
        }
      });
      if (this.editing) {
        ui.hit(rect, frameHit);
        // the bottom-right corner: drag it to resize (like shift+arrows)
        const corner = { x: rect.x + rect.w - 2, y: rect.y + rect.h - 1, w: 2, h: 1 };
        const hot = ui.hovered(corner) || this.sizing === i;
        ui.text(corner.x + 1, corner.y, "◢", { fg: hot ? c.accent : c.subtle, attrs: BOLD });
        ui.hit(corner, {
          onClick: () => ((this.selected = i), (this.sizing = i)),
          onDrag: (m) => {
            if (this.sizing !== i) return;
            const w = Math.max(1, Math.round((m.x + 1 - colX(p.x)) / this.colW));
            const h = Math.max(1, Math.round((m.y + 1 + this.scroll - this.origin.y - Math.round(p.y * this.rowH)) / this.rowH));
            if (w !== p.w || h !== p.h) this.change(i, (q) => ({ ...q, w, h }));
          },
          onUp: () => (this.sizing = -1),
          tip: t("drag: bigger / smaller · shift+arrows"),
        });
      }
      if (anim) ui.art(() => drawEffects(ui, rect, inner, i, sel, this.shownAt, this.selAt)); // boot-in effects over the frame, on purpose
    }
    // dragging: where it would land (dashed), and the widget itself following the mouse
    const dg = this.drag;
    if (this.editing && dg) {
      const p = this.layout[dg.index];
      const spec = p && this.deck.widgets.get(p.id);
      if (p && spec) {
        if (dg.spot) ui.box(toRect(dg.spot), { border: "dashed", focused: true, fill: false, title: t("drop here") });
        const r0 = toRect(p);
        const ghost = { x: dg.mx - dg.dx, y: dg.my - dg.dy, w: r0.w, h: r0.h };
        ui.box(ghost, { border: "double", focused: true, fill: false, title: spec.title.toLowerCase() });
        if (!dg.spot) ui.textCenter(ghost, ghost.y + Math.floor(ghost.h / 2), t("no room here"), { fg: c.subtle });
      }
    }
    ui.grid.popClip();
    // more below: a tab on the bottom edge, drawn over what's there on purpose (ui.art), shorter when narrow
    const room = r.w - INSET * 2;
    const more = [` ↓ ${t("more (wheel)")} `, " ↓ "].find((m) => strWidth(m) <= room);
    if (this.scroll < maxScroll && more) ui.art(() => ui.textRight(r.x + r.w - 1, r.y + r.h - 1, more, { fg: c.panel, bg: c.accent }));
    if (this.scroll > 0) ui.textRight(r.x + r.w - 1, r.y, ` ↑ ${this.scroll} `, { fg: c.muted });

    // edit / done: a button on HOME's top row, right — the widgets start under it (the
    // right-click menu and ⌘E do the same); left of the ↑ shown when scrolled
    const edit = this.editing ? `✓ ${t("done")}` : `✎ ${t("edit")}`;
    const up = this.scroll > 0 ? strWidth(` ↑ ${this.scroll} `) : 0;
    ui.button(r.x + r.w - INSET - (strWidth(edit) + INSET * 2) - up, r.y, edit, () => this.setEditing(!this.editing), { selected: this.editing, tip: this.editing ? t("done editing (esc)") : t("move, resize, add widgets (⌘E / ctrl+E)") });

    // pages: ‹ 1 2 3 + › at the bottom left (always while editing)
    const pages = this.pageCount();
    if (pages > 1 || this.editing) {
      let px = r.x + 2;
      const py = r.y + r.h - 1;
      px = ui.text(px, py, " pages ", { fg: c.subtle });
      this.pageRects = [];
      for (let n = 0; n <= pages; n++) {
        const label = n === pages ? " + " : ` ${n + 1} `;
        const on = n === this.page;
        const rect = { x: px, y: py, w: label.length, h: 1 };
        this.pageRects.push({ n, rect });
        // a widget dragged over a page number: that page lights up (let go: it goes there)
        const target = !!this.drag && ui.hovered(rect) && !on;
        ui.text(px, py, label, on ? { fg: c.panel, bg: c.accent, attrs: BOLD } : target ? { fg: c.panel, bg: c.accentAlt, attrs: BOLD } : { fg: ui.hovered(rect) ? c.accent : c.muted, bg: c.highlight });
        ui.hit(rect, { cmd: `home page ${n === pages ? "new" : n + 1}`, tip: n === pages ? "a new empty page" : "[ / ] to flip pages" });
        px += label.length + 1;
      }
    }
    // (edit mode's band, across HOME and the side panel, is the workspace's: editBand)
  }
}

/** Stable pseudo-random 0..1 per cell. */
const hash = (x: number, y: number) => {
  const h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return h - Math.floor(h);
};

/**
 * The satisfying bits, all short and quiet, styled by the theme's [anim]:
 *  - boot-in: each widget dissolves out of noise (anim.noise), staggered;
 *  - selection (anim.select): "brackets" = a light pulse around the frame,
 *    then blinking corner brackets · "pulse" = the pulse only · "scan" = a
 *    line sweeping down the widget · "none".
 * Off with `fx.glitch` (FX panel → glitch transitions).
 */
function drawEffects(ui: UI, rect: Rect, inner: Rect, index: number, selected: boolean, shownAt: number, selAt: number): void {
  const c = ui.c;
  // widgets come in quickly (a quarter of a second, a slight stagger): a flourish, not a wait
  const t = (ui.now - shownAt - index * 25) / 220;
  if (t < 1) {
    ui.animate(30);
    for (let y = inner.y; y < inner.y + inner.h; y++)
      for (let x = inner.x; x < inner.x + inner.w; x++) {
        const h = hash(x, y);
        if (h < t) continue;
        const edge = h - t < 0.08;
        const noise = [...ui.theme.anim.noise];
        const ch = noise[Math.floor((h * 977 + ui.now / 60) % noise.length)];
        ui.text(x, y, t < 0 && !edge ? " " : ch, { fg: edge ? mix(c.accent, 0xffffff, 0.4) : mix(c.accent, c.bg, 0.55), bg: c.panel });
      }
  }
  if (!selected) return;
  const style = ui.theme.anim.select;
  if (style === "none") return;
  if (style === "scan") {
    // a soft line sweeps down the widget, over and over
    const span = inner.h + 4;
    const yy = inner.y - 2 + Math.floor(((ui.now - selAt) / 170) % span);
    for (let k = 0; k < 2; k++) if (yy - k >= inner.y && yy - k < inner.y + inner.h) ui.tint({ x: inner.x, y: yy - k, w: inner.w, h: 1 }, undefined, mix(c.accent, c.panel, k ? 0.92 : 0.84));
    ui.animate(170);
    return;
  }
  // lock-on pulse: a bright segment runs around the frame once
  const perim = 2 * (rect.w + rect.h) - 4;
  const s = (ui.now - selAt) / 420;
  if (s < 1) {
    ui.animate(16);
    const head = Math.floor(s * perim);
    for (let k = 0; k < 10; k++) {
      const p = head - k;
      if (p < 0) break;
      const [x, y] = perimeterAt(rect, p);
      ui.text(x, y, k === 0 ? "█" : "━", { fg: mix(c.accent, 0xffffff, 0.6 - k * 0.06) });
    }
  }
  if (style === "pulse") return;
  // target brackets on the corners, blinking softly
  const on = Math.floor(ui.now / 520) % 2 === 0;
  const col = on ? c.accent : mix(c.accent, c.bg, 0.5);
  ui.text(rect.x, rect.y, "┏", { fg: col });
  ui.text(rect.x + rect.w - 1, rect.y, "┓", { fg: col });
  ui.text(rect.x, rect.y + rect.h - 1, "┗", { fg: col });
  ui.text(rect.x + rect.w - 1, rect.y + rect.h - 1, "┛", { fg: col });
  ui.animate(520);
}

/** Walk the frame clockwise from the top-left corner. */
function perimeterAt(r: Rect, p: number): [number, number] {
  const w = r.w - 1, h = r.h - 1;
  p %= 2 * (w + h);
  if (p < w) return [r.x + p, r.y];
  if (p < w + h) return [r.x + w, r.y + (p - w)];
  if (p < 2 * w + h) return [r.x + w - (p - w - h), r.y + h];
  return [r.x, r.y + h - (p - 2 * w - h)];
}

export const homeSpec: AppSpec = {
  kind: "home",
  title: "Home",
  create: (deck) => new HomeApp(deck),
};

/** Did nothing get drawn in r (only spaces)? */
function blank(ui: UI, r: Rect): boolean {
  const g = ui.grid;
  for (let y = Math.max(0, r.y); y < Math.min(g.rows, r.y + r.h); y++)
    for (let x = Math.max(0, r.x); x < Math.min(g.cols, r.x + r.w); x++) {
      const ch = g.ch[y * g.cols + x];
      if (ch && ch !== 32) return false;
    }
  return true;
}

const loggedWidgetErrors = new Set<string>();
