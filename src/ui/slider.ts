import { BOLD, type Rect } from "../core/grid";
import { strWidth, truncate } from "../core/unicode";
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
  /** greyed out, doesn't move (another setting decides) */
  disabled?: boolean;
}

/**
 * A real slider: ━━━━━━■──────  120%
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
  // every slider of the deck looks the same: the number in a column of the same width,
  // so the bars line up and have the same length whatever their unit
  const textW = 6;
  const text = truncate(show(value), textW);
  const tw = Math.max(4, r.w - textW - 1);
  const track = { x: r.x, y: r.y, w: tw, h: 1 };
  const k = max > min ? (Math.max(min, Math.min(max, value)) - min) / (max - min) : 0;
  const hot = ui.hovered(track);
  if (o.disabled) {
    // greyed: the track and the number, no handle to grab
    ui.text(r.x, r.y, "─".repeat(tw), { fg: c.faint });
    ui.textRight(r.x + r.w, r.y, text, { fg: c.faint });
    ui.hit(track, { onClick: () => {}, tip: o.tip ?? "locked" });
    return;
  }
  // The rules, the same for every slider of the deck (settings, ✦ fx, the setup):
  //  · one track width per place, the number in a 6-column box on the right
  //  · the filled part ━ in the accent (grey when the value means "off"), the rest ─ always visible
  //  · one handle, ■ — a true square drawn centred on the track's line (core/glyphs.ts) — at the value's cell
  //  · the number: "80%" by default, the unit when it isn't a percentage (px, fps, min), "off" at 0 when 0 is off
  const on = !(o.zeroIsOff && value === 0);
  const at0 = Math.round(k * (tw - 1));
  ui.text(r.x, r.y, "━".repeat(at0), { fg: on ? c.accent : c.subtle });
  if (at0 + 1 < tw) ui.text(r.x + at0 + 1, r.y, "─".repeat(tw - at0 - 1), { fg: c.subtle });
  ui.text(r.x + at0, r.y, "■", { fg: hot ? c.fg : on ? c.accent : c.subtle, attrs: BOLD });
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
