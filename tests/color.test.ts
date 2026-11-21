import { describe, expect, it } from "vitest";
import { hsl, toHsl } from "../src/core/color";

describe("hsl ⇄ rgb (the theme studio's palette)", () => {
  it("makes the primaries and greys", () => {
    expect(hsl(0, 1, 0.5)).toBe(0xff0000);
    expect(hsl(120, 1, 0.5)).toBe(0x00ff00);
    expect(hsl(240, 1, 0.5)).toBe(0x0000ff);
    expect(hsl(0, 0, 1)).toBe(0xffffff);
    expect(hsl(77, 0, 0)).toBe(0x000000);
  });
  it("reads a colour back", () => {
    const [h, s, l] = toHsl(0xcba6f7);
    expect(Math.abs(hsl(h, s, l) - 0xcba6f7)).toBeLessThan(0x020202);
    expect(toHsl(0x808080)[1]).toBe(0);
  });
});
