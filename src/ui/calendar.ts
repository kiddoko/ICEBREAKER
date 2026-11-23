import { mix } from "../core/color";
import { parseDay, parseTime, ymd } from "../core/dates";
import { BOLD, UNDERLINE } from "../core/grid";
import { INSET } from "./layout";
import { t, dateLocale } from "../core/i18n";
import { pad2 } from "../core/time";
import { strWidth } from "../core/unicode";
import type { UI } from "./ui";

/**
 * A small calendar and a small clock — the pieces of the date / time / days picker
 * (workspace/whenpicker.ts) and of the mini calendar under the top bar's date.
 *
 *    ‹  november 2026  ›
 *    mo tu we th fr sa su
 *                      1
 *     2  3  4  5  6  7  8
 *     …
 *
 * Pure parts (tested): the month's grid, where a week starts, what the picker gives back.
 */

/** the weekdays as the deck's commands write them, monday first */
export const DAY_IDS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type DayId = (typeof DAY_IDS)[number];

/** 1: weeks start on monday (most of the world, ISO) · 0: on sunday (the US, Canada, Japan…) */
export function weekStartOf(locale: string): 0 | 1 {
  return /^(en-(US|CA|PH)|ja|ko|zh-TW|he|pt-BR|es-MX)\b/i.test(locale) ? 0 : 1;
}

/** The month as whole weeks: the day numbers, 0 for the cells before the 1st and after the last. */
export function monthGrid(year: number, month: number, weekStart: 0 | 1): number[] {
  const first = new Date(year, month, 1).getDay();
  const lead = (first - weekStart + 7) % 7;
  const days = new Date(year, month + 1, 0).getDate();
  const cells = [...Array(lead).fill(0), ...Array.from({ length: days }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(0);
  return cells;
}

/** what the picker chose */
export interface Picked {
  date?: Date;
  /** minutes after midnight */
  time?: number;
  days?: string[];
  /** typed instead ("tomorrow 9h"): given back as it is, the commands read it */
  text?: string;
}

/** As the deck's commands read it: "2026-12-24", "2026-12-24 09:05", "07:30", "mon,fri" (monday first). */
export function pickedText(p: Picked): string {
  if (p.text !== undefined) return p.text;
  const time = p.time !== undefined ? `${pad2(Math.floor(p.time / 60))}:${pad2(p.time % 60)}` : "";
  if (p.days) return DAY_IDS.filter((d) => p.days!.includes(d)).join(",");
  return [p.date ? ymd(p.date) : "", time].filter(Boolean).join(" ");
}

/** what a module gets: plain strings, `text` ready for its command */
export function whenForModules(r: Picked & { cleared?: boolean }): { text: string; date?: string; time?: string; days?: string[]; typed?: boolean; cleared?: boolean } {
  if (r.cleared) return { text: "", cleared: true };
  if (r.text !== undefined) return { text: r.text, typed: true };
  return {
    text: pickedText(r),
    ...(r.date ? { date: ymd(r.date) } : {}),
    ...(r.time !== undefined ? { time: pickedText({ time: r.time }) } : {}),
    ...(r.days ? { days: r.days } : {}),
  };
}

/** a starting value read the way people write it ("fri", "24/12", "2026-12-24 9:30", "18h") */
export function readInitial(raw: string | undefined): { date?: Date; time?: number } {
  const s = (raw ?? "").trim();
  if (!s) return {};
  const parts = s.split(/\s+/);
  const time = parseTime(parts[parts.length - 1]);
  const dayText = time !== null ? parts.slice(0, -1).join(" ") : s;
  const date = dayText ? parseDay(dayText) ?? undefined : undefined;
  return { date, time: time ?? undefined };
}

/** the names of the weekdays in the deck's language ("lu ma me…" / "mo tu we…"), from weekStart */
export function weekdayNames(locale: string, weekStart: 0 | 1): string[] {
  // 2026-11-02 is a monday
  return Array.from({ length: 7 }, (_, i) => new Date(2026, 10, 1 + weekStart + i).toLocaleDateString(locale || dateLocale(), { weekday: "short" }).replace(".", "").slice(0, 2).toLowerCase());
}

/**
 * The month, drawn: its header with ‹ › (the month before / after), the weekdays, the days.
 * `selected` lit in the accent, today underlined in the accent, `marked` days with a dot.
 * Returns its height. The rect needs 22 cells × 9 rows.
 */
export function drawMonth(
  ui: UI,
  x: number,
  y: number,
  o: {
    month: Date;
    selected?: Date | null;
    locale: string;
    weekStart: 0 | 1;
    onPick?: (d: Date, double: boolean) => void;
    onMonth?: (delta: number) => void;
    marked?: (d: Date) => boolean;
    focused?: boolean;
  },
): number {
  const c = ui.c;
  const W = 21;
  const today = ymd(new Date());
  const title = o.month.toLocaleDateString(o.locale || dateLocale(), { month: "long", year: "numeric" }).toLowerCase();
  // the header: ‹ month year ›
  const prev = { x, y, w: 3, h: 1 }, next = { x: x + W - 3, y, w: 3, h: 1 };
  ui.text(prev.x, y, " ‹ ", { fg: ui.hovered(prev) ? c.bg : c.accent, bg: ui.hovered(prev) ? c.accent : undefined, attrs: BOLD });
  ui.text(next.x, y, " › ", { fg: ui.hovered(next) ? c.bg : c.accent, bg: ui.hovered(next) ? c.accent : undefined, attrs: BOLD });
  ui.textCenter({ x: x + 3, y, w: W - 6, h: 1 }, y, title, { fg: c.fg, attrs: BOLD });
  if (o.onMonth) {
    ui.hit(prev, { onClick: () => o.onMonth!(-1), tip: t("the month before · page up") });
    ui.hit(next, { onClick: () => o.onMonth!(1), tip: t("the month after · page down") });
    ui.hit({ x, y, w: W, h: 9 }, { onWheel: (d) => o.onMonth!(d > 0 ? 1 : -1) });
  }
  // the weekdays
  weekdayNames(o.locale, o.weekStart).forEach((n, i) => ui.text(x + i * 3, y + 1, n.padStart(2), { fg: c.subtle }));
  // the days
  const cells = monthGrid(o.month.getFullYear(), o.month.getMonth(), o.weekStart);
  const sel = o.selected ? ymd(o.selected) : "";
  cells.forEach((n, i) => {
    if (!n) return;
    const d = new Date(o.month.getFullYear(), o.month.getMonth(), n);
    const key = ymd(d);
    const cx = x + (i % 7) * 3, cy = y + 2 + Math.floor(i / 7);
    const cell = { x: cx - 1 < x ? cx : cx - 1, y: cy, w: 3, h: 1 };
    const on = key === sel;
    const hot = !!o.onPick && ui.hovered(cell);
    const weekend = d.getDay() === 0 || d.getDay() === 6;
    const bg = on ? (o.focused === false ? mix(c.accent, c.bg, 0.55) : c.accent) : hot ? c.highlight : undefined;
    const fg = on ? c.bg : key === today ? c.accent : weekend ? c.muted : c.fg;
    ui.text(cx, cy, String(n).padStart(2), { fg, ...(bg !== undefined ? { bg } : {}), attrs: (on || key === today ? BOLD : 0) | (key === today && !on ? UNDERLINE : 0) });
    if (o.marked?.(d)) ui.text(cx + 2, cy, "·", { fg: on ? c.accent : c.accentAlt, attrs: BOLD });
    if (o.onPick) ui.hit(cell, { onClick: () => o.onPick!(d, false), onDouble: () => o.onPick!(d, true) });
  });
  return 2 + cells.length / 7;
}

/**
 * A small clock: `◷  09 : 30` — the hour and the minutes, each changed with ↑↓ (when it's the
 * part you're on), the wheel, or a click on its ▴ ▾. Returns its width.
 */
export function drawTime(ui: UI, x: number, y: number, minutes: number, o: { part: 0 | 1 | null; onSet: (m: number) => void; onPart?: (p: 0 | 1) => void; step?: number }): number {
  const c = ui.c;
  const h = Math.floor(minutes / 60), m = minutes % 60;
  const step = o.step ?? 5;
  let cx = ui.text(x, y, "◷ ", { fg: c.accent });
  const part = (p: 0 | 1, s: string) => {
    const r = { x: cx, y, w: 4, h: 1 };
    const on = o.part === p;
    const hot = ui.hovered(r);
    ui.text(cx, y, ` ${s} `, { fg: on ? c.bg : c.fg, bg: on ? c.accent : hot ? c.highlight : mix(c.panel, c.fg, 0.08), attrs: BOLD });
    const change = (dir: number) => {
      const next = p === 0 ? (((h + dir) % 24) + 24) % 24 * 60 + m : h * 60 + (((Math.round(m / step) * step + dir * step) % 60) + 60) % 60;
      o.onSet(next);
    };
    ui.hit(r, { onClick: () => o.onPart?.(p), onWheel: (d) => change(d > 0 ? -1 : 1), tip: t("↑↓ or the wheel: change it · type the time below") });
    cx += 4;
  };
  part(0, pad2(h));
  cx = ui.text(cx, y, " : ", { fg: c.subtle, attrs: BOLD });
  part(1, pad2(m));
  return cx - x;
}

/** the seven days as chips you tick: `[lu] [ma] [me] …` — returns the width */
export function drawDays(ui: UI, x: number, y: number, days: Set<string>, o: { locale: string; onToggle: (d: DayId) => void; cursor?: number | null }): number {
  const c = ui.c;
  const names = weekdayNames(o.locale, 1);
  let cx = x;
  DAY_IDS.forEach((id, i) => {
    const label = ` ${names[i]} `;
    const r = { x: cx, y, w: strWidth(label), h: 1 };
    const on = days.has(id);
    const hot = ui.hovered(r) || o.cursor === i;
    ui.text(cx, y, label, { fg: on ? c.bg : hot ? c.fg : c.muted, bg: on ? c.accent : hot ? c.highlight : mix(c.panel, c.fg, 0.08), attrs: on ? BOLD : 0 });
    ui.hit(r, { onClick: () => o.onToggle(id) });
    cx += r.w + INSET;
  });
  return cx - x - 1;
}
