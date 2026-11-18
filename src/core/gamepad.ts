import type { Action } from "./input";

/**
 * Gamepad support via the standard Web Gamepad API (Xbox / PlayStation / Switch Pro
 * pads in "standard" mapping).
 *
 *   A confirm    B back       X on-screen keyboard   Y command palette
 *   LB/RB tabs   LT/RT page   Start menu             Select switch pane
 *   D-pad / left stick: move      right stick: scroll
 *
 * Polling only runs while a pad is connected.
 */
const BUTTON_ACTIONS: Record<number, Action> = {
  0: "confirm", 1: "back", 2: "osk", 3: "palette",
  4: "tab-prev", 5: "tab-next", 6: "page-up", 7: "page-down",
  8: "focus-next", 9: "menu",
  12: "up", 13: "down", 14: "left", 15: "right",
};

const REPEATABLE = new Set<Action>(["up", "down", "left", "right", "page-up", "page-down", "scroll-up", "scroll-down"]);
const FIRST_REPEAT_MS = 380;
const REPEAT_MS = 75;

export class GamepadInput {
  connected = false;
  name = "";
  private timer: ReturnType<typeof setInterval> | undefined;
  /** action → time it was first pressed / last repeated */
  private held = new Map<Action, { since: number; last: number }>();

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
