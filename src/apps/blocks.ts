import { copyToClipboard } from "../core/clipboard";
import { FilterBar } from "../ui/filterbar";
import { BLOCK_KINDS, type Block, type BlockKind } from "../core/catalog";
import { mix } from "../core/color";
import { BOLD, type Rect } from "../core/grid";
import { t } from "../core/i18n";
import type { Action, KeyInput } from "../core/input";
import { strWidth, truncate, wrapWords } from "../core/unicode";
import type { Deck } from "../deck";
import { ListView } from "../ui/list";
import { GAP, INSET } from "../ui/layout";
import type { UI } from "../ui/ui";
import type { App, AppSpec } from "./types";

/**
 * BLOCKS (`blocks`, THE MENU) — the catalog (core/catalog.ts) as a page: every
 * command, action, shortcut, setting, function, widget, app, theme and module,
 * what it does, who provides it, and how to call it from the shell or from a
 * module. Type to search, ←→ change the kind, enter runs it (a setting: changes
 * it), ctrl+c copies the line that calls it.
 */
class BlocksApp implements App {
  readonly kind = "blocks";
  readonly key = "blocks";
  private readonly list = new ListView<Block>();
  /** type anywhere: it searches every block */
  private readonly search = new FilterBar({ always: true, colours: false });
  private get query(): string {
    return this.search.query;
  }
  /** -1 = every kind */
  private kindAt = -1;
  private builtFor = "";

  constructor(private readonly deck: Deck) {
    this.list.onActivate = (b) => this.run(b);
    this.list.tipOf = (b) => b.call;
  }

  title(): string {
    return "blocks";
  }
  status(): string {
    return t("type to search · ←→ kind · ↑↓ choose · enter run · ctrl+c copy the call");
  }

  private get kindNow(): BlockKind | undefined {
    return this.kindAt < 0 ? undefined : BLOCK_KINDS[this.kindAt];
  }

  private run(b: Block): void {
    if (!b.run) return this.deck.notify(t("nothing to run: use the call line"));
    void Promise.resolve(b.run()).catch((e) => this.deck.notify(String(e), "error"));
    this.builtFor = ""; // a setting may have changed: read again
  }

  private refresh(): void {
    const sig = `${this.kindAt}|${this.query}`;
    if (sig === this.builtFor) return;
    const cur = this.list.current;
    this.builtFor = sig;
    this.list.items = this.deck.catalog.list(this.kindNow, this.query);
    const i = cur ? this.list.items.findIndex((b) => b.kind === cur.kind && b.id === cur.id) : -1;
    // the same block still there (a re-read): keep it chosen without scrolling to it
    if (i >= 0) this.list.selected = i;
    else this.list.select(0);
  }

  onText(s: string): boolean {
    return this.search.onText(s);
  }

  onKey(k: KeyInput): boolean {
    if (this.query && this.search.onKey(k)) return true;
    if (k.combo === "esc" && this.query) return this.search.clear(), true;
    if (k.combo === "ctrl+c") {
      const b = this.list.current;
      if (b?.call) copyToClipboard(b.call), this.deck.notify(`${t("copied")}: ${b.call}`, "success");
      return true;
    }
    return false;
  }

  onAction(a: Action): boolean {
    const n = BLOCK_KINDS.length + 1;
    if (a === "left" || a === "right") return (this.kindAt = ((this.kindAt + 1 + (a === "right" ? 1 : -1) + n) % n) - 1), true;
    if (a === "confirm") return this.list.current && this.run(this.list.current), true;
    return this.list.onAction(a);
  }

  render(ui: UI, r: Rect, focused: boolean): void {
    const c = ui.c;
    // a setting changes from anywhere: read the catalog again now and then
    if (Math.floor(ui.now / 1000) !== Math.floor((ui.now - 16) / 1000)) this.builtFor = "";
    this.refresh();
    const x = r.x + INSET * 2, w = r.w - INSET * 4;
    let y = r.y + 1;
    // the search, then how many match (beside it, never over its text)
    const count = `${this.list.items.length}`;
    this.search.render(ui, { x, y, w: Math.max(8, w - strWidth(count) - GAP), h: 1 }, {}, { focused, placeholder: t("search every block: a name, a module, a word of its doc…") });
    ui.textRight(x + w, y, count, { fg: c.subtle });
    y += 2;
    // the kinds: all · command · action…
    const counts = this.deck.catalog.counts();
    let cx = x;
    const chip = (label: string, at: number) => {
      const on = this.kindAt === at;
      const cw = strWidth(label) + 2;
      const rect = { x: cx, y, w: cw, h: 1 };
      const bg = on ? c.accent : ui.hovered(rect) ? c.highlight : undefined;
      if (bg !== undefined) ui.fill(rect, { bg });
      ui.text(cx + 1, y, label, { fg: on ? c.panel : c.muted, attrs: on ? BOLD : 0, ...(bg !== undefined ? { bg } : {}) });
      ui.hit(rect, { onClick: () => (this.kindAt = at) });
      cx += cw + 1;
    };
    chip(t("all"), -1);
    BLOCK_KINDS.forEach((k, i) => cx + strWidth(k) + 8 < x + w && chip(`${t(k)} ${counts[k]}`, i));
    y += 2;

    // left: the list · right: the block chosen (narrow: the list alone, enter still runs it)
    const twoCols = w >= 64;
    const listW = twoCols ? Math.max(30, Math.floor(w * 0.55)) : w;
    const h = r.y + r.h - y - 1;
    const kindW = 10;
    this.list.render(ui, { x, y, w: listW, h }, focused, (b, row, selected) => {
      const bg = selected ? mix(c.accent, c.bg, 0.82) : undefined;
      if (bg !== undefined) ui.fill(row, { bg });
      const st = bg !== undefined ? { bg } : {};
      ui.text(row.x + 1, row.y, b.kind, { fg: c.subtle, ...st }, kindW - 1);
      const fromW = Math.min(12, strWidth(b.from));
      ui.text(row.x + kindW, row.y, b.name, { fg: selected ? c.fg : c.muted, attrs: selected ? BOLD : 0, ...st }, row.w - kindW - fromW - 3);
      ui.textRight(row.x + row.w - 1, row.y, truncate(b.from, fromW), { fg: b.from === "core" ? c.faint : c.accent, ...st });
    });
    if (!this.list.items.length) ui.text(x + 1, y, t("nothing matches — esc clears the search"), { fg: c.muted });
    if (!twoCols) return;
    ui.vline(x + listW + 1, y, h, { fg: c.faint });

    const b = this.list.current;
    if (!b) return;
    const dx = x + listW + 3, dw = x + w - dx;
    let dy = y;
    const from = b.from === "core" ? t("the deck") : b.from;
    ui.text(dx, dy, b.kind.toUpperCase(), { fg: c.subtle, attrs: BOLD }, Math.max(0, dw - strWidth(from) - GAP));
    ui.textRight(dx + dw, dy, truncate(from, Math.max(0, dw - 8)), { fg: c.accent });
    dy += 1;
    ui.text(dx, dy, b.name, { fg: c.title, attrs: BOLD }, dw);
    dy += 1;
    if (b.id !== b.name) ui.text(dx, dy++, b.id, { fg: c.faint }, dw);
    dy += 1;
    // the doc, wrapped
    for (const l of wrapWords(b.doc || "—", dw).slice(0, 6)) ui.text(dx, dy++, l, { fg: c.fg }, dw);
    dy += 1;
    if (b.value) {
      ui.text(dx, dy, t("now"), { fg: c.subtle });
      ui.text(dx + 8, dy++, b.value, { fg: c.accent, attrs: BOLD }, dw - 8);
    }
    if (b.call) {
      dy += 1;
      ui.text(dx, dy++, t("call it"), { fg: c.subtle });
      ui.fill({ x: dx, y: dy, w: dw, h: 1 }, { bg: c.highlight });
      ui.text(dx + 1, dy, `› ${b.call}`, { fg: c.fg, bg: c.highlight }, dw - 2);
      dy += 2;
      if (b.kind === "function") {
        const [mod, ...fn] = b.id.split(".");
        ui.text(dx, dy++, t("from a module"), { fg: c.subtle });
        ui.text(dx + 1, dy++, `await ib.use("${mod}").${fn.join(".")}(…)`, { fg: c.muted }, dw - 1);
        dy += 1;
      }
    }
    let bx = dx;
    if (b.run) bx += ui.button(bx, dy, `${t("run")} ⏎`, () => this.run(b)) + 2;
    if (b.call) ui.button(bx, dy, t("copy ⌘C"), () => (copyToClipboard(b.call!), this.deck.notify(`${t("copied")}: ${b.call}`, "success")));
  }
}

export const blocksSpec: AppSpec = {
  kind: "blocks",
  title: "Blocks",
  description: "everything the deck can do: commands, settings, functions, shortcuts… and how to call them",
  icon: "▦",
  launcher: true,
  create: (deck) => new BlocksApp(deck),
};
