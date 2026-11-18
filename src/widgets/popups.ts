/**
 * Pop-ups of the built-in widgets (enter / double-click on HOME, or
 * `widget <id>`): the widget, bigger and usable. Every button runs a command.
 *
 * The rule: a widget opens a pop-up when there's something useful to do in
 * it; otherwise enter does its action or opens its module. A pop-up always has
 * a way to the full module (`open`).
 */
import { fmt } from "../core/ansi";
import { mix } from "../core/color";
import { BOLD } from "../core/grid";
import { fuzzyFilter } from "../core/fuzzy";
import type { KeyInput } from "../core/input";
import { strWidth } from "../core/unicode";
import type { Deck } from "../deck";
import type { Command } from "../shell/types";
import { q, type UI } from "../ui/ui";
import { basename } from "../vault/paths";
import { currentWeather, isoDay, sky, streakOf } from "./builtin";
import { focus } from "./extra";
import type { PopupContext, WidgetPopupSpec, WidgetSpec } from "./types";

/** A one-line text field for pop-ups (typed text arrives through onText). */
class Field {
  text = "";
  onText(t: string): void {
    this.text += t.replace(/[\r\n]/g, "");
  }
  onKey(k: KeyInput): boolean {
    if (k.combo === "backspace") return (this.text = this.text.slice(0, -1)), true;
    if (k.combo === "ctrl+u") return (this.text = ""), true;
    return false;
  }
  render(ui: UI, x: number, y: number, w: number, placeholder: string): void {
    const c = ui.c;
    ui.fill({ x, y, w, h: 1 }, { bg: c.highlight });
    ui.text(x + 1, y, "❯", { fg: c.accent, bg: c.highlight, attrs: BOLD });
    ui.text(x + 3, y, this.text || placeholder, { fg: this.text ? c.fg : c.faint, bg: c.highlight }, w - 4);
    ui.cursor(x + 3 + Math.min(strWidth(this.text), w - 5), y);
  }
}

const pad2 = (n: number) => String(n).padStart(2, "0");
const mmss = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${pad2(Math.floor(s / 60))}:${pad2(s % 60)}`;
};

/* ─────────── focus: start / pause / reset, durations ─────────── */

const focusPopup: WidgetPopupSpec = {
  title: "focus",
  size: { w: 50, h: 9 },
  hint: "space start/pause · r reset · ←→ focus · ↑↓ break",
  render(ui, r, { deck }) {
    const c = ui.c;
    if (focus.running) ui.animate(250);
    const col = focus.phase === "focus" ? c.accent : c.success;
    const total = (focus.phase === "focus" ? focus.work : focus.rest) * 60_000;
    ui.textCenter(r, r.y + 1, `${focus.phase.toUpperCase()} · ${mmss(focus.left)}`, { fg: col, attrs: BOLD });
    ui.bar(r.x + 4, r.y + 2, r.w - 8, 1 - focus.left / total, col, c.faint);
    let x = r.x + Math.floor((r.w - 36) / 2);
    x += ui.button(x, r.y + 4, focus.running ? "❚❚ pause" : "▶ start", () => {}, { cmd: "focus toggle", tip: "space" }) + 2;
    x += ui.button(x, r.y + 4, "↺ reset", () => {}, { cmd: "focus reset", tip: "r" }) + 2;
    ui.button(x, r.y + 4, "⏭ skip", () => {}, { cmd: "focus skip", tip: "s · next phase" });
    const dur = (y: number, label: string, v: number, key: "work" | "rest") => {
      ui.text(r.x + 6, y, label, { fg: c.muted });
      const step = key === "work" ? 5 : 1;
      ui.button(r.x + 20, y, "−", () => {}, { cmd: `focus set ${key === "work" ? v - step : focus.work} ${key === "rest" ? v - step : focus.rest}` });
      ui.text(r.x + 25, y, `${v} min`, { fg: c.fg, attrs: BOLD });
      ui.button(r.x + 33, y, "+", () => {}, { cmd: `focus set ${key === "work" ? v + step : focus.work} ${key === "rest" ? v + step : focus.rest}` });
    };
    dur(r.y + 6, "focus", focus.work, "work");
    dur(r.y + 7, "break", focus.rest, "rest");
    void deck;
  },
  onText: (t, { deck }) => {
    const cmd = t === " " ? "focus toggle" : t === "r" ? "focus reset" : t === "s" ? "focus skip" : "";
    return cmd ? (void deck.act(cmd), true) : false;
  },
  onAction: (a, { deck }) => {
    const set = (w: number, b: number) => void deck.act(`focus set ${w} ${b}`);
    if (a === "left") return set(focus.work - 5, focus.rest), true;
    if (a === "right") return set(focus.work + 5, focus.rest), true;
    if (a === "down") return set(focus.work, focus.rest - 1), true;
    if (a === "up") return set(focus.work, focus.rest + 1), true;
    return false;
  },
};

export const focusCommand: Command = {
  name: "focus",
  aliases: ["pomodoro"],
  summary: "the focus timer (pomodoro): start, pause, reset, durations",
  usage: "focus                  where it's at\nfocus start | pause | toggle | reset | skip\nfocus set <focus min> [break min]",
  examples: [["focus start", "go"], ["focus set 50 10", "50 minutes of focus, 10 of break"]],
  complete: () => ["start", "pause", "toggle", "reset", "skip", "set"],
  run(ctx) {
    const [a, b, c] = ctx.args;
    const now = Date.now();
    if (focus.running) {
      focus.left -= now - focus.last;
      focus.last = now;
    }
    switch (a) {
      case undefined: break;
      case "start": focus.running = true; focus.last = now; break;
      case "pause": focus.running = false; break;
      case "toggle": focus.running = !focus.running; focus.last = now; break;
      case "reset": focus.running = false; focus.phase = "focus"; focus.left = focus.work * 60_000; break;
      case "skip":
        focus.phase = focus.phase === "focus" ? "break" : "focus";
        focus.left = (focus.phase === "focus" ? focus.work : focus.rest) * 60_000;
        break;
      case "set": {
        const w = Number(b), r = c === undefined ? focus.rest : Number(c);
        if (!(w >= 1 && w <= 180) || !(r >= 1 && r <= 60)) return ctx.err("usage: focus set <1-180> [1-60]\n"), 1;
        const was = focus.phase === "focus" ? focus.work : focus.rest;
        focus.work = w;
        focus.rest = r;
        if (!focus.running && focus.left === was * 60_000) focus.left = (focus.phase === "focus" ? w : r) * 60_000;
        break;
      }
      default: return ctx.err("focus start | pause | toggle | reset | skip | set <min> [min]\n"), 1;
    }
    ctx.out(`${focus.running ? fmt.green("▶") : fmt.yellow("❚❚")} ${focus.phase} ${mmss(focus.left)} ${fmt.dim(`· ${focus.work}/${focus.rest} min`)}\n`);
    ctx.deck.requestFrame();
    return 0;
  },
};

/* ─────────── moon: the next phases ─────────── */

const SYNODIC = 29.530588853;
const moonAge = (t = Date.now()) => (((t / 86400000 - 10957.76) % SYNODIC) + SYNODIC) % SYNODIC;
/** when the moon next reaches `frac` of its cycle (0 new, .25 first quarter, .5 full, .75 last quarter) */
const nextPhase = (frac: number) => {
  const age = moonAge();
  let days = frac * SYNODIC - age;
  if (days <= 0.2) days += SYNODIC;
  return new Date(Date.now() + days * 86400000);
};
const PHASES: [number, string, string][] = [[0, "●", "new moon"], [0.25, "◐", "first quarter"], [0.5, "○", "full moon"], [0.75, "◑", "last quarter"]];

const moonPopup: WidgetPopupSpec = {
  title: "moon",
  size: { w: 46, h: 8 },
  render(ui, r) {
    const c = ui.c;
    const age = moonAge();
    ui.text(r.x + 2, r.y + 1, `day ${age.toFixed(1)} of ${SYNODIC.toFixed(1)}`, { fg: c.fg, attrs: BOLD });
    PHASES.map(([f, g, name]) => ({ g, name, at: nextPhase(f) }))
      .sort((a, b) => a.at.getTime() - b.at.getTime())
      .forEach((p, i) => {
        const y = r.y + 3 + i;
        ui.text(r.x + 2, y, p.g, { fg: mix(c.fg, c.warning, 0.3) });
        ui.text(r.x + 5, y, p.name, { fg: c.fg });
        ui.textRight(r.x + r.w - 2, y, p.at.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" }), { fg: c.accent });
      });
  },
};

export const moonCommand: Command = {
  name: "moon",
  summary: "tonight's moon and the next phases",
  run(ctx) {
    const age = moonAge();
    ctx.out(`${fmt.bold(`day ${age.toFixed(1)}`)} of the lunar cycle\n`);
    for (const [f, g, name] of PHASES) ctx.out(`${g} ${name.padEnd(14)} ${fmt.dim(nextPhase(f).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" }))}\n`);
  },
};

/* ─────────── recent notes: search them ─────────── */

const recentField = new Field();
let recentSel = 0;
const recentList = (deck: Deck) => {
  const notes = [...deck.vault.markdown()].sort((a, b) => b.modified - a.modified);
  return recentField.text ? fuzzyFilter(recentField.text, notes, (n) => n.path, 50) : notes.slice(0, 50);
};
const recentPopup: WidgetPopupSpec = {
  title: "notes",
  size: { w: 64, h: 16 },
  hint: "type to search · ↑↓ · enter opens",
  render(ui, r, { deck }) {
    const c = ui.c;
    recentField.render(ui, r.x + 1, r.y, r.w - 2, "search your notes");
    const list = recentList(deck);
    recentSel = Math.max(0, Math.min(recentSel, list.length - 1));
    list.slice(0, r.h - 2).forEach((n, i) => {
      const y = r.y + 2 + i;
      const row = { x: r.x, y, w: r.w, h: 1 };
      const sel = i === recentSel;
      const bg = sel ? mix(c.accent, c.bg, 0.78) : ui.hovered(row) ? c.highlight : -1;
      if (bg !== -1) ui.fill(row, { bg });
      const st = bg !== -1 ? { bg } : {};
      ui.text(r.x + 2, y, basename(n.path, ".md"), { fg: sel ? c.fg : c.muted, attrs: sel ? BOLD : 0, ...st }, r.w - 24);
      ui.textRight(r.x + r.w - 2, y, n.path.split("/").slice(0, -1).join("/") || "/", { fg: c.faint, ...st });
      ui.hit(row, { cmd: `open ${q(n.path)}`, tip: n.path });
    });
    if (!list.length) ui.text(r.x + 2, r.y + 2, "no match", { fg: c.faint });
  },
  onText: (t) => (recentField.onText(t), (recentSel = 0), true),
  onKey: (k, ctx) => {
    if (recentField.onKey(k)) return (recentSel = 0), true;
    if (k.combo === "enter") return openRecent(ctx), true;
    return false;
  },
  onAction: (a, ctx) => {
    if (a === "up") return (recentSel = Math.max(0, recentSel - 1)), true;
    if (a === "down") return (recentSel += 1), true;
    if (a === "confirm") return openRecent(ctx), true;
    return false;
  },
};
function openRecent({ deck, close }: PopupContext): void {
  const n = recentList(deck)[recentSel];
  if (!n) return;
  close();
  recentField.text = "";
  void deck.act(`open ${q(n.path)}`);
}

/* ─────────── journal streak: the numbers ─────────── */

const streakPopup: WidgetPopupSpec = {
  title: "journal",
  size: { w: 48, h: 9 },
  render(ui, r, { deck }) {
    const c = ui.c;
    const days = deck.vault.journalDates();
    const sorted = [...days].sort();
    let best = 0, run = 0, prev = "";
    for (const d of sorted) {
      const p = new Date(`${d}T12:00`);
      p.setDate(p.getDate() - 1);
      run = prev === isoDay(p) ? run + 1 : 1;
      best = Math.max(best, run);
      prev = d;
    }
    const now = new Date();
    const ym = isoDay(now).slice(0, 7);
    const stats: [string, string][] = [
      ["current streak", `${streakOf(days)} days`],
      ["longest streak", `${best} days`],
      ["this month", `${sorted.filter((d) => d.startsWith(ym)).length} entries`],
      ["all time", `${sorted.length} entries`],
      ["first entry", sorted[0] ?? "—"],
    ];
    stats.forEach(([k, v], i) => {
      ui.text(r.x + 3, r.y + 1 + i, k, { fg: c.muted });
      ui.textRight(r.x + r.w - 3, r.y + 1 + i, v, { fg: c.fg, attrs: BOLD });
    });
    ui.button(r.x + 3, r.y + r.h - 1, "today's journal", () => {}, { cmd: "journal", tip: "journal" });
  },
};

/* ─────────── weather: the week ─────────── */

const SKY: Record<string, string> = { sun: "☼", partly: "⛅", cloud: "☁", rain: "☂", snow: "❄", storm: "ϟ", fog: "≋" };
const weatherPopup: WidgetPopupSpec = {
  title: "weather",
  size: { w: 56, h: 13 },
  hint: "c: city",
  render(ui, r, { deck }) {
    const c = ui.c;
    const w = currentWeather();
    if (!w) return void ui.text(r.x + 2, r.y + 1, "no forecast yet (location: setup or config set home.weatherCity)", { fg: c.muted }, r.w - 4);
    ui.text(r.x + 2, r.y, w.place, { fg: c.fg, attrs: BOLD });
    ui.textRight(r.x + r.w - 2, r.y, `${Math.round(w.temp)}° · feels ${Math.round(w.feels)}° · ${w.humidity}% · wind ${Math.round(w.wind)} km/h`, { fg: c.muted });
    ui.text(r.x + 2, r.y + 1, `sunrise ${w.sunrise} · sunset ${w.sunset} · rain ${w.rainChance}%`, { fg: c.subtle });
    const lo = Math.min(...w.days.map((d) => d.min)), hi = Math.max(...w.days.map((d) => d.max));
    const span = Math.max(1, hi - lo), barW = Math.max(6, r.w - 30);
    w.days.slice(0, r.h - 4).forEach((d, i) => {
      const y = r.y + 3 + i;
      ui.text(r.x + 2, y, new Date(`${d.date}T12:00`).toLocaleDateString(undefined, { weekday: "short", day: "numeric" }), { fg: c.muted });
      ui.text(r.x + 12, y, SKY[sky(d.code)] ?? "·", { fg: c.warning });
      ui.textRight(r.x + 19, y, `${Math.round(d.min)}°`, { fg: c.info });
      const a = Math.round(((d.min - lo) / span) * barW), b = Math.max(a + 1, Math.round(((d.max - lo) / span) * barW));
      ui.text(r.x + 21, y, "─".repeat(barW), { fg: c.faint });
      ui.text(r.x + 21 + a, y, "━".repeat(b - a), { fg: mix(c.info, c.warning, (d.max - lo) / span) });
      ui.text(r.x + 22 + barW, y, `${Math.round(d.max)}°`, { fg: c.warning });
    });
    void deck;
  },
  onText: (t, { deck }) => {
    if (t !== "c") return false;
    void deck.prompt("Weather city (when your location isn't set)", { initial: deck.settings.data.home.weatherCity }).then((v) => {
      if (v?.trim()) void deck.act(`config set home.weatherCity ${q(v.trim())}`);
    });
    return true;
  },
};

/* ─────────── news: pick the topic ─────────── */

const newsPopup: WidgetPopupSpec = {
  title: "news",
  size: { w: 56, h: 6 },
  hint: "t: topic · - : back to your area",
  render(ui, r, { deck }) {
    const c = ui.c;
    const topic = deck.settings.data.home.newsTopic;
    ui.text(r.x + 2, r.y + 1, "following:", { fg: c.muted });
    ui.text(r.x + 14, r.y + 1, topic || "your area (top stories)", { fg: c.fg, attrs: BOLD }, r.w - 16);
    let x = r.x + 2;
    x += ui.button(x, r.y + 3, "change topic", () => void askTopic(deck), { tip: "t · news topic <words>" }) + 2;
    x += ui.button(x, r.y + 3, "my area", () => {}, { cmd: "news topic -", tip: "-" }) + 2;
    ui.button(x, r.y + 3, "refresh", () => {}, { cmd: "news refresh" });
  },
  onText: (t, { deck }) => (t === "t" ? (void askTopic(deck), true) : t === "-" ? (void deck.act("news topic -"), true) : false),
};
async function askTopic(deck: Deck): Promise<void> {
  const v = await deck.prompt("News topic", { initial: deck.settings.data.home.newsTopic, placeholder: "space, intelligence artificielle, F1…" });
  if (v !== null) void deck.act(v.trim() ? `news topic ${v.trim()}` : "news topic -");
}

/* ─────────── wiring ─────────── */

const POPUPS: Record<string, { popup?: WidgetPopupSpec; open?: string }> = {
  focus: { popup: focusPopup },
  moon: { popup: moonPopup },
  recent: { popup: recentPopup },
  streak: { popup: streakPopup, open: "journal" },
  weather: { popup: weatherPopup },
  news: { popup: newsPopup },
  calendar: { open: "cal open" },
  system: { open: "launch sysmon" },
  modules: { open: "launch modules" },
  ai: { open: "launch link" },
};

/** Give the built-in widgets their pop-ups and modules. */
export function withPopups(specs: WidgetSpec[]): WidgetSpec[] {
  return specs.map((s) => (POPUPS[s.id] ? { ...s, ...POPUPS[s.id] } : s));
}

export const popupCommands: Command[] = [focusCommand, moonCommand];
