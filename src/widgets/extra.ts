import { strWidth, wrapWords } from "../core/unicode";
import { typed } from "../ui/typewriter";
import { setWidgetSetting, widgetConfig, widgetTarget } from "./instances";
import { chatWidget } from "./chatbox";
import { t, dateLocale } from "../core/i18n";
import { BOLD } from "../core/grid";
import type { Deck } from "../deck";
import { Rain } from "../fx/rain";
import { cellsFor, fitMatrix, matrixSize, matrixText } from "../ui/dots";
import { drawUplinkCore } from "../ui/uplinkcore";
import { isoDay, streakOf } from "../core/time";
import { newsWidget } from "./news";
import type { WidgetSpec } from "./types";
import type { Command } from "../shell/types";
import { fmt } from "../core/ansi";
import { drawMoon } from "./moondraw";
import { GAP, INSET } from "../ui/layout";
import { moonLit, phaseName, upcoming } from "./moonphase";

/* Extra cards shipped with the deck: not all on the default HOME, all one `a` away. */

/* ─────────── focus: a 25/5 pomodoro ─────────── */

export { focus, tickFocus } from "./focusstate";
import { focus, tickFocus } from "./focusstate";

const focusWidget: WidgetSpec = {
  id: "focus",
  title: "focus",
  description: "a pomodoro — enter: start, pause, durations",
  size: { w: 4, h: 4 },
  min: { w: 2, h: 2 },
  render(ui, r, { deck }) {
    const c = ui.c;
    tickFocus(deck);
    if (focus.running) ui.animate(250);
    const total = (focus.phase === "focus" ? focus.work : focus.rest) * 60_000;
    const secs = Math.ceil(focus.left / 1000);
    const t = `${String(Math.floor(secs / 60)).padStart(2, "0")}:${String(secs % 60).padStart(2, "0")}`;
    const flash = ui.now < focus.flashUntil && Math.floor(ui.now / 200) % 2 === 0;
    if (ui.now < focus.flashUntil) ui.animate(100);
    const col = focus.phase === "focus" ? c.accent : c.success;
    const k = fitMatrix(t, r.w - 2, r.h - 2, r.h >= 12 && r.w >= 40 ? 2 : 1);
    const label = `${focus.running ? "▶" : "❚❚"} ${focus.phase}`;
    if (k) {
      const d = matrixSize(t, k);
      const y = r.y + Math.max(0, Math.floor((r.h - d.h - 2) / 2));
      const x = r.x + Math.floor((r.w - d.w) / 2);
      matrixText(ui, x, y, t, k, () => (flash ? c.fg : col));
      ui.bar(x, y + d.h, d.w, 1 - focus.left / total, col, c.faint);
      ui.textCenter(r, y + d.h + 1, label, { fg: focus.running ? col : c.subtle });
    } else {
      // tiny (2×2): the time, what it's doing, a thin bar
      const lines = Math.min(3, r.h);
      const y = r.y + Math.max(0, Math.floor((r.h - lines) / 2));
      ui.textCenter(r, y, t, { fg: flash ? c.fg : col, attrs: BOLD });
      if (lines >= 2) ui.textCenter(r, y + 1, label, { fg: focus.running ? col : c.subtle });
      if (lines >= 3 && r.w > 4) ui.bar(r.x + 1, y + 2, r.w - 2, 1 - focus.left / total, col, c.faint);
    }
  },
};

/* ─────────── moon phase (computed locally) ─────────── */

const moonWidget: WidgetSpec = {
  id: "moon",
  title: "moon",
  description: "tonight's moon: its phase, how much is lit, the next full moon",
  size: { w: 4, h: 4 },
  min: { w: 2, h: 2 },
  open: "launch moon",
  render(ui, r) {
    const c = ui.c;
    const now = Date.now();
    // the moon drawn (moondraw.ts), its words beside it when there's room
    const size = Math.min(r.h, Math.floor(r.w * ui.cellAspect));
    const cols = Math.ceil(size / ui.cellAspect);
    const words = r.w - cols - 3 >= 12;
    drawMoon(ui, words ? { x: r.x + INSET, y: r.y, w: cols, h: r.h } : r, now);
    if (!words) return;
    const tx = r.x + INSET + cols + GAP, tw = r.x + r.w - tx;
    const full = upcoming(now).find((p) => p.name === "full moon");
    const lines: [string, number, number][] = [
      [t(phaseName(now)), c.fg, BOLD],
      [t("{n} % lit", { n: Math.round(moonLit(now) * 100) }), c.muted, 0],
      ...(full ? ([[`● ${t("full moon {d}", { d: full.at.toLocaleDateString(dateLocale(), { weekday: "short", day: "numeric" }) })}`, c.subtle, 0]] as [string, number, number][]) : []),
    ];
    const ty = r.y + Math.max(0, Math.floor((r.h - lines.length) / 2));
    lines.slice(0, r.h).forEach(([s, fg, attrs], i) => ui.text(tx, ty + i, s, { fg, attrs }, tw));
  },
};

/* ─────────── matrix rain (pure eye candy) ─────────── */

const rains = new Map<string, Rain>();
/** the matrix widget's look, shared with its pop-up and the `matrix` command */
export const matrixLook = { speed: 1, set: "katakana" };
export const MATRIX_SETS: Record<string, string[] | null> = {
  katakana: null,
  binary: [..."01"],
  hex: [..."0123456789ABCDEF"],
  blocks: [..."░▒▓█▖▗▘▝"],
  runes: [..."ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏᛒᛖᛗᛚᛜᛞᛟ"],
};
const matrixWidget: WidgetSpec = {
  id: "matrix",
  title: "matrix",
  description: "digital rain. does nothing. looks great.",
  size: { w: 3, h: 6 },
  min: { w: 1, h: 2 },
  render(ui, r, { deck, key }) {
    const id = `${key ?? "matrix"}|${r.w}x${r.h}`;
    if (!rains.has(id)) rains.set(id, new Rain(0.8));
    const rain = rains.get(id)!;
    // each copy its own speed and glyphs (the shared look is the default)
    rain.speed = widgetConfig(deck, key, "speed", matrixLook.speed);
    rain.chars = MATRIX_SETS[widgetConfig(deck, key, "set", matrixLook.set)] ?? null;
    rain.render(ui, r);
  },
};

/* ─────────── world clock ─────────── */

const worldWidget: WidgetSpec = {
  id: "worldclock",
  title: "world clock",
  description: "time elsewhere (config set home.worldClocks …)",
  size: { w: 5, h: 3 },
  min: { w: 2, h: 2 },
  render(ui, r, { deck, key }) {
    const c = ui.c;
    const here = new Date();
    zonesOf(deck, key).slice(0, r.h).forEach((tz, i) => {
      let time = "--:--", hour = 12, day = "";
      try {
        const parts = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", weekday: "short" }).formatToParts(here);
        const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
        time = `${get("hour")}:${get("minute")}`;
        hour = Number(get("hour"));
        day = get("weekday");
      } catch {
        time = "bad tz";
      }
      const city = tz.split("/").pop()!.replace(/_/g, " ");
      const night = hour < 7 || hour >= 20;
      const y = r.y + i;
      ui.text(r.x + 1, y, night ? "☾" : "☼", { fg: night ? c.info : c.warning });
      const right = r.w >= 20 ? `${day.toLowerCase()} ${time}` : time;
      ui.text(r.x + 3, y, city, { fg: c.fg }, Math.max(1, r.w - 5 - strWidth(right)));
      ui.textRight(r.x + r.w - 1, y, right, { fg: night ? c.muted : c.accent, attrs: BOLD });
    });
    ui.animate(1000);
  },
  popup: {
    title: "world clock",
    size: { w: 56, h: 14 },
    hint: "a add · x remove · ↑↓",
    render(ui, r, { deck, key }) {
      const c = ui.c;
      const list = zonesOf(deck, key);
      worldSel = Math.max(0, Math.min(worldSel, list.length - 1));
      if (!list.length) ui.text(r.x + 1, r.y + 1, t("no clocks — a adds one"), { fg: c.muted });
      list.slice(0, r.h - 2).forEach((tz, i) => {
        const y = r.y + 1 + i;
        const row = { x: r.x, y, w: r.w, h: 1 };
        const sel = i === worldSel;
        if (sel) ui.fill(row, { bg: c.highlight });
        let time = "--:--";
        try {
          time = new Intl.DateTimeFormat("en-GB", { timeZone: tz, weekday: "short", hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date());
        } catch {}
        ui.text(r.x + 1, y, tz.split("/").pop()!.replace(/_/g, " "), { fg: sel ? c.fg : c.muted, ...(sel ? { bg: c.highlight } : {}) });
        ui.text(r.x + 18, y, tz, { fg: c.faint, ...(sel ? { bg: c.highlight } : {}) }, r.w - 36);
        ui.textRight(r.x + r.w - 5, y, time.toLowerCase(), { fg: c.accent, ...(sel ? { bg: c.highlight } : {}) });
        ui.text(r.x + r.w - 3, y, "✕", { fg: ui.hovered({ x: r.x + r.w - 3, y, w: 1, h: 1 }) ? c.error : c.faint, ...(sel ? { bg: c.highlight } : {}) });
        ui.hit({ x: r.x + r.w - 3, y, w: 1, h: 1 }, { cmd: `worldclock rm ${tz}`, tip: "x · remove" });
        ui.hit({ x: r.x, y, w: r.w - 4, h: 1 }, { onClick: () => (worldSel = i) });
      });
      ui.button(r.x + 1, r.y + r.h - 1, t("+ add a city"), () => void addClock(deck), { tip: "a · worldclock add <Area/City>" });
      ui.animate(1000);
    },
    onText: (t, { deck, key }) => {
      if (t === "a" || t === "+") return void addClock(deck), true;
      if (t === "x") return removeClock(deck, key), true;
      return false;
    },
    onKey: (k, { deck, key }) => (k.combo === "delete" || k.combo === "backspace" ? (removeClock(deck, key), true) : false),
    onAction: (a, { deck, key }) => {
      const n = zonesOf(deck, key).length;
      if (a === "up") return (worldSel = Math.max(0, worldSel - 1)), true;
      if (a === "down") return (worldSel = Math.min(n - 1, worldSel + 1)), true;
      return false;
    },
  },
};

let worldSel = 0;
/** a world clock copy's cities (the shared list until that copy has its own) */
function zonesOf(deck: Deck, key: string | undefined): string[] {
  return widgetConfig(deck, key, "zones", deck.settings.data.home.worldClocks);
}
function removeClock(deck: Deck, key?: string): void {
  const tz = zonesOf(deck, key)[worldSel];
  if (tz) void deck.act(`worldclock rm ${tz}`);
}
async function addClock(deck: Deck): Promise<void> {
  const zones = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.("timeZone") ?? [];
  const i = await deck.choose("Add a city (type to search)", zones.map((z) => ({ label: z.split("/").pop()!.replace(/_/g, " "), hint: z })));
  if (i !== null) void deck.act(`worldclock add ${zones[i]}`);
}

/** `worldclock` — the world clock widget's cities. */
export const worldclockCommand: Command = {
  name: "worldclock",
  aliases: ["clocks"],
  summary: "the cities of the world clock widget",
  usage: "worldclock               list them\nworldclock add <Area/City>\nworldclock rm <Area/City>",
  examples: [["worldclock add Asia/Tokyo", "add Tokyo"], ["worldclock rm Europe/London", "remove London"]],
  complete: () => ["add", "rm"],
  run(ctx) {
    const [sub, tz] = ctx.args;
    // the copy whose pop-up is open (or that's selected) changes; else the shared list
    const list = [...zonesOf(ctx.deck, widgetTarget("worldclock") ?? undefined)];
    if (!sub) {
      for (const z of list) ctx.out(`${z}\n`);
      return 0;
    }
    if (!tz) return ctx.err("usage: worldclock add|rm <Area/City>\n"), 1;
    if (sub === "add") {
      try {
        new Intl.DateTimeFormat("en", { timeZone: tz });
      } catch {
        return ctx.err(`worldclock: unknown time zone "${tz}" (like Europe/Paris)\n`), 1;
      }
      if (!list.includes(tz)) list.push(tz);
    } else if (sub === "rm" || sub === "remove") {
      if (!list.includes(tz)) return ctx.err(`worldclock: "${tz}" isn't there\n`), 1;
      list.splice(list.indexOf(tz), 1);
    } else return ctx.err("usage: worldclock add|rm <Area/City>\n"), 1;
    setWidgetSetting(ctx.deck, "worldclock", "zones", list, "home.worldClocks");
    ctx.out(`${list.length} clocks\n`);
    return 0;
  },
};

/* ─────────── quote of the hour ─────────── */

const QUOTES: [string, string][] = [
  ["The obstacle is the way.", "after Marcus Aurelius"],
  ["We suffer more in imagination than in reality.", "Seneca"],
  ["No man ever steps in the same river twice.", "Heraclitus"],
  ["A journey of a thousand miles begins beneath one's feet.", "Lao Tzu"],
  ["Waste no more time arguing what a good man should be. Be one.", "Marcus Aurelius"],
  ["Write it down. The vault remembers what you forget.", "ICEBREAKER"],
  ["Small notes, every day. Compound interest for the mind.", "ICEBREAKER"],
  ["The signal is in what you return to.", "ICEBREAKER"],
  ["Ship the draft. Polish is a second pass.", "ICEBREAKER"],
  ["He who has a why to live can bear almost any how.", "Nietzsche"],
];
let quoteShownAt = 0;
let quoteIdx = -1;

const quoteWidget: WidgetSpec = {
  id: "quote",
  title: "quote",
  description: "a line to think about, every hour",
  size: { w: 4, h: 3 },
  min: { w: 2, h: 2 },
  render(ui, r) {
    const c = ui.c;
    const idx = Math.floor(Date.now() / 3_600_000) % QUOTES.length;
    if (idx !== quoteIdx) {
      quoteIdx = idx;
      quoteShownAt = ui.now;
    }
    const [text, who] = QUOTES[idx];
    const p = Math.min(1, (ui.now - quoteShownAt) / 900);
    if (p < 1) ui.animate(40);
    // word-wrap
    const lines = wrapWords(text, r.w - 4);
    const top = r.y + Math.max(0, Math.floor((r.h - lines.length - 1) / 2));
    lines.slice(0, r.h - 1).forEach((l, i) => ui.textCenter(r, top + i, ui.reveal(l, p), { fg: c.fg }));
    ui.textCenter(r, Math.min(r.y + r.h - 1, top + lines.length), `— ${who}`, { fg: c.subtle });
  },
  popup: {
    title: "quote",
    size: { w: 64, h: 9 },
    hint: "space / r: another one",
    render(ui, r) {
      const c = ui.c;
      if (popupQuote < 0) popupQuote = Math.floor(Date.now() / 3_600_000) % QUOTES.length;
      const [text, who] = QUOTES[popupQuote];
      const lines = wrapWords(text, r.w - 8);
      const top = r.y + Math.max(1, Math.floor((r.h - lines.length - 3) / 2));
      lines.forEach((l, i) => ui.textCenter(r, top + i, l, { fg: c.fg, attrs: BOLD }));
      ui.textCenter(r, top + lines.length + 1, `— ${who}`, { fg: c.subtle });
      const label = " ⟳ another one ";
      const bx = r.x + Math.floor((r.w - label.length) / 2);
      ui.button(bx, r.y + r.h - 1, label.trim(), () => void 0, { cmd: "quote", tip: "space · or: quote" });
    },
    onText: (t, { deck }) => (t === " " || t === "r" ? (void deck.act("quote"), true) : false),
  },
};

let popupQuote = -1;

/** `quote` — a random one (and the quote pop-up shows it). */
export const quoteCommand: Command = {
  name: "quote",
  summary: "a random quote (the quote widget's pop-up shows it too)",
  run(ctx) {
    let i = popupQuote;
    while (QUOTES.length > 1 && i === popupQuote) i = Math.floor(Math.random() * QUOTES.length);
    popupQuote = i;
    ctx.out(`${QUOTES[i][0]} ${fmt.dim(`— ${QUOTES[i][1]}`)}\n`);
    ctx.deck.requestFrame();
  },
};

/* ─────────── journal streak heatmap ─────────── */

const streakWidget: WidgetSpec = {
  id: "streak",
  title: "streak",
  description: "journal heatmap, GitHub style",
  size: { w: 4, h: 2 },
  min: { w: 2, h: 1 },
  render(ui, r, { deck }) {
    const c = ui.c;
    const entries = deck.vault.journalDates();
    const s = streakOf(entries);
    const label = `▲ ${s}d`;
    ui.text(r.x + 1, r.y, label, { fg: s ? c.accent : c.subtle, attrs: BOLD });
    const rows = Math.min(7, r.h);
    const cols = Math.floor((r.w - label.length - 3) / 2);
    const x0 = r.x + label.length + 2;
    const d = new Date();
    // newest day bottom-right; one column per (rows) days
    for (let i = 0; i < cols * rows; i++) {
      const day = new Date(d);
      day.setDate(d.getDate() - i);
      const col = cols - 1 - Math.floor(i / rows);
      const row = rows - 1 - (i % rows);
      const has = entries.has(isoDay(day));
      ui.text(x0 + col * 2, r.y + row, has ? "■" : "·", { fg: has ? (i === 0 ? c.accentAlt : c.accent) : c.faint });
    }
  },
  activate: ({ deck }) => void deck.openJournal(new Date()),
};

/* ─────────── AI core: which model is wired in, as a breathing node ─────────── */

/**
 * The mouse over UPLINK: its core turns into an eye that follows the pointer,
 * blinks once when you arrive, and the state line says something (one line per
 * visit). Cheap: a few dots more, no extra frames beyond the widget's own.
 */
const QUIPS = ["oh. hi.", "I see you.", "ping?", "careful, I bite… bits.", "need a hand?", "scanning you…", "hello, {name}.", "don't poke the core.", "still here. always.", "boop."];
let hover: { since: number; quip: string } | null = null;

const aiWidget: WidgetSpec = {
  id: "ai",
  title: "uplink",
  description: "your AI uplink: its state, a quick question",
  size: { w: 3, h: 6 },
  min: { w: 2, h: 2 },
  render(ui, r, { deck, key }) {
    const c = ui.c;
    const ok = deck.ai.ready;
    const label = deck.ai.provider.label;
    // its personality (its pop-up, `uplink eye|quips|blinks`): the eye on hover / always / never
    const look0 = uplinkLook(deck, key);
    // four moods: idle (a slow orbit) · thinking (fast, two signals) · speaking (a voice wave) · offline
    const thinking = deck.ai.busy > 0;
    const speaking = deck.voice.speaking;
    // ring + a blank line + the label lines, centered in the card; the ring grows with it
    const lines = ok ? 2 : 3;
    const rows = Math.max(3, Math.min(r.h - lines - 1, 9));
    const top = r.y + Math.max(0, Math.round((r.h - rows - 1 - lines) / 2));
    const cols = Math.min(r.w, cellsFor(ui, rows));
    const box = { x: r.x + Math.floor((r.w - cols) / 2), y: top, w: cols, h: rows };
    // the pointer over the widget: the core becomes an eye that looks at it
    const over = ui.hovered(r) && look0.eye !== "off";
    if (over && !hover) hover = { since: ui.now, quip: QUIPS[Math.floor(Math.random() * QUIPS.length)].replace("{name}", deck.settings.data.user.handle) };
    if (!over) hover = null;
    let look: { x: number; y: number } | null = null;
    // "always": it watches the pointer wherever it is on the screen
    if (hover || (look0.eye === "always" && ui.mouse.x >= 0)) {
      const ox = (cols * ui.cellAspect) / 2, oy = rows / 2;
      const mx = (ui.mouse.x - box.x + 0.5) * ui.cellAspect - ox, my = ui.mouse.y - box.y + 0.5 - oy;
      const len = Math.hypot(mx, my) || 1;
      look = { x: mx / len, y: my / len };
    }
    // the face itself is shared with the guided tour (ui/uplinkcore.ts)
    // a blink when you arrive, and now and then by itself (every 4–7 s)
    const idleBlink = look0.blinks && look !== null && ui.now % 5300 < 130;
    drawUplinkCore(ui, box, { mood: !ok ? "offline" : thinking ? "thinking" : speaking ? "speaking" : "idle", look, blink: (!!hover && ui.now - hover.since < 140) || idleBlink });
    const y = top + rows + 1;
    if (y < r.y + r.h) ui.textCenter(r, y, label, { fg: c.fg, attrs: BOLD });
    // its little line types itself out, with blips (ui/typewriter.ts)
    const quip = hover && look0.quips ? `“${hover.quip}”` : "";
    const state = quip && hover ? [...quip].slice(0, typed(ui, `uplink-quip:${hover.since}`, quip)).join("") : !ok ? "○ offline" : thinking ? "◌ processing" : speaking ? "◖ speaking" : "● uplink up";
    if (y + 1 < r.y + r.h) ui.textCenter(r, y + 1, state, { fg: !ok ? c.error : thinking ? c.accentAlt : speaking ? c.info : c.success });
    if (!ok && y + 2 < r.y + r.h) ui.textCenter(r, y + 2, deck.settings.data.privacy.stealth ? "stealth: local model only" : "enter: settings", { fg: c.faint });
    ui.animate(ok ? (thinking || speaking ? 33 : 50) : 1000);
  },
  activate: ({ deck }) => void deck.openApp(deck.ai.ready ? "link" : "settings"),
};

/** the UPLINK widget's personality, per copy: where its eye looks, whether it talks and blinks */
export function uplinkLook(deck: Parameters<typeof widgetConfig>[0], key?: string): { eye: "hover" | "always" | "off"; quips: boolean; blinks: boolean } {
  const k = key ?? "ai";
  return { eye: widgetConfig(deck, k, "eye", "hover"), quips: widgetConfig(deck, k, "quips", true), blinks: widgetConfig(deck, k, "blinks", true) };
}

export { aiWidget };
export const EXTRA_WIDGETS: WidgetSpec[] = [aiWidget, chatWidget, newsWidget, focusWidget, moonWidget, matrixWidget, worldWidget, quoteWidget, streakWidget];
