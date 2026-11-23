import { setWidgetSetting, widgetConfig, widgetTarget } from "./instances";
import { Row } from "../ui/layout";
import { checkbox, choice } from "../ui/controls";
import { parseTimer, clockState, dur, soonestTimer, swNow, type ClockTimer } from "./clockstate";
import { followedCats, followedWords, hasArea, NEWS_CATEGORIES, sourceLabel, widgetSource, type NewsSource } from "./news";
import { clockCommand } from "./clockfaces";
import { t, dateLocale } from "../core/i18n";
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
import { wrapWords } from "../core/unicode";
import type { Deck } from "../deck";
import type { Command } from "../shell/types";
import { q } from "../ui/ui";
import { basename } from "../vault/paths";
import { currentWeather, sky } from "./builtin";
import { isoDay, mmss, streakOf } from "../core/time";
import { focus, MATRIX_SETS, matrixLook, tickFocus, uplinkLook } from "./extra";
import type { PopupContext, WidgetPopupSpec, WidgetSpec } from "./types";
import { Field } from "../ui/field";
import { drawMoon } from "./moondraw";
import { moonAge, moonLit, phaseName, SYNODIC, upcoming } from "./moonphase";
import { chatPopup } from "./chatbox";
import { DURATIONS, NEWS_TOPICS, places } from "../core/suggest";
import { Bar, GAP, INSET, SECTION, stack } from "../ui/layout";
import { drawSky, sceneFor } from "../apps/weathersky";
import { dayShort, dayLong } from "../core/dates";


/* ─────────── focus: start / pause / reset, durations ─────────── */

const focusPopup: WidgetPopupSpec = {
  title: t("focus"),
  size: { w: 50, h: 9 },
  hint: "space start/pause · r reset · ←→ focus · ↑↓ break",
  render(ui, r) {
    const c = ui.c;
    if (focus.running) ui.animate(250);
    const col = focus.phase === "focus" ? c.accent : c.success;
    const total = (focus.phase === "focus" ? focus.work : focus.rest) * 60_000;
    ui.textCenter(r, r.y + 1, `${focus.phase.toUpperCase()} · ${mmss(focus.left)}`, { fg: col, attrs: BOLD });
    ui.bar(r.x + 4, r.y + 2, r.w - 8, 1 - focus.left / total, col, c.faint);
    let x = r.x + Math.floor((r.w - 36) / 2);
    x += ui.button(x, r.y + 4, focus.running ? "❚❚ pause" : t("▶ start"), () => {}, { cmd: "focus toggle", tip: "space" }) + 2;
    x += ui.button(x, r.y + 4, t("↺ reset"), () => {}, { cmd: "focus reset", tip: "r" }) + 2;
    ui.button(x, r.y + 4, t("⏭ skip"), () => {}, { cmd: "focus skip", tip: "s · next phase" });
    const dur = (y: number, label: string, v: number, key: "work" | "rest") => {
      ui.text(r.x + 6, y, label, { fg: c.muted });
      const step = key === "work" ? 5 : 1;
      ui.button(r.x + 20, y, "−", () => {}, { cmd: `focus set ${key === "work" ? v - step : focus.work} ${key === "rest" ? v - step : focus.rest}` });
      ui.text(r.x + 25, y, `${v} min`, { fg: c.fg, attrs: BOLD });
      ui.button(r.x + 33, y, "+", () => {}, { cmd: `focus set ${key === "work" ? v + step : focus.work} ${key === "rest" ? v + step : focus.rest}` });
    };
    dur(r.y + 6, t("focus"), focus.work, "work");
    dur(r.y + 7, t("break"), focus.rest, "rest");
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
  name: t("focus"),
  aliases: ["pomodoro"],
  summary: "the focus timer (pomodoro): start, pause, reset, durations",
  usage: "focus                  where it's at\nfocus start | pause | toggle | reset | skip\nfocus set <focus min> [break min]\nfocus task <what>      what you're working on\nfocus open             the FOCUS app",
  examples: [["focus start", "go"], ["focus set 50 10", "50 minutes of focus, 10 of break"]],
  complete: () => ["start", "pause", "toggle", "reset", "skip", "set", "task", "open"],
  run(ctx) {
    const [a, b, c] = ctx.args;
    const now = Date.now();
    if (focus.running) {
      focus.left -= now - focus.last;
      focus.last = now;
    }
    switch (a) {
      case undefined: break;
      case "task": focus.task = ctx.args.slice(1).join(" "); break;
      case "start": focus.running = true; focus.last = now; break;
      case "pause": focus.running = false; break;
      case "open": return void ctx.deck.openApp("focus"), 0;
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
    tickFocus(ctx.deck);
    ctx.out(`${focus.running ? fmt.green("▶") : fmt.yellow("❚❚")} ${focus.phase} ${mmss(focus.left)} ${fmt.dim(`· ${focus.work}/${focus.rest} min`)}${focus.task ? ` · ${focus.task}` : ""}\n`);
    ctx.deck.requestFrame();
    return 0;
  },
};

/* ─────────── moon: the next phases ─────────── */

// the moon's phase is computed in moonphase.ts (the MOON page, its widget, this pop-up, `moon`)
const moonPopup: WidgetPopupSpec = {
  title: "moon",
  size: { w: 50, h: 10 },
  hint: "enter: the MOON page",
  render(ui, r) {
    const c = ui.c;
    const now = Date.now();
    const mw = Math.min(Math.ceil((r.h - 1) / ui.cellAspect), Math.floor(r.w / 3));
    drawMoon(ui, { x: r.x + INSET, y: r.y, w: mw, h: r.h - 1 }, now);
    const x = r.x + INSET + mw + GAP, w = r.x + r.w - INSET - x;
    ui.text(x, r.y, t(phaseName(now)), { fg: c.fg, attrs: BOLD }, w);
    ui.text(x, r.y + 1, `${t("{n} % lit", { n: Math.round(moonLit(now) * 100) })} · ${t("day {d} of {all}", { d: moonAge(now).toFixed(1), all: SYNODIC.toFixed(1) })}`, { fg: c.muted }, w);
    upcoming(now).forEach((p, i) => {
      const y = r.y + 3 + i;
      if (y >= r.y + r.h) return;
      ui.text(x, y, `${p.glyph} ${t(p.name)}`, { fg: c.fg }, w - 12);
      ui.textRight(x + w, y, dayShort(p.at, dateLocale()), { fg: c.accent });
    });
  },
  onAction: (a, { deck }) => (a === "confirm" ? (deck.openApp("moon"), true) : false),
};

export const moonCommand: Command = {
  name: "moon",
  summary: "tonight's moon and the next phases (moon open: the MOON page)",
  usage: "moon         the phase, how much is lit, the next four phases\nmoon open    the MOON page (the moon drawn, the month in moons)",
  run(ctx) {
    if (ctx.args[0] === "open") return void ctx.deck.openApp("moon");
    const now = Date.now();
    ctx.out(`${fmt.bold(phaseName(now))} · ${Math.round(moonLit(now) * 100)}% lit · day ${moonAge(now).toFixed(1)} of ${SYNODIC.toFixed(1)}\n`);
    for (const p of upcoming(now)) ctx.out(`${p.glyph} ${p.name.padEnd(14)} ${fmt.dim(dayShort(p.at, dateLocale()))}\n`);
  },
};

/* ─────────── recent notes: search them ─────────── */

const recentField = new Field({ icon: "❯" });
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
    recentField.render(ui, { x: r.x + 1, y: r.y, w: r.w - 2, h: 1 }, { focused: true, placeholder: t("search your notes") });
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
    if (!list.length) ui.text(r.x + 2, r.y + 2, t("no match"), { fg: c.subtle });
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
      [t("current streak"), `${streakOf(days)} days`],
      [t("longest streak"), `${best} days`],
      [t("this month"), `${sorted.filter((d) => d.startsWith(ym)).length} entries`],
      [t("all time"), `${sorted.length} entries`],
      [t("first entry"), sorted[0] ?? "—"],
    ];
    stats.forEach(([k, v], i) => {
      ui.text(r.x + 3, r.y + 1 + i, k, { fg: c.muted });
      ui.textRight(r.x + r.w - 3, r.y + 1 + i, v, { fg: c.fg, attrs: BOLD });
    });
    ui.button(r.x + 3, r.y + r.h - 1, t("today's journal"), () => {}, { cmd: "journal", tip: "journal" });
  },
};

/* ─────────── weather: the week ─────────── */

const SKY: Record<string, string> = { sun: "☼", partly: "◐", cloud: "☁", rain: "☂", snow: "❄", storm: "ϟ", fog: "≋" };
const weatherPopup: WidgetPopupSpec = {
  title: "weather",
  size: { w: 60, h: 16 },
  hint: "c: city",
  render(ui, r, { deck, key }) {
    const c = ui.c;
    const w = currentWeather(widgetConfig(deck, key, "city", ""));
    // (wrapped: on one line it was cut at both ends while it scrolled)
    if (!w) return void wrapWords("no forecast yet — location: setup, or config set home.weatherCity <city>", r.w - INSET * 4).forEach((l, i) => ui.text(r.x + INSET * 2, r.y + 1 + i, l, { fg: c.muted }));
    // the sky (the WEATHER page's, apps/weathersky.ts) with the place and the temperature on it,
    // the details under it, then the week: each day's range on the week's scale
    const [skyR, detR, weekR] = stack(r, [
      { min: 3, h: 5, priority: 6 },
      { h: 1, priority: 8 },
      { min: 2, fill: 1, priority: 9 },
    ], 0);
    if (skyR) {
      const scene = sceneFor(w.code, { isDay: w.isDay, wind: w.wind, windDir: w.windDir, rain: w.rainChance });
      ui.clip(skyR, () => ui.art(() => drawSky(ui, skyR, scene, ui.now / 1000)));
      new Bar(ui, skyR.x + INSET * 2, skyR.y, skyR.x + skyR.w - INSET * 2)
        .text(w.place, { fg: c.fg, attrs: BOLD }, { priority: 7, fit: 6 })
        .text(`${Math.round(w.temp)}°`, { fg: c.accent, attrs: BOLD }, { side: "right", priority: 9 })
        .draw();
    }
    if (detR) {
      new Bar(ui, detR.x + INSET * 2, detR.y, detR.x + detR.w - INSET * 2)
        .text(`${t("feels")} ${Math.round(w.feels)}°`, { fg: c.subtle }, { priority: 7 })
        .text(`${t("wind")} ${Math.round(w.wind)} km/h`, { fg: c.subtle }, { priority: 5 })
        .text(`☂ ${w.rainChance}%`, { fg: mix(0x7fb4ea, c.bg, 0.2) }, { priority: 8 })
        .text(`${w.humidity}%rh`, { fg: c.subtle }, { priority: 3 })
        .text(`↑${w.sunrise} ↓${w.sunset}`, { fg: c.subtle }, { side: "right", priority: 4 })
        .draw();
    }
    if (!weekR) return;
    const lo = Math.min(...w.days.map((d) => d.min)), hi = Math.max(...w.days.map((d) => d.max));
    const span = Math.max(1, hi - lo);
    const x0 = weekR.x + INSET * 2, x1 = weekR.x + weekR.w - INSET * 2;
    const DAY = 9, GLY = 2, LO = 4, HI = 4;
    const barX = x0 + DAY + GLY + LO + 1, barW = Math.max(4, x1 - barX - HI - 1);
    w.days.slice(0, weekR.h).forEach((d, i) => {
      const y = weekR.y + i;
      const k = sky(d.code);
      ui.text(x0, y, new Date(`${d.date}T12:00`).toLocaleDateString(dateLocale(), { weekday: "short", day: "numeric" }), { fg: c.muted }, DAY - 1);
      ui.text(x0 + DAY, y, SKY[k] ?? "·", { fg: k === "sun" || k === "partly" ? c.warning : k === "snow" ? c.fg : mix(0x7fb4ea, c.bg, 0.15) });
      ui.textRight(barX - 1, y, `${Math.round(d.min)}°`, { fg: mix(0x7fb4ea, c.bg, 0.1) });
      const a = Math.round(((d.min - lo) / span) * barW), b = Math.max(a + 1, Math.round(((d.max - lo) / span) * barW));
      ui.text(barX, y, "─".repeat(barW), { fg: c.faint });
      ui.text(barX + a, y, "━".repeat(Math.min(barW - a, b - a)), { fg: mix(0x7fb4ea, 0xffcf5a, (d.max - lo) / span) });
      ui.text(barX + barW + 1, y, `${Math.round(d.max)}°`, { fg: 0xffcf5a }, HI);
    });
  },
  onText: (t, { deck, key }) => {
    if (t !== "c") return false;
    // this copy's own city (empty: back to where you are)
    void deck.prompt("This widget's city (empty: where you are)", { initial: widgetConfig(deck, key, "city", ""), placeholder: "Tokyo", suggestions: places(deck) }).then((v) => {
      if (v !== null) setWidgetSetting(deck, "weather", "city", v.trim());
    });
    return true;
  },
};

/* ─────────── news: what this widget shows ─────────── */

const newsPopup: WidgetPopupSpec = {
  title: "news",
  size: { w: 66, h: 14 },
  hint: "what this widget shows · its look · w: your own words",
  render(ui, r, { deck, key }) {
    const c = ui.c;
    // ONE question: what does this widget show? (the user's choice "A": widgets/news.ts)
    const src = widgetSource(deck, key);
    const mode = widgetConfig<string>(deck, key, "mode", "list");
    const x0 = r.x + INSET * 2, x1 = r.x + r.w - INSET * 2;
    let y = r.y;
    ui.text(x0, y++, t("THIS WIDGET SHOWS"), { fg: c.title, attrs: BOLD });
    const row = new Bar(ui, x0, y++, x1);
    const pick = (kind: NewsSource["kind"], label: string, cmd: () => void, tip: string) => row.button(label, cmd, { selected: src.kind === kind, tip }, { priority: 5 });
    // no place set: "your area" is your country — only ⚑ then (lit for either)
    if (hasArea(deck)) pick("area", `⌖ ${sourceLabel(deck, { kind: "area" })}`, () => void deck.act("news show area"), t("your area (location: setup)"));
    else row.button(`⚑ ${sourceLabel(deck, { kind: "country" })}`, () => void deck.act("news show country"), { selected: src.kind === "area" || src.kind === "country", tip: t("your country's top stories · set your place (setup) for your area's") }, { priority: 5 });
    if (hasArea(deck)) pick("country", `⚑ ${sourceLabel(deck, { kind: "country" })}`, () => void deck.act("news show country"), t("your country's top stories"));
    pick("cats", `▦ ${t("categories")}`, () => void (src.kind !== "cats" && deck.act(`news show ${(followedCats(deck).length ? followedCats(deck) : ["world"]).join(" ")}`)), t("the categories you tick, woven together"));
    pick("topic", `❝ ${t("your own words")}`, () => void askWords(deck, src), "w");
    row.draw();
    y += SECTION;
    if (src.kind === "cats") {
      // tick them on and off (the last one off: back to your area)
      ui.text(x0, y++, t("its categories (click to switch one):"), { fg: c.muted }, x1 - x0);
      let x = x0;
      for (const [id, cat] of Object.entries(NEWS_CATEGORIES)) {
        const label = t(cat.label);
        const w = label.length + GAP;
        if (x + w > x1) (x = x0), y++;
        const on = src.cats.includes(id);
        // the same look as the NEWS page's chips (the ones not ticked: quiet)
        ui.button(x, y, label, () => {}, { cmd: `news show ${on ? "-" : "+"}${id}`, selected: on, quiet: !on, tip: on ? t("click: not this one") : t("click: this one too") });
        x += w + INSET;
      }
      y++;
    } else if (src.kind === "topic") {
      const x = ui.text(x0, y, `“${src.words}”`, { fg: c.fg, attrs: BOLD }, x1 - x0 - 12) + GAP;
      ui.button(x, y++, t("change"), () => void askWords(deck, src), { tip: "w" });
    } else ui.text(x0, y++, src.kind === "area" ? t("the news where you are (a quiet place gets the national news added)") : t("your country's top stories"), { fg: c.muted }, x1 - x0);
    y += SECTION;
    ui.text(x0, y++, t("ITS LOOK"), { fg: c.title, attrs: BOLD });
    new Bar(ui, x0, y++, x1)
      .button(t("headlines"), () => {}, { cmd: "news mode list", selected: mode !== "featured" }, { priority: 6 })
      .button(t("à la une (one, big, with its summary)"), () => {}, { cmd: "news mode featured", selected: mode === "featured" }, { priority: 5 })
      .button(t("refresh"), () => {}, { cmd: "news refresh" }, { side: "right", priority: 3 })
      .draw();
  },
  onText: (s, { deck, key }) => (s === "w" ? (void askWords(deck, widgetSource(deck, key)), true) : false),
};
/** Your own words for this widget (a topic: "formula 1", "linux", "Lyon"…). */
async function askWords(deck: Deck, cur: NewsSource): Promise<void> {
  const v = await deck.prompt(t("This widget shows the news about…"), { initial: cur.kind === "topic" ? cur.words : followedWords(deck), placeholder: "formula 1, linux, Lyon…", suggestions: NEWS_TOPICS });
  if (v?.trim()) void deck.act(`news show ${v.trim()}`);
}

/* ─────────── clock: a timer and a stopwatch ─────────── */

let timerWatch: ReturnType<typeof setInterval> | null = null;

const clockPopup: WidgetPopupSpec = {
  title: "clock",
  size: { w: 54, h: 13 },
  hint: "t timer · space stopwatch · r reset · f face · s seconds",
  render(ui, r, { deck, key }) {
    const c = ui.c;
    ui.animate(200);
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 0);
    const doy = Math.floor((now.getTime() - start.getTime()) / 86400000);
    ui.textCenter(r, r.y, now.toLocaleTimeString(dateLocale(), { hour: "2-digit", minute: "2-digit", second: "2-digit" }), { fg: c.accent, attrs: BOLD });
    ui.textCenter(r, r.y + 1, dayLong(now, dateLocale(), true), { fg: c.fg });
    ui.textCenter(r, r.y + 2, `${t("day {n}", { n: doy })} · ${Intl.DateTimeFormat().resolvedOptions().timeZone}`, { fg: c.subtle });
    // timer
    const tm = soonestTimer();
    const left = tm ? tm.end - Date.now() : 0;
    ui.text(r.x + 3, r.y + 5, t("TIMER"), { fg: c.subtle, attrs: BOLD });
    ui.text(r.x + 13, r.y + 5, tm ? dur(left) : "--:--", { fg: tm ? c.fg : c.faint, attrs: BOLD });
    if (tm) ui.bar(r.x + 24, r.y + 5, r.w - 28 - (clockState.timers.length > 1 ? 4 : 0), 1 - left / tm.total, c.accent, c.faint);
    if (clockState.timers.length > 1) ui.textRight(r.x + r.w - 2, r.y + 5, `+${clockState.timers.length - 1}`, { fg: c.subtle });
    let x = r.x + 3;
    for (const [label, cmd] of [[t("1 min"), "timer 1m"], [t("5 min"), "timer 5m"], [t("25 min"), "timer 25m"], [t("stop"), "timer stop"]]) x += ui.button(x, r.y + 6, label, () => {}, { cmd }) + 2;
    // stopwatch
    ui.text(r.x + 3, r.y + 8, t("STOPWATCH"), { fg: c.subtle, attrs: BOLD });
    ui.text(r.x + 15, r.y + 8, dur(swNow()), { fg: clockState.swStart ? c.accent : c.fg, attrs: BOLD });
    x = r.x + 3;
    x += ui.button(x, r.y + 9, clockState.swStart ? "❚❚ stop" : t("▶ start"), () => {}, { cmd: "stopwatch toggle", tip: "space" }) + 2;
    ui.button(x, r.y + 9, t("↺ reset"), () => {}, { cmd: "stopwatch reset", tip: "r" });
    // the widget's face
    x = r.x + 3;
    const h = deck.settings.data.home;
    // this copy's face (each clock on HOME / the panel has its own)
    const style = widgetConfig(deck, key, "style", h.clockStyle), seconds = widgetConfig(deck, key, "seconds", h.clockSeconds);
    x = ui.text(x, r.y + 11, `${t("FACE")} `, { fg: c.subtle, attrs: BOLD }) + 1;
    // ‹ face › (ui/controls.ts): the left half goes back, the right half forward
    x = choice(ui, x + 2, r.y + 11, t(style || "segment"), { arrows: true, onStep: (dir) => void deck.act(`clock style ${dir < 0 ? "prev" : "next"}`), tip: t("the next face · f") }) + 2;
    checkbox(ui, x, r.y + 11, !!seconds, { label: t("seconds"), onClick: () => void deck.act("clock seconds"), tip: "s" });
  },
  onText: (t, { deck }) => {
    if (t === " ") return void deck.act("stopwatch toggle"), true;
    if (t === "r") return void deck.act("stopwatch reset"), true;
    if (t === "f") return void deck.act("clock style next"), true;
    if (t === "s") return void deck.act("clock seconds"), true;
    if (t === "t") {
      void deck.prompt("Timer", { placeholder: "5m, 90s, 1h30", suggestions: DURATIONS }).then((v) => {
        if (v?.trim()) void deck.act(`timer ${v.trim()}`);
      });
      return true;
    }
    return false;
  },
};

export const timerCommand: Command = {
  name: "timer",
  summary: "countdowns, several at once, named (the clock pop-up and the CLOCKS app show them)",
  usage: "timer                     the timers running\ntimer <5m | 90s | 1h30 | 25> [label]   a new one\ntimer stop [n | all]      stop one (the next to ring) or all",
  examples: [["timer 4m tea", "tea in 4 minutes"], ["timer 25 work", "25 minutes"], ["timer stop all", "stop them all"]],
  run(ctx) {
    const [a, ...rest] = ctx.args;
    if (!a) {
      if (!clockState.timers.length) return ctx.out("no timer\n"), 0;
      for (const tm of [...clockState.timers].sort((x, y) => x.end - y.end)) ctx.out(`${String(tm.id).padStart(2)}  ${dur(tm.end - Date.now())}  ${tm.label}\n`);
      return 0;
    }
    if (a === "stop" || a === t("stop")) {
      const which = rest[0];
      if (which === "all") clockState.timers = [];
      else {
        const tm = which ? clockState.timers.find((x) => x.id === Number(which)) : soonestTimer();
        if (!tm) return ctx.err("timer: no such timer\n"), 1;
        clockState.timers = clockState.timers.filter((x) => x !== tm);
      }
      ctx.deck.requestFrame();
      return ctx.out("timer stopped\n"), 0;
    }
    const ms = parseTimer(a);
    if (!ms) return ctx.err("usage: timer 5m | 90s | 1h30 | 25 (minutes) [label]\n"), 1;
    const tm: ClockTimer = { id: clockState.nextTimer++, label: rest.join(" ") || dur(ms), end: Date.now() + ms, total: ms };
    clockState.timers.push(tm);
    void ctx.deck.stats.add("clocks.timers", 1, "clocks", { label: "timers started", kind: "counter" }).catch(() => {});
    const deck = ctx.deck;
    // one watcher for every timer
    if (!timerWatch)
      timerWatch = setInterval(() => {
        const now = Date.now();
        for (const done of clockState.timers.filter((x) => now >= x.end)) {
          clockState.timers = clockState.timers.filter((x) => x !== done);
          deck.alert(`◷ ${done.label}`, t("timer done"), "timers");
        }
        if (!clockState.timers.length) {
          clearInterval(timerWatch!);
          timerWatch = null;
        }
        deck.requestFrame();
      }, 500);
    ctx.out(`timer #${tm.id}: ${dur(ms)}${rest.length ? ` · ${tm.label}` : ""}\n`);
    return 0;
  },
};

export const stopwatchCommand: Command = {
  name: "stopwatch",
  summary: "a stopwatch (the clock pop-up, the CLOCKS app): start · stop · toggle · lap · reset",
  run(ctx) {
    const [a = "toggle"] = ctx.args;
    const running = !!clockState.swStart;
    if (a === "reset") Object.assign(clockState, { swStart: 0, swAcc: 0, laps: [] });
    else if (a === "lap") {
      if (!running && !clockState.swAcc) return ctx.err("stopwatch: not running\n"), 1;
      clockState.laps.push(swNow());
      ctx.out(`lap ${clockState.laps.length}: ${dur(swNow())}\n`);
      ctx.deck.requestFrame();
      return 0;
    }
    else if ((a === "start" || a === "toggle") && !running) clockState.swStart = Date.now();
    else if ((a === "stop" || a === "toggle") && running) {
      clockState.swAcc += Date.now() - clockState.swStart;
      clockState.swStart = 0;
    }
    ctx.out(`${dur(swNow())}${clockState.swStart ? " ▶" : ""}\n`);
    ctx.deck.requestFrame();
  },
};

/* ─────────── system: the vitals, bigger ─────────── */

let sysStats: import("../platform/types").SystemStats | null = null;
let sysAt = 0;
const systemPopup: WidgetPopupSpec = {
  title: "system",
  size: { w: 60, h: 11 },
  render(ui, r, { deck }) {
    const c = ui.c;
    if (Date.now() - sysAt > 1500) {
      sysAt = Date.now();
      void deck.platform.system.stats().then((s) => ((sysStats = s), deck.requestFrame())).catch(() => {});
    }
    ui.animate(1000);
    const s = sysStats;
    if (!s) return void ui.text(r.x + 2, r.y + 1, `${ui.spinner()} reading…`, { fg: c.muted });
    const gb = (b: number) => (b / 1024 ** 3).toFixed(1);
    const row = (y: number, label: string, ratio: number, text: string) => {
      ui.text(r.x + 2, y, label, { fg: c.subtle });
      ui.bar(r.x + 10, y, r.w - 30, ratio, ratio > 0.85 ? c.error : ratio > 0.6 ? c.warning : c.accent, c.faint);
      ui.textRight(r.x + r.w - 2, y, text, { fg: c.fg });
    };
    ui.text(r.x + 2, r.y, `${s.host} · ${s.os} · ${s.arch}`, { fg: c.fg, attrs: BOLD }, r.w - 4);
    ui.text(r.x + 2, r.y + 1, `${s.cpuBrand} · ${s.cores.length} cores`, { fg: c.muted }, r.w - 4);
    row(r.y + 3, t("cpu"), s.cpu / 100, `${Math.round(s.cpu)}%`);
    row(r.y + 4, t("memory"), s.memUsed / s.memTotal, `${gb(s.memUsed)} / ${gb(s.memTotal)} GB`);
    if (s.swapTotal) row(r.y + 5, t("swap"), s.swapUsed / s.swapTotal, `${gb(s.swapUsed)} / ${gb(s.swapTotal)} GB`);
    // one tiny bar per core
    const cw = Math.max(1, Math.floor((r.w - 12) / Math.max(1, s.cores.length)));
    s.cores.forEach((v, i) => ui.text(r.x + 10 + i * cw, r.y + 7, " ▁▂▃▄▅▆▇█"[Math.min(8, Math.round((v / 100) * 8))], { fg: v > 85 ? c.error : c.accent }));
    ui.text(r.x + 2, r.y + 7, t("cores"), { fg: c.subtle });
    ui.text(r.x + 2, r.y + 9, `${s.processes} processes · up ${Math.floor(s.uptime / 86400)}d ${Math.floor((s.uptime % 86400) / 3600)}h`, { fg: c.muted });
  },
};

/* ─────────── modules: launch anything ─────────── */

const launchField = new Field({ icon: "❯" });
let launchSel = 0;
const launchList = (deck: Deck) => {
  const apps = deck.apps.list().filter((a) => a.launcher);
  return launchField.text ? fuzzyFilter(launchField.text, apps, (a) => `${a.title} ${a.kind} ${a.description ?? ""}`, 40) : apps;
};
const modulesPopup: WidgetPopupSpec = {
  title: "modules",
  size: { w: 60, h: 14 },
  hint: "type to filter · ↑↓ · enter launches",
  render(ui, r, { deck }) {
    const c = ui.c;
    launchField.render(ui, { x: r.x + 1, y: r.y, w: r.w - 2, h: 1 }, { focused: true, placeholder: t("launch…") });
    const list = launchList(deck);
    launchSel = Math.max(0, Math.min(launchSel, list.length - 1));
    list.slice(0, r.h - 2).forEach((a, i) => {
      const y = r.y + 2 + i;
      const row = { x: r.x, y, w: r.w, h: 1 };
      const sel = i === launchSel;
      if (sel) ui.fill(row, { bg: mix(c.accent, c.bg, 0.78) });
      const st = sel ? { bg: mix(c.accent, c.bg, 0.78) } : {};
      ui.text(r.x + 2, y, a.icon ?? "◇", { fg: c.accent, ...st });
      ui.text(r.x + 5, y, a.title, { fg: c.fg, attrs: sel ? BOLD : 0, ...st });
      ui.text(r.x + 20, y, a.description ?? "", { fg: c.faint, ...st }, r.w - 22);
      ui.hit(row, { cmd: `launch ${a.kind}`, tip: `launch ${a.kind}` });
    });
  },
  onText: (t) => (launchField.onText(t), (launchSel = 0), true),
  onKey: (k, { deck, close }) => {
    if (launchField.onKey(k)) return true;
    if (k.combo !== "enter") return false;
    const a = launchList(deck)[launchSel];
    if (a) {
      close();
      launchField.text = "";
      void deck.act(`launch ${a.kind}`);
    }
    return true;
  },
  onAction: (a) => {
    if (a === "up") return (launchSel = Math.max(0, launchSel - 1)), true;
    if (a === "down") return (launchSel += 1), true;
    return false;
  },
};

/* ─────────── matrix: its look ─────────── */

/** a matrix copy's look (the shared one until it has its own) */
const lookOf = (deck: Deck, key?: string) => ({ speed: widgetConfig(deck, key, "speed", matrixLook.speed), set: widgetConfig(deck, key, "set", matrixLook.set) });

const matrixPopup: WidgetPopupSpec = {
  title: "matrix",
  size: { w: 50, h: 8 },
  hint: "←→ speed · ↑↓ characters",
  render(ui, r, { deck, key }) {
    const c = ui.c;
    const look = lookOf(deck, key);
    ui.text(r.x + 2, r.y + 1, t("speed"), { fg: c.subtle });
    ui.text(r.x + 14, r.y + 1, `${look.speed.toFixed(1)}×`, { fg: c.fg, attrs: BOLD });
    ui.text(r.x + 2, r.y + 3, t("characters"), { fg: c.subtle });
    let x = r.x + 14;
    for (const name of Object.keys(MATRIX_SETS)) x += ui.button(x, r.y + 3, name, () => {}, { cmd: `matrix glyphs ${name}`, selected: look.set === name }) + 1;
    const y = r.y + 5;
    ui.button(r.x + 14, y, t("slower"), () => {}, { cmd: `matrix speed ${Math.max(0.2, look.speed - 0.2).toFixed(1)}` });
    ui.button(r.x + 24, y, t("faster"), () => {}, { cmd: `matrix speed ${Math.min(4, look.speed + 0.2).toFixed(1)}` });
  },
  onAction: (a, { deck, key }) => {
    const look = lookOf(deck, key);
    const sets = Object.keys(MATRIX_SETS);
    const i = sets.indexOf(look.set);
    if (a === "left") return void deck.act(`matrix speed ${Math.max(0.2, look.speed - 0.2).toFixed(1)}`), true;
    if (a === "right") return void deck.act(`matrix speed ${Math.min(4, look.speed + 0.2).toFixed(1)}`), true;
    if (a === "up" || a === "down") return void deck.act(`matrix glyphs ${sets[(i + (a === "down" ? 1 : sets.length - 1)) % sets.length]}`), true;
    return false;
  },
};

export const matrixCommand: Command = {
  name: "matrix",
  summary: "the matrix widget's rain: speed and characters",
  usage: `matrix speed <0.2-4>\nmatrix glyphs ${Object.keys(MATRIX_SETS).join(" | ")}`,
  run(ctx) {
    const [a, b] = ctx.args;
    // the copy whose pop-up is open (or that's selected); else the shared look
    const key = widgetTarget("matrix");
    if (a === "speed" && Number(b) >= 0.2 && Number(b) <= 4) key ? setWidgetSetting(ctx.deck, "matrix", "speed", Number(b)) : (matrixLook.speed = Number(b));
    else if (a === "glyphs" && b && b in MATRIX_SETS) key ? setWidgetSetting(ctx.deck, "matrix", "set", b) : (matrixLook.set = b);
    else if (a) return ctx.err(`usage: matrix speed <0.2-4> | matrix glyphs ${Object.keys(MATRIX_SETS).join(" | ")}\n`), 1;
    const look = lookOf(ctx.deck, key ?? undefined);
    ctx.out(`matrix: ${look.set}, ${look.speed.toFixed(1)}×\n`);
    ctx.deck.requestFrame();
    return 0;
  },
};


/* ─────────── uplink: a quick question ─────────── */

const askField = new Field({ icon: "❯" });
const asked = { q: "", a: "", busy: false, error: "" };
const aiPopup: WidgetPopupSpec = {
  title: "uplink",
  size: { w: 72, h: 16 },
  hint: "type + enter: ask · ctrl+s: say it",
  render(ui, r, { deck }) {
    const c = ui.c;
    const ok = deck.ai.ready;
    ui.text(r.x + 2, r.y, `${ok ? "●" : "○"} ${deck.ai.provider.label}`, { fg: ok ? c.success : c.error, attrs: BOLD });
    if (!ok) ui.text(r.x + 2, r.y + 1, deck.ai.problem ?? "", { fg: c.muted }, r.w - 4);
    askField.render(ui, { x: r.x + 1, y: r.y + 2, w: r.w - 2, h: 1 }, { focused: true, placeholder: ok ? t("ask anything — your vault is in reach") : t("uplink offline") });
    if (asked.busy) ui.animate(80);
    const body = asked.error ? asked.error : asked.a || (asked.busy ? `${ui.spinner()} ${t("processing…")}` : asked.q ? "" : t("a quick question here; the full conversation lives in LINK"));
    // word-wrap the answer
    const lines = wrapWords(body, r.w - 6);
    lines.slice(-(r.h - 6)).forEach((l, i) => ui.text(r.x + 3, r.y + 4 + i, l, { fg: asked.error ? c.error : asked.a ? c.fg : c.faint }));
    if (asked.a) ui.button(r.x + 2, r.y + r.h - 1, t("◖ say it"), () => {}, { cmd: `voice say ${q(asked.a.slice(0, 1500))}`, tip: "ctrl+s" });
    // its personality, on the last line: where the eye looks, the little lines, the blinks
    const look = uplinkLook(deck, widgetTarget("ai") ?? undefined);
    const row = new Row(ui, r.x + (asked.a ? 16 : 2), r.y + r.h - 1, r.x + r.w - 2);
    row.label(t("eye"));
    for (const [v, label] of [["hover", t("when hovered")], ["always", t("follows the pointer")], ["off", t("closed")]] as const)
      row.button(label, () => void deck.act(`uplink eye ${v}`), { selected: look.eye === v, quiet: look.eye !== v, tip: `uplink eye ${v}` });
    row.checkbox(look.quips, { label: t("talks"), onClick: () => void deck.act(`uplink quips ${look.quips ? "off" : "on"}`), tip: "uplink quips on|off" });
    row.checkbox(look.blinks, { label: t("blinks"), onClick: () => void deck.act(`uplink blinks ${look.blinks ? "off" : "on"}`), tip: "uplink blinks on|off" });
  },
  onText: (t) => (askField.onText(t), true),
  onKey: (k, { deck }) => {
    if (askField.onKey(k)) return true;
    if (k.combo === "ctrl+s" && asked.a) return void deck.act(`voice say ${q(asked.a.slice(0, 1500))}`), true;
    if (k.combo !== "enter" || !askField.text.trim() || asked.busy) return k.combo === "enter";
    const question = askField.text.trim();
    askField.text = "";
    Object.assign(asked, { q: question, a: "", busy: true, error: "" });
    deck.ai.busy++;
    void deck.ai
      .ask(question, { onText: (d) => ((asked.a += d), deck.requestFrame()) })
      .then((full) => {
        asked.a = full || asked.a;
        const v = deck.settings.data.voice;
        if (v.enabled && v.readAI) void deck.voice.speak(asked.a);
      })
      .catch((e) => (asked.error = e instanceof Error ? e.message : String(e)))
      .finally(() => {
        asked.busy = false;
        deck.ai.busy = Math.max(0, deck.ai.busy - 1);
        deck.requestFrame();
      });
    return true;
  },
};

/* ─────────── calendar: the CALENDAR module's month ─────────── */

/** The core calendar widget hands over to the CALENDAR module when it's on. */
const calendarPopup: WidgetPopupSpec = {
  title: "calendar",
  size: { w: 72, h: 15 },
  render: (ui, r, ctx) => {
    const p = ctx.deck.widgets.get("calendar.month")?.popup;
    if (p) return p.render(ui, r, ctx);
    ui.text(r.x + 2, r.y + 1, "the CALENDAR module is off — modules → calendar", { fg: ui.c.muted });
  },
  onText: (t, ctx) => ctx.deck.widgets.get("calendar.month")?.popup?.onText?.(t, ctx) ?? false,
  onKey: (k, ctx) => ctx.deck.widgets.get("calendar.month")?.popup?.onKey?.(k, ctx) ?? false,
  onAction: (a, ctx) => ctx.deck.widgets.get("calendar.month")?.popup?.onAction?.(a, ctx) ?? false,
};

/* ─────────── wiring ─────────── */

const POPUPS: Record<string, { popup?: WidgetPopupSpec; open?: string }> = {
  focus: { popup: focusPopup, open: "focus open" },
  moon: { popup: moonPopup },
  recent: { popup: recentPopup },
  streak: { popup: streakPopup, open: "journal" },
  weather: { popup: weatherPopup, open: "weather open" },
  news: { popup: newsPopup },
  calendar: { popup: calendarPopup, open: "cal open" },
  system: { popup: systemPopup, open: "launch sysmon" },
  modules: { popup: modulesPopup, open: "launch modules" },
  ai: { popup: aiPopup, open: "launch link" },
  chat: { popup: chatPopup, open: "launch link" },
  clock: { popup: clockPopup, open: "launch clocks" },
  matrix: { popup: matrixPopup },
};

/** Give the built-in widgets their pop-ups and modules. */
export function withPopups(specs: WidgetSpec[]): WidgetSpec[] {
  return specs.map((s) => (POPUPS[s.id] ? { ...s, ...POPUPS[s.id] } : s));
}

/** The UPLINK widget's personality (its pop-up's last line). */
export const uplinkCommand: Command = {
  name: "uplink",
  summary: "the UPLINK widget's personality: where its eye looks, whether it talks and blinks",
  usage: "uplink                      how it is now\nuplink eye hover|always|off  looks at the pointer when hovered, all the time, or never\nuplink quips on|off          a little line when the pointer arrives\nuplink blinks on|off         a blink now and then",
  examples: [["uplink eye always", "its eye follows the pointer across the screen"]],
  complete: () => ["eye", "quips", "blinks", "hover", "always", "off", "on"],
  run(ctx) {
    const [a, b] = ctx.args;
    const key = widgetTarget("ai") ?? "ai";
    const all = { ...(ctx.deck.settings.data.home.widgetConfig ?? {}) };
    const set = (name: string, v: unknown) => {
      all[key] = { ...(all[key] ?? {}), [name]: v };
      ctx.deck.settings.set("home.widgetConfig", all);
    };
    if (a === "eye" && (b === "hover" || b === "always" || b === "off")) set("eye", b);
    else if ((a === "quips" || a === "blinks") && (b === "on" || b === "off")) set(a, b === "on");
    else if (a) return ctx.err("usage: uplink eye hover|always|off · uplink quips on|off · uplink blinks on|off\n"), 1;
    const look = uplinkLook(ctx.deck, key);
    ctx.out(`uplink: eye ${look.eye} · quips ${look.quips ? "on" : "off"} · blinks ${look.blinks ? "on" : "off"}\n`);
    ctx.deck.requestFrame();
    return 0;
  },
};

export const popupCommands: Command[] = [focusCommand, moonCommand, timerCommand, stopwatchCommand, matrixCommand, clockCommand, uplinkCommand];
