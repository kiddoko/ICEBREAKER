/**
 * WEATHER — the module's own app: any place on Earth (s to search, ←→ through
 * your saved places), the sky as an ASCII animation (rain, snow, sun rays,
 * clouds, storm flashes, fog banks, a moon at night), the next 24 hours as a
 * curve with the rain chances under it, and the week.
 *
 *   weather                 now and the week, in the shell
 *   weather <place>         the same for a place
 *   weather open [place]    the app
 *   weather save <place> · weather forget <place> · weather places
 *
 * Data: open-meteo.com (no account, no key). Nothing when stealth mode is on.
 */
import { fmt } from "../core/ansi";
import { mix } from "../core/color";
import { BOLD, type Rect } from "../core/grid";
import { t } from "../core/i18n";
import type { Action, KeyInput } from "../core/input";
import { geocode, langOf, resolvePlace, type Place } from "../core/location";
import type { Deck } from "../deck";
import type { Command } from "../shell/types";
import { fitMatrix, matrixSize, matrixText } from "../ui/dots";
import type { UI } from "../ui/ui";
import { sky } from "../widgets/builtin";
import type { App, AppSpec } from "./types";
import { atLeast, Bar, cards, GAP, INSET, stack } from "../ui/layout";
import { drawSky, sceneFor, skyIcon } from "./weathersky";
import { places } from "../core/suggest";

type Sky = ReturnType<typeof sky>;

interface Forecast {
  place: Place;
  temp: number;
  feels: number;
  humidity: number;
  code: number;
  wind: number;
  windDir: number;
  isDay: boolean;
  hours: { t: string; temp: number; rain: number; code: number }[];
  days: { date: string; max: number; min: number; code: number; rain: number; sunrise: string; sunset: string }[];
  at: number;
}

const cache = new Map<string, Forecast>();

async function forecastFor(place: Place): Promise<Forecast> {
  const key = `${place.lat.toFixed(2)},${place.lon.toFixed(2)}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 15 * 60_000) return hit;
  const q =
    `latitude=${place.lat}&longitude=${place.lon}&timezone=auto&forecast_days=7&forecast_hours=24` +
    `&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,wind_direction_10m,is_day` +
    `&hourly=temperature_2m,precipitation_probability,weather_code` +
    `&daily=temperature_2m_max,temperature_2m_min,weather_code,precipitation_probability_max,sunrise,sunset`;
  const f = await (await fetch(`https://api.open-meteo.com/v1/forecast?${q}`)).json();
  const hhmm = (iso: string) => iso?.slice(11, 16) ?? "--:--";
  const out: Forecast = {
    place,
    temp: f.current.temperature_2m,
    feels: f.current.apparent_temperature,
    humidity: f.current.relative_humidity_2m,
    code: f.current.weather_code,
    wind: f.current.wind_speed_10m,
    windDir: f.current.wind_direction_10m,
    isDay: !!f.current.is_day,
    hours: (f.hourly.time as string[]).map((tm, i) => ({ t: hhmm(tm), temp: f.hourly.temperature_2m[i], rain: f.hourly.precipitation_probability?.[i] ?? 0, code: f.hourly.weather_code?.[i] ?? 0 })),
    days: (f.daily.time as string[]).map((date, i) => ({
      date,
      max: f.daily.temperature_2m_max[i],
      min: f.daily.temperature_2m_min[i],
      code: f.daily.weather_code[i],
      rain: f.daily.precipitation_probability_max?.[i] ?? 0,
      sunrise: hhmm(f.daily.sunrise[i]),
      sunset: hhmm(f.daily.sunset[i]),
    })),
    at: Date.now(),
  };
  cache.set(key, out);
  return out;
}

const LABEL: Record<Sky, string> = { sun: "clear", partly: "partly cloudy", cloud: "overcast", fog: "fog", rain: "rain", snow: "snow", storm: "thunderstorm" };
const GLYPH: Record<Sky, string> = { sun: "☼", partly: "◐", cloud: "☁", fog: "≋", rain: "☂", snow: "❄", storm: "ϟ" };
const ARROWS = ["↓", "↙", "←", "↖", "↑", "↗", "→", "↘"]; // where the wind blows to (from N = ↓)
const arrow = (deg: number) => ARROWS[Math.round(deg / 45) % 8];
const placeName = (p: Place) => [p.name, p.admin && p.admin !== p.name ? p.admin : "", p.countryCode].filter(Boolean).join(", ");

let lastPlace: Place | null = null;

class WeatherApp implements App {
  readonly kind = "weather";
  readonly key = "weather";
  private f: Forecast | null = null;
  private error = "";
  private loading = false;
  private wantFor: string | null;
  private placeIndex = -1;

  constructor(private readonly deck: Deck, args?: unknown) {
    this.wantFor = typeof args === "string" ? args : null;
    void this.load();
  }
  title() {
    return "weather";
  }
  status() {
    // the data's licence (CC BY 4.0) asks for this line
    return `${t("s search a place · ←→ your places · p save this place · r refresh")} · ${t("weather data by Open-Meteo.com")}`;
  }
  private places(): Place[] {
    return (this.deck.settings.data.home.weatherPlaces ?? []) as Place[];
  }
  async load(place?: Place): Promise<void> {
    if (this.deck.settings.data.privacy.stealth) return void (this.error = t("stealth mode is on: no weather"));
    this.loading = true;
    this.error = "";
    try {
      let p = place ?? lastPlace;
      if (!p && this.wantFor) p = (await geocode(this.wantFor, langOf(this.deck)))[0] ?? null;
      p ??= await resolvePlace(this.deck);
      if (!p) throw new Error(t("no place yet — s searches one"));
      lastPlace = p;
      this.f = await forecastFor(p);
      // your own city is a favourite from the start (★, first of the ←→ places)
      if (!place && !this.wantFor && !this.places().length) this.deck.history.quiet(() => this.deck.settings.set("home.weatherPlaces", [p])); // automatic: not a ⌘Z step
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
    } finally {
      this.loading = false;
      this.deck.requestFrame();
    }
  }
  async search(): Promise<void> {
    const q = await this.deck.prompt(t("Weather where?"), { placeholder: "Lausanne, Tokyo, Reykjavik…", suggestions: places(this.deck) });
    if (!q?.trim()) return;
    const found = await geocode(q.trim(), langOf(this.deck)).catch(() => []);
    if (!found.length) return this.deck.notify(t("no place called {q}", { q: q.trim() }), "warning");
    const i = found.length === 1 ? 0 : await this.deck.choose(t("Which one?"), found.map((p) => ({ label: placeName(p), hint: `${p.lat.toFixed(1)}, ${p.lon.toFixed(1)}` })));
    if (i !== null) void this.load(found[i]);
  }
  onText(s: string): boolean {
    if (s === "s" || s === "/") return void this.search(), true;
    if (s === "r") return cache.clear(), void this.load(this.f?.place), true;
    if (s === "p" && this.f) return void this.deck.act(`weather save ${this.f.place.name}`), true;
    return false;
  }
  onKey(_k: KeyInput): boolean {
    return false;
  }
  onAction(a: Action): boolean {
    const list = this.places();
    if ((a === "left" || a === "right") && list.length) {
      this.placeIndex = (this.placeIndex + (a === "right" ? 1 : -1) + list.length) % list.length;
      void this.load(list[this.placeIndex]);
      return true;
    }
    return false;
  }

  render(ui: UI, r: Rect, _focused: boolean): void {
    const c = ui.c;
    if (!this.f) {
      ui.textCenter(r, r.y + Math.floor(r.h / 2), this.loading ? `${ui.spinner()} ${t("reading the sky…")}` : this.error || t("no data"), { fg: this.error ? c.error : c.muted });
      if (this.loading) ui.animate(100);
      ui.button(r.x + 2, r.y + 1, t("⌕ search a place"), () => void this.search(), { tip: "s" });
      return;
    }
    const f = this.f;
    const sk = sky(f.code);
    const sec = ui.now / 1000;
    ui.animate(sk === "storm" ? 60 : 110);
    // header: the place, your places, search
    // (a Bar: when the page is narrow, your places go first, then save, then search; the
    // place's name shrinks with … — s, p and ←→ still work)
    const head = new Bar(ui, r.x + INSET * 2, r.y + 1, r.x + r.w - INSET * 2);
    head.text(placeName(f.place), { fg: c.title, attrs: BOLD }, { priority: 9, fit: 10 });
    head.button(t("⌕ search"), () => void this.search(), { tip: "s · weather <place>" }, { priority: 6 });
    const saved = this.places().some((p) => p.name === f.place.name && Math.abs(p.lat - f.place.lat) < 0.01);
    head.button(saved ? t("★ saved") : t("☆ save"), () => void this.deck.act(`weather ${saved ? "forget" : "save"} ${f.place.name}`), { tip: "p" }, { priority: 5 });
    for (const [i, p] of this.places().entries()) {
      const on = p.name === f.place.name;
      head.button(p.name, () => ((this.placeIndex = i), void this.load(p)), { selected: on, tip: "←→" }, { priority: on ? 4 : 3 });
    }
    if (this.loading) head.text(ui.spinner(), { fg: c.accent }, { side: "right", priority: 8 });
    head.draw();

    // what's below the header shares the page (ui/layout.ts stack): the sky and the numbers,
    // the next 24 h, the week as cards — the least needed go first when the page is short
    const body = { x: r.x + INSET * 2, y: r.y + 3, w: Math.max(0, r.w - INSET * 4), h: Math.max(0, r.h - 4) };
    const wide = atLeast(body, "m");
    const [skyRow, hoursR, weekR] = stack(body, [
      { min: 6, fill: 1, max: 16, priority: 9 },
      { h: wide ? 6 : 5, priority: 4 },
      { h: 4, priority: 6 },
    ]);
    if (skyRow) this.drawNow(ui, skyRow, f, sk, sec);
    if (hoursR) this.drawHours(ui, hoursR, f);
    if (weekR) this.drawWeek(ui, weekR, f);
  }

  /** The sky (left) and the numbers (right) — the numbers over the sky when it's narrow. */
  private drawNow(ui: UI, r: Rect, f: Forecast, sk: Sky, sec: number): void {
    const c = ui.c;
    const scene = sceneFor(f.code, { isDay: f.isDay, wind: f.wind, windDir: f.windDir, rain: f.hours[0]?.rain });
    const side = r.w >= 56;
    const skyR = side ? { x: r.x, y: r.y, w: Math.max(24, Math.floor(r.w * 0.55)), h: r.h } : r;
    // the animated sky overlaps itself on purpose (ui.art: debug layout doesn't count it)
    ui.clip(skyR, () => ui.art(() => drawSky(ui, skyR, scene, sec)));
    const nr = side ? { x: skyR.x + skyR.w + GAP, y: r.y, w: r.x + r.w - (skyR.x + skyR.w + GAP), h: r.h } : { x: r.x + Math.floor(r.w / 2), y: r.y, w: r.w - Math.floor(r.w / 2), h: Math.min(r.h, 5) };
    let y = nr.y;
    const line = (txt: string, style: { fg: number; attrs?: number; bg?: number }) => void (y < nr.y + nr.h && ui.text(nr.x, y++, txt, style, nr.w));
    const temp = `${Math.round(f.temp)}°`;
    // big dot-matrix digits when there's room for them and the lines under them
    const k = side ? fitMatrix(temp, nr.w, nr.h - 6, 3) : 0;
    if (k) {
      matrixText(ui, nr.x, y, temp, k, () => c.accent);
      y += matrixSize(temp, k).h + 1;
    } else line(temp, { fg: c.accent, attrs: BOLD });
    line(`${GLYPH[sk]}  ${t(LABEL[sk])}`, { fg: c.fg, attrs: BOLD });
    if (!side) return;
    line(`${t("feels")} ${Math.round(f.feels)}°`, { fg: c.subtle });
    // humidity as a bar, the wind with its arrow and its word
    if (y < nr.y + nr.h) {
      const label = `${t("humidity")} ${f.humidity}% `;
      const lw = Math.min(nr.w, label.length);
      ui.text(nr.x, y, label, { fg: c.subtle }, nr.w);
      if (nr.w - lw > 4) ui.bar(nr.x + lw, y, Math.min(16, nr.w - lw), f.humidity / 100, mix(0x7fb4ea, c.bg, 0.2), c.faint);
      y++;
    }
    line(`${t("wind")} ${Math.round(f.wind)} km/h ${arrow(f.windDir)} · ${t(beaufort(f.wind))}`, { fg: c.subtle });
    // the day: sunrise, sunset, and where the sun is between them
    const d0 = f.days[0];
    if (d0 && y < nr.y + nr.h) {
      const mins = (hm: string) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5));
      const now = new Date();
      const p = Math.max(0, Math.min(1, (now.getHours() * 60 + now.getMinutes() - mins(d0.sunrise)) / Math.max(1, mins(d0.sunset) - mins(d0.sunrise))));
      const a = `☀ ${d0.sunrise} `, b = ` ${d0.sunset} ☾`;
      const bw = nr.w - a.length - b.length;
      if (bw >= 6) {
        ui.text(nr.x, y, a, { fg: c.subtle });
        ui.bar(nr.x + a.length, y, bw, p, mix(c.warning, c.bg, 0.25), c.faint);
        ui.text(nr.x + a.length + bw, y, b, { fg: c.subtle });
      } else ui.text(nr.x, y, `${a}${b}`, { fg: c.subtle }, nr.w);
      y++;
    }
  }

  /** The next 24 hours: the temperature as a curve, the rain chances under it, the hours. */
  private drawHours(ui: UI, r: Rect, f: Forecast): void {
    const c = ui.c;
    if (r.w < 20 || r.h < 4) return;
    const temps = f.hours.map((h) => h.temp);
    const lo = Math.min(...temps), hi = Math.max(...temps), span = hi - lo || 1;
    new Bar(ui, r.x, r.y, r.x + r.w)
      .text(t("next 24 h"), { fg: c.muted, attrs: BOLD }, { priority: 9 })
      .text(`${Math.round(lo)}° … ${Math.round(hi)}°`, { fg: c.subtle }, { side: "right", priority: 5 })
      .draw();
    const chH = Math.max(1, r.h - 3);
    const cw = r.w;
    ui.chart({ x: r.x, y: r.y + 1, w: cw, h: chH }, Array.from({ length: cw * 2 }, (_, i) => ((temps[Math.min(temps.length - 1, Math.floor((i / (cw * 2)) * temps.length))] - lo) / span) * 0.9 + 0.05), c.accent);
    const ry = r.y + 1 + chH;
    const bars = "▁▂▃▄▅▆▇█";
    for (let i = 0; i < cw; i++) {
      const h = f.hours[Math.min(f.hours.length - 1, Math.floor((i / cw) * f.hours.length))];
      if (h.rain > 5) ui.text(r.x + i, ry, bars[Math.min(7, Math.floor((h.rain / 100) * 8))], { fg: mix(0x7fb4ea, c.bg, 0.2) });
    }
    const step = cw >= 72 ? 3 : 6;
    for (let i = 0; i < f.hours.length; i += step) {
      const hx = r.x + Math.floor((i / f.hours.length) * cw);
      if (hx + 2 <= r.x + r.w) ui.text(hx, ry + 1, f.hours[i].t.slice(0, 2), { fg: c.faint });
    }
  }

  /** The week: a card a day (as many as fit), today lit. */
  private drawWeek(ui: UI, r: Rect, f: Forecast): void {
    const c = ui.c;
    const { rects, shown } = cards(r, f.days.length, { minW: 11, maxW: 18, h: 4, gap: GAP, gapY: 0 });
    const locale = this.deck.settings.data.user.locale || undefined;
    f.days.slice(0, shown).forEach((d, i) => {
      const cr = rects[i];
      const today = i === 0;
      if (today) ui.fill(cr, { bg: mix(c.accent, c.bg, 0.88) });
      const bg = today ? mix(c.accent, c.bg, 0.88) : undefined;
      const name = today ? t("today") : new Date(`${d.date}T12:00`).toLocaleDateString(locale, { weekday: "short" });
      const k = sky(d.code);
      const [i1, i2] = skyIcon(k);
      const tint = k === "sun" || k === "partly" ? c.warning : k === "rain" || k === "storm" ? mix(0x7fb4ea, c.bg, 0.1) : k === "snow" ? 0xffffff : c.muted;
      ui.text(cr.x + INSET, cr.y, name, { fg: today ? c.accent : c.fg, attrs: today ? BOLD : 0, bg }, cr.w - INSET * 2);
      ui.text(cr.x + INSET, cr.y + 1, i1, { fg: tint, bg }, cr.w - INSET * 2);
      ui.text(cr.x + INSET, cr.y + 2, i2, { fg: tint, bg }, cr.w - INSET * 2);
      new Bar(ui, cr.x + INSET, cr.y + 3, cr.x + cr.w - INSET, 1)
        .text(`${Math.round(d.max)}°`, { fg: c.fg, attrs: BOLD, bg }, { priority: 9 })
        .text(`${Math.round(d.min)}°`, { fg: c.subtle, bg }, { priority: 8 })
        .text(d.rain >= 20 ? `☂${d.rain}%` : "", { fg: mix(0x7fb4ea, c.bg, 0.2), bg }, { side: "right", priority: 3 })
        .draw();
    });
  }
}

/** The wind in words (Beaufort, roughly). */
function beaufort(kmh: number): string {
  return kmh < 2 ? "calm" : kmh < 12 ? "light breeze" : kmh < 29 ? "breeze" : kmh < 50 ? "strong wind" : kmh < 75 ? "gale" : "violent storm";
}

export const weatherSpec: AppSpec = {
  kind: "weather",
  title: "Weather",
  description: "any place: the sky as an animation, the next 24 h, the week",
  icon: "☂",
  launcher: true,
  create: (deck, args) => new WeatherApp(deck, args),
};

export const weatherCommand: Command = {
  name: "weather",
  aliases: ["meteo"],
  summary: "the weather here or anywhere; the WEATHER app",
  usage: "weather [place]          now and the week\nweather open [place]     the app (s: search, ←→: your places)\nweather save <place> · weather forget <place> · weather places",
  examples: [["weather", "here"], ["weather Tokyo", "anywhere"], ["weather open", "the app with the animated sky"]],
  complete: () => ["open", "save", "forget", "places"],
  async run(ctx) {
    const d = ctx.deck;
    const [a, ...rest] = ctx.args;
    const words = rest.join(" ").trim();
    if (d.settings.data.privacy.stealth) return ctx.err("weather: stealth mode is on\n"), 1;
    if (a === "open") return void d.openApp("weather", words || undefined), 0;
    if (a === "places") {
      const list = (d.settings.data.home.weatherPlaces ?? []) as Place[];
      if (!list.length) return ctx.out(fmt.dim("no saved places — weather save <place>\n")), 0;
      for (const p of list) ctx.out(`★ ${placeName(p)}\n`);
      return 0;
    }
    if (a === "save" || a === "forget") {
      if (!words) return ctx.err(`usage: weather ${a} <place>\n`), 1;
      const list = (d.settings.data.home.weatherPlaces ?? []) as Place[];
      if (a === "forget") {
        const next = list.filter((p) => p.name.toLowerCase() !== words.toLowerCase());
        if (next.length === list.length) return ctx.err(`weather: ${words} isn't saved\n`), 1;
        d.settings.set("home.weatherPlaces", next);
        return ctx.out(`☆ ${words}\n`), 0;
      }
      const p = (lastPlace && lastPlace.name.toLowerCase() === words.toLowerCase() ? lastPlace : null) ?? (await geocode(words, langOf(d)).catch(() => []))[0];
      if (!p) return ctx.err(`weather: no place called ${words}\n`), 1;
      if (!list.some((x) => x.name === p.name && Math.abs(x.lat - p.lat) < 0.01)) d.settings.set("home.weatherPlaces", [...list, p]);
      return ctx.out(`★ ${placeName(p)}\n`), 0;
    }
    const query = [a, ...rest].filter(Boolean).join(" ").trim();
    try {
      const p = query ? (await geocode(query, langOf(d)))[0] : await resolvePlace(d);
      if (!p) return ctx.err(query ? `weather: no place called ${query}\n` : "weather: no location — weather <place>, or setup\n"), 1;
      const f = await forecastFor(p);
      const s = sky(f.code);
      ctx.out(`${fmt.bold(placeName(p))}\n${GLYPH[s]}  ${fmt.bold(`${Math.round(f.temp)}°`)} ${LABEL[s]} · feels ${Math.round(f.feels)}° · wind ${Math.round(f.wind)} km/h ${arrow(f.windDir)} · humidity ${f.humidity}%\n`);
      for (const day of f.days) ctx.out(`${fmt.dim(day.date.slice(5))}  ${GLYPH[sky(day.code)]}  ${String(Math.round(day.max)).padStart(3)}° ${fmt.dim(`${Math.round(day.min)}°`)}${day.rain >= 20 ? fmt.cyan(`  ☂ ${day.rain}%`) : ""}\n`);
      return 0;
    } catch (e) {
      return ctx.err(`weather: ${e instanceof Error ? e.message : e}\n`), 1;
    }
  },
};
