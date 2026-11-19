/**
 * The wheel and trackpad on a ring (NEXUS lockers, MODULES shards): one feel
 * for both.
 *
 * - A mouse notch (or the first event of a swipe) turns exactly one step.
 * - A trackpad sends dozens of tiny events: they add up, a step every few lines,
 *   and the ring follows the fingers in between (the pending fraction is shown).
 * - The ring moves like a critically damped spring: it speeds up smoothly, slows
 *   down little by little, never overshoots and never jumps — press a key ten
 *   times fast and it glides through the ten, faster, instead of teleporting.
 *   Integrated in small fixed steps, so it looks the same at 30, 60 or 120 fps.
 *
 * `pos` is where the ring is drawn; it is never reset (past the last comes the
 * first), compare it with `ring()`.
 */
export class WheelSpin {
  /** where the ring is drawn (eased, unbounded) */
  pos = 0;
  /** the pending part of a step, in (-0.5, 0.5]: the ring leans toward the next one */
  private acc = 0;
  /** how fast the ring turns right now (steps per second) */
  private vel = 0;
  private at = 0;

  constructor(
    /** trackpad lines for one step */
    private readonly linesPerStep = 4,
    /** how fast the ring catches up (per second); lower = a longer glide */
    private readonly rate = 7,
  ) {}

  /** Wheel lines in (positive = down / next), whole steps out. */
  wheel(lines: number): number {
    const now = performance.now();
    const lone = now - this.at > 250;
    this.at = now;
    if (!lines) return 0;
    if (lone || Math.sign(lines) !== Math.sign(this.acc)) this.acc = 0;
    this.acc += lone ? Math.sign(lines) : Math.max(-1, Math.min(1, lines / this.linesPerStep));
    let steps = 0;
    while (this.acc > 0.5) (steps++, (this.acc -= 1));
    while (this.acc <= -0.5) (steps--, (this.acc += 1));
    return steps;
  }

  /** Puts the ring on `sel` at once (a new folder, a fresh page). */
  jump(sel: number): void {
    this.pos = sel;
    this.acc = 0;
    this.vel = 0;
  }

  /**
   * Eases `pos` toward `sel` (plus the pending fraction while the wheel moves).
   * Returns how far is left to go: > 0.001 means keep animating.
   */
  ease(sel: number, n: number, dt: number): number {
    if (n <= 0) return 0;
    const idle = performance.now() - this.at > 140;
    // fingers off: the pending fraction fades, the ring settles on the chosen one
    if (idle) this.acc *= Math.exp(-dt * 14);
    if (Math.abs(this.acc) < 0.002) this.acc = 0;
    // a critically damped spring toward the target, in steps of 1/240 s
    const w = this.rate * 1.7;
    for (let left = Math.min(dt, 0.1); left > 0; left -= 1 / 240) {
      const h = Math.min(left, 1 / 240);
      const gap = ring(sel + this.acc - this.pos, n);
      this.vel += (w * w * gap - 2 * w * this.vel) * h;
      this.pos += this.vel * h;
    }
    const left = Math.abs(ring(sel + this.acc - this.pos, n));
    if (left < 0.001 && Math.abs(this.vel) < 0.02 && !this.acc) {
      this.pos += ring(sel - this.pos, n);
      this.vel = 0;
    }
    return left + Math.abs(this.vel) * 0.01;
  }

}

/** The shortest way round a ring of n: a signed distance in (-n/2, n/2]. */
export function ring(d: number, n: number): number {
  if (n <= 0) return 0;
  const m = ((d % n) + n) % n;
  return m > n / 2 ? m - n : m;
}
