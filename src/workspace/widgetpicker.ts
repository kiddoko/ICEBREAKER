import { t } from "../core/i18n";
import { wrapWords } from "../core/unicode";
import { Field } from "../ui/field";
import { fuzzyFilter } from "../core/fuzzy";
import { BOLD, type Rect } from "../core/grid";
import type { Action, KeyInput } from "../core/input";
import type { Deck } from "../deck";
import { ListView } from "../ui/list";
import type { UI } from "../ui/ui";
import type { WidgetSpec } from "../widgets/types";
import type { Overlay } from "./overlays";

/** A line of the list: a module's group (folds) or one of its widgets. */
type Line = { group: string; label: string; count: number } | { w: WidgetSpec & { source?: string } };

/**
 * "Add a widget": the widgets grouped by module (each group folds: enter, → ←,
 * a click), searchable (a search shows every match, flat), and a live preview
 * of the one under the cursor. Enter (or a click) on a widget runs `home add <id>`
 * — or `panel add <id>` when it was opened for the side panel (`target: "panel"`).
 */
export class WidgetPicker implements Overlay {
  modal = true;
  done = false;
  private readonly input = new Field({ icon: "❯", onSubmit: () => this.pick() });
  private list = new ListView<Line>();
  /** the groups that are open (all folded at first: a short list of modules) */
  private openGroups = new Set<string>();
  private lastQuery = "\0";

  constructor(
    private readonly deck: Deck,
    /** where the chosen widget goes: HOME's grid, or the side panel (at the end) */
    private readonly target: "home" | "panel" = "home",
  ) {
    this.list.onActivate = () => this.pick();
  }

  private placed(id: string): boolean {
    return this.target === "panel" ? (this.deck.settings.data.panel?.widgets ?? []).includes(id) : this.deck.settings.data.home.widgets.some((p) => p.id === id);
  }

  private toggle(group: string, open = !this.openGroups.has(group)): void {
    if (open) this.openGroups.add(group);
    else this.openGroups.delete(group);
    this.lastQuery = "\0"; // rebuild
  }

  private pick(): void {
    const line = this.list.current;
    if (!line) return;
    if ("group" in line) return this.toggle(line.group);
    const w = line.w;
    this.done = true;
    // already there: one more copy (each copy has its own settings)
    void this.deck.act(`${this.target} add ${w.id}`);
  }

  onKey(k: KeyInput): boolean {
    if (k.key === "esc") return (this.done = true);
    const cur = this.list.current;
    if (cur && (k.key === "right" || k.key === "left") && !this.input.text) {
      const g = "group" in cur ? cur.group : groupOf(cur.w, this.deck);
      this.toggle(g, k.key === "right");
      return true;
    }
    if (["up", "down", "pageup", "pagedown"].includes(k.key)) {
      this.list.onNavKey(k);
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
      const keep = this.list.current;
      const all = [...this.deck.widgets.list()].filter((w) => w.picker !== false).sort((a, b) => Number(this.placed(a.id)) - Number(this.placed(b.id)) || a.title.localeCompare(b.title));
      if (this.input.text) {
        this.list.items = fuzzyFilter(this.input.text, all, (w) => `${w.title} ${w.id} ${w.description ?? ""} ${groupOf(w, this.deck)}`, 100).map((w) => ({ w }));
        this.list.select(0);
        this.list.scrollTop = 0;
      } else {
        const groups = new Map<string, typeof all>();
        for (const w of all) {
          const g = groupOf(w, this.deck);
          groups.set(g, [...(groups.get(g) ?? []), w]);
        }
        const lines: Line[] = [];
        for (const [g, ws] of [...groups].sort(([a], [b]) => (a === "deck" ? -1 : b === "deck" ? 1 : a.localeCompare(b)))) {
          lines.push({ group: g, label: g, count: ws.length });
          if (this.openGroups.has(g)) lines.push(...ws.map((w) => ({ w })));
        }
        this.list.items = lines;
        // stay on the same line after a fold / unfold
        const i = keep ? lines.findIndex((l) => ("group" in l && "group" in keep ? l.group === keep.group : "w" in l && "w" in keep && l.w.id === keep.w.id)) : -1;
        this.list.select(Math.max(0, i));
      }
    }
    ui.tint(screen, c.faint, c.bg);
    ui.hit(screen, { onClick: () => (this.done = true), onWheel: () => {}, block: true });
    const W = Math.min(screen.w - 4, 110), H = Math.min(screen.h - 4, 30);
    const box = { x: Math.floor((screen.w - W) / 2), y: Math.max(1, Math.floor((screen.h - H) / 2)), w: W, h: H };
    const inner = ui.box(box, { title: this.target === "panel" ? t("ADD A WIDGET · SIDE PANEL") : t("ADD A WIDGET"), focused: true, bg: c.panelAlt, info: `${this.list.items.length} · ${t("enter adds · esc")}` });
    ui.hit(box, { onClick: () => {} });
    this.input.render(ui, { x: inner.x, y: inner.y, w: inner.w, h: 1 }, { focused: true, placeholder: t("search: weather, music, todo…") });
    ui.hline(inner.x, inner.y + 1, inner.w, { fg: c.border });

    const listW = inner.w >= 90 ? Math.floor(inner.w * 0.48) : inner.w;
    const listR = { x: inner.x, y: inner.y + 2, w: listW, h: inner.h - 2 };
    // one line per widget: title, module, what it does
    this.list.render(ui, listR, true, (line, row, selected) => {
      if ("group" in line) {
        const open = this.openGroups.has(line.group);
        let gx = ui.text(row.x + 1, row.y, open ? "▾" : "▸", { fg: c.accent });
        gx = ui.text(gx + 1, row.y, line.label.toLowerCase(), { fg: selected ? c.fg : c.title, attrs: BOLD });
        ui.text(gx + 1, row.y, `${line.count}`, { fg: c.subtle });
        ui.hit(row, { onClick: () => this.toggle(line.group), tip: t("click: open / fold · → ←") });
        return;
      }
      const w = line.w;
      const on = this.placed(w.id);
      const mod = w.id.includes(".") ? w.id.split(".")[0] : "";
      let x = ui.text(row.x + (this.input.text ? 1 : 3), row.y, on ? "●" : selected ? "▸" : "○", { fg: on ? c.success : selected ? c.accent : c.subtle });
      x = ui.text(x + 1, row.y, t(w.title).toLowerCase(), { fg: selected ? c.fg : c.muted, attrs: BOLD });
      if (mod) x = ui.text(x + 1, row.y, `· ${mod}`, { fg: c.accentAlt });
      ui.text(x + 2, row.y, t(w.description ?? ""), { fg: selected ? c.muted : c.faint }, Math.max(0, row.x + row.w - x - 4 - (on ? 9 : 0)));
      if (on) ui.textRight(row.x + row.w - 1, row.y, "on HOME", { fg: c.success });
    });

    // live preview of the selected widget
    const cur = this.list.current;
    if (!cur || !("w" in cur) || listW === inner.w) return;
    const w = cur.w;
    const pr = { x: inner.x + listW + 2, y: inner.y + 2, w: inner.w - listW - 3, h: inner.h - 3 };
    ui.text(pr.x, pr.y, `${w.id}`, { fg: c.accent, attrs: BOLD });
    // the whole description, on as many lines as it needs (up to 3): on one line it scrolled,
    // and looked cut from the left
    const desc = wrapWords(t(w.description ?? ""), pr.w).slice(0, 3);
    desc.forEach((l, k) => ui.text(pr.x, pr.y + 1 + k, l, { fg: c.fg }, pr.w));
    const dy = Math.max(1, desc.length);
    ui.text(pr.x, pr.y + 1 + dy, `size ${w.size.w}×${w.size.h} (min ${w.min?.w ?? 1}×${w.min?.h ?? 1}) · e then shift+arrows to resize`, { fg: c.subtle }, pr.w);
    const colW = Math.max(4, (ui.cols - 26) / 12);
    const top = pr.y + 3 + dy;
    const pw = Math.min(pr.w, Math.round(w.size.w * colW)), ph = Math.min(pr.y + pr.h - top, w.size.h * 2 - 1);
    const card = { x: pr.x, y: top, w: Math.max(12, pw), h: Math.max(3, Math.min(ph, pr.y + pr.h - top)) };
    const cin = ui.box(card, { title: w.title.toLowerCase(), bg: c.panel });
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

/** The module a widget belongs to (its name), "deck" for the core ones. */
function groupOf(w: WidgetSpec & { source?: string }, deck: Deck): string {
  const src = w.source ?? (w.id.includes(".") ? w.id.split(".")[0] : "core");
  if (src === "core") return "deck";
  return deck.plugins.list().find((p) => p.manifest.id === src)?.manifest.name?.toLowerCase() ?? src;
}
