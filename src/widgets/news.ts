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
 * NEWS — headlines with their summaries (Refonte UI: the user's choice "A").
 *
 * Each news widget answers ONE question, "what do I show?": your area, your country's
 * top stories, some categories (ticked), or your own words. It's chosen in the widget
 * (its pop-up) and its header always says it (◉ Paris, ◉ science · AI, ◉ “formula 1”).
 * The NEWS page (apps/news.ts) offers the same four as tabs.
 *  - a search (your city, a category, your words) comes from Bing News RSS (a short
 *    summary per article and the direct link); Google News RSS is the fallback and
 *    gives the national top stories.
 *  - Before this, a widget showed "the shared feed" (your area or a global topic, plus
 *    global interests mixed in) unless it had categories: a widget with no source saved
 *    is read the old way once (its categories, else the old topic, else your area).
 */

export interface Headline { title: string; source: string; at: number; link: string; summary: string; /** the interest it came from */ tag?: string }

/** Ready-made categories: the words searched, in English and French. */
export const NEWS_CATEGORIES: Record<string, { en: string; fr: string; label: string }> = {
  tech: { en: "technology", fr: "technologie", label: "tech" },
  ai: { en: "artificial intelligence", fr: "intelligence artificielle", label: "AI" },
  science: { en: "science", fr: "science", label: "science" },
  // (labelled "astronomy": "space" is a key name, drawn as a keycap)
  space: { en: "space exploration", fr: "espace astronomie", label: "astronomy" },
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
/** the headlines last on screen (other modules read them through ib.modules: news.headlines) */
let lastShown: Headline[] = [];
export const currentHeadlines = (): Headline[] => lastShown.slice();

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

// ── sources: what a feed shows (the NEWS page; Refonte UI) ────────────────────

/** What a feed shows: your area, your country's top stories, some categories, or your own words. */
export type NewsSource = { kind: "area" } | { kind: "country" } | { kind: "cats"; cats: string[] } | { kind: "topic"; words: string };

/** a source's id (its feed in the cache, a tab's key) */
export function sourceId(s: NewsSource): string {
  return s.kind === "cats" ? `cats:${[...s.cats].sort().join(",")}` : s.kind === "topic" ? `topic:${s.words.trim().toLowerCase()}` : s.kind;
}

/** A source back from its id ("area", "country", "cats:ai,science", "topic:formula 1"); null if it isn't one. */
export function parseSource(id: unknown): NewsSource | null {
  if (typeof id !== "string") return null;
  if (id === "area" || id === "country") return { kind: id };
  if (id.startsWith("cats:")) {
    const cats = id.slice(5).split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);
    return cats.length ? { kind: "cats", cats } : null;
  }
  if (id.startsWith("topic:") && id.slice(6).trim()) return { kind: "topic", words: id.slice(6).trim() };
  return null;
}

/**
 * What widget copy `key` shows: its source; a copy saved before sources is read the
 * old way (its categories, else the old global topic, else your area).
 */
export function widgetSource(deck: Deck, key: string | undefined): NewsSource {
  const saved = parseSource(widgetConfig<string>(deck, key, "source", ""));
  if (saved) return saved;
  const cats = widgetConfig<string[]>(deck, key, "cats", []).filter(Boolean);
  if (cats.length) return { kind: "cats", cats };
  const topic = deck.settings.data.home.newsTopic;
  return topic ? { kind: "topic", words: topic } : { kind: "area" };
}

/** the NEWS page's categories (its own; before it had them, your old interests) */
export const followedCats = (deck: Deck): string[] => (deck.settings.data.home.newsPage?.cats ?? deck.settings.data.home.newsInterests ?? []).map((x) => x.toLowerCase()).filter((x) => !!NEWS_CATEGORIES[x]);
/** the NEWS page's words (its own; before, the old topic, else an old interest that wasn't a category) */
export const followedWords = (deck: Deck): string => deck.settings.data.home.newsPage?.words ?? (deck.settings.data.home.newsTopic || (deck.settings.data.home.newsInterests ?? []).find((x) => !NEWS_CATEGORIES[x.toLowerCase()]) || "");

/** your area's name, when the location says one (a city or a country) */
function areaName(deck: Deck): string {
  const loc = deck.settings.data.user.location;
  return loc.precision === "city" || loc.precision === "precise" || loc.precision === "country" ? loc.name : "";
}

/** a place is set (else "your area" is just your country: its button isn't shown beside ⚑) */
export const hasArea = (deck: Deck): boolean => !!areaName(deck);

/** What a source is called on screen: "Paris", "FR", "science · AI", "“formula 1”". */
export function sourceLabel(deck: Deck, s: NewsSource): string {
  // no place set: your area's feed is your country's top stories, and says so
  if (s.kind === "area") return areaName(deck) || countryOf(deck) || t("your area");
  if (s.kind === "country") return countryOf(deck) || t("top stories");
  if (s.kind === "cats") return s.cats.map((x) => NEWS_CATEGORIES[x]?.label ?? x).join(" · ");
  return `“${s.words}”`;
}

interface Feed {
  items: Headline[];
  at: number;
  loading: boolean;
  error: string | null;
}
interface SourceFeed extends Feed {
  /** your area's feed was thin: the national news were added */
  widened?: boolean;
}
const bySource = new Map<string, SourceFeed>();

/** A source's feed: loaded (again) when it's missing or 20 minutes old. */
export function sourceFeed(deck: Deck, s: NewsSource): SourceFeed {
  const id = sourceId(s);
  let f = bySource.get(id);
  if (!f) bySource.set(id, (f = { items: [], at: 0, loading: false, error: null }));
  if ((!f.at || Date.now() - f.at > 20 * 60_000) && !f.loading && !f.error) void loadSource(deck, s, f);
  return f;
}

/** Load a source again now (↻, `news refresh`). */
export function refreshSource(deck: Deck, s: NewsSource): void {
  const f = sourceFeed(deck, s);
  f.error = null;
  if (!f.loading) void loadSource(deck, s, f);
}

async function loadSource(deck: Deck, s: NewsSource, f: SourceFeed): Promise<void> {
  f.loading = true;
  try {
    const rss = deck.platform.newsRss;
    if (!rss) throw new Error("news needs the desktop app");
    const fresh = (l: Headline[]) => l.filter((h) => !h.at || Date.now() - h.at < 21 * 86400_000);
    const add = (base: Headline[], more: Headline[]) => [...base, ...more.filter((m) => !base.some((b) => b.title === m.title))].slice(0, 30);
    const get = (q: string, p: "bing" | "google") => rss(q, langOf(deck), countryOf(deck), p).then(parse).catch(() => [] as Headline[]);
    let items: Headline[] = [];
    let widened = false;
    if (s.kind === "cats") {
      // a few recent headlines of each category, woven together, each wearing its category
      const per = Math.max(4, Math.floor(30 / Math.max(1, s.cats.length)));
      // this week's: Bing (it has summaries) when it has enough of them, else Google News limited to
      // the last 7 days ("when:7d") — a category word also matches old pages that just say it
      const week = (l: Headline[]) => l.filter((h) => h.at && Date.now() - h.at < 7 * 86400_000);
      const forCat = async (cat: string): Promise<Headline[]> => {
        const q = interestQuery(deck, cat);
        let l = week(await get(q, "bing"));
        if (l.length < 4) l = [...l, ...week(await get(`${q} when:7d`, "google")).filter((g) => !l.some((b) => b.title === g.title))];
        return l.sort((a, b) => b.at - a.at).slice(0, per).map((h) => ({ ...h, tag: NEWS_CATEGORIES[cat]?.label ?? cat }));
      };
      const batches = await Promise.all(s.cats.map(forCat));
      for (let k = 0; k < per; k++) for (const list of batches) if (list[k] && !items.some((w) => w.title === list[k].title)) items.push(list[k]);
    } else {
      const q = s.kind === "topic" ? s.words : s.kind === "area" ? areaName(deck) : "";
      if (q) items = fresh(await get(q, "bing"));
      if (q && items.length < 5) items = add(items, fresh(await get(q, "google")));
      // a quiet village (or nothing to search for): the national news added
      if (s.kind !== "topic" && items.length < 5) {
        widened = !!q;
        items = add(items, fresh(await get("", "google")));
      }
    }
    if (!items.length) throw new Error(t("no recent news"));
    Object.assign(f, { items: items.slice(0, 30), at: Date.now(), error: null, widened });
  } catch (e) {
    f.error = e instanceof Error ? e.message : String(e);
  } finally {
    f.loading = false;
    deck.requestFrame();
  }
}

/** "3 min", "2 h", "4 d" — how long ago, short */
export function ago(at: number, now = Date.now()): string {
  if (!at) return "";
  const m = Math.max(0, Math.round((now - at) / 60_000));
  if (m < 60) return t("{n} min", { n: Math.max(1, m) });
  const h = Math.round(m / 60);
  return h < 48 ? t("{n} h", { n: h }) : t("{n} d", { n: Math.round(h / 24) });
}

/** Open a headline's article in the browser. */
export function openArticle(deck: Deck, h: Headline | undefined): void {
  if (h?.link && deck.platform.openUrl) void deck.platform.openUrl(h.link);
}

function when(deck: Deck, at: number): string {
  return at ? new Date(at).toLocaleString(deck.settings.data.user.locale || undefined, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "";
}

const seenAt = new Map<string, number>();

export const newsWidget: WidgetSpec = {
  id: "news",
  title: "news",
  description: "headlines of your area, your country, some categories or your own words — with summaries",
  size: { w: 6, h: 5 },
  min: { w: 2, h: 2 },
  open: "news page",
  render(ui, r, { deck, key }) {
    const c = ui.c;
    // this copy: what it shows (one source), as headlines or one "à la une"
    const src = widgetSource(deck, key);
    const mode = widgetConfig<string>(deck, key, "mode", "list");
    const f = sourceFeed(deck, src);
    const items = f.items;
    if (items.length) lastShown = items;
    const header = `◉ ${sourceLabel(deck, src)}${f.widened ? ` + ${countryOf(deck)}` : ""}`;
    // the header says what it shows; a click on it: change it (the widget's pop-up)
    const head = { x: r.x, y: r.y, w: r.w, h: 1 };
    if (key) ui.hit(head, { cmd: `widget ${key}`, tip: t("what this widget shows: click to change it") });
    if (!items.length) {
      ui.text(r.x + 1, r.y, header, { fg: c.accentAlt, attrs: BOLD }, r.w - 2);
      if (r.h > 1) ui.text(r.x + 1, r.y + 1, f.error ? `⚠ ${f.error}` : `${ui.spinner()} ${t("pulling the feed…")}`, { fg: f.error ? c.error : c.muted }, r.w - 2);
      return;
    }
    const open = (i: number) => showCard(deck, items, i + 1);

    if (mode === "featured") {
      // à la une: one headline, big, with its summary
      const i = featuredIndex(`${key ?? "news"}|${sourceId(src)}`, items.length);
      const h = items[i];
      const tw = r.w - 2;
      // "à la une" first, then this article's own category or, without one, what the widget shows
      ui.text(r.x + 1, r.y, `◉ ${t("à la une")} · ${h.tag ? (NEWS_CATEGORIES[h.tag]?.label ?? h.tag) : sourceLabel(deck, src)}`, { fg: c.accentAlt, attrs: BOLD }, tw);
      let y = r.y + 2;
      for (const l of wrapWords(h.title, tw).slice(0, Math.max(1, Math.floor((r.h - 3) / 2)))) ui.text(r.x + 1, y++, l, { fg: c.accent, attrs: BOLD }, tw);
      if (y < r.y + r.h) ui.text(r.x + 1, y++, `${h.source}${h.at ? ` · ${when(deck, h.at)}` : ""}`, { fg: c.subtle }, tw);
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
      ui.hit(nx, { onClick: () => void (featuredIndex(`${key ?? "news"}|${sourceId(src)}`, items.length, true), deck.requestFrame()), tip: t("another headline") });
      ui.animate(60_000);
      return;
    }

    ui.text(r.x + 1, r.y, header, { fg: c.accentAlt, attrs: BOLD }, r.w - 2);
    // a chosen widget scrolls all its long texts; a list of headlines would all run at once:
    // here only the headline under the mouse scrolls
    const zone = ui.marqueeZone;
    ui.marqueeZone = null;
    items.slice(0, Math.max(0, r.h - 1)).forEach((h, i) => {
      const y = r.y + 1 + i;
      // new headlines decrypt in, staggered
      const first = seenAt.get(h.title) ?? (seenAt.set(h.title, ui.now + i * 90), ui.now + i * 90);
      const p = Math.min(1, Math.max(0, (ui.now - first) / 500));
      const row = { x: r.x, y, w: r.w, h: 1 };
      const hot = ui.hovered(row);
      const src2 = r.w >= 50 ? h.source.slice(0, 14) : "";
      const room = r.w - 5 - (src2 ? strWidth(src2) + 1 : 0);
      ui.text(r.x + 1, y, ui.theme.glyphs.bullet, { fg: c.accent });
      // several categories: each headline wears its own, dimly
      const tagW = h.tag && src.kind === "cats" && src.cats.length > 1 && r.w >= 34 ? strWidth(h.tag) + 3 : 0;
      if (tagW) ui.text(r.x + 3, y, `[${h.tag}]`, { fg: c.subtle });
      const shown = ui.reveal(h.title, p);
      ui.text(r.x + 3 + tagW, y, shown, { fg: hot ? c.accent : i === 0 ? c.fg : c.muted }, room - tagW);
      if (src2) ui.textRight(r.x + r.w - 1, y, src2, { fg: c.faint, attrs: DIM });
      ui.hit(row, { onClick: () => open(i), tip: t("summary, then open it in your browser") });
    });
    ui.marqueeZone = zone;
  },
  activate: ({ deck, key }) => refreshSource(deck, widgetSource(deck, key)),
};

/** The article card: full title, source, time, summary and a way out to the browser. */
class NewsCard implements Overlay {
  modal = true;
  done = false;
  constructor(
    private readonly deck: Deck,
    private readonly n: number,
    /** the headlines it browses (the widget's, the page's, `news`'s) */
    private readonly items: Headline[],
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

/** A headline of a list, on its card (←→ browse the list). */
export function showHeadline(deck: Deck, items: Headline[], n: number): void {
  showCard(deck, items, n);
}

/** A copy's own headline, on its card. */
function showCard(deck: Deck, items: Headline[], n: number): void {
  if (!items[n - 1]) return;
  deck.workspace.push(new NewsCard(deck, n, items));
  deck.requestFrame();
}

/** the NEWS page's tab (apps/news.ts reads and sets it; `news` lists that source's headlines) */
export const newsPage = { tab: "area" as NewsSource["kind"] };

/** the source of the page's tab: your area, your country, the categories you follow, your words */
export function pageSource(deck: Deck): NewsSource {
  const tab = newsPage.tab;
  if (tab === "cats") {
    const cats = followedCats(deck);
    return cats.length ? { kind: "cats", cats } : { kind: "area" };
  }
  if (tab === "topic") {
    const words = followedWords(deck);
    return words ? { kind: "topic", words } : { kind: "area" };
  }
  return { kind: tab };
}

/**
 * `news show …` → a source: area · country · categories (+cat / -cat change the ones there
 * are) · anything else is your own words.
 */
export function sourceFromWords(words: string[], cur: NewsSource): NewsSource | null {
  const w = words.map((x) => x.trim()).filter(Boolean);
  if (!w.length) return null;
  const one = w.join(" ").toLowerCase();
  if (["area", "region", "local", "région", "region-locale", "-"].includes(one)) return { kind: "area" };
  if (["country", "pays", "national", "top"].includes(one)) return { kind: "country" };
  const bare = w.map((x) => x.toLowerCase().replace(/^[+-]/, ""));
  if (bare.every((x) => NEWS_CATEGORIES[x])) {
    const relative = w.some((x) => /^[+-]/.test(x));
    let cats = relative && cur.kind === "cats" ? [...cur.cats] : [];
    w.forEach((x, i) => {
      if (x.startsWith("-")) cats = cats.filter((c) => c !== bare[i]);
      else if (!cats.includes(bare[i])) cats.push(bare[i]);
    });
    return cats.length ? { kind: "cats", cats } : { kind: "area" };
  }
  return { kind: "topic", words: w.join(" ") };
}

/** The page shows `src`: its tab, and the categories / words it keeps (saved). */
export function setPageSource(deck: Deck, src: NewsSource): void {
  // the page's own (the widgets never read these: a widget follows only its own choice)
  const page = deck.settings.data.home.newsPage ?? {};
  if (src.kind === "cats") deck.settings.set("home.newsPage", { ...page, cats: src.cats });
  if (src.kind === "topic") deck.settings.set("home.newsPage", { ...page, words: src.words });
  newsPage.tab = src.kind;
  deck.requestFrame();
}

export const newsCommand: Command = {
  name: "news",
  examples: [
    ["news", "numbered headlines (the NEWS page's tab, else your area)"],
    ["news 3", "summary of headline 3 (and the card on screen)"],
    ["news open 3", "read it in your browser"],
    ["news page", "the NEWS page"],
    ["news show science ai", "what a news widget shows (its pop-up open): categories"],
    ["news show formula 1", "…or your own words (area, country: those)"],
  ],
  summary: "headlines of your area, your country, categories or your words; read one, open it",
  usage: "news              the headlines (the NEWS page's tab, else your area)\nnews <n>          summary of headline n (a card on screen)\nnews open <n>     open it in your browser\nnews refresh\nnews page         the NEWS page\nnews show area | country | <categories> | +cat | -cat | <your words>\n                  what a news widget shows (its pop-up open; else the page's tab)\nnews mode list | featured   that widget: headlines, or one at a time in big with its summary\nnews categories   the categories: tech ai science space politics world business people culture art music cinema gaming sports health environment nature security",
  complete: () => ["open", "refresh", "page", "show", "mode", "featured", "list", "categories", "area", "country", ...Object.keys(NEWS_CATEGORIES)],
  async run(ctx) {
    const { deck } = ctx;
    const [a, b] = ctx.args;
    if (a === "page") return void deck.openApp("news");
    if (a === "categories" || a === "interests") {
      ctx.out(`\x1b[2mcategories: ${Object.keys(NEWS_CATEGORIES).join(" ")}  (or your own words: news show formula 1)\x1b[0m\n`);
      return 0;
    }
    const target = widgetTarget("news");
    // the old words: topic <words> / topic - / add / rm — the same as show
    const words = a === "topic" ? (b === "-" ? ["area"] : ctx.args.slice(1)) : a === "add" ? ctx.args.slice(1).map((x) => (NEWS_CATEGORIES[x.toLowerCase()] ? `+${x}` : x)) : a === "rm" ? ctx.args.slice(1).map((x) => `-${x}`) : a === "show" ? ctx.args.slice(1) : null;
    if (words) {
      // a widget (its pop-up open, or selected on HOME): what it shows
      if (target) {
        const next = sourceFromWords(words, widgetSource(deck, target));
        if (!next) return ctx.err("usage: news show area | country | <categories> | <your words>\n"), 1;
        setWidgetSetting(deck, "news", "source", sourceId(next));
        return ctx.out(`news (${target}): ${sourceLabel(deck, next)}\n`), 0;
      }
      // else the page: its tab, and the categories / words it keeps
      const next = sourceFromWords(words, pageSource(deck));
      if (!next) return ctx.err("usage: news show area | country | <categories> | <your words>\n"), 1;
      setPageSource(deck, next);
      return ctx.out(`news: ${sourceLabel(deck, next)}\n`), 0;
    }
    if (a === "mode") {
      if (!target) return ctx.err("news mode: open a news widget's pop-up first (or select it on HOME)\n"), 1;
      if (b !== "list" && b !== "featured") return ctx.err("usage: news mode list | featured\n"), 1;
      setWidgetSetting(deck, "news", "mode", b);
      return ctx.out(`news (${target}): ${b}\n`), 0;
    }
    // the headlines of the page's tab (else your area)
    const src = target ? widgetSource(deck, target) : pageSource(deck);
    const f = sourceFeed(deck, src);
    if (a === "refresh" || !f.items.length) {
      refreshSource(deck, src);
      for (let i = 0; i < 100 && f.loading; i++) await new Promise((r) => setTimeout(r, 100));
    }
    if (!f.items.length) return ctx.err(`news: ${f.error ?? t("no recent news")}\n`), 1;
    lastShown = f.items;
    if (!a || a === "refresh") {
      ctx.out(`\x1b[1m◉ ${sourceLabel(deck, src)}\x1b[0m\n`);
      f.items.forEach((h, i) => ctx.out(`\x1b[35m${String(i + 1).padStart(2)}\x1b[0m ${h.tag ? `\x1b[36m[${h.tag}]\x1b[0m ` : ""}${h.title} \x1b[2m· ${h.source}\x1b[0m\n`));
      return 0;
    }
    const n = Number(a === "open" ? b : a);
    const h = f.items[n - 1];
    if (!h) return ctx.err(`news: no headline ${a === "open" ? b : a} (news to list them)\n`), 1;
    if (a === "open") {
      if (!deck.platform.openUrl || !h.link) return ctx.err("news: can't open links here\n"), 1;
      await deck.platform.openUrl(h.link);
      ctx.out(`\x1b[2mopened ${h.link}\x1b[0m\n`);
      return 0;
    }
    ctx.out(`\x1b[1m${h.title}\x1b[0m\n\x1b[2m${h.source}${h.at ? ` · ${when(deck, h.at)}` : ""}\x1b[0m\n${h.summary ? `${h.summary}\n` : ""}\x1b[2mnews open ${n} → browser\x1b[0m\n`);
    if (ctx.isTTY) showCard(deck, f.items, n);
    return 0;
  },
};
