import { describe, expect, it } from "vitest";
import { placeTip } from "../src/ui/tipview";

describe("the hover tip's place", () => {
  const view = { w: 1000, h: 700 };
  it("sits below right of the pointer", () => {
    const p = placeTip({ x: 100, y: 100 }, { w: 200, h: 60 }, view);
    expect(p.left).toBeGreaterThan(100);
    expect(p.top).toBeGreaterThan(100);
  });
  it("flips left near the right edge, up near the bottom, and stays inside", () => {
    const p = placeTip({ x: 950, y: 680 }, { w: 200, h: 60 }, view);
    expect(p.left + 200).toBeLessThanOrEqual(950);
    expect(p.top + 60).toBeLessThanOrEqual(680);
    expect(p.left).toBeGreaterThanOrEqual(0);
  });
  it("never leaves the window, even when it is wider than the room", () => {
    const p = placeTip({ x: 10, y: 10 }, { w: 990, h: 690 }, view);
    expect(p.left).toBeGreaterThanOrEqual(0);
    expect(p.top).toBeGreaterThanOrEqual(0);
  });
});

import { freeNumber } from "../src/shell/systerm";
describe("terminal tabs' numbers", () => {
  it("the smallest one free: close zsh, open another, it's zsh again (not zsh 2 alone)", () => {
    expect(freeNumber(new Set())).toBe(1);
    expect(freeNumber(new Set([1, 2]))).toBe(3);
    expect(freeNumber(new Set([2]))).toBe(1);
  });
});
