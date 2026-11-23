import { describe, expect, it } from "vitest";
import { contrast, readable } from "../src/core/color";
import { ThemeManager } from "../src/core/theme";

describe("readable text in every theme", () => {
  it("contrast ratios (WCAG)", () => {
    expect(contrast(0xffffff, 0x000000)).toBeCloseTo(21, 0);
    expect(contrast(0x777777, 0x777777)).toBeCloseTo(1, 5);
  });
  it("readable() brings a colour towards the text until it reads, keeping its hue when it already does", () => {
    expect(readable(0x888888, [0x000000], 4.5, 0xffffff)).toBe(0x888888);
    const fixed = readable(0x333333, [0x101010], 4.5, 0xeeeeee);
    expect(contrast(fixed, 0x101010)).toBeGreaterThanOrEqual(4.5);
  });
  it("every built-in theme: muted ≥ 4.5:1 and subtle ≥ 3.5:1 on its background, panels and pop-ups", () => {
    const tm = new ThemeManager();
    for (const th of tm.list()) {
      for (const bg of [th.c.bg, th.c.panel, th.c.panelAlt]) {
        expect(contrast(th.c.fg, bg), `${th.name} fg`).toBeGreaterThanOrEqual(4.5);
        expect(contrast(th.c.muted, bg), `${th.name} muted`).toBeGreaterThanOrEqual(4.5);
        expect(contrast(th.c.subtle, bg), `${th.name} subtle`).toBeGreaterThanOrEqual(3.5);
      }
    }
  });
});
