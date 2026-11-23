/**
 * Events from a file — a CSV (Google Calendar's and Outlook's exports, or any sheet with a
 * title and a start) or an .ics (iCalendar: VEVENT) — for `cal import`. Pure: text in, events out.
 *
 *   Subject,Start Date,Start Time,End Date,End Time,All Day Event,Location
 *   Dentist,12/24/2026,09:30,12/24/2026,10:00,False,Lyon
 *
 * Columns are found by name (english or french: title / subject / titre / sujet, start /
 * début, date, time / heure, end / fin, all day / journée, location / lieu…).
 */
export interface ImportedEvent {
  title: string;
  start: Date;
  /** minutes (all day: a multiple of 1440) */
  minutes: number;
  allDay: boolean;
  where?: string;
}

/** one CSV line → its cells (quotes, doubled quotes, commas or semicolons) */
export function csvCells(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"' && line[i + 1] === '"') (cur += '"'), i++;
      else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === sep) out.push(cur.trim()), (cur = "");
    else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

/** "2026-12-24", "24/12/2026", "12/24/2026" (US, when the first number can't be a day), "24.12.2026" */
export function readDate(s: string, usFirst = false): Date | null {
  const t = s.trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(t);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(t);
  if (!m) return null;
  let a = Number(m[1]), b = Number(m[2]);
  const y = Number(m[3]) < 100 ? 2000 + Number(m[3]) : Number(m[3]);
  // day first, unless it's a US file (or the second number can't be a month)
  if ((usFirst && a <= 12) || b > 12) [a, b] = [b, a];
  return a >= 1 && a <= 31 && b >= 1 && b <= 12 ? new Date(y, b - 1, a) : null;
}

/** "09:30", "9:30 AM", "21h15" → minutes, or null */
export function readClock(s: string): number | null {
  const m = /^(\d{1,2})[:h](\d{2})(?::\d{2})?\s*(am|pm)?$/i.exec(s.trim());
  if (!m) return null;
  let h = Number(m[1]);
  if (m[3]?.toLowerCase() === "pm" && h < 12) h += 12;
  if (m[3]?.toLowerCase() === "am" && h === 12) h = 0;
  return h < 24 ? h * 60 + Number(m[2]) : null;
}

const COLS: Record<string, RegExp> = {
  title: /^(subject|title|summary|name|event|titre|sujet|nom|événement|evenement)$/i,
  startDate: /^(start ?date|date|start|begin|date de début|date de debut|début|debut|date début)$/i,
  startTime: /^(start ?time|time|heure|heure de début|heure de debut|heure début)$/i,
  endDate: /^(end ?date|end|date de fin|fin)$/i,
  endTime: /^(end ?time|heure de fin|heure fin)$/i,
  allDay: /^(all ?day( event)?|journée entière|journee entiere|toute la journée)$/i,
  where: /^(location|where|place|lieu|endroit)$/i,
};

/**
 * A CSV's records: lines, except that a line break inside quotes stays in its cell (Outlook
 * writes a description on several lines: each piece was read as an event).
 */
export function csvRecords(text: string): string[] {
  const out: string[] = [];
  let cur = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') q = !q;
    if (!q && (ch === "\n" || ch === "\r")) {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      if (cur.trim()) out.push(cur);
      cur = "";
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out;
}

export function parseCsv(text: string): ImportedEvent[] {
  const lines = csvRecords(text.replace(/^﻿/, ""));
  if (lines.length < 2) return [];
  const sep = (lines[0].match(/;/g)?.length ?? 0) > (lines[0].match(/,/g)?.length ?? 0) ? ";" : ",";
  const head = csvCells(lines[0], sep).map((h) => h.replace(/^"|"$/g, "").trim());
  const col = (k: string) => head.findIndex((h) => COLS[k].test(h));
  const ci = { title: col("title"), startDate: col("startDate"), startTime: col("startTime"), endDate: col("endDate"), endTime: col("endTime"), allDay: col("allDay"), where: col("where") };
  if (ci.title < 0 || ci.startDate < 0) return [];
  const rows = lines.slice(1).map((l) => csvCells(l, sep));
  // a US file: some first number > 12 in the second place means month/day order
  const us = rows.some((r) => /^\d{1,2}\/(1[3-9]|2\d|3[01])\//.test(r[ci.startDate] ?? ""));
  const out: ImportedEvent[] = [];
  for (const r of rows) {
    const title = r[ci.title]?.trim();
    const day = readDate(r[ci.startDate] ?? "", us);
    if (!title || !day) continue;
    const t0 = ci.startTime >= 0 ? readClock(r[ci.startTime] ?? "") : readClock((r[ci.startDate] ?? "").split(/[ T]/)[1] ?? "");
    const allDay = ci.allDay >= 0 ? /^(true|yes|oui|vrai|1)$/i.test(r[ci.allDay] ?? "") || t0 === null : t0 === null;
    const start = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, allDay ? 0 : t0 ?? 0);
    const endDay = ci.endDate >= 0 ? readDate(r[ci.endDate] ?? "", us) : null;
    const t1 = ci.endTime >= 0 ? readClock(r[ci.endTime] ?? "") : null;
    let minutes = allDay ? 1440 : 60;
    if (allDay && endDay) minutes = Math.max(1, Math.round((endDay.getTime() - day.getTime()) / 86_400_000) + 1) * 1440;
    else if (!allDay && t1 !== null) {
      const end = new Date((endDay ?? day).getFullYear(), (endDay ?? day).getMonth(), (endDay ?? day).getDate(), 0, t1);
      minutes = Math.max(5, Math.round((end.getTime() - start.getTime()) / 60_000));
    }
    out.push({ title, start, minutes, allDay, ...(ci.where >= 0 && r[ci.where] ? { where: r[ci.where] } : {}) });
  }
  return out;
}

/** iCalendar: each VEVENT's SUMMARY, DTSTART, DTEND, LOCATION (lines folded with a leading space) */
export function parseIcs(text: string): ImportedEvent[] {
  const lines = text.replace(/\r?\n[ \t]/g, "").split(/\r?\n/);
  const out: ImportedEvent[] = [];
  let ev: Record<string, string> | null = null;
  const when = (v: string): { d: Date; allDay: boolean } | null => {
    const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/.exec(v.trim());
    if (!m) return null;
    if (!m[4]) return { d: new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])), allDay: true };
    const args = [Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6])] as const;
    return { d: m[7] ? new Date(Date.UTC(...args)) : new Date(...args), allDay: false };
  };
  const unescape = (s: string) => s.replace(/\\n/gi, " ").replace(/\\([,;\\])/g, "$1").trim();
  for (const l of lines) {
    if (l === "BEGIN:VEVENT") ev = {};
    else if (l === "END:VEVENT" && ev) {
      const s = when(ev.DTSTART ?? "");
      const e = ev.DTEND ? when(ev.DTEND) : null;
      if (s && ev.SUMMARY) {
        const minutes = e ? Math.max(s.allDay ? 1440 : 5, Math.round((e.d.getTime() - s.d.getTime()) / 60_000)) : s.allDay ? 1440 : 60;
        out.push({ title: unescape(ev.SUMMARY), start: s.d, minutes, allDay: s.allDay, ...(ev.LOCATION ? { where: unescape(ev.LOCATION) } : {}) });
      }
      ev = null;
    } else if (ev) {
      const i = l.indexOf(":");
      if (i > 0) ev[l.slice(0, i).split(";")[0].toUpperCase()] = l.slice(i + 1);
    }
  }
  return out;
}

/** by its name (.ics, else CSV) */
export function parseEventsFile(text: string, name: string): ImportedEvent[] {
  return /\.ics$/i.test(name) || /BEGIN:VCALENDAR/.test(text) ? parseIcs(text) : parseCsv(text);
}
