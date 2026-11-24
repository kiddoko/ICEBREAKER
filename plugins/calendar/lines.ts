/**
 * The local calendar's lines (calendar/2026-11.md), read and written — one event per line:
 *
 *   - 2026-11-19 14:30-15:15 Dentist @ Cabinet Dupont ^l12
 *   - 2026-11-24..2026-11-26 Trip ^l13                  (all day, end included)
 *   - 2026-11-19 22:00..2026-11-21 02:00 Night shift ^l14  (timed, over more than a night)
 *
 * A timed event ending the next day before its start time keeps the short form (22:00-02:00
 * is read as the next morning); any longer one names its end day, or it came back shortened.
 * No imports: the module bundles it, and the tests read it as is.
 */

export interface LineEvent {
  /** "l<n>", or "" when the line has no ^id yet */
  id: string;
  cal: "local";
  title: string;
  /** all-day: YYYY-MM-DD (end exclusive) · timed: ISO date-time */
  start: string;
  end: string;
  allDay: boolean;
  where?: string;
}

const TIME = String.raw`(\d{1,2}[:h]\d{2}|\d{1,2}h)`;
const DATE = String.raw`(\d{4}-\d{2}-\d{2})`;
const TAIL = String.raw`(.*?)(?:\s+\^(l\d+))?\s*$`;
const LINE = new RegExp(String.raw`^\s*[-*]\s+${DATE}(?:\.\.${DATE})?\s+(?:${TIME}(?:-${TIME})?\s+)?${TAIL}`);
const LONG = new RegExp(String.raw`^\s*[-*]\s+${DATE}\s+${TIME}\.\.${DATE}\s+${TIME}\s+${TAIL}`);

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const hm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const dayOf = (s: string) => new Date(s.length === 10 ? `${s}T00:00` : s);
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const at = (day: Date, t: string) => {
  const [h, m = 0] = t.split(/[:h]/).map((x) => Number(x || 0));
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m);
};
const titleWhere = (rest: string) => {
  const i = rest.lastIndexOf(" @ ");
  return { title: (i >= 0 ? rest.slice(0, i) : rest).trim() || "(no title)", where: i >= 0 ? rest.slice(i + 3).trim() : undefined };
};

/** The event on this line, or null (a title, a note of yours: kept as it is). */
export function parseEventLine(raw: string): LineEvent | null {
  const long = LONG.exec(raw);
  if (long) {
    const [, d1, t1, d2, t2, rest, id] = long;
    const start = at(dayOf(d1), t1);
    let end = at(dayOf(d2), t2);
    if (end <= start) end = new Date(start.getTime() + 3600_000);
    return { id: id ?? "", cal: "local", ...titleWhere(rest), start: start.toISOString(), end: end.toISOString(), allDay: false };
  }
  const m = LINE.exec(raw);
  if (!m) return null;
  const [, d1, d2, t1, t2, rest, id] = m;
  const day = dayOf(d1);
  if (!t1) return { id: id ?? "", cal: "local", ...titleWhere(rest), start: d1, end: ymd(addDays(dayOf(d2 ?? d1), 1)), allDay: true };
  const start = at(day, t1);
  let end = new Date(start.getTime() + 3600_000);
  if (t2) {
    end = at(day, t2);
    if (end <= start) end = at(addDays(day, 1), t2);
  }
  return { id: id ?? "", cal: "local", ...titleWhere(rest), start: start.toISOString(), end: end.toISOString(), allDay: false };
}

/** The line of this event (what parseEventLine reads back the same). */
export function eventLine(e: { id: string; title: string; start: string; end: string; allDay: boolean; where?: string }): string {
  const s = dayOf(e.start);
  let when: string;
  if (e.allDay) {
    const last = addDays(dayOf(e.end), -1);
    when = ymd(last) > ymd(s) ? `${ymd(s)}..${ymd(last)}` : ymd(s);
  } else {
    const end = dayOf(e.end);
    // the short form says "the same day, or the next morning before the start time"
    const short = ymd(end) === ymd(s) || (ymd(end) === ymd(addDays(s, 1)) && hm(end) < hm(s));
    when = short ? `${ymd(s)} ${hm(s)}-${hm(end)}` : `${ymd(s)} ${hm(s)}..${ymd(end)} ${hm(end)}`;
  }
  return `- ${when} ${e.title}${e.where ? ` @ ${e.where}` : ""} ^${e.id}`;
}

/** Events kept by an older version (plugin-data) that the month files don't already hold. */
export function notYetIn<T extends { title: string; start: string; end: string; allDay: boolean }>(old: T[], have: T[]): T[] {
  const key = (e: T) => `${e.allDay ? "d" : "t"}|${new Date(e.start).getTime()}|${new Date(e.end).getTime()}|${e.title.trim()}`;
  const seen = new Set(have.map(key));
  return old.filter((e) => !seen.has(key(e)) && (seen.add(key(e)), true));
}
