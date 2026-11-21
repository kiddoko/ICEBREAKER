import { describe, expect, it } from "vitest";
import { daysUntil, moonAge, moonLit, nextPhase, phaseName, SYNODIC, upcoming, waxing } from "../src/widgets/moonphase";

// known moments (UTC): new moon 2024-01-11 11:57, full moon 2024-01-25 17:54, first quarter 2024-01-18 03:53
const NEW = Date.UTC(2024, 0, 11, 11, 57);
const FULL = Date.UTC(2024, 0, 25, 17, 54);
const FIRST = Date.UTC(2024, 0, 18, 3, 53);

describe("the moon's phase", () => {
  it("is new, a quarter, full at the known moments (within a day)", () => {
    const age = moonAge(NEW);
    expect(Math.min(age, SYNODIC - age)).toBeLessThan(1);
    expect(Math.abs(moonAge(FULL) - SYNODIC / 2)).toBeLessThan(1);
    expect(Math.abs(moonAge(FIRST) - SYNODIC / 4)).toBeLessThan(1);
  });

  it("names them, and says how much is lit", () => {
    expect(phaseName(NEW)).toBe("new moon");
    expect(phaseName(FULL)).toBe("full moon");
    expect(phaseName(FIRST)).toBe("first quarter");
    expect(moonLit(NEW)).toBeLessThan(0.02);
    expect(moonLit(FULL)).toBeGreaterThan(0.98);
    expect(moonLit(FIRST)).toBeGreaterThan(0.4);
    expect(moonLit(FIRST)).toBeLessThan(0.6);
    expect(waxing(FIRST)).toBe(true);
    expect(waxing(FULL + 3 * 86400_000)).toBe(false);
  });

  it("finds the next full moon after a new one, about two weeks later", () => {
    const next = nextPhase(0.5, NEW).getTime();
    expect(Math.abs(next - FULL)).toBeLessThan(86400_000);
    // at that full moon, the next one is a month away (the one happening now isn't "next")
    expect(nextPhase(0.5, next).getTime() - next).toBeGreaterThan(20 * 86400_000);
  });

  it("lists the next four main phases, soonest first", () => {
    const u = upcoming(NEW + 86400_000);
    expect(u.map((p) => p.name)).toEqual(["first quarter", "full moon", "last quarter", "new moon"]);
    for (let i = 1; i < u.length; i++) expect(u[i].at.getTime()).toBeGreaterThan(u[i - 1].at.getTime());
  });

  it("counts calendar days", () => {
    expect(daysUntil(new Date(2026, 10, 24, 1), new Date(2026, 10, 21, 23))).toBe(3);
    expect(daysUntil(new Date(2026, 10, 21, 23), new Date(2026, 10, 21, 1))).toBe(0);
  });
});
