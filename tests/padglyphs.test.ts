import { describe, expect, it } from "vitest";
import { padButtonFor } from "../src/core/gamepad";
import { isPadGlyph, PAD_GLYPH_BASE, PAD_SPRITES, padGlyph, padIcon, padKind, spriteRows, STANDARD_BUTTONS } from "../src/core/padglyphs";
import { charWidth } from "../src/core/unicode";

describe("which pad it is", () => {
  it("reads the ids the engines give", () => {
    expect(padKind("Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)")).toBe("xbox");
    expect(padKind("Xbox 360 Controller (XInput STANDARD GAMEPAD)")).toBe("xbox");
    expect(padKind("045e-0b13-Xbox Wireless Controller")).toBe("xbox");
    expect(padKind("DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)")).toBe("playstation");
    expect(padKind("Wireless Controller")).toBe("playstation"); // a DualShock 4 on a Mac
    expect(padKind("054c-09cc-Wireless Controller")).toBe("playstation");
    expect(padKind("Pro Controller (STANDARD GAMEPAD Vendor: 057e Product: 2009)")).toBe("nintendo");
    expect(padKind("8BitDo SN30 Pro")).toBe("generic");
  });
});

describe("the icons", () => {
  it("a button's icon follows the pad: the bottom button is A, ✕, or B on a Nintendo pad", () => {
    expect(padIcon("south", "xbox").name).toBe("A");
    expect(padIcon("south", "playstation").name).toBe("✕");
    expect(padIcon("south", "nintendo").name).toBe("B");
    expect(padIcon("east", "nintendo").name).toBe("A");
    expect(padIcon("lb", "playstation").name).toBe("L1");
    expect(padIcon("up", "nintendo").name).toBe("↑");
    expect(padIcon("south", "xbox").color).not.toBeNull();
    expect(padIcon("south", "nintendo").color).toBeNull();
  });
  it("every icon is two one-cell characters of ours", () => {
    for (const b of STANDARD_BUTTONS)
      for (const k of ["xbox", "playstation", "nintendo", "generic"] as const) {
        const cps = [...padIcon(b, k).text].map((ch) => ch.codePointAt(0)!);
        expect(cps).toHaveLength(2);
        expect(cps.every(isPadGlyph)).toBe(true);
        expect(cps.every((cp) => charWidth(cp) === 1)).toBe(true);
        expect(cps[1]).toBe(cps[0] + 1);
      }
    expect(padGlyph("nope")).toBe("");
    // they stay in U+E100…E1FF (the range core/glyphs.ts hands over)
    expect(PAD_GLYPH_BASE + PAD_SPRITES.length * 2).toBeLessThanOrEqual(0xe200);
  });
  it("every sprite is 10 × 10, lit, and not cut at the sides", () => {
    for (const name of PAD_SPRITES) {
      const rows = spriteRows(name);
      expect(rows).toHaveLength(10);
      expect(rows.join("").includes("X")).toBe(true);
    }
    expect(spriteRows("a")).toMatchInlineSnapshot(`
      [
        "...XXXX...",
        ".XXXXXXXX.",
        ".XXX..XXX.",
        "XXX.XX.XXX",
        "XXX....XXX",
        "XXX.XX.XXX",
        "XXX.XX.XXX",
        ".XXXXXXXX.",
        ".XXXXXXXX.",
        "...XXXX...",
      ]
    `);
  });
});

describe("which button does an action", () => {
  it("follows the pad's mapping (core/gamepad.ts)", () => {
    expect(padButtonFor("confirm")).toBe("south");
    expect(padButtonFor("back")).toBe("east");
    expect(padButtonFor("palette")).toBe("north");
    expect(padButtonFor("tab-next")).toBe("rb");
    expect(padButtonFor("tab-prev")).toBe("lb");
    expect(padButtonFor("up")).toBe("up");
    expect(padButtonFor("scroll-up")).toBeNull();
  });
});
