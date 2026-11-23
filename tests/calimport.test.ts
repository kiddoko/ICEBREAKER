import { describe, expect, it } from "vitest";
import { parseCsv, parseEventsFile, parseIcs, readDate } from "../plugins/calendar/importer";

describe("CALENDAR imports events from a file", () => {
  it("Google Calendar's CSV (US dates)", () => {
    const ev = parseCsv("Subject,Start Date,Start Time,End Date,End Time,All Day Event,Location\nDentist,12/24/2026,09:30 AM,12/24/2026,10:15 AM,False,Lyon\nHolidays,12/26/2026,,12/28/2026,,True,");
    expect(ev).toHaveLength(2);
    expect(ev[0]).toMatchObject({ title: "Dentist", allDay: false, minutes: 45, where: "Lyon" });
    expect(ev[0].start.getTime()).toBe(new Date(2026, 11, 24, 9, 30).getTime());
    expect(ev[1]).toMatchObject({ title: "Holidays", allDay: true, minutes: 3 * 1440 });
  });
  it("a French sheet, semicolons, day first", () => {
    const ev = parseCsv("Titre;Date;Heure;Lieu\n\"Réunion, équipe\";03/12/2026;14h00;Paris");
    expect(ev[0].title).toBe("Réunion, équipe");
    expect(ev[0].start.getTime()).toBe(new Date(2026, 11, 3, 14, 0).getTime());
    expect(ev[0].where).toBe("Paris");
  });
  it("no title or no date column: nothing", () => {
    expect(parseCsv("a,b\n1,2")).toEqual([]);
  });
  it("iCalendar", () => {
    const ev = parseIcs("BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nSUMMARY:Call\\, mom\r\nDTSTART:20261224T090000\r\nDTEND:20261224T093000\r\nLOCATION:home\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nSUMMARY:Xmas\r\nDTSTART;VALUE=DATE:20261225\r\nEND:VEVENT\r\nEND:VCALENDAR");
    expect(ev).toHaveLength(2);
    expect(ev[0]).toMatchObject({ title: "Call, mom", minutes: 30, allDay: false, where: "home" });
    expect(ev[1]).toMatchObject({ title: "Xmas", allDay: true });
    expect(parseEventsFile("BEGIN:VCALENDAR\nEND:VCALENDAR", "x.txt")).toEqual([]);
  });
  it("dates written every way", () => {
    expect(readDate("2026-12-24")?.getDate()).toBe(24);
    expect(readDate("24.12.2026")?.getMonth()).toBe(11);
    expect(readDate("12/24/2026")?.getDate()).toBe(24); // the 24 can't be a month
  });
});
