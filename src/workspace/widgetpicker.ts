import { t } from "../core/i18n";
import { fuzzyFilter } from "../core/fuzzy";
import { BOLD, type Rect } from "../core/grid";
import type { Action, KeyInput } from "../core/input";
import type { Deck } from "../deck";
import { TextEditor } from "../ui/editor";
import { ListView } from "../ui/list";
import type { UI } from "../ui/ui";
import type { WidgetSpec } from "../widgets/types";
import type { Overlay } from "./overlays";

/**
 * "Add a widget": every widget with what it does, searchable, and a live
 * preview of the one under the cursor. Enter (or a click) runs `home add <id>`.
 */
export class WidgetPicker implements Overlay {
  modal = true;
  done = false;
  private input = new TextEditor("", { singleLine: true, placeholder: "search: weather, music, todo…" });
  private list = new ListView<WidgetSpec>();
  private lastQuery = "\0";

  constructor(private readonly deck: Deck) {
    this.input.onSubmit = () => this.pick();
    this.list.onActivate = () => this.pick();
  }

  private placed(id: string): boolean {
    return this.deck.settings.data.home.widgets.some((p) => p.id === id);
  }

  private pick(): void {
    const w = this.list.current;
    if (!w) return;
    this.done = true;
    if (this.placed(w.id)) this.deck.notify(`${w.title} is already on HOME`);
    else void this.deck.act(`home add ${w.id}`);
  }

  onKey(k: KeyInput): boolean {
    if (k.key === "esc") return (this.done = true);
    if (["up", "down", "pageup", "pagedown"].includes(k.key)) {
      this.list.onAction(k.key === "up" ? "up" : k.key === "down" ? "down" : k.key === "pageup" ? "page-up" : "page-down");
      return true;
    }
    this.input.onKey(k);
    return true;
  }

  onText(t: string): boolean {
    this.input.onText(t);
    return true;
  }

  onAction(a: Action): boolean {
    if (a === "back") this.done = true;
    else if (a === "confirm") this.pick();
    else this.list.onAction(a);
    return true;
  }

  render(ui: UI, screen: Rect): void {
    const c = ui.c;
    if (this.input.text !== this.lastQuery) {
      this.lastQuery = this.input.text;
      const all = [...this.deck.widgets.list()].filter((w) => w.picker !== false).sort((a, b) => Number(this.placed(a.id)) - Number(this.placed(b.id)) || a.title.localeCompare(b.title));
      this.list.items = this.input.text ? fuzzyFilter(this.input.text, all, (w) => `${w.title} ${w.id} ${w.description ?? ""}`, 100) : all;
      this.list.select(0);
      this.list.scrollTop = 0;
    }
    ui.tint(screen, c.faint, c.bg);
    ui.hit(screen, { onClick: () => (this.done = true), onWheel: () => {}, block: true });
    const W = Math.min(screen.w - 4, 110), H = Math.min(screen.h - 4, 30);
    const box = { x: Math.floor((screen.w - W) / 2), y: Math.max(1, Math.floor((screen.h - H) / 2)), w: W, h: H };
    const inner = ui.box(box, { title: t("ADD A WIDGET"), focused: true, bg: c.panelAlt, info: `${this.list.items.length} · ${t("enter adds · esc")}` });
    ui.hit(box, { onClick: () => {} });
    ui.text(inner.x + 1, inner.y, "❯", { fg: c.accent, attrs: BOLD });
    this.input.render(ui, { x: inner.x + 3, y: inner.y, w: inner.w - 4, h: 1 }, true);
    ui.hline(inner.x, inner.y + 1, inner.w, { fg: c.border });

    const listW = inner.w >= 90 ? Math.floor(inner.w * 0.48) : inner.w;
    const listR = { x: inner.x, y: inner.y + 2, w: listW, h: inner.h - 2 };
    // one line per widget: title, module, what it does
    this.list.render(ui, listR, true, (w, row, selected) => {
      const on = this.placed(w.id);
      const mod = w.id.includes(".") ? w.id.split(".")[0] : "";
      let x = ui.text(row.x + 1, row.y, on ? "●" : selected ? "▸" : "○", { fg: on ? c.success : selected ? c.accent : c.subtle });
      x = ui.text(x + 1, row.y, t(w.title).toUpperCase(), { fg: selected ? c.fg : c.muted, attrs: BOLD });
      if (mod) x = ui.text(x + 1, row.y, `· ${mod}`, { fg: c.accentAlt });
      ui.text(x + 2, row.y, t(w.description ?? ""), { fg: selected ? c.muted : c.faint }, Math.max(0, row.x + row.w - x - 4 - (on ? 9 : 0)));
      if (on) ui.textRight(row.x + row.w - 1, row.y, "on HOME", { fg: c.success });
    });

    // live preview of the selected widget
    const w = this.list.current;
    if (!w || listW === inner.w) return;
    const pr = { x: inner.x + listW + 2, y: inner.y + 2, w: inner.w - listW - 3, h: inner.h - 3 };
    ui.text(pr.x, pr.y, `${w.id}`, { fg: c.accent, attrs: BOLD });
    ui.text(pr.x, pr.y + 1, t(w.description ?? ""), { fg: c.fg }, pr.w);
    ui.text(pr.x, pr.y + 2, `size ${w.size.w}×${w.size.h} (min ${w.min?.w ?? 1}×${w.min?.h ?? 1}) · e then shift+arrows to resize`, { fg: c.subtle }, pr.w);
    const colW = Math.max(4, (ui.cols - 26) / 12);
    const pw = Math.min(pr.w, Math.round(w.size.w * colW)), ph = Math.min(pr.h - 3, w.size.h * 2 - 1);
    const card = { x: pr.x, y: pr.y + 4, w: Math.max(12, pw), h: Math.max(3, Math.min(ph, pr.h - 4)) };
    const cin = ui.box(card, { title: w.title.toUpperCase(), bg: c.panel });
    ui.clip(cin, () => {
      try {
        w.render(ui, cin, { deck: this.deck, focused: false });
      } catch (e) {
        ui.text(cin.x, cin.y, `⚠ ${e instanceof Error ? e.message : e}`, { fg: c.error }, cin.w);
      }
    });
    // the preview is a picture: clicks on it add the widget, they don't press its buttons
    ui.hit(card, { onClick: () => this.pick(), tip: `home add ${w.id}` });
  }
}
