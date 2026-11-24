import { BOLD, type Rect } from "../core/grid";
import { look } from "../core/skin/components";
import { SLIDER } from "../core/skin/parts";
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
 * A held control (a key held on a slider, the mouse held on its track) moves ONE step
 * at a time, always — what speeds up is the pace: 8 steps a second at first, eased up
 * to 60 a second after 1.5 s (one a frame). The first repeat waits HOLD_DELAY, like a key.
 */
export const HOLD_DELAY = 350;
export function holdRate(heldMs: number): number {
  const k = Math.max(0, Math.min(1, heldMs / 1500));
  return 8 + 52 * k * k * (3 - 2 * k);
}

/** The clock of one hold: `due(now)` = how many single steps are due now (0, 1, at most 2 on a slow frame). */
export class HoldClock {
  private next: number;
  constructor(private readonly t0: number) {
    this.next = t0 + HOLD_DELAY;
  }
  due(now: number): number {
    let n = 0;
    while (now >= this.next && n < 2) {
      n++;
      this.next += 1000 / holdRate(this.next - this.t0 - HOLD_DELAY);
    }
    if (now >= this.next) this.next = now + 1000 / holdRate(now - this.t0 - HOLD_DELAY); // after a stall: no burst
    return n;
  }
}

/**
 * ←→ on a slider (Settings, ✦ fx, the setup): one step at once, then — while the key
 * stays down — single steps paced by the HoldClock, until the key goes up. The key's own
 * repeats (the OS's) are ignored: their pace isn't ours, and it differs from one computer
 * to the next. `id` = what is being changed.
 */
let held: { id: string; dir: 1 | -1; timer?: ReturnType<typeof setInterval> } | null = null;
let listening = false;
export function heldStep(id: string, dir: 1 | -1, step: (dir: 1 | -1) => void, now = performance.now()): void {
  if (held && held.id === id && held.dir === dir) return; // the key's own repeat: the clock paces it
  releaseHeld();
  step(dir);
  held = { id, dir };
  if (typeof window === "undefined") return; // (tests: no clock, no key-up)
  if (!listening) {
    listening = true;
    window.addEventListener("keyup", releaseHeld, true);
    window.addEventListener("blur", releaseHeld);
  }
  const clock = new HoldClock(now);
  const timer = setInterval(() => {
    const t = performance.now();
    if (t - now > 60_000) return releaseHeld(); // a key-up we never heard
    for (let n = clock.due(t); n > 0; n--) step(dir);
  }, 8);
  held.timer = timer;
}
/** the key went up (or the window lost focus): the hold stops */
export function releaseHeld(): void {
  if (held?.timer) clearInterval(held.timer);
  held = null;
}

/**
 * A real slider: ━━━━━━■──────  120%
 * - grab the handle ■ and drag: it follows the pointer (to the pixel);
 * - press anywhere else on the track and hold: it steps toward the pointer 1 by 1,
 *   faster the longer you hold (like a scrollbar) — so the mouse reaches every value;
 * - the wheel steps 1 a notch, ←→ (the caller, with heldStep) 1 by 1, faster when held;
 * - double-click the number to type one (`onEdit`).
 *
 * The slider being changed, if any: where it is on screen (its identity from one
 * frame to the next — sliders are redrawn every frame), the value it shows, and
 * when the setting was last applied. The bar moves at once; the (sometimes costly)
 * setting is applied at most every 40 ms while dragging (every step while held), and always when you let go.
 */
let live: { x: number; y: number; v: number; sentAt: number; sent: number; hold?: { target: number; clock: HoldClock; startX: number }; grab?: number } | null = null;
const APPLY_MS = 40;
/**
 * The wheel on a slider: its last value and the value drawn when it was sent (not redrawn
 * yet: go on from it), and the pixels gathered toward the next step.
 */
let wheel: { x: number; y: number; drawn: number; v: number; acc: number; at: number; sgn: number } | null = null;
/**
 * the pixels a trackpad (or a fast-spun Mac mouse) sends for one step: 10 (0.5.1 had 4 — a
 * two-finger swipe and its momentum ran a slider 20 or 30 steps away; now each step is
 * exactly 1 and a short swipe moves it by a few)
 */
const WHEEL_PX = 10;
/** wheel events closer than this are a trackpad's stream, not separate notches */
const STREAM_MS = 25;
/** One wheel event on the slider at `r`: -1 / 1 = a step up / down, 0 = not yet. */
export function wheelStep(r: Rect, px: number, now = performance.now()): -1 | 0 | 1 {
  if (!px) return 0;
  if (!wheel || wheel.x !== r.x || wheel.y !== r.y) wheel = { x: r.x, y: r.y, drawn: NaN, v: NaN, acc: 0, at: 0, sgn: 0 };
  // a notch (a mouse, even spun fast: 40 ms apart or more) is a step at once; only a
  // trackpad's stream (events ~16 ms apart) gathers its pixels toward the next step
  const lone = now - wheel.at > STREAM_MS || Math.sign(px) !== wheel.sgn;
  wheel.at = now;
  wheel.sgn = Math.sign(px);
  wheel.acc = lone ? px : wheel.acc + px;
  if (!lone && Math.abs(wheel.acc) < WHEEL_PX) return 0;
  const dir = Math.sign(wheel.acc) as -1 | 1;
  wheel.acc = 0;
  return dir;
}

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
  // its glyphs: the theme's [slider] (core/skin/parts.ts), one cell each
  const sl = look(ui.theme, SLIDER);
  if (o.disabled) {
    // greyed: the track and the number, no handle to grab
    ui.text(r.x, r.y, sl.track.repeat(tw), { fg: c.faint });
    ui.textRight(r.x + r.w, r.y, text, { fg: c.subtle });
    ui.hit(track, { onClick: () => {}, tip: o.tip ?? "locked" });
    return;
  }
  const step = o.step ?? 1;
  // held on the track (not on the handle): one step toward the pointer, then more, one at a time
  if (mine && live!.hold) {
    const h = live!.hold;
    // every step applied, one by one (not at the drag's 40 ms pace: the setting would skip values)
    let v = value;
    for (let n = h.clock.due(performance.now()); n > 0 && v !== h.target; n--) {
      v = h.target > v ? Math.min(h.target, v + step) : Math.max(h.target, v - step);
      push(v, true);
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
  ui.text(r.x, r.y, sl.fill.repeat(at0), { fg: on ? c.accent : c.subtle });
  if (at0 + 1 < tw) ui.text(r.x + at0 + 1, r.y, sl.track.repeat(tw - at0 - 1), { fg: c.subtle });
  ui.text(r.x + at0, r.y, sl.knob, { fg: hot ? c.fg : on ? c.accent : c.subtle, attrs: BOLD });
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
      // the handle: a drag starts, the value moving with the pointer from where it is (no jump on the grab)
      if (Math.abs(m.x - (r.x + at0)) <= 1) return push(value, true), void (live!.grab = value - at(m));
      // the track: one step now, more while it's held
      const target = at(m);
      push(target > value ? Math.min(target, value + step) : Math.max(target, value - step), true);
      live!.hold = { target, clock: new HoldClock(performance.now()), startX: m.fx ?? m.x };
    },
    onDrag: (m) => {
      // moving the pointer: the handle follows it (a hold that moves becomes a drag)
      if (live?.hold && Math.abs((m.fx ?? m.x) - live.hold.startX) < 1) return void (live.hold.target = at(m));
      if (live) live.hold = undefined;
      // (the ends of the track are always the min and the max, whatever the grab)
      const a = at(m);
      push(a <= min || a >= max ? a : clamp(a + (live?.grab ?? 0)));
    },
    onUp: () => {
      if (live && live.x === r.x && live.y === r.y && live.v !== live.sent) onSet(live.v);
      live = null;
    },
    // the wheel: one step a notch, never more than one an event (a Windows notch is 100 px:
    // still one step); a trackpad's stream: a step every few pixels — as fast as you swipe.
    // Several notches before the next frame go on from the last one, not from the value drawn.
    onWheel: (d, m) => {
      const dir = wheelStep(r, m.px ?? d * 16);
      if (!dir) return;
      const base = wheel!.drawn === value ? wheel!.v : value; // (wheelStep made it this slider's)
      const v = clamp(base - dir * step);
      wheel = { ...wheel!, drawn: value, v };
      if (v !== base) onSet(v);
    },
    fine: true,
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
