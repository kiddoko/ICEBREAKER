import { describe, expect, it } from "vitest";
import { padButtonFor } from "../src/core/gamepad";
import { drawPadGlyph, isPadGlyph, PAD_GLYPH_BASE, PAD_SPRITES, padGlyph, padIcon, padKind, STANDARD_BUTTONS } from "../src/core/padglyphs";
import { contrast } from "../src/core/color";
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
  it("every icon draws (clean shapes, a letter in the deck's font), and only in its own cells", () => {
    const calls: string[] = [];
    const ctx = new Proxy({ fillStyle: "#5fbf3f", lineWidth: 1, globalAlpha: 1 } as Record<string, unknown>, {
      get: (t, k) => (k in t ? t[k as string] : (...args: unknown[]) => void calls.push(`${String(k)}(${args.length})`)),
      set: (t, k, v) => ((t[k as string] = v), true),
    }) as unknown as CanvasRenderingContext2D;
    for (const name of PAD_SPRITES) {
      calls.length = 0;
      const cps = [...padGlyph(name)].map((c) => c.codePointAt(0)!);
      for (const [k, cp] of cps.entries()) expect(drawPadGlyph(ctx, cp, k * 10, 0, 10, 22), name).toBe(true);
      expect(calls.some((c) => /^(fill|stroke|fillText)\(/.test(c)), name).toBe(true);
      // clipped to the cell it draws
      expect(calls).toContain("clip(0)");
    }
  });
  it("the letters read on the buttons: ≥ 4.5:1 between each Xbox button and its ink", () => {
    for (const b of ["south", "east", "west", "north"] as const) {
      const c = padIcon(b, "xbox").color!;
      const lum = (0.2126 * ((c >> 16) & 255) + 0.7152 * ((c >> 8) & 255) + 0.0722 * (c & 255)) / 255;
      const ink = lum > 0.55 ? 0x101018 : 0xffffff;
      expect(contrast(c, ink), b).toBeGreaterThanOrEqual(4.5);
    }
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
