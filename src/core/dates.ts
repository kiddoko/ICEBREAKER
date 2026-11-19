/**
 * The one way the deck reads a day and a time — the journal, the calendar,
 * reminders, todo, habits. Modules get it as `ib.lib.dates`.
 *
 *   parseDay("tomorrow") · "demain" · "fri" · "vendredi" · "+3d" · "-1" · "2w"
 *            "week" · "2026-12-01" · "24/12" (the next 24/12 to come) → a Date at local midnight
 *   parseTime("18:00") · "9h" · "9h30" · "7pm" → minutes after midnight
 *   ymd(date) → "2026-11-19"
 */
import { pad2 } from "./time";

export const WEEKDAYS: Record<string, number> = {
  sun: 0, sunday: 0, dim: 0, dimanche: 0, mon: 1, monday: 1, lun: 1, lundi: 1, tue: 2, tuesday: 2, mar: 2, mardi: 2,
  wed: 3, wednesday: 3, mer: 3, mercredi: 3, thu: 4, thursday: 4, jeu: 4, jeudi: 4, fri: 5, friday: 5, ven: 5, vendredi: 5,
  sat: 6, saturday: 6, sam: 6, samedi: 6,
};

export const startOfDay = (d: Date): Date => new Date(d.getFullYear(), d.getMonth(), d.getDate());
export const addDays = (d: Date, n: number): Date => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
/** a day as YYYY-MM-DD (local) */
export const ymd = (d: Date): string => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

/** A day written the way people write it, or null. Local midnight. */
export function parseDay(raw: string, from = new Date()): Date | null {
  const s = raw.trim().toLowerCase();
  const today = startOfDay(from);
  if (["today", "tod", "auj", "aujourd'hui", "aujourdhui", "now", "tonight", "ce-soir"].includes(s)) return today;
  if (["tomorrow", "tmr", "tom", "demain"].includes(s)) return addDays(today, 1);
  if (["yesterday", "hier"].includes(s)) return addDays(today, -1);
  if (["week", "next-week", "semaine"].includes(s)) return addDays(today, 7);
  let m = /^([+-])(\d{1,3})(d|j)?$/.exec(s);
  if (m) return addDays(today, Number(m[2]) * (m[1] === "-" ? -1 : 1));
  m = /^\+?(\d{1,2})(w|s)$/.exec(s);
  if (m) return addDays(today, Number(m[1]) * 7);
  if (s in WEEKDAYS) return addDays(today, (WEEKDAYS[s] - today.getDay() + 7) % 7 || 7);
  m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  m = /^(\d{1,2})[/.](\d{1,2})(?:[/.](\d{2,4}))?$/.exec(s);
  if (m) {
    let y = m[3] ? Number(m[3]) : today.getFullYear();
    if (y < 100) y += 2000;
    const d = new Date(y, Number(m[2]) - 1, Number(m[1]));
    if (!m[3] && d < today) d.setFullYear(y + 1); // "24/12" means the next one to come
    return d;
  }
  return null;
}

/** A time of day ("18:00", "9h", "9h30", "7pm"), as minutes after midnight, or null. */
export function parseTime(raw: string): number | null {
  const m = /^(\d{1,2})(?:[:h](\d{2})?)?\s*(am|pm)?$/i.exec(raw.trim());
  if (!m || (!m[2] && !m[3] && !/[:h]/i.test(raw))) return null;
  let h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  if (m[3]?.toLowerCase() === "pm" && h < 12) h += 12;
  if (m[3]?.toLowerCase() === "am" && h === 12) h = 0;
  return h < 24 && min < 60 ? h * 60 + min : null;
}
export { pad2 } from "./time";
