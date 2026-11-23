import { describe, expect, it } from "vitest";
import { dayLong, dayShort, parseDay, parseDuration, parseTime, parseWhen, readWhen, weekdayShort, ymd } from "../src/core/dates";

const from = new Date(2026, 10, 19, 15, 0); // Thursday 19 Nov 2026, 15:00
const day = (s: string) => {
  const d = parseDay(s, from);
  return d ? ymd(d) : null;
};
/** "2026-11-19 16:00", or null */
const when = (s: string) => {
  const d = parseWhen(s, from);
  return d ? `${ymd(d)} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}` : null;
};

describe("the one date reader", () => {
  it("reads days in English and French", () => {
    expect(day("today")).toBe("2026-11-19");
    expect(day("demain")).toBe("2026-11-20");
    expect(day("après-demain")).toBe("2026-11-21");
    expect(day("hier")).toBe("2026-11-18");
    expect(day("fri")).toBe("2026-11-20");
    expect(day("jeudi")).toBe("2026-11-26"); // today's weekday = next week
    expect(day("+3d")).toBe("2026-11-22");
    expect(day("-1")).toBe("2026-11-18");
    expect(day("2w")).toBe("2026-12-03");
    expect(day("2026-12-01")).toBe("2026-12-01");
    expect(day("24/12")).toBe("2026-12-24");
    expect(day("1/1")).toBe("2027-01-01");
    expect(day("banana")).toBeNull();
  });
  it("reads times", () => {
    expect(parseTime("18:00")).toBe(18 * 60);
    expect(parseTime("9h")).toBe(9 * 60);
    expect(parseTime("9h30")).toBe(9 * 60 + 30);
    expect(parseTime("19h00")).toBe(19 * 60);
    expect(parseTime("7pm")).toBe(19 * 60);
    expect(parseTime("7 pm")).toBe(19 * 60);
    expect(parseTime("12am")).toBe(0);
    expect(parseTime("midi")).toBe(12 * 60);
    expect(parseTime("noon")).toBe(12 * 60);
    expect(parseTime("25:00")).toBeNull();
    expect(parseTime("13pm")).toBeNull();
    expect(parseTime("42")).toBeNull();
  });
  it("reads lengths of time", () => {
    expect(parseDuration("+1h")).toBe(60);
    expect(parseDuration("1h")).toBe(60);
    expect(parseDuration("30min")).toBe(30);
    expect(parseDuration("45m")).toBe(45);
    expect(parseDuration("1h30")).toBe(90);
    expect(parseDuration("1h30min")).toBe(90);
    expect(parseDuration("2 hours")).toBe(120);
    expect(parseDuration("2 heures")).toBe(120);
    expect(parseDuration("soon")).toBeNull();
  });
});

describe("when — reminders, todo --due, cal add (English and French)", () => {
  it("in a while", () => {
    expect(when("+1h")).toBe("2026-11-19 16:00");
    expect(when("1h")).toBe("2026-11-19 16:00"); // alone: in an hour
    expect(when("1h30")).toBe("2026-11-19 16:30");
    expect(when("+10m")).toBe("2026-11-19 15:10");
    expect(when("30min")).toBe("2026-11-19 15:30");
    expect(when("30 min")).toBe("2026-11-19 15:30");
    expect(when("dans 1h")).toBe("2026-11-19 16:00");
    expect(when("dans 2 heures")).toBe("2026-11-19 17:00");
    expect(when("in 2 hours")).toBe("2026-11-19 17:00");
    expect(when("in 45 minutes")).toBe("2026-11-19 15:45");
    expect(when("dans 3 jours")).toBe("2026-11-22 09:00");
  });
  it("a time today (or tomorrow when it's past)", () => {
    expect(when("19:00")).toBe("2026-11-19 19:00");
    expect(when("19h")).toBe("2026-11-19 19:00");
    expect(when("19h30")).toBe("2026-11-19 19:30");
    expect(when("à 19h")).toBe("2026-11-19 19:00");
    expect(when("at 7pm")).toBe("2026-11-19 19:00");
    expect(when("6 pm")).toBe("2026-11-19 18:00");
    expect(when("9h")).toBe("2026-11-20 09:00"); // 9:00 is past: tomorrow
    expect(when("midi")).toBe("2026-11-20 12:00");
    expect(when("ce soir")).toBe("2026-11-19 20:00");
    expect(when("tonight")).toBe("2026-11-19 20:00");
  });
  it("a day and a time", () => {
    expect(when("demain 9h")).toBe("2026-11-20 09:00");
    expect(when("demain à 9h")).toBe("2026-11-20 09:00");
    expect(when("demain 3h")).toBe("2026-11-20 03:00"); // with a day, 3h is a time
    expect(when("tomorrow 9am")).toBe("2026-11-20 09:00");
    expect(when("tomorrow at 9am")).toBe("2026-11-20 09:00");
    expect(when("ven 18h")).toBe("2026-11-20 18:00");
    expect(when("fri 6pm")).toBe("2026-11-20 18:00");
    expect(when("vendredi 18:00")).toBe("2026-11-20 18:00");
    expect(when("lundi prochain 9h")).toBe("2026-11-23 09:00");
    // today's weekday: today while the time is still to come, else next week
    expect(when("jeu 18h")).toBe("2026-11-19 18:00");
    expect(when("thursday 9am")).toBe("2026-11-26 09:00");
    expect(when("jeudi")).toBe("2026-11-26 09:00");
    expect(when("jeudi prochain 18h")).toBe("2026-11-26 18:00");
    expect(when("next monday 9am")).toBe("2026-11-23 09:00");
    expect(when("24/12 9:00")).toBe("2026-12-24 09:00");
    expect(when("le 24/12 à 9h")).toBe("2026-12-24 09:00");
    expect(when("2026-12-01 14:30")).toBe("2026-12-01 14:30");
    expect(when("demain")).toBe("2026-11-20 09:00"); // a day alone: 9:00
  });
  it("nothing, or a word that isn't a time", () => {
    expect(when("")).toBeNull(); // the caller decides (reminders: in 1 hour)
    expect(when("banana")).toBeNull();
    expect(when("demain banana")).toBeNull();
  });
  it("keeps the words that aren't a time (a title)", () => {
    const w = readWhen(["call", "mom", "fri", "18:00"], from);
    expect(w.rest).toEqual(["call", "mom"]);
    expect(w.time).toBe(18 * 60);
    expect(readWhen("dentist at 9h", from).rest).toEqual(["dentist"]);
    // a quoted shell word stays whole: "Sam" isn't read as saturday
    expect(readWhen(["coffee with Sam", "fri"], from).rest).toEqual(["coffee with Sam"]);
  });
});

describe("impossible dates and times are refused, never moved (B4)", () => {
  const from = new Date(2026, 10, 23, 10, 0);
  it("31/02 and 2026-02-30 are no day", () => {
    expect(parseDay("31/02", from)).toBeNull();
    expect(parseDay("2026-02-30", from)).toBeNull();
    expect(parseDay("29/02/2028", from)?.getDate()).toBe(29);
  });
  it("99:99 and 25h are no time, and readWhen says which word was wrong", () => {
    expect(parseTime("99:99")).toBeNull();
    const w = readWhen(["bad", "99:99"], from);
    expect(w.invalid).toBe("99:99");
    expect(readWhen(["dentist", "31/02", "9h"], from).invalid).toBe("31/02");
    expect(readWhen(["dentist", "fri", "9h"], from).invalid).toBeUndefined();
  });
});

describe("one way to write a day (E4)", () => {
  const d = new Date(2026, 10, 23, 9, 0);
  it("dayShort / dayLong, lowercase, in the deck's language", () => {
    expect(dayShort(d, "en-GB")).toBe("mon 23 nov");
    expect(dayLong(d, "en-GB")).toBe("monday 23 november");
    expect(dayShort(d, "fr-FR")).toBe("lun 23 nov");
    expect(dayLong(d, "fr-FR")).toBe("lundi 23 novembre");
    expect(dayLong(d, "fr-FR", true)).toBe("lundi 23 novembre 2026");
    expect(dayShort(d, "en-US")).toBe("mon 23 nov");
  });
  it("weekday names, short", () => {
    expect(weekdayShort(1, "en-GB")).toBe("mon");
    expect(weekdayShort(0, "fr-FR")).toBe("dim");
  });
});
