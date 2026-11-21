/**
 * MOON — the module's own page: the moon as it is (drawn, lit from the right side, its
 * seas and its earthshine) among a few stars, its phase in words, the next four phases,
 * and the month as a calendar of moons. Everything is computed here: no network.
 *
 *   ←→  a day before / after     ↑↓  a week     t  today     (a click on a day: that day)
 */
import { mix } from "../core/color";
import { BOLD, type Rect } from "../core/grid";
import { t } from "../core/i18n";
import type { Action, KeyInput } from "../core/input";
import { strWidth } from "../core/unicode";
import type { Deck } from "../deck";
import { Bar, GAP, INSET, SECTION } from "../ui/layout";
import type { UI } from "../ui/ui";
import { drawMoon, moonBox, moonTone } from "../widgets/moondraw";
import { daysUntil, moonAge, moonLit, phaseGlyph, phaseName, SYNODIC, upcoming, waxing } from "../widgets/moonphase";
import type { App, AppSpec } from "./types";

const DAY = 86_400_000;

class MoonApp implements App {
  readonly kind = "moon";
  readonly key = "moon";
  /** the day shown, as days from today (0: now) */
  private offset = 0;
  constructor(private readonly deck: Deck) {}

  title(): string {
    return "moon";
  }
  status(): string {
    return t("←→ a day · ↑↓ a week · t today · click a day in the calendar");
  }

  /** the moment shown: now, or that many days away (at the same hour) */
  private get when(): number {
    return Date.now() + this.offset * DAY;
  }
  private go(days: number | "today"): boolean {
    this.offset = days === "today" ? 0 : this.offset + days;
    this.deck.requestFrame();
    return true;
  }

  onKey(k: KeyInput): boolean {
    if (k.combo === "left") return this.go(-1);
    if (k.combo === "right") return this.go(1);
    if (k.combo === "up" || k.combo === "shift+left") return this.go(-7);
    if (k.combo === "down" || k.combo === "shift+right") return this.go(7);
    return false;
  }
  onText(s: string): boolean {
    if (s === "t") return this.go("today");
    return false;
  }
  onAction(a: Action): boolean {
    if (a === "home") return this.go("today");
    if (a === "page-up") return this.go(-SYNODIC | 0);
    if (a === "page-down") return this.go(SYNODIC | 0);
    return false;
  }

  render(ui: UI, r: Rect, _focused: boolean): void {
    const c = ui.c;
    const when = this.when;
    const locale = this.deck.settings.data.user.locale || undefined;
    const body = { x: r.x + INSET, y: r.y, w: r.w - INSET * 2, h: r.h };

    // the day shown, and the way back to today
    const bar = new Bar(ui, body.x, body.y, body.x + body.w);
    const day = new Date(when).toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long" });
    bar.text(this.offset ? t("on {day}", { day }) : `${t("tonight")} · ${day}`, { fg: this.offset ? c.warning : c.muted }, { priority: 8, fit: 6 });
    bar.button("◂", () => this.go(-1), { tip: t("the day before · ←") }, { side: "right", priority: 7 });
    bar.button(t("today"), () => this.go("today"), { selected: !this.offset, tip: "t" }, { side: "right", priority: 6 });
    bar.button("▸", () => this.go(1), { tip: t("the day after · →") }, { side: "right", priority: 7 });
    bar.draw();
    const main = { x: body.x, y: body.y + 1 + SECTION, w: body.w, h: body.h - 1 - SECTION };

    // wide: the moon on the left, the words and the calendar on the right; narrow: stacked
    const wide = main.w >= 70 && main.h >= 12;
    const moonW = wide ? Math.min(Math.floor(main.w * 0.48), Math.ceil(main.h / ui.cellAspect)) : main.w;
    const moonH = wide ? main.h : Math.max(3, Math.min(Math.floor(main.h * 0.5), Math.floor(main.w * ui.cellAspect)));
    const sky = { x: main.x, y: main.y, w: moonW, h: moonH };
    this.drawSky(ui, sky, when);
    const info = wide ? { x: main.x + moonW + GAP, y: main.y, w: main.w - moonW - GAP, h: main.h } : { x: main.x, y: main.y + moonH + SECTION, w: main.w, h: main.h - moonH - SECTION };
    if (info.h < 2 || info.w < 12) return;
    let y = this.drawWords(ui, info, when);
    y += SECTION;
    if (info.y + info.h - y >= 4) this.drawCalendar(ui, { x: info.x, y, w: info.w, h: info.y + info.h - y }, when);
  }

  /** the moon among a few stars (the stars twinkle slowly) */
  private drawSky(ui: UI, r: Rect, when: number): void {
    const c = ui.c;
    const calm = this.deck.settings.data.appearance.reduceMotion;
    if (!calm) ui.animate(600);
    const disc = { x: r.x + INSET, y: r.y, w: r.w - INSET * 2, h: r.h };
    const behind = moonBox(ui, disc);
    for (let i = 0; i < Math.floor((r.w * r.h) / 40); i++) {
      const sx = r.x + Math.floor(hash(i * 2.1) * r.w), sy = r.y + Math.floor(hash(i * 7.3 + 1) * r.h);
      // none behind the moon
      if (sx >= behind.x && sx < behind.x + behind.w && sy >= behind.y && sy < behind.y + behind.h) continue;
      const tw = calm ? 0.5 : (Math.sin(ui.now / 900 + i * 1.7) + 1) / 2;
      ui.text(sx, sy, hash(i * 3.7) > 0.85 ? "✦" : "·", { fg: mix(c.bg, c.fg, 0.15 + 0.35 * tw) });
    }
    ui.hit(r, { onWheel: (d) => this.go(Math.sign(d)), tip: t("the wheel: a day before / after") });
    drawMoon(ui, disc, when, { earthshine: 0.08 });
  }

  /** the phase in words, how much is lit, the next four phases; returns the row after */
  private drawWords(ui: UI, r: Rect, when: number): number {
    const c = ui.c;
    const locale = this.deck.settings.data.user.locale || undefined;
    let y = r.y;
    ui.text(r.x, y++, t(phaseName(when)).toUpperCase(), { fg: moonTone(ui), attrs: BOLD }, r.w);
    const lit = Math.round(moonLit(when) * 100);
    const age = moonAge(when);
    new Bar(ui, r.x, y++, r.x + r.w)
      .text(t("{n} % lit", { n: lit }), { fg: c.fg }, { priority: 9 })
      .text(t("day {d} of {all}", { d: age.toFixed(1), all: SYNODIC.toFixed(1) }), { fg: c.muted }, { priority: 6 })
      .text(waxing(when) ? t("growing ↗") : t("shrinking ↘"), { fg: c.subtle, raw: true }, { priority: 4 })
      .draw();
    // how far through the cycle: a bar, new → full → new
    if (r.h >= 6) {
      const w = Math.min(r.w, 40);
      ui.bar(r.x, y++, w, age / SYNODIC, mix(c.subtle, moonTone(ui), 0.5), c.faint);
    }
    y += SECTION;
    const from = new Date(when);
    for (const p of upcoming(when)) {
      if (y >= r.y + r.h) break;
      const n = daysUntil(p.at, from);
      const inDays = n === 0 ? t("today") : n === 1 ? t("tomorrow") : t("in {n} days", { n });
      new Bar(ui, r.x, y++, r.x + r.w)
        .text(`${p.glyph} ${t(p.name)}`, { fg: p.name === "full moon" ? moonTone(ui) : c.fg }, { priority: 9, fit: 8 })
        .text(inDays, { fg: n <= 2 ? c.accent : c.muted }, { side: "right", priority: 8 })
        .text(p.at.toLocaleDateString(locale, { weekday: "short", day: "numeric", month: "short" }), { fg: c.subtle }, { side: "right", priority: 5 })
        .draw();
    }
    return y;
  }

  /** the month of the day shown, a moon for each day (small moons when there's room, else glyphs) */
  private drawCalendar(ui: UI, r: Rect, when: number): void {
    const c = ui.c;
    const locale = this.deck.settings.data.user.locale || undefined;
    const shown = new Date(when);
    const today = new Date();
    const first = new Date(shown.getFullYear(), shown.getMonth(), 1);
    const days = new Date(shown.getFullYear(), shown.getMonth() + 1, 0).getDate();
    const lead = (first.getDay() + 6) % 7; // monday first
    const weeks = Math.ceil((lead + days) / 7);
    // seven columns, a cell between two (the last one needs none)
    const cellW = Math.max(4, Math.min(8, Math.floor((r.w + INSET) / 7)));
    // a small drawn moon above each number when there's room for it (2 rows), else a glyph
    const big = cellW >= 6 && r.h >= 2 + weeks * 3;
    const rowH = big ? 3 : 1;
    if (r.h < 2 + weeks * rowH) return;
    ui.text(r.x, r.y, shown.toLocaleDateString(locale, { month: "long", year: "numeric" }).toUpperCase(), { fg: c.title, attrs: BOLD }, r.w);
    for (let d = 0; d < 7; d++) {
      const name = new Date(2024, 0, 1 + d).toLocaleDateString(locale, { weekday: "short" }).slice(0, cellW - 1);
      ui.text(r.x + d * cellW, r.y + 1, name, { fg: c.faint });
    }
    for (let n = 1; n <= days; n++) {
      const k = lead + n - 1;
      const x = r.x + (k % 7) * cellW, y = r.y + 2 + Math.floor(k / 7) * rowH;
      const at = new Date(shown.getFullYear(), shown.getMonth(), n, 21).getTime(); // the evening's moon
      const isShown = n === shown.getDate();
      const isToday = n === today.getDate() && shown.getMonth() === today.getMonth() && shown.getFullYear() === today.getFullYear();
      const cell = { x, y, w: cellW - 1, h: rowH };
      if (isShown) ui.fill(cell, { bg: c.highlight });
      const bg = isShown ? c.highlight : undefined;
      if (big) drawMoon(ui, { x, y, w: cellW - 1, h: 2 }, at, { earthshine: 0.05 });
      const label = big ? String(n) : `${String(n).padStart(2)}${phaseGlyph(at)}`;
      ui.text(x + Math.max(0, Math.floor((cellW - 1 - strWidth(label)) / 2)), y + rowH - 1, label, { fg: isToday ? c.accent : isShown ? c.fg : c.muted, bg, attrs: isToday || isShown ? BOLD : 0 });
      ui.hit(cell, { onClick: () => this.go(daysUntil(new Date(at), today) - this.offset), tip: new Date(at).toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long" }) + ` · ${t(phaseName(at))}` });
    }
  }
}

/** a stable pseudo-random 0…1 (where the stars are) */
function hash(n: number): number {
  const s = Math.sin(n * 91.7 + 13.1) * 43758.5453;
  return s - Math.floor(s);
}

export const moonSpec: AppSpec = {
  kind: "moon",
  title: "Moon",
  description: "tonight's moon, the next phases, the month in moons (computed here, no network)",
  icon: "◑",
  launcher: true,
  create: (deck) => new MoonApp(deck),
};
