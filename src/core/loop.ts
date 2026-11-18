/**
 * Frame scheduler — renders only when something asks for it.
 *
 * A terminal UI is idle 99% of the time. Instead of burning 60fps forever we
 * render on input, and widgets that animate say *when* they need the next
 * frame (a blinking cursor: in 500ms; a streaming AI reply: now; an ambient
 * effect: in 80ms). Laptop batteries say thanks.
 */
export class FrameLoop {
  /** Frames actually rendered during the last second. */
  fps = 0;
  /** Time spent building + painting the last frame, in ms. */
  frameMs = 0;

  private raf = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private watchdog: ReturnType<typeof setTimeout> | undefined;
  private timerAt = Infinity;
  private last = 0;
  private count = 0;
  private windowStart = performance.now();

  /**
   * @param render draws one frame and returns how many ms until it wants the
   *               next one (Infinity = nothing to animate).
   * @param maxFps frame cap (0 = uncapped, follows the display refresh rate).
   */
  constructor(
    private readonly render: (now: number) => number,
    public maxFps = 60,
  ) {}

  /** A frame wanted by an animation, not before this time (vsync-aligned, see request). */
  private wantAt = 0;

  /**
   * Ask for a frame now, or after `delayMs`. Multiple requests collapse into one.
   * Animations (anything sooner than ~3 display frames) ride requestAnimationFrame
   * so every frame lands on a vsync — a setTimeout(16) drifts against the display
   * and stutters, worst on 120 Hz screens. Longer waits use a timer (it sleeps).
   */
  request(delayMs = 0): void {
    if (delayMs > 1 && delayMs < 50) {
      const at = performance.now() + delayMs;
      this.wantAt = this.raf ? Math.min(this.wantAt, at) : at;
      delayMs = 0;
    } else if (delayMs <= 1) this.wantAt = 0;
    if (delayMs <= 1) {
      if (!this.raf) {
        this.raf = requestAnimationFrame(this.tick);
        // Some webviews throttle requestAnimationFrame when the window isn't
        // focused/composited. Make sure a visible deck never freezes.
        clearTimeout(this.watchdog);
        this.watchdog = setTimeout(() => {
          if (this.raf && !document.hidden) {
            cancelAnimationFrame(this.raf);
            this.tick(performance.now());
          }
        }, 120);
      }
      return;
    }
    const at = performance.now() + delayMs;
    if (at >= this.timerAt) return; // an earlier wake-up is already planned
    clearTimeout(this.timer);
    this.timerAt = at;
    this.timer = setTimeout(() => {
      this.timerAt = Infinity;
      this.request(0);
    }, delayMs);
  }

  private tick = (now: number): void => {
    this.raf = 0;
    clearTimeout(this.watchdog);
    // an animation asked for a bit later: skip this vsync, catch the next one
    if (this.wantAt && now < this.wantAt - 4) {
      this.raf = requestAnimationFrame(this.tick);
      return;
    }
    this.wantAt = 0;
    const minGap = this.maxFps > 0 ? 1000 / this.maxFps : 0;
    if (now - this.last < minGap - 1.5) {
      this.raf = requestAnimationFrame(this.tick); // too early for the cap: wait a vsync
      return;
    }
    this.last = now;

    const t0 = performance.now();
    let next: number;
    try {
      next = this.render(now);
    } catch (err) {
      // A bug in one widget must not freeze the whole deck: log it and keep going.
      console.error("[frame]", err);
      next = 250;
    }
    this.frameMs = performance.now() - t0;

    this.count++;
    if (now - this.windowStart >= 1000) {
      this.fps = Math.round((this.count * 1000) / (now - this.windowStart));
      this.count = 0;
      this.windowStart = now;
    }
    if (Number.isFinite(next)) this.request(next);
  };
}
