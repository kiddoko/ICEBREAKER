import { describe, expect, it } from "vitest";
import { DAY_IDS, monthGrid, weekStartOf, pickedText } from "../src/ui/calendar";

describe("the date picker's month", () => {
  it("weeks start on monday, except where they start on sunday", () => {
    expect(weekStartOf("fr-FR")).toBe(1);
    expect(weekStartOf("en-GB")).toBe(1);
    expect(weekStartOf("en-US")).toBe(0);
  });
  it("a month is whole weeks; the 1st sits under its weekday", () => {
    // november 2026: the 1st is a sunday
    const g = monthGrid(2026, 10, 1);
    expect(g.length % 7).toBe(0);
    expect(g.indexOf(1)).toBe(6); // monday first: sunday is the 7th column
    expect(monthGrid(2026, 10, 0).indexOf(1)).toBe(0);
    expect(g.filter((d) => d > 0).length).toBe(30);
  });
  it("what the picker gives back", () => {
    expect(pickedText({ date: new Date(2026, 11, 24) })).toBe("2026-12-24");
    expect(pickedText({ date: new Date(2026, 11, 24), time: 9 * 60 + 5 })).toBe("2026-12-24 09:05");
    expect(pickedText({ time: 7 * 60 + 30 })).toBe("07:30");
    expect(pickedText({ days: ["fri", "mon"] })).toBe("mon,fri");
    expect(DAY_IDS[0]).toBe("mon");
  });
});

import { parseWhen, readWhen } from "../src/core/dates";
describe("what the picker gives back, read by the commands", () => {
  it("a day and a time", () => {
    const d = parseWhen(pickedText({ date: new Date(2026, 11, 24), time: 9 * 60 + 30 }), new Date(2026, 10, 23));
    expect(d?.getTime()).toBe(new Date(2026, 11, 24, 9, 30).getTime());
  });
  it("a day alone", () => {
    expect(readWhen(pickedText({ date: new Date(2026, 11, 24) }), new Date(2026, 10, 23)).day).toBeTruthy();
  });
});

import { isoWeek } from "../src/workspace/minical";
describe("the mini calendar's week number", () => {
  it("ISO weeks", () => {
    expect(isoWeek(new Date(2026, 10, 23))).toBe(48);
    expect(isoWeek(new Date(2027, 0, 1))).toBe(53); // a friday: the last week of 2026
    expect(isoWeek(new Date(2026, 0, 1))).toBe(1);
  });
});
