import { widgetConfig } from "./instances";
import { t } from "../core/i18n";
import { focus } from "./focusstate";
import { ago, isoDay, streakOf } from "../core/time";
import { q } from "../ui/ui";
import { mix, type RGB } from "../core/color";
import { BOLD, type Rect } from "../core/grid";
import { geocode, langOf, resolvePlace } from "../core/location";
import { strWidth } from "../core/unicode";
import type { Deck } from "../deck";
import type { SystemStats } from "../platform/types";
import { dots } from "../ui/dots";
import type { UI } from "../ui/ui";
import { basename, dirname } from "../vault/paths";
import { drawClock } from "./clockfaces";
import type { WidgetPlacement, WidgetSpec } from "./types";

/* ═══════════════════════ big pixel digits ═══════════════════════
 * 3×5 bitmaps drawn with half blocks (▀ ▄ █), scaled by `k`: each bitmap
 * pixel is 2k columns × k half-rows. Block glyphs are painted as rectangles,
 * so the result is perfectly crisp at any size. */

const BITMAPS: Record<string, number[]> = {
  "0": [7, 5, 5, 5, 7], "1": [2, 6, 2, 2, 7], "2": [7, 1, 7, 4, 7], "3": [7, 1, 7, 1, 7], "4": [5, 5, 7, 1, 1],
  "5": [7, 4, 7, 1, 7], "6": [7, 4, 7, 5, 7], "7": [7, 1, 1, 1, 1], "8": [7, 5, 7, 5, 7], "9": [7, 5, 7, 1, 7],
  ":": [0, 1, 0, 1, 0], "-": [0, 0, 7, 0, 0], " ": [0, 0, 0, 0, 0], "°": [7, 5, 7, 0, 0],
};
const bitsWide = (ch: string) => (ch === ":" || ch === " " ? 1 : 3);

/** Size of `s` in cells at scale k. */
export function digitsSize(s: string, k: number): { w: number; h: number } {
  const w = [...s].reduce((a, ch, i) => a + bitsWide(ch) * 2 * k + (i ? 2 * k : 0), 0);
  return { w, h: Math.ceil((5 * k) / 2) };
}

/** Biggest scale (1..max) at which `s` fits in w×h, or 0. */
export function fitDigits(s: string, w: number, h: number, max = 4): number {
  for (let k = max; k >= 1; k--) {
    const d = digitsSize(s, k);
    if (d.w <= w && d.h <= h) return k;
  }
  return 0;
}

const SCRAMBLE = [..."░▒▓▚▞"];
/** Per-position time of the last change, so changing digits glitch for a moment. */
const flips = new Map<string, { s: string; at: number[] }>();

/** Draw `s` in big digits; colors run top→bottom. `id` keys the glitch-on-change memory. */
export function drawDigits(ui: UI, x: number, y: number, s: string, k: number, colors: RGB[], id = "", animate = true): void {
  const now = ui.now;
  let mem = flips.get(id);
  if (!mem || mem.s.length !== s.length) mem = { s, at: [...s].map(() => 0) };
  [...s].forEach((ch, i) => {
    if (mem!.s[i] !== ch && ch !== " " && mem!.s[i] !== " ") mem!.at[i] = now;
  });
  mem.s = s;
  flips.set(id, mem);
  const rows = Math.ceil((5 * k) / 2);
  let cx = x;
  [...s].forEach((ch, i) => {
    const bm = BITMAPS[ch] ?? BITMAPS[" "];
    const bw = bitsWide(ch);
    const glitching = animate && now - mem!.at[i] < 260;
    if (glitching) ui.animate(40);
    for (let row = 0; row < rows; row++) {
      const color = colors[Math.min(colors.length - 1, Math.floor((row / rows) * colors.length))];
      for (let col = 0; col < bw * 2 * k; col++) {
        const px = Math.floor(col / (2 * k));
        const on = (half: number) => {
          const by = Math.floor(half / k);
          return by < 5 && ((bm[by] >> (bw - 1 - px)) & 1) === 1;
        };
        const top = on(row * 2);
        const bot = on(row * 2 + 1);
        if (!top && !bot) continue;
        let glyph = top && bot ? "█" : top ? "▀" : "▄";
        if (glitching && (col * 7 + row * 13 + Math.floor(now / 40)) % 5 < 3) glyph = SCRAMBLE[(col + row + Math.floor(now / 40)) % SCRAMBLE.length];
        ui.text(cx + col, y + row, glyph, { fg: glitching ? mix(color, 0xffffff, 0.35) : color });
      }
    }
    cx += bw * 2 * k + 2 * k;
  });
}

/** "label value", label dim. */
function kv(ui: UI, x: number, y: number, label: string, value: string, maxX: number, valueColor?: RGB): void {
  if (x >= maxX) return;
  ui.text(x, y, label, { fg: ui.c.subtle }, maxX - x);
  const vx = x + strWidth(label) + 1;
  ui.text(vx, y, value, { fg: valueColor ?? ui.c.fg }, Math.max(0, maxX - vx));
}

/* ═══════════════════════ clock ═══════════════════════ */

const clock: WidgetSpec = {
  id: "clock",
  title: "clock",
  description: "big time, minute progress, date",
  size: { w: 4, h: 4 },
  min: { w: 2, h: 2 },
  render(ui, r, { deck, key }) {
    drawClock(ui, r, deck, new Date(), key);
  },
};

/* ═══════════════════════ weather ═══════════════════════ */

interface Weather {
  place: string;
  temp: number;
  feels: number;
  humidity: number;
  rainChance: number;
  code: number;
  wind: number;
  windDir: number;
  sunrise: string;
  sunset: string;
  hourly: number[];
  days: { max: number; min: number; code: number; date: string }[];
  at: number;
  key: string;
}

/**
 * One forecast per place shown: "" is where you are (your location setting);
 * a weather widget copy can show another city (its own setting "city").
 */
interface Slot {
  w: Weather | null;
  error: string | null;
  loading: boolean;
}
const slots = new Map<string, Slot>();
function slotOf(city: string): Slot {
  let sl = slots.get(city);
  if (!sl) slots.set(city, (sl = { w: null, error: null, loading: false }));
  return sl;
}
/** the last forecast for where you are, or for a city a weather copy shows (the pop-up, `weather`, PULSE) */
export const currentWeather = (city = "") => slotOf(city).w;

async function loadWeather(key: string, deck: Deck, city = ""): Promise<void> {
  const sl = slotOf(city);
  sl.loading = true;
  try {
    const place = city ? ((await geocode(city, langOf(deck)))[0] ?? null) : await resolvePlace(deck);
    if (!place) throw new Error(city ? `no place called "${city}"` : "no location — run setup (ctrl+k → setup)");
    const q =
      `latitude=${place.lat}&longitude=${place.lon}&timezone=auto&forecast_days=7&forecast_hours=24` +
      `&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,wind_direction_10m` +
      `&hourly=temperature_2m&daily=temperature_2m_max,temperature_2m_min,weather_code,sunrise,sunset,precipitation_probability_max`;
    const f = await (await fetch(`https://api.open-meteo.com/v1/forecast?${q}`)).json();
    const hhmm = (iso: string) => iso?.slice(11, 16) ?? "--:--";
    // the sky changed since the last look (rain coming, sun back…): the voice may say it
    const weather = sl.w;
    const before = !city && weather && weather.key === key ? sky(weather.code) : null;
    const after = sky(f.current.weather_code);
    if (before && before !== after) deck.speak("weather", t("weather in {place}: {sky}", { place: place.name, sky: t(SKY_WORDS[after]) }));
    sl.w = {
      place: place.name,
      temp: f.current.temperature_2m,
      feels: f.current.apparent_temperature,
      humidity: f.current.relative_humidity_2m,
      code: f.current.weather_code,
      wind: f.current.wind_speed_10m,
      windDir: f.current.wind_direction_10m,
      rainChance: f.daily.precipitation_probability_max?.[0] ?? 0,
      sunrise: hhmm(f.daily.sunrise[0]),
      sunset: hhmm(f.daily.sunset[0]),
      hourly: f.hourly.temperature_2m,
      days: (f.daily.time as string[]).slice(1).map((date, i) => ({
        date,
        max: f.daily.temperature_2m_max[i + 1],
        min: f.daily.temperature_2m_min[i + 1],
        code: f.daily.weather_code[i + 1],
      })),
      at: Date.now(),
      key,
    };
    sl.error = null;
  } catch (e) {
    sl.error = e instanceof Error ? e.message : String(e);
  } finally {
    sl.loading = false;
  }
}

type Sky = "sun" | "partly" | "cloud" | "fog" | "rain" | "snow" | "storm";
/** how the voice says a sky */
const SKY_WORDS: Record<Sky, string> = { sun: "clear sky", partly: "a few clouds", cloud: "cloudy", fog: "fog", rain: "rain", snow: "snow", storm: "storm" };
export function sky(code: number): Sky {
  if (code === 0 || code === 1) return "sun";
  if (code === 2) return "partly";
  if (code === 3) return "cloud";
  if (code === 45 || code === 48) return "fog";
  if (code >= 95) return "storm";
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "snow";
  return "rain";
}
const SKY_LABEL: Record<Sky, string> = { sun: "clear", partly: "partly cloudy", cloud: "overcast", fog: "fog", rain: "rain", snow: "snow", storm: "thunderstorm" };
export const SKY_ICON: Record<Sky, string> = { sun: "clear", partly: "mixed", cloud: "cloudy", fog: "fog", rain: "rain", snow: "snow", storm: "storm" };

/**
 * Weather icon drawn in braille dots with true proportions (round sun, puffy
 * cloud outline). Animated: rays turn, rain and snow fall, fog drifts.
 */
function drawSky(ui: UI, r: Rect, s: Sky, t: number, sunCol: RGB, cloudCol: RGB, dropCol: RGB): void {
  const W = r.w * ui.cellAspect, H = r.h;
  const cx = W / 2, cy = H / 2;
  const hasCloud = s !== "sun";
  // cloud: three bumps on a flat base, raised when something falls from it
  const lift = s === "rain" || s === "snow" || s === "storm" ? -0.7 : s === "partly" ? 0.35 : 0;
  const bumps: [number, number, number][] = [[cx - 1.0, cy + 0.25 + lift, 0.75], [cx + 0.05, cy - 0.25 + lift, 1.05], [cx + 1.15, cy + 0.3 + lift, 0.7]];
  const base = cy + 0.95 + lift;
  const inCloud = (x: number, y: number, shrink: number) => y < base - shrink && bumps.some(([bx, by, br]) => (x - bx) ** 2 + (y - by) ** 2 < (br - shrink) ** 2);
  const sx = s === "partly" ? cx - 0.9 : cx, sy = s === "partly" ? cy - 0.75 : cy;
  const spin = t / 4000;
  dots(ui, r, [sunCol, cloudCol, dropCol], (x, y) => {
    if (hasCloud && inCloud(x, y, 0)) return inCloud(x, y, 0.2) ? 0 : 2; // outline only
    if (s === "sun" || s === "partly") {
      const dx = x - sx, dy = y - sy, d = Math.hypot(dx, dy);
      const R = s === "sun" ? 1.0 : 0.75;
      if (d < R) return 1;
      if (d > R * 1.45 && d < R * 2.0) {
        const a = Math.atan2(dy, dx) / (Math.PI / 4) + spin;
        if (Math.abs(a - Math.round(a)) * (Math.PI / 4) * d < 0.09) return 1;
      }
    }
    const below = y > base + 0.15;
    if (s === "rain" || s === "storm") {
      // slanted streaks falling
      const u = x + y * 0.35, v = y - t / 260;
      if (below && Math.abs(u - Math.round(u / 0.7) * 0.7) < 0.07 && ((v % 0.9) + 0.9) % 0.9 < 0.4) return 3;
    }
    if (s === "storm" && below) {
      // a zig-zag bolt that flashes now and then
      if (Math.floor(t / 300) % 5 < 2) {
        const k = (y - base) / 1.6;
        const bx = cx + 0.1 + (k < 0.5 ? -k * 0.8 : -0.4 + (k - 0.5) * 0.9);
        if (k < 1 && Math.abs(x - bx) < 0.1) return 1;
      }
    }
    if (s === "snow" && below) {
      const v = y - t / 900;
      const col = Math.round(x / 0.55);
      const yy = (((v + col * 0.37) % 0.8) + 0.8) % 0.8;
      if (Math.abs(x - col * 0.55) < 0.08 && yy < 0.12) return 3;
    }
    if (s === "fog") {
      const off = Math.sin(x * 1.6 + t / 700) * 0.12;
      for (const ly of [cy + 0.95, cy + 1.45, cy + 1.95]) if (Math.abs(y - ly - off) < 0.07 && (x + t / 1500 + ly) % 1.3 < 1.0) return 2;
    }
    return 0;
  });
}

const ARROWS = ["↓", "↙", "←", "↖", "↑", "↗", "→", "↘"]; // direction the wind blows toward

const weatherWidget: WidgetSpec = {
  id: "weather",
  title: "weather",
  description: "now, the next 24 h and the week (open-meteo.com)",
  size: { w: 4, h: 7 },
  min: { w: 2, h: 2 },
  render(ui, r, { deck, key: copy }) {
    const c = ui.c;
    const loc = deck.settings.data.user.location;
    // this copy's city (its pop-up: c), else where you are
    const city = widgetConfig(deck, copy, "city", "");
    const sl = slotOf(city);
    const key = city ? `city|${city}` : `${loc.precision}|${loc.name}|${loc.lat}|${loc.lon}|${deck.settings.data.home.weatherCity}`;
    const stale = !sl.w || sl.w.key !== key || Date.now() - sl.w.at > 15 * 60_000;
    if (stale && !sl.loading && !sl.error) void loadWeather(key, deck, city).then(() => deck.requestFrame());
    if (!sl.w) {
      ui.text(r.x + 1, r.y + 1, sl.error ? `⚠ ${sl.error}` : `${ui.spinner()} contacting the sky…`, { fg: sl.error ? c.error : c.muted }, r.w - 2);
      if (sl.error) ui.text(r.x + 1, r.y + 2, "enter: retry", { fg: c.faint });
      return;
    }
    const w = sl.w;
    const s = sky(w.code);
    const artColor = s === "sun" ? c.warning : s === "storm" ? c.accentAlt : s === "snow" ? c.fg : c.info;
    const showArt = r.w >= 36 && r.h >= 5;
    if (showArt) {
      drawSky(ui, { x: r.x + 1, y: r.y, w: 12, h: 5 }, s, ui.now, c.warning, mix(c.fg, c.bg, 0.25), artColor);
      ui.animate(s === "sun" || s === "partly" || s === "cloud" ? 200 : 60);
    }
    // big temperature + place
    const tx = r.x + (showArt ? 14 : 1);
    const temp = `${Math.round(w.temp)}°`;
    const k = 0;
    let infoX = tx;
    let below = r.y + 1;
    if (k) {
      const d = digitsSize(temp, k);
      drawDigits(ui, tx, r.y, temp, k, [c.accent, c.accentAlt], "weather-temp", false);
      ui.text(tx, r.y + d.h, w.place, { fg: c.fg, attrs: BOLD }, d.w + 8);
      infoX = tx + Math.max(d.w, strWidth(w.place)) + 3;
      below = r.y + d.h + 1;
    } else ui.text(tx, r.y, `${w.place}  ${Math.round(w.temp)}°C`, { fg: c.accent, attrs: BOLD }, r.x + r.w - tx);
    // details: next to the big number, or under the place name
    const maxX = r.x + r.w - 1;
    const rows: [string, string, RGB?][] = [
      ["", SKY_LABEL[s], c.fg],
      ["feels", `${Math.round(w.feels)}°`],
      ["wind ", `${Math.round(w.wind)} km/h ${ARROWS[Math.round(w.windDir / 45) % 8]}`],
      ["humid", `${Math.round(w.humidity)}%`],
      ["rain ", `${Math.round(w.rainChance)}%`],
      ["sun  ", `↑${w.sunrise} ↓${w.sunset}`],
    ];
    const dy = k ? r.y : below;
    const room = showArt ? 5 : r.h - (dy - r.y);
    if (maxX - infoX >= 14)
      rows.slice(0, Math.max(0, room)).forEach(([l, v, col], i) => (l ? kv(ui, infoX, dy + i, l, v, maxX, col) : ui.text(infoX, dy + i, v, { fg: col ?? c.fg, attrs: BOLD }, maxX - infoX)));

    let y = r.y + Math.max(showArt ? 6 : 0, k ? digitsSize(temp, k).h + 2 : 0, Math.min(room, rows.length) + 1);
    // next 24 h
    if (r.h - (y - r.y) >= 5 && w.hourly.length) {
      const lo = Math.min(...w.hourly), hi = Math.max(...w.hourly);
      const cw = r.w - 7;
      const vals = Array.from({ length: cw * 2 }, (_, i) => ((w.hourly[Math.floor((i / (cw * 2)) * w.hourly.length)] - lo) / Math.max(1, hi - lo)) * 0.85 + 0.1);
      ui.chart({ x: r.x + 1, y, w: cw, h: 2 }, vals, mix(c.accent, c.bg, 0.15));
      ui.text(r.x + cw + 2, y, `${Math.round(hi)}°`, { fg: c.subtle });
      ui.text(r.x + cw + 2, y + 1, `${Math.round(lo)}°`, { fg: c.faint });
      y += 3;
    }
    // the week: as many days as fit, with a min→max bar on the week's scale
    if (y < r.y + r.h) {
      const locale = deck.settings.data.user.locale || undefined;
      const n = Math.max(1, Math.min(w.days.length, Math.floor((r.w - 2) / 13)));
      const colW = Math.floor((r.w - 2) / n);
      w.days.slice(0, n).forEach((d, i) => {
        const x = r.x + 1 + i * colW;
        const day = new Date(`${d.date}T12:00`).toLocaleDateString(locale, { weekday: "short" }).replace(".", "");
        const sk = sky(d.code);
        ui.text(x, y, day, { fg: c.fg, attrs: BOLD }, 5);
        ui.text(x + 5, y, SKY_ICON[sk], { fg: sk === "sun" ? c.warning : sk === "storm" ? c.accentAlt : c.info }, colW - 6);
        if (y + 1 < r.y + r.h) {
          ui.text(x, y + 1, `↑${Math.round(d.max)}°`, { fg: c.fg });
          ui.text(x + 5, y + 1, `↓${Math.round(d.min)}°`, { fg: c.subtle });
        }
      });
    }
  },
  activate: ({ deck, key }) => {
    const sl = slotOf(widgetConfig(deck, key, "city", ""));
    sl.w = null;
    sl.error = null;
    deck.requestFrame();
  },
};

/* ═══════════════════════ calendar ═══════════════════════ */

const calendar: WidgetSpec = {
  id: "calendar",
  title: "calendar",
  description: "this month (with your events when the CALENDAR module is on)",
  size: { w: 4, h: 7 },
  min: { w: 2, h: 2 },
  render(ui, r, ctx) {
    // the CALENDAR module draws it with your events; without it, the journal month
    const month = ctx.deck.widgets.get("calendar.month");
    if (month) return month.render(ui, r, ctx);
    const { deck } = ctx;
    const c = ui.c;
    const locale = deck.settings.data.user.locale || undefined;
    const now = new Date();
    const first = new Date(now.getFullYear(), now.getMonth(), 1);
    const offset = (first.getDay() + 6) % 7;
    const days = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const weeks = Math.ceil((offset + days) / 7);
    const entries = deck.vault.journalDates();
    const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const monthCount = [...entries].filter((e) => e.startsWith(ym)).length;

    // cells grow with the widget
    const cw = Math.max(3, Math.min(8, Math.floor((r.w - 2) / 7)));
    const footer = r.h - 2 - weeks >= 2 ? 1 : 0;
    const ch = Math.max(1, Math.min(3, Math.floor((r.h - 2 - footer) / weeks)));
    const gx = r.x + Math.floor((r.w - cw * 7) / 2);
    const title = first.toLocaleDateString(locale, { month: "long", year: "numeric" }).toUpperCase();
    ui.textCenter(r, r.y, title, { fg: c.fg, attrs: BOLD });
    const names = [...Array(7)].map((_, i) => new Date(2024, 0, 1 + i).toLocaleDateString(locale, { weekday: cw >= 6 ? "short" : "narrow" }).replace(".", "").slice(0, cw - 1));
    names.forEach((n, i) => ui.text(gx + i * cw + cw - 1 - strWidth(n), r.y + 1, n, { fg: i >= 5 ? c.accentAlt : c.subtle }));
    const pulse = Math.floor(ui.now / 700) % 2 === 0;
    for (let d = 1; d <= days; d++) {
      const cell = offset + d - 1;
      const x = gx + (cell % 7) * cw;
      const y = r.y + 2 + Math.floor(cell / 7) * ch;
      if (y >= r.y + r.h - footer) break;
      const date = new Date(now.getFullYear(), now.getMonth(), d);
      const has = entries.has(`${ym}-${String(d).padStart(2, "0")}`);
      const today = d === now.getDate();
      const rect = { x, y, w: cw - 1, h: ch };
      const hot = ui.hovered(rect);
      const label = String(d).padStart(cw - 1);
      if (today) ui.text(x, y, label, { fg: c.panel, bg: pulse ? c.accent : mix(c.accent, c.accentAlt, 0.6), attrs: BOLD });
      else ui.text(x, y, label, { fg: has ? c.accent : cell % 7 >= 5 ? c.subtle : c.muted, bg: hot ? c.highlight : undefined, attrs: has ? BOLD : 0 });
      if (has && ch >= 2) ui.text(x + cw - 2, y + 1, "•", { fg: c.accent });
      ui.hit(rect, { cmd: `journal ${isoDay(date)}`, tip: has ? "open that day's entry" : "start an entry for that day" });
    }
    if (footer) {
      const s = streakOf(entries);
      ui.textCenter(r, r.y + r.h - 1, `${s ? `▲ ${s}-day streak · ` : ""}${monthCount} entr${monthCount === 1 ? "y" : "ies"} this month`, { fg: c.subtle });
    }
    ui.animate(700);
  },
  activate: ({ deck }) => void deck.openJournal(new Date()),
};


/* ═══════════════════════ system ═══════════════════════ */

let stats: SystemStats | null = null;
let statsAt = 0;
const cpuHistory: number[] = [];

const system: WidgetSpec = {
  id: "system",
  title: "system",
  description: "cpu history, memory, uptime",
  size: { w: 4, h: 3 },
  min: { w: 2, h: 2 },
  render(ui, r, { deck }) {
    const c = ui.c;
    if (Date.now() - statsAt > 1500) {
      statsAt = Date.now();
      void deck.platform.system
        .stats()
        .then((s) => {
          stats = s;
          cpuHistory.push(s.cpu / 100);
          if (cpuHistory.length > 400) cpuHistory.shift();
          deck.requestFrame();
        })
        .catch(() => {});
    }
    ui.animate(1500);
    if (!stats) return void ui.text(r.x + 1, r.y, ui.spinner(), { fg: c.muted });
    const mem = stats.memTotal ? stats.memUsed / stats.memTotal : 0;
    const half = Math.floor(r.w / 2);
    const bar = (x: number, w: number, label: string, v: number, col: RGB) => {
      ui.text(x, r.y, label, { fg: c.subtle });
      ui.bar(x + 4, r.y, Math.max(3, w - 9), v, col, c.faint);
      ui.textRight(x + w, r.y, `${Math.round(v * 100)}%`, { fg: c.fg });
    };
    bar(r.x + 1, half - 2, "cpu", stats.cpu / 100, c.accent);
    bar(r.x + half + 1, r.w - half - 2, "mem", mem, c.accentAlt);
    if (r.h >= 3) {
      ui.chart({ x: r.x + 1, y: r.y + 1, w: r.w - 2, h: r.h - 2 }, cpuHistory, mix(c.accent, c.bg, 0.25));
      const up = stats.uptime;
      ui.text(r.x + 1, r.y + r.h - 1, `up ${Math.floor(up / 86400)}d ${Math.floor((up % 86400) / 3600)}h · ${stats.processes} procs · ${stats.cores.length} cores`, { fg: c.faint }, r.w - 2);
    }
  },
  activate: ({ deck }) => void deck.openApp("sysmon"),
};

/* ═══════════════════════ recent notes ═══════════════════════ */

const recent: WidgetSpec = {
  id: "recent",
  title: "recent",
  description: "last edited notes",
  size: { w: 6, h: 4 },
  min: { w: 2, h: 2 },
  render(ui, r, { deck }) {
    const c = ui.c;
    const notes = [...deck.vault.markdown()].sort((a, b) => b.modified - a.modified).slice(0, r.h);
    if (!notes.length) return void ui.text(r.x + 1, r.y, "no notes yet — ctrl+n", { fg: c.muted });
    const folderW = r.w >= 50 ? 16 : 0;
    notes.forEach((e, i) => {
      const row: Rect = { x: r.x, y: r.y + i, w: r.w, h: 1 };
      const hot = ui.hovered(row);
      const bg = hot ? c.highlight : undefined;
      if (hot) ui.fill(row, { bg: c.highlight });
      ui.text(r.x + 1, row.y, hot ? "▸" : i === 0 ? "◆" : "·", { fg: i === 0 || hot ? c.accent : c.faint, bg });
      ui.text(r.x + 3, row.y, basename(e.path, ".md"), { fg: hot ? c.accent : c.fg, bg, attrs: i === 0 ? BOLD : 0 }, r.w - 10 - folderW);
      if (folderW) ui.text(r.x + r.w - 8 - folderW, row.y, dirname(e.path) || "/", { fg: c.subtle, bg }, folderW);
      ui.textRight(r.x + r.w - 1, row.y, ago(e.modified), { fg: c.faint, bg });
      ui.hit(row, { cmd: `open ${q(e.path)}` });
    });
  },
};


/* ═══════════════════════ pulse ═══════════════════════ */

/**
 * PULSE — what's happening across the modules, one line each, live: the next
 * event, today's tasks, the next reminder, what's playing, the focus timer, the
 * weather, the habits left, errors. A click opens the module. (It replaces the
 * old launcher: launching is the shortcut squares' job now.)
 *
 * The lines come from the modules' own functions (`deck.use("calendar").today()`…),
 * fetched every 20 s in the background: drawing never waits for them. A module
 * that's off simply has no line.
 */
interface PulseLine {
  icon: string;
  name: string;
  text: string;
  cmd: string;
  /** something that wants you: drawn brighter */
  hot?: boolean;
}
let pulse: PulseLine[] = [];
let pulseAt = 0;

async function refreshPulse(deck: Deck): Promise<void> {
  pulseAt = Date.now();
  const lines: PulseLine[] = [];
  const has = (m: string, fn: string) => deck.services.has(m, fn);
  const time = (d: Date) => d.toLocaleTimeString(deck.settings.data.user.locale || undefined, { hour: "2-digit", minute: "2-digit" });
  const tryLine = async (f: () => Promise<PulseLine | null>) => {
    try {
      const l = await f();
      if (l) lines.push(l);
    } catch {
      /* a module that fails just has no line */
    }
  };
  await tryLine(async () => {
    if (!has("calendar", "today")) return null;
    const now = Date.now();
    const evs = (await deck.use("calendar").today()) as { title: string; start: string; allDay?: boolean }[];
    const next = evs.filter((e) => e.allDay || new Date(e.start).getTime() > now).sort((a, b) => a.start.localeCompare(b.start))[0];
    const soon = next && !next.allDay && new Date(next.start).getTime() - now < 3_600_000;
    return { icon: "▦", name: t("agenda"), text: next ? `${next.allDay ? t("today") : time(new Date(next.start))} ${next.title}` : t("nothing left today"), cmd: "cal open", hot: !!soon };
  });
  await tryLine(async () => {
    if (!has("todo", "list")) return null;
    const today = new Date().toISOString().slice(0, 10);
    const tasks = (await deck.use("todo").list()) as { done: boolean; due?: string }[];
    const open = tasks.filter((x) => !x.done);
    const due = open.filter((x) => x.due && x.due.slice(0, 10) <= today).length;
    return { icon: "☑", name: "todo", text: due ? t("{n} due today", { n: due }) : t("{n} open", { n: open.length }), cmd: "launch todo", hot: due > 0 };
  });
  await tryLine(async () => {
    if (!has("reminders", "list")) return null;
    const list = ((await deck.use("reminders").list()) as { title: string; due: string }[]).sort((a, b) => a.due.localeCompare(b.due));
    return list[0] ? { icon: "◷", name: t("reminder"), text: `${time(new Date(list[0].due))} ${list[0].title}`, cmd: "remind open" } : null;
  });
  await tryLine(async () => {
    if (!has("habits", "list")) return null;
    const hs = (await deck.use("habits").list()) as { done: boolean }[];
    const left = hs.filter((h) => !h.done).length;
    return hs.length ? { icon: "▲", name: "habits", text: left ? t("{n} left today", { n: left }) : t("all done ✓"), cmd: "launch habits" } : null;
  });
  await tryLine(async () => {
    if (!has("music", "status")) return null;
    const m = (await deck.use("music").status()) as { title?: string; artist?: string; playing?: boolean } | null;
    return m?.title ? { icon: "♪", name: "music", text: `${m.playing ? "▶" : "❚❚"} ${m.title}${m.artist ? ` · ${m.artist}` : ""}`, cmd: "launch music" } : null;
  });
  pulse = lines;
  deck.requestFrame();
}

const modules: WidgetSpec = {
  id: "modules",
  title: "pulse",
  description: "what's happening across your modules: next event, tasks, reminders, music, focus, weather, errors",
  size: { w: 6, h: 4 },
  min: { w: 3, h: 2 },
  render(ui, r, { deck }) {
    const c = ui.c;
    if (Date.now() - pulseAt > 20_000) void refreshPulse(deck);
    ui.animate(1000);
    // the lines that need no waiting: focus, weather, errors
    const lines: PulseLine[] = [...pulse];
    if (focus.running) lines.unshift({ icon: "◎", name: "focus", text: `${focus.phase === "break" ? t("break") : t("focus")} · ${Math.ceil(focus.left / 60000)} min`, cmd: "launch focus", hot: true });
    const w = currentWeather();
    if (w) lines.push({ icon: "☁", name: t("weather"), text: `${Math.round(w.temp)}° · ${t(SKY_WORDS[sky(w.code)])}`, cmd: "weather open" });
    if (deck.errors.unseen) lines.unshift({ icon: "⚠", name: t("errors"), text: t("{n} new", { n: deck.errors.unseen }), cmd: "errors", hot: true });
    if (!lines.length) {
      ui.textCenter(r, r.y + Math.floor(r.h / 2), t("all quiet"), { fg: c.subtle });
      return;
    }
    const nameW = Math.min(10, Math.max(...lines.map((l) => strWidth(l.name))) + 1);
    lines.slice(0, r.h).forEach((l, i) => {
      const y = r.y + i;
      const row = { x: r.x, y, w: r.w, h: 1 };
      const hotRow = ui.hovered(row);
      if (hotRow) ui.fill(row, { bg: c.highlight });
      const st = hotRow ? { bg: c.highlight } : {};
      ui.text(r.x, y, l.icon, { fg: l.hot ? c.warning : c.accent, ...st });
      ui.text(r.x + 2, y, l.name, { fg: c.subtle, ...st }, nameW);
      ui.text(r.x + 3 + nameW, y, l.text, { fg: l.hot ? c.fg : c.muted, attrs: l.hot ? BOLD : 0, ...st }, r.w - nameW - 3);
      ui.hit(row, { cmd: l.cmd, tip: `${l.name}: ${l.text}` });
    });
  },
  activate: ({ deck }) => void refreshPulse(deck),
};

/** the first HOME widgets (the others are in extra.ts); widgets/index.ts adds the pop-ups and puts them together */
export const CORE_WIDGETS: WidgetSpec[] = [clock, weatherWidget, calendar, system, recent, modules];

/** Home layouts offered by the setup questionnaire. The first one is the default. */
/**
 * The HOME everyone starts with: the time, the weather, the AI, the news and
 * your modules at a glance — and room left on purpose, so it's obvious HOME is
 * yours to fill (e to edit, a to add).
 */
export const DEFAULT_LAYOUT: WidgetPlacement[] = [
  { id: "clock", x: 0, y: 0, w: 4, h: 4 },
  { id: "weather", x: 4, y: 0, w: 4, h: 5 },
  { id: "ai", x: 8, y: 0, w: 4, h: 6 },
  { id: "news", x: 0, y: 4, w: 4, h: 5 },
  { id: "modules", x: 4, y: 5, w: 4, h: 4 },
];
