import { t } from "../core/i18n";
import { q } from "../ui/ui";
import { mix } from "../core/color";
import { BOLD } from "../core/grid";
import type { Deck } from "../deck";
import { decrypt } from "../fx/glitch";
import { Rain } from "../fx/rain";
import { basename } from "../vault/paths";
import { cellsFor, dots, fitMatrix, matrixSize, matrixText } from "../ui/dots";
import { isoDay, streakOf } from "./builtin";
import { newsWidget } from "./news";
import type { WidgetSpec } from "./types";
import type { Command } from "../shell/types";
import { fmt } from "../core/ansi";

/* Extra cards shipped with the deck: not all on the default HOME, all one `a` away. */

/* ─────────── tasks: every "- [ ]" in the vault ─────────── */

let tasks: { text: string; path: string }[] = [];
let tasksAt = 0;

async function scanTasks(deck: Deck): Promise<void> {
  const files = [...deck.vault.markdown()].sort((a, b) => b.modified - a.modified).slice(0, 200);
  const found: { text: string; path: string }[] = [];
  for (const f of files) {
    const text = await deck.vault.read(f.path).catch(() => "");
    for (const m of text.matchAll(/^\s*[-*] \[ \] (.+)$/gm)) found.push({ text: m[1].trim(), path: f.path });
  }
  tasks = found;
}

/** open checkboxes found in the notes (the widget and its pop-up) */
export const openTasks = () => tasks;

const tasksWidget: WidgetSpec = {
  id: "tasks",
  title: "checkboxes",
  description: "open checkboxes (- [ ]) from all your notes",
  size: { w: 4, h: 6 },
  min: { w: 2, h: 2 },
  render(ui, r, { deck }) {
    const c = ui.c;
    if (Date.now() - tasksAt > 30_000) {
      tasksAt = Date.now();
      void scanTasks(deck).then(() => deck.requestFrame());
    }
    ui.text(r.x + 1, r.y, `${tasks.length} open`, { fg: tasks.length ? c.accent : c.success, attrs: BOLD });
    if (!tasks.length) return void ui.text(r.x + 1, r.y + 1, "nothing to do. suspicious.", { fg: c.muted });
    tasks.slice(0, r.h - 1).forEach((t, i) => {
      const row = { x: r.x, y: r.y + 1 + i, w: r.w, h: 1 };
      const hot = ui.hovered(row);
      const g = ui.theme.glyphs;
      const tx = ui.text(r.x + 1, row.y, hot ? g.done : g.todo, { fg: hot ? c.accent : c.subtle }) + 1;
      ui.text(tx, row.y, t.text, { fg: hot ? c.accent : c.fg }, r.x + r.w - 1 - tx - (r.w > 40 ? 14 : 0));
      if (r.w > 40) ui.textRight(r.x + r.w - 1, row.y, basename(t.path, ".md").slice(0, 12), { fg: c.faint });
      ui.hit(row, { cmd: `open ${q(t.path)}`, tip: "checkboxes in the shell lists them all" });
    });
  },
};

/* ─────────── focus: a 25/5 pomodoro ─────────── */

/** the pomodoro, shared by the widget, its pop-up and the `focus` command */
export const focus = { phase: "focus" as "focus" | "break", left: 25 * 60_000, running: false, last: 0, flashUntil: 0, work: 25, rest: 5 };

const focusWidget: WidgetSpec = {
  id: "focus",
  title: "focus",
  description: "a pomodoro — enter: start, pause, durations",
  size: { w: 4, h: 4 },
  min: { w: 2, h: 2 },
  render(ui, r, { deck }) {
    const c = ui.c;
    const now = Date.now();
    if (focus.running) {
      focus.left -= now - focus.last;
      focus.last = now;
      if (focus.left <= 0) {
        if (focus.phase === "focus") {
          void deck.stats.add("focus.sessions", 1, "focus", { label: "focus sessions", kind: "counter" }).catch(() => {});
          void deck.stats.add("focus.minutes", focus.work, "focus", { label: "minutes of focus", kind: "counter", unit: "min" }).catch(() => {});
        }
        focus.phase = focus.phase === "focus" ? "break" : "focus";
        focus.left = (focus.phase === "focus" ? focus.work : focus.rest) * 60_000;
        focus.flashUntil = ui.now + 3000;
        deck.notify(focus.phase === "break" ? "focus done — take 5" : "break over — jack back in", "success");
      }
      ui.animate(250);
    }
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
    } else ui.textCenter(r, r.y, `${label} ${t}`, { fg: col, attrs: BOLD });
  },
};

/* ─────────── moon phase (computed locally) ─────────── */

const moonWidget: WidgetSpec = {
  id: "moon",
  title: "moon",
  description: "tonight's moon phase",
  size: { w: 4, h: 4 },
  min: { w: 2, h: 2 },
  render(ui, r) {
    const c = ui.c;
    const synodic = 29.530588853;
    const age = (((Date.now() / 86400000 - 10957.76) % synodic) + synodic) % synodic; // days since new moon
    const phase = age / synodic;
    const lit = (1 - Math.cos(phase * 2 * Math.PI)) / 2;
    const names = ["new moon", "waxing crescent", "first quarter", "waxing gibbous", "full moon", "waning gibbous", "last quarter", "waning crescent"];
    const name = names[Math.round(phase * 8) % 8];
    // a round disc whatever the font: drawn in physical units (see ui/dots.ts)
    const rows = Math.max(2, Math.min(r.h, 5));
    const cols = cellsFor(ui, rows);
    const R = rows / 2;
    const x0 = r.x + 1, y0 = r.y + Math.floor((r.h - rows) / 2);
    const k = Math.cos(phase * 2 * Math.PI);
    dots(ui, { x: x0, y: y0, w: cols, h: rows }, [c.faint, mix(c.fg, c.warning, 0.2)], (x, y) => {
      const px = (x - cols * ui.cellAspect / 2) / R, py = (y - R) / R;
      const d2 = px * px + py * py;
      if (d2 > 1) return 0;
      const term = k * Math.sqrt(Math.max(0, 1 - py * py));
      const isLit = phase < 0.5 ? px > term : px < -term;
      return isLit ? 2 : d2 > 0.78 ? 1 : 0;
    });
    const tx = x0 + cols + 3;
    if (tx + 10 < r.x + r.w) {
      const ty = r.y + Math.max(0, Math.floor((r.h - 3) / 2));
      ui.text(tx, ty, name, { fg: c.fg, attrs: BOLD }, r.x + r.w - tx);
      ui.text(tx, ty + 1, `${Math.round(lit * 100)}% lit`, { fg: c.muted });
      ui.text(tx, ty + 2, `day ${Math.floor(age)} of 29`, { fg: c.subtle });
    }
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
  render(ui, r) {
    const key = `${r.w}x${r.h}`;
    if (!rains.has(key)) rains.set(key, new Rain(0.8));
    const rain = rains.get(key)!;
    rain.speed = matrixLook.speed;
    rain.chars = MATRIX_SETS[matrixLook.set] ?? null;
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
  render(ui, r, { deck }) {
    const c = ui.c;
    const here = new Date();
    deck.settings.data.home.worldClocks.slice(0, r.h).forEach((tz, i) => {
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
      ui.text(r.x + 3, y, city, { fg: c.fg }, r.w - 16);
      ui.textRight(r.x + r.w - 1, y, `${day.toLowerCase()} ${time}`, { fg: night ? c.muted : c.accent, attrs: BOLD });
    });
    ui.animate(1000);
  },
  popup: {
    title: "world clock",
    size: { w: 56, h: 14 },
    hint: "a add · x remove · ↑↓",
    render(ui, r, { deck }) {
      const c = ui.c;
      const list = deck.settings.data.home.worldClocks;
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
    onText: (t, { deck }) => {
      if (t === "a" || t === "+") return void addClock(deck), true;
      if (t === "x") return removeClock(deck), true;
      return false;
    },
    onKey: (k, { deck }) => (k.combo === "delete" || k.combo === "backspace" ? (removeClock(deck), true) : false),
    onAction: (a, { deck }) => {
      const n = deck.settings.data.home.worldClocks.length;
      if (a === "up") return (worldSel = Math.max(0, worldSel - 1)), true;
      if (a === "down") return (worldSel = Math.min(n - 1, worldSel + 1)), true;
      return false;
    },
  },
};

let worldSel = 0;
function removeClock(deck: Deck): void {
  const tz = deck.settings.data.home.worldClocks[worldSel];
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
    const list = [...ctx.deck.settings.data.home.worldClocks];
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
    ctx.deck.settings.set("home.worldClocks", list);
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
    const lines: string[] = [];
    let line = "";
    for (const w of text.split(" ")) {
      if ((line + " " + w).trim().length > r.w - 4) {
        lines.push(line);
        line = w;
      } else line = (line + " " + w).trim();
    }
    lines.push(line);
    const top = r.y + Math.max(0, Math.floor((r.h - lines.length - 1) / 2));
    lines.slice(0, r.h - 1).forEach((l, i) => ui.textCenter(r, top + i, p < 1 ? decrypt(l, p, ui.now) : l, { fg: c.fg }));
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
      const lines: string[] = [];
      let line = "";
      for (const w of text.split(" ")) {
        if ((line + " " + w).trim().length > r.w - 8) {
          lines.push(line);
          line = w;
        } else line = (line + " " + w).trim();
      }
      lines.push(line);
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

const aiWidget: WidgetSpec = {
  id: "ai",
  title: "uplink",
  description: "your AI uplink: its state, a quick question",
  size: { w: 3, h: 6 },
  min: { w: 2, h: 2 },
  render(ui, r, { deck }) {
    const c = ui.c;
    const ok = deck.ai.ready;
    const label = deck.ai.provider.label;
    // four moods: idle (a slow orbit) · thinking (fast, two signals) · speaking (a voice wave) · offline
    const thinking = deck.ai.busy > 0;
    const speaking = deck.voice.speaking;
    const col = !ok ? c.error : thinking ? c.accentAlt : speaking ? c.info : c.accent;
    // a dotted orbit around a core; a signal runs the orbit, the core breathes
    // ring + a blank line + the label lines, centered in the card; the ring grows with it
    const lines = ok ? 2 : 3;
    const rows = Math.max(3, Math.min(r.h - lines - 1, 9));
    const top = r.y + Math.max(0, Math.round((r.h - rows - 1 - lines) / 2));
    const cols = Math.min(r.w, cellsFor(ui, rows));
    const box = { x: r.x + Math.floor((r.w - cols) / 2), y: top, w: cols, h: rows };
    const R = rows / 2 - 0.2, ox = (cols * ui.cellAspect) / 2, oy = rows / 2;
    const head = (ui.now / (thinking ? 500 : 1600)) % 1; // fraction of a turn
    const breath = (Math.sin(ui.now / (thinking ? 160 : 700)) + 1) / 2;
    dots(ui, box, [c.faint, mix(col, c.bg, 0.55), col, mix(col, 0xffffff, 0.45)], (x, y) => {
      const dx = x - ox, dy = y - oy, d = Math.hypot(dx, dy);
      if (speaking && Math.abs(dx) < R * 0.75 && d < R * 0.85) {
        // a voice waveform across the core
        const amp = (Math.sin(dx * 3.1 + ui.now / 90) * 0.5 + Math.sin(dx * 7.3 - ui.now / 60) * 0.3) * R * 0.45 * (0.6 + breath * 0.4);
        return Math.abs(dy - amp) < 0.09 ? 4 : Math.abs(dy) < 0.04 ? 1 : 0;
      }
      if (d < R * (0.22 + breath * 0.08)) return ok ? 3 : 2; // core
      if (Math.abs(d - R) < 0.07) {
        if (!ok) return 1;
        const a = ((Math.atan2(dy, dx) / (Math.PI * 2) + 1.25) % 1); // 0 at the top, clockwise
        const lag = (head - a + 1) % 1;
        const lag2 = (head + 0.5 - a + 1) % 1; // thinking: a second signal
        return lag < 0.03 || (thinking && lag2 < 0.03) ? 4 : lag < 0.25 || (thinking && lag2 < 0.25) ? 3 : 1;
      }
      // a faint inner ring, counter-rotating
      if (Math.abs(d - R * 0.6) < 0.05) {
        const a = (Math.atan2(dy, dx) / (Math.PI * 2) + 1 - head) % 1;
        return ok && (a * 12) % 1 < 0.5 ? 2 : 0;
      }
      return 0;
    });
    const y = top + rows + 1;
    if (y < r.y + r.h) ui.textCenter(r, y, label, { fg: c.fg, attrs: BOLD });
    const state = !ok ? "○ offline" : thinking ? "◌ processing" : speaking ? "◖ speaking" : "● uplink up";
    if (y + 1 < r.y + r.h) ui.textCenter(r, y + 1, state, { fg: !ok ? c.error : thinking ? c.accentAlt : speaking ? c.info : c.success });
    if (!ok && y + 2 < r.y + r.h) ui.textCenter(r, y + 2, deck.settings.data.privacy.stealth ? "stealth: local model only" : "enter: settings", { fg: c.faint });
    ui.animate(ok ? (thinking || speaking ? 33 : 50) : 1000);
  },
  activate: ({ deck }) => void deck.openApp(deck.ai.ready ? "link" : "settings"),
};

export { aiWidget };
export const EXTRA_WIDGETS: WidgetSpec[] = [aiWidget, newsWidget, tasksWidget, focusWidget, moonWidget, matrixWidget, worldWidget, quoteWidget, streakWidget];
