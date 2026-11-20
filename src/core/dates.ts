/**
 * The one way the deck reads a day and a time — the journal, the calendar,
 * reminders, todo, habits. Modules get it as `ib.lib.dates`.
 *
 *   parseDay("tomorrow") · "demain" · "fri" · "vendredi" · "+3d" · "-1" · "2w"
 *            "week" · "2026-12-01" · "24/12" (the next 24/12 to come) → a Date at local midnight
 *   parseTime("18:00") · "9h" · "9h30" · "7pm" · "midi" → minutes after midnight
 *   parseDuration("+1h") · "30min" · "1h30" · "2 hours" → minutes
 *   parseWhen("demain 9h") · "+1h" · "1h" · "19:00" · "fri 6pm" · "24/12 9:00"
 *            · "dans 1h" · "à 19h" · "tomorrow at 9am" → the moment (a Date), or null
 *   readWhen(words) → { day, time, inMinutes, rest } (rest: the words that say no time, a title)
 *   ymd(date) → "2026-11-19"
 *
 * "1h"… "6h" on their own mean "in that long" (nobody sets a reminder for 3 a.m. by
 * writing "3h"); with a day ("demain 6h"), or from 7h on, they're a time of day.
 * "+1h" is always a length of time, "01:00" always a time of day.
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
  if (["après-demain", "apres-demain", "overmorrow"].includes(s)) return addDays(today, 2);
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

/** A time of day ("18:00", "9h", "9h30", "7pm", "noon", "midi"), as minutes after midnight, or null. */
export function parseTime(raw: string): number | null {
  const s = raw.trim().toLowerCase();
  if (s === "noon" || s === "midi") return 12 * 60;
  if (s === "midnight" || s === "minuit") return 0;
  const m = /^(\d{1,2})(?:[:h](\d{2})?)?\s*(am|pm)?$/.exec(s);
  if (!m || (!m[2] && !m[3] && !/[:h]/.test(s))) return null;
  let h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  if (m[3] && (h < 1 || h > 12)) return null; // "13pm"
  if (m[3] === "pm" && h < 12) h += 12;
  if (m[3] === "am" && h === 12) h = 0;
  return h < 24 && min < 60 ? h * 60 + min : null;
}

const HOURS = /^(\+)?(\d{1,3})(h|hr|hrs|hour|hours|heure|heures)(\d{1,2})?(m|mn|min|mins|minute|minutes)?$/;
const MINUTES = /^\+?(\d{1,4})(m|mn|min|mins|minute|minutes)$/;

/** "+1h", "1h30min", "2hours", "30min" → minutes. A plain "1h" only when `bare` (after "in", "dans"). */
function durationOf(s: string, bare: boolean): number | null {
  const h = HOURS.exec(s);
  if (h) {
    // "1h" alone could be 01:00: a length only with "+", "in", a unit word or minutes after it
    if (!h[1] && !bare && h[3] === "h" && !h[5]) return null;
    const min = Number(h[4] ?? 0);
    return min < 60 ? Number(h[2]) * 60 + min : null;
  }
  const m = MINUTES.exec(s);
  return m ? Number(m[1]) : null;
}

/**
 * A length of time ("+1h", "1h", "30min", "1h30", "2 hours", "45m") as minutes, or
 * null. Here "1h" is a length: use it where a length is asked (an event, a timer).
 */
export function parseDuration(raw: string): number | null {
  return durationOf(raw.trim().toLowerCase().replace(/\s+/g, ""), true);
}

/** "3j", "2days", "1w" after "in" / "dans" → days */
function daysOf(s: string): number | null {
  const m = /^\+?(\d{1,3})(j|jour|jours|d|day|days|w|week|weeks|semaine|semaines)$/.exec(s);
  if (!m) return null;
  return Number(m[1]) * (/^(w|week|weeks|semaine|semaines)$/.test(m[2]) ? 7 : 1);
}

/** Words that only lead into a time or a day: "à 19h", "at 7pm", "le 24/12", "on fri". */
const LEADS = new Set(["à", "a", "at", "@", "le", "on", "vers", "around", "by"]);
/** "in 1h", "dans 3 jours" */
const IN = new Set(["in", "dans"]);
/** "next friday", "lundi prochain" (the next one is what a weekday already means) */
const NEXT = new Set(["next", "prochain", "prochaine"]);
/** a unit written apart from its number: "2 h", "30 min", "6 pm", "3 jours" */
const UNIT = /^(h|hr|hrs|hours?|heures?|mn|min|mins|minutes?|am|pm|j|jours?|days?|weeks?|semaines?)$/;
const EVENING = new Set(["tonight", "ce-soir"]);

export interface When {
  /** the day that was named (local midnight) */
  day: Date | null;
  /** the time of day that was named, in minutes after midnight */
  time: number | null;
  /** "in 1h", "+30min", "1h": minutes from now */
  inMinutes: number | null;
  /** "tonight" / "ce soir" was said: with no time, 20:00 */
  evening: boolean;
  /** today's weekday was named ("ven 18h" on a friday): today if that time is still to come, else next week */
  todayToo?: boolean;
  /** the words that say no time (a reminder's title…), as written */
  rest: string[];
}

/**
 * Words → what they say about when, and the rest. "call mom fri 18:00" →
 * { day: friday, time: 18:00, rest: ["call", "mom"] }. French and English.
 * A text is cut into words; a list (shell arguments) is taken word by word, so a
 * quoted title with a space in it ("lunch with Sam") is never read as a day.
 */
export function readWhen(input: string | string[], from = new Date()): When {
  // a list is shell words: a quoted one ("coffee with Sam") stays whole, never read as a time
  const raw = (typeof input === "string" ? input.split(/\s+/) : input.map((w) => w.trim())).filter(Boolean);
  // glue what people write in two words: "2 h", "6 pm", "ce soir", "après demain"
  const toks: string[] = [];
  for (let i = 0; i < raw.length; i++) {
    const w = raw[i], lw = w.toLowerCase(), next = raw[i + 1]?.toLowerCase() ?? "";
    if (/^\+?\d{1,4}([:h]\d{2})?$/.test(lw) && UNIT.test(next)) toks.push(w + raw[++i]);
    else if ((lw === "ce" && next === "soir") || ((lw === "après" || lw === "apres") && next === "demain")) toks.push(`${w}-${raw[++i]}`);
    else toks.push(w);
  }
  const low = toks.map((w) => w.toLowerCase());
  const out: When = { day: null, time: null, inMinutes: null, evening: false, rest: [] };
  const isWhen = (s: string | undefined) =>
    !!s && (durationOf(s, false) !== null || parseTime(s) !== null || parseDay(s, from) !== null || IN.has(s) || NEXT.has(s));
  let ambiguous = false; // the time was a plain "1h"…"6h": maybe a length
  let next = false; // "next thursday" on a thursday: next week, never today
  for (let i = 0; i < toks.length; i++) {
    const s = low[i];
    if (IN.has(s) && i + 1 < toks.length) {
      const d = durationOf(low[i + 1], true);
      const days = daysOf(low[i + 1]);
      if (d !== null && out.inMinutes === null) {
        out.inMinutes = d;
        i++;
        continue;
      }
      if (days !== null && !out.day) {
        out.day = addDays(startOfDay(from), days);
        i++;
        continue;
      }
    }
    if (LEADS.has(s) && isWhen(low[i + 1])) continue;
    if (NEXT.has(s) && ((low[i + 1] ?? "") in WEEKDAYS || (low[i - 1] ?? "") in WEEKDAYS)) {
      next = true;
      continue;
    }
    const d = durationOf(s, false);
    if (d !== null && out.inMinutes === null) {
      out.inMinutes = d;
      continue;
    }
    const tm = out.time === null ? parseTime(s) : null;
    if (tm !== null) {
      out.time = tm;
      ambiguous = /^0?[1-6]h(\d{2})?$/.test(s);
      continue;
    }
    const day = out.day ? null : parseDay(s, from);
    if (day) {
      out.day = day;
      out.evening = EVENING.has(s);
      out.todayToo = s in WEEKDAYS && WEEKDAYS[s] === from.getDay();
      continue;
    }
    out.rest.push(toks[i]);
  }
  if (next) out.todayToo = false;
  // "1h" alone: in an hour (with a day, "demain 3h" is 3 a.m.)
  if (ambiguous && !out.day && out.inMinutes === null && out.time !== null) {
    out.inMinutes = out.time;
    out.time = null;
  }
  return out;
}

/**
 * When → the moment. A day without a time: `defaultTime` (9:00; "tonight": 20:00).
 * A time without a day: today, or tomorrow if it's already past. Nothing said: null.
 */
export function resolveWhen(w: When, from = new Date(), defaultTime = 9 * 60): Date | null {
  if (w.inMinutes !== null) return new Date(from.getTime() + w.inMinutes * 60_000);
  if (!w.day && w.time === null) return null;
  const d = w.day ?? startOfDay(from);
  const tm = w.time ?? (w.evening ? 20 * 60 : defaultTime);
  const at = (plus: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + plus, Math.floor(tm / 60), tm % 60);
  if (w.todayToo && at(-7).getTime() > from.getTime()) return at(-7); // "ven 18h" on a friday morning: tonight
  return !w.day && at(0).getTime() <= from.getTime() ? at(1) : at(0);
}

/**
 * A text that only says when — "demain 9h", "+1h", "1h", "19:00", "fri 6pm",
 * "24/12 9:00", "dans 30 min", "à 19h" — as a moment. null when it's empty, or
 * when a word in it isn't a time (it would be lost silently otherwise).
 */
export function parseWhen(text: string, from = new Date(), defaultTime = 9 * 60): Date | null {
  const w = readWhen(text, from);
  return w.rest.length ? null : resolveWhen(w, from, defaultTime);
}
export { pad2 } from "./time";
