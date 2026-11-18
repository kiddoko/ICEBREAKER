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
import { mix, type RGB } from "../core/color";
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
const GLYPH: Record<Sky, string> = { sun: "☼", partly: "⛅", cloud: "☁", fog: "≋", rain: "☂", snow: "❄", storm: "ϟ" };
const ARROWS = ["↓", "↙", "←", "↖", "↑", "↗", "→", "↘"]; // where the wind blows to (from N = ↓)
const arrow = (deg: number) => ARROWS[Math.round(deg / 45) % 8];
const placeName = (p: Place) => [p.name, p.admin && p.admin !== p.name ? p.admin : "", p.countryCode].filter(Boolean).join(", ");

/** Stable pseudo-random 0..1. */
const rnd = (a: number, b: number) => {
  const h = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return h - Math.floor(h);
};

/** The sky, animated: everything is a pure function of the time `s` (seconds). */
function drawSky(ui: UI, r: Rect, s: Sky, isDay: boolean, sec: number): void {
  const c = ui.c;
  const put = (x: number, y: number, ch: string, fg: RGB) => {
    if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) ui.text(x, y, ch, { fg });
  };
  const cx = r.x + Math.floor(r.w * 0.3), cy = r.y + Math.floor(r.h * 0.32);
  // sun or moon
  if (s === "sun" || s === "partly") {
    if (isDay) {
      const rays = ["─", "╲", "│", "╱"];
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2 + sec * 0.4;
        const len = 3 + (Math.sin(sec * 2 + k) > 0.3 ? 1 : 0);
        put(Math.round(cx + Math.cos(a) * len * 2), Math.round(cy + Math.sin(a) * len), rays[k % 4], mix(c.warning, c.bg, 0.2));
      }
      for (const [dx, dy, ch] of [[-1, 0, "("], [0, 0, "☼"], [1, 0, ")"]] as const) put(cx + dx, cy + dy, ch, c.warning);
    } else {
      for (const [dx, dy, ch] of [[0, -1, "▄"], [-1, 0, "█"], [0, 0, " "], [-1, 1, "▀"]] as const) put(cx + dx, cy + dy, ch, mix(0xe8e4d8, c.bg, 0.1));
      for (let i = 0; i < 14; i++) if (Math.sin(sec * 1.7 + i * 3) > 0.2) put(r.x + Math.floor(rnd(i, 1) * r.w), r.y + Math.floor(rnd(i, 2) * r.h * 0.6), "·", c.subtle);
    }
  }
  // clouds drifting
  const cloudCount = s === "sun" ? 0 : s === "partly" ? 1 : s === "fog" ? 0 : 3;
  const CLOUD = ["  .--.   ", ".(    ). ", "(___.__)_"];
  for (let k = 0; k < cloudCount; k++) {
    const speed = 0.6 + k * 0.25;
    const x0 = r.x + Math.floor(((rnd(k, 5) * r.w + sec * speed) % (r.w + 10)) - 9);
    const y0 = r.y + (s === "partly" ? Math.floor(r.h * 0.35) : k);
    const col = s === "storm" ? mix(c.subtle, c.bg, 0.2) : mix(c.fg, c.bg, 0.25 + k * 0.15);
    CLOUD.forEach((row, i) => [...row].forEach((ch, j) => ch !== " " && put(x0 + j, y0 + i, ch, col)));
  }
  // rain, snow
  if (s === "rain" || s === "storm") {
    const n = Math.floor(r.w * r.h * 0.06);
    for (let i = 0; i < n; i++) {
      const sp = 7 + rnd(i, 9) * 5;
      const y = r.y + 3 + Math.floor((rnd(i, 3) * r.h + sec * sp) % (r.h - 3));
      const x = r.x + Math.floor((rnd(i, 4) * r.w - (y - r.y) * 0.4 + r.w) % r.w);
      put(x, y, rnd(i, 6) > 0.5 ? "╱" : "'", mix(c.info, c.bg, 0.15 + rnd(i, 7) * 0.4));
    }
  }
  if (s === "snow") {
    const n = Math.floor(r.w * r.h * 0.05);
    for (let i = 0; i < n; i++) {
      const y = r.y + 3 + Math.floor((rnd(i, 3) * r.h + sec * (1.2 + rnd(i, 8))) % (r.h - 3));
      const x = r.x + Math.floor((rnd(i, 4) * r.w + Math.sin(sec + i) * 1.5 + r.w) % r.w);
      put(x, y, rnd(i, 6) > 0.6 ? "*" : "·", mix(0xffffff, c.bg, 0.1 + rnd(i, 7) * 0.4));
    }
  }
  // storm: a bolt now and then, and the sky flashes
  if (s === "storm") {
    const flash = (sec % 5.3) < 0.18;
    if (flash) {
      ui.tint(r, undefined, mix(c.bg, 0xffffff, 0.12));
      let x = r.x + Math.floor(rnd(Math.floor(sec / 5.3), 1) * (r.w - 6)) + 3;
      for (let y = r.y + 3; y < r.y + r.h - 1; y++) {
        put(x, y, y % 2 ? "╱" : "╲", c.warning);
        x += y % 2 ? -1 : 1;
      }
    }
  }
  // fog banks sliding across
  if (s === "fog" || s === "cloud") {
    const layers = s === "fog" ? r.h - 1 : 2;
    for (let i = 0; i < layers; i++) {
      const y = r.y + r.h - 1 - i;
      const off = Math.floor(sec * (0.8 + (i % 3) * 0.4)) + i * 7;
      for (let x = 0; x < r.w; x++) if ((x + off) % 9 < 5) put(r.x + x, y, i % 2 ? "─" : "~", mix(c.subtle, c.bg, 0.3 + (i % 3) * 0.15));
    }
  }
}

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
    return t("s search a place · ←→ your places · p save this place · r refresh");
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
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
    } finally {
      this.loading = false;
      this.deck.requestFrame();
    }
  }
  async search(): Promise<void> {
    const q = await this.deck.prompt(t("Weather where?"), { placeholder: "Lausanne, Tokyo, Reykjavik…" });
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
  onKey(k: KeyInput): boolean {
    void k;
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

  render(ui: UI, r: Rect, focused: boolean): void {
    const c = ui.c;
    void focused;
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
    let x = ui.text(r.x + 2, r.y + 1, placeName(f.place), { fg: c.title, attrs: BOLD });
    x += 2;
    x += ui.button(x, r.y + 1, t("⌕ search"), () => void this.search(), { tip: "s · weather <place>" }) + 1;
    const saved = this.places().some((p) => p.name === f.place.name && Math.abs(p.lat - f.place.lat) < 0.01);
    x += ui.button(x, r.y + 1, saved ? t("★ saved") : t("☆ save"), () => void this.deck.act(`weather ${saved ? "forget" : "save"} ${f.place.name}`), { tip: "p" }) + 2;
    for (const [i, p] of this.places().entries()) {
      if (x > r.x + r.w - 12) break;
      const on = p.name === f.place.name;
      x += ui.button(x, r.y + 1, p.name, () => ((this.placeIndex = i), void this.load(p)), { selected: on, tip: "←→" }) + 1;
    }
    if (this.loading) ui.textRight(r.x + r.w - 2, r.y + 1, ui.spinner(), { fg: c.accent });

    // the sky (left) and the numbers (right)
    const skyW = Math.max(20, Math.floor(r.w * 0.45)), skyH = Math.max(6, Math.min(14, Math.floor(r.h * 0.45)));
    const skyR = { x: r.x + 2, y: r.y + 3, w: skyW, h: skyH };
    ui.clip(skyR, () => drawSky(ui, skyR, sk, f.isDay, sec));
    const nx = skyR.x + skyW + 3;
    const temp = `${Math.round(f.temp)}°`;
    const k = fitMatrix(temp, r.x + r.w - nx - 2, 4, 1);
    let ny = skyR.y;
    if (k) {
      matrixText(ui, nx, ny, temp, k, () => c.accent);
      ny += matrixSize(temp, k).h + 1;
    } else ui.text(nx, ny++, temp, { fg: c.accent, attrs: BOLD });
    ui.text(nx, ny++, `${GLYPH[sk]}  ${t(LABEL[sk])}`, { fg: c.fg, attrs: BOLD });
    ui.text(nx, ny++, `${t("feels")} ${Math.round(f.feels)}° · ${t("humidity")} ${f.humidity}%`, { fg: c.subtle });
    ui.text(nx, ny++, `${t("wind")} ${Math.round(f.wind)} km/h ${arrow(f.windDir)}`, { fg: c.subtle });
    ui.text(nx, ny++, `☀ ${f.days[0]?.sunrise}  ☾ ${f.days[0]?.sunset}`, { fg: c.subtle });

    // the next 24 hours: a curve, the rain chances under it
    const cy = skyR.y + skyH + 1;
    const cw = r.w - 6, chH = Math.max(3, Math.min(6, r.y + r.h - cy - 8));
    if (cw > 20 && cy + chH + 3 < r.y + r.h) {
      const temps = f.hours.map((h) => h.temp);
      const lo = Math.min(...temps), hi = Math.max(...temps), span = hi - lo || 1;
      ui.text(r.x + 2, cy, t("next 24 h"), { fg: c.muted, attrs: BOLD });
      ui.textRight(r.x + r.w - 2, cy, `${Math.round(lo)}° … ${Math.round(hi)}°`, { fg: c.subtle });
      const samples = cw * 2;
      ui.chart({ x: r.x + 3, y: cy + 1, w: cw, h: chH }, Array.from({ length: samples }, (_, i) => (temps[Math.min(temps.length - 1, Math.floor((i / samples) * temps.length))] - lo) / span * 0.9 + 0.05), c.accent);
      const ry = cy + chH + 1;
      const bars = "▁▂▃▄▅▆▇█";
      for (let i = 0; i < cw; i++) {
        const h = f.hours[Math.min(f.hours.length - 1, Math.floor((i / cw) * f.hours.length))];
        if (h.rain > 5) ui.text(r.x + 3 + i, ry, bars[Math.min(7, Math.floor((h.rain / 100) * 8))], { fg: mix(c.info, c.bg, 0.2) });
      }
      for (let i = 0; i < f.hours.length; i += 3) ui.text(r.x + 3 + Math.floor((i / f.hours.length) * cw), ry + 1, f.hours[i].t.slice(0, 2), { fg: c.faint });
    }

    // the week
    const wy = r.y + r.h - 3;
    const colW = Math.max(9, Math.floor((r.w - 4) / Math.min(7, f.days.length)));
    f.days.slice(0, Math.floor((r.w - 4) / colW)).forEach((d, i) => {
      const dx = r.x + 2 + i * colW;
      const date = new Date(`${d.date}T12:00`);
      const name = i === 0 ? t("today") : date.toLocaleDateString(this.deck.settings.data.user.locale || undefined, { weekday: "short" });
      ui.text(dx, wy, `${GLYPH[sky(d.code)]} ${name}`, { fg: i === 0 ? c.accent : c.fg, attrs: i === 0 ? BOLD : 0 }, colW - 1);
      ui.text(dx, wy + 1, `${Math.round(d.max)}° ${Math.round(d.min)}°`, { fg: c.subtle }, colW - 1);
      if (d.rain >= 20) ui.text(dx, wy + 2, `☂ ${d.rain}%`, { fg: mix(c.info, c.bg, 0.2) }, colW - 1);
    });
  }
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
