import { BOLD, DIM, type Rect } from "../core/grid";
import type { SystemStats } from "../platform/types";
import { strWidth } from "../core/unicode";
import { basename } from "../vault/paths";
import type { WidgetPlacement, WidgetSpec } from "./types";

/* ───────────────────────── clock ───────────────────────── */

/** 3×3 digits drawn with box-drawing lines (rendered as crisp rectangles). */
const DIGITS: Record<string, string[]> = {
  "0": ["┏━┓", "┃ ┃", "┗━┛"],
  "1": ["╺┓ ", " ┃ ", "╺┻╸"],
  "2": ["┏━┓", "┏━┛", "┗━╸"],
  "3": ["┏━┓", " ━┫", "┗━┛"],
  "4": ["╻ ╻", "┗━┫", "  ╹"],
  "5": ["┏━╸", "┗━┓", "┗━┛"],
  "6": ["┏━╸", "┣━┓", "┗━┛"],
  "7": ["╺━┓", "  ┃", "  ╹"],
  "8": ["┏━┓", "┣━┫", "┗━┛"],
  "9": ["┏━┓", "┗━┫", "┗━┛"],
  ":": [" ", "╏", " "],
};

export function bigDigits(s: string): string[] {
  const rows = ["", "", ""];
  [...s].forEach((ch, i) => {
    const g = DIGITS[ch] ?? [" ", " ", " "];
    for (let r = 0; r < 3; r++) rows[r] += (i ? " " : "") + g[r];
  });
  return rows;
}

const clock: WidgetSpec = {
  id: "clock",
  title: "clock",
  description: "time and date",
  size: { w: 4, h: 4 },
  min: { w: 2, h: 2 },
  render(ui, r, { deck }) {
    const c = ui.c;
    const now = new Date();
    const locale = deck.settings.data.user.locale || undefined;
    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");
    const ss = String(now.getSeconds()).padStart(2, "0");
    const big = bigDigits(`${hh}:${mm}`);
    const date = now.toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long" });
    if (r.h >= 4 && r.w >= strWidth(big[0]) + 4) {
      const top = r.y + Math.max(0, Math.floor((r.h - 4) / 2));
      const x = r.x + Math.floor((r.w - strWidth(big[0]) - 3) / 2);
      big.forEach((line, i) => ui.gradientText(x, top + i, line, ui.theme.gradient, 0));
      ui.text(x + strWidth(big[0]) + 1, top + 2, ss, { fg: c.subtle });
      ui.textCenter(r, top + 3, date, { fg: c.muted });
    } else {
      ui.textCenter(r, r.y + Math.floor((r.h - 1) / 2), `${hh}:${mm}:${ss}`, { fg: c.accent, attrs: BOLD });
      if (r.h >= 2) ui.textCenter(r, r.y + Math.floor((r.h - 1) / 2) + 1, date, { fg: c.muted });
    }
    ui.animate(1000 - (Date.now() % 1000));
  },
};

/* ───────────────────────── calendar ───────────────────────── */

const calendar: WidgetSpec = {
  id: "calendar",
  title: "calendar",
  description: "this month, journal days lit",
  size: { w: 4, h: 6 },
  min: { w: 3, h: 5 },
  render(ui, r, { deck }) {
    const c = ui.c;
    const locale = deck.settings.data.user.locale || undefined;
    const now = new Date();
    const first = new Date(now.getFullYear(), now.getMonth(), 1);
    const gx = r.x + Math.max(0, Math.floor((r.w - 20) / 2));
    ui.textCenter(r, r.y, first.toLocaleDateString(locale, { month: "long", year: "numeric" }), { fg: c.fg, attrs: BOLD });
    const names = [...Array(7)].map((_, i) => new Date(2024, 0, 1 + i).toLocaleDateString(locale, { weekday: "short" }).slice(0, 2));
    names.forEach((n, i) => ui.text(gx + i * 3, r.y + 1, n, { fg: i >= 5 ? c.accentAlt : c.subtle }));
    const entries = deck.vault.journalDates();
    const offset = (first.getDay() + 6) % 7;
    const days = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    for (let d = 1; d <= days; d++) {
      const cell = offset + d - 1;
      const y = r.y + 2 + Math.floor(cell / 7);
      if (y >= r.y + r.h) break;
      const has = entries.has(`${ym}-${String(d).padStart(2, "0")}`);
      const today = d === now.getDate();
      ui.text(gx + (cell % 7) * 3, y, String(d).padStart(2), today ? { fg: c.panel, bg: c.accent, attrs: BOLD } : { fg: has ? c.accent : c.muted, attrs: has ? BOLD : 0 });
    }
  },
  activate: ({ deck }) => void deck.openApp("journal"),
};

/* ───────────────────────── weather ───────────────────────── */

interface Weather {
  city: string;
  temp: number;
  code: number;
  wind: number;
  days: { max: number; min: number; code: number; date: string }[];
  at: number;
}

let weather: Weather | null = null;
let weatherError: string | null = null;
let weatherLoading = false;
let weatherFor = "";

async function loadWeather(city: string): Promise<void> {
  weatherLoading = true;
  weatherFor = city;
  try {
    const geo = await (await fetch(`https://geocoding-api.open-meteo.com/v1/search?count=1&name=${encodeURIComponent(city)}`)).json();
    const place = geo.results?.[0];
    if (!place) throw new Error(`unknown city “${city}”`);
    const q = `latitude=${place.latitude}&longitude=${place.longitude}&current=temperature_2m,weather_code,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min,weather_code&forecast_days=4&timezone=auto`;
    const f = await (await fetch(`https://api.open-meteo.com/v1/forecast?${q}`)).json();
    weather = {
      city: place.name,
      temp: f.current.temperature_2m,
      code: f.current.weather_code,
      wind: f.current.wind_speed_10m,
      days: (f.daily.time as string[]).slice(1).map((date, i) => ({
        date,
        max: f.daily.temperature_2m_max[i + 1],
        min: f.daily.temperature_2m_min[i + 1],
        code: f.daily.weather_code[i + 1],
      })),
      at: Date.now(),
    };
    weatherError = null;
  } catch (e) {
    weatherError = e instanceof Error ? e.message : String(e);
  } finally {
    weatherLoading = false;
  }
}

type Sky = "sun" | "partly" | "cloud" | "fog" | "rain" | "snow" | "storm";
function sky(code: number): Sky {
  if (code === 0 || code === 1) return "sun";
  if (code === 2) return "partly";
  if (code === 3) return "cloud";
  if (code === 45 || code === 48) return "fog";
  if (code >= 95) return "storm";
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "snow";
  return "rain";
}
const SKY_LABEL: Record<Sky, string> = { sun: "clear", partly: "partly cloudy", cloud: "overcast", fog: "fog", rain: "rain", snow: "snow", storm: "thunderstorm" };
// plain ASCII: always in the font, never a missing-glyph box
const SKY_ICON: Record<Sky, string> = { sun: "*", partly: "*~", cloud: "~~", fog: "==", rain: "//", snow: "**", storm: "/!" };
const SKY_ART: Record<Sky, string[]> = {
  sun: ["  \\   /  ", "   .-.   ", "― (   ) ―", "   `-'   ", "  /   \\  "],
  partly: ["  \\  /   ", "_ /\"\".-. ", "  \\_(   ).", "  /(___(__)", "          "],
  cloud: ["          ", "    .--.  ", " .-(    ). ", "(___.__)__)", "          "],
  fog: ["          ", " _ - _ - _ ", "  _ - _ - ", " _ - _ - _ ", "          "],
  rain: ["    .-.   ", "   (   ). ", "  (___(__)", "   ' ' ' '", "  ' ' ' ' "],
  snow: ["    .-.   ", "   (   ). ", "  (___(__)", "   *  *  *", "  *  *  * "],
  storm: ["    .-.   ", "   (   ). ", "  (___(__)", "   /_ ' /_ ", "    /  '/ "],
};

const weatherWidget: WidgetSpec = {
  id: "weather",
  title: "weather",
  description: "current weather + 3 days (open-meteo.com)",
  size: { w: 4, h: 5 },
  min: { w: 3, h: 3 },
  render(ui, r, { deck }) {
    const c = ui.c;
    const city = deck.settings.data.home.weatherCity;
    if (!city) {
      ui.textCenter(r, r.y + 1, "no city set", { fg: c.muted });
      ui.textCenter(r, r.y + 2, "config set home.weatherCity Paris", { fg: c.faint });
      return;
    }
    const stale = !weather || weatherFor !== city || Date.now() - weather.at > 15 * 60_000;
    if (stale && !weatherLoading && !(weatherError && weatherFor === city)) void loadWeather(city).then(() => deck.requestFrame());
    if (!weather || weatherFor !== city) {
      ui.textCenter(r, r.y + 1, weatherError ? `⚠ ${weatherError}` : `${ui.spinner()} contacting the sky…`, { fg: weatherError ? c.error : c.muted });
      if (!weatherError) ui.animate(80);
      return;
    }
    const w = weather;
    const s = sky(w.code);
    const art = SKY_ART[s];
    const artColor = s === "sun" ? c.warning : s === "storm" ? c.accentAlt : c.info;
    const showArt = r.w >= 26 && r.h >= 5;
    const tx = showArt ? r.x + 13 : r.x + 1;
    if (showArt) art.forEach((line, i) => ui.text(r.x + 1, r.y + i, line, { fg: artColor }, 12));
    ui.text(tx, r.y, w.city, { fg: c.fg, attrs: BOLD }, r.x + r.w - tx);
    ui.text(tx, r.y + 1, `${Math.round(w.temp)}°C`, { fg: c.accent, attrs: BOLD });
    ui.text(tx, r.y + 2, SKY_LABEL[s], { fg: c.muted }, r.x + r.w - tx);
    ui.text(tx, r.y + 3, `wind ${Math.round(w.wind)} km/h`, { fg: c.subtle }, r.x + r.w - tx);
    const fy = r.y + (showArt ? 6 : 5);
    if (fy < r.y + r.h) {
      const locale = deck.settings.data.user.locale || undefined;
      const colW = Math.floor((r.w - 2) / w.days.length);
      w.days.forEach((d, i) => {
        const x = r.x + 1 + i * colW;
        const day = new Date(`${d.date}T12:00`).toLocaleDateString(locale, { weekday: "short" });
        ui.text(x, fy, `${day} ${SKY_ICON[sky(d.code)]}`, { fg: c.subtle }, colW - 1);
        if (fy + 1 < r.y + r.h) ui.text(x, fy + 1, `${Math.round(d.max)}°/${Math.round(d.min)}°`, { fg: c.muted }, colW - 1);
      });
    }
  },
  activate: () => {
    weather = null;
    weatherError = null;
  },
};

/* ───────────────────────── system ───────────────────────── */

let stats: SystemStats | null = null;
let statsAt = 0;

const system: WidgetSpec = {
  id: "system",
  title: "system",
  description: "cpu and memory",
  size: { w: 4, h: 2 },
  min: { w: 4, h: 2 },
  render(ui, r, { deck }) {
    const c = ui.c;
    if (Date.now() - statsAt > 2000) {
      statsAt = Date.now();
      void deck.platform.system.stats().then((s) => {
        stats = s;
        deck.requestFrame();
      }).catch(() => {});
    }
    ui.animate(2000);
    if (!stats) return void ui.text(r.x + 1, r.y, ui.spinner(), { fg: c.muted });
    const mem = stats.memTotal ? stats.memUsed / stats.memTotal : 0;
    if (r.h === 1) {
      const half = Math.floor(r.w / 2);
      const bw1 = Math.max(3, half - 11);
      ui.text(r.x + 1, r.y, "cpu", { fg: c.subtle });
      ui.bar(r.x + 5, r.y, bw1, stats.cpu / 100, c.accent, c.faint);
      ui.text(r.x + 6 + bw1, r.y, `${Math.round(stats.cpu)}%`.padStart(4), { fg: c.fg });
      ui.text(r.x + half + 1, r.y, "mem", { fg: c.subtle });
      ui.bar(r.x + half + 5, r.y, bw1, mem, c.accentAlt, c.faint);
      ui.text(r.x + half + 6 + bw1, r.y, `${Math.round(mem * 100)}%`.padStart(4), { fg: c.fg });
      return;
    }
    const bw = Math.max(4, r.w - 12);
    ui.text(r.x + 1, r.y, "cpu", { fg: c.subtle });
    ui.bar(r.x + 5, r.y, bw, stats.cpu / 100, c.accent, c.faint);
    ui.textRight(r.x + r.w - 1, r.y, `${Math.round(stats.cpu)}%`, { fg: c.fg });
    if (r.h > 1) {
      ui.text(r.x + 1, r.y + 1, "mem", { fg: c.subtle });
      ui.bar(r.x + 5, r.y + 1, bw, mem, c.accentAlt, c.faint);
      ui.textRight(r.x + r.w - 1, r.y + 1, `${Math.round(mem * 100)}%`, { fg: c.fg });
    }
  },
  activate: ({ deck }) => void deck.openApp("sysmon"),
};

/* ───────────────────────── recent notes ───────────────────────── */

const recent: WidgetSpec = {
  id: "recent",
  title: "recent",
  description: "last edited notes",
  size: { w: 6, h: 4 },
  min: { w: 3, h: 2 },
  render(ui, r, { deck }) {
    const c = ui.c;
    const notes = [...deck.vault.markdown()].sort((a, b) => b.modified - a.modified).slice(0, r.h);
    if (!notes.length) return void ui.text(r.x + 1, r.y, "no notes yet", { fg: c.muted });
    notes.forEach((e, i) => {
      const row: Rect = { x: r.x, y: r.y + i, w: r.w, h: 1 };
      const hot = ui.hovered(row);
      ui.text(r.x + 1, row.y, `${hot ? "▸" : "·"} ${basename(e.path, ".md")}`, { fg: hot ? c.accent : c.fg }, r.w - 10);
      ui.textRight(r.x + r.w - 1, row.y, ago(e.modified), { fg: c.faint, attrs: DIM });
      ui.hit(row, { onClick: () => void deck.openFile(e.path) });
    });
  },
};

function ago(ms: number): string {
  const s = (Date.now() - ms) / 1000;
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

/* ───────────────────────── modules shortcut ───────────────────────── */

const modules: WidgetSpec = {
  id: "modules",
  title: "modules",
  description: "quick launch for apps and plugins",
  size: { w: 6, h: 4 },
  min: { w: 3, h: 2 },
  render(ui, r, { deck }) {
    const c = ui.c;
    const specs = deck.apps.list().filter((s) => s.launcher);
    const colW = Math.max(14, Math.floor(r.w / Math.max(1, Math.floor(r.w / 18))));
    const perRow = Math.max(1, Math.floor(r.w / colW));
    const items = [...specs.map((s) => ({ icon: s.icon ?? "◇", title: s.title, run: () => void deck.openApp(s.kind) })), { icon: "▦", title: "all modules", run: () => void deck.openApp("modules") }];
    items.forEach((it, i) => {
      const x = r.x + 1 + (i % perRow) * colW;
      const y = r.y + Math.floor(i / perRow);
      if (y >= r.y + r.h) return;
      const rect = { x, y, w: colW - 1, h: 1 };
      const hot = ui.hovered(rect);
      ui.text(x, y, `${it.icon} ${it.title.toLowerCase()}`, { fg: hot ? c.accent : c.fg }, colW - 1);
      ui.hit(rect, { onClick: it.run });
    });
  },
  activate: ({ deck }) => void deck.openApp("modules"),
};

export const BUILTIN_WIDGETS: WidgetSpec[] = [clock, weatherWidget, calendar, system, recent, modules];

export const DEFAULT_LAYOUT: WidgetPlacement[] = [
  { id: "clock", x: 0, y: 0, w: 4, h: 4 },
  { id: "system", x: 0, y: 4, w: 4, h: 2 },
  { id: "weather", x: 4, y: 0, w: 4, h: 6 },
  { id: "calendar", x: 8, y: 0, w: 4, h: 6 },
  { id: "recent", x: 0, y: 6, w: 6, h: 4 },
  { id: "modules", x: 6, y: 6, w: 6, h: 4 },
];

