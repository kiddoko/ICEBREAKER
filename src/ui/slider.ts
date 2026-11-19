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
  /** double-click on the number: type a value (the caller asks for it) */
  onEdit?: () => void;
}

/**
 * A real slider: ━━━━━━╸──────  120%
 * Click or drag anywhere on the track: the pointer's exact position (to the
 * pixel, not the cell) gives the value, so it moves 1 % at a time. The wheel
 * steps by 5; the caller handles ← → (also by 5). Double-click the number to
 * type one (`onEdit`).
 */
/**
 * The slider being dragged, if any: where it is on screen (its identity from one
 * frame to the next — sliders are redrawn every frame), the value it shows, and
 * when the setting was last applied. While you drag, the bar follows the pointer
 * at once and the (sometimes costly) setting is applied at most every 40 ms; the
 * last value is always applied when you let go.
 */
let live: { x: number; y: number; v: number; sentAt: number; sent: number } | null = null;
const APPLY_MS = 40;

export function slider(ui: UI, r: Rect, value: number, min: number, max: number, onSet: (v: number) => void, o: SliderOptions = {}): void {
  const c = ui.c;
  if (live && live.x === r.x && live.y === r.y) value = live.v;
  const push = (v: number, force = false) => {
    if (!live || live.x !== r.x || live.y !== r.y) live = { x: r.x, y: r.y, v, sentAt: 0, sent: NaN };
    live.v = v;
    const now = performance.now();
    if ((force || now - live.sentAt >= APPLY_MS) && v !== live.sent) {
      live.sentAt = now;
      live.sent = v;
      onSet(v);
    }
    ui.animate(16);
  };
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
  // where the pointer is along the track, to the pixel: 0 at the left edge, 1 at the right
  const at = (m: { x: number; fx?: number }) => {
    const k = Math.max(0, Math.min(1, ((m.fx ?? m.x + 0.5) - r.x) / Math.max(1, tw)));
    return Math.round(min + k * (max - min));
  };
  const step = o.step ?? 5;
  const num = { x: r.x + r.w - strWidth(text), y: r.y, w: strWidth(text), h: 1 };
  if (o.onEdit) ui.hit(num, { onDouble: () => o.onEdit?.(), tip: "double-click: type a value" });
  ui.hit(track, {
    onClick: (m) => push(at(m), true),
    onDrag: (m) => push(at(m)),
    onUp: () => {
      if (live && live.x === r.x && live.y === r.y && live.v !== live.sent) onSet(live.v);
      live = null;
    },
    onWheel: (d) => onSet(Math.max(min, Math.min(max, value - Math.sign(d) * step))),
    tip: o.tip ?? "drag, click, wheel · ←→ by 5",
  });
}

/**
 * Ask for a slider's value by typing it: digits only, clamped to [min, max]
 * (0 = off for effects). Resolves with the number, or null when cancelled.
 */
export async function askNumber(deck: { prompt(title: string, o: { initial?: string; placeholder?: string; digits?: boolean }): Promise<string | null> }, label: string, current: number, min: number, max: number, zeroIsOff = false): Promise<number | null> {
  const v = await deck.prompt(`${label} (${min}-${max}${zeroIsOff ? ", 0 = off" : ""})`, { initial: String(current), digits: true });
  if (v === null || v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, Math.round(n))) : null;
}
