import { describe, expect, it } from "vitest";
import { eventLine, notYetIn, parseEventLine } from "../plugins/calendar/lines";

const timed = (start: Date, end: Date, title = "x") => ({ id: "l1", title, start: start.toISOString(), end: end.toISOString(), allDay: false });
const back = (e: ReturnType<typeof timed>) => {
  const r = parseEventLine(eventLine(e))!;
  return [new Date(r.start).getTime(), new Date(r.end).getTime()];
};

describe("local calendar lines", () => {
  it("the same day, and the night to the next morning, keep the short form", () => {
    const a = timed(new Date(2026, 10, 19, 14, 30), new Date(2026, 10, 19, 15, 15));
    expect(eventLine(a)).toBe("- 2026-11-19 14:30-15:15 x ^l1");
    const n = timed(new Date(2026, 10, 19, 22, 0), new Date(2026, 10, 20, 2, 0));
    expect(eventLine(n)).toBe("- 2026-11-19 22:00-02:00 x ^l1");
    expect(back(n)).toEqual([new Date(n.start).getTime(), new Date(n.end).getTime()]);
  });

  it("over midnight past the start time, or 24 h and more: the end day is written, nothing shortened", () => {
    for (const e of [
      timed(new Date(2026, 10, 19, 22, 0), new Date(2026, 10, 20, 23, 0)),
      timed(new Date(2026, 10, 19, 10, 0), new Date(2026, 10, 20, 10, 0)),
      timed(new Date(2026, 10, 19, 9, 0), new Date(2026, 10, 22, 18, 30)),
    ]) {
      expect(eventLine(e)).toContain("..");
      expect(back(e)).toEqual([new Date(e.start).getTime(), new Date(e.end).getTime()]);
    }
  });

  it("all-day events and the rest of the line as before", () => {
    const r = parseEventLine("- 2026-11-24..2026-11-26 Trip @ Lyon ^l13")!;
    expect(r).toMatchObject({ allDay: true, start: "2026-11-24", end: "2026-11-27", title: "Trip", where: "Lyon", id: "l13" });
    expect(eventLine({ ...r })).toBe("- 2026-11-24..2026-11-26 Trip @ Lyon ^l13");
    expect(parseEventLine("# November")).toBeNull();
    expect(parseEventLine("- 2026-11-19 9h Coffee\r")).toMatchObject({ title: "Coffee", allDay: false });
  });

  it("events an older version kept aside don't come back twice", () => {
    const have = [{ ...timed(new Date(2026, 10, 19, 9, 0), new Date(2026, 10, 19, 10, 0), "a"), id: "l1" }];
    const old = [{ ...have[0], id: "l7" }, { ...timed(new Date(2026, 10, 20, 9, 0), new Date(2026, 10, 20, 10, 0), "b"), id: "l8" }];
    expect(notYetIn(old, have).map((e) => e.title)).toEqual(["b"]);
  });
});

describe("how an event's time is said", async () => {
  const { timeSpan, until } = await import("../plugins/calendar/lines");
  it("one ending on a later day says so", () => {
    const s = new Date(2026, 10, 19, 22, 0);
    expect(timeSpan(s.toISOString(), new Date(2026, 10, 19, 23, 0).toISOString())).toBe("22:00–23:00");
    expect(timeSpan(s.toISOString(), new Date(2026, 10, 20, 23, 0).toISOString())).toBe("22:00–23:00 +1d");
    expect(timeSpan(s.toISOString(), new Date(2026, 10, 20, 2, 0).toISOString())).toBe("22:00–02:00 +1d");
  });
  it("two events of the same day are as many days away", () => {
    const now = new Date(2026, 10, 24, 15, 0);
    expect(until(new Date(2026, 10, 25, 10, 0), now)).toBe(until(new Date(2026, 10, 25, 22, 0), now));
    expect(until(new Date(2026, 10, 25, 22, 0), now)).toBe("in 1 d");
    expect(until(new Date(2026, 10, 24, 15, 30), now)).toBe("in 30 min");
    expect(until(new Date(2026, 10, 24, 20, 0), now)).toBe("in 5 h");
    expect(until(new Date(2026, 10, 25, 1, 0), now)).toBe("in 10 h");
  });
});
