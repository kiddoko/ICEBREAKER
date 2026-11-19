import type { Action } from "./input";

/**
 * Gamepad support via the standard Web Gamepad API (Xbox / PlayStation / Switch Pro
 * pads in "standard" mapping).
 *
 *   A confirm    B back       X on-screen keyboard   Y THE MENU
 *   LB/RB tabs   LT/RT page   Start menu             Select switch pane
 *   hold RB      the action wheel: a stick points, LB turns the page, let go runs it
 *   D-pad / left stick: move      right stick: scroll
 *
 * Polling only runs while a pad is connected.
 */
const BUTTON_ACTIONS: Record<number, Action> = {
  0: "confirm", 1: "back", 2: "osk", 3: "palette",
  4: "tab-prev", 6: "page-up", 7: "page-down",
  8: "focus-next", 9: "menu",
  12: "up", 13: "down", 14: "left", 15: "right",
};

/** RB (button 5): a tap = next tab, held = THE MENU */
const RB = 5, LB = 4, B = 1;
const HOLD_MS = 260;

export type WheelEvent = { type: "open" } | { type: "aim"; angle: number; mag: number } | { type: "page" } | { type: "release" } | { type: "cancel" };

const REPEATABLE = new Set<Action>(["up", "down", "left", "right", "page-up", "page-down", "scroll-up", "scroll-down"]);
const FIRST_REPEAT_MS = 380;
const REPEAT_MS = 75;

export class GamepadInput {
  connected = false;
  name = "";
  private timer: ReturnType<typeof setInterval> | undefined;
  /** action → time it was first pressed / last repeated */
  private held = new Map<Action, { since: number; last: number }>();
  /** THE MENU (hold RB): open, the stick aims, let go */
  onWheel?: (e: WheelEvent) => void;
  private rbSince = 0;
  private wheelOpen = false;
  private lbWas = false;
  private bWas = false;

  constructor(private readonly emit: (a: Action) => void) {
    window.addEventListener("gamepadconnected", (e) => {
      this.name = e.gamepad.id;
      this.connected = true;
      this.start();
    });
    window.addEventListener("gamepaddisconnected", () => {
      this.connected = navigator.getGamepads().some((p) => p);
      if (!this.connected) this.stop();
    });
  }

  /** Polling only while the deck is visible and focused (a connected pad otherwise costs a wake-up every 16 ms). */
  private active = true;
  setActive(on: boolean): void {
    this.active = on;
    if (!on) this.stop(false);
    else if (this.connected) this.start();
  }

  private start(): void {
    if (!this.timer && this.active) this.timer = setInterval(() => this.poll(), 16);
  }

  private stop(clear = true): void {
    clearInterval(this.timer);
    this.timer = undefined;
    if (clear) this.held.clear();
  }

  private poll(): void {
    const pressed = new Set<Action>();
    const now0 = performance.now();
    let rb = false, lb = false, b = false;
    let stick = { x: 0, y: 0 };
    for (const pad of navigator.getGamepads()) {
      if (!pad) continue;
      const btn = (i: number) => !!pad.buttons[i] && (pad.buttons[i].pressed || pad.buttons[i].value > 0.5);
      rb ||= btn(RB);
      lb ||= btn(LB);
      b ||= btn(B);
      const [lx = 0, ly = 0, rx = 0, ry = 0] = pad.axes;
      // whichever stick is pushed further aims in the menu
      if (Math.hypot(rx, ry) > Math.hypot(stick.x, stick.y)) stick = { x: rx, y: ry };
      if (Math.hypot(lx, ly) > Math.hypot(stick.x, stick.y)) stick = { x: lx, y: ly };
    }
    // ── RB: tap = next tab, hold = THE MENU ──
    if (rb && !this.rbSince) this.rbSince = now0;
    if (rb && !this.wheelOpen && now0 - this.rbSince > HOLD_MS && this.onWheel) {
      this.wheelOpen = true;
      this.onWheel({ type: "open" });
    }
    if (this.wheelOpen) {
      if (lb && !this.lbWas) this.onWheel?.({ type: "page" });
      if (b && !this.bWas) {
        this.wheelOpen = false;
        this.onWheel?.({ type: "cancel" });
      } else if (!rb) {
        this.wheelOpen = false;
        this.onWheel?.({ type: "release" });
      } else this.onWheel?.({ type: "aim", angle: Math.atan2(stick.x, -stick.y), mag: Math.hypot(stick.x, stick.y) });
      this.lbWas = lb;
      this.bWas = b;
      if (!rb) this.rbSince = 0;
      this.held.clear();
      return; // the menu takes the pad while RB is held
    }
    if (!rb && this.rbSince) {
      if (now0 - this.rbSince <= HOLD_MS || !this.onWheel) this.emit("tab-next");
      this.rbSince = 0;
    }
    this.lbWas = lb;
    this.bWas = b;
    for (const pad of navigator.getGamepads()) {
      if (!pad) continue;
      pad.buttons.forEach((b, i) => {
        const a = BUTTON_ACTIONS[i];
        if (a && (b.pressed || b.value > 0.5)) pressed.add(a);
      });
      const [lx = 0, ly = 0, , ry = 0] = pad.axes;
      if (ly < -0.5) pressed.add("up");
      if (ly > 0.5) pressed.add("down");
      if (lx < -0.5) pressed.add("left");
      if (lx > 0.5) pressed.add("right");
      if (ry < -0.5) pressed.add("scroll-up");
      if (ry > 0.5) pressed.add("scroll-down");
    }

    const now = performance.now();
    for (const a of pressed) {
      const h = this.held.get(a);
      if (!h) {
        this.held.set(a, { since: now, last: now });
        this.emit(a);
      } else if (REPEATABLE.has(a) && now - h.since > FIRST_REPEAT_MS && now - h.last > REPEAT_MS) {
        h.last = now;
        this.emit(a);
      }
    }
    for (const a of [...this.held.keys()]) if (!pressed.has(a)) this.held.delete(a);
  }
}
