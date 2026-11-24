/**
 * THE TABS (Refonte UI step 3, docs/FRAMES.md) — thicker and readable, on each frame's
 * border:
 *
 *     ⌂ home  ✎ ideas        ×  ☂ weather       ▦ todo      ▾ +3  +
 *   ╭▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀─▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀─▀▀▀▀▀▀▀▀▀▀────────────╮
 *
 * Two rows: the name above the frame (an icon for what it is, the title, × on the one
 * shown or hovered), a half-block bar under it on the frame's top line — the one shown
 * in the accent (dimmer when its frame hasn't the focus). HOME is pinned: always first,
 * ⌂, no ×. No number in front
 * of the name any more: the numbers (⌘1…9) show only while ⌘ / ctrl is held. Each as wide as
 * its name (0.8: 10–24 cells) while they all fit; then they share the room (15–24 cells), the
 * rest in a "▾ +N" list, the one
 * shown always visible. Drag a tab sideways to put it elsewhere (`tab move <n> <m>`).
 */
import { mix } from "../core/color";
import { t, tLoose } from "../core/i18n";
import type { App } from "../apps/types";
import { BOLD, type Rect } from "../core/grid";
import { IS_MAC } from "../core/input";
import { strWidth, truncate } from "../core/unicode";
import { q, type BoxOptions, type MenuEntry, type UI } from "../ui/ui";
import { Bar, GAP, INSET } from "../ui/layout";
import { frameOfPane, PANE_OF, type PlaceFrame } from "./tabplaces";
import type { Pane } from "./workspace";
import type { Overlay } from "./overlays";
import { ContextMenu } from "./contextmenu";
import { groupOf } from "./tabgroups";
import type { Workspace } from "./workspace";
import { tabMenu } from "./menus";

// MINW: a name of 8–9 letters stays readable (the rest go in the ▾ +N list)
const MAXW = 24, MINW = 15;
const PLUS_W = 3;
const MORE_W = 7;
/** one cell between two tabs */
const SEP = 1;

/** what a tab shows before its title ("" when the title already starts with it: "♬ ♬ untitled") */
function iconOf(ws: Workspace, i: number): string {
  const icon = baseIcon(ws, i);
  return ws.tabs[i]?.title().trim().startsWith(icon) ? "" : icon;
}

function baseIcon(ws: Workspace, i: number): string {
  const app = ws.tabs[i];
  if (!app) return "·";
  if (app.kind === "note") return "✎";
  // the shell as a tab (term max): its own marks, as on the shell's tabs
  if (app.kind === "ibsh") return ws.deck.theme.glyphs.mark;
  if (app.kind === "terminal") return "❯";
  return ws.deck.apps.get(app.kind)?.icon?.trim()?.slice(0, 2) || "·";
}

// ── a frame's header: its tabs on its border ─────────────────────────────────

/**
 * A frame whose tabs sit on its border: the names on its first row, its box from the
 * row under (each tab's half-block bar is drawn on the box's top line). Returns the box.
 */
export function tabbedBox(ui: UI, r: Rect, o: BoxOptions = {}): Rect {
  // the tabs' row is clear: the ambient background's glyphs drifting between the tabs looked like noise
  ui.fill({ x: r.x, y: r.y, w: r.w, h: Math.min(1, r.h) });
  return ui.box({ x: r.x, y: r.y + 1, w: r.w, h: Math.max(0, r.h - 1) }, o);
}

/** a tab's colours: the one shown (lit when its frame has the focus), hovered, the others */
export function chipStyle(ui: UI, on: boolean, focused: boolean, hot: boolean): { fg: number; bg: number } {
  const c = ui.c;
  if (on) return { fg: c.panel, bg: focused ? c.accent : mix(c.accent, c.panel, 0.35) };
  return { fg: hot ? c.fg : c.muted, bg: hot ? c.highlight : mix(c.panelAlt, c.fg, 0.06) };
}

/** One tab's body: its row in `bg`, and the half-block bar under it on the frame's line. */
export function drawChip(ui: UI, x: number, y: number, w: number, bg: number, bar = bg): void {
  ui.fill({ x, y, w, h: 1 }, { bg });
  ui.text(x, y + 1, "▀".repeat(w), { fg: bar });
}

/**
 * A frame's own label (VAULT, PANEL) at `x` on its header row: not a tab (it can't be moved or
 * grouped), so never a lit chip — its name in bold, in the accent only while that frame has the
 * focus and shows its own content (a short accent stroke under it on the frame's line, like the
 * shown tab's bar), muted otherwise. A click brings the frame's own content back. Returns its
 * rect (the tabs moved into the frame go after it).
 */
export function frameLabel(ui: UI, x: number, y: number, label: string, lit: boolean, hit: { cmd?: string; onClick?: () => void; tip?: string; menu?: () => MenuEntry[] }): Rect {
  const c = ui.c;
  const text = ` ${label.toLowerCase()} `;
  const rect = { x, y, w: strWidth(text), h: 2 };
  const hot = ui.hovered(rect);
  ui.text(x, y, text, { fg: lit ? c.accent : hot ? c.fg : c.muted, ...(hot ? { bg: c.highlight } : {}), attrs: BOLD });
  if (lit) ui.text(x, y + 1, "▀".repeat(rect.w), { fg: c.accent });
  ui.hit(rect, hit);
  return rect;
}

/** the key that shows tab i (⌘1…9 / ctrl+1…9): none past the ninth ("ctrl+11" doesn't exist) */
const tabKey = (i: number): string => (i < 9 ? (IS_MAC ? `⌘${i + 1}` : `ctrl+${i + 1}`) : "");

/** HOME is pinned: first, ⌂, no × (it can't be closed by mistake) */
export const isPinned = (ws: Workspace, i: number) => ws.tabs[i]?.kind === "home";
/** the pinned tab's width: "⌂ home" */
const pinW = (ws: Workspace, i: number) => strWidth(tabTitle(ws.tabs[i])) + 4;

// ── tabs in other frames (workspace/tabplaces.ts) ────────────────────────────

/** the frame under the pointer, when a tab is dropped outside its own strip */
function frameUnder(ws: Workspace, m: { x: number; y: number }): PlaceFrame | "main" | null {
  for (const [pane, r] of Object.entries(ws.rects) as [Pane, Rect | undefined][]) {
    if (r && m.x >= r.x && m.x < r.x + r.w && m.y >= r.y && m.y < r.y + r.h) return frameOfPane(pane);
  }
  return null;
}

/** where a tab dragged out of its frame would go (outlined while dragging) */
let dropFrame: { from: PlaceFrame | "main"; to: PlaceFrame | "main" } | null = null;

/** The frame a dragged tab would drop into, outlined (Workspace.render calls it last). */
export function drawDropFrame(ws: Workspace, ui: UI): void {
  if (!dropFrame || dropFrame.to === dropFrame.from) return;
  const r = ws.rects[PANE_OF[dropFrame.to]];
  // (a narrow frame: the short one — "drop: the tab goes he…" was cut)
  if (r) ui.box(r, { border: "dashed", focused: true, fill: false, title: r.w >= strWidth(t("drop: the tab goes here")) + 8 ? t("drop: the tab goes here") : t("drop here") });
}

/** Drag handlers for tab `i` living in frame `from`: dropped onto another frame, it moves there. */
export function dragToFrame(ws: Workspace, i: number, from: PlaceFrame | "main"): { onDrag: (m: { x: number; y: number }) => boolean; onUp: () => boolean } {
  return {
    // true while the pointer is over another frame (the strip's own drag then stands aside)
    onDrag: (m) => {
      // its name under the pointer, whatever it's dragged onto
      ws.ghost = { label: `${iconOf(ws, i) || "·"} ${tabTitle(ws.tabs[i])}` };
      const to = frameUnder(ws, m);
      dropFrame = to && to !== from ? { from, to } : null;
      return !!dropFrame;
    },
    onUp: () => {
      const d = dropFrame;
      dropFrame = null;
      if (!d || d.to === d.from) return false;
      void ws.deck.act(`tab move ${i + 1} ${d.to === "vault" ? "tree" : d.to}`);
      return true;
    },
  };
}

/**
 * The tabs moved into frame `f`, after the frame's own tab(s), from `x` on the header row
 * `y`: a click shows it (in place of the frame's own content), × closes it, drag it onto
 * another frame. Returns where the next thing can go.
 */
export function placeChips(ws: Workspace, ui: UI, x: number, y: number, maxX: number, f: PlaceFrame, focused: boolean): number {
  const c = ui.c;
  // the one shown first (a narrow frame may not fit them all), the rest in a "+N" list
  const all = ws.tabsIn(f).sort((a, b) => Number(ws.tabs[b].key === ws.shows[f]) - Number(ws.tabs[a].key === ws.shows[f]));
  for (const [k, i] of all.entries()) {
    const app = ws.tabs[i];
    const pin = isPinned(ws, i);
    const label = `${pin ? "⌂ " : iconOf(ws, i) ? `${iconOf(ws, i)} ` : ""}${tabTitle(app)}`;
    // " label " and, unless pinned, " ×"; the one shown may be cut to fit
    const rest = all.length - k - 1;
    const room = maxX - x - (rest ? MORE_W : 0);
    const w = Math.min(MAXW, strWidth(label) + INSET * 2 + (pin ? 0 : GAP), k === 0 ? Math.max(0, room) : MAXW);
    if (w < 6 || x + w > maxX - (rest ? MORE_W : 0)) {
      // the ones that don't fit: a list
      const left = all.slice(k);
      const more = ` +${left.length} `;
      const mr = { x, y, w: strWidth(more), h: 1 };
      if (x + mr.w > maxX) break;
      ui.text(x, y, more, { fg: ui.hovered(mr) ? c.panel : c.accent, bg: ui.hovered(mr) ? c.accent : c.highlight, attrs: BOLD });
      ui.hit(mr, { onClick: () => ws.openMenu(left.map((j) => ({ label: `${iconOf(ws, j) ? `${iconOf(ws, j)} ` : ""}${tabTitle(ws.tabs[j])}`, cmd: `tab ${j + 1}` })), x, y + 1, t("more tabs")), tip: t("{n} more tabs: click for the list", { n: left.length }) });
      return x + mr.w + SEP;
    }
    const rect = { x, y, w, h: 2 };
    const on = ws.shows[f] === app.key;
    const hot = ui.hovered(rect);
    const st = chipStyle(ui, on, focused, hot);
    drawChip(ui, x, y, w, st.bg);
    ui.text(x + INSET, y, label, { fg: st.fg, bg: st.bg, attrs: on ? BOLD : 0 }, w - INSET * 2 - (pin ? 0 : GAP));
    const drag = dragToFrame(ws, i, f);
    ui.hit(rect, { cmd: `tab ${i + 1}`, tip: `${app.title()}\n${t("drag it onto another frame to move it · right-click: move, close")}`, menu: () => tabMenu(ws, i), onDrag: (m) => void drag.onDrag(m), onUp: () => void drag.onUp() });
    if (!pin) {
      const xr = { x: x + w - GAP - INSET, y, w: GAP + INSET, h: 1 };
      ui.text(x + w - GAP, y, on || hot ? "×" : " ", { fg: ui.hovered(xr) ? c.error : st.fg, bg: st.bg, attrs: BOLD });
      ui.hit(xr, { cmd: `tab close ${i + 1}`, tip: t("close · ctrl+w · shift+esc") });
    }
    x += w + SEP;
  }
  return x;
}

/** the page strip's chips this frame (a tab dragged out of a group's list lands on one) */
let chipsNow: { rect: Rect; first: number; group?: string }[] = [];
/** a tab being dragged out of a group's list: which, and where the pointer is */
let fromGroup: { i: number; group: string; m: { x: number; y: number } } | null = null;

/** A tab being dragged: which, onto which chip, and whether it drops ON it (a group) or beside it. */
let dragging: { from: number; to: number; onto: boolean } | null = null;

/**
 * Draw the main frame's tabs in `r` (2 rows: the names, then the frame's top line for
 * their bars): HOME, the lone tabs and the groups (workspace/tabgroups.ts).
 */
export function renderTabStrip(ws: Workspace, ui: UI, r: Rect): void {
  const c = ui.c;
  const focused = ws.focus === "main" && !ws.topModal;
  let x = r.x;
  const entries = ws.stripEntries();
  const n = entries.length;
  // the pinned tab (HOME) keeps its own small width; the others share the rest
  const pinned = entries.filter((e) => e.kind === "tab" && isPinned(ws, e.index)).map((e) => (e.kind === "tab" ? pinW(ws, e.index) + SEP : 0));
  const pinnedW = pinned.reduce((a, b) => a + b, 0);
  const others = n - pinned.length;
  const avail = r.x + r.w - x - PLUS_W - pinnedW;
  let tabW = others ? Math.max(MINW, Math.min(MAXW, Math.floor(avail / others) - 1)) : MAXW;
  const activeEntry = entries.findIndex((e) => (e.kind === "tab" ? e.index === ws.active : e.indexes.includes(ws.active)));
  // each tab as wide as its name (icon, name, ×), when they all fit that way
  const natural = (ei: number): number => {
    const e = entries[ei];
    if (e.kind === "group") {
      const i = e.indexes.find((j) => ws.tabs[j]?.key === e.group.active) ?? e.indexes[0];
      const name = e.group.name ? `${e.group.name} · ${tabTitle(ws.tabs[i])}` : tabTitle(ws.tabs[i]);
      return Math.min(MAXW, strWidth(name) + strWidth(` ${e.indexes.length}`) + 5);
    }
    if (isPinned(ws, e.index)) return pinW(ws, e.index);
    const app = ws.tabs[e.index];
    // its icon, ● when unsaved, ♪ when its page plays sound (as drawn below)
    const owner = app ? ws.deck.apps.sourceOf(app.kind) : "";
    const sound = !!owner && owner !== "core" && (ws.deck.mixer.isMuted(owner) || ws.deck.mixer.playing().includes(owner));
    const extra = (iconOf(ws, e.index) ? strWidth(iconOf(ws, e.index)) + 1 : 0) + (app?.dirty?.() ? 2 : 0) + (sound ? 2 : 0);
    return Math.max(10, Math.min(MAXW, strWidth(tabTitle(app)) + extra + 5));
  };
  const fitted = entries.reduce((sum, _, ei) => sum + natural(ei) + SEP, 0) <= r.x + r.w - x - PLUS_W;
  let shown = Array.from({ length: n }, (_, i) => i);
  // they don't all fit as wide as their names: they share the room (15–24 cells), the rest in a list
  if (!fitted && others * (tabW + 1) > avail) {
    tabW = MINW;
    // so narrow that not even one tab fits beside the list: only the list
    const fit = Math.floor((avail - MORE_W) / (tabW + 1)) + pinned.length;
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
  chipsNow = [];
  shown.forEach((ei, k) => {
    const e = entries[ei];
    const pin = e.kind === "tab" && isPinned(ws, e.index);
    const w = pin && e.kind === "tab" ? pinW(ws, e.index) : fitted ? natural(ei) : tabW;
    const rect = { x, y: r.y, w, h: 2 };
    rects.push(rect);
    chipsNow.push({ rect, first: e.kind === "tab" ? e.index : e.indexes[0], group: e.kind === "group" ? e.group.id : undefined });
    const i = e.kind === "tab" ? e.index : (e.indexes.find((j) => ws.tabs[j]?.key === e.group.active) ?? e.indexes[0]);
    const on = ei === activeEntry;
    const hot = ui.hovered(rect);
    const target = !!dragging && dragging.onto && dragging.to === firstOf(k) && dragging.from !== i;
    const { fg, bg } = chipStyle(ui, on, focused, hot || target);
    drawChip(ui, x, r.y, w, bg, target ? c.accent : bg);
    const closeX = x + w - 2;
    let tx = x + 1;
    if (pin) {
      // ⌂ home: no ×, can't be dragged away from the first place
      if (numbers && i < 9) tx = ui.text(tx, r.y, `${i + 1} `, { fg: on ? c.panel : c.accent, bg, attrs: BOLD });
      else tx = ui.text(tx, r.y, "⌂ ", { fg: on ? c.panel : c.accent, bg, attrs: BOLD });
      ui.text(tx, r.y, tabTitle(ws.tabs[i]), { fg, bg, attrs: on ? BOLD : 0 }, x + w - 1 - tx);
      // it can go to another frame (dragged onto it), not elsewhere in this strip
      const toFrame = dragToFrame(ws, i, "main");
      ui.hit(rect, { cmd: `tab ${i + 1}`, tip: `${ws.tabs[i].title()} · ${t("pinned: always first")}\n${tabKey(i) ? `${tabKey(i)} · ` : ""}${t("drag it onto another frame to move it")}`, menu: () => tabMenu(ws, i), onDrag: (m) => void toFrame.onDrag(m), onUp: () => void toFrame.onUp() });
    } else if (e.kind === "group") {
      // ▣ the group: its name (or its shown tab's), how many; hover lists them
      // a named group says which of its tabs is shown too ("boulot · ideas")
      const shownTitle = tabTitle(ws.tabs[i]);
      const name = e.group.name ? `${e.group.name}${shownTitle ? ` · ${shownTitle}` : ""}` : shownTitle || t("group");
      const count = ` ${e.indexes.length}`;
      // ⌘ held: the number of the tab it shows (a group had none, even the one in front)
      if (numbers && i < 9) tx = ui.text(tx, r.y, `${i + 1} `, { fg: on ? c.panel : c.accent, bg, attrs: BOLD });
      tx = ui.text(tx, r.y, "▣ ", { fg: on ? c.panel : c.accent, bg, attrs: BOLD });
      // cut with "…", never a moving marquee: a chip is read at a glance
      ui.text(tx, r.y, truncate(name, Math.max(0, x + w - 1 - strWidth(count) - tx)), { fg, bg, attrs: on ? BOLD : 0 });
      ui.text(x + w - 1 - strWidth(count), r.y, count, { fg: on ? c.panel : c.subtle, bg });
      // (no tip: hovering opens its list, which says it all; right-click: rename, ungroup)
      ui.hit(rect, { onClick: () => void ws.deck.act(`tab ${i + 1}`), menu: () => groupMenu(ws, i) });
      if (hot) openGroupList(ws, e.group.id, rect);
    } else {
      const unsaved = !!ws.tabs[i].dirty?.();
      // a module's page that plays sound: ♪ on its tab, a click mutes it (⊘) — like a browser tab
      const mx = ws.deck.mixer;
      const owner = ws.deck.apps.sourceOf(ws.tabs[i].kind);
      const sound = owner && owner !== "core" && (mx.isMuted(owner) || mx.playing().includes(owner)) ? owner : "";
      // the name comes first: the icon goes when it would leave the name under 6 cells
      const room = closeX - x - 2 - (numbers && i < 9 ? 2 : 0) - (unsaved ? 2 : 0) - (sound ? 2 : 0);
      if (numbers && i < 9) tx = ui.text(tx, r.y, `${i + 1} `, { fg: on ? c.panel : c.accent, bg, attrs: BOLD });
      let speaker: Rect | null = null;
      if (sound) {
        speaker = { x: tx, y: r.y, w: 1, h: 1 };
        const muted = mx.isMuted(sound);
        tx = ui.text(tx, r.y, muted ? "⊘ " : "♪ ", { fg: ui.hovered(speaker) ? c.warning : muted ? c.error : on ? c.panel : c.accent, bg, attrs: BOLD });
      }
      if ((fitted || room - 2 >= 6) && iconOf(ws, i)) tx = ui.text(tx, r.y, `${iconOf(ws, i)} `, { fg: on ? c.panel : c.subtle, bg });
      if (unsaved) tx = ui.text(tx, r.y, "● ", { fg: c.error, bg, attrs: BOLD });
      ui.text(tx, r.y, tabTitle(ws.tabs[i]), { fg, bg, attrs: on ? BOLD : 0 }, Math.max(0, closeX - tx - 1));
      const closeHot = ui.hovered({ x: closeX - 1, y: r.y, w: 3, h: 1 });
      ui.text(closeX, r.y, on || hot ? "×" : " ", { fg: closeHot ? c.error : on ? c.panel : c.subtle, bg, attrs: closeHot ? BOLD : 0 });
      const toFrame = dragToFrame(ws, i, "main");
      ui.hit(rect, {
        cmd: `tab ${i + 1}`,
        onMiddle: () => void ws.deck.act(`tab close ${i + 1}`),
        tip: `${ws.tabs[i].title()}\n${tabKey(i) ? `${tabKey(i)} · ` : ""}${t("drag: move it · onto another tab: a group · onto another frame: it goes there · right-click: Move to…")}`,
        menu: () => tabMenu(ws, i),
        // drag it: beside another chip moves it there, onto the middle of one makes a group
        // (never before or onto the pinned HOME)
        onDrag: (m) => {
          // over another frame: it'll move there (that frame is outlined)
          if (toFrame.onDrag(m)) return void (dragging = null);
          let to = rects.findIndex((rr) => m.x < rr.x + rr.w);
          if (to < 0) to = rects.length - 1;
          const rr = rects[to];
          const third = rr ? Math.max(1, Math.floor(rr.w / 3)) : 1;
          const onto = !!rr && m.x >= rr.x + third && m.x < rr.x + rr.w - third && firstOf(to) !== i;
          const dest = firstOf(to);
          dragging = isPinned(ws, dest) ? (onto ? null : { from: i, to: dest + 1, onto: false }) : { from: i, to: dest, onto };
        },
        onUp: () => {
          if (toFrame.onUp()) return void (dragging = null);
          const d = dragging;
          dragging = null;
          if (!d || d.to < 0 || d.to === d.from || d.to >= ws.tabCount) return;
          void ws.deck.act(d.onto ? `tab group ${d.to + 1} ${d.from + 1}` : `tab move ${d.from + 1} ${d.to + 1}`);
        },
      });
      ui.hit({ x: closeX - 1, y: r.y, w: 3, h: 1 }, { cmd: `tab close ${i + 1}`, tip: t("close · ctrl+w · shift+esc") });
      if (speaker && sound) {
        const muted = mx.isMuted(sound);
        ui.hit(speaker, { onClick: () => mx.setMuted(sound, !muted), tip: muted ? t("muted · click to hear it again") : t("playing sound · click to mute this tab") });
      }
    }
    x += w + SEP;
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
      return list.map((i) => ({ label: `${e.kind === "group" ? "▣ " : ""}${iconOf(ws, i) ? `${iconOf(ws, i)} ` : ""}${tabTitle(ws.tabs[i])}`, cmd: `tab ${i + 1}`, hint: i < 9 ? (IS_MAC ? `⌘${i + 1}` : `ctrl+${i + 1}`) : "" }));
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
      const v = await ws.deck.prompt(t("The group's name"), { initial: g.name || tabTitle(ws.tabs[i]) || "" });
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

/** A tab dragged out of a group's list, let go: into the chip under the pointer, another frame, or out. */
async function dropFromGroup(ws: Workspace): Promise<void> {
  const d = fromGroup;
  fromGroup = null;
  if (!d) return;
  const n = d.i + 1;
  const chip = chipsNow.find((cc) => d.m.x >= cc.rect.x && d.m.x < cc.rect.x + cc.rect.w && d.m.y >= cc.rect.y && d.m.y < cc.rect.y + cc.rect.h);
  if (chip?.group === d.group) return; // back onto its own group: nothing changes
  await ws.deck.act(`tab ungroup ${n}`);
  if (chip) return void (await ws.deck.act(`tab group ${chip.first + 1} ${n}`));
  const to = frameUnder(ws, d.m);
  if (to && to !== "main") await ws.deck.act(`tab move ${n} ${to === "vault" ? "tree" : to}`);
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
    // a right-click menu opened over it: the list goes (the two overlapped)
    if (ws.overlays.some((o) => o instanceof ContextMenu && !o.done)) return void (this.done = true);
    const w = Math.min(screen.w - this.anchor.x, Math.max(this.anchor.w, 30));
    const box = { x: this.anchor.x, y: this.anchor.y + this.anchor.h, w, h: rows.length + 2 };
    // gone once the pointer has been away from the chip and the list for a moment
    if (ui.hovered(this.anchor) || ui.hovered(box) || fromGroup) this.outSince = 0;
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
      // drag it: onto another group or tab (it joins it), onto another frame, or anywhere else
      // (it leaves the group, a tab of its own)
      ui.hit(row, {
        cmd: `tab ${i + 1}`,
        tip: t("click: show it · drag: onto another group, or out of this one"),
        onDrag: (m) => {
          fromGroup = { i, group: g.id, m: { x: m.x, y: m.y } };
          ws.ghost = { label: `${iconOf(ws, i) || "·"} ${tabTitle(ws.tabs[i])}` };
        },
        onUp: () => void dropFromGroup(ws),
      });
      const end = new Bar(ui, inner.x + INSET, y, inner.x + inner.w - INSET);
      end.text(`${iconOf(ws, i) ? `${iconOf(ws, i)} ` : ""}${tabTitle(ws.tabs[i])}`, { fg: on ? c.fg : c.muted, bg, attrs: on ? BOLD : 0 }, { priority: 9, fit: 4 });
      end.button("⇱", () => {}, { cmd: `tab ungroup ${i + 1}`, tip: t("take it out: a tab of its own") }, { side: "right", priority: 7 });
      end.button("×", () => {}, { cmd: `tab close ${i + 1}`, tip: t("close it") }, { side: "right", priority: 6 });
      end.draw();
    });
  }
}

/**
 * A tab's name as the deck writes it: a page's in the deck's language, like the menu bar
 * ("réglages" over a tab "settings" before); a note's or a terminal's as it is. HOME stays HOME.
 */
export function tabTitle(app: App | undefined): string {
  if (!app) return "";
  const title = app.title();
  const own = app.kind === "note" || app.kind === "terminal" || app.kind === "home";
  return (own ? title : tLoose(title)).toLowerCase();
}
