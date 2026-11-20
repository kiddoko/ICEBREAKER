import { mix } from "../core/color";
import { strWidth } from "../core/unicode";
import { BOLD, type Rect } from "../core/grid";
import { t } from "../core/i18n";
import type { Action, KeyInput } from "../core/input";
import { AVATAR_COLORS, AVATARS, avatarRGB, drawAvatar } from "../core/avatar";
import type { Deck } from "../deck";
import type { UI } from "../ui/ui";
import type { Overlay } from "./overlays";

/**
 * Choose your profile icon: a grid of pixel-art faces and glyphs, a row of
 * colours under it. Arrows / mouse choose, tab goes to the colours, enter
 * keeps it (`avatar <id> <colour>`), esc leaves it as it was.
 */
export class AvatarPicker implements Overlay {
  modal = true;
  done = false;
  private sel: number;
  private color: string;
  private row: "icons" | "colors" = "icons";
  private cols = 6;

  constructor(private readonly deck: Deck) {
    const cur = deck.settings.data.user.avatar;
    this.sel = Math.max(0, AVATARS.findIndex((a) => a.id === cur?.id));
    this.color = cur?.color && cur.color in AVATAR_COLORS ? cur.color : "accent";
  }

  private apply(): void {
    this.done = true;
    void this.deck.act(`avatar ${AVATARS[this.sel].id} ${this.color}`);
  }

  onKey(k: KeyInput): boolean {
    if (k.combo === "esc") return (this.done = true), true;
    if (k.combo === "enter") return this.apply(), true;
    if (k.combo === "tab" || k.combo === "shift+tab") return (this.row = this.row === "icons" ? "colors" : "icons"), true;
    // a modal gets raw keys: the arrows walk the grid (the gamepad comes through onAction)
    const dir = ({ up: "up", down: "down", left: "left", right: "right" } as Record<string, Action>)[k.combo];
    return dir ? this.onAction(dir) : true;
  }
  onText(): boolean {
    return true;
  }
  onAction(a: Action): boolean {
    const names = Object.keys(AVATAR_COLORS);
    const n = AVATARS.length;
    if (this.row === "colors") {
      const i = names.indexOf(this.color);
      if (a === "left") this.color = names[(i - 1 + names.length) % names.length];
      else if (a === "right") this.color = names[(i + 1) % names.length];
      else if (a === "up") this.row = "icons";
      else if (a === "confirm") this.apply();
      else if (a === "back") this.done = true;
      else return false;
      this.deck.sound.play("tick");
      return true;
    }
    if (a === "left") this.sel = (this.sel - 1 + n) % n;
    else if (a === "right") this.sel = (this.sel + 1) % n;
    else if (a === "up") this.sel = Math.max(0, this.sel - this.cols);
    else if (a === "down") {
      if (this.sel + this.cols < n) this.sel += this.cols;
      else this.row = "colors";
    } else if (a === "confirm") return this.apply(), true;
    else if (a === "back") return (this.done = true), true;
    else return false;
    this.deck.sound.play("tick");
    return true;
  }

  render(ui: UI, screen: Rect): void {
    const c = ui.c;
    ui.tint(screen, c.subtle);
    ui.hit(screen, { onClick: () => {}, onWheel: () => {}, block: true });
    const cellW = 9, cellH = 5;
    this.cols = Math.max(3, Math.min(8, Math.floor((screen.w - 30) / cellW)));
    const rows = Math.ceil(AVATARS.length / this.cols);
    const w = this.cols * cellW + 22;
    const h = Math.min(screen.h - 2, rows * cellH + 8);
    const r = { x: screen.x + Math.floor((screen.w - w) / 2), y: screen.y + Math.max(1, Math.floor((screen.h - h) / 3)), w, h };
    const inner = ui.box(r, { title: t("PROFILE ICON"), focused: true, bg: c.panel, info: t("enter keep · tab colours · esc") });
    const col = avatarRGB(ui, this.color);

    // the preview, big, on the right: you
    const pv = { x: inner.x + inner.w - 18, y: inner.y + 1, w: 16, h: 7 };
    // centred in the frame's inside (not in the frame itself)
    const pvIn = ui.box(pv, { border: "double", bg: mix(c.panel, col, 0.08), fill: true });
    drawAvatar(ui, pvIn, AVATARS[this.sel], col, { bg: mix(c.panel, col, 0.08) });
    ui.textCenter({ x: pv.x, y: pv.y, w: pv.w, h: 1 }, pv.y + pv.h, this.deck.settings.data.user.handle, { fg: col, attrs: BOLD });
    ui.textCenter({ x: pv.x, y: pv.y, w: pv.w, h: 1 }, pv.y + pv.h + 1, AVATARS[this.sel].name, { fg: c.subtle });

    // the grid
    const gridH = inner.h - 3;
    const visibleRows = Math.max(1, Math.floor(gridH / cellH));
    const selRow = Math.floor(this.sel / this.cols);
    const firstRow = Math.max(0, Math.min(selRow - Math.floor(visibleRows / 2), rows - visibleRows));
    AVATARS.forEach((a, i) => {
      const gr = Math.floor(i / this.cols) - firstRow;
      if (gr < 0 || gr >= visibleRows) return;
      const cell = { x: inner.x + 1 + (i % this.cols) * cellW, y: inner.y + gr * cellH, w: cellW - 1, h: cellH - 1 };
      const on = i === this.sel;
      const hot = ui.hovered(cell);
      const bg = on ? mix(c.panel, col, this.row === "icons" ? 0.22 : 0.12) : hot ? c.highlight : c.panel;
      ui.fill(cell, { bg });
      drawAvatar(ui, cell, a, on ? col : mix(c.fg, c.panel, 0.25), { bg });
      ui.hit(cell, { onClick: () => ((this.sel = i), (this.row = "icons")), onDouble: () => this.apply(), tip: a.name });
    });

    // the colours
    const cy = inner.y + inner.h - 2;
    let cx = inner.x + 1;
    ui.text(cx, cy, t("colour"), { fg: this.row === "colors" ? c.accent : c.subtle, attrs: this.row === "colors" ? BOLD : 0 });
    cx += 8;
    for (const name of Object.keys(AVATAR_COLORS)) {
      const on = name === this.color;
      const sw = name === "accent" ? t("theme") : "■■";
      const rect = { x: cx, y: cy, w: sw.length + 2, h: 1 };
      const fg = avatarRGB(ui, name);
      ui.text(cx, cy, on ? `[${sw}]` : ` ${sw} `, { fg, bg: on && this.row === "colors" ? c.highlight : undefined, attrs: on ? BOLD : 0 });
      ui.hit(rect, { onClick: () => ((this.color = name), (this.row = "colors")), tip: name });
      cx += rect.w + 1;
    }
    const ok = ` ${t("keep it")}  ⏎ `;
    ui.button(inner.x + inner.w - strWidth(ok) - 2, cy, ok.trim(), () => this.apply());
  }
}
