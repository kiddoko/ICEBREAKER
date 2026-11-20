import { describe, expect, it } from "vitest";
import { accelerated } from "../src/ui/slider";
import { FilterBar } from "../src/ui/filterbar";

describe("held keys speed up (sliders, ←→)", () => {
  it("1 at a time, then 2, 5, 10 the longer it lasts", () => {
    const steps: number[] = [];
    for (let i = 0; i < 45; i++) steps.push(accelerated("t", 1000 + i * 50));
    expect(steps.slice(0, 8)).toEqual([1, 1, 1, 1, 1, 1, 1, 1]);
    expect(steps[10]).toBe(2);
    expect(steps[25]).toBe(5);
    expect(steps[44]).toBe(10);
  });
  it("a pause starts again from 1", () => {
    for (let i = 0; i < 30; i++) accelerated("p", i * 50);
    expect(accelerated("p", 30 * 50 + 400)).toBe(1);
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
