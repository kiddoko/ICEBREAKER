import { mix, type RGB } from "../core/color";
import { BOLD, type Rect } from "../core/grid";
import { t } from "../core/i18n";
import type { KeyInput } from "../core/input";
import { Field } from "./field";
import { TAG_NAMES, tagRGB, type TagColor } from "../vault/marks";
import type { UI } from "./ui";

/**
 * THE filter bar, for every list or ring of things (MODULES, NEXUS, and any
 * menu of that kind to come): a search field and the 8 colour squares, several
 * colours at once. One line:
 *
 *   ⌕ weath▌               ■ ■ □ □ ■ □ □ □  ×
 *
 *   "/" (or a click on the field) types into the search, esc clears it;
 *   a click on a square adds / removes that colour; × clears everything.
 *
 * Use: keep one `FilterBar` in your app, call `bar.matches(text, tag)` to keep
 * a thing, `bar.onText / onKey` first in your own input handlers, and
 * `bar.render(ui, rect, counts)` where it should show — on a full page, let
 * `pageBar` (ui/pagebar.ts) draw it, so every page has it in the same place.
 */
export interface FilterBarOptions {
  /** a letter or a digit starts the search at once (MODULES, NEXUS: pages without letter shortcuts) */
  typeToSearch?: boolean;
  /**
   * the search always has the keyboard (Settings, CATALOG, SHORTCUTS): every key types,
   * the caret shows whenever the page is focused — ←→ home end stay the page's
   */
  always?: boolean;
  /** the colour squares (default true): off where things wear no colour */
  colours?: boolean;
  /** after each change of the search */
  onChange?: (query: string) => void;
}

/** What a page tells the bar when drawing it. */
export interface FilterBarDraw {
  /** the page has the keyboard (`always` bars show their caret then) */
  focused?: boolean;
  /** the empty field's text (translated) */
  placeholder?: string;
  /** the field's background when not typing */
  bg?: RGB;
  /** the field's widest (default 28 with colours, the whole line without) */
  maxW?: number;
}

/**
 * THE search bar of the deck — every page that filters a list uses it (MODULES, NEXUS,
 * the file browser, Settings, CATALOG, SHORTCUTS, the STORE), so searching works and
 * looks the same everywhere. Options choose how it takes the keyboard.
 */
export class FilterBar {
  /** the search: THE one-line field (ui/field.ts) */
  private readonly field: Field;
  constructor(private readonly o: FilterBarOptions = {}) {
    this.field = new Field({ icon: "⌕", keys: o.always ? "basic" : "full", onChange: o.onChange });
    if (o.always) this.typing = true;
  }
  get query(): string {
    return this.field.text;
  }
  set query(v: string) {
    this.field.text = v;
  }
  colours = new Set<TagColor>();
  /** the search field has the keyboard */
  typing = false;

  get active(): boolean {
    return !!this.query || this.colours.size > 0;
  }

  /** Does a thing pass? Its text holds the search (any case), its colour is one of those ticked. */
  matches(text: string, tag?: TagColor | null): boolean {
    if (this.colours.size && (!tag || !this.colours.has(tag))) return false;
    return !this.query || text.toLowerCase().includes(this.query.toLowerCase());
  }

  toggle(c: TagColor): void {
    if (this.colours.has(c)) this.colours.delete(c);
    else this.colours.add(c);
  }

  clear(): void {
    this.query = "";
    this.colours.clear();
    this.typing = !!this.o.always;
    this.o.onChange?.("");
  }

  /** Text first goes here: "/" starts typing (or any letter, with typeToSearch); then letters build the search. */
  onText(s: string): boolean {
    if (this.o.always) return this.field.onText(s);
    if (!this.typing) {
      if (this.o.typeToSearch && /^[\p{L}\p{N}]$/u.test(s)) {
        this.typing = true;
        return this.field.onText(s);
      }
      if (s !== "/") return false;
      this.typing = true;
      return true;
    }
    if (/^[\r\n]+$/.test(s)) return (this.typing = false), true;
    return this.field.onText(s);
  }

  /** While typing: backspace, enter (keep the search, give the keys back), esc (clear it). */
  onKey(k: KeyInput): boolean {
    // always typing: the field's own keys (⌫, ctrl+U); enter and esc stay the page's
    if (this.o.always) return k.combo !== "enter" && k.combo !== "esc" && this.field.onKey(k);
    if (!this.typing) return false;
    if (k.combo === "enter" || k.combo === "down" || k.combo === "tab") return (this.typing = false), true;
    if (k.combo === "esc") return (this.query = ""), (this.typing = false), true;
    return this.field.onKey(k);
  }

  /**
   * One line: the search field on the left (as wide as it can), the squares on
   * the right. `counts` says how many things wear each colour (□ none yet).
   */
  render(ui: UI, r: Rect, counts: Partial<Record<TagColor, number>> = {}, d: FilterBarDraw = {}): void {
    const c = ui.c;
    // the squares end on the rect's last cell (under the last button of a page bar);
    // the × that clears everything sits just left of them. Too narrow for the field (8
    // cells) and the squares: the squares go (the field is what you came for)
    const squaresW = TAG_NAMES.length * 2 - 1;
    const colours = this.o.colours !== false && r.w >= squaresW + 5 + 8;
    const fw = colours ? Math.min(d.maxW ?? 28, r.w - squaresW - 5) : Math.min(d.maxW ?? r.w, r.w);
    const field = { x: r.x, y: r.y, w: fw, h: 1 };
    const placeholder = d.placeholder ?? t(this.o.typeToSearch || this.o.always ? "type to search" : "/ search");
    if (this.o.always) this.field.render(ui, field, { focused: d.focused ?? true, bg: d.bg, placeholder });
    else this.field.render(ui, field, { focused: this.typing && d.focused !== false, active: this.typing, bg: d.bg, placeholder: this.typing ? "" : placeholder });
    if (!this.o.always) ui.hit(field, { onClick: () => (this.typing = true), tip: t("type to filter · / · esc clears") });
    if (!colours) return;
    // the colours, several at once
    const x = r.x + r.w - squaresW;
    if (this.active) {
      const xr = { x: x - 3, y: r.y, w: 2, h: 1 };
      ui.text(xr.x, r.y, "×", { fg: ui.hovered(xr) ? c.error : c.subtle, attrs: BOLD });
      ui.hit(xr, { onClick: () => this.clear(), tip: t("show everything") });
    }
    colourSquares(ui, x, r.y, this.colours, counts, (tc) => ({ onClick: () => this.toggle(tc) }));
  }
}

/**
 * THE row of colour squares (FilterBar, the tree): □ nobody wears it, ■ some
 * do, ▣ ticked. One square every 2 cells; `act` says what a click does (a
 * function or a shell command). Returns the x after the last square.
 */
export function colourSquares(ui: UI, x: number, y: number, on: Set<TagColor>, counts: Partial<Record<TagColor, number>>, act: (tc: TagColor) => { onClick?: () => void; cmd?: string }, maxX = Infinity): number {
  const c = ui.c;
  for (const tc of TAG_NAMES) {
    if (x + 1 > maxX) break;
    const ticked = on.has(tc);
    const n = counts[tc] ?? 0;
    const rect = { x, y, w: 1, h: 1 };
    const hot = ui.hovered(rect);
    ui.text(x, y, ticked ? "▣" : n ? "■" : "□", { fg: n || ticked || hot ? tagRGB(tc) : mix(tagRGB(tc), c.bg, 0.45), bg: ticked || hot ? c.highlight : undefined, attrs: ticked ? BOLD : 0 });
    ui.hit(rect, { ...act(tc), tip: `${t(tc)} · ${n}\n${ticked ? t("click: take this colour out") : t("click: add this colour")}` });
    x += 2;
  }
  return x;
}
