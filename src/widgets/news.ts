import { t } from "../core/i18n";
import { setWidgetSetting, widgetConfig, widgetTarget } from "./instances";
import { BOLD, DIM, type Rect } from "../core/grid";
import type { Action, KeyInput } from "../core/input";
import { countryOf, langOf } from "../core/location";
import { strWidth, truncate, wrapWords } from "../core/unicode";
import type { Deck } from "../deck";
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

export interface Headline { title: string; source: string; at: number; link: string; summary: string; /** the interest it came from */ tag?: string }

/** Ready-made categories: the words searched, in English and French. */
export const NEWS_CATEGORIES: Record<string, { en: string; fr: string; label: string }> = {
  tech: { en: "technology", fr: "technologie", label: "tech" },
  ai: { en: "artificial intelligence", fr: "intelligence artificielle", label: "AI" },
  science: { en: "science", fr: "science", label: "science" },
  space: { en: "space exploration", fr: "espace astronomie", label: "space" },
  politics: { en: "politics", fr: "politique", label: "politics" },
  world: { en: "world news", fr: "international", label: "world" },
  business: { en: "business economy", fr: "économie", label: "business" },
  people: { en: "celebrities", fr: "people", label: "people" },
  culture: { en: "culture", fr: "culture", label: "culture" },
  art: { en: "art exhibition", fr: "art exposition", label: "art" },
  music: { en: "music", fr: "musique", label: "music" },
  cinema: { en: "movies", fr: "cinéma", label: "cinema" },
  gaming: { en: "video games", fr: "jeux vidéo", label: "gaming" },
  sports: { en: "sports", fr: "sport", label: "sports" },
  health: { en: "health", fr: "santé", label: "health" },
  environment: { en: "climate environment", fr: "climat environnement", label: "environment" },
  nature: { en: "nature wildlife", fr: "nature animaux", label: "nature" },
  security: { en: "cybersecurity", fr: "cybersécurité", label: "security" },
};
/** What to search for an interest: a category's words in your language, or the words themselves. */
const interestQuery = (deck: Deck, i: string) => {
  const cat = NEWS_CATEGORIES[i.toLowerCase()];
  return cat ? (langOf(deck).startsWith("fr") ? cat.fr : cat.en) : i;
};
const interests = (deck: Deck) => deck.settings.data.home.newsInterests ?? [];

const state = {
  items: [] as Headline[],
  at: 0,
  key: "",
  loaded: false,
  error: null as string | null,
  loading: false,
  /** The local feed was thin: national news were added. */
  widened: false,
};
const seenAt = new Map<string, number>();

/**
 * A news widget copy can show only some categories (its own setting "cats"):
 * each set of categories has its own feed here. A copy without categories shows
 * the shared feed (your area + your interests, `state`).
 */
interface Feed {
  items: Headline[];
  at: number;
  loading: boolean;
  error: string | null;
}
const feeds = new Map<string, Feed>();
const catsOf = (deck: Deck, key?: string): string[] => widgetConfig<string[]>(deck, key, "cats", []).filter(Boolean);
function feedOf(cats: string[]): Feed {
  const id = [...cats].sort().join(",");
  let f = feeds.get(id);
  if (!f) feeds.set(id, (f = { items: [], at: 0, loading: false, error: null }));
  return f;
}

/** Load the feed of some categories: a few recent headlines each, woven together. */
async function loadCats(deck: Deck, cats: string[]): Promise<void> {
  const f = feedOf(cats);
  f.loading = true;
  try {
    const rss = deck.platform.newsRss;
    if (!rss) throw new Error("news needs the desktop app");
    const fresh = (l: Headline[]) => l.filter((h) => !h.at || Date.now() - h.at < 21 * 86400_000);
    const per = Math.max(4, Math.floor(30 / cats.length));
    const batches = await Promise.all(
      cats.map((cat) =>
        rss(interestQuery(deck, cat), langOf(deck), countryOf(deck), "bing")
          .then(parse)
          .catch(() => [] as Headline[])
          .then((l) => fresh(l).slice(0, per).map((h) => ({ ...h, tag: NEWS_CATEGORIES[cat]?.label ?? cat }))),
      ),
    );
    const woven: Headline[] = [];
    for (let k = 0; k < per; k++) for (const list of batches) if (list[k] && !woven.some((w) => w.title === list[k].title)) woven.push(list[k]);
    if (!woven.length) throw new Error("no recent news in these categories");
    Object.assign(f, { items: woven.slice(0, 30), at: Date.now(), error: null });
  } catch (e) {
    f.error = e instanceof Error ? e.message : String(e);
  } finally {
    f.loading = false;
    deck.requestFrame();
  }
}

/** "à la une": the headline a featured copy shows now (a new one every 10 min, or on a click) */
const featured = new Map<string, { i: number; at: number }>();
function featuredIndex(key: string, n: number, next = false): number {
  const cur = featured.get(key);
  if (!cur || next || Date.now() - cur.at > 10 * 60_000 || cur.i >= n) {
    let i = Math.floor(Math.random() * n);
    if (cur && n > 1 && i === cur.i) i = (i + 1) % n;
    featured.set(key, { i, at: Date.now() });
    return i;
  }
  return cur.i;
}
/** the headlines on screen (other modules read them through ib.modules: news.headlines) */
export const currentHeadlines = (): Headline[] => state.items.slice();

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
  // a line break or the end of a block is a space in plain text ("CULTURE<br>Dakar" → "CULTURE Dakar")
  s = s.replace(/<br\s*\/?>|<\/(?:p|div|li|h[1-6]|tr|td|blockquote)>/gi, "$& ");
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
  const key = `${q}|${langOf(deck)}|${countryOf(deck)}|${interests(deck).join(",")}`;
  state.loading = true;
  try {
    const rss = deck.platform.newsRss;
    if (!rss) throw new Error("news needs the desktop app");
    // only recent news; a quiet village gets its wider area added (then the national news)
    const fresh = (l: Headline[]) => l.filter((h) => !h.at || Date.now() - h.at < 21 * 86400_000);
    const add = (base: Headline[], more: Headline[]) => [...base, ...more.filter((m) => !base.some((b) => b.title === m.title))].slice(0, 30);
    const get = (query: string, p: "bing" | "google") => rss(query, langOf(deck), countryOf(deck), p).then(parse).catch(() => [] as Headline[]);
    let items: Headline[] = q ? fresh(await get(q, "bing")) : [];
    if (q && items.length < 5) items = add(items, fresh(await get(q, "google")));
    state.widened = items.length < 5;
    if (items.length < 5) items = add(items, fresh(await get("", "google")));
    // your interests, a few headlines each, woven in with the local ones
    const mine = interests(deck);
    if (mine.length) {
      const per = Math.max(3, Math.floor(24 / (mine.length + 1)));
      const batches = await Promise.all(mine.map((i) => get(interestQuery(deck, i), "bing").then((l) => fresh(l).slice(0, per).map((h) => ({ ...h, tag: NEWS_CATEGORIES[i.toLowerCase()]?.label ?? i })))));
      const local = items.slice(0, per + 2);
      const woven: Headline[] = [];
      for (let k = 0; k < per + 2; k++) for (const list of [local, ...batches]) if (list[k] && !woven.some((w) => w.title === list[k].title)) woven.push(list[k]);
      items = woven.slice(0, 30);
    }
    if (!items.length) throw new Error("no recent news");
    Object.assign(state, { items, at: Date.now(), key, loaded: true, error: null });
  } catch (e) {
    state.error = e instanceof Error ? e.message : String(e);
  } finally {
    state.loading = false;
    deck.requestFrame();
  }
}

function stale(deck: Deck): boolean {
  const key = `${query(deck)}|${langOf(deck)}|${countryOf(deck)}|${interests(deck).join(",")}`;
  return !state.loaded || state.key !== key || Date.now() - state.at > 20 * 60_000;
}

function when(deck: Deck, at: number): string {
  return at ? new Date(at).toLocaleString(deck.settings.data.user.locale || undefined, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "";
}

export const newsWidget: WidgetSpec = {
  id: "news",
  title: "news",
  description: "headlines for your area or a topic, with summaries",
  size: { w: 6, h: 5 },
  min: { w: 2, h: 2 },
  render(ui, r, { deck, key }) {
    const c = ui.c;
    // this copy: its categories (else the shared feed: your area + interests), list or "à la une"
    const cats = catsOf(deck, key);
    const mode = widgetConfig<string>(deck, key, "mode", "list");
    let items: Headline[], header: string;
    if (cats.length) {
      const f = feedOf(cats);
      if ((!f.at || Date.now() - f.at > 20 * 60_000) && !f.loading && !f.error) void loadCats(deck, cats);
      items = f.items;
      const error = f.error;
      header = `◉ ${cats.map((x) => NEWS_CATEGORIES[x]?.label ?? x).join(" · ")}`;
      if (!f.at) return void ui.text(r.x + 1, r.y, error ? `⚠ ${error}` : `${ui.spinner()} pulling the feed…`, { fg: error ? c.error : c.muted }, r.w - 2);
    } else {
      if (stale(deck) && !state.loading && !state.error) void loadNews(deck);
      if (!state.loaded) return void ui.text(r.x + 1, r.y, state.error ? `⚠ ${state.error}` : `${ui.spinner()} pulling the feed…`, { fg: state.error ? c.error : c.muted }, r.w - 2);
      items = state.items;
      const q = query(deck);
      header = q ? `◉ ${q}${state.widened ? ` + ${countryOf(deck)}` : ""}` : `◉ top stories · ${countryOf(deck)}`;
    }
    const open = (i: number) => (cats.length ? showCard(deck, items, i + 1) : void deck.act(`news ${i + 1}`));

    if (mode === "featured" && items.length) {
      // à la une: one headline, big, with its summary
      const i = featuredIndex(key ?? "news", items.length);
      const h = items[i];
      const tw = r.w - 2;
      // "à la une" first (it said nothing when a long list of categories pushed it out), then
      // this article's own category or, without one, the feed's
      ui.text(r.x + 1, r.y, `◉ ${t("à la une")} · ${h.tag ? (NEWS_CATEGORIES[h.tag]?.label ?? h.tag) : header.replace(/^◉ /, "")}`, { fg: c.accentAlt, attrs: BOLD }, tw);
      let y = r.y + 2;
      for (const l of wrapWords(h.title, tw).slice(0, Math.max(1, Math.floor((r.h - 3) / 2)))) ui.text(r.x + 1, y++, l, { fg: c.accent, attrs: BOLD }, tw);
      if (y < r.y + r.h) ui.text(r.x + 1, y++, `${h.tag ? `[${h.tag}] ` : ""}${h.source}${h.at ? ` · ${when(deck, h.at)}` : ""}`, { fg: c.subtle }, tw);
      y++;
      const lines = wrapWords(h.summary || t("no summary in the feed — click to read it"), tw);
      const room = Math.max(0, r.y + r.h - 1 - y);
      lines.slice(0, room).forEach((l, k) => {
        // the last line that fits ends with … when the summary goes on
        const cut = k === room - 1 && lines.length > room;
        ui.text(r.x + 1, y++, cut ? truncate(`${l} …`, tw) : l, { fg: h.summary ? c.fg : c.faint }, tw);
      });
      const nx = { x: r.x + r.w - 3, y: r.y + r.h - 1, w: 3, h: 1 };
      ui.text(nx.x, nx.y, " ↻ ", { fg: ui.hovered(nx) ? c.accent : c.subtle, attrs: BOLD });
      ui.hit({ x: r.x, y: r.y + 1, w: r.w, h: r.h - 2 }, { onClick: () => open(i), tip: t("the article · ↻ another one") });
      ui.hit(nx, { onClick: () => void (featuredIndex(key ?? "news", items.length, true), deck.requestFrame()), tip: t("another headline") });
      ui.animate(60_000);
      return;
    }

    ui.text(r.x + 1, r.y, header, { fg: c.accentAlt, attrs: BOLD }, r.w - 2);
    items.slice(0, Math.max(0, r.h - 1)).forEach((h, i) => {
      const y = r.y + 1 + i;
      // new headlines decrypt in, staggered
      const first = seenAt.get(h.title) ?? (seenAt.set(h.title, ui.now + i * 90), ui.now + i * 90);
      const p = Math.min(1, Math.max(0, (ui.now - first) / 500));
      const row = { x: r.x, y, w: r.w, h: 1 };
      const hot = ui.hovered(row);
      const src = r.w >= 50 ? h.source.slice(0, 14) : "";
      const room = r.w - 5 - (src ? strWidth(src) + 1 : 0);
      ui.text(r.x + 1, y, ui.theme.glyphs.bullet, { fg: c.accent });
      // an interest's headline wears its tag, dimly
      const tagW = h.tag && r.w >= 34 ? strWidth(h.tag) + 3 : 0;
      if (tagW) ui.text(r.x + 3, y, `[${h.tag}]`, { fg: c.subtle });
      const shown = ui.reveal(h.title, p);
      // too long: it scrolls by itself under the mouse (ui.text does it everywhere)
      ui.text(r.x + 3 + tagW, y, shown, { fg: hot ? c.accent : i === 0 ? c.fg : c.muted }, room - tagW);
      if (src) ui.textRight(r.x + r.w - 1, y, src, { fg: c.faint, attrs: DIM });
      ui.hit(row, cats.length ? { onClick: () => open(i), tip: "summary, then open it in your browser" } : { cmd: `news ${i + 1}`, tip: "summary, then open it in your browser" });
    });
  },
  activate: ({ deck, key }) => {
    const cats = catsOf(deck, key);
    if (cats.length) {
      const f = feedOf(cats);
      f.error = null;
      return void loadCats(deck, cats);
    }
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
    /** the headlines it browses (a copy's own categories; else the shared feed) */
    private readonly items: Headline[] = state.items,
  ) {}

  private get h(): Headline | undefined {
    return this.items[this.n - 1];
  }

  private open(): void {
    const h = this.h;
    if (h?.link && this.deck.platform.openUrl) void this.deck.platform.openUrl(h.link);
    this.done = true;
  }

  onKey(k: KeyInput): boolean {
    if (k.combo === "esc" || k.combo === "q") this.done = true;
    else if (k.combo === "enter" || k.combo === "o") this.open();
    else if (k.combo === "left" && this.n > 1) this.swap(this.n - 1);
    else if (k.combo === "right" && this.n < this.items.length) this.swap(this.n + 1);
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
    this.deck.workspace.push(new NewsCard(this.deck, n, this.items));
  }

  render(ui: UI, screen: Rect): void {
    const c = ui.c;
    const h = this.h;
    if (!h) return void (this.done = true);
    ui.tint(screen, c.faint, c.bg);
    const w = Math.min(76, screen.w - 6);
    const tw = w - 4;
    const title = wrapWords(h.title, tw);
    const summary = h.summary ? wrapWords(h.summary, tw) : [];
    const hgt = Math.min(screen.h - 4, title.length + summary.length + 7);
    const box = { x: Math.floor((screen.w - w) / 2), y: Math.max(1, Math.floor((screen.h - hgt) / 2)), w, h: hgt };
    const inner = ui.box(box, { title: `NEWS ${this.n}/${this.items.length}`, focused: true, bg: c.panelAlt, info: "←→ browse" });
    ui.hit(screen, { onClick: () => {}, onWheel: () => {}, block: true });
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

/** A copy's own headline, on its card. */
function showCard(deck: Deck, items: Headline[], n: number): void {
  if (!items[n - 1]) return;
  deck.workspace.push(new NewsCard(deck, n, items));
  deck.requestFrame();
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
  usage: "news              list the headlines\nnews <n>          summary of headline n (a card on screen)\nnews open <n>     open it in your browser\nnews refresh\nnews topic <words> | news topic -   (follow a topic / back to your city)\nnews add <category | words>        an interest, mixed in (news add tech, news add \"formula 1\")\nnews rm <…> · news interests       (categories: tech ai science space politics world business people culture art music cinema gaming sports health environment nature security)\nnews show <categories> | +cat | -cat | all   a news widget's own categories (its pop-up open)\nnews mode list | featured          that widget: headlines, or one at a time in big with its summary",
  complete: () => ["open", "refresh", "topic", "add", "rm", "interests", "show", "mode", "featured", "list", ...Object.keys(NEWS_CATEGORIES)],
  async run(ctx) {
    const { deck } = ctx;
    const [a, b] = ctx.args;
    // a news widget copy (its pop-up open, or selected): its categories and its mode
    if (a === "show" || a === "mode") {
      const target = widgetTarget("news");
      if (!target) return ctx.err(`news ${a}: open a news widget's pop-up first (or select it on HOME)\n`), 1;
      if (a === "mode") {
        if (b !== "list" && b !== "featured") return ctx.err("usage: news mode list | featured\n"), 1;
        setWidgetSetting(deck, "news", "mode", b);
        return ctx.out(`news (${target}): ${b}\n`), 0;
      }
      const words = ctx.args.slice(1).map((x) => x.toLowerCase());
      const cur = catsOf(deck, target);
      // news show science ai · news show +nature · news show -ai · news show all (back to the shared feed)
      let next = words[0] === "all" || words[0] === "-" ? [] : words.some((w) => /^[+-]/.test(w)) ? [...cur] : [];
      for (const w of words) {
        if (w === "all" || w === "-") continue;
        const c2 = w.replace(/^[+-]/, "");
        if (w.startsWith("-")) next = next.filter((x) => x !== c2);
        else if (!next.includes(c2)) next.push(c2);
      }
      setWidgetSetting(deck, "news", "cats", next);
      return ctx.out(`news (${target}): ${next.length ? next.join(", ") : "your area + interests"}\n`), 0;
    }
    if (a === "interests" || a === "categories") {
      ctx.out(`${"\x1b[1m"}yours:\x1b[0m ${interests(deck).join(", ") || "\x1b[2mnone — news add tech\x1b[0m"}\n`);
      ctx.out(`\x1b[2mcategories: ${Object.keys(NEWS_CATEGORIES).join(" ")}  (or any words: news add "formula 1")\x1b[0m\n`);
      return 0;
    }
    if (a === "add" || a === "rm") {
      const what = ctx.args.slice(1).join(" ").trim().toLowerCase();
      if (!what) return ctx.err(`usage: news ${a} <category | words>\n`), 1;
      const cur = interests(deck);
      const next = a === "add" ? [...new Set([...cur, what])] : cur.filter((x) => x !== what);
      if (next.length === cur.length) return ctx.err(a === "add" ? `news: already following ${what}\n` : `news: not following ${what}\n`), 1;
      deck.settings.set("home.newsInterests", next);
      await loadNews(deck);
      ctx.out(`news: ${next.join(", ") || "your area only"}\n`);
      return 0;
    }
    if (a === "topic") {
      deck.settings.set("home.newsTopic", b === "-" ? "" : ctx.args.slice(1).join(" "));
      await loadNews(deck);
      ctx.out(`news: ${query(deck) || "top stories"}\n`);
      return 0;
    }
    if (a === "refresh" || stale(deck)) await loadNews(deck);
    if (state.error) return ctx.err(`news: ${state.error}\n`), 1;
    if (!a || a === "refresh") {
      state.items.forEach((h, i) => ctx.out(`\x1b[35m${String(i + 1).padStart(2)}\x1b[0m ${h.tag ? `\x1b[36m[${h.tag}]\x1b[0m ` : ""}${h.title} \x1b[2m· ${h.source}\x1b[0m\n`));
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
