/**
 * THE TABS (Refonte UI step 3, docs/FRAMES.md) — thicker and readable:
 *
 *    ▌✎ ideas       ×▐  ☂ weather       ▦ todo      ▾ +3  +
 *     ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀  ▀▀▀▀▀▀▀▀▀▀▀▀▀▀  ▀▀▀▀▀▀▀▀▀▀
 *
 * Two rows: the name on top (an icon for what it is, the title, × on the one shown or
 * hovered), a half-block bar under it — the one shown in the accent. No number in front
 * of the name any more: the numbers (⌘1…9) show only while ⌘ / ctrl is held. Wide when
 * there are few, narrower as more open (10–24 cells); the rest in a "▾ +N" list, the one
 * shown always visible. Drag a tab sideways to put it elsewhere (`tab move <n> <m>`).
 */
import { mix } from "../core/color";
import { t } from "../core/i18n";
import { BOLD, type Rect } from "../core/grid";
import { IS_MAC } from "../core/input";
import { strWidth, truncate } from "../core/unicode";
import { q, type MenuEntry, type UI } from "../ui/ui";
import { Bar, INSET } from "../ui/layout";
import type { Overlay } from "./overlays";
import { groupOf } from "./tabgroups";
import type { Workspace } from "./workspace";
import { tabMenu } from "./menus";

// MINW: a name of 8–9 letters stays readable (the rest go in the ▾ +N list)
const MAXW = 24, MINW = 15;
const PLUS_W = 3;
const MORE_W = 7;
/** one cell between two tabs */
const SEP = 1;

/** what a tab shows before its title */
function iconOf(ws: Workspace, i: number): string {
  const app = ws.tabs[i];
  if (!app) return "·";
  if (app.kind === "note") return "✎";
  return ws.deck.apps.get(app.kind)?.icon?.trim()?.slice(0, 2) || "·";
}

/** A tab being dragged: which, onto which chip, and whether it drops ON it (a group) or beside it. */
let dragging: { from: number; to: number; onto: boolean } | null = null;

/** Draw the tabs in `r` (2 rows: names, bars): lone tabs and groups (workspace/tabgroups.ts). */
export function renderTabStrip(ws: Workspace, ui: UI, r: Rect): void {
  const c = ui.c;
  const entries = ws.stripEntries();
  const n = entries.length;
  const avail = r.w - PLUS_W;
  let tabW = n ? Math.max(MINW, Math.min(MAXW, Math.floor(avail / n) - 1)) : MAXW;
  const activeEntry = Math.max(0, entries.findIndex((e) => (e.kind === "tab" ? e.index === ws.active : e.indexes.includes(ws.active))));
  let shown = Array.from({ length: n }, (_, i) => i);
  if (n * (tabW + 1) > avail) {
    tabW = MINW;
    // so narrow that not even one tab fits beside the list: only the list
    const fit = Math.floor((avail - MORE_W) / (tabW + 1));
    shown = shown.slice(0, Math.max(0, fit));
    if (fit > 0 && activeEntry >= fit) shown[fit - 1] = activeEntry;
  }
  const hidden = Array.from({ length: n }, (_, i) => i).filter((i) => !shown.includes(i));
  const numbers = ws.deck.input.modHeld;
  const rects: Rect[] = [];
  /** the first tab of a chip (where a dragged tab lands) */
  const firstOf = (k: number) => {
    const e = entries[shown[k]];
    return e ? (e.kind === "tab" ? e.index : e.indexes[0]) : -1;
  };
  let x = r.x;
  shown.forEach((ei, k) => {
    const e = entries[ei];
    const rect = { x, y: r.y, w: tabW, h: 2 };
    rects.push(rect);
    const i = e.kind === "tab" ? e.index : (e.indexes.find((j) => ws.tabs[j]?.key === e.group.active) ?? e.indexes[0]);
    const on = ei === activeEntry;
    const hot = ui.hovered(rect);
    const target = !!dragging && dragging.onto && dragging.to === firstOf(k) && dragging.from !== i;
    const bg = on ? c.accent : hot || target ? c.highlight : mix(c.panelAlt, c.fg, 0.06);
    const fg = on ? c.panel : hot ? c.fg : c.muted;
    ui.fill({ x, y: r.y, w: tabW, h: 1 }, { bg });
    // the bar under it: the tab looks a row and a half tall
    ui.text(x, r.y + 1, "▀".repeat(tabW), { fg: target ? c.accent : bg });
    const closeX = x + tabW - 2;
    let tx = x + 1;
    if (e.kind === "group") {
      // ▣ the group: its name (or its shown tab's), how many; hover lists them
      const name = e.group.name || ws.tabs[i]?.title().toLowerCase() || t("group");
      const count = ` ${e.indexes.length}`;
      tx = ui.text(tx, r.y, "▣ ", { fg: on ? c.panel : c.accent, bg, attrs: BOLD });
      // cut with "…", never a moving marquee: a chip is read at a glance
      ui.text(tx, r.y, truncate(name, Math.max(0, x + tabW - 1 - strWidth(count) - tx)), { fg, bg, attrs: on ? BOLD : 0 });
      ui.text(x + tabW - 1 - strWidth(count), r.y, count, { fg: on ? c.panel : c.subtle, bg });
      // (no tip: hovering opens its list, which says it all; right-click: rename, ungroup)
      ui.hit(rect, { onClick: () => void ws.deck.act(`tab ${i + 1}`), menu: () => groupMenu(ws, i) });
      if (hot) openGroupList(ws, e.group.id, rect);
    } else {
      const unsaved = !!ws.tabs[i].dirty?.();
      // the name comes first: the icon goes when it would leave the name under 6 cells
      const room = closeX - x - 2 - (numbers && i < 9 ? 2 : 0) - (unsaved ? 2 : 0);
      if (numbers && i < 9) tx = ui.text(tx, r.y, `${i + 1} `, { fg: on ? c.panel : c.accent, bg, attrs: BOLD });
      if (room - 2 >= 6) tx = ui.text(tx, r.y, `${iconOf(ws, i)} `, { fg: on ? c.panel : c.subtle, bg });
      if (unsaved) tx = ui.text(tx, r.y, "● ", { fg: c.error, bg, attrs: BOLD });
      ui.text(tx, r.y, ws.tabs[i].title().toLowerCase(), { fg, bg, attrs: on ? BOLD : 0 }, Math.max(0, closeX - tx - 1));
      const closeHot = ui.hovered({ x: closeX - 1, y: r.y, w: 3, h: 1 });
      ui.text(closeX, r.y, on || hot ? "×" : " ", { fg: closeHot ? c.error : on ? c.panel : c.subtle, bg, attrs: closeHot ? BOLD : 0 });
      ui.hit(rect, {
        cmd: `tab ${i + 1}`,
        tip: `${ws.tabs[i].title()}\n${IS_MAC ? `⌘${i + 1}` : `ctrl+${i + 1}`} · ${t("drag: move it, or onto another tab: a group · right-click: close others…")}`,
        menu: () => tabMenu(ws, i),
        // drag it: beside another chip moves it there, onto the middle of one makes a group
        onDrag: (m) => {
          let to = rects.findIndex((rr) => m.x < rr.x + rr.w);
          if (to < 0) to = rects.length - 1;
          const rr = rects[to];
          const third = rr ? Math.max(1, Math.floor(rr.w / 3)) : 1;
          const onto = !!rr && m.x >= rr.x + third && m.x < rr.x + rr.w - third && firstOf(to) !== i;
          dragging = { from: i, to: firstOf(to), onto };
        },
        onUp: () => {
          const d = dragging;
          dragging = null;
          if (!d || d.to < 0 || d.to === d.from) return;
          void ws.deck.act(d.onto ? `tab group ${d.to + 1} ${d.from + 1}` : `tab move ${d.from + 1} ${d.to + 1}`);
        },
      });
      ui.hit({ x: closeX - 1, y: r.y, w: 3, h: 1 }, { cmd: `tab close ${i + 1}`, tip: t("close · ctrl+w · shift+esc") });
    }
    x += tabW + SEP;
  });
  // where a dragged tab would land (beside a chip; onto one is lit above)
  if (dragging && !dragging.onto && dragging.to !== dragging.from) {
    const k = shown.findIndex((_, kk) => firstOf(kk) === dragging!.to);
    const rr = rects[k];
    if (rr) ui.text(dragging.to > dragging.from ? rr.x + rr.w : rr.x - SEP, r.y, "▐", { fg: c.accent, attrs: BOLD });
  }
  // the chips that didn't fit: a list
  if (hidden.length && x + strWidth(` ▾ +${hidden.length} `) <= r.x + r.w) {
    const label = shown.length ? ` ▾ +${hidden.length} ` : ` ▾ ${hidden.length} `;
    const rect = { x, y: r.y, w: strWidth(label), h: 1 };
    const hot = ui.hovered(rect);
    ui.text(x, r.y, label, { fg: hot ? c.panel : c.accent, bg: hot ? c.accent : c.highlight, attrs: BOLD });
    const items = hidden.flatMap((ei) => {
      const e = entries[ei];
      const list = e.kind === "tab" ? [e.index] : e.indexes;
      return list.map((i) => ({ label: `${e.kind === "group" ? "▣ " : ""}${iconOf(ws, i)} ${ws.tabs[i].title().toLowerCase()}`, cmd: `tab ${i + 1}`, hint: i < 9 ? (IS_MAC ? `⌘${i + 1}` : `ctrl+${i + 1}`) : "" }));
    });
    ui.hit(rect, { onClick: () => ws.openMenu(items, rect.x, r.y + 1, t("more tabs")), tip: t("{n} more tabs: click for the list", { n: items.length }) });
    x += rect.w + SEP;
  }
  if (x + 1 <= r.x + r.w) {
    const pr = { x, y: r.y, w: 1, h: 1 };
    ui.text(x, r.y, "+", { fg: ui.hovered(pr) ? c.accent : c.subtle, attrs: BOLD });
    ui.hit(pr, { cmd: "palette", tip: t("open anything · ctrl+k") });
  }
}

/** Right-click on a group: rename it, take the shown tab out, every tab out. */
function groupMenu(ws: Workspace, i: number): MenuEntry[] {
  const g = groupOf(ws.groups, ws.tabs[i]?.key ?? "");
  if (!g) return tabMenu(ws, i);
  return [
    { label: t("Rename the group…"), run: async () => {
      const v = await ws.deck.prompt(t("The group's name"), { initial: g.name || ws.tabs[i]?.title().toLowerCase() || "" });
      if (v !== null) void ws.deck.act(`tab groupname ${i + 1} ${q(v.trim() || "-")}`);
    } },
    { label: t("Take this tab out"), cmd: `tab ungroup ${i + 1}` },
    { label: t("Ungroup them all"), run: () => {
      for (const k of [...g.keys]) {
        const j = ws.tabs.findIndex((a) => a.key === k);
        if (j >= 0) ws.ungroupTab(j);
      }
    } },
  ];
}

/** Open the hover list of group `id` under its chip (once). */
function openGroupList(ws: Workspace, id: string, anchor: Rect): void {
  if (ws.overlays.some((o) => o instanceof GroupList && !o.done && o.id === id)) return;
  for (const o of ws.overlays) if (o instanceof GroupList) o.done = true;
  ws.push(new GroupList(ws, id, anchor));
}

/**
 * A group's tabs, under its chip while the pointer is on the chip or the list: a click
 * picks one, ⇱ takes it out (a tab of its own again), × closes it.
 */
class GroupList implements Overlay {
  modal = false;
  done = false;
  private outSince = 0;
  constructor(
    private readonly ws: Workspace,
    readonly id: string,
    private readonly anchor: Rect,
  ) {}

  render(ui: UI, screen: Rect): void {
    const ws = this.ws;
    const c = ui.c;
    const g = ws.groups.find((x) => x.id === this.id);
    const rows = (g?.keys ?? []).map((k) => ws.tabs.findIndex((a) => a.key === k)).filter((i) => i >= 0);
    if (!g || rows.length < 2) return void (this.done = true);
    const w = Math.min(screen.w - this.anchor.x, Math.max(this.anchor.w, 30));
    const box = { x: this.anchor.x, y: this.anchor.y + this.anchor.h, w, h: rows.length + 2 };
    // gone once the pointer has been away from the chip and the list for a moment
    if (ui.hovered(this.anchor) || ui.hovered(box)) this.outSince = 0;
    else if (!this.outSince) this.outSince = ui.now;
    else if (ui.now - this.outSince > 350) return void (this.done = true);
    ui.animate(this.outSince ? 60 : 250);
    const inner = ui.box(box, { title: g.name || t("group"), focused: true, bg: c.panelAlt });
    ui.hit(box, { onClick: () => {}, block: true });
    rows.forEach((i, k) => {
      const y = inner.y + k;
      const row = { x: inner.x, y, w: inner.w, h: 1 };
      const on = i === ws.active;
      const hot = ui.hovered(row);
      if (on || hot) ui.fill(row, { bg: on ? mix(c.accent, c.panelAlt, 0.7) : c.highlight });
      const bg = on ? mix(c.accent, c.panelAlt, 0.7) : hot ? c.highlight : c.panelAlt;
      ui.hit(row, { cmd: `tab ${i + 1}`, tip: t("click: show it") });
      const end = new Bar(ui, inner.x + INSET, y, inner.x + inner.w - INSET);
      end.text(`${iconOf(ws, i)} ${ws.tabs[i].title().toLowerCase()}`, { fg: on ? c.fg : c.muted, bg, attrs: on ? BOLD : 0 }, { priority: 9, fit: 4 });
      end.button("⇱", () => {}, { cmd: `tab ungroup ${i + 1}`, tip: t("take it out: a tab of its own") }, { side: "right", priority: 7 });
      end.button("×", () => {}, { cmd: `tab close ${i + 1}`, tip: t("close it") }, { side: "right", priority: 6 });
      end.draw();
    });
  }
}
