import { IS_MAC } from "../core/input";
import { BOLD, type Rect } from "../core/grid";
import { strWidth } from "../core/unicode";
import { t } from "../core/i18n";
import type { Action, KeyInput } from "../core/input";
import { mix } from "../core/color";
import type { Deck } from "../deck";
import { Glide } from "../ui/glide";
import { inside, type Hit, type UI } from "../ui/ui";
import { focusWidget, widgetIdOf } from "../widgets/instances";
import { WidgetPicker } from "./widgetpicker";
import { frameLabel, tabbedBox } from "./tabstrip";
import { frameMenu } from "./menus";

/** One widget of the panel: where it starts (lines from the top) and how tall it is. */
interface Slot {
  key: string;
  top: number;
  h: number;
}

/**
 * The side panel on the right (◨ in the status bar, ⌘⇧P, `panel`): a column of
 * widgets that stay in view on every page. Like HOME, widgets stay exactly where
 * you put them — gaps included — and when they go further down than the panel,
 * it scrolls (the wheel). settings.panel: the widgets (copy keys: the same widget
 * can be there twice), their heights and where each starts; `panel add|rm|top|
 * height` changes it (shell/commands/ui.ts).
 *
 * Edit mode is the workspace's (`e` here or on HOME, esc ends it): HOME and the
 * panel are edited together, the same way —
 *   tab chooses a widget · ↑↓ move it · shift+↑↓ shorter / taller ·
 *   drag it anywhere (or onto HOME) · drag its bottom edge to resize ·
 *   a add · x remove · esc done
 */
export class SidePanel {
  /** where it was drawn this frame (null: hidden) */
  area: Rect | null = null;
  /** a HOME widget dragged over it (its key, the pointer's line): a line shows where it lands */
  dropHint: { key: string; y: number } | null = null;
  /** the widget chosen (keyboard), by its index top to bottom */
  private sel = 0;
  /** a panel widget being dragged (edit mode): its key, where it was grabbed, where the pointer is */
  private drag: { key: string; grab: number; x: number; y: number; moved: boolean } | null = null;
  /** a widget's bottom edge being dragged: its key and the line it starts on */
  private sizing: { key: string; top: number } | null = null;
  private scroll = 0;
  private readonly glide = new Glide();
  /** the content's top line on screen this frame (for drops) */
  private contentY = 0;

  constructor(private readonly deck: Deck) {}

  private get keys(): string[] {
    const d = this.deck;
    return (d.settings.data.panel?.widgets ?? []).filter((k) => d.widgets.get(widgetIdOf(k)));
  }

  /** a widget's height in lines: the one you gave it, else from its default size */
  private heightOf(key: string): number {
    const spec = this.deck.widgets.get(widgetIdOf(key));
    const set = this.deck.settings.data.panel?.heights?.[key];
    return Math.max(3, Math.min(60, set ?? Math.max(4, Math.min(14, (spec?.size.h ?? 2) * 2 + 2))));
  }

  /**
   * Where every widget is: the start you gave it, else right after the one
   * before (a widget just added goes at the end). Top to bottom.
   */
  private layout(): Slot[] {
    const tops = this.deck.settings.data.panel?.tops ?? {};
    const out: Slot[] = [];
    let next = 0;
    for (const key of this.keys) {
      const h = this.heightOf(key);
      const top = tops[key] ?? this.freeTop(out, key, next, h);
      out.push({ key, top, h });
      next = Math.max(next, top + h);
    }
    return out.sort((a, b) => a.top - b.top);
  }

  private overlaps(slots: Slot[], key: string, top: number, h: number): Slot | undefined {
    return slots.find((s) => s.key !== key && top < s.top + s.h && s.top < top + h);
  }

  /** The free start nearest to `want` (never above 0) for a widget of height h. */
  private freeTop(slots: Slot[], key: string, want: number, h: number): number {
    want = Math.max(0, want);
    for (let d = 0; d < 400; d++) {
      for (const y of [want + d, want - d]) if (y >= 0 && !this.overlaps(slots, key, y, h)) return y;
    }
    return want;
  }

  /** Save every widget's start (after a move: the rest stay where they are). */
  private saveTops(slots: Slot[]): void {
    void this.deck.act(`panel layout ${slots.map((s) => `${s.key}=${s.top}`).join(" ")}`);
  }

  /** Keyboard move: one line, hopping over a widget in the way. */
  private step(key: string, dir: 1 | -1): void {
    const slots = this.layout();
    const me = slots.find((s) => s.key === key);
    if (!me) return;
    let y = me.top + dir;
    for (let guard = 0; guard < 200 && y >= 0; guard++) {
      const block = this.overlaps(slots, key, y, me.h);
      if (!block) break;
      y = dir > 0 ? block.top + block.h : block.top - me.h;
    }
    if (y < 0) return;
    me.top = y;
    this.saveTops(slots);
  }

  private setHeight(key: string, h: number): void {
    const clamped = Math.max(3, Math.min(60, Math.round(h)));
    if (clamped === this.heightOf(key)) return;
    const slots = this.layout();
    const me = slots.find((s) => s.key === key);
    // growing into the widget below: no (move it first)
    if (me && clamped > me.h && this.overlaps(slots, key, me.top, clamped)) return;
    void this.deck.act(`panel height ${key} ${clamped}`);
  }

  private get editing(): boolean {
    return this.deck.workspace.editing;
  }

  render(ui: UI, r: Rect): void {
    const d = this.deck;
    const ws = d.workspace;
    this.area = r;
    const c = ui.c;
    const editing = this.editing;
    const hasFocus = ws.focus === "panel";
    const slots = this.layout();
    this.sel = Math.max(0, Math.min(this.sel, slots.length - 1));
    // its tab on its border, like every frame (workspace/tabstrip.ts)
    const inner = tabbedBox(ui, r, { info: editing ? t("edit · esc done") : hasFocus ? t("e edit · a add") : undefined, border: editing ? "heavy" : undefined, focused: editing || hasFocus });
    frameLabel(ui, ws.headerOf(r).x, r.y, t("PANEL"), (editing || hasFocus) && !ws.topModal, { onClick: () => (ws.focus = "panel"), tip: t("widgets always in view · panel hide · ◨ in the status bar"), menu: () => [{ label: t("Add widget…"), run: () => void this.pick() }, "-", ...frameMenu("panel"), "-", { label: t("Hide panel"), cmd: "panel hide", hint: IS_MAC ? "⌘⇧P" : "ctrl+shift+P" }] });
    ui.hit(inner, {
      menu: () => [{ label: editing ? t("Done editing") : t("Edit layout"), run: () => void (ws.editing = !editing), hint: editing ? "esc" : "e" }, { label: t("Add widget…"), run: () => void this.pick() }, { label: t("Hide panel"), cmd: "panel hide", hint: IS_MAC ? "⌘⇧P" : "ctrl+shift+P" }],
      onWheel: (dy) => this.glide.push(dy),
    });
    // the content can be taller than the panel: it scrolls (in edit mode, room below to drop into)
    const contentH = slots.reduce((m, s) => Math.max(m, s.top + s.h), 0) + (editing ? 6 : 0);
    const maxScroll = Math.max(0, contentH - inner.h);
    const chosenSlot = slots[this.sel];
    if (this.reveal && chosenSlot) {
      if (chosenSlot.top < this.scroll) this.scroll = chosenSlot.top;
      // its bottom into view, never past its top (taller than the panel: its top shows — its title, a chat's field)
      else if (chosenSlot.top + chosenSlot.h > this.scroll + inner.h) this.scroll = Math.min(chosenSlot.top, chosenSlot.top + chosenSlot.h - inner.h);
      this.reveal = false;
    }
    this.scroll = this.glide.follow(ui, Math.min(this.scroll, maxScroll), maxScroll);
    this.contentY = inner.y - this.scroll;
    ui.clip(inner, () => {
      slots.forEach((slot, i) => {
        const { key } = slot;
        const spec = d.widgets.get(widgetIdOf(key))!;
        const box = { x: inner.x, y: this.contentY + slot.top, w: inner.w, h: slot.h };
        if (box.y + box.h <= inner.y || box.y >= inner.y + inner.h) return; // scrolled out of view
        const chosen = i === this.sel && (hasFocus || editing);
        const dragged = this.drag?.moved && this.drag.key === key;
        const wi = ui.box(box, {
          title: t(spec.title).toLowerCase(),
          info: editing && chosen ? `${box.h}` : undefined,
          border: editing ? (chosen ? "heavy" : "dashed") : ui.theme.widgetFrame,
          focused: dragged || chosen,
        });
        const frameHit: Omit<Hit, "rect"> = {
          onDouble: () => !editing && void d.act(`widget ${key}`),
          onClick: (m) => ((this.sel = i), (this.reveal = true), editing && (this.drag = { key, grab: m.y - box.y, x: m.x, y: m.y, moved: false })),
          onDrag: (m) => {
            const pd = this.drag;
            if (!pd || pd.key !== key) return;
            pd.moved ||= Math.abs(m.y - pd.y) + Math.abs(m.x - pd.x) > 1;
            pd.x = m.x;
            pd.y = m.y;
          },
          onUp: (m) => this.dropAt(key, m),
          onWheel: (dy) => this.glide.push(dy),
          tip: editing ? t("drag: anywhere, or onto HOME · bottom edge: taller / shorter · shift+↑↓ · x remove") : `${spec.description ?? spec.title}\n${t("double-click: its pop-up · e: edit")}`,
          menu: () => [
            ...(spec.popup || spec.activate || spec.open ? [{ label: t("Open"), tip: t("its pop-up: bigger, with its settings"), cmd: `widget ${key}` }] : []),
            { label: editing ? t("Done editing") : t("Edit layout"), run: () => void (ws.editing = !editing), hint: editing ? "esc" : "e" },
            { label: t("Move to HOME"), run: () => void d.history.groupAsync(`${widgetIdOf(key)} → HOME`, async () => { await d.act(`home add --keep ${key}`); await d.act(`panel rm ${key}`); }) },
            { label: t("Duplicate"), tip: t("the same widget once more, with its own settings"), cmd: `panel add ${widgetIdOf(key)}` },
            { label: t("Add widget…"), run: () => void this.pick() },
            "-",
            { label: t("Remove"), cmd: `panel rm ${key}`, danger: true },
          ],
        };
        // normally the widget's own buttons sit on top of its frame; in edit mode the frame
        // covers everything, so a press always grabs the widget
        if (!editing) ui.hit(box, frameHit);
        if (chosen && hasFocus) focusWidget(key);
        ui.clip(wi, () => {
          try {
            const zone = ui.marqueeZone;
            if (chosen && hasFocus) ui.marqueeZone = wi; // its long texts scroll, as under the mouse
            spec.render(ui, wi, { deck: d, focused: chosen, key, typing: chosen && hasFocus, select: () => ((this.sel = i), (this.reveal = true), (ws.focus = "panel")) });
            ui.marqueeZone = zone;
          } catch {
            ui.text(wi.x, wi.y, "⚠", { fg: c.error });
          }
        });
        if (editing) {
          ui.hit(box, frameHit);
          // the bottom edge: drag it to make the widget taller or shorter
          const edge = { x: box.x, y: box.y + box.h - 1, w: box.w, h: 1 };
          const hot = ui.hovered(edge) || this.sizing?.key === key;
          ui.text(box.x + Math.floor(box.w / 2) - 1, edge.y, "═══", { fg: hot ? c.accent : c.subtle, attrs: BOLD });
          ui.hit(edge, {
            onClick: () => ((this.sel = i), (this.sizing = { key, top: box.y })),
            onDrag: (m) => this.sizing?.key === key && this.setHeight(key, m.y - this.sizing.top + 1),
            onUp: () => (this.sizing = null),
            tip: t("drag: taller / shorter · shift+↑↓"),
          });
          // × on the frame
          const br = { x: box.x + box.w - 4, y: box.y, w: 3, h: 1 };
          ui.text(br.x, box.y, " × ", { fg: ui.hovered(br) ? c.bg : c.error, bg: ui.hovered(br) ? c.accent : c.highlight, attrs: BOLD });
          ui.hit(br, { cmd: `panel rm ${key}`, tip: t("remove from the panel") });
        }
      });
      // a panel widget being dragged: where it would land, dashed
      const pd = this.drag;
      if (pd?.moved && this.area && inside(this.area, pd.x, pd.y)) {
        const me = slots.find((s) => s.key === pd.key);
        if (me) {
          const top = this.insertAt(slots, me.key, pd.y).line;
          const y = this.contentY + top;
          ui.box({ x: inner.x, y, w: inner.w, h: me.h }, { border: "dashed", focused: true, fill: false });
          ui.hline(inner.x, y, inner.w, { fg: c.accent, attrs: BOLD }, "━");
          ui.text(inner.x + 1, y, ` ▸ ${t("drop here")} `, { fg: c.panel, bg: c.accent, attrs: BOLD });
        }
      }
    });
    // more below / above: an arrow in the corner, over a widget's frame on purpose (ui.art)
    if (maxScroll > 0) ui.art(() => ui.textRight(inner.x + inner.w, this.scroll < maxScroll ? inner.y + inner.h - 1 : inner.y, this.scroll < maxScroll ? "↓" : "↑", { fg: c.accent, attrs: BOLD }));
    if (!slots.length) {
      ui.textCenter(inner, inner.y + 1, t("empty"), { fg: c.muted });
      ui.textCenter(inner, inner.y + 3, t("a: add a widget · right-click"), { fg: c.subtle });
      ui.textCenter(inner, inner.y + 4, t("or drag one here from HOME (edit mode)"), { fg: c.subtle });
    }
    // a HOME widget hovering over the panel: a line where it lands, and its outline
    const hint = this.dropHint;
    if (hint) {
      const h = this.heightOf(hint.key);
      const top = this.insertAt(slots, hint.key, hint.y).line;
      ui.clip(inner, () => {
        const y = this.contentY + top;
        ui.box({ x: inner.x, y, w: inner.w, h }, { border: "dashed", focused: true, fill: false });
        ui.hline(inner.x, y, inner.w, { fg: c.accent, attrs: BOLD }, "━");
        ui.text(inner.x + 1, y, ` ▸ ${t("drop here")} `, { fg: c.panel, bg: c.accent, attrs: BOLD });
      });
      ui.animate(16);
    }
    // a panel widget being dragged: a ghost under the pointer
    const pd = this.drag;
    if (pd?.moved) {
      const label = ` ${t(d.widgets.get(widgetIdOf(pd.key))?.title ?? pd.key).toLowerCase()} `;
      ui.text(Math.max(0, pd.x - Math.floor(strWidth(label) / 2)), pd.y, label, { fg: c.bg, bg: mix(c.accent, c.bg, 0.1), attrs: BOLD });
      ui.animate(16);
    }
  }

  /** the chosen widget is scrolled into view next frame */
  private reveal = false;

  /** A panel widget let go: where it's dropped in the panel (gaps allowed), or on HOME. */
  private dropAt(key: string, m: { x: number; y: number }): void {
    const pd = this.drag;
    this.drag = null;
    if (!pd?.moved) return;
    const p = this.area, main = this.deck.workspace.rects.main;
    if (main && inside(main, m.x, m.y) && this.deck.workspace.activeApp?.kind === "home") {
      void this.deck.history.groupAsync(`${widgetIdOf(key)} → HOME`, async () => {
        await this.deck.act(`home add --keep ${key}`);
        await this.deck.act(`panel rm ${key}`);
      });
      return;
    }
    if (!p || !inside(p, m.x, m.y)) return;
    void this.deck.act(this.layoutCmd(this.insertAt(this.layout(), key, m.y).tops));
  }

  /**
   * Dropping a widget at screen line `y`: the line it goes on — over a widget, just
   * before it (upper half) or just after it (lower half); in a gap, where the pointer
   * is — and where everything starts then: the widgets below move down to make room
   * (their gaps kept), nothing above moves.
   */
  private insertAt(slots: Slot[], key: string, y: number): { line: number; tops: Record<string, number> } {
    const others = slots.filter((s) => s.key !== key).sort((a, b) => a.top - b.top);
    const h = this.heightOf(key);
    const at = Math.max(0, y - this.contentY);
    const over = others.find((s) => at >= s.top && at < s.top + s.h);
    const line = over ? (at < over.top + over.h / 2 ? over.top : over.top + over.h) : at;
    const tops: Record<string, number> = { [key]: line };
    let floor = line + h;
    for (const s of others) {
      if (s.top + s.h <= line) tops[s.key] = s.top; // above: stays
      else {
        tops[s.key] = Math.max(s.top, floor);
        floor = tops[s.key] + s.h;
      }
    }
    return { line, tops };
  }

  private layoutCmd(tops: Record<string, number>): string {
    return `panel layout ${Object.entries(tops).map(([k, v]) => `${k}=${v}`).join(" ")}`;
  }

  /** A HOME widget let go over the panel: it moves there, on the line that showed. */
  dropFromHome(key: string, y: number): void {
    const { tops } = this.insertAt(this.layout(), key, y);
    this.dropHint = null;
    // one step for ⌘Z
    void this.deck.history.groupAsync(`${widgetIdOf(key)} → panel`, async () => {
      await this.deck.act(`panel add --keep ${key}`);
      await this.deck.act(this.layoutCmd(tops));
      await this.deck.act(`home rm ${key}`);
    });
  }

  /** Pick a widget for the side panel: the same picker as HOME's (a), it goes at the end. */
  async pick(): Promise<void> {
    this.deck.workspace.push(new WidgetPicker(this.deck, "panel"));
  }

  /** Letters: e edit mode, a add, x remove (edit mode). */
  onText(ch: string): boolean {
    const ws = this.deck.workspace;
    // the chosen widget first: it may type (the chat box)
    const chosen = this.layout()[this.sel]?.key;
    if (!ws.editing && chosen && this.deck.widgets.get(chosen.split("#")[0])?.onText?.(ch, { deck: this.deck, focused: true, key: chosen })) return true;
    if (ch === "e") return (ws.editing = !ws.editing), true;
    if (ch === "a") return void this.pick(), true;
    const key = this.layout()[this.sel]?.key;
    if ((ch === "x" || ch === "X") && ws.editing && key) return void this.deck.act(`panel rm ${key}`), true;
    return false;
  }

  onKey(k: KeyInput): boolean {
    const ws = this.deck.workspace;
    const slots = this.layout();
    const key = slots[this.sel]?.key;
    if (k.combo === "esc" && ws.editing) return (ws.editing = false), true;
    if (!key) return false;
    // outside edit mode, the chosen widget first (Delete on the entry under the mouse…)
    const spec = this.deck.widgets.get(key.split("#")[0]);
    if (!ws.editing && spec?.onKey?.(k, { deck: this.deck, focused: true, key })) return true;
    // edit mode: the same keys as HOME — shift+arrows resize, arrows move
    if (ws.editing && (k.combo === "shift+up" || k.combo === "shift+down")) return this.setHeight(key, this.heightOf(key) + (k.combo === "shift+up" ? -1 : 1)), (this.reveal = true), true;
    if ((k.combo === "delete" || k.combo === "backspace") && ws.editing) return void this.deck.act(`panel rm ${key}`), true;
    if (k.combo === "tab") return (this.sel = (this.sel + 1) % Math.max(1, slots.length)), (this.reveal = true), true;
    return false;
  }

  onAction(a: Action): boolean {
    const slots = this.layout();
    const n = slots.length;
    if (!n) return a === "up" || a === "down" ? (this.glide.push(a === "up" ? -3 : 3), true) : false;
    // edit mode: the arrows move the widget a line at a time, like on HOME (tab chooses another one)
    if ((a === "up" || a === "down") && this.deck.workspace.editing) {
      this.step(slots[this.sel].key, a === "up" ? -1 : 1);
      this.reveal = true;
      return true;
    }
    if (a === "up" || a === "down") return (this.sel = (this.sel + (a === "up" ? -1 : 1) + n) % n), (this.reveal = true), true;
    if (a === "confirm") return void this.deck.act(`widget ${slots[this.sel].key}`), true;
    return false;
  }
}
