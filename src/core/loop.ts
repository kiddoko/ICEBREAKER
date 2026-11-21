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
  /** how soon the frame before this one asked for the next (ms; `debug perf` tells a late frame from a slow animation) */
  wanted = Infinity;
  /** after each frame, with how long it took (the deck's `debug on` watches slow ones) */
  onFrame?: (ms: number) => void;

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
   *
   * Settings → APPEARANCE: with vsync on, maxFps = 0 (one frame per screen
   * refresh, never more). With vsync off, the cap is the user's number; `timed`
   * then paces frames with timers instead of the screen (a cap above the
   * screen's rate draws more frames than it shows: allowed, not useful), and a
   * cap of 0 means `frozen`: animations stop, the deck redraws only on input.
   */
  constructor(
    private readonly render: (now: number) => number,
    public maxFps = 60,
  ) {}

  /** Hidden or minimized: no frames at all (timers and reminders keep running). */
  private paused = false;
  /** Visible but not the window you're using: a low frame cap (animations crawl, input still instant). */
  background = false;
  /** Nobody touched anything for a while: same low cap as the background. */
  idle = false;
  /** fps cap while in the background */
  static readonly BACKGROUND_FPS = 12;
  /** vsync off: frames paced by timers at maxFps, not by the screen */
  timed = false;
  /** fps set to 0: no animations at all, frames only for input */
  frozen = false;
  /** the boot and the login page play even with fps 0 (they'd stay frozen mid-animation, waiting for a key) */
  mustAnimate: () => boolean = () => false;
  /** fps 0 is in force right now (not during the boot or the login page) */
  get still(): boolean {
    return this.frozen && !this.mustAnimate();
  }
  /** reduce motion: animations at 30 fps at most */
  slow = false;

  /** New pacing from the settings (vsync, fps cap, reduce motion): drops what was planned, starts again. */
  configure(o: { maxFps: number; timed: boolean; frozen: boolean; slow: boolean }): void {
    cancelAnimationFrame(this.raf);
    clearTimeout(this.raf);
    this.raf = 0;
    Object.assign(this, o);
    this.request(0);
  }

  setPaused(p: boolean): void {
    if (this.paused === p) return;
    this.paused = p;
    if (p) {
      cancelAnimationFrame(this.raf);
      clearTimeout(this.raf);
      this.raf = 0;
      clearTimeout(this.timer);
      clearTimeout(this.watchdog);
      this.timerAt = Infinity;
    } else this.request(0);
  }

  get isPaused(): boolean {
    return this.paused;
  }

  /** A frame wanted by an animation, not before this time (vsync-aligned, see request). */
  private wantAt = 0;

  /**
   * Ask for a frame now, or after `delayMs`. Multiple requests collapse into one.
   * Animations (anything sooner than ~3 display frames) ride requestAnimationFrame
   * so every frame lands on a vsync — a setTimeout(16) drifts against the display
   * and stutters, worst on 120 Hz screens. Longer waits use a timer (it sleeps).
   */
  request(delayMs = 0): void {
    if (this.paused) return;
    // fps 0: animations ask for frames with a delay; they're dropped (input asks with 0)
    if (delayMs > 1 && this.still) return;
    if (this.slow && delayMs > 1) delayMs = Math.max(delayMs, 1000 / 30);
    // in the background, animations slow down to the background cap
    if ((this.background || this.idle) && delayMs > 1) delayMs = Math.max(delayMs, 1000 / FrameLoop.BACKGROUND_FPS);
    // "16 ms" means "the next frame": at 120 Hz (or your cap) that's sooner — so
    // every animation runs as smoothly as the screen / the cap allows, not at 60
    if (delayMs > 1 && delayMs <= 17) delayMs = 0;
    if (delayMs > 1 && delayMs < 50) {
      const at = performance.now() + delayMs;
      this.wantAt = this.raf ? Math.min(this.wantAt, at) : at;
      delayMs = 0;
    } else if (delayMs <= 1) this.wantAt = 0;
    if (delayMs <= 1 && this.timed) {
      // vsync off: the next frame when the cap allows it, on a timer
      if (!this.raf) {
        const wait = Math.max(0, (this.maxFps > 0 ? 1000 / this.maxFps : 0) - (performance.now() - this.last), this.wantAt ? this.wantAt - performance.now() : 0);
        this.raf = setTimeout(() => this.tick(performance.now()), wait) as unknown as number;
      }
      return;
    }
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

  /** Try again later: on the next screen refresh (vsync), or after `ms` (timer mode). */
  private again(ms: number): number {
    return this.timed ? (setTimeout(() => this.tick(performance.now()), Math.max(0, ms)) as unknown as number) : requestAnimationFrame(this.tick);
  }

  private tick = (now: number): void => {
    this.raf = 0;
    clearTimeout(this.watchdog);
    if (this.paused) return;
    // an animation asked for a bit later: skip this vsync, catch the next one
    if (this.wantAt && now < this.wantAt - 4) {
      this.raf = this.again(this.wantAt - now);
      return;
    }
    this.wantAt = 0;
    const minGap = this.maxFps > 0 ? 1000 / this.maxFps : 0;
    if (now - this.last < minGap - 1.5) {
      this.raf = this.again(minGap - (now - this.last)); // too early for the cap: wait (a vsync, or the timer)
      return;
    }
    this.last = now;

    const t0 = performance.now();
    let next = Infinity;
    try {
      next = this.render(now);
    } catch (err) {
      // A bug in one widget must not freeze the whole deck: log it and keep going.
      console.error("[frame]", err);
      next = 250;
    }
    this.frameMs = performance.now() - t0;
    this.onFrame?.(this.frameMs);

    this.count++;
    if (now - this.windowStart >= 1000) {
      this.fps = Math.round((this.count * 1000) / (now - this.windowStart));
      this.count = 0;
      this.windowStart = now;
    }
    this.wanted = next;
    if (Number.isFinite(next)) this.request(next);
  };
}
