import { describe, expect, it } from "vitest";
import { CAP_END, CAP_START, Grid } from "../src/core/grid";
import { NONE } from "../src/core/color";
import { BEVELLED, capColors, capGeometry, keycapLook } from "../src/core/keycap";
import { padIcon } from "../src/core/padglyphs";
import { padButtonOfKey, padCells } from "../src/ui/keyicons";
import { strWidth } from "../src/core/unicode";

describe("keycaps (0.8): one key per shortcut, behind the font's own text", () => {
  it("a key is a colour and its two ends on the grid; writing over a cell takes its key away", () => {
    const g = new Grid(10, 1);
    g.set(0, 0, 0x65, 1, NONE);
    g.setCap(0, 0, 0x333333, CAP_START | CAP_END);
    expect(g.cap[0]).toBe(0x333333);
    expect(g.capEdge[0]).toBe(CAP_START | CAP_END);
    g.set(0, 0, 0x66, 1, NONE);
    expect(g.cap[0]).toBe(NONE);
    expect(g.capEdge[0]).toBe(0);
  });

  it("its geometry is whole device pixels, with a border, a radius and a lip at every size", () => {
    for (const [cw, ch] of [[7, 16], [9, 20], [14, 32], [18, 40], [28, 64]]) {
      const k = capGeometry(cw, ch);
      for (const v of Object.values(k)) expect(Number.isInteger(v) && v >= 1).toBe(true);
      // room for the text: the key never eats more than a quarter of the cell's height
      expect(k.top + k.bottom).toBeLessThanOrEqual(Math.ceil(ch * 0.25));
      expect(k.radius).toBeLessThanOrEqual(cw / 2);
    }
  });

  it("a key's lip is darker and its top edge lighter than its face, on dark and light themes", () => {
    const lum = (c: number) => ((c >> 16) & 255) + ((c >> 8) & 255) + (c & 255);
    for (const face of [0x3a3550, 0xe8e4f0]) {
      const k = capColors(face);
      expect(lum(k.lip)).toBeLessThan(lum(face));
      expect(lum(k.border)).toBeLessThan(lum(face));
      expect(lum(k.shine)).toBeGreaterThan(lum(face));
    }
  });
});

describe("the theme hook: a theme can restyle the keys and the pad's buttons (docs/THEMES.md)", () => {
  it("a theme's key look is its own parts over the bevelled key, kept in bounds", () => {
    expect(keycapLook()).toEqual(BEVELLED);
    const flat = keycapLook({ lip: 0, shine: 0, radius: 0.3 });
    expect(flat).toEqual({ ...BEVELLED, lip: 0, shine: 0, radius: 0.3 });
    expect(capGeometry(14, 32, flat).lip).toBe(0);
    // nonsense from a theme file can't break the drawing
    const odd = keycapLook({ radius: 9, border: -3, reach: Number.NaN });
    expect([odd.radius, odd.border, odd.reach]).toEqual([0.5, 0, BEVELLED.reach]);
  });

  it("the key's face and its text's weight come from the theme when it says", async () => {
    const { UI } = await import("../src/ui/ui");
    const { ThemeManager } = await import("../src/core/theme");
    const { BOLD } = await import("../src/core/grid");
    const theme = { ...new ThemeManager().current, keys: { face: 0x224466, bold: false } };
    const ui = new UI();
    const g = new Grid(20, 1);
    ui.begin(g, theme, 0, { x: -1, y: -1 });
    ui.text(0, 0, "esc close", {});
    expect(g.cap[0]).toBe(0x224466);
    expect(g.attr[0] & BOLD).toBe(0);
  });

  it("a theme's pad look is kept in bounds too", async () => {
    const { setPadLook, PAD_LOOK } = await import("../src/core/padglyphs");
    expect(() => setPadLook({ weight: 5000, size: 0, ring: Number.NaN })).not.toThrow();
    setPadLook(); // back to the deck's
    expect(PAD_LOOK.weight).toBe(800);
  });
});

describe("the pad's buttons in place of the keys, when a pad is used", () => {
  it("finds the pad button that does what the key does", () => {
    expect(padButtonOfKey("enter")).toBe("south");
    expect(padButtonOfKey("⏎")).toBe("south");
    expect(padButtonOfKey("Entrée")).toBe("south");
    expect(padButtonOfKey("esc")).toBe("east");
    expect(padButtonOfKey("Échap")).toBe("east");
    expect(padButtonOfKey("↑")).toBe("up");
    expect(padButtonOfKey("←→")).toBe("dpad");
    expect(padButtonOfKey("⌘K")).toBe("north");
    expect(padButtonOfKey("ctrl+k")).toBe("north");
    expect(padButtonOfKey("⇧⇧")).toBe("north");
    expect(padButtonOfKey("ctrl+tab")).toBe("rb");
    expect(padButtonOfKey("ctrl+shift+tab")).toBe("lb");
    expect(padButtonOfKey("pgdn")).toBe("rt");
    expect(padButtonOfKey("F10")).toBe("start");
    expect(padButtonOfKey("e")).toBeNull();
    expect(padButtonOfKey("⌘⇧P")).toBeNull();
  });

  it("is never wider than the key: one cell gets the small icon, a longer key the icon alone", () => {
    const one = padCells("⏎", "xbox")!;
    expect(one.text).toBe(padIcon("south", "xbox").small);
    expect(strWidth(one.text)).toBe(1);
    const five = padCells("enter", "playstation")!;
    expect(five.text).toBe(padIcon("south", "playstation").text);
    expect(strWidth(five.text)).toBe(2);
    expect(five.color).toEqual(padIcon("south", "playstation").color);
  });

  it("on screen: the words follow the icon at once, the text keeps its width (the spare cells at its end)", async () => {
    const { UI } = await import("../src/ui/ui");
    const { ThemeManager } = await import("../src/core/theme");
    const ui = new UI();
    const g = new Grid(40, 1);
    ui.begin(g, new ThemeManager().current, 0, { x: -1, y: -1 });
    ui.pad = "xbox";
    const end = ui.text(0, 0, "enter open · e edit", {});
    expect(end).toBe(strWidth("enter open · e edit"));
    const row = [...g.ch].map((cp) => String.fromCodePoint(cp)).join("");
    expect(row.slice(0, 2)).toBe(padIcon("south", "xbox").text);
    expect(row.slice(2, 7)).toBe(" open");
  });

  it("is the key itself with no pad, or a key the pad has no button for", () => {
    expect(padCells("enter", null)).toBeNull();
    expect(padCells("e", "xbox")).toBeNull();
  });
});

describe("two keys one space apart keep both their ends (bench 0.8: « ↑↓ ←→ enter » in settings)", () => {
  it("the space between them is the end of the first key and the start of the second", async () => {
    const { UI } = await import("../src/ui/ui");
    const { ThemeManager } = await import("../src/core/theme");
    const { CAP_PAD_L, CAP_PAD_R } = await import("../src/core/grid");
    const ui = new UI();
    const g = new Grid(30, 1);
    ui.begin(g, new ThemeManager().current, 0, { x: -1, y: -1 });
    ui.text(0, 0, "↑↓ ←→ enter", {});
    // cell 2 (between ↑↓ and ←→) and cell 5 (between ←→ and enter)
    for (const k of [2, 5]) expect(g.capEdge[k] & (CAP_PAD_L | CAP_PAD_R)).toBe(CAP_PAD_L | CAP_PAD_R);
  });
  it("such a cell draws both halves (the first key's end, then the second's start)", async () => {
    const { drawCapSlice } = await import("../src/core/keycap");
    const { CAP_PAD_L, CAP_PAD_R } = await import("../src/core/grid");
    const fills: number[] = [];
    const ctx = new Proxy({} as Record<string, unknown>, {
      get: (o, k) => (k in o ? o[k as string] : k === "fill" ? () => fills.push(1) : () => undefined),
      set: (o, k, v) => ((o[k as string] = v), true),
    }) as unknown as CanvasRenderingContext2D;
    drawCapSlice(ctx, 0, 0, 20, 40, 0x334455, CAP_PAD_R);
    const one = fills.length;
    drawCapSlice(ctx, 0, 0, 20, 40, 0x334455, CAP_PAD_L | CAP_PAD_R);
    expect(one).toBeGreaterThan(0);
    expect(fills.length - one).toBe(one * 2);
  });
});
