import { t } from "../core/i18n";
import { strWidth } from "../core/unicode";
import type { Rect } from "../core/grid";
import type { Action, KeyInput } from "../core/input";
import type { Deck } from "../deck";
import type { UI } from "../ui/ui";
import type { WidgetSpec } from "../widgets/types";
import type { Overlay } from "./overlays";
import { focusWidget } from "../widgets/instances";

/**
 * A widget's pop-up (enter or double-click on HOME, or `widget <id>`): more
 * of the widget — add a city, draw another quote… — with a button to open the
 * module it belongs to. Keyboard, mouse and gamepad: the pop-up's own keys
 * first, then enter / A opens the module, esc / B closes.
 */
export class WidgetPopup implements Overlay {
  modal = true;
  done = false;

  constructor(
    private readonly deck: Deck,
    private readonly first: WidgetSpec,
    /** which copy ("clock#2"): its commands change that one */
    private readonly key?: string,
  ) {
    focusWidget(key ?? first.id);
  }

  /** the widget as registered now: a module that reloads gives its new one (not the old, frozen) */
  private get spec(): WidgetSpec {
    return this.deck.widgets.get(this.first.id) ?? this.first;
  }

  private get ctx() {
    return { deck: this.deck, focused: true, key: this.key ?? this.spec.id, close: () => (this.done = true) };
  }

  private open(): void {
    if (!this.spec.open) return;
    this.done = true;
    void this.deck.act(this.spec.open);
  }

  onKey(k: KeyInput): boolean {
    if (this.spec.popup?.onKey?.(k, this.ctx)) return true;
    if (k.key === "esc") this.done = true;
    else if (k.combo === "enter") this.open();
    return true;
  }

  onText(t: string): boolean {
    if (this.spec.popup?.onText?.(t, this.ctx)) return true;
    if (t === "o") this.open(); // (pop-ups that take typing never let "o" through)
    return true;
  }

  onAction(a: Action): boolean {
    if (this.spec.popup?.onAction?.(a, this.ctx)) return true;
    if (a === "back") this.done = true;
    else if (a === "confirm") this.open();
    return true;
  }

  render(ui: UI, screen: Rect): void {
    const c = ui.c;
    const p = this.spec.popup!;
    ui.tint(screen, c.subtle);
    ui.hit(screen, { onClick: () => (this.done = true), onWheel: () => {}, block: true });
    const w = Math.min(screen.w - 4, p.size?.w ?? 60);
    const h = Math.min(screen.h - 2, (p.size?.h ?? 14) + 3);
    const box = { x: screen.x + Math.floor((screen.w - w) / 2), y: screen.y + Math.floor((screen.h - h) / 3), w, h };
    ui.hit(box, { onClick: () => {}, block: true });
    const inner = ui.box(box, { title: t(p.title ?? this.spec.title).toUpperCase(), focused: true, bg: c.panelAlt });
    const body = { x: inner.x, y: inner.y, w: inner.w, h: inner.h - 2 };
    ui.clip(body, () => p.render(ui, body, this.ctx));
    // footer: open the module · close
    const fy = inner.y + inner.h - 1;
    ui.hline(inner.x, fy - 1, inner.w, { fg: c.border });
    const close = t("close  esc");
    const x = inner.x + inner.w - strWidth(close) - 4;
    ui.button(x, fy, close, () => (this.done = true), { accent: c.subtle });
    // where the buttons start: the hint gets what's left of the line
    let left = x;
    if (this.spec.open) {
      const words = this.spec.open.split(" ");
      const label = `${t("open")} ${words[0] === "launch" ? words[1] : words[0]}  ⏎`;
      left = x - strWidth(label) - 4;
      ui.button(left, fy, label, () => this.open(), { tip: this.spec.open });
    }
    if (p.hint) {
      const hint = t(p.hint);
      const room = left - inner.x - 3;
      // too long for beside the buttons: on the line above them; still too long: the whole
      // "key what" pieces that fit, never one cut in the middle ("space s…")
      if (strWidth(hint) <= room) ui.text(inner.x + 1, fy, hint, { fg: c.faint, attrs: 0 }, room);
      else ui.text(inner.x + 1, fy - 1, ` ${fitPieces(hint, inner.w - 4)} `, { fg: c.faint, bg: c.panelAlt, attrs: 0 }, inner.w - 2);
    }
  }
}

/** "a add · space done · del remove" cut to `room` columns at a " · ", never inside a piece. */
export function fitPieces(hint: string, room: number): string {
  if (strWidth(hint) <= room) return hint;
  let out = "";
  for (const piece of hint.split(" · ")) {
    const next = out ? `${out} · ${piece}` : piece;
    if (strWidth(next) > room) break;
    out = next;
  }
  return out;
}
