import { BOLD, type Rect } from "../core/grid";
import { strWidth, truncate } from "../core/unicode";
import type { UI } from "./ui";

export interface SliderOptions {
  /** what the number shows as ("120%" by default) */
  show?: (v: number) => string;
  /** 0 reads "off" (effects) */
  zeroIsOff?: boolean;
  /** the smallest step (default 1): the wheel, ←→ and holding the mouse go by it, faster the longer you hold */
  step?: number;
  tip?: string;
  /** double-click on the number: type a value (the caller asks for it) */
  onEdit?: () => void;
  /** greyed out, doesn't move (another setting decides) */
  disabled?: boolean;
}

/**
 * Held keys and a spinning wheel speed up: 1 at a time, then 2, 5, 10 the longer it
 * lasts (the same for ←→ in Settings, the wheel and a held mouse button on a slider).
 * `id` = what is being changed; a pause of 300 ms starts again from 1.
 */
const streaks = new Map<string, { at: number; n: number }>();
export function accelerated(id: string, now = performance.now()): number {
  const s = streaks.get(id);
  const n = s && now - s.at < 300 ? s.n + 1 : 0;
  streaks.set(id, { at: now, n });
  return n < 8 ? 1 : n < 20 ? 2 : n < 40 ? 5 : 10;
}

/**
 * A real slider: ━━━━━━■──────  120%
 * - grab the handle ■ and drag: it follows the pointer (to the pixel);
 * - press anywhere else on the track and hold: it steps toward the pointer 1 by 1,
 *   faster the longer you hold (like a scrollbar) — so the mouse reaches every value;
 * - the wheel and ←→ (the caller) step 1 by 1, faster when held;
 * - double-click the number to type one (`onEdit`).
 *
 * The slider being changed, if any: where it is on screen (its identity from one
 * frame to the next — sliders are redrawn every frame), the value it shows, and
 * when the setting was last applied. The bar moves at once; the (sometimes costly)
 * setting is applied at most every 40 ms, and always when you let go.
 */
let live: { x: number; y: number; v: number; sentAt: number; sent: number; hold?: { target: number; next: number; startX: number } } | null = null;
const APPLY_MS = 40;

export function slider(ui: UI, r: Rect, value: number, min: number, max: number, onSet: (v: number) => void, o: SliderOptions = {}): void {
  const c = ui.c;
  const mine = !!live && live.x === r.x && live.y === r.y;
  if (mine) value = live!.v;
  const clamp = (v: number) => Math.max(min, Math.min(max, v));
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
  const k = max > min ? (clamp(value) - min) / (max - min) : 0;
  const hot = ui.hovered(track);
  if (o.disabled) {
    // greyed: the track and the number, no handle to grab
    ui.text(r.x, r.y, "─".repeat(tw), { fg: c.faint });
    ui.textRight(r.x + r.w, r.y, text, { fg: c.faint });
    ui.hit(track, { onClick: () => {}, tip: o.tip ?? "locked" });
    return;
  }
  const step = o.step ?? 1;
  // held on the track (not on the handle): one step toward the pointer, then faster
  if (mine && live!.hold) {
    const h = live!.hold;
    const now = performance.now();
    if (now >= h.next && value !== h.target) {
      const by = step * accelerated(`hold:${r.x}:${r.y}`, now);
      push(h.target > value ? Math.min(h.target, value + by) : Math.max(h.target, value - by));
      h.next = now + (h.next === 0 ? 350 : 45);
    }
    ui.animate(16);
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
  const num = { x: r.x + r.w - strWidth(text), y: r.y, w: strWidth(text), h: 1 };
  if (o.onEdit) ui.hit(num, { onDouble: () => o.onEdit?.(), tip: "double-click: type a value" });
  ui.hit(track, {
    onClick: (m) => {
      if (Math.abs(m.x - (r.x + at0)) <= 1) return push(value, true); // the handle: a drag starts
      // the track: one step now, more while it's held
      const by = step * accelerated(`hold:${r.x}:${r.y}`);
      const target = at(m);
      push(target > value ? Math.min(target, value + by) : Math.max(target, value - by), true);
      live!.hold = { target, next: performance.now() + 350, startX: m.fx ?? m.x };
    },
    onDrag: (m) => {
      // moving the pointer: the handle follows it (a hold that moves becomes a drag)
      if (live?.hold && Math.abs((m.fx ?? m.x) - live.hold.startX) < 1) return void (live.hold.target = at(m));
      if (live) live.hold = undefined;
      push(at(m));
    },
    onUp: () => {
      if (live && live.x === r.x && live.y === r.y && live.v !== live.sent) onSet(live.v);
      live = null;
    },
    onWheel: (d) => onSet(clamp(value - Math.sign(d) * step * accelerated(`wheel:${r.x}:${r.y}`))),
    tip: o.tip ?? "drag the handle · hold on the track · wheel · ←→ (1 at a time, faster when held)",
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
