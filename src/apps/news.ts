/**
 * NEWS — the module's own page: the headlines of a source (your area, your country,
 * some categories, your own words), the first one big ("à la une"), and the one you
 * pick read on the right with its summary.
 *
 *   ←→ / tab  another source     ↑↓  a headline     enter  open it in the browser
 *   r  refresh                   +  add a source    x  remove this source
 *
 * Wide: the list on the left, the article on the right. Narrow: the list; enter shows
 * the article's card.
 */
import { BOLD, type Rect } from "../core/grid";
import { t } from "../core/i18n";
import type { Action, KeyInput } from "../core/input";
import { strWidth, truncate, wrapWords } from "../core/unicode";
import type { Deck } from "../deck";
import { Bar, GAP, INSET, SECTION } from "../ui/layout";
import type { UI } from "../ui/ui";
import { ago, NEWS_CATEGORIES, openArticle, refreshSource, showHeadline, sourceFeed, sourceId, sourceLabel, type Headline, type NewsSource } from "../widgets/news";
import type { App, AppSpec } from "./types";

/** The sources the page offers: your area, your country, then the ones you follow. */
export function pageSources(deck: Deck): NewsSource[] {
  const out: NewsSource[] = [{ kind: "area" }, { kind: "country" }];
  const home = deck.settings.data.home;
  for (const i of home.newsInterests ?? []) out.push(NEWS_CATEGORIES[i.toLowerCase()] ? { kind: "cats", cats: [i.toLowerCase()] } : { kind: "topic", words: i });
  if (home.newsTopic) out.push({ kind: "topic", words: home.newsTopic });
  const seen = new Set<string>();
  return out.filter((s) => !seen.has(sourceId(s)) && !!seen.add(sourceId(s)));
}

/** the width at which the article gets its own column on the right */
const SPLIT_W = 90;

class NewsApp implements App {
  readonly kind = "news";
  readonly key = "news";
  /** the source shown (its id) and the headline picked in it */
  private src = "area";
  private sel = 0;
  private scroll = 0;
  constructor(private readonly deck: Deck) {}

  title(): string {
    return "news";
  }
  status(): string {
    return t("←→ source · ↑↓ headline · enter open · r refresh · + add a source");
  }

  private get sources(): NewsSource[] {
    return pageSources(this.deck);
  }
  private get source(): NewsSource {
    return this.sources.find((s) => sourceId(s) === this.src) ?? this.sources[0];
  }
  private get items(): Headline[] {
    return sourceFeed(this.deck, this.source).items;
  }

  private pick(id: string): void {
    this.src = id;
    this.sel = 0;
    this.scroll = 0;
    this.deck.requestFrame();
  }
  private step(dir: 1 | -1): void {
    const all = this.sources;
    const k = all.findIndex((s) => sourceId(s) === sourceId(this.source));
    this.pick(sourceId(all[(k + dir + all.length) % all.length]));
  }
  private async addSource(): Promise<void> {
    const v = await this.deck.prompt(t("Follow: a category or your own words"), { placeholder: "science · ai · space · “formula 1”", suggestions: Object.keys(NEWS_CATEGORIES) });
    const w = v?.trim();
    if (!w) return;
    await this.deck.act(`news add ${w}`);
    const cat = NEWS_CATEGORIES[w.toLowerCase()];
    this.pick(sourceId(cat ? { kind: "cats", cats: [w.toLowerCase()] } : { kind: "topic", words: w }));
  }
  private removeSource(): void {
    const s = this.source;
    const word = s.kind === "cats" ? s.cats[0] : s.kind === "topic" ? s.words : "";
    if (!word) return;
    void this.deck.act(s.kind === "topic" && word === this.deck.settings.data.home.newsTopic ? "news topic -" : `news rm ${word}`);
    this.pick("area");
  }
  private open(i = this.sel): void {
    const h = this.items[i];
    if (!h) return;
    // narrow: the article's card first (wide: it's already on the right)
    if (this.lastW < SPLIT_W) showHeadline(this.deck, this.items, i + 1);
    else openArticle(this.deck, h);
  }
  private lastW = 0;

  onKey(k: KeyInput): boolean {
    if (k.combo === "tab" || k.combo === "right") return this.step(1), true;
    if (k.combo === "shift+tab" || k.combo === "left") return this.step(-1), true;
    return false;
  }
  onText(s: string): boolean {
    if (s === "r") return refreshSource(this.deck, this.source), true;
    if (s === "+") return void this.addSource(), true;
    if (s === "x") return this.removeSource(), true;
    if (s === "j") return this.onAction("down");
    if (s === "k") return this.onAction("up");
    if (s === "o") return openArticle(this.deck, this.items[this.sel]), true;
    return false;
  }
  onAction(a: Action): boolean {
    const n = this.items.length;
    if (a === "down") this.sel = Math.min(n - 1, this.sel + 1);
    else if (a === "up") this.sel = Math.max(0, this.sel - 1);
    else if (a === "home") this.sel = 0;
    else if (a === "end") this.sel = Math.max(0, n - 1);
    else if (a === "page-down") this.sel = Math.min(n - 1, this.sel + 8);
    else if (a === "page-up") this.sel = Math.max(0, this.sel - 8);
    else if (a === "confirm") this.open();
    else return false;
    this.deck.requestFrame();
    return true;
  }

  render(ui: UI, r: Rect, _focused: boolean): void {
    const c = ui.c;
    this.lastW = r.w;
    const source = this.source;
    const f = sourceFeed(this.deck, source);
    const body = { x: r.x + INSET, y: r.y, w: r.w - INSET * 2, h: r.h };

    // the sources, as tabs; refresh on the right
    const bar = new Bar(ui, body.x, body.y, body.x + body.w);
    for (const s of this.sources) {
      const id = sourceId(s);
      const on = id === sourceId(source);
      const label = `${s.kind === "area" ? "⌖ " : s.kind === "country" ? "⚑ " : ""}${sourceLabel(this.deck, s)}`;
      bar.button(label, () => this.pick(id), { selected: on, tip: s.kind === "area" ? t("your area (location: setup)") : s.kind === "country" ? t("your country's top stories") : t("x removes it") }, { priority: on ? 9 : 5 });
    }
    bar.button("+", () => void this.addSource(), { tip: t("follow a category or your own words · news add …") }, { priority: 6 });
    const age = f.loading ? `${ui.spinner()} ${t("loading")}` : f.at ? `↻ ${ago(f.at)}` : "↻";
    bar.button(age, () => refreshSource(this.deck, source), { quiet: true, tip: t("refresh · r") }, { side: "right", priority: 4 });
    bar.draw();
    ui.hline(body.x, body.y + 1, body.w, { fg: c.faint });

    const main = { x: body.x, y: body.y + 1 + SECTION, w: body.w, h: body.h - 1 - SECTION };
    if (!f.items.length) {
      const msg = f.error ? `⚠ ${f.error}` : `${ui.spinner()} ${t("pulling the feed…")}`;
      return void wrapWords(msg, main.w).forEach((l, i) => ui.text(main.x, main.y + i, l, { fg: f.error ? c.error : c.muted }));
    }
    this.sel = Math.min(this.sel, f.items.length - 1);
    const split = main.w >= SPLIT_W;
    const listW = split ? Math.floor((main.w - GAP) * 0.55) : main.w;
    const list = { x: main.x, y: main.y, w: listW, h: main.h };
    this.drawList(ui, list, f.items, f.widened ? t("+ national news (little local news)") : "");
    if (split) {
      const rx = main.x + listW + GAP;
      ui.vline(rx - INSET - INSET, main.y, main.h, { fg: c.faint }, "│");
      this.drawArticle(ui, { x: rx, y: main.y, w: main.x + main.w - rx, h: main.h }, f.items[this.sel]);
    }
  }

  /** À la une (the first headline, big) then the others, one per line; the one picked lit. */
  private drawList(ui: UI, r: Rect, items: Headline[], note: string): void {
    const c = ui.c;
    let y = r.y;
    const hero = items[0];
    const heroLines = r.h >= 12 ? wrapWords(hero.title, r.w - GAP).slice(0, 3) : [];
    if (heroLines.length) {
      const hr = { x: r.x, y, w: r.w, h: heroLines.length + 2 };
      const on = this.sel === 0;
      ui.text(r.x, y++, `◉ ${t("à la une")}${hero.tag ? ` · ${hero.tag}` : ""}`, { fg: c.accentAlt, attrs: BOLD }, r.w);
      for (const l of heroLines) {
        ui.text(r.x, y, on ? "▌" : " ", { fg: c.accent });
        ui.text(r.x + GAP, y++, l, { fg: on ? c.accent : c.fg, attrs: BOLD }, r.w - GAP);
      }
      ui.text(r.x + GAP, y++, `${hero.source}${hero.at ? ` · ${ago(hero.at)}` : ""}`, { fg: c.subtle }, r.w - GAP);
      ui.hit(hr, { onClick: () => ((this.sel = 0), this.deck.requestFrame()), onDouble: () => this.open(0), tip: t("click: read it · double-click / enter: open it") });
      y += SECTION;
    }
    const first = heroLines.length ? 1 : 0;
    const rows = Math.max(0, r.y + r.h - y - (note ? 1 : 0));
    // keep the picked one in view
    const selRow = this.sel - first;
    if (selRow >= 0) {
      if (selRow < this.scroll) this.scroll = selRow;
      if (selRow >= this.scroll + rows) this.scroll = selRow - rows + 1;
    }
    this.scroll = Math.max(0, Math.min(this.scroll, Math.max(0, items.length - first - rows)));
    const zone = ui.marqueeZone;
    ui.marqueeZone = null; // only the headline under the mouse scrolls
    for (let k = 0; k < rows; k++) {
      const i = first + this.scroll + k;
      const h = items[i];
      if (!h) break;
      const row = { x: r.x, y: y + k, w: r.w, h: 1 };
      const on = i === this.sel;
      const hot = ui.hovered(row);
      if (on) ui.fill(row, { bg: c.highlight });
      const bg = on ? c.highlight : undefined;
      const meta = `${h.tag ? `${h.tag} · ` : ""}${ago(h.at)}`;
      const metaW = r.w >= 40 ? strWidth(meta) : 0;
      ui.text(r.x, row.y, on ? "▌" : ui.theme.glyphs.bullet, { fg: c.accent, bg });
      ui.text(r.x + GAP, row.y, h.title, { fg: on ? c.fg : hot ? c.accent : c.muted, bg, attrs: on ? BOLD : 0 }, r.w - GAP - (metaW ? metaW + GAP : 0));
      if (metaW) ui.textRight(r.x + r.w, row.y, meta, { fg: c.faint, bg });
      ui.hit(row, { onClick: () => ((this.sel = i), this.deck.requestFrame()), onDouble: () => this.open(i), onWheel: (d) => ((this.scroll = Math.max(0, this.scroll + Math.sign(d))), this.deck.requestFrame()) });
    }
    ui.marqueeZone = zone;
    if (note) ui.text(r.x, r.y + r.h - 1, note, { fg: c.faint }, r.w);
  }

  /** The headline picked: its title, where and when, its summary, a way out to the browser. */
  private drawArticle(ui: UI, r: Rect, h: Headline | undefined): void {
    const c = ui.c;
    if (!h) return;
    let y = r.y;
    for (const l of wrapWords(h.title, r.w).slice(0, 5)) ui.text(r.x, y++, l, { fg: c.fg, attrs: BOLD }, r.w);
    ui.text(r.x, y++, `${h.tag ? `${h.tag} · ` : ""}${h.source}${h.at ? ` · ${ago(h.at)}` : ""}`, { fg: c.subtle }, r.w);
    y += SECTION;
    const bottom = r.y + r.h - 2;
    const lines = wrapWords(h.summary || t("no summary in the feed — open the article to read it"), r.w);
    const room = Math.max(0, bottom - y);
    lines.slice(0, room).forEach((l, k) => ui.text(r.x, y++, k === room - 1 && lines.length > room ? truncate(`${l} …`, r.w) : l, { fg: h.summary ? c.muted : c.faint }, r.w));
    if (h.link && this.deck.platform.openUrl && r.h >= 4) ui.button(r.x, r.y + r.h - 1, t("open in the browser ↗ · enter"), () => openArticle(this.deck, h));
  }
}

export const newsSpec: AppSpec = {
  kind: "news",
  title: "News",
  description: "headlines for your area, your country, the categories and words you follow",
  icon: "≡",
  launcher: true,
  create: (deck) => new NewsApp(deck),
};
