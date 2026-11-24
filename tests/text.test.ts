import { describe, expect, it } from "vitest";
import { fillName, fitHints, strWidth, truncate, wrapLines } from "../src/core/unicode";
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

describe("wrapLines: wrapped, at most n lines", () => {
  it("a text that fits is left whole", () => {
    expect(wrapLines("my terminal and the keys", 12, 3)).toEqual(["my terminal", "and the keys"]);
  });
  it("cut after n lines: the last one says so with …", () => {
    const lines = wrapLines("one two three four five six seven eight nine ten", 10, 3);
    expect(lines).toHaveLength(3);
    expect(lines[2].endsWith("…")).toBe(true);
    for (const l of lines) expect(strWidth(l)).toBeLessThanOrEqual(10);
  });
  it("a full last line loses a letter for the …", () => {
    expect(wrapLines("aaaaa bbbbb ccccc", 5, 2)).toEqual(["aaaaa", "bbbb…"]);
  });
});

describe("fillName: a nickname in a sentence", () => {
  it("keeps the nickname's case", () => {
    expect(fillName("hello, {handle}", "handle", "ZeroCool", 40)).toBe("hello, ZeroCool");
  });
  it("a long one is cut with …, the words around stay", () => {
    const s = fillName("hello, {handle}", "handle", "TheMostIncrediblyLongNicknameEver", 20);
    expect(s.startsWith("hello, The")).toBe(true);
    expect(s.endsWith("…")).toBe(true);
    expect(strWidth(s)).toBe(20);
  });
});

describe("fitHints: a line of keys that never ends « échap r… »", () => {
  const keys = "↑↓ ou un numéro · entrée garde · tab passer · échap retour";
  it("whole when it fits", () => expect(fitHints(keys, 80)).toBe(keys));
  it("the last hints go first, never one cut in the middle", () => {
    expect(fitHints(keys, 40)).toBe("↑↓ ou un numéro · entrée garde");
    expect(fitHints(keys, 20)).toBe("↑↓ ou un numéro");
  });
  it("one hint too long: cut with …", () => expect(fitHints(keys, 8)).toBe("↑↓ ou u…"));
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
