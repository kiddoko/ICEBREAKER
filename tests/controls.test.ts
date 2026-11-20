import { describe, expect, it } from "vitest";
import { HOLD_DELAY, HoldClock, heldStep, holdRate } from "../src/ui/slider";
import { FilterBar } from "../src/ui/filterbar";
import { chromaStrength } from "../src/core/fxlevels";

describe("sliders go 1 by 1 (held: faster, never bigger steps)", () => {
  /** a slider held for `ms` from 0 (a key on it, or the mouse on its track), sampled every frame */
  const hold = (ms: number, frame = 1000 / 60) => {
    const clock = new HoldClock(0);
    const values = [1]; // the press itself: one step
    for (let t = frame; t <= ms; t += frame) for (let n = clock.due(t); n > 0; n--) values.push(values[values.length - 1] + 1);
    return values;
  };
  it("every step is exactly 1 (0.5.0 jumped by 2, 5, then 10)", () => {
    const v = hold(5000);
    for (let i = 1; i < v.length; i++) expect(v[i] - v[i - 1]).toBe(1);
  });
  it("one step on the press, then a pause like a key's, then it repeats", () => {
    expect(hold(HOLD_DELAY - 20)).toEqual([1]);
    expect(hold(HOLD_DELAY + 20).length).toBe(2);
  });
  it("speeds up smoothly the longer it's held", () => {
    expect(holdRate(0)).toBeCloseTo(8);
    expect(holdRate(1500)).toBeCloseTo(60);
    for (let t = 0; t < 2000; t += 50) expect(holdRate(t + 50)).toBeGreaterThanOrEqual(holdRate(t));
    // the second second covers much more ground than the first one
    const first = hold(1000).length, second = hold(2000).length - first;
    expect(second).toBeGreaterThan(first * 2);
    // 0 → 100 in under three seconds
    expect(hold(3000).length).toBeGreaterThanOrEqual(100);
  });
  it("a slow frame never makes a jump: at most 2 steps are caught up", () => {
    const clock = new HoldClock(0);
    expect(clock.due(5000)).toBeLessThanOrEqual(2);
    expect(clock.due(5005)).toBeLessThanOrEqual(1);
  });
  it("←→ (Settings, ✦ fx, the setup): one press = one step; the OS's repeats add nothing", () => {
    let v = 50;
    const step = (d: 1 | -1) => (v += d);
    heldStep("t", 1, step, 0);
    heldStep("t", 1, step, 30); // a repeat of the same key: the hold paces it, not the OS
    expect(v).toBe(51);
    heldStep("t", -1, step, 60); // the other way: a new press
    expect(v).toBe(50);
  });
});

describe("chromatic aberration, eased in", () => {
  it("100 % is what 40 % was, 50 % what 10 % was, and it starts gently", () => {
    expect(chromaStrength(0)).toBe(0);
    expect(chromaStrength(100)).toBeCloseTo(40);
    expect(chromaStrength(50)).toBeCloseTo(10);
    expect(chromaStrength(10)).toBeLessThan(1);
    expect(chromaStrength(200)).toBeLessThanOrEqual(200);
  });
});

describe("the search bar", () => {
  it("typeToSearch: a letter starts the search", () => {
    const f = new FilterBar({ typeToSearch: true });
    expect(f.onText("m")).toBe(true);
    expect(f.query).toBe("m");
  });
  it("without it: letters stay the page's, / starts the search", () => {
    const f = new FilterBar();
    expect(f.onText("m")).toBe(false);
    expect(f.onText("/")).toBe(true);
    f.onText("x");
    expect(f.query).toBe("x");
  });
  it("always: every key types, clear keeps it typing", () => {
    const f = new FilterBar({ always: true, colours: false });
    f.onText("a");
    f.clear();
    f.onText("b");
    expect(f.query).toBe("b");
  });
});
