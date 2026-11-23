/**
 * DESIGN SKETCH (branch design-top-bar, not for master as it is): three ways to draw the top
 * of the window, side by side in the real renderer, to choose one. In the devtools / the
 * Browser pane: `topSketch.style = "a" | "b" | "c" | "now"`.
 *
 *   now  today (0.7.1): the menu bar band, a row of air, the frames' tabs
 *   a    ONE ROW: no menu bar. ◆ ▾ (the deck's menu, which takes the menu bar's items) at the
 *        left of the frames' header row, uplink and the clock at its right end
 *   b    ALIGNED BAR: the menu bar stays but loses its band, sits on the frames' grid (logo over
 *        the tree's label, the menu over the page's tabs, the clock ending where the page ends)
 *   c    STATUS RAIL: the top of the window is only the frames' tabs; ◆ ▾ moves to the left of
 *        the status bar (like a start button), uplink and the clock to its right end
 *
 * a, b and c also: the row of air is clear (no stray background glyph), the tree's VAULT is a
 * frame label (lit only when the tree has the focus) instead of a lit tab, and tabs are as
 * wide as their name.
 */
import { mix, NONE } from "../core/color";
import { BOLD } from "../core/grid";
import { dateLocale, t } from "../core/i18n";
import { strWidth } from "../core/unicode";
import type { MenuEntry, UI } from "../ui/ui";
import type { Workspace } from "./workspace";

export type TopStyle = "now" | "a" | "b" | "c";
export const topSketch: { style: TopStyle } = { style: "now" };
(globalThis as unknown as { topSketch: typeof topSketch }).topSketch = topSketch;

export const sketchOn = () => topSketch.style !== "now";

/** the menu bar's places, for the deck's menu when there's no menu bar (a, c) */
export function placesMenu(): MenuEntry[] {
  if (topSketch.style !== "a" && topSketch.style !== "c") return [];
  return [
    { label: `▦ ${t("modules")}`, cmd: "launch modules", hint: "⌘⇧M" },
    { label: `⬡ ${t("store")}`, cmd: "store" },
    { label: "⬢ nexus", cmd: "launch explorer", hint: "⌘⇧E" },
    { label: `⚙ ${t("settings")}`, cmd: "settings", hint: "⌘," },
    { label: `? ${t("help")}`, cmd: "manual", hint: "F1" },
    "-",
  ];
}

const logoLabel = (ui: UI, compact: boolean) => (compact ? ` ${ui.theme.glyphs.mark} ▾ ` : ` ${ui.theme.glyphs.mark} icebreaker ▾ `);
export const logoWidth = (ui: UI, compact: boolean) => strWidth(logoLabel(ui, compact));

function clockParts(narrow: boolean): { up: string; clock: string } {
  const now = new Date();
  const time = now.toLocaleTimeString(dateLocale(), { hour: "2-digit", minute: "2-digit", ...(narrow ? {} : { second: "2-digit" }) });
  const date = now.toLocaleDateString(dateLocale(), { weekday: "short", day: "numeric", month: "short" }).toLowerCase();
  return { up: narrow ? " ■ " : " uplink ■ ", clock: narrow ? ` ${time} ` : ` ${date}  ${time} ` };
}
export function clockWidth(narrow: boolean): number {
  const p = clockParts(narrow);
  return strWidth(p.up) + (narrow ? 0 : 1) + strWidth(p.clock);
}

/**
 * "◆ ▾" (compact) or "◆ icebreaker ▾": the deck's menu as a small tinted button. Returns its width.
 * `bg` is what's behind it (the status bar's colour in c).
 */
export function logoChip(ws: Workspace, ui: UI, x: number, y: number, compact: boolean, bg: number): number {
  const c = ui.c;
  const label = logoLabel(ui, compact);
  const w = strWidth(label);
  const rect = { x, y, w, h: 1 };
  const open = ws.overlays.some((o) => !o.done && ((o as { title?: string }).title ?? "").startsWith("ICEBREAKER ")); // menus.ts DECK_MENU_TITLE (no import: a cycle)
  const hot = ui.hovered(rect) || open;
  const chip = hot ? mix(c.accent, bg, 0.62) : mix(c.accent, bg, 0.84);
  ui.fill(rect, { bg: chip });
  if (compact) ui.text(x + 1, y, ui.theme.glyphs.mark, { fg: c.accent, bg: chip, attrs: BOLD });
  else ui.gradientText(x + 1, y, label.trim().slice(0, -2), ui.theme.gradient, BOLD, (ui.now / 8000) % 1);
  ui.text(x + w - 2, y, "▾", { fg: c.accent, bg: chip, attrs: BOLD });
  ui.hit(rect, { onClick: () => ws.openDeckMenu(), tip: t("the deck's menu: modules, store, nexus, settings, help, updates, log out · click · F10") });
  return w;
}

/**
 * "uplink ■ │ mon 23 nov 19:01:46" ending at `xEnd` (narrow: "■ 19:01"). Returns where it starts.
 */
export function uplinkClock(ws: Workspace, ui: UI, xEnd: number, y: number, narrow: boolean, bg: number): number {
  const c = ui.c;
  const d = ws.deck;
  const now = new Date();
  const { up, clock } = clockParts(narrow);
  ui.animate(narrow ? 60000 - (now.getSeconds() * 1000 + now.getMilliseconds()) : 1000 - now.getMilliseconds());
  const lamp = !d.ai.ready ? c.error : d.ai.busy > 0 ? c.warning : c.success;
  const w = clockWidth(narrow);
  const x0 = xEnd - w;
  let x = x0;
  const upR = { x, y, w: strWidth(up), h: 1 };
  if (!narrow) x = ui.text(x, y, " uplink ", { fg: d.ai.ready ? c.fg : c.muted, bg, attrs: BOLD });
  else x = ui.text(x, y, " ", { bg });
  x = ui.text(x, y, "■ ", { fg: lamp, bg });
  ui.hit(upR, d.ai.ready ? { cmd: "link", tip: `UPLINK: ${d.ai.provider.label}` } : { cmd: "settings", tip: `UPLINK ${t("off")}: ${d.ai.problem ?? ""}` });
  if (!narrow) x = ui.text(x, y, "│", { fg: c.faint, bg });
  const clockR = { x, y, w: strWidth(clock), h: 1 };
  const hot = ui.hovered(clockR);
  ui.text(x, y, clock, { fg: hot ? c.fg : c.muted, bg });
  if (hot) ui.tint(clockR, NONE, c.highlight);
  ui.hit(clockR, { cmd: "clock calendar", tip: t("the month, today, the days with events · click") });
  return x0;
}

/**
 * A frame's own label (VAULT, PANEL) in a, b, c: not a tab (it can't be moved or grouped), so
 * not a lit chip — its name in bold, in the accent only while that frame has the focus and
 * shows its own content. Returns its rect (the frame's other tabs go after it).
 */
export function frameLabel(ui: UI, x: number, y: number, label: string, lit: boolean, hit: Parameters<UI["hit"]>[1]): { x: number; y: number; w: number; h: number } {
  const c = ui.c;
  const text = ` ${label} `;
  const rect = { x, y, w: strWidth(text), h: 2 };
  const hot = ui.hovered(rect);
  ui.text(x, y, text, { fg: lit ? c.accent : hot ? c.fg : c.muted, ...(hot ? { bg: c.highlight } : {}), attrs: BOLD });
  // its mark on the frame's line: a short accent stroke while lit, like the shown tab's bar
  if (lit) ui.text(x, y + 1, "▀".repeat(rect.w), { fg: c.accent });
  ui.hit(rect, hit);
  return rect;
}
