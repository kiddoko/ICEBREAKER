import { describe, expect, it } from "vitest";
import { curveK, unwarpPoint, warpPoint } from "../src/core/crt";

describe("CRT curvature (crt.ts)", () => {
  const k = curveK(1);

  it("flat at 0: every point stays where it is", () => {
    expect(warpPoint(0.13, 0.87, curveK(0))).toEqual([0.13, 0.87]);
  });

  it("the middle row and column don't move; the corners show beyond the picture (bent in)", () => {
    expect(warpPoint(0.3, 0.5, k)[0]).toBeCloseTo(0.3, 10);
    expect(warpPoint(0.5, 0.2, k)[1]).toBeCloseTo(0.2, 10);
    const [u, v] = warpPoint(0, 0, k);
    expect(u).toBeLessThan(0);
    expect(v).toBeLessThan(0);
  });

  it("the whole picture stays on screen: its corners land inside", () => {
    for (const [u, v] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
      const [x, y] = unwarpPoint(u, v, k);
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(1);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(1);
    }
  });

  it("the caret's inverse undoes the mouse's warp (to a hundredth of a pixel on a 4K screen)", () => {
    for (let i = 0; i <= 10; i++)
      for (let j = 0; j <= 10; j++) {
        const [x, y] = unwarpPoint(i / 10, j / 10, k);
        const [u, v] = warpPoint(x, y, k);
        expect(Math.abs(u - i / 10) * 3840).toBeLessThan(0.01);
        expect(Math.abs(v - j / 10) * 2160).toBeLessThan(0.01);
      }
  });
});
