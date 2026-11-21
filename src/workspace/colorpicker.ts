import { css, hex, hsl, mix, toHsl, type RGB } from "../core/color";
import { BOLD, type Rect } from "../core/grid";
import { t } from "../core/i18n";
import type { Action, KeyInput } from "../core/input";
import type { Deck } from "../deck";
import { Field } from "../ui/field";
import { slider } from "../ui/slider";
import type { UI } from "../ui/ui";
import type { Overlay } from "./overlays";

/** the palette's columns: hues every 20° (red, orange, yellow… back to pink) */
const HUES = Array.from({ length: 18 }, (_, i) => i * 20);
/** its rows: light to very dark (the darkest are for backgrounds and panels) */
const LIGHTS = [0.88, 0.78, 0.68, 0.58, 0.48, 0.38, 0.27, 0.17, 0.1, 0.055];
/** greys, white to black */
const GREYS = Array.from({ length: 18 }, (_, i) => Math.round(255 - (i * 255) / 17));

/** What the picker gives back: a colour, "reset" (the theme's own value) or null (cancelled). */
export type PickedColour = string | "reset" | null;

/**
 * THE colour picker (theme studio): a palette in characters — 18 hues × 10 shades at the
 * saturation you choose, a row of greys, the theme's own colours — and the #hex field,
 * still typable. Keyboard: arrows walk the palette, tab goes to the saturation and the hex
 * field, enter keeps it, esc leaves it as it was. Mouse: click a swatch, double-click to keep.
 */
export class ColorPicker implements Overlay {
  modal = true;
  done = false;
  /** the colour chosen so far */
  private value: RGB;
  private readonly before: RGB;
  /** where the cursor is: palette rows 0–9, 10 greys, 11 the theme's colours */
  private row = 0;
  private col = 0;
  private sat = 80;
  private focus: "grid" | "sat" | "hex" = "grid";
  private readonly field: Field;

  constructor(
    private readonly deck: Deck,
    private readonly title: string,
    current: string,
    private readonly resolve: (v: PickedColour) => void,
    /** the theme's own value differs (a tweak is set): ↺ can put it back */
    private readonly tweaked = false,
  ) {
    let v: RGB;
    try {
      v = hex(current);
    } catch {
      v = deck.theme.c.accent;
    }
    this.value = this.before = v;
    // start on the swatch closest to the colour you have
    const [h, s, l] = toHsl(v);
    this.sat = s < 0.08 ? 80 : Math.round((s * 100) / 5) * 5;
    if (s < 0.08) {
      this.row = 10;
      this.col = nearest(GREYS, Math.round(l * 255));
    } else {
      this.col = Math.round(h / 20) % HUES.length;
      this.row = nearest(LIGHTS, l);
    }
    this.field = new Field({
      initial: css(v).slice(1),
      icon: "#",
      onChange: (text) => {
        try {
          this.value = hex(text);
        } catch {
          /* not a colour yet: keep the last one */
        }
      },
      onSubmit: () => this.finish(css(this.value)),
    });
  }

  /** the theme's colours, for the last row */
  private themeColours(): RGB[] {
    const c = this.deck.theme.c;
    return [c.bg, c.panel, c.highlight, c.faint, c.subtle, c.muted, c.fg, c.accent, c.accentAlt, c.success, c.warning, c.error, ...this.deck.theme.ansi.slice(1, 7)];
  }

  private swatch(row: number, col: number): RGB | undefined {
    if (row < LIGHTS.length) return hsl(HUES[col], this.sat / 100, LIGHTS[row]);
    if (row === LIGHTS.length) return GREYS[col] === undefined ? undefined : (GREYS[col] << 16) | (GREYS[col] << 8) | GREYS[col];
    return this.themeColours()[col];
  }

  private rowLength(row: number): number {
    return row < LIGHTS.length ? HUES.length : row === LIGHTS.length ? GREYS.length : this.themeColours().length;
  }

  /** the cursor moved onto a swatch: it is the colour now */
  private take(row: number, col: number): void {
    this.row = row;
    this.col = Math.max(0, Math.min(this.rowLength(row) - 1, col));
    const v = this.swatch(this.row, this.col);
    if (v === undefined) return;
    this.value = v;
    this.field.text = css(v).slice(1);
    this.deck.sound.play("tick");
  }

  private finish(v: PickedColour): void {
    if (this.done) return;
    this.done = true;
    this.resolve(v);
  }

  onKey(k: KeyInput): boolean {
    if (k.combo === "esc") return this.finish(null), true;
    if (k.combo === "tab" || k.combo === "shift+tab") {
      const order = ["grid", "sat", "hex"] as const;
      this.focus = order[(order.indexOf(this.focus) + (k.shift ? 2 : 1)) % 3];
      return true;
    }
    if (this.focus === "hex") {
      if (k.combo === "up") return (this.focus = "sat"), true;
      return this.field.onKey(k) || true;
    }
    if (k.combo === "enter") return this.finish(css(this.value)), true;
    // ⌫ / del: back to the theme's own colour (when a tweak is set)
    if (k.combo === "delete" && this.tweaked) return this.finish("reset"), true;
    const dir = ({ up: "up", down: "down", left: "left", right: "right" } as Record<string, Action>)[k.combo];
    return dir ? this.onAction(dir) : true;
  }

  onText(s: string): boolean {
    // a # or a hex digit typed anywhere: into the hex field
    if (this.focus !== "hex" && /^[#0-9a-f]/i.test(s) && s !== " ") {
      this.focus = "hex";
      this.field.text = "";
    }
    if (this.focus === "hex") this.field.onText(s.replace(/^#/, ""));
    return true;
  }

  onAction(a: Action): boolean {
    if (a === "back") return this.finish(null), true;
    if (a === "confirm") return this.finish(css(this.value)), true;
    if (this.focus === "sat") {
      if (a === "left" || a === "right") {
        this.sat = Math.max(0, Math.min(100, this.sat + (a === "right" ? 5 : -5)));
        if (this.row < LIGHTS.length) this.take(this.row, this.col);
      } else if (a === "up") this.focus = "grid";
      else if (a === "down") this.focus = "hex";
      return true;
    }
    if (this.focus === "hex") {
      if (a === "up") this.focus = "sat";
      return true;
    }
    const rows = LIGHTS.length + 2;
    if (a === "left") this.take(this.row, (this.col - 1 + this.rowLength(this.row)) % this.rowLength(this.row));
    else if (a === "right") this.take(this.row, (this.col + 1) % this.rowLength(this.row));
    else if (a === "up" && this.row > 0) this.take(this.row - 1, this.col);
    else if (a === "down") {
      if (this.row < rows - 1) this.take(this.row + 1, this.col);
      else this.focus = "sat";
    }
    return true;
  }

  render(ui: UI, screen: Rect): void {
    const c = ui.c;
    ui.tint(screen, c.subtle);
    ui.hit(screen, { onClick: () => this.finish(null), onWheel: () => {}, block: true });
    const gridW = HUES.length * 3;
    const w = Math.min(screen.w - 2, gridW + 24);
    const h = Math.min(screen.h - 2, LIGHTS.length + 10);
    const r = { x: screen.x + Math.floor((screen.w - w) / 2), y: screen.y + Math.max(1, Math.floor((screen.h - h) / 3)), w, h };
    const inner = ui.box(r, { title: `${t("COLOUR")} · ${this.title}`, focused: true, bg: c.panel, info: t("enter keep · esc cancel") });
    ui.hit(r, { onClick: () => {} }); // a click inside doesn't close it

    // the palette, the greys, the theme's colours
    const gx = inner.x + 1;
    const rows = LIGHTS.length + 2;
    for (let row = 0; row < rows; row++) {
      const y = inner.y + row + (row >= LIGHTS.length ? 1 : 0);
      if (y >= inner.y + inner.h - 3) break;
      for (let col = 0; col < this.rowLength(row); col++) {
        const v = this.swatch(row, col)!;
        const x = gx + col * 3;
        if (x + 2 > inner.x + inner.w - 18) break;
        const on = this.focus === "grid" && row === this.row && col === this.col;
        ui.text(x, y, "██", { fg: v });
        if (on) {
          ui.text(x - 1, y, "▕", { fg: c.fg, attrs: BOLD });
          ui.text(x + 2, y, "▏", { fg: c.fg, attrs: BOLD });
        } else if (v === this.value) ui.text(x + 2, y, "◂", { fg: c.fg });
        ui.hit({ x, y, w: 2, h: 1 }, {
          onClick: () => ((this.focus = "grid"), this.take(row, col)),
          onDouble: () => this.finish(css(v)),
          tip: `${css(v)}${row === LIGHTS.length + 1 ? ` · ${t("this theme's colours")}` : ""}`,
        });
      }
    }

    // the saturation (the palette's rows follow it)
    const sy = inner.y + inner.h - 2;
    ui.text(gx, sy, t("saturation"), { fg: this.focus === "sat" ? c.accent : c.subtle, attrs: this.focus === "sat" ? BOLD : 0 });
    slider(ui, { x: gx + 12, y: sy, w: Math.min(30, gridW - 14), h: 1 }, this.sat, 0, 100, (v) => {
      this.focus = "sat";
      this.sat = Math.round(v);
      if (this.row < LIGHTS.length) this.take(this.row, this.col);
    }, { step: 5, tip: t("the palette's saturation · tab, then ←→") });

    // the hex field and the buttons
    const hy = inner.y + inner.h - 1;
    this.field.render(ui, { x: gx, y: hy, w: 12, h: 1 }, { focused: this.focus === "hex", active: this.focus === "hex" });
    ui.hit({ x: gx, y: hy, w: 12, h: 1 }, { onClick: () => (this.focus = "hex"), tip: t("type a #hex colour") });
    let bx = gx + 14;
    bx += ui.button(bx, hy, `${t("keep")} ⏎`, () => this.finish(css(this.value)), { selected: true }) + 1;
    if (this.tweaked) bx += ui.button(bx, hy, `↺ ${t("theme's value")}`, () => this.finish("reset"), { tip: t("back to the theme's own colour · del"), accent: c.warning }) + 1;
    ui.button(bx, hy, t("cancel"), () => this.finish(null), { accent: c.subtle });

    // the preview: the new colour and the one before, as blocks and on text
    const px = inner.x + inner.w - 16, pw = 15;
    if (px > gx + gridW - 4) {
      ui.text(px, inner.y, t("new"), { fg: c.subtle });
      ui.fill({ x: px, y: inner.y + 1, w: pw, h: 3 }, { bg: this.value });
      ui.text(px + 1, inner.y + 2, css(this.value), { fg: contrast(this.value), bg: this.value, attrs: BOLD });
      ui.text(px, inner.y + 4, t("before"), { fg: c.subtle });
      ui.fill({ x: px, y: inner.y + 5, w: pw, h: 2 }, { bg: this.before });
      ui.text(px + 1, inner.y + 5, css(this.before), { fg: contrast(this.before), bg: this.before });
      ui.text(px, inner.y + 8, "Aa ◆ ━━", { fg: this.value, bg: c.bg, attrs: BOLD });
      ui.text(px, inner.y + 9, " Aa ◆ ", { fg: c.fg, bg: this.value });
      ui.text(px + 6, inner.y + 9, " ", { bg: mix(this.value, c.bg, 0.5) });
    }
  }
}

/** black or white, whichever reads on that colour */
function contrast(v: RGB): RGB {
  return toHsl(v)[2] > 0.55 ? 0x000000 : 0xffffff;
}

function nearest(list: number[], v: number): number {
  let best = 0;
  list.forEach((x, i) => Math.abs(x - v) < Math.abs(list[best] - v) && (best = i));
  return best;
}
