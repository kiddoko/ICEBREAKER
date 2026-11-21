import { describe, expect, it } from "vitest";
import { durTenths, parseTimer } from "../src/widgets/clockstate";

describe("timer lengths", () => {
  it("each number belongs to the unit after it", () => {
    expect(parseTimer("15s")).toBe(15_000);
    expect(parseTimer("20s")).toBe(20_000);
    expect(parseTimer("90s")).toBe(90_000);
    expect(parseTimer("4m")).toBe(240_000);
    expect(parseTimer("25")).toBe(25 * 60_000);
    expect(parseTimer("1h30")).toBe(90 * 60_000);
    expect(parseTimer("1h30m")).toBe(90 * 60_000);
    expect(parseTimer("1m30")).toBe(90_000);
    expect(parseTimer("1m30s")).toBe(90_000);
    expect(parseTimer("1h20m10s")).toBe((80 * 60 + 10) * 1000);
    expect(parseTimer("5min")).toBe(300_000);
  });
  it("not a length: 0", () => {
    expect(parseTimer("tea")).toBe(0);
    expect(parseTimer("")).toBe(0);
    expect(parseTimer("5x")).toBe(0);
  });
  it("tenths for laps", () => {
    expect(durTenths(900)).toBe("00:00.9");
    expect(durTenths(65_340)).toBe("01:05.3");
  });
});
