import { describe, expect, it } from "vitest";
import { parseDay, parseTime, ymd } from "../src/core/dates";

const from = new Date(2026, 10, 19, 15, 0); // Thursday 19 Nov 2026
const day = (s: string) => {
  const d = parseDay(s, from);
  return d ? ymd(d) : null;
};

describe("the one date reader", () => {
  it("reads days in English and French", () => {
    expect(day("today")).toBe("2026-11-19");
    expect(day("demain")).toBe("2026-11-20");
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
    expect(parseTime("7pm")).toBe(19 * 60);
    expect(parseTime("12am")).toBe(0);
    expect(parseTime("25:00")).toBeNull();
    expect(parseTime("42")).toBeNull();
  });
});
