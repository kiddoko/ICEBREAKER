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

const focus = { phase: "focus" as "focus" | "break", left: 25 * 60_000, running: false, last: 0, flashUntil: 0 };

const focusWidget: WidgetSpec = {
  id: "focus",
  title: "focus",
  description: "25/5 pomodoro — enter starts/pauses",
  size: { w: 4, h: 4 },
  min: { w: 2, h: 2 },
  render(ui, r, { deck }) {
    const c = ui.c;
    const now = Date.now();
    if (focus.running) {
      focus.left -= now - focus.last;
      focus.last = now;
      if (focus.left <= 0) {
        focus.phase = focus.phase === "focus" ? "break" : "focus";
        focus.left = (focus.phase === "focus" ? 25 : 5) * 60_000;
        focus.flashUntil = ui.now + 3000;
        deck.notify(focus.phase === "break" ? "focus done — take 5" : "break over — jack back in", "success");
      }
      ui.animate(250);
    }
    const total = (focus.phase === "focus" ? 25 : 5) * 60_000;
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
  activate: () => {
    focus.running = !focus.running;
    focus.last = Date.now();
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
const matrixWidget: WidgetSpec = {
  id: "matrix",
  title: "matrix",
  description: "digital rain. does nothing. looks great.",
  size: { w: 3, h: 6 },
  min: { w: 1, h: 2 },
  render(ui, r) {
    const key = `${r.w}x${r.h}`;
    if (!rains.has(key)) rains.set(key, new Rain(0.8));
    rains.get(key)!.render(ui, r);
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
  activate: () => {
    quoteIdx = -1;
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
  title: "neural link",
  description: "the AI you're wired to, and whether it's up",
  size: { w: 3, h: 6 },
  min: { w: 2, h: 2 },
  render(ui, r, { deck }) {
    const c = ui.c;
    const ok = deck.ai.ready;
    const label = deck.ai.provider.label;
    const col = ok ? c.accent : c.error;
    // a dotted orbit around a core; a signal runs the orbit, the core breathes
    // ring + a blank line + the label lines, centered in the card; the ring grows with it
    const lines = ok ? 2 : 3;
    const rows = Math.max(3, Math.min(r.h - lines - 1, 9));
    const top = r.y + Math.max(0, Math.round((r.h - rows - 1 - lines) / 2));
    const cols = Math.min(r.w, cellsFor(ui, rows));
    const box = { x: r.x + Math.floor((r.w - cols) / 2), y: top, w: cols, h: rows };
    const R = rows / 2 - 0.2, ox = (cols * ui.cellAspect) / 2, oy = rows / 2;
    const head = (ui.now / 1600) % 1; // fraction of a turn
    const breath = (Math.sin(ui.now / 700) + 1) / 2;
    dots(ui, box, [c.faint, mix(col, c.bg, 0.55), col, mix(col, 0xffffff, 0.45)], (x, y) => {
      const dx = x - ox, dy = y - oy, d = Math.hypot(dx, dy);
      if (d < R * (0.22 + breath * 0.08)) return ok ? 3 : 2; // core
      if (Math.abs(d - R) < 0.07) {
        if (!ok) return 1;
        const a = ((Math.atan2(dy, dx) / (Math.PI * 2) + 1.25) % 1); // 0 at the top, clockwise
        const lag = (head - a + 1) % 1;
        return lag < 0.03 ? 4 : lag < 0.25 ? 3 : 1;
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
    if (y + 1 < r.y + r.h) ui.textCenter(r, y + 1, ok ? "● link up" : "○ offline", { fg: ok ? c.success : c.error });
    if (!ok && y + 2 < r.y + r.h) ui.textCenter(r, y + 2, "enter: settings", { fg: c.faint });
    ui.animate(ok ? 50 : 1000);
  },
  activate: ({ deck }) => void deck.openApp(deck.ai.ready ? "link" : "settings"),
};

export const EXTRA_WIDGETS: WidgetSpec[] = [aiWidget, newsWidget, tasksWidget, focusWidget, moonWidget, matrixWidget, worldWidget, quoteWidget, streakWidget];
