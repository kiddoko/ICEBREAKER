import { describe, expect, it } from "vitest";
import { byWeekday, facts, lineChart, pctText, pieChart } from "../plugins/stats/charts";

const pts = (vals: number[]) => vals.map((value, i) => ({ day: `2026-11-${String(i + 1).padStart(2, "0")}`, value }));

describe("stats facts", () => {
  it("counters: totals, average, best day, streak, change vs before", () => {
    const f = facts(pts([1, 1, 1, 0, 2, 3, 0, 4, 5, 6]), 5, true);
    expect(f.total).toBe(18);
    expect(f.avg).toBeCloseTo(3.6);
    expect(f.best?.value).toBe(6);
    expect(f.streak).toBe(3);
    expect(f.active).toBe(4);
    expect(f.change).toBe(13); // 18 now vs 5 before
    expect(f.changePct).toBeCloseTo(2.6);
  });
  it("values: the last one counts", () => {
    const f = facts(pts([70, 71, 72, 71.5]), 2, false);
    expect(f.total).toBe(71.5);
    expect(f.change).toBeCloseTo(0.5); // 71.5 vs 71
    expect(f.min).toBe(71.5);
    expect(f.max).toBe(72);
  });
  it("nothing before: no change", () => {
    expect(facts(pts([3, 4]), 2, true).change).toBeNull();
  });
  it("words for a change", () => {
    expect(pctText(0.124)).toBe("+12 %");
    expect(pctText(-0.03)).toBe("−3 %");
    expect(pctText(0.001)).toBe("=");
    expect(pctText(null)).toBe("");
  });
  it("by weekday", () => {
    // 2026-11-01 is a sunday
    expect(byWeekday(pts([5, 1]))).toEqual([5, 1, 0, 0, 0, 0, 0]);
  });
});

describe("stats drawings", () => {
  it("a rising line ends higher than it starts, with its area under it", () => {
    const d = lineChart([0, 1, 2, 3], 4, 2, 0, 3);
    const rows = d.rows();
    expect(rows).toHaveLength(2);
    // the top row has the line only at the right; the bottom row is lit across
    expect(rows[0][0][0]).toBeGreaterThan(0);
    expect(rows[1].map(([, s]) => s).join("").length).toBe(4);
  });
  it("a pie has a slice per part, in order clockwise from the top", () => {
    const p = pieChart([1, 1], 8, 4, 0.5, 0);
    const layers = new Set(p.rows().flat().map(([, , l]) => l));
    expect([...layers].sort()).toEqual([0, 1]);
    // the right half is the first slice
    const right = p.rows()[1].filter(([x]) => x >= 4).map(([, , l]) => l);
    expect(right.every((l) => l === 0)).toBe(true);
    expect(pieChart([], 4, 4).rows().flat()).toHaveLength(0);
  });
});
