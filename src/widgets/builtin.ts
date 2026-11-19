import { ago } from "../core/time";
import { q } from "../ui/ui";
import { mix, type RGB } from "../core/color";
import { BOLD, type Rect } from "../core/grid";
import { resolvePlace } from "../core/location";
import { strWidth } from "../core/unicode";
import type { Deck } from "../deck";
import type { SystemStats } from "../platform/types";
import { dots } from "../ui/dots";
import type { UI } from "../ui/ui";
import { basename, dirname } from "../vault/paths";
import { EXTRA_WIDGETS } from "./extra";
import { drawClock } from "./clockfaces";
import { withPopups } from "./popups";
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
  render(ui, r, { deck }) {
    drawClock(ui, r, deck);
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

let weather: Weather | null = null;
/** the last forecast (the weather pop-up and `weather` read it) */
export const currentWeather = () => weather;
let weatherError: string | null = null;
let weatherLoading = false;

async function loadWeather(key: string, deck: Deck): Promise<void> {
  weatherLoading = true;
  try {
    const place = await resolvePlace(deck);
    if (!place) throw new Error("no location — run setup (ctrl+k → setup)");
    const q =
      `latitude=${place.lat}&longitude=${place.lon}&timezone=auto&forecast_days=7&forecast_hours=24` +
      `&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,wind_direction_10m` +
      `&hourly=temperature_2m&daily=temperature_2m_max,temperature_2m_min,weather_code,sunrise,sunset,precipitation_probability_max`;
    const f = await (await fetch(`https://api.open-meteo.com/v1/forecast?${q}`)).json();
    const hhmm = (iso: string) => iso?.slice(11, 16) ?? "--:--";
    weather = {
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
    weatherError = null;
  } catch (e) {
    weatherError = e instanceof Error ? e.message : String(e);
  } finally {
    weatherLoading = false;
  }
}

type Sky = "sun" | "partly" | "cloud" | "fog" | "rain" | "snow" | "storm";
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
  render(ui, r, { deck }) {
    const c = ui.c;
    const loc = deck.settings.data.user.location;
    const key = `${loc.precision}|${loc.name}|${loc.lat}|${loc.lon}|${deck.settings.data.home.weatherCity}`;
    const stale = !weather || weather.key !== key || Date.now() - weather.at > 15 * 60_000;
    if (stale && !weatherLoading && !weatherError) void loadWeather(key, deck).then(() => deck.requestFrame());
    if (!weather) {
      ui.text(r.x + 1, r.y + 1, weatherError ? `⚠ ${weatherError}` : `${ui.spinner()} contacting the sky…`, { fg: weatherError ? c.error : c.muted }, r.w - 2);
      if (weatherError) ui.text(r.x + 1, r.y + 2, "enter: retry", { fg: c.faint });
      return;
    }
    const w = weather;
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
  activate: ({ deck }) => {
    weather = null;
    weatherError = null;
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

export function isoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function streakOf(entries: Set<string>): number {
  const d = new Date();
  if (!entries.has(isoDay(d))) d.setDate(d.getDate() - 1);
  let n = 0;
  while (entries.has(isoDay(d))) {
    n++;
    d.setDate(d.getDate() - 1);
  }
  return n;
}

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


/* ═══════════════════════ modules ═══════════════════════ */

const modules: WidgetSpec = {
  id: "modules",
  title: "modules",
  description: "launch apps and plugins",
  size: { w: 6, h: 4 },
  min: { w: 2, h: 2 },
  render(ui, r, { deck }) {
    const c = ui.c;
    const items = [
      ...deck.apps.list().filter((s) => s.launcher).map((s) => ({ icon: s.icon ?? "◇", title: s.title, desc: s.description ?? "", cmd: `launch ${s.kind}` })),
      { icon: "▦", title: "All modules", desc: "everything installed", cmd: "modules" },
    ];
    const tall = r.h >= 5; // title + description per tile
    const tileH = tall ? 3 : 1;
    const tileW = Math.max(16, Math.min(32, Math.floor(r.w / Math.max(1, Math.floor(r.w / 24)))));
    const perRow = Math.max(1, Math.floor(r.w / tileW));
    items.forEach((it, i) => {
      const x = r.x + (i % perRow) * tileW;
      const y = r.y + Math.floor(i / perRow) * tileH;
      if (y + (tall ? 2 : 1) > r.y + r.h) return;
      const rect = { x, y, w: tileW - 1, h: tall ? 2 : 1 };
      const hot = ui.hovered(rect);
      ui.text(x, y, hot ? "▌" : " ", { fg: c.accent });
      ui.text(x + 1, y, `${it.icon} ${tall ? it.title.toUpperCase() : it.title.toLowerCase()}`, { fg: hot ? c.accent : c.fg, attrs: tall ? BOLD : 0 }, tileW - 2);
      if (tall) {
        ui.text(x, y + 1, hot ? "▌" : " ", { fg: c.accent });
        ui.text(x + 1, y + 1, it.desc, { fg: c.subtle }, tileW - 2);
      }
      ui.hit(rect, { cmd: it.cmd });
    });
  },
  activate: ({ deck }) => void deck.openApp("modules"),
};

export const BUILTIN_WIDGETS: WidgetSpec[] = withPopups([clock, weatherWidget, calendar, system, recent, modules, ...EXTRA_WIDGETS]);

/** Home layouts offered by the setup questionnaire. The first one is the default. */
export const LAYOUT_PRESETS: Record<"essentials" | "productivity" | "gadget", WidgetPlacement[]> = {
  essentials: [
    { id: "clock", x: 0, y: 0, w: 4, h: 4 },
    { id: "system", x: 0, y: 4, w: 4, h: 3 },
    { id: "weather", x: 4, y: 0, w: 4, h: 7 },
    { id: "calendar", x: 8, y: 0, w: 4, h: 7 },
    { id: "recent", x: 0, y: 7, w: 6, h: 4 },
    { id: "modules", x: 6, y: 7, w: 6, h: 4 },
  ],
  productivity: [
    { id: "clock", x: 0, y: 0, w: 4, h: 4 },
    { id: "focus", x: 0, y: 4, w: 4, h: 4 },
    { id: "todo.list", x: 4, y: 0, w: 4, h: 8 },
    { id: "calendar", x: 8, y: 0, w: 4, h: 6 },
    { id: "streak", x: 8, y: 6, w: 4, h: 2 },
    { id: "weather", x: 0, y: 8, w: 6, h: 4 },
    { id: "news", x: 6, y: 8, w: 6, h: 4 },
  ],
  gadget: [
    { id: "clock", x: 0, y: 0, w: 5, h: 4 },
    { id: "ai", x: 5, y: 0, w: 3, h: 7 },
    { id: "moon", x: 8, y: 0, w: 4, h: 4 },
    { id: "worldclock", x: 0, y: 4, w: 5, h: 3 },
    { id: "quote", x: 8, y: 4, w: 4, h: 3 },
    { id: "weather", x: 0, y: 7, w: 6, h: 5 },
    { id: "news", x: 6, y: 7, w: 6, h: 5 },
  ],
};
export const DEFAULT_LAYOUT = LAYOUT_PRESETS.essentials;
