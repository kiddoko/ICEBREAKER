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
import { strWidth } from "../core/unicode";
import type { UI } from "../ui/ui";
import type { Workspace } from "./workspace";
import { tabMenu } from "./menus";

const MAXW = 24, MINW = 12;
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

/** A tab being dragged sideways: which, and where it would go. */
let dragging: { from: number; to: number } | null = null;

/** Draw the tabs in `r` (2 rows: names, bars). */
export function renderTabStrip(ws: Workspace, ui: UI, r: Rect): void {
  const c = ui.c;
  const n = ws.tabCount;
  const avail = r.w - PLUS_W;
  let tabW = n ? Math.max(MINW, Math.min(MAXW, Math.floor(avail / n) - 1)) : MAXW;
  let shown = Array.from({ length: n }, (_, i) => i);
  if (n * (tabW + 1) > avail) {
    tabW = MINW;
    // so narrow that not even one tab fits beside the list: only the list
    const fit = Math.floor((avail - MORE_W) / (tabW + 1));
    shown = shown.slice(0, Math.max(0, fit));
    const act = Math.min(ws.active, n - 1);
    if (fit > 0 && act >= fit) shown[fit - 1] = act;
  }
  const hidden = Array.from({ length: n }, (_, i) => i).filter((i) => !shown.includes(i));
  const numbers = ws.deck.input.modHeld;
  const rects: Rect[] = [];
  let x = r.x;
  for (const i of shown) {
    const rect = { x, y: r.y, w: tabW, h: 2 };
    rects.push(rect);
    const on = i === ws.active;
    const hot = ui.hovered(rect);
    const bg = on ? c.accent : hot ? c.highlight : mix(c.panelAlt, c.fg, 0.06);
    const fg = on ? c.panel : hot ? c.fg : c.muted;
    ui.fill({ x, y: r.y, w: tabW, h: 1 }, { bg });
    // the bar under it: the tab looks a row and a half tall
    ui.text(x, r.y + 1, "▀".repeat(tabW), { fg: bg });
    const unsaved = !!ws.tabs[i].dirty?.();
    const closeX = x + tabW - 2;
    // the name comes first: the icon goes when it would leave the name under 6 cells
    const room = closeX - x - 2 - (numbers && i < 9 ? 2 : 0) - (unsaved ? 2 : 0);
    let tx = x + 1;
    if (numbers && i < 9) tx = ui.text(tx, r.y, `${i + 1} `, { fg: on ? c.panel : c.accent, bg, attrs: BOLD });
    if (room - 2 >= 6) tx = ui.text(tx, r.y, `${iconOf(ws, i)} `, { fg: on ? c.panel : c.subtle, bg });
    if (unsaved) tx = ui.text(tx, r.y, "● ", { fg: c.error, bg, attrs: BOLD });
    ui.text(tx, r.y, ws.tabs[i].title().toLowerCase(), { fg, bg, attrs: on ? BOLD : 0 }, Math.max(0, closeX - tx - 1));
    const closeHot = ui.hovered({ x: closeX - 1, y: r.y, w: 3, h: 1 });
    ui.text(closeX, r.y, on || hot ? "×" : " ", { fg: closeHot ? c.error : on ? c.panel : c.subtle, bg, attrs: closeHot ? BOLD : 0 });
    ui.hit(rect, {
      cmd: `tab ${i + 1}`,
      tip: `${ws.tabs[i].title()}\n${IS_MAC ? `⌘${i + 1}` : `ctrl+${i + 1}`} · ${t("drag: move it · right-click: close others…")}`,
      menu: () => tabMenu(ws, i),
      // drag it sideways: a marker shows where it lands, letting go moves it there
      onDrag: (m) => {
        const to = rects.findIndex((rr) => m.x < rr.x + rr.w);
        dragging = { from: i, to: shown[to < 0 ? shown.length - 1 : to] ?? i };
      },
      onUp: () => {
        const d = dragging;
        dragging = null;
        if (d && d.to !== d.from) void ws.deck.act(`tab move ${d.from + 1} ${d.to + 1}`);
      },
    });
    ui.hit({ x: closeX - 1, y: r.y, w: 3, h: 1 }, { cmd: `tab close ${i + 1}`, tip: t("close · ctrl+w · shift+esc") });
    x += tabW + SEP;
  }
  // where a dragged tab would land
  if (dragging && dragging.to !== dragging.from) {
    const k = shown.indexOf(dragging.to);
    const rr = rects[k];
    if (rr) ui.text(dragging.to > dragging.from ? rr.x + rr.w : rr.x - SEP, r.y, "▐", { fg: c.accent, attrs: BOLD });
  }
  // the tabs that didn't fit: a list
  if (hidden.length && x + strWidth(` ▾ +${hidden.length} `) <= r.x + r.w) {
    const label = shown.length ? ` ▾ +${hidden.length} ` : ` ▾ ${hidden.length} `;
    const rect = { x, y: r.y, w: strWidth(label), h: 1 };
    const hot = ui.hovered(rect);
    ui.text(x, r.y, label, { fg: hot ? c.panel : c.accent, bg: hot ? c.accent : c.highlight, attrs: BOLD });
    ui.hit(rect, {
      onClick: () => ws.openMenu(hidden.map((i) => ({ label: `${iconOf(ws, i)} ${ws.tabs[i].title().toLowerCase()}`, cmd: `tab ${i + 1}`, hint: i < 9 ? (IS_MAC ? `⌘${i + 1}` : `ctrl+${i + 1}`) : "" })), rect.x, r.y + 1, t("more tabs")),
      tip: t("{n} more tabs: click for the list", { n: hidden.length }),
    });
    x += rect.w + SEP;
  }
  if (x + 1 <= r.x + r.w) {
    const pr = { x, y: r.y, w: 1, h: 1 };
    ui.text(x, r.y, "+", { fg: ui.hovered(pr) ? c.accent : c.subtle, attrs: BOLD });
    ui.hit(pr, { cmd: "palette", tip: t("open anything · ctrl+k") });
  }
}
