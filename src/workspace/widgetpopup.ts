import { t } from "../core/i18n";
import type { Rect } from "../core/grid";
import type { Action, KeyInput } from "../core/input";
import type { Deck } from "../deck";
import type { UI } from "../ui/ui";
import type { WidgetSpec } from "../widgets/types";
import type { Overlay } from "./overlays";
import { focusWidget } from "../widgets/instances";
import { CLOSE, dialogButtons } from "../ui/dialog";

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
    private readonly spec: WidgetSpec,
    /** which copy ("clock#2"): its commands change that one */
    private readonly key?: string,
  ) {
    focusWidget(key ?? spec.id);
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
    // bottom right: close (the way out) on the left, open (the way forward) on the right (ui/dialog.ts)
    const words = this.spec.open?.split(" ") ?? [];
    const x = dialogButtons(ui, inner, [
      { label: CLOSE(), run: () => (this.done = true), accent: c.subtle },
      ...(this.spec.open ? [{ label: `${t("open")} ${words[0] === "launch" ? words[1] : words[0]}  ⏎`, run: () => this.open(), tip: this.spec.open }] : []),
    ], fy);
    if (p.hint) ui.text(inner.x + 1, fy, t(p.hint), { fg: c.faint, attrs: 0 }, Math.max(0, x - inner.x - 3));
  }
}
