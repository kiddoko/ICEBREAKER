import { describe, expect, it } from "vitest";
import { monthShape, weekShape } from "../plugins/calendar/sizes";

describe("the calendar widgets, by size", () => {
  it("the month: whole when every week fits, else today's week, else today", () => {
    expect(monthShape(30, 9, 5)).toBe("month"); // title + weekdays + 5 weeks
    expect(monthShape(22, 5, 5)).toBe("week"); // a 2×2 on a big screen: today's week, not the 1st's
    expect(monthShape(22, 3, 5)).toBe("week");
    expect(monthShape(13, 5, 5)).toBe("today"); // too narrow for 7 columns (the M column was cut)
    expect(monthShape(30, 2, 5)).toBe("today");
  });
  it("this week: columns when a title fits in each, else a strip of days, else today", () => {
    expect(weekShape(80, 4)).toBe("columns");
    expect(weekShape(50, 3)).toBe("strip"); // 7 × 7 cells: "▪ 1" / "▪ee" were unreadable
    expect(weekShape(22, 2)).toBe("strip");
    expect(weekShape(18, 3)).toBe("today");
    expect(weekShape(80, 1)).toBe("today");
  });
});
