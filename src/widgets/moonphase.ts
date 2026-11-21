/**
 * THE MOON'S PHASE, computed here (no network): how far the moon is from the sun in the
 * sky (its elongation, from short series for the sun's and the moon's longitudes —
 * Meeus, Astronomical Algorithms, ch. 25 and 47, the main terms), so how much of it is
 * lit, the phase's name, and when the next new / first quarter / full / last quarter
 * come (found by solving for the elongation). Good to well under an hour: the right day
 * for every phase. Pure: the MOON page, its widget, pop-up and command all read it.
 */

/** days from one new moon to the next, on average */
export const SYNODIC = 29.530588853;
const DAY = 86_400_000;
const RAD = Math.PI / 180;
const norm = (deg: number) => ((deg % 360) + 360) % 360;

/** the moon's elongation from the sun (0 new, 90 first quarter, 180 full, 270 last quarter), and its phase angle */
function sky(t: number): { elong: number; phaseAngle: number } {
  const T = (t / DAY + 2440587.5 - 2451545) / 36525;
  // the sun (mean anomaly M, true longitude)
  const M = norm(357.52911 + 35999.05029 * T) * RAD;
  const sunLon = 280.46646 + 36000.76983 * T + (1.914602 - 0.004817 * T) * Math.sin(M) + 0.019993 * Math.sin(2 * M) + 0.000289 * Math.sin(3 * M);
  // the moon (mean longitude L, elongation D, anomaly Mp, argument of latitude F)
  const L = 218.3164477 + 481267.88123421 * T;
  const D = norm(297.8501921 + 445267.1114034 * T) * RAD;
  const Mp = norm(134.9633964 + 477198.8675055 * T) * RAD;
  const F = norm(93.272095 + 483202.0175233 * T) * RAD;
  const moonLon =
    L +
    6.288774 * Math.sin(Mp) + 1.274027 * Math.sin(2 * D - Mp) + 0.658314 * Math.sin(2 * D) + 0.213618 * Math.sin(2 * Mp) -
    0.185116 * Math.sin(M) - 0.114332 * Math.sin(2 * F) + 0.058793 * Math.sin(2 * D - 2 * Mp) + 0.057066 * Math.sin(2 * D - M - Mp) +
    0.053322 * Math.sin(2 * D + Mp) + 0.045758 * Math.sin(2 * D - M) - 0.040923 * Math.sin(M - Mp) - 0.03472 * Math.sin(D) -
    0.030383 * Math.sin(M + Mp) + 0.015327 * Math.sin(2 * D - 2 * F) - 0.012528 * Math.sin(Mp + 2 * F) + 0.01098 * Math.sin(Mp - 2 * F) +
    0.010675 * Math.sin(4 * D - Mp) + 0.010034 * Math.sin(3 * Mp) + 0.008548 * Math.sin(4 * D - 2 * Mp);
  const elong = norm(moonLon - sunLon);
  // the phase angle (sun–moon–earth), for how much is lit (Meeus 48.4: from the MEAN elongation D)
  const phaseAngle = 180 - D / RAD - 6.289 * Math.sin(Mp) + 2.1 * Math.sin(M) - 1.274 * Math.sin(2 * D - Mp) - 0.658 * Math.sin(2 * D) - 0.214 * Math.sin(2 * Mp) - 0.11 * Math.sin(D);
  return { elong, phaseAngle };
}

/** when the elongation is `target` degrees, near time `guess` (Newton steps on ~12.19°/day) */
function solve(target: number, guess: number): number {
  let t = guess;
  for (let k = 0; k < 8; k++) {
    const off = ((target - sky(t).elong + 540) % 360) - 180;
    t += (off / 12.1907) * DAY;
    if (Math.abs(off) < 0.001) break;
  }
  return t;
}

/** where in the cycle: 0 new, 0.25 first quarter, 0.5 full, 0.75 last quarter */
export function moonPhase(t = Date.now()): number {
  return sky(t).elong / 360;
}

/** days since the last new moon, at time `t` (ms) */
export function moonAge(t = Date.now()): number {
  const last = solve(0, t - moonPhase(t) * SYNODIC * DAY);
  const age = (t - last) / DAY;
  return age < 0 ? age + SYNODIC : age;
}

/** the lit part of the disc, 0…1 */
export function moonLit(t = Date.now()): number {
  return (1 + Math.cos(sky(t).phaseAngle * RAD)) / 2;
}

/** growing (new → full) or shrinking (full → new) */
export const waxing = (t = Date.now()) => moonPhase(t) < 0.5;

export const PHASE_NAMES = ["new moon", "waxing crescent", "first quarter", "waxing gibbous", "full moon", "waning gibbous", "last quarter", "waning crescent"] as const;

/** the phase's name: new, full and the quarters on their own day; crescent or gibbous between */
export function phaseName(t = Date.now()): (typeof PHASE_NAMES)[number] {
  const lit = moonLit(t);
  const e = moonPhase(t) * 360;
  if (lit < 0.015) return "new moon";
  if (lit > 0.985) return "full moon";
  if (Math.abs(e - 90) < 6) return "first quarter";
  if (Math.abs(e - 270) < 6) return "last quarter";
  return e < 90 ? "waxing crescent" : e < 180 ? "waxing gibbous" : e < 270 ? "waning gibbous" : "waning crescent";
}

/**
 * A one-cell glyph for the phase (lists too small for a drawn moon). On the deck's dark
 * themes the filled part reads as the lit part: ○ new, ◑ growing (lit on the right), ● full,
 * ◐ shrinking. Full and new only on their own day (not the days around).
 */
export function phaseGlyph(t = Date.now()): string {
  const lit = moonLit(t);
  if (lit > 0.985) return "●";
  if (lit < 0.015) return "○";
  return waxing(t) ? "◑" : "◐";
}

/** The four main phases: where in the cycle, a glyph, a name. */
export const MAIN_PHASES: [number, string, string][] = [[0, "○", "new moon"], [0.25, "◑", "first quarter"], [0.5, "●", "full moon"], [0.75, "◐", "last quarter"]];

/** When the moon next reaches `frac` of its cycle after `from` (ms); not within the next ~5 hours (that one is now). */
export function nextPhase(frac: number, from = Date.now()): Date {
  let days = frac * SYNODIC - moonPhase(from) * SYNODIC;
  while (days <= 0.2) days += SYNODIC;
  let at = solve(frac * 360, from + days * DAY);
  // solving can land on the one just gone (a guess near it): the next one then
  if (at <= from + 0.2 * DAY) at = solve(frac * 360, at + SYNODIC * DAY);
  return new Date(at);
}

/** The next four main phases after `from`, soonest first. */
export function upcoming(from = Date.now()): { glyph: string; name: string; at: Date }[] {
  return MAIN_PHASES.map(([f, glyph, name]) => ({ glyph, name, at: nextPhase(f, from) })).sort((a, b) => a.at.getTime() - b.at.getTime());
}

/** whole days from `from` to `at` (0 = today), counted on the calendar */
export function daysUntil(at: Date, from = new Date()): number {
  const a = new Date(at.getFullYear(), at.getMonth(), at.getDate()).getTime();
  const b = new Date(from.getFullYear(), from.getMonth(), from.getDate()).getTime();
  return Math.round((a - b) / DAY);
}
