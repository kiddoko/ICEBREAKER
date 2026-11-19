import { mix } from "../core/color";
import { BOLD, type Rect } from "../core/grid";
import { t } from "../core/i18n";
import type { KeyInput } from "../core/input";
import { strWidth, truncate } from "../core/unicode";
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
export class FilterBar {
  query = "";
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
    this.typing = false;
  }

  /** Text first goes here: "/" starts typing; then letters build the search. */
  onText(s: string): boolean {
    if (!this.typing) {
      if (s !== "/") return false;
      this.typing = true;
      return true;
    }
    if (s === "\n") return (this.typing = false), true;
    this.query += s;
    return true;
  }

  /** While typing: backspace, enter (keep the search, give the keys back), esc (clear it). */
  onKey(k: KeyInput): boolean {
    if (!this.typing) return false;
    if (k.combo === "backspace") return (this.query = this.query.slice(0, -1)), true;
    if (k.combo === "enter" || k.combo === "down" || k.combo === "tab") return (this.typing = false), true;
    if (k.combo === "esc") return (this.query = ""), (this.typing = false), true;
    return false;
  }

  /**
   * One line: the search field on the left (as wide as it can), the squares on
   * the right. `counts` says how many things wear each colour (□ none yet).
   */
  render(ui: UI, r: Rect, counts: Partial<Record<TagColor, number>> = {}): void {
    const c = ui.c;
    // the squares end on the rect's last cell (under the last button of a page bar);
    // the × that clears everything sits just left of them
    const squaresW = TAG_NAMES.length * 2 - 1;
    const fw = Math.max(8, Math.min(28, r.w - squaresW - 5));
    const field = { x: r.x, y: r.y, w: fw, h: 1 };
    const fbg = this.typing ? mix(c.accent, c.bg, 0.82) : c.highlight;
    ui.fill(field, { bg: fbg });
    ui.text(field.x + 1, r.y, "⌕", { fg: c.accent, bg: fbg });
    if (this.query || this.typing) ui.text(field.x + 3, r.y, truncate(this.query, fw - 4), { fg: c.fg, bg: fbg });
    else ui.text(field.x + 3, r.y, t("/ search"), { fg: c.faint, bg: fbg }, fw - 4);
    if (this.typing) ui.cursor(field.x + 3 + Math.min(strWidth(this.query), fw - 4), r.y);
    ui.hit(field, { onClick: () => (this.typing = true), tip: t("type to filter · / · esc clears") });
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
