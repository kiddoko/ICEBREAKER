import type { UI } from "./ui";

/**
 * Scrolling with a bit of physics, the same in every list and page: the wheel
 * (or the trackpad) moves the view at once and gives it some speed, so it keeps
 * going a little after you stop and slows down smoothly — and it stops dead at
 * the top and at the bottom (no wrapping round, no running past the ends).
 *
 *   private glide = new Glide();
 *   ui.hit(area, { onWheel: (d) => this.glide.push(d) });
 *   this.scroll = this.glide.follow(ui, this.scroll, maxScroll);   // every frame
 *
 * `follow` adopts the value the app sets itself (a selection kept in view, End…)
 * whenever the glide is at rest, so keys and the wheel never fight.
 */
export class Glide {
  private pos = 0;
  private vel = 0;
  private at = 0;
  private moving = false;
  /** what follow() returned last: a different value means the app moved it itself */
  private shown = 0;

  constructor(
    /** how much speed a push gives (0 = no glide at all) */
    private readonly kick = 0.35,
    /** how much speed is kept per 16 ms (lower stops sooner) */
    private readonly keep = 0.84,
  ) {}

  /** The wheel: `lines` to move (+ = down / further). */
  push(lines: number): void {
    if (!this.moving) this.pos = this.shown;
    this.pos += lines;
    // a new push in the other direction cancels the glide (it should feel held, not slippery)
    if (Math.sign(lines) !== Math.sign(this.vel)) this.vel = 0;
    this.vel += lines * this.kick;
    this.moving = true;
    this.at = performance.now();
  }

  /** Stop where it is (a click, a key that jumps). */
  stop(): void {
    this.vel = 0;
    this.moving = false;
  }

  /** This frame's scroll, between 0 and max; asks for frames while it glides. */
  follow(ui: UI, current: number, max: number): number {
    const top = Math.max(0, max);
    // at rest, or the app moved the view itself (a key, a jump): that wins
    if (!this.moving || current !== this.shown) {
      this.moving = false;
      this.vel = 0;
      this.pos = Math.max(0, Math.min(top, current));
      return (this.shown = this.pos);
    }
    const now = performance.now();
    const steps = Math.min(4, Math.max(0, (now - this.at) / 16));
    this.at = now;
    this.pos += this.vel * steps;
    this.vel *= Math.pow(this.keep, steps);
    if (this.pos <= 0 || this.pos >= top) {
      // an end: stop dead there
      this.pos = Math.max(0, Math.min(top, this.pos));
      this.vel = 0;
    }
    if (Math.abs(this.vel) < 0.02) {
      this.moving = false;
      this.pos = Math.round(this.pos);
    } else ui.animate(16);
    return (this.shown = Math.round(this.pos));
  }
}
