import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { contrast } from "../src/core/color";
import { BEVELLED, keycapLook } from "../src/core/keycap";
import { PAD_LOOK } from "../src/core/padglyphs";
import { COMPONENTS, KEYS, keyFace, PAD } from "../src/core/skin/components";
import type { Field } from "../src/core/skin/fields";
import { applyFloor, defaults, readTable, resolve } from "../src/core/skin/registry";
import { parseTheme, ThemeManager } from "../src/core/theme";
import { knob, knobNames, knobSuggestions, parseKnobValue, SKIN_KNOBS } from "../src/core/tweaks";
import { goldenScreens } from "./skin-golden";

/** the clamps as they were written by hand before the registry (0.8, core/keycap.ts and core/padglyphs.ts) */
const LEGACY_BEVELLED = { radius: 0.17, border: 1, lip: 0.12, shine: 1, reach: 0.42, top: 0.1, bottom: 0.06, face: null, bold: true };
function legacyKeycapLook(own: Record<string, unknown> = {}) {
  const k = { ...LEGACY_BEVELLED, ...own } as unknown as Record<string, number>;
  const clamp = (v: number, lo: number, hi: number, d: number) => (Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d);
  const B = LEGACY_BEVELLED;
  return {
    ...k,
    radius: clamp(k.radius, 0, 0.5, B.radius), border: Math.round(clamp(k.border, 0, 4, B.border)), lip: clamp(k.lip, 0, 0.3, B.lip),
    shine: Math.round(clamp(k.shine, 0, 3, B.shine)), reach: clamp(k.reach, 0, 0.5, B.reach), top: clamp(k.top, 0, 0.3, B.top), bottom: clamp(k.bottom, 0, 0.3, B.bottom),
  };
}
const LEGACY_PAD = { inkDark: 0x101018, inkLight: 0xffffff, psBody: 0x1d1c26, ring: 0.5, weight: 800, size: 0.86 };

const NIGHTSHADE = readFileSync("themes/nightshade.toml", "utf8");
const theme = (extra: string) => parseTheme(`${NIGHTSHADE}\n${extra}`, null, "vault");

describe("skin registry: nothing changes on screen (themes v2, milestone 1)", () => {
  it("the defaults are the deck's 0.8 bevelled key and pad buttons", () => {
    expect(BEVELLED).toEqual(LEGACY_BEVELLED);
    expect(PAD_LOOK).toEqual(LEGACY_PAD);
  });

  it("keycapLook clamps exactly like the hand-written 0.8 code", () => {
    const odd = [-1, 0, 0.05, 0.17, 0.3, 0.5, 0.9, 2.6, 9, Number.NaN, Infinity, -Infinity];
    for (const field of ["radius", "border", "lip", "shine", "reach", "top", "bottom"]) {
      for (const v of odd) expect(keycapLook({ [field]: v }), `${field}=${v}`).toEqual(legacyKeycapLook({ [field]: v }));
    }
    expect(keycapLook({ face: 0x224466, bold: false })).toEqual(legacyKeycapLook({ face: 0x224466, bold: false }));
  });

  it("every built-in theme draws the same grid, the same keys and the same key geometry as master (tests/skin-golden.json)", () => {
    const golden = JSON.parse(readFileSync("tests/skin-golden.json", "utf8"));
    expect(Object.keys(golden)).toHaveLength(11);
    expect(goldenScreens()).toEqual(golden);
  });

  it("no built-in theme sets a component yet, nor has a skin problem", () => {
    for (const th of new ThemeManager().list()) {
      expect(th.keys, th.name).toBeUndefined();
      expect(th.pad, th.name).toBeUndefined();
      expect(th.skinProblems, th.name).toBeUndefined();
    }
  });
});

describe("skin registry: every field, from its declaration", () => {
  for (const comp of COMPONENTS) {
    for (const [name, f] of Object.entries(comp.fields) as [string, Field][]) {
      it(`${comp.id}.${name}: default, bounds, fallback, reading`, () => {
        expect(f.doc.length, "has help").toBeGreaterThan(5);
        expect(f.clamp(f.default)).toEqual(f.default);
        expect(f.clamp(undefined)).toEqual(f.default);
        expect(f.clamp("nonsense")).toEqual(f.default);
        const ctx = { palette: { pink: 0xff2e88 } };
        if (f.kind === "number") {
          expect(f.clamp(f.max + 100)).toBe(f.max);
          expect(f.clamp(f.min - 100)).toBe(f.min);
          expect(f.clamp(Number.NaN)).toBe(f.default);
          expect(f.read(String(f.max), ctx)).toEqual({ value: f.max });
          expect(f.read("x", ctx)).toHaveProperty("error");
          for (const s of f.suggest()) expect(f.clamp(Number(s))).toBe(Number(s));
          if (f.integer) expect(Number.isInteger(f.clamp(f.min + 0.4))).toBe(true);
        } else if (f.kind === "color") {
          expect(f.read("#ff0000", ctx)).toEqual({ value: 0xff0000 });
          expect(f.read("pink", ctx)).toEqual({ value: 0xff2e88 });
          expect(f.read("auto", ctx)).toEqual({ value: f.default });
          expect(f.read("plaid", ctx)).toHaveProperty("error");
        } else if (f.kind === "bool") {
          expect(f.read("off", ctx)).toEqual({ value: false });
          expect(f.read(true, ctx)).toEqual({ value: true });
          expect(f.read("maybe", ctx)).toHaveProperty("error");
        } else {
          for (const o of f.options) expect(f.read(o, ctx)).toEqual({ value: o });
          expect(f.read("???", ctx)).toHaveProperty("error");
        }
      });
    }
  }

  it("resolve() always gives a complete look", () => {
    expect(resolve(KEYS)).toEqual(defaults(KEYS));
    expect(Object.keys(resolve(PAD, { size: 0.7 }))).toEqual(Object.keys(PAD.fields));
  });
});

describe("a theme file can restyle its keys and pad buttons ([keys], [pad])", () => {
  it("reads the fields it sets, in bounds, with palette names", () => {
    const t = theme(`[keys]\nradius = 0\nlip = 9\nface = "surface0"\nbold = false\n[pad]\nsize = 0.7`);
    expect(t.keys).toEqual({ radius: 0, lip: 0.3, face: t.palette.surface0, bold: false });
    expect(t.pad).toEqual({ size: 0.7 });
    expect(keycapLook(t.keys).border).toBe(1); // the rest stays the bevelled key's
    expect(t.skinProblems).toBeUndefined();
  });

  it("reports a bad value or an unknown field, and keeps the default for it — never half-loads", () => {
    const t = theme(`[keys]\nradius = "round"\nwobble = 3\nlip = 0`);
    expect(t.keys).toEqual({ lip: 0 });
    expect(t.skinProblems?.map((p) => p.key)).toEqual(["keys.radius", "keys.wobble"]);
  });

  it("a theme built on another inherits its components, field by field", () => {
    const parent = theme(`[keys]\nradius = 0\nlip = 0`);
    const child = parseTheme(`[meta]\nname = "child"\n[keys]\nlip = 0.2`, parent, "vault");
    expect(child.keys).toEqual({ radius: 0, lip: 0.2 });
  });

  it("the floor: a key face the text can't be read on goes back to the deck's (4.5:1)", () => {
    const t = theme(`[keys]\nface = "#e0e0e0"`); // nightshade's text is light: unreadable on it
    expect(t.keys?.face).toBeUndefined();
    expect(t.skinProblems?.[0].key).toBe("keys.face");
    expect(t.skinProblems?.[0].reason).toMatch(/4\.5:1/);
  });

  it("every built-in theme keeps every component's floor with the deck's own look", () => {
    for (const th of new ThemeManager().list()) {
      expect(applyFloor(KEYS, {}, th.c).problems, th.name).toEqual([]);
      expect(contrast(th.c.fg, keyFace(th.c)), th.name).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("readTable leaves a theme without the table untouched", () => {
    expect(readTable(KEYS, undefined, { palette: {} })).toEqual({ look: undefined, problems: [] });
  });
});

describe("theme set <key> <value>: knobs generated from the registry", () => {
  it("one knob per component field, found by its key", () => {
    const fields = COMPONENTS.reduce((n, c) => n + Object.keys(c.fields).length, 0);
    expect(SKIN_KNOBS).toHaveLength(fields);
    expect(knob("keys.radius")?.kind).toBe("number");
    expect(knob("keys.bold")?.kind).toBe("choice");
    expect(knob("pad.inkDark")?.kind).toBe("color");
  });

  it("values are read by the field itself", () => {
    expect(parseKnobValue(knob("keys.radius")!, "9")).toEqual({ value: 0.5 });
    expect(parseKnobValue(knob("keys.radius")!, "round")).toHaveProperty("error");
    expect(parseKnobValue(knob("keys.bold")!, "off")).toEqual({ value: "off" });
    expect(parseKnobValue(knob("keys.face")!, "auto")).toEqual({ value: "auto" });
    expect(parseKnobValue(knob("keys.face")!, "#FF0000")).toEqual({ value: "#ff0000" });
  });

  it("a tweak on a component field restyles the theme (tweaks → [keys])", async () => {
    const { applyTweaks } = await import("../src/core/theme");
    const base = new ThemeManager().default;
    const t = applyTweaks(base, { "keys.radius": 0, "keys.bold": "off" });
    expect(t.keys).toEqual({ radius: 0, bold: false });
  });

  it("completion: theme set <tab> lists the knobs and the fields; a field's values after it", async () => {
    expect(knobNames()).toEqual(expect.arrayContaining(["accent", "keys.radius", "keys.lip", "pad.size"]));
    expect(knobSuggestions("keys.bold")).toEqual(["on", "off"]);
    expect(knobSuggestions("keys.radius")).toContain("0");
    const { deckCommands } = await import("../src/shell/commands/deck");
    const complete = deckCommands.find((c) => c.name === "theme")!.complete as (a: string[]) => string[];
    expect(complete(["set"])).toContain("keys.radius");
    expect(complete(["set", "keys.bold"])).toEqual(["on", "off"]);
    expect(complete([])).toContain("tweak");
  });
});

describe("tokens: no raw colour in the widgets (themes v2, milestone 1)", () => {
  it("widgets name their colours (core/skin/tokens.ts) instead of writing a hex", async () => {
    const { readdirSync } = await import("node:fs");
    for (const f of readdirSync("src/widgets").filter((n) => n.endsWith(".ts"))) {
      const src = readFileSync(`src/widgets/${f}`, "utf8");
      const raw = (src.match(/0x[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{6}\b/g) ?? []).filter((h) => !/^(0x|#)(ffffff|000000)$/i.test(h));
      expect(raw, f).toEqual([]);
    }
  });
});

describe("icon ids (themes v2, milestone 1): same glyphs, asked by id", () => {
  it("file icons come from the registry and keep the 0.8 glyphs", async () => {
    const { fileIcon, fileIconId } = await import("../src/ui/fileicon");
    const { icon } = await import("../src/core/skin/icons");
    const was: Record<string, string> = { "a.py": "∿", "a.ts": "ʝ", "a.sh": "❯", "a.rs": "λ", "a.toml": "⚙", "a.csv": "▥", "a.html": "◇", "a.txt": "≡", "a.png": "▣", "a.pdf": "▤", "a.mp3": "♪", "a.mp4": "▶", "a.zip": "▦", "a.canvas": "◫", "a.xyz": "◦" };
    for (const [name, glyph] of Object.entries(was)) {
      expect(fileIcon(name), name).toBe(glyph);
      expect(icon(fileIconId(name))).toBe(glyph);
    }
    expect([icon("file.folder"), icon("file.note")]).toEqual(["▸", "≡"]);
  });
});
