import type { UI } from "./ui";

/**
 * Text that types itself out, RPG-on-a-Game-Boy style, with a little blip as it
 * goes (the "blip" sound of the theme's pack). Used where the deck talks to you:
 * the guided tour, notifications, dialogs, the setup's questions, UPLINK's lines.
 *
 *   const n = typed(ui, "tour", text);      // how many characters to show now
 *   ui.text(x, y, text.slice(0, n));
 *
 * Settings → SOUND / APPEARANCE: `appearance.textSpeed` 0-100 (100 = at once, one
 * blip), `sound.mix.text` the blips' volume. At high speeds not every letter
 * blips: the blips stay under ~14 a second.
 */

export interface TypewriterHost {
  /** 0-100: 100 = instant */
  speed(): number;
  blip(): void;
}

let host: TypewriterHost | null = null;
/** The deck plugs in its settings and sound (deck.ts). */
export function setTypewriterHost(h: TypewriterHost): void {
  host = h;
}

interface Run {
  /** the text it types (typedF), to tell a new text from the same one growing */
  text: string;
  /** how many characters there are to show */
  total: number;
  /** shown when this stretch of typing started, and when */
  base: number;
  start: number;
  blips: number;
  done: boolean;
}
const runs = new Map<string, Run>();

/** Never more than this behind what's there (long answers, big command output): it speeds up. */
const MAX_LAG_S = 1;

/**
 * Characters per second for a speed 0-99: an exponential curve, so each step feels
 * the same — 0 ≈ 15 (a slow RPG), 50 ≈ 60 (the default: easy to follow, still quick),
 * 99 ≈ 240 (a flash). 100 = at once (no typing at all).
 */
export function charsPerSecond(speed: number): number {
  const s = Math.max(0, Math.min(99, speed));
  return 15 * Math.pow(16, s / 99);
}

/** At this speed, one blip every how many characters: about 12 blips a second at most. */
export function blipEvery(cps: number): number {
  return Math.max(1, Math.ceil(cps / 12));
}

/**
 * How much of `text` shows now, for the text known as `id`. A new text under the
 * same id starts over; the same text grown longer (an AI answer streaming in)
 * carries on from where it was. Asks for the next frames while it types.
 */
export function typed(ui: UI, id: string, text: string): number {
  return Math.floor(typedF(ui, id, text));
}

/**
 * The same, with the fraction of the character being typed now (3.4 = three
 * shown, the fourth 40 % in): draw that one fading in, and the text glides
 * instead of jumping a letter at a time.
 */
export function typedF(ui: UI, id: string, text: string): number {
  const run = runs.get(id);
  const grows = !!run && text.startsWith(run.text);
  return progress(ui, id, [...text].length, !grows, text);
}

/**
 * The same for a count of characters that only grows (the shell's output): how
 * many of the `total` show now. `id` names the stream.
 */
export function revealed(ui: UI, id: string, total: number): number {
  return Math.floor(progress(ui, id, total, false, ""));
}

function progress(ui: UI, id: string, total: number, reset: boolean, text: string): number {
  const now = ui.now;
  let run = runs.get(id);
  if (!run || reset || total < run.total) {
    // a new text — or a stream seen for the first time: what's already there just shows
    const already = !run && !reset && !text ? total : 0;
    run = { text, total, base: already, start: now, blips: -1, done: already >= total };
    runs.set(id, run);
    if (runs.size > 512) runs.delete(runs.keys().next().value!);
  } else if (total > run.total) {
    // it grew: keep typing from where it is
    if (run.done) {
      run.base = run.total;
      run.start = now;
      run.done = false;
    }
    run.total = total;
    run.text = text;
  }
  const speed = host?.speed() ?? 100;
  if (run.done || speed >= 100) {
    if (!run.done) {
      run.done = true;
      host?.blip(); // instant: one blip
    }
    return run.total;
  }
  const cps = charsPerSecond(speed);
  let f = run.base + ((now - run.start) / 1000) * cps;
  // too far behind: catch up, so it's never more than a second late
  if (run.total - f > cps * MAX_LAG_S) {
    run.base += run.total - f - cps * MAX_LAG_S;
    f = run.total - cps * MAX_LAG_S;
  }
  f = Math.min(run.total, f);
  const every = blipEvery(cps);
  const due = Math.floor(f / every);
  // a blip for each step reached (only the newest if a frame skipped several)
  if (due > run.blips) {
    run.blips = due;
    host?.blip();
  }
  if (f >= run.total) run.done = true;
  else ui.animate(0); // every frame the screen gives (smooth at 120 Hz too)
  return f;
}

/** Show the rest at once (a key or a click while it types). True if it was still typing. */
export function finish(id: string): boolean {
  const run = runs.get(id);
  if (!run || run.done) return false;
  run.done = true;
  return true;
}

/** Still typing? */
export function typing(id: string): boolean {
  const run = runs.get(id);
  return !!run && !run.done;
}
