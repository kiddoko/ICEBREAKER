/**
 * NEWS — the module's own page. The same four choices as a news widget, as tabs: your
 * area, your country's top stories, the categories you tick, your own words. The first
 * headline big ("à la une"), the others one per line; wide, the one you pick is read on
 * the right with its summary.
 *
 *   ←→ / tab  another tab     ↑↓  a headline     enter  open it     r  refresh
 *   w  your own words          (categories: click them on and off)
 *
 * Narrow: the list; enter shows the article's card.
 */
import { BOLD, type Rect } from "../core/grid";
import { t } from "../core/i18n";
import type { Action, KeyInput } from "../core/input";
import { strWidth, truncate, wrapWords } from "../core/unicode";
import type { Deck } from "../deck";
import { Bar, GAP, INSET, SECTION } from "../ui/layout";
import type { UI } from "../ui/ui";
import { NEWS_TOPICS } from "../core/suggest";
import { ago, followedCats, followedWords, NEWS_CATEGORIES, newsPage, openArticle, pageSource, refreshSource, setPageSource, showHeadline, sourceFeed, sourceLabel, type Headline, type NewsSource } from "../widgets/news";
import type { App, AppSpec } from "./types";

/** the width at which the article gets its own column on the right */
const SPLIT_W = 90;
const TABS: NewsSource["kind"][] = ["area", "country", "cats", "topic"];

class NewsApp implements App {
  readonly kind = "news";
  readonly key = "news";
  /** the headline picked, and the list's scroll */
  private sel = 0;
  private scroll = 0;
  private lastW = 0;
  constructor(private readonly deck: Deck) {}

  title(): string {
    return "news";
  }
  status(): string {
    return t("←→ tab · ↑↓ headline · enter open · r refresh · w your words");
  }

  private get source(): NewsSource {
    return pageSource(this.deck);
  }
  private get items(): Headline[] {
    return sourceFeed(this.deck, this.source).items;
  }

  /** a tab: categories with none ticked yet starts with "world"; your words asks for them */
  private tab(kind: NewsSource["kind"]): void {
    this.sel = 0;
    this.scroll = 0;
    if (kind === "cats") return setPageSource(this.deck, { kind: "cats", cats: followedCats(this.deck).length ? followedCats(this.deck) : ["world"] });
    if (kind === "topic" && !followedWords(this.deck)) return void this.askWords();
    if (kind === "topic") return setPageSource(this.deck, { kind: "topic", words: followedWords(this.deck) });
    setPageSource(this.deck, { kind });
  }
  private step(dir: 1 | -1): void {
    this.tab(TABS[(TABS.indexOf(newsPage.tab) + dir + TABS.length) % TABS.length]);
  }
  private async askWords(): Promise<void> {
    const v = await this.deck.prompt(t("The news about…"), { initial: followedWords(this.deck), placeholder: "formula 1, linux, Lyon…", suggestions: NEWS_TOPICS });
    if (v?.trim()) setPageSource(this.deck, { kind: "topic", words: v.trim() });
  }
  private toggleCat(id: string): void {
    const cur = followedCats(this.deck);
    const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
    setPageSource(this.deck, next.length ? { kind: "cats", cats: next } : { kind: "area" });
    this.sel = 0;
  }
  private open(i = this.sel): void {
    const h = this.items[i];
    if (!h) return;
    // narrow: the article's card first (wide: it's already on the right)
    if (this.lastW < SPLIT_W) showHeadline(this.deck, this.items, i + 1);
    else openArticle(this.deck, h);
  }

  onKey(k: KeyInput): boolean {
    if (k.combo === "tab" || k.combo === "right") return this.step(1), true;
    if (k.combo === "shift+tab" || k.combo === "left") return this.step(-1), true;
    return false;
  }
  onText(s: string): boolean {
    if (s === "r") return refreshSource(this.deck, this.source), true;
    if (s === "w") return void this.askWords(), true;
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

    // the four choices, as tabs (the same as a news widget's); refresh on the right
    const tab = newsPage.tab;
    const bar = new Bar(ui, body.x, body.y, body.x + body.w);
    const label: Record<NewsSource["kind"], string> = {
      area: `⌖ ${sourceLabel(this.deck, { kind: "area" })}`,
      country: `⚑ ${sourceLabel(this.deck, { kind: "country" })}`,
      cats: `▦ ${t("categories")}`,
      topic: `❝ ${followedWords(this.deck) ? `“${followedWords(this.deck)}”` : t("your own words")}`,
    };
    const tips: Record<NewsSource["kind"], string> = { area: t("your area (location: setup)"), country: t("your country's top stories"), cats: t("the categories you tick, woven together"), topic: "w" };
    for (const k of TABS) bar.button(label[k], () => this.tab(k), { selected: tab === k, tip: tips[k] }, { priority: tab === k ? 9 : 5 });
    const age = f.loading ? `${ui.spinner()} ${t("loading")}` : f.at ? `↻ ${ago(f.at)}` : "↻";
    bar.button(age, () => refreshSource(this.deck, source), { quiet: true, tip: t("refresh · r") }, { side: "right", priority: 4 });
    bar.draw();
    let top = body.y + 1;
    // categories: tick them; your words: change them
    if (tab === "cats") {
      // every category, on as many rows as they need (at most 3)
      const on = followedCats(this.deck);
      let x = body.x;
      const last = top + 2;
      for (const [id, cat] of Object.entries(NEWS_CATEGORIES)) {
        const name = t(cat.label);
        const w = strWidth(name) + GAP;
        if (x + w > body.x + body.w) {
          if (top >= last) break;
          (x = body.x), top++;
        }
        x += ui.button(x, top, name, () => this.toggleCat(id), { selected: on.includes(id), quiet: !on.includes(id), tip: on.includes(id) ? t("click: not this one") : t("click: this one too") }) + INSET;
      }
      top++;
    } else if (tab === "topic") {
      new Bar(ui, body.x, top++, body.x + body.w).button(t("change the words"), () => void this.askWords(), { tip: "w" }, { priority: 5 }).draw();
    }
    ui.hline(body.x, top, body.w, { fg: c.faint });

    const main = { x: body.x, y: top + SECTION, w: body.w, h: body.y + body.h - top - SECTION };
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
