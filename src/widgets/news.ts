import { BOLD, DIM, type Rect } from "../core/grid";
import type { Action, KeyInput } from "../core/input";
import { countryOf, langOf } from "../core/location";
import { strWidth } from "../core/unicode";
import type { Deck } from "../deck";
import { decrypt } from "../fx/glitch";
import type { Command } from "../shell/types";
import type { UI } from "../ui/ui";
import type { Overlay } from "../workspace/overlays";
import type { WidgetSpec } from "./types";

/*
 * News for your area or a topic.
 *  - a search (your city, a topic) comes from Bing News RSS, which has a short
 *    summary per article and the direct link; Google News RSS is the fallback
 *    and gives the national top stories when there's nothing to search for.
 *  - the card is compact: hover a headline ~1 s and it scrolls so you can read
 *    it all; click it (or `news 3`) for the summary and a link out.
 */

export interface Headline { title: string; source: string; at: number; link: string; summary: string }

const state = {
  items: [] as Headline[],
  at: 0,
  key: "",
  loaded: false,
  error: null as string | null,
  loading: false,
};
const seenAt = new Map<string, number>();
let hover = { i: -1, since: 0 };

function query(deck: Deck): string {
  const loc = deck.settings.data.user.location;
  const topic = deck.settings.data.home.newsTopic;
  return topic || (loc.precision === "city" || loc.precision === "precise" || loc.precision === "country" ? loc.name : "");
}

function text(el: Element | null | undefined): string {
  return (el?.textContent ?? "").trim();
}

/** HTML fragments in Google's <description> → plain text. */
function stripHtml(s: string): string {
  const d = new DOMParser().parseFromString(s, "text/html");
  return (d.body.textContent ?? "").replace(/\s+/g, " ").trim();
}

function parse(xmlText: string): Headline[] {
  const xml = new DOMParser().parseFromString(xmlText, "text/xml");
  return [...xml.querySelectorAll("item")].slice(0, 30).map((it) => {
    let source = text(it.querySelector("source")) || text(it.getElementsByTagName("News:Source")[0]);
    let title = text(it.querySelector("title"));
    if (source && title.endsWith(` - ${source}`)) title = title.slice(0, -source.length - 3);
    let link = text(it.querySelector("link"));
    // Bing wraps the article URL in a click tracker: take the real one
    const direct = /[?&]url=([^&]+)/.exec(link)?.[1];
    if (direct) {
      const u = decodeURIComponent(direct);
      link = u.startsWith("https://") ? u : link;
    }
    link = link.replace(/^http:\/\//, "https://");
    let summary = stripHtml(text(it.querySelector("description")));
    if (!summary || summary.startsWith(title.slice(0, 30))) summary = "";
    if (!source) source = (() => { try { return new URL(link).hostname.replace(/^www\./, ""); } catch { return ""; } })();
    return { title, source, at: Date.parse(text(it.querySelector("pubDate"))) || 0, link, summary };
  });
}

export async function loadNews(deck: Deck): Promise<void> {
  const q = query(deck);
  const key = `${q}|${langOf(deck)}|${countryOf(deck)}`;
  state.loading = true;
  try {
    const rss = deck.platform.newsRss;
    if (!rss) throw new Error("news needs the desktop app");
    let items: Headline[] = [];
    if (q) items = await rss(q, langOf(deck), countryOf(deck), "bing").then(parse).catch(() => []);
    if (!items.length) items = parse(await rss(q, langOf(deck), countryOf(deck), "google"));
    Object.assign(state, { items, at: Date.now(), key, loaded: true, error: null });
  } catch (e) {
    state.error = e instanceof Error ? e.message : String(e);
  } finally {
    state.loading = false;
    deck.requestFrame();
  }
}

function stale(deck: Deck): boolean {
  const key = `${query(deck)}|${langOf(deck)}|${countryOf(deck)}`;
  return !state.loaded || state.key !== key || Date.now() - state.at > 20 * 60_000;
}

function when(deck: Deck, at: number): string {
  return at ? new Date(at).toLocaleString(deck.settings.data.user.locale || undefined, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "";
}

function wrap(s: string, w: number): string[] {
  const out: string[] = [];
  let line = "";
  for (const word of s.split(/\s+/)) {
    if (line && strWidth(line) + 1 + strWidth(word) > w) {
      out.push(line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  if (line) out.push(line);
  return out;
}

export const newsWidget: WidgetSpec = {
  id: "news",
  title: "news",
  description: "headlines for your area or a topic, with summaries",
  size: { w: 6, h: 5 },
  min: { w: 2, h: 2 },
  render(ui, r, { deck }) {
    const c = ui.c;
    if (stale(deck) && !state.loading && !state.error) void loadNews(deck);
    if (!state.loaded) return void ui.text(r.x + 1, r.y, state.error ? `⚠ ${state.error}` : `${ui.spinner()} pulling the feed…`, { fg: state.error ? c.error : c.muted }, r.w - 2);
    const q = query(deck);
    ui.text(r.x + 1, r.y, q ? `◉ ${q}` : `◉ top stories · ${countryOf(deck)}`, { fg: c.accentAlt, attrs: BOLD }, r.w - 2);
    let hovered = -1;
    state.items.slice(0, Math.max(0, r.h - 1)).forEach((h, i) => {
      const y = r.y + 1 + i;
      // new headlines decrypt in, staggered
      const first = seenAt.get(h.title) ?? (seenAt.set(h.title, ui.now + i * 90), ui.now + i * 90);
      const p = Math.min(1, Math.max(0, (ui.now - first) / 500));
      if (p < 1) ui.animate(40);
      const row = { x: r.x, y, w: r.w, h: 1 };
      const hot = ui.hovered(row);
      if (hot) hovered = i;
      const src = r.w >= 50 ? h.source.slice(0, 14) : "";
      const room = r.w - 5 - (src ? strWidth(src) + 1 : 0);
      ui.text(r.x + 1, y, ui.theme.glyphs.bullet, { fg: c.accent });
      let shown = p < 1 ? decrypt(h.title, p, ui.now) : h.title;
      // hovered ~1 s and too long: scroll it like a ticker
      if (hot && hover.i === i && strWidth(h.title) > room) {
        const t = ui.now - hover.since - 900;
        if (t > 0) {
          const loop = [...`${h.title}     ·     `];
          const off = Math.floor(t / 110) % loop.length;
          shown = [...loop.slice(off), ...loop.slice(0, off)].join("");
          ui.animate(110);
        } else ui.animate(Math.max(16, -t));
      }
      ui.text(r.x + 3, y, shown, { fg: hot ? c.accent : i === 0 ? c.fg : c.muted }, room);
      if (src) ui.textRight(r.x + r.w - 1, y, src, { fg: c.faint, attrs: DIM });
      ui.hit(row, { cmd: `news ${i + 1}`, tip: "summary, then open it in your browser" });
    });
    if (hovered !== hover.i) hover = { i: hovered, since: ui.now };
  },
  activate: ({ deck }) => {
    state.loaded = false;
    state.error = null;
    void loadNews(deck);
  },
};

/** The article card: full title, source, time, summary and a way out to the browser. */
class NewsCard implements Overlay {
  modal = true;
  done = false;
  constructor(
    private readonly deck: Deck,
    private readonly n: number,
  ) {}

  private get h(): Headline | undefined {
    return state.items[this.n - 1];
  }

  private open(): void {
    void this.deck.act(`news open ${this.n}`);
    this.done = true;
  }

  onKey(k: KeyInput): boolean {
    if (k.combo === "esc" || k.combo === "q") this.done = true;
    else if (k.combo === "enter" || k.combo === "o") this.open();
    else if (k.combo === "left" && this.n > 1) this.swap(this.n - 1);
    else if (k.combo === "right" && this.n < state.items.length) this.swap(this.n + 1);
    return true;
  }

  onText(t: string): boolean {
    if (t === "o") this.open();
    else if (t === "q") this.done = true;
    return true;
  }

  onAction(a: Action): boolean {
    if (a === "back") this.done = true;
    else if (a === "confirm") this.open();
    return true;
  }

  private swap(n: number): void {
    this.done = true;
    this.deck.workspace.push(new NewsCard(this.deck, n));
  }

  render(ui: UI, screen: Rect): void {
    const c = ui.c;
    const h = this.h;
    if (!h) return void (this.done = true);
    ui.tint(screen, c.faint, c.bg);
    const w = Math.min(76, screen.w - 6);
    const tw = w - 4;
    const title = wrap(h.title, tw);
    const summary = h.summary ? wrap(h.summary, tw) : [];
    const hgt = Math.min(screen.h - 4, title.length + summary.length + 7);
    const box = { x: Math.floor((screen.w - w) / 2), y: Math.max(1, Math.floor((screen.h - hgt) / 2)), w, h: hgt };
    const inner = ui.box(box, { title: `NEWS ${this.n}/${state.items.length}`, focused: true, bg: c.panelAlt, info: "←→ browse" });
    ui.hit(screen, { onClick: () => {}, onWheel: () => {} });
    ui.hit(box, { onClick: () => {} });
    let y = inner.y;
    for (const l of title) ui.text(inner.x + 1, y++, l, { fg: c.fg, attrs: BOLD }, tw);
    ui.text(inner.x + 1, y++, `${h.source}${h.at ? ` · ${when(this.deck, h.at)}` : ""}`, { fg: c.subtle }, tw);
    y++;
    if (summary.length) for (const l of summary) { if (y >= inner.y + inner.h - 2) break; ui.text(inner.x + 1, y++, l, { fg: c.muted }, tw); }
    else ui.text(inner.x + 1, y++, "no summary in the feed — open the article to read it", { fg: c.faint }, tw);
    const by = inner.y + inner.h - 1;
    let bx = inner.x + 1;
    if (h.link && this.deck.platform.openUrl) bx += ui.button(bx, by, "open in browser ↗  (enter)", () => this.open()) + 2;
    ui.button(bx, by, "close  (esc)", () => (this.done = true), { accent: c.subtle });
  }
}

export function showNews(deck: Deck, n: number): boolean {
  if (!state.items[n - 1]) return false;
  deck.workspace.push(new NewsCard(deck, n));
  deck.requestFrame();
  return true;
}

export const newsCommand: Command = {
  name: "news",
  examples: [
    ["news", "numbered headlines"],
    ["news 3", "summary of headline 3 (and the card on screen)"],
    ["news open 3", "read it in your browser"],
    ["news topic intelligence artificielle", "follow a topic instead of your city"],
    ["news topic -", "back to your city"],
  ],
  summary: "headlines for your area or topic; read one, open it",
  usage: "news              list the headlines\nnews <n>          summary of headline n (a card on screen)\nnews open <n>     open it in your browser\nnews refresh\nnews topic <words> | news topic -   (follow a topic / back to your city)",
  complete: () => ["open", "refresh", "topic"],
  async run(ctx) {
    const { deck } = ctx;
    const [a, b] = ctx.args;
    if (a === "topic") {
      deck.settings.set("home.newsTopic", b === "-" ? "" : ctx.args.slice(1).join(" "));
      await loadNews(deck);
      ctx.out(`news: ${query(deck) || "top stories"}\n`);
      return 0;
    }
    if (a === "refresh" || stale(deck)) await loadNews(deck);
    if (state.error) return ctx.err(`news: ${state.error}\n`), 1;
    if (!a || a === "refresh") {
      state.items.forEach((h, i) => ctx.out(`\x1b[35m${String(i + 1).padStart(2)}\x1b[0m ${h.title} \x1b[2m· ${h.source}\x1b[0m\n`));
      return 0;
    }
    const n = Number(a === "open" ? b : a);
    const h = state.items[n - 1];
    if (!h) return ctx.err(`news: no headline ${a === "open" ? b : a} (news to list them)\n`), 1;
    if (a === "open") {
      if (!deck.platform.openUrl || !h.link) return ctx.err("news: can't open links here\n"), 1;
      await deck.platform.openUrl(h.link);
      ctx.out(`\x1b[2mopened ${h.link}\x1b[0m\n`);
      return 0;
    }
    ctx.out(`\x1b[1m${h.title}\x1b[0m\n\x1b[2m${h.source}${h.at ? ` · ${when(deck, h.at)}` : ""}\x1b[0m\n${h.summary ? `${h.summary}\n` : ""}\x1b[2mnews open ${n} → browser\x1b[0m\n`);
    if (ctx.isTTY) showNews(deck, n);
    return 0;
  },
};
