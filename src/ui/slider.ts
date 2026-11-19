import { BOLD, type Rect } from "../core/grid";
import { strWidth } from "../core/unicode";
import type { UI } from "./ui";

export interface SliderOptions {
  /** what the number shows as ("120%" by default) */
  show?: (v: number) => string;
  /** 0 reads "off" (effects) */
  zeroIsOff?: boolean;
  /** keyboard / wheel step (default 5) */
  step?: number;
  tip?: string;
}

/**
 * A real slider: ━━━━━━╸──────  120%
 * Click or drag anywhere on the track (1 % at a time), the wheel steps by 5;
 * the caller handles ← → (also by 5). Returns the width it used.
 */
export function slider(ui: UI, r: Rect, value: number, min: number, max: number, onSet: (v: number) => void, o: SliderOptions = {}): void {
  const c = ui.c;
  const show = o.show ?? ((v: number) => (o.zeroIsOff && v === 0 ? "off" : `${v}%`));
  const text = show(value);
  const textW = Math.max(5, strWidth(show(max)), strWidth(text));
  const tw = Math.max(4, r.w - textW - 1);
  const track = { x: r.x, y: r.y, w: tw, h: 1 };
  const k = max > min ? (Math.max(min, Math.min(max, value)) - min) / (max - min) : 0;
  const filled = Math.round(k * (tw - 1));
  const hot = ui.hovered(track);
  const on = !(o.zeroIsOff && value === 0);
  ui.text(r.x, r.y, "━".repeat(filled), { fg: on ? c.accent : c.subtle });
  ui.text(r.x + filled, r.y, "╸", { fg: hot ? c.fg : on ? c.accent : c.subtle, attrs: BOLD });
  if (filled + 1 < tw) ui.text(r.x + filled + 1, r.y, "─".repeat(tw - filled - 1), { fg: c.faint });
  ui.textRight(r.x + r.w, r.y, text, { fg: on ? c.accent : c.subtle, attrs: BOLD });
  const at = (mx: number) => Math.round(min + (Math.max(0, Math.min(tw - 1, mx - r.x)) / Math.max(1, tw - 1)) * (max - min));
  const step = o.step ?? 5;
  ui.hit(track, {
    onClick: (m) => onSet(at(m.x)),
    onDrag: (m) => onSet(at(m.x)),
    onWheel: (d) => onSet(Math.max(min, Math.min(max, value - Math.sign(d) * step))),
    tip: o.tip ?? "drag, click, wheel · ←→ by 5",
  });
}
