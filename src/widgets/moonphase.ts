/**
 * THE MOON'S PHASE, computed here (no network): its age in the cycle, how much of it
 * is lit, the phase's name, when the next new / first quarter / full / last quarter
 * come. Pure: the MOON page, its widget, pop-up and command all read it.
 *
 * Accurate to a few hours (a mean synodic month from a known new moon), which is all
 * a phase name and a date need.
 */

/** days from one new moon to the next */
export const SYNODIC = 29.530588853;
/** a known new moon: 2000-01-06 18:14 UTC, in days since 1970 */
const NEW_MOON_EPOCH = 10962.76; // (the old code said 10957.76: five days early, every phase was wrong)
const DAY = 86_400_000;

/** days since the last new moon, at time `t` (ms) */
export function moonAge(t = Date.now()): number {
  return (((t / DAY - NEW_MOON_EPOCH) % SYNODIC) + SYNODIC) % SYNODIC;
}

/** where in the cycle: 0 new, 0.25 first quarter, 0.5 full, 0.75 last quarter */
export function moonPhase(t = Date.now()): number {
  return moonAge(t) / SYNODIC;
}

/** the lit part of the disc, 0…1 */
export function moonLit(t = Date.now()): number {
  return (1 - Math.cos(moonPhase(t) * 2 * Math.PI)) / 2;
}

/** growing (new → full) or shrinking (full → new) */
export const waxing = (t = Date.now()) => moonPhase(t) < 0.5;

export const PHASE_NAMES = ["new moon", "waxing crescent", "first quarter", "waxing gibbous", "full moon", "waning gibbous", "last quarter", "waning crescent"] as const;

/** the phase's name (one of eight, each centred on its moment) */
export function phaseName(t = Date.now()): (typeof PHASE_NAMES)[number] {
  return PHASE_NAMES[Math.round(moonPhase(t) * 8) % 8];
}

/**
 * A one-cell glyph for the phase (lists too small for a drawn moon). On the deck's dark
 * themes the filled part reads as the lit part: ○ new, ◑ growing (lit on the right), ● full,
 * ◐ shrinking.
 */
export function phaseGlyph(t = Date.now()): string {
  return ["○", "◑", "◑", "◑", "●", "◐", "◐", "◐"][Math.round(moonPhase(t) * 8) % 8];
}

/** The four main phases: where in the cycle, a glyph, a name. */
export const MAIN_PHASES: [number, string, string][] = [[0, "○", "new moon"], [0.25, "◑", "first quarter"], [0.5, "●", "full moon"], [0.75, "◐", "last quarter"]];

/** When the moon next reaches `frac` of its cycle after `from` (ms); not within the next ~5 hours (that one is now). */
export function nextPhase(frac: number, from = Date.now()): Date {
  let days = frac * SYNODIC - moonAge(from);
  while (days <= 0.2) days += SYNODIC;
  return new Date(from + days * DAY);
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
