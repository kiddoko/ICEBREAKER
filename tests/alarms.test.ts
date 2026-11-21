import { describe, expect, it } from "vitest";
import { type Alarm, daysText, inText, nextRing, parseDays, readAlarms, timeText, writeAlarms } from "../src/widgets/alarms";

const alarm = (time: number, days: number[] = [], on = true): Alarm => ({ id: 1, time, label: "", days, on });
// friday 20 nov 2026, 06:00
const FRI = new Date(2026, 10, 20, 6, 0);

describe("alarm days", () => {
  it("reads ranges, lists, words, French", () => {
    expect(parseDays("mon-fri")).toEqual([1, 2, 3, 4, 5]);
    expect(parseDays("lun-ven")).toEqual([1, 2, 3, 4, 5]);
    expect(parseDays("weekend")).toEqual([6, 0]);
    expect(parseDays("daily")).toEqual([1, 2, 3, 4, 5, 6, 0]);
    expect(parseDays("mon,wed,fri")).toEqual([1, 3, 5]);
    expect(parseDays("fri-mon")).toEqual([1, 5, 6, 0]);
    expect(parseDays("sat")).toEqual([6]);
    expect(parseDays("someday")).toBeNull();
    expect(parseDays("mon-")).toBeNull();
  });
  it("says them back", () => {
    expect(daysText([])).toBe("once");
    expect(daysText([1, 2, 3, 4, 5])).toBe("mon–fri");
    expect(daysText([0, 6])).toBe("weekend");
    expect(daysText([0, 1, 2, 3, 4, 5, 6])).toBe("every day");
    expect(daysText([2, 3, 4, 5, 6])).toBe("tue–sat");
    expect(daysText([1, 3])).toBe("mon, wed");
    expect(daysText([1, 3], (s) => s.toUpperCase())).toBe("MON, WED");
  });
});

describe("when an alarm rings", () => {
  it("once: today if still to come, else tomorrow", () => {
    expect(nextRing(alarm(7 * 60 + 30), FRI)).toEqual(new Date(2026, 10, 20, 7, 30));
    expect(nextRing(alarm(5 * 60), FRI)).toEqual(new Date(2026, 10, 21, 5, 0));
    // exactly now isn't "after now"
    expect(nextRing(alarm(6 * 60), FRI)).toEqual(new Date(2026, 10, 21, 6, 0));
  });
  it("on its days only", () => {
    // friday 6:00, weekdays at 5:00 → monday
    expect(nextRing(alarm(5 * 60, [1, 2, 3, 4, 5]), FRI)).toEqual(new Date(2026, 10, 23, 5, 0));
    expect(nextRing(alarm(8 * 60, [6, 0]), FRI)).toEqual(new Date(2026, 10, 21, 8, 0));
    // the same weekday, earlier in the day: a week later
    expect(nextRing(alarm(5 * 60, [5]), FRI)).toEqual(new Date(2026, 10, 27, 5, 0));
  });
  it("off: never", () => {
    expect(nextRing(alarm(7 * 60, [], false), FRI)).toBeNull();
  });
  it("how far", () => {
    expect(inText(new Date(2026, 10, 20, 6, 12), FRI)).toBe("12 min");
    expect(inText(new Date(2026, 10, 20, 13, 5), FRI)).toBe("7 h 05");
    expect(inText(new Date(2026, 10, 23, 6, 0), FRI)).toBe("3 d");
    expect(timeText(7 * 60 + 5)).toBe("07:05");
  });
});

describe("the alarms file", () => {
  it("round-trips and drops what isn't an alarm", () => {
    const list: Alarm[] = [{ id: 3, time: 450, label: "wake up", days: [1, 2], on: true }];
    expect(readAlarms(writeAlarms(list))).toEqual(list);
    expect(readAlarms('{"alarms":[{"time":2000},{"time":60,"days":[9,1]},"x"]}')).toEqual([{ id: 1, time: 60, label: "", days: [1], on: true }]);
    // the same id twice: the second gets a new one
    expect(readAlarms('{"alarms":[{"id":4,"time":60},{"id":4,"time":90}]}').map((a) => a.id)).toEqual([4, 5]);
    expect(readAlarms("not json")).toEqual([]);
  });
});
