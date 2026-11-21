import { WEEKDAYS } from "../core/dates";
import { pad2 } from "../core/time";

/**
 * ALARMS — wake-up alarms in CLOCKS. The model only: what an alarm is, when it rings
 * next, the days it repeats, and the file it lives in. No imports from the deck, so
 * the tests read it directly. The ringing (sound, screen, notification) is in
 * alarmring.ts; the command is `clock alarm` (clockfaces.ts).
 *
 * They ring only while ICEBREAKER runs: nothing wakes a closed app (no native piece).
 * One missed while the app was closed doesn't ring late when it opens again.
 *
 * Stored in the vault, in .icebreaker/alarms.json — they travel with it.
 */
export interface Alarm {
  id: number;
  /** minutes after midnight */
  time: number;
  label: string;
  /** the weekdays it rings (0 = sunday … 6 = saturday); empty: once, the next time it's that time */
  days: number[];
  on: boolean;
}

export const ALARMS_FILE = ".icebreaker/alarms.json";
/** how long snooze waits, in minutes (`clock snooze 10` for another length) */
export const SNOOZE_MIN = 5;

const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
const SHORT = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

/**
 * "mon-fri", "weekdays", "weekend", "daily", "mon,wed,fri", "lun-ven", "sat" → weekdays
 * (sorted, monday first), or null when it isn't days. A range goes monday → sunday
 * ("fri-mon" = fri, sat, sun, mon).
 */
export function parseDays(raw: string): number[] | null {
  const s = raw.trim().toLowerCase();
  if (!s) return null;
  if (["daily", "everyday", "every-day", "all", "tous", "tlj", "chaque-jour"].includes(s)) return [...DAY_ORDER];
  if (["weekdays", "workdays", "semaine", "ouvrés", "ouvres"].includes(s)) return [1, 2, 3, 4, 5];
  if (["weekend", "week-end", "we"].includes(s)) return [6, 0];
  const out = new Set<number>();
  for (const part of s.split(",")) {
    const [a, b] = part.split("-").map((x) => WEEKDAYS[x.trim()]);
    if (a === undefined || (part.includes("-") && b === undefined)) return null;
    if (b === undefined) out.add(a);
    else {
      // walk monday-first from a to b
      const ia = DAY_ORDER.indexOf(a), ib = DAY_ORDER.indexOf(b);
      for (let i = ia; ; i = (i + 1) % 7) {
        out.add(DAY_ORDER[i]);
        if (i === ib) break;
      }
    }
  }
  return DAY_ORDER.filter((d) => out.has(d));
}

/**
 * The days as words: "once", "every day", "mon–fri", "weekend", "mon, wed, fri".
 * `tr` translates each word (the deck passes t: "lun–ven").
 */
export function daysText(days: number[], tr: (s: string) => string = (s) => s): string {
  const set = DAY_ORDER.filter((d) => days.includes(d));
  if (!set.length) return tr("once");
  if (set.length === 7) return tr("every day");
  if (set.join() === "6,0") return tr("weekend");
  // a run of 3+ days in a row: "mon–fri", "tue–sat"
  const idx = set.map((d) => DAY_ORDER.indexOf(d));
  if (set.length >= 3 && idx.every((v, i) => i === 0 || v === idx[i - 1] + 1)) return `${tr(SHORT[set[0]])}–${tr(SHORT[set[set.length - 1]])}`;
  return set.map((d) => tr(SHORT[d])).join(", ");
}

export const timeText = (min: number): string => `${pad2(Math.floor(min / 60))}:${pad2(min % 60)}`;

/** When it rings next, strictly after `from` (null when it's off). */
export function nextRing(a: Alarm, from = new Date()): Date | null {
  if (!a.on) return null;
  for (let i = 0; i <= 7; i++) {
    const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + i, Math.floor(a.time / 60), a.time % 60, 0, 0);
    if (d.getTime() <= from.getTime()) continue;
    if (!a.days.length || a.days.includes(d.getDay())) return d;
  }
  return null;
}

/** "in 7 h 12 min", "in 3 min", "in 2 days" — how far `at` is from `now`. */
export function inText(at: Date, now = new Date()): string {
  const min = Math.max(0, Math.round((at.getTime() - now.getTime()) / 60000));
  if (min < 60) return `${min} min`;
  if (min < 48 * 60) return `${Math.floor(min / 60)} h${min % 60 ? ` ${pad2(min % 60)}` : ""}`;
  return `${Math.round(min / 1440)} d`;
}

/** The file's text → alarms (what doesn't look like one is dropped). */
export function readAlarms(text: string): Alarm[] {
  try {
    const raw = JSON.parse(text) as { alarms?: unknown[] };
    const list = Array.isArray(raw?.alarms) ? raw.alarms : [];
    const seen = new Set<number>();
    let next = Math.max(0, ...list.map((x) => Number((x as Alarm)?.id) || 0)) + 1;
    return list
      .filter((x): x is Alarm => !!x && typeof (x as Alarm).time === "number" && (x as Alarm).time >= 0 && (x as Alarm).time < 1440)
      .map((x) => {
        // an id each, never twice (a hand-edited file may have none, or the same one)
        const id = Number.isInteger(x.id) && x.id > 0 && !seen.has(x.id) ? x.id : next++;
        seen.add(id);
        return {
          id,
          time: Math.floor(x.time),
          label: typeof x.label === "string" ? x.label : "",
          days: Array.isArray(x.days) ? x.days.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6) : [],
          on: x.on !== false,
        };
      });
  } catch {
    return [];
  }
}

export const writeAlarms = (alarms: Alarm[]): string => JSON.stringify({ alarms }, null, 2) + "\n";

/** sorted the way they're listed: by time of day */
export const byTime = (alarms: Alarm[]): Alarm[] => [...alarms].sort((a, b) => a.time - b.time || a.id - b.id);
