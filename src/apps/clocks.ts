/**
 * CLOCKS — the module's own app: the time (in your clock face), timers
 * (several, named), a stopwatch with laps, and the world.
 *
 *   t  a new timer      space  stopwatch start / stop    l  lap
 *   r  reset the stopwatch     x  stop the next timer    w  add a city
 */
import { mix } from "../core/color";
import { BOLD, type Rect } from "../core/grid";
import { t } from "../core/i18n";
import type { Action, KeyInput } from "../core/input";
import type { Deck } from "../deck";
import type { UI } from "../ui/ui";
import { fitMatrix, matrixSize, matrixText } from "../ui/dots";
import { drawClock } from "../widgets/clockfaces";
import { clockState, dur, swNow } from "../widgets/clockstate";
import type { App, AppSpec } from "./types";
import { Bar, Row } from "../ui/layout";
import { DURATIONS, timeZones } from "../core/suggest";

class ClocksApp implements App {
  readonly kind = "clocks";
  readonly key = "clocks";
  constructor(private readonly deck: Deck) {}
  title() {
    return "clocks";
  }
  status() {
    return t("t timer · x stop a timer · space stopwatch · l lap · r reset · w add a city · f clock face");
  }
  private async newTimer(): Promise<void> {
    const v = await this.deck.prompt(t("Timer: how long, and what for?"), { placeholder: "4m tea · 25 work · 1h30 oven", suggestions: DURATIONS });
    if (v?.trim()) void this.deck.act(`timer ${v.trim()}`);
  }
  private async addCity(): Promise<void> {
    const v = await this.deck.prompt(t("A city (Area/City)"), { placeholder: "Asia/Tokyo, America/Montreal, Europe/Lisbon", suggestions: timeZones() });
    if (v?.trim()) void this.deck.act(`worldclock add ${v.trim()}`);
  }
  onText(s: string): boolean {
    const act = (c: string) => void this.deck.act(c);
    if (s === "t") return void this.newTimer(), true;
    if (s === "x") return act("timer stop"), true;
    if (s === " ") return act("stopwatch toggle"), true;
    if (s === "l") return act("stopwatch lap"), true;
    if (s === "r") return act("stopwatch reset"), true;
    if (s === "w") return void this.addCity(), true;
    if (s === "f") return act("clock style next"), true;
    return false;
  }
  onKey(_k: KeyInput): boolean {
    return false;
  }
  onAction(a: Action): boolean {
    if (a === "confirm") return this.onText(" ");
    return false;
  }

  render(ui: UI, r: Rect, _focused: boolean): void {
    const c = ui.c;
    ui.animate(Math.min(100, 1000 - (Date.now() % 1000)));
    // the time, big, in your clock face
    const top = { x: r.x + 2, y: r.y + 1, w: r.w - 4, h: Math.max(5, Math.min(12, Math.floor(r.h * 0.38))) };
    drawClock(ui, top, this.deck);

    const y0 = top.y + top.h + 1;
    const colW = Math.floor((r.w - 6) / 3);
    const cols = [r.x + 2, r.x + 3 + colW, r.x + 4 + colW * 2];
    // a column's title, its button on the right — the title shrinks (…), the button goes if there's no room
    const head = (x: number, label: string, btn: string, cmd: () => void, tip: string) => {
      new Bar(ui, x, y0, x + colW - 1)
        .text(label, { fg: c.title, attrs: BOLD }, { priority: 9, fit: 4 })
        .button(btn, cmd, { tip }, { side: "right", priority: 5 })
        .draw();
      ui.hline(x, y0 + 1, colW - 1, { fg: c.faint }, "─");
    };

    // timers
    head(cols[0], t("TIMERS"), "+", () => void this.newTimer(), "t · timer 4m tea");
    const timers = [...clockState.timers].sort((a, b) => a.end - b.end);
    if (!timers.length) ui.text(cols[0], y0 + 2, t("none — t starts one"), { fg: c.muted }, colW - 1);
    timers.forEach((tm, i) => {
      const y = y0 + 2 + i * 2;
      if (y + 1 >= r.y + r.h) return;
      const left = tm.end - Date.now();
      ui.text(cols[0], y, tm.label, { fg: c.fg }, colW - 10);
      ui.textRight(cols[0] + colW - 2, y, dur(left), { fg: i === 0 ? c.accent : c.subtle, attrs: BOLD });
      ui.bar(cols[0], y + 1, colW - 4, 1 - left / tm.total, i === 0 ? c.accent : c.subtle, c.faint);
      ui.hit({ x: cols[0], y, w: colW - 1, h: 2 }, { cmd: `timer stop ${tm.id}`, tip: t("click: stop it") });
    });

    // the stopwatch and its laps
    head(cols[1], t("STOPWATCH"), swNow() ? "↺" : "▶", () => void this.deck.act(swNow() && !clockState.swStart ? "stopwatch reset" : "stopwatch toggle"), "space · l lap · r reset");
    const sw = dur(swNow()) + (clockState.swStart ? `.${Math.floor((swNow() % 1000) / 100)}` : "");
    const k = fitMatrix(sw, colW - 2, 4, 1);
    let sy = y0 + 2;
    if (k) {
      matrixText(ui, cols[1], sy, sw, k, () => (clockState.swStart ? c.accent : c.subtle));
      sy += matrixSize(sw, k).h + 1;
    } else ui.text(cols[1], sy++, sw, { fg: c.accent, attrs: BOLD });
    // start · lap · reset: what doesn't fit the column isn't drawn (space, l, r still work)
    const row = new Row(ui, cols[1], sy, cols[1] + colW - 1);
    row.button(clockState.swStart ? t("❚❚ stop") : t("▶ start"), () => {}, { cmd: "stopwatch toggle", tip: "space" });
    row.button(t("lap"), () => {}, { cmd: "stopwatch lap", tip: "l" });
    row.button(t("↺ reset"), () => {}, { cmd: "stopwatch reset", tip: "r" });
    const laps = clockState.laps;
    laps.slice(-Math.max(0, r.y + r.h - sy - 3)).reverse().forEach((lap, i) => {
      const n = laps.length - i;
      const prev = laps[n - 2] ?? 0;
      new Bar(ui, cols[1], sy + 2 + i, cols[1] + colW - 1)
        .text(`${t("lap")} ${n}`, { fg: c.muted }, { priority: 5 })
        .text(`${dur(lap)}  +${dur(lap - prev)}`, { fg: i === 0 ? c.fg : c.subtle }, { side: "right", priority: 9, fit: 5 })
        .draw();
    });

    // the world
    head(cols[2], t("WORLD"), "+", () => void this.addCity(), "w · worldclock add Asia/Tokyo");
    const here = new Date();
    this.deck.settings.data.home.worldClocks.forEach((tz, i) => {
      const y = y0 + 2 + i;
      if (y >= r.y + r.h) return;
      let time = "--:--", hour = 12;
      try {
        time = here.toLocaleTimeString(undefined, { timeZone: tz, hour: "2-digit", minute: "2-digit" });
        hour = Number(here.toLocaleString("en-GB", { timeZone: tz, hour: "2-digit", hour12: false }));
      } catch {
        /* unknown zone */
      }
      const day = hour >= 7 && hour < 19;
      ui.text(cols[2], y, day ? "☀" : "☾", { fg: day ? c.warning : mix(c.info, c.bg, 0.3) });
      ui.text(cols[2] + 2, y, tz.split("/").pop()!.replace(/_/g, " "), { fg: c.fg }, colW - 10);
      ui.textRight(cols[2] + colW - 2, y, time, { fg: c.accent, attrs: BOLD });
      ui.hit({ x: cols[2], y, w: colW - 1, h: 1 }, { tip: `${tz}\nworldclock rm ${tz}` });
    });
  }
}

export const clocksSpec: AppSpec = {
  kind: "clocks",
  title: "Clocks",
  description: "the time, timers, a stopwatch with laps, the world",
  icon: "◷",
  launcher: true,
  create: (deck) => new ClocksApp(deck),
};
