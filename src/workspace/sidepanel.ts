import { BOLD, type Rect } from "../core/grid";
import { t } from "../core/i18n";
import type { Deck } from "../deck";
import { inside, type Hit, type UI } from "../ui/ui";

/**
 * The side panel on the right (◧ in the status bar, ⌘⇧B, `panel`): a column of
 * widgets that stay in view on every page. Which widgets, in which order, is
 * settings.panel.widgets; `panel add|rm|up|down` changes it (shell/commands/ui.ts).
 *
 * The workspace gives it a rectangle each frame (render); HOME asks `area` to
 * know if a widget it drags is over the panel, and sets `dropHint` meanwhile.
 */
export class SidePanel {
  /** where it was drawn this frame (null: hidden) */
  area: Rect | null = null;
  /** a HOME widget is being dragged over it: show where it lands */
  dropHint = false;
  /** a panel widget being dragged (edit mode): its id and where the pointer is */
  private drag: { id: string; x: number; y: number; moved: boolean } | null = null;

  constructor(private readonly deck: Deck) {}

  /**
   * The side panel: its widgets stacked, each at its own height, as many as fit.
   * In HOME's edit mode it can be rearranged too: ▲ ▼ × on each widget, drag one
   * up or down to reorder it, or onto HOME to send it back there. A HOME widget
   * dragged onto the panel lands in it.
   */
  render(ui: UI, r: Rect): void {
    const d = this.deck;
    const ws = d.workspace;
    this.area = r;
    const c = ui.c;
    const home = ws.findTab("home") as { isEditing?: boolean } | undefined;
    const editing = !!home?.isEditing && ws.activeApp === (home as unknown);
    const inner = ui.box(r, { title: t("PANEL"), info: editing ? t("edit") : undefined, border: editing ? "heavy" : undefined, focused: editing });
    ui.hit(inner, { menu: () => [{ label: t("add a widget…"), run: () => void this.pick() }, { label: t("hide the panel"), cmd: "panel hide" }] });
    const ids = (d.settings.data.panel?.widgets ?? []).filter((id) => d.widgets.get(id));
    const slots: { id: string; y: number; h: number }[] = [];
    let y = inner.y;
    for (const id of ids) {
      const spec = d.widgets.get(id)!;
      const h = Math.max(4, Math.min(14, spec.size.h * 2 + 2));
      if (y + 3 > inner.y + inner.h) break;
      const box = { x: inner.x, y, w: inner.w, h: Math.min(h, inner.y + inner.h - y) };
      slots.push({ id, y: box.y, h: box.h });
      const dragged = this.drag?.moved && this.drag.id === id;
      const wi = ui.box(box, { title: t(spec.title).toUpperCase(), border: editing ? "dashed" : ui.theme.widgetFrame, focused: dragged });
      const frameHit: Omit<Hit, "rect"> = {
        onDouble: () => !editing && void d.act(`widget ${id}`),
        onClick: (m) => editing && (this.drag = { id, x: m.x, y: m.y, moved: false }),
        onDrag: (m) => {
          const pd = this.drag;
          if (!pd || pd.id !== id) return;
          pd.moved ||= Math.abs(m.y - pd.y) + Math.abs(m.x - pd.x) > 1;
          pd.x = m.x;
          pd.y = m.y;
        },
        onUp: (m) => this.dropAt(id, m, slots),
        tip: editing ? t("drag: reorder, or onto HOME to put it back · ▲ ▼ ×") : `${spec.description ?? spec.title}\n${t("double-click: its pop-up · right-click: move, remove")}`,
        menu: () => [
          ...(spec.popup || spec.activate || spec.open ? [{ label: t("open"), cmd: `widget ${id}` }] : []),
          { label: t("move up"), cmd: `panel up ${id}` },
          { label: t("move down"), cmd: `panel down ${id}` },
          { label: t("back to HOME"), run: () => void d.act(`home add ${id}`).then(() => d.act(`panel rm ${id}`)) },
          { label: t("add a widget…"), run: () => void this.pick() },
          "-",
          { label: t("remove from the panel"), cmd: `panel rm ${id}`, danger: true },
        ],
      };
      // normally the widget's own buttons sit on top of its frame; in edit mode the frame
      // covers everything, so a press always grabs the widget
      if (!editing) ui.hit(box, frameHit);
      ui.clip(wi, () => {
        try {
          spec.render(ui, wi, { deck: d, focused: false });
        } catch {
          ui.text(wi.x, wi.y, "⚠", { fg: c.error });
        }
      });
      if (editing) ui.hit(box, frameHit);
      // edit mode: ▲ ▼ × on the frame
      if (editing) {
        let bx = box.x + box.w - 9;
        for (const [g, cmd, tip] of [["▲", `panel up ${id}`, t("move up")], ["▼", `panel down ${id}`, t("move down")], ["×", `panel rm ${id}`, t("remove from the panel")]] as const) {
          const br = { x: bx, y: box.y, w: 3, h: 1 };
          ui.text(bx, box.y, ` ${g} `, { fg: ui.hovered(br) ? c.bg : g === "×" ? c.error : c.fg, bg: ui.hovered(br) ? c.accent : c.highlight, attrs: BOLD });
          ui.hit(br, { cmd, tip });
          bx += 3;
        }
      }
      y += box.h;
    }
    if (!ids.length) {
      ui.textCenter(inner, inner.y + 1, t("empty"), { fg: c.muted });
      ui.textCenter(inner, inner.y + 3, t("right-click → add a widget"), { fg: c.faint });
      ui.textCenter(inner, inner.y + 4, t("or drag one here from HOME (edit mode)"), { fg: c.faint });
    }
    // a HOME widget hovering over the panel: show where it lands
    if (this.dropHint) ui.box(inner, { border: "double", focused: true, fill: false, title: t("drop here") });
    // a panel widget being dragged: a ghost under the pointer
    const pd = this.drag;
    if (pd?.moved) {
      const label = ` ${t(d.widgets.get(pd.id)?.title ?? pd.id).toUpperCase()} `;
      ui.text(Math.max(0, pd.x - Math.floor(label.length / 2)), pd.y, label, { fg: c.bg, bg: c.accent, attrs: BOLD });
      ui.animate(16);
    }
  }

  /** A panel widget let go: reorder it (over the panel), or send it to HOME (over the page). */
  private dropAt(id: string, m: { x: number; y: number }, slots: { id: string; y: number; h: number }[]): void {
    const pd = this.drag;
    this.drag = null;
    if (!pd?.moved) return;
    const p = this.area, main = this.deck.workspace.rects.main;
    if (main && inside(main, m.x, m.y) && this.deck.workspace.activeApp?.kind === "home") {
      void this.deck.act(`home add ${id}`).then(() => this.deck.act(`panel rm ${id}`));
      return;
    }
    if (!p || !inside(p, m.x, m.y)) return;
    const list = [...(this.deck.settings.data.panel?.widgets ?? [])];
    const from = list.indexOf(id);
    // the slot under the pointer is where it goes (below the last one: the end)
    let to = slots.findIndex((sl) => m.y < sl.y + sl.h);
    if (to < 0) to = list.length - 1;
    if (from < 0 || to === from) return;
    list.splice(from, 1);
    list.splice(Math.min(to, list.length), 0, id);
    this.deck.settings.set("panel", { ...this.deck.settings.data.panel, widgets: list });
  }

  /** Pick a widget for the side panel. */
  async pick(): Promise<void> {
    const list = this.deck.widgets.list().filter((w) => w.picker !== false && !w.id.startsWith("link."));
    const i = await this.deck.choose(t("A widget for the panel"), list.map((w) => ({ label: t(w.title), hint: w.id })));
    if (i !== null) void this.deck.act(`panel add ${list[i].id}`);
  }
}
