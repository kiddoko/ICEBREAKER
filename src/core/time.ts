/**
 * How long ago something happened, for lists and widgets.
 *   ago(t)        "now" · "5m" · "3h" · "2d"       (compact: widgets, NEXUS)
 *   ago(t, true)  "1 min" · "5 min" · "3 h" · "2 d" (spelled out: the trash)
 * `at` is a time in ms since the epoch (Date.now(), a file's mtime).
 */
export function ago(at: number, long = false): string {
  const s = (Date.now() - at) / 1000;
  if (long) return s < 3600 ? `${Math.max(1, Math.round(s / 60))} min` : s < 86400 ? `${Math.round(s / 3600)} h` : `${Math.round(s / 86400)} d`;
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

/** 2026-11-19 (local time): the journal's day names */
export function isoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** days in a row up to today (or yesterday, if today isn't there yet) */
export function streakOf(entries: Set<string>): number {
  const d = new Date();
  if (!entries.has(isoDay(d))) d.setDate(d.getDate() - 1);
  let n = 0;
  while (entries.has(isoDay(d))) {
    n++;
    d.setDate(d.getDate() - 1);
  }
  return n;
}

/** 7 → "07" (clocks, timers) */
export const pad2 = (n: number): string => String(n).padStart(2, "0");

/** a duration as "mm:ss" (timers, focus) — rounded up, never negative */
export function mmss(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${pad2(Math.floor(s / 60))}:${pad2(s % 60)}`;
}
