import { describe, expect, it } from "vitest";
import { strWidth, truncate } from "../src/core/unicode";
import { fuzzyFilter } from "../src/core/fuzzy";
import { mix } from "../src/core/color";

describe("text width", () => {
  it("counts wide characters as two cells", () => {
    expect(strWidth("abc")).toBe(3);
    expect(strWidth("日本")).toBe(4);
  });
  it("truncates to a width, with an ellipsis", () => {
    expect(truncate("netrunner", 5)).toBe("netr…");
    expect(strWidth(truncate("日本語テキスト", 5))).toBeLessThanOrEqual(5);
    expect(truncate("ok", 5)).toBe("ok");
  });
});

describe("fuzzy search", () => {
  it("puts the closest match first", () => {
    const out = fuzzyFilter("mod", ["settings", "modules", "music library", "mood"], (s) => s);
    expect(out[0]).toBe("modules");
    expect(out).not.toContain("settings");
  });
});

describe("colours", () => {
  it("mixes two colours", () => {
    expect(mix(0x000000, 0xffffff, 0)).toBe(0x000000);
    expect(mix(0x000000, 0xffffff, 1)).toBe(0xffffff);
  });
});

describe("emoji widths", () => {
  it("emoji take two cells, text symbols one", async () => {
    const { strWidth } = await import("../src/core/unicode");
    for (const e of ["⏰", "✅", "⚡", "⛅", "🚀", "🔥", "🙂", "🇨🇭", "🧠", "🫠"]) expect(strWidth([...e][0])).toBe(2);
    for (const s of ["★", "⚙", "☀", "♥", "◷", "ϟ", "é", "→"]) expect(strWidth(s)).toBe(1);
    expect(strWidth("日")).toBe(2);
  });
});
