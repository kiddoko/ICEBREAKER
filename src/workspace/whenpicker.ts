import { mix } from "../core/color";
import { addDays, startOfDay } from "../core/dates";
import { BOLD, type Rect } from "../core/grid";
import { t } from "../core/i18n";
import type { Action, KeyInput } from "../core/input";
import { strWidth, wrapWords } from "../core/unicode";
import { DAY_IDS, drawDays, drawMonth, drawTime, readInitial, weekStartOf, type Picked } from "../ui/calendar";
import { CANCEL, dialogButtons, OK } from "../ui/dialog";
import { Field } from "../ui/field";
import { GAP, INSET } from "../ui/layout";
import type { UI } from "../ui/ui";
import type { Overlay } from "./overlays";

/**
 * WHEN? — the one picker for a day, a time, or days of the week (a due date, a reminder,
 * an event, an alarm, a habit's days). `deck.pickWhen` · `ib.ui.pickWhen` for modules.
 *
 *   ┌ when ───────────────────────────────────────────┐
 *   │ due date for #3                                  │
 *   │  ‹    november 2026    ›     today               │
 *   │  lu ma me je ve sa di        tomorrow            │
 *   │                     1        next monday         │
 *   │   2  3  4  5  6  7  8        in a week           │
 *   │   …                                              │
 *   │                              ◷  09 : 30          │
 *   │  [lu] [ma] [me] [je] [ve] [sa] [di]              │
 *   │  ⌨ or type it: tomorrow 9h, fri, +3d…            │
 *   │                          none   cancel   OK  ⏎   │
 *   └──────────────────────────────────────────────────┘
 *
 * Keys: ←→↑↓ a day / a week · page up / down a month · home today · tab the next part
 * (the calendar, the clock, the days, the field) · on the clock ↑↓ change, ←→ hours /
 * minutes · on the days ←→ and space · typing goes to the field · enter OK · esc cancel.
 */
export interface WhenOptions {
  /** a day (default true unless only `time` or `days` is asked) */
  date?: boolean;
  /** a time of day */
  time?: boolean;
  /** days of the week (several) */
  days?: boolean;
  /** what's there now ("2026-12-24", "fri 9h", "18:30") */
  initial?: string;
  initialDays?: string[];
  /** the time to start from when there's none (minutes, default 9:00) */
  defaultTime?: number;
  /** a "none" button (a due date taken away): gives { cleared: true } */
  clear?: boolean;
  /** the field's hint: what can be typed instead */
  placeholder?: string;
  /** already in the field (typed before and not understood: it comes back to be fixed) */
  typed?: string;
  /** an "all day" button: the day without a time (an event) */
  allDay?: boolean;
}

export type WhenResult = Picked & { cleared?: boolean };

type Part = "cal" | "time" | "days" | "field";

export class WhenPicker implements Overlay {
  modal = true;
  done = false;
  private readonly wantDate: boolean;
  private date: Date;
  private month: Date;
  private time: number;
  private days: Set<string>;
  private part: Part;
  private timePart: 0 | 1 = 0;
  private dayCursor = 0;
  private readonly field: Field;
  private readonly weekStart: 0 | 1;

  constructor(
    private readonly title: string,
    private readonly o: WhenOptions,
    private readonly locale: string,
    private readonly resolve: (r: WhenResult | null) => void,
  ) {
    this.wantDate = o.date ?? (!o.time && !o.days);
    const init = readInitial(o.initial);
    this.date = init.date ?? startOfDay(new Date());
    this.month = new Date(this.date.getFullYear(), this.date.getMonth(), 1);
    this.time = init.time ?? o.defaultTime ?? 9 * 60;
    this.days = new Set(o.initialDays ?? []);
    this.part = this.wantDate ? "cal" : o.time ? "time" : o.days ? "days" : "field";
    this.weekStart = weekStartOf(locale);
    this.field = new Field({ icon: "⌨", onSubmit: () => this.ok() });
    if (o.typed) (this.field.text = o.typed), (this.part = "field");
  }

  private finish(r: WhenResult | null): void {
    if (this.done) return;
    this.done = true;
    this.resolve(r);
  }

  /** OK: what's typed wins (the commands read it), else what's picked */
  private ok(): void {
    const typed = this.field.text.trim();
    if (typed) return this.finish({ text: typed });
    this.finish({
      ...(this.wantDate ? { date: this.date } : {}),
      ...(this.o.time ? { time: this.time } : {}),
      ...(this.o.days ? { days: DAY_IDS.filter((d) => this.days.has(d)) } : {}),
    });
  }

  private setDate(d: Date): void {
    this.date = startOfDay(d);
    this.month = new Date(d.getFullYear(), d.getMonth(), 1);
  }

  private parts(): Part[] {
    return [...(this.wantDate ? ["cal" as Part] : []), ...(this.o.time ? ["time" as Part] : []), ...(this.o.days ? ["days" as Part] : []), "field"];
  }

  private stepTime(dir: number): void {
    const h = Math.floor(this.time / 60), m = this.time % 60;
    this.time = this.timePart === 0 ? ((((h + dir) % 24) + 24) % 24) * 60 + m : h * 60 + ((((Math.round(m / 5) * 5 + dir * 5) % 60) + 60) % 60);
  }

  onKey(k: KeyInput): boolean {
    if (k.key === "esc") return this.finish(null), true;
    if (k.key === "tab") {
      const ps = this.parts();
      this.part = ps[(ps.indexOf(this.part) + (k.shift ? ps.length - 1 : 1)) % ps.length];
      return true;
    }
    if (this.part === "field") {
      if (k.key === "enter") return this.ok(), true;
      if (k.key === "up" && !this.field.text) return (this.part = this.parts()[0]), true;
      this.field.onKey(k);
      return true;
    }
    if (k.key === "enter") return this.ok(), true;
    if (this.part === "cal") {
      const step: Record<string, number> = { left: -1, right: 1, up: -7, down: 7 };
      if (k.key in step) return this.setDate(addDays(this.date, step[k.key])), true;
      if (k.key === "pageup" || k.key === "pagedown") return this.setDate(new Date(this.date.getFullYear(), this.date.getMonth() + (k.key === "pageup" ? -1 : 1), Math.min(this.date.getDate(), 28))), true;
      if (k.key === "home") return this.setDate(new Date()), true;
    }
    if (this.part === "time") {
      if (k.key === "left" || k.key === "right") return (this.timePart = k.key === "left" ? 0 : 1), true;
      if (k.key === "up" || k.key === "down") return this.stepTime(k.key === "up" ? 1 : -1), true;
    }
    if (this.part === "days") {
      if (k.key === "left" || k.key === "right") return (this.dayCursor = (this.dayCursor + (k.key === "left" ? 6 : 1)) % 7), true;
      if (k.key === "space") return this.toggleDay(DAY_IDS[this.dayCursor]), true;
    }
    return true;
  }

  onText(s: string): boolean {
    // a space on the days ticks one; anything else typed goes to the field
    if (this.part === "days" && s === " ") return this.toggleDay(DAY_IDS[this.dayCursor]), true;
    this.part = "field";
    this.field.onText(s);
    return true;
  }

  onAction(a: Action): boolean {
    if (a === "back") this.finish(null);
    else if (a === "confirm") this.ok();
    return true;
  }

  private toggleDay(d: string): void {
    if (this.days.has(d)) this.days.delete(d);
    else this.days.add(d);
  }

  render(ui: UI, screen: Rect): void {
    const c = ui.c;
    ui.dim(screen, c.subtle);
    ui.hit(screen, { onClick: () => this.finish(null), onWheel: () => {}, block: true });
    const calW = 21, side = 18;
    const w = Math.min(screen.w - GAP * 2, Math.max(48, (this.wantDate ? calW + GAP * 2 + side : 40) + INSET * 2));
    const titleLines = wrapWords(this.title, w - 4).slice(0, 3);
    const calH = this.wantDate ? 9 : 0;
    const timeH = this.o.time && !this.wantDate ? 2 : 0;
    const daysH = this.o.days ? 3 : 0;
    const h = Math.min(screen.h - 2, 2 + titleLines.length + 1 + calH + timeH + daysH + 2 + 2);
    const box = { x: screen.x + Math.floor((screen.w - w) / 2), y: screen.y + Math.floor((screen.h - h) / 3), w, h };
    ui.hit(box, { onClick: () => {}, onWheel: () => {}, block: true });
    const inner = ui.box(box, { title: t("when"), focused: true, bg: c.panelAlt });
    const x0 = inner.x + INSET;
    let y = inner.y;
    titleLines.forEach((l) => ui.text(x0, y++, l, { fg: c.fg, attrs: BOLD }, inner.w - INSET * 2));
    y++;

    if (this.wantDate) {
      drawMonth(ui, x0, y, {
        month: this.month,
        selected: this.date,
        locale: this.locale,
        weekStart: this.weekStart,
        focused: this.part === "cal",
        onPick: (d, double) => {
          this.setDate(d);
          this.part = "cal";
          if (double) this.ok();
        },
        onMonth: (n) => (this.month = new Date(this.month.getFullYear(), this.month.getMonth() + n, 1)),
      });
      // quick picks on the right: today, tomorrow, next monday, in a week
      const sx = x0 + calW + GAP * 2;
      const today = startOfDay(new Date());
      const nextMonday = addDays(today, ((8 - today.getDay()) % 7) || 7);
      const quick: [string, Date][] = [[t("today"), today], [t("tomorrow"), addDays(today, 1)], [t("next monday"), nextMonday], [t("in a week"), addDays(today, 7)]];
      quick.forEach(([label, d], i) => {
        const r = { x: sx, y: y + i, w: Math.min(side, inner.x + inner.w - sx), h: 1 };
        const on = d.getTime() === this.date.getTime();
        const hot = ui.hovered(r);
        ui.text(sx, r.y, ` ${label} `, { fg: on ? c.accent : hot ? c.fg : c.muted, bg: hot ? c.highlight : undefined, attrs: on ? BOLD : 0 }, r.w);
        ui.hit(r, { onClick: () => (this.setDate(d), (this.part = "cal")), onDouble: () => (this.setDate(d), this.ok()) });
      });
      if (this.o.time) drawTime(ui, sx + 1, y + 6, this.time, { part: this.part === "time" ? this.timePart : null, onSet: (m) => ((this.time = m), (this.part = "time")), onPart: (p) => ((this.timePart = p), (this.part = "time")) });
      y += calH;
    } else if (this.o.time) {
      drawTime(ui, x0, y, this.time, { part: this.part === "time" ? this.timePart : null, onSet: (m) => ((this.time = m), (this.part = "time")), onPart: (p) => ((this.timePart = p), (this.part = "time")) });
      y += timeH;
    }

    if (this.o.days) {
      const dw = drawDays(ui, x0, y, this.days, { locale: this.locale, onToggle: (d) => ((this.part = "days"), this.toggleDay(d)), cursor: this.part === "days" ? this.dayCursor : null });
      // presets: every day, weekdays, the weekend
      let px = x0;
      const presets: [string, string[]][] = [[t("every day"), [...DAY_IDS]], [t("weekdays"), ["mon", "tue", "wed", "thu", "fri"]], [t("weekend"), ["sat", "sun"]]];
      for (const [label, set] of presets) {
        const lw = strWidth(label) + 2;
        if (px + lw > inner.x + inner.w - INSET) break;
        const same = set.length === this.days.size && set.every((d) => this.days.has(d));
        px += ui.button(px, y + 1, label, () => (this.days = new Set(set)), { selected: same, quiet: !same }) + GAP;
      }
      void dw;
      y += daysH;
    }

    // or type it: the commands read "tomorrow 9h", "fri", "+3d", "24/12"…
    this.field.render(ui, { x: x0, y, w: inner.w - INSET * 2, h: 1 }, { focused: this.part === "field", placeholder: this.o.placeholder ?? t("or type it: tomorrow 9h, fri, +3d, 24/12…") });
    ui.hit({ x: x0, y, w: inner.w - INSET * 2, h: 1 }, { onClick: () => (this.part = "field") });

    const fy = inner.y + inner.h - 1;
    const start = dialogButtons(ui, inner, [
      ...(this.o.clear ? [{ label: t("none"), run: () => this.finish({ cleared: true }), tip: t("no date") }] : []),
      ...(this.o.allDay ? [{ label: t("all day"), run: () => this.finish({ date: this.date }), tip: t("the day, without a time") }] : []),
      { label: CANCEL(), run: () => this.finish(null) },
      { label: OK(), run: () => this.ok(), selected: true },
    ], fy);
    const hint = this.part === "cal" ? t("←→↑↓ a day · pgup pgdn a month · tab next") : this.part === "time" ? t("↑↓ change · ←→ hours / minutes") : this.part === "days" ? t("←→ · space ticks") : "";
    if (hint && start - x0 > 8) ui.text(x0, fy, hint, { fg: mix(c.muted, c.panelAlt, 0.2) }, start - x0 - GAP);
  }
}
