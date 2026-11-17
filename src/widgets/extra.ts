import { mix } from "../core/color";
import { BOLD, DIM } from "../core/grid";
import { countryOf, langOf } from "../core/location";
import type { Deck } from "../deck";
import { decrypt } from "../fx/glitch";
import { Rain } from "../fx/rain";
import { basename } from "../vault/paths";
import { digitsSize, drawDigits, fitDigits, isoDay, streakOf } from "./builtin";
import type { WidgetSpec } from "./types";

/* Extra cards shipped with the deck: not all on the default HOME, all one `a` away. */

/* ─────────── news (Google News RSS, local to the user's location) ─────────── */

interface Headline { title: string; source: string; at: number; link: string }
let openNews = -1;
let news: { items: Headline[]; at: number; key: string } | null = null;
let newsError: string | null = null;
let newsLoading = false;
const seenAt = new Map<string, number>();

async function loadNews(deck: Deck, key: string, query: string): Promise<void> {
  newsLoading = true;
  try {
    if (!deck.platform.newsRss) throw new Error("news needs the desktop app");
    const xml = new DOMParser().parseFromString(await deck.platform.newsRss(query, langOf(deck), countryOf(deck)), "text/xml");
    const items = [...xml.querySelectorAll("item")].slice(0, 30).map((it) => {
      const source = it.querySelector("source")?.textContent ?? "";
      const raw = it.querySelector("title")?.textContent ?? "";
      return { title: source && raw.endsWith(` - ${source}`) ? raw.slice(0, -source.length - 3) : raw, source, at: Date.parse(it.querySelector("pubDate")?.textContent ?? "") || 0, link: it.querySelector("link")?.textContent ?? "" };
    });
    news = { items, at: Date.now(), key };
    newsError = null;
  } catch (e) {
    newsError = e instanceof Error ? e.message : String(e);
  } finally {
    newsLoading = false;
  }
}

const newsWidget: WidgetSpec = {
  id: "news",
  title: "news",
  description: "headlines for your area or a topic (Google News)",
  size: { w: 6, h: 5 },
  min: { w: 4, h: 2 },
  render(ui, r, { deck }) {
    const c = ui.c;
    const loc = deck.settings.data.user.location;
    const topic = deck.settings.data.home.newsTopic;
    const query = topic || (loc.precision === "city" || loc.precision === "precise" ? loc.name : "");
    const key = `${query}|${langOf(deck)}|${countryOf(deck)}`;
    if ((!news || news.key !== key || Date.now() - news.at > 20 * 60_000) && !newsLoading && !newsError) void loadNews(deck, key, query).then(() => deck.requestFrame());
    if (!news) return void ui.text(r.x + 1, r.y, newsError ? `⚠ ${newsError}` : `${ui.spinner()} pulling the feed…`, { fg: newsError ? c.error : c.muted }, r.w - 2);
    ui.text(r.x + 1, r.y, `${query ? `◉ ${query}` : `◉ top stories · ${countryOf(deck)}`}`, { fg: c.accentAlt, attrs: BOLD }, r.w - 2);
    let y = r.y + 1;
    news.items.forEach((h, i) => {
      if (y >= r.y + r.h) return;
      // new headlines decrypt in, staggered
      const first = seenAt.get(h.title) ?? (seenAt.set(h.title, ui.now + i * 90), ui.now + i * 90);
      const p = Math.min(1, Math.max(0, (ui.now - first) / 500));
      if (p < 1) ui.animate(40);
      const open = i === openNews;
      const row = { x: r.x, y, w: r.w, h: 1 };
      const hot = ui.hovered(row);
      const src = r.w >= 50 && !open ? h.source.slice(0, 14) : "";
      ui.text(r.x + 1, y, open ? "▾" : "›", { fg: c.accent });
      if (!open) {
        ui.text(r.x + 3, y, p < 1 ? decrypt(h.title, p, ui.now) : h.title, { fg: hot ? c.accent : i === 0 ? c.fg : c.muted }, r.w - 5 - (src ? src.length + 1 : 0));
        if (src) ui.textRight(r.x + r.w - 1, y, src, { fg: c.faint, attrs: DIM });
        ui.hit(row, { onClick: () => (openNews = i) });
        y++;
        return;
      }
      // unfolded: the whole title, where and when, and a link out
      for (const line of wrapText(h.title, r.w - 4)) {
        if (y >= r.y + r.h) return;
        ui.text(r.x + 3, y++, line, { fg: c.fg, attrs: BOLD });
      }
      if (y < r.y + r.h) {
        const when = h.at ? new Date(h.at).toLocaleString(deck.settings.data.user.locale || undefined, { weekday: "short", hour: "2-digit", minute: "2-digit" }) : "";
        ui.text(r.x + 3, y, `${h.source} · ${when}`, { fg: c.subtle }, r.w - 20);
        if (h.link && deck.platform.openUrl) ui.button(r.x + r.w - 12, y, "open ↗", () => void deck.platform.openUrl!(h.link));
        y++;
      }
      ui.hit({ x: r.x, y: row.y, w: r.w, h: 1 }, { onClick: () => (openNews = -1) });
    });

  },
  activate: ({ deck }) => {
    news = null;
    newsError = null;
    deck.requestFrame();
  },
};

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
  title: "tasks",
  description: "open checkboxes (- [ ]) from all your notes",
  size: { w: 4, h: 6 },
  min: { w: 3, h: 2 },
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
      ui.text(r.x + 1, row.y, hot ? "▣" : "□", { fg: hot ? c.accent : c.subtle });
      ui.text(r.x + 3, row.y, t.text, { fg: hot ? c.accent : c.fg }, r.w - 4 - (r.w > 40 ? 14 : 0));
      if (r.w > 40) ui.textRight(r.x + r.w - 1, row.y, basename(t.path, ".md").slice(0, 12), { fg: c.faint });
      ui.hit(row, { onClick: () => void deck.openFile(t.path) });
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
  min: { w: 3, h: 2 },
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
    const k = fitDigits(t, r.w - 2, r.h - 2, 3);
    const label = `${focus.running ? "▶" : "❚❚"} ${focus.phase.toUpperCase()}`;
    if (k) {
      const d = digitsSize(t, k);
      const y = r.y + Math.max(0, Math.floor((r.h - d.h - 2) / 2));
      drawDigits(ui, r.x + Math.floor((r.w - d.w) / 2), y, t, k, flash ? [c.fg] : [col, mix(col, c.bg, 0.3)], "focus", false);
      ui.bar(r.x + Math.floor((r.w - d.w) / 2), y + d.h, d.w, 1 - focus.left / total, col, c.faint);
      ui.textCenter(r, y + d.h + 1, label, { fg: focus.running ? col : c.subtle, attrs: BOLD });
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
  min: { w: 3, h: 3 },
  render(ui, r) {
    const c = ui.c;
    const synodic = 29.530588853;
    const age = (((Date.now() / 86400000 - 10957.76) % synodic) + synodic) % synodic; // days since new moon
    const phase = age / synodic;
    const lit = (1 - Math.cos(phase * 2 * Math.PI)) / 2;
    const names = ["new moon", "waxing crescent", "first quarter", "waxing gibbous", "full moon", "waning gibbous", "last quarter", "waning crescent"];
    const name = names[Math.round(phase * 8) % 8];
    // braille disc: 2×4 dots per cell → a smooth circle at any size
    const rows = Math.max(2, Math.min(r.h, 6));
    const cols = rows * 2; // cells are ~2:1, so twice as many columns
    const R = rows * 2; // radius in dots (4 dots per row / 2)
    const x0 = r.x + 1, y0 = r.y + Math.floor((r.h - rows) / 2);
    const BITS = [[0x1, 0x8], [0x2, 0x10], [0x4, 0x20], [0x40, 0x80]];
    for (let cy = 0; cy < rows; cy++)
      for (let cx = 0; cx < cols; cx++) {
        let litBits = 0, rim = 0;
        for (let dy = 0; dy < 4; dy++)
          for (let dx = 0; dx < 2; dx++) {
            const px = (cx * 2 + dx + 0.5 - R) / R, py = (cy * 4 + dy + 0.5 - R) / R;
            const d2 = px * px + py * py;
            if (d2 > 1) continue;
            const term = Math.cos(phase * 2 * Math.PI) * Math.sqrt(Math.max(0, 1 - py * py));
            const isLit = phase < 0.5 ? px > term : px < -term;
            if (isLit) litBits |= BITS[dy][dx];
            else if (d2 > 0.72) rim |= BITS[dy][dx];
          }
        if (litBits) ui.text(x0 + cx, y0 + cy, String.fromCodePoint(0x2800 + litBits), { fg: mix(c.fg, c.warning, 0.2) });
        else if (rim) ui.text(x0 + cx, y0 + cy, String.fromCodePoint(0x2800 + rim), { fg: c.faint });
      }
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
  min: { w: 3, h: 2 },
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
  min: { w: 3, h: 2 },
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
  min: { w: 3, h: 1 },
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

function wrapText(s: string, w: number): string[] {
  const out: string[] = [];
  let line = "";
  for (const word of s.split(" ")) {
    if ((line + " " + word).trim().length > w) {
      out.push(line);
      line = word;
    } else line = (line + " " + word).trim();
  }
  if (line) out.push(line);
  return out;
}

/* ─────────── AI core: which model is wired in, as a breathing node ─────────── */

const aiWidget: WidgetSpec = {
  id: "ai",
  title: "neural link",
  description: "the AI you're wired to, and whether it's up",
  size: { w: 3, h: 6 },
  min: { w: 3, h: 3 },
  render(ui, r, { deck }) {
    const c = ui.c;
    const ok = deck.ai.ready;
    const label = deck.ai.provider.label;
    const col = ok ? c.accent : c.error;
    // a ring of nodes around a core; a signal travels the ring, the core breathes
    const rows = Math.max(3, Math.min(r.h - 2, 7));
    const cx = r.x + Math.floor(r.w / 2), cy = r.y + Math.floor(rows / 2);
    const ry = Math.floor(rows / 2), rx = ry * 2;
    const n = 12;
    const head = Math.floor(ui.now / 140) % n;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 - Math.PI / 2;
      const x = cx + Math.round(Math.cos(a) * rx), y = cy + Math.round(Math.sin(a) * ry);
      const dist = (head - i + n) % n;
      const glyph = !ok ? "·" : dist === 0 ? "◆" : dist < 3 ? "◇" : "·";
      ui.text(x, y, glyph, { fg: ok && dist < 3 ? mix(col, 0xffffff, 0.5 - dist * 0.2) : c.faint });
    }
    const breath = (Math.sin(ui.now / 700) + 1) / 2;
    ui.text(cx - 1, cy, ok ? "[■]" : "[×]", { fg: mix(col, c.bg, 0.5 - breath * 0.5), attrs: BOLD });
    const y = r.y + rows + 1;
    if (y < r.y + r.h) ui.textCenter(r, y, label, { fg: c.fg, attrs: BOLD });
    if (y + 1 < r.y + r.h) ui.textCenter(r, y + 1, ok ? "● link up" : "○ offline", { fg: ok ? c.success : c.error });
    if (!ok && y + 2 < r.y + r.h) ui.textCenter(r, y + 2, "enter: settings", { fg: c.faint });
    ui.animate(ok ? 140 : 1000);
  },
  activate: ({ deck }) => void deck.openApp(deck.ai.ready ? "link" : "settings"),
};

export const EXTRA_WIDGETS: WidgetSpec[] = [aiWidget, newsWidget, tasksWidget, focusWidget, moonWidget, matrixWidget, worldWidget, quoteWidget, streakWidget];
