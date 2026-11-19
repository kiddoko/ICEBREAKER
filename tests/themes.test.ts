import { describe, expect, it } from "vitest";
import { channels, type RGB } from "../src/core/color";
import { ThemeManager } from "../src/core/theme";

/**
 * Every built-in theme stays readable: WCAG contrast ratios between the
 * colours that are drawn on top of each other. (The manual pass, theme by
 * theme, checks the rest: overlaps, effects, transitions.)
 */
function lum(c: RGB): number {
  const [r, g, b] = channels(c).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: RGB, b: RGB): number {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/** [text, background, minimum, what it is] */
type Pair = [keyof ThemeColors, keyof ThemeColors, number, string];
type ThemeColors = ReturnType<ThemeManager["list"]>[number]["c"];

const PAIRS: Pair[] = [
  ["fg", "bg", 4.5, "text"],
  ["fg", "panel", 4.5, "text in boxes"],
  ["fg", "highlight", 4.5, "the line under the cursor"],
  ["fg", "selection", 3, "selected text"],
  ["muted", "panel", 3, "secondary text"],
  ["subtle", "panel", 2, "hints"],
  ["accent", "panel", 3, "accent text, buttons"],
  ["accent", "highlight", 3, "buttons (accent on highlight)"],
  ["panel", "accent", 3, "selected button (panel text on accent)"],
  ["error", "panel", 3, "errors"],
  ["success", "panel", 3, "success"],
  ["warning", "panel", 3, "warnings"],
  ["statusFg", "statusBg", 4.5, "status bar"],
  ["titleFocus", "panel", 3, "focused box title"],
];

describe("themes are readable", () => {
  const themes = new ThemeManager().list();
  it("loads them all", () => expect(themes.length).toBeGreaterThan(5));
  for (const th of themes)
    it(th.name, () => {
      const bad = PAIRS.map(([a, b, min, what]) => ({ what, a, b, min, got: contrast(th.c[a] as RGB, th.c[b] as RGB) }))
        .filter((p) => p.got < p.min)
        .map((p) => `${p.what}: ${p.a} on ${p.b} = ${p.got.toFixed(2)} (min ${p.min})`);
      expect(bad).toEqual([]);
    });
});
