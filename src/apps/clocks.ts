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
import { Bar, cards, GAP, INSET, Row, SECTION, stack } from "../ui/layout";
import { Braille, ring } from "../ui/braille";
import { strWidth } from "../core/unicode";
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
    ui.animate(clockState.swStart || clockState.timers.length ? 50 : Math.min(250, 1000 - (Date.now() % 1000)));
    const body = { x: r.x + INSET * 2, y: r.y + 1, w: Math.max(0, r.w - INSET * 4), h: Math.max(0, r.h - 2) };
    const cities = this.deck.settings.data.home.worldClocks.length;
    const worldH = Math.max(3, cities + 2);
    // three cards side by side when there's room; two (timers · stopwatch) over the world
    // when it's medium; one a row when it's narrow. The clock on top gets what's left (up to 9 rows).
    const across = body.w >= 36 * 3 + GAP * 2 ? 3 : body.w >= 26 * 2 + GAP ? 2 : 1;
    const cardsMin = across === 3 ? 7 : across === 2 ? 7 + SECTION + worldH : 5 * 2 + SECTION * 2 + worldH;
    const [clockR, dayR, cardsR] = stack(body, [
      { min: 3, fill: 1, max: 9, priority: 9 },
      { h: 1, priority: 4 },
      { min: Math.min(cardsMin, 7), h: cardsMin, fill: 3, priority: 8 },
    ]);
    if (clockR) drawClock(ui, clockR, this.deck);
    if (dayR) this.drawDay(ui, dayR);
    if (!cardsR) return;
    let tr: Rect | null, sr: Rect | null, wr: Rect | null;
    if (across === 3) [tr, sr, wr] = cards(cardsR, 3, { minW: 36, h: cardsR.h }).rects;
    else {
      const top = across === 2 ? [{ min: 5, fill: 1, priority: 9 }] : [{ min: 5, fill: 1, priority: 9 }, { min: 5, fill: 1, priority: 7 }];
      const parts = stack(cardsR, [...top, { min: 3, h: worldH, priority: 6 }]);
      if (across === 2) {
        [tr, sr] = parts[0] ? cards(parts[0], 2, { minW: 26, h: parts[0].h }).rects : [null, null];
        wr = parts[1];
      } else [tr, sr, wr] = parts;
    }
    if (tr) this.drawTimers(ui, tr);
    if (sr) this.drawStopwatch(ui, sr);
    if (wr) this.drawWorld(ui, wr);
  }

  /** A card's frame and title, its button on its top line. Returns the inside. */
  private card(ui: UI, r: Rect, title: string, btn: string, run: () => void, tip: string): Rect {
    const inner = ui.box(r, { title, focused: false });
    if (r.w > strWidth(title) + 10) ui.button(r.x + r.w - strWidth(btn) - 4, r.y, btn, run, { tip });
    return inner;
  }

  /** The day: a bar from midnight to midnight, night shaded, the sun or the moon where now is. */
  private drawDay(ui: UI, r: Rect): void {
    const c = ui.c;
    const now = new Date();
    const p = (now.getHours() * 60 + now.getMinutes()) / 1440;
    const w = r.w;
    const step = w / 8; // a tick every 3 hours
    const mx = Math.min(w - 1, Math.floor(p * w));
    for (let x = 0; x < w; x++) {
      if (x === mx) continue; // the sun or the moon goes there
      const h = (x / w) * 24;
      const day = h >= 7 && h < 19;
      const tick = Math.floor(x / step) !== Math.floor((x - 1) / step);
      const past = x / w < p;
      ui.text(r.x + x, r.y, tick ? "┊" : past ? "━" : "─", { fg: mix(day ? c.warning : 0x7fb4ea, c.bg, past ? 0.45 : 0.75) });
    }
    const isDay = now.getHours() >= 7 && now.getHours() < 19;
    ui.text(r.x + mx, r.y, isDay ? "☀" : "☾", { fg: isDay ? c.warning : 0xf2eedd, attrs: BOLD });
  }

  /** Timers: a ring each that empties as it runs, the next one big; the last 10 s blink. */
  private drawTimers(ui: UI, r: Rect): void {
    const c = ui.c;
    const inner = this.card(ui, r, t("TIMERS"), "+", () => void this.newTimer(), "t · timer 4m tea");
    const timers = [...clockState.timers].sort((a, b) => a.end - b.end);
    if (!timers.length) return void ui.text(inner.x + INSET, inner.y + 1, t("none — t starts one"), { fg: c.muted }, inner.w - INSET * 2);
    const aspect = 2 * ui.cellAspect || 1;
    // the next one: a big ring with its time inside
    const first = timers[0];
    const ringRows = Math.max(3, Math.min(inner.h - (timers.length > 1 ? 2 : 0), 7));
    const ringCols = Math.min(inner.w, Math.ceil((ringRows * 4) / aspect / 2) + 1);
    const leftMs = first.end - Date.now();
    const urgent = leftMs < 10_000 && Math.floor(Date.now() / 300) % 2 === 0;
    const b = new Braille(ringCols, ringRows);
    const R = Math.min(ringRows * 2, ringCols * aspect) - 1;
    ring(b, ringCols, ringRows * 2, R, Math.max(0, leftMs / first.total), aspect, 2);
    b.draw(ui, inner.x + INSET, inner.y, [c.faint, urgent ? c.error : c.accent]);
    const tx = inner.x + INSET + ringCols + GAP;
    ui.text(tx, inner.y + Math.floor(ringRows / 2) - 1, first.label, { fg: c.fg, attrs: BOLD }, inner.x + inner.w - tx - INSET);
    ui.text(tx, inner.y + Math.floor(ringRows / 2), dur(leftMs), { fg: urgent ? c.error : c.accent, attrs: BOLD }, inner.x + inner.w - tx - INSET);
    ui.hit({ x: inner.x, y: inner.y, w: inner.w, h: ringRows }, { cmd: `timer stop ${first.id}`, tip: t("click: stop it") });
    // the others: a line each, with a bar
    timers.slice(1).forEach((tm, i) => {
      const y = inner.y + ringRows + i;
      if (y >= inner.y + inner.h) return;
      const left = tm.end - Date.now();
      const bar = new Bar(ui, inner.x + INSET, y, inner.x + inner.w - INSET);
      bar.text(tm.label, { fg: c.muted }, { priority: 6, fit: 4 });
      bar.item(10, (x, w) => {
        // a thin line: what's left lit, what's gone faint
        const lit = Math.round(Math.max(0, left / tm.total) * w);
        ui.text(x, y, "━".repeat(lit), { fg: c.subtle });
        ui.text(x + lit, y, "─".repeat(w - lit), { fg: c.faint });
      }, { priority: 3 });
      bar.text(dur(left), { fg: c.subtle }, { side: "right", priority: 9 });
      bar.draw();
      ui.hit({ x: inner.x, y, w: inner.w, h: 1 }, { cmd: `timer stop ${tm.id}`, tip: t("click: stop it") });
    });
  }

  /** The stopwatch: its time in big dots, a dial whose hand sweeps the seconds, the laps (best and worst lit). */
  private drawStopwatch(ui: UI, r: Rect): void {
    const c = ui.c;
    const running = !!clockState.swStart;
    const inner = this.card(ui, r, t("STOPWATCH"), running ? "❚❚" : "▶", () => void this.deck.act("stopwatch toggle"), "space · l lap · r reset");
    const ms = swNow();
    const aspect = 2 * ui.cellAspect || 1;
    // the dial: a ring of 60 ticks, the hand where the second is
    const rows = Math.max(3, Math.min(5, inner.h - 1 - Math.min(2, clockState.laps.length)));
    const cols = Math.ceil((rows * 4) / aspect / 2) + 1;
    const b = new Braille(cols, rows);
    const R = Math.min(rows * 2, cols * aspect) - 1;
    ring(b, cols, rows * 2, R, ((ms / 1000) % 60) / 60, aspect);
    const a = ((ms / 1000) % 60 / 60) * Math.PI * 2;
    b.line(cols, rows * 2, cols + (Math.sin(a) * (R - 1)) / aspect, rows * 2 - Math.cos(a) * (R - 1), 1);
    b.draw(ui, inner.x + INSET, inner.y, [c.faint, running ? c.accent : c.subtle]);
    const tx = inner.x + INSET + cols + GAP;
    const sw = dur(ms);
    const k = fitMatrix(sw, inner.x + inner.w - tx - INSET, rows, 2);
    if (k) matrixText(ui, tx, inner.y + Math.max(0, Math.floor((rows - matrixSize(sw, k).h) / 2)), sw, k, () => (running ? c.accent : c.subtle));
    else ui.text(tx, inner.y + Math.floor(rows / 2), sw, { fg: running ? c.accent : c.subtle, attrs: BOLD }, inner.x + inner.w - tx - INSET);
    // start · lap · reset: what doesn't fit isn't drawn (space, l, r still work)
    let y = inner.y + rows;
    if (y < inner.y + inner.h) {
      const row = new Row(ui, inner.x + INSET, y, inner.x + inner.w - INSET);
      row.button(running ? t("❚❚ stop") : t("▶ start"), () => {}, { cmd: "stopwatch toggle", tip: "space" });
      row.button(t("lap"), () => {}, { cmd: "stopwatch lap", tip: "l" });
      row.button(t("↺ reset"), () => {}, { cmd: "stopwatch reset", tip: "r" });
      y++;
    }
    // the laps: newest first; the fastest in green, the slowest in red
    const laps = clockState.laps;
    const splits = laps.map((lap, i) => lap - (laps[i - 1] ?? 0));
    const best = splits.length > 1 ? Math.min(...splits) : -1, worst = splits.length > 1 ? Math.max(...splits) : -1;
    for (let i = laps.length - 1; i >= 0 && y < inner.y + inner.h; i--, y++) {
      const sp = splits[i];
      const col = sp === best ? c.success : sp === worst ? c.error : c.subtle;
      new Bar(ui, inner.x + INSET, y, inner.x + inner.w - INSET)
        .text(`${t("lap")} ${i + 1}`, { fg: c.muted }, { priority: 5 })
        .text(`+${dur(sp)}`, { fg: col, attrs: sp === best ? BOLD : 0 }, { side: "right", priority: 9 })
        .text(dur(laps[i]), { fg: c.faint }, { side: "right", priority: 3 })
        .draw();
    }
  }

  /** The world: a city a line — its day as a strip (night shaded, now marked), its time, how far from here. */
  private drawWorld(ui: UI, r: Rect): void {
    const c = ui.c;
    const inner = this.card(ui, r, t("WORLD"), "+", () => void this.addCity(), "w · worldclock add Asia/Tokyo");
    const now = new Date();
    const hereOff = -now.getTimezoneOffset();
    this.deck.settings.data.home.worldClocks.forEach((tz, i) => {
      const y = inner.y + i;
      if (y >= inner.y + inner.h) return;
      let time = "--:--", hour = 12, min = 0, off = 0;
      try {
        time = now.toLocaleTimeString(undefined, { timeZone: tz, hour: "2-digit", minute: "2-digit" });
        const parts = now.toLocaleString("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false }).split(":").map(Number);
        hour = parts[0] % 24;
        min = parts[1] ?? 0;
        off = Math.round(((hour * 60 + min - (now.getHours() * 60 + now.getMinutes()) + 1440 * 1.5) % 1440) - 720);
      } catch {
        /* unknown zone */
      }
      void hereOff;
      const day = hour >= 7 && hour < 19;
      const name = tz.split("/").pop()!.replace(/_/g, " ");
      const rel = off === 0 ? "" : `${off > 0 ? "+" : "−"}${Math.abs(off / 60) % 1 ? (Math.abs(off) / 60).toFixed(1) : Math.abs(off / 60)}h`;
      const bar = new Bar(ui, inner.x + INSET, y, inner.x + inner.w - INSET);
      bar.text(day ? "☀" : "☾", { fg: day ? c.warning : 0xf2eedd }, { priority: 9 });
      bar.text(name, { fg: c.fg }, { priority: 8, fit: 5 });
      // its day: 12 cells from midnight to midnight, the night shaded, now lit
      bar.item(12, (x, w) => {
        const pos = Math.min(w - 1, Math.floor(((hour * 60 + min) / 1440) * w));
        for (let k = 0; k < w; k++) {
          const h = (k / w) * 24;
          const lit = h >= 7 && h < 19;
          ui.text(x + k, y, k === pos ? "▮" : lit ? "▬" : "▭", { fg: k === pos ? c.accent : lit ? mix(c.warning, c.bg, 0.55) : mix(0x7fb4ea, c.bg, 0.6) });
        }
      }, { priority: 2 });
      bar.text(rel, { fg: c.faint }, { side: "right", priority: 3 });
      bar.text(time, { fg: c.accent, attrs: BOLD }, { side: "right", priority: 10 });
      bar.draw();
      ui.hit({ x: inner.x, y, w: inner.w, h: 1 }, { tip: `${tz}\nworldclock rm ${tz}` });
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
