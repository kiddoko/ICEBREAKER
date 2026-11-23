import { ymd } from "../core/dates";
import { BOLD, type Rect } from "../core/grid";
import { dateLocale, t } from "../core/i18n";
import type { Action, KeyInput } from "../core/input";
import type { Deck } from "../deck";
import { drawMonth, weekStartOf } from "../ui/calendar";
import { INSET } from "../ui/layout";
import type { UI } from "../ui/ui";
import type { Overlay } from "./overlays";

/**
 * The mini calendar under the top bar's date and time (a click on them, `clock calendar`):
 * the month, today lit, a dot on the days with events (when the CALENDAR module is on),
 * ‹ › or the wheel for the months around. A click on a day opens it in CALENDAR.
 *
 *            ┌ lundi 23 novembre ─────┐
 *            │ ‹   novembre 2026   ›  │
 *            │ lu ma me je ve sa di   │
 *            │  …                     │
 *            │ 14:32:07 · week 48     │
 *            └────────────────────────┘
 */
export class MiniCalendar implements Overlay {
  modal = true;
  done = false;
  private month: Date;
  private marks = new Set<string>();
  private loadedFor = "";

  constructor(private readonly deck: Deck, private readonly anchor: { x: number; y: number }) {
    const now = new Date();
    this.month = new Date(now.getFullYear(), now.getMonth(), 1);
  }

  private get locale(): string {
    return dateLocale();
  }

  /** the days of this month that have events (CALENDAR's `events`), read once a month shown */
  private loadMarks(): void {
    const key = ymd(this.month);
    if (key === this.loadedFor) return;
    this.loadedFor = key;
    this.marks.clear();
    const d = this.deck;
    if (!d.services.has("calendar", "events")) return;
    const from = new Date(this.month.getFullYear(), this.month.getMonth(), 1), to = new Date(this.month.getFullYear(), this.month.getMonth() + 1, 1);
    void d.services
      .call({ id: "deck", permissions: "all" }, "calendar", "events", [from.toISOString(), to.toISOString()])
      .then((list) => {
        for (const e of (list as { start?: string }[]) ?? []) if (e.start) this.marks.add(ymd(new Date(e.start)));
        d.requestFrame();
      })
      .catch(() => {});
  }

  private shift(n: number): void {
    this.month = new Date(this.month.getFullYear(), this.month.getMonth() + n, 1);
  }

  private openDay(day: Date): void {
    this.done = true;
    if (this.deck.services.has("calendar", "events")) void this.deck.act(`cal open ${ymd(day)}`);
  }

  onKey(k: KeyInput): boolean {
    if (k.key === "esc" || k.key === "enter") this.done = true;
    else if (k.key === "left" || k.key === "pageup") this.shift(-1);
    else if (k.key === "right" || k.key === "pagedown") this.shift(1);
    else if (k.key === "home") this.month = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    return true;
  }

  onAction(a: Action): boolean {
    if (a === "back" || a === "confirm") this.done = true;
    else if (a === "left") this.shift(-1);
    else if (a === "right") this.shift(1);
    return true;
  }

  render(ui: UI, screen: Rect): void {
    const c = ui.c;
    this.loadMarks();
    ui.hit(screen, { onClick: () => (this.done = true), onWheel: () => {}, block: true });
    const w = 21 + INSET * 2 + 2, h = 9 + 4;
    const x = Math.max(screen.x, Math.min(screen.x + screen.w - w, this.anchor.x - w + 1));
    const box = { x, y: this.anchor.y, w, h };
    ui.hit(box, { onClick: () => {}, block: true });
    const now = new Date();
    const title = now.toLocaleDateString(this.locale, { weekday: "long", day: "numeric", month: "long" }).toLowerCase();
    const inner = ui.box(box, { title, focused: true, bg: c.panelAlt });
    const x0 = inner.x + INSET;
    drawMonth(ui, x0, inner.y, {
      month: this.month,
      selected: null,
      locale: this.locale,
      weekStart: weekStartOf(this.locale),
      onPick: (d) => this.openDay(d),
      onMonth: (n) => this.shift(n),
      marked: (d) => this.marks.has(ymd(d)),
    });
    // the time to the second, the week number
    ui.animate(1000 - now.getMilliseconds());
    const week = isoWeek(now);
    ui.text(x0, inner.y + inner.h - 1, now.toLocaleTimeString(this.locale, { hour: "2-digit", minute: "2-digit", second: "2-digit" }), { fg: c.fg, attrs: BOLD });
    ui.textRight(inner.x + inner.w - INSET, inner.y + inner.h - 1, t("week {n}", { n: week }), { fg: c.subtle });
  }
}

/** the ISO week number (weeks start on monday, week 1 holds the year's first thursday) */
export function isoWeek(d: Date): number {
  const day = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const n = day.getUTCDay() || 7;
  day.setUTCDate(day.getUTCDate() + 4 - n);
  const start = new Date(Date.UTC(day.getUTCFullYear(), 0, 1));
  return Math.ceil(((day.getTime() - start.getTime()) / 86400000 + 1) / 7);
}
