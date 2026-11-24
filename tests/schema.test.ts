import { readdirSync, readFileSync } from "node:fs";
import { parse, stringify } from "smol-toml";
import { describe, expect, it } from "vitest";
import { newerSchemaNotice, schemaOf, SKIN_SCHEMA, upgrade1to2 } from "../src/core/skin/schema";
import { parseTheme, ThemeManager } from "../src/core/theme";

const builtins = readdirSync("themes").filter((f) => f.endsWith(".toml")).map((f) => ({ name: f.replace(".toml", ""), src: readFileSync(`themes/${f}`, "utf8") }));
const nightshade = builtins.find((b) => b.name === "nightshade")!;

describe("theme schema 2 (themes v2, milestone 2)", () => {
  it("upgrade1to2 moves border, widget_frame and the logo into their components", () => {
    const v2 = upgrade1to2({ meta: { name: "x", border: "heavy", widget_frame: "dashed" }, ascii: { logo: "HI" } });
    expect(v2).toEqual({ meta: { name: "x", schema: 2 }, frame: { style: "heavy" }, widget_frame: { style: "dashed" }, logo: { text: "HI" } });
    expect(schemaOf(v2)).toBe(2);
    expect(upgrade1to2(v2)).toBe(v2); // already 2: as it is
  });

  it("upgrade1to2 never changes the document it's given", () => {
    const v1 = parse(nightshade.src) as Record<string, unknown>;
    const copy = structuredClone(v1);
    upgrade1to2(v1);
    expect(v1).toEqual(copy);
  });

  it("golden: every built-in theme loads the same from its v1 file and from its v2 conversion", () => {
    const base1 = parseTheme(nightshade.src, null, "builtin");
    const toV2 = (src: string) => stringify(upgrade1to2(parse(src) as Record<string, unknown>));
    const base2 = parseTheme(toV2(nightshade.src), null, "builtin");
    expect(builtins).toHaveLength(11);
    for (const b of builtins) {
      const v1 = b === nightshade ? base1 : parseTheme(b.src, base1, "builtin");
      const v2 = b === nightshade ? base2 : parseTheme(toV2(b.src), base2, "builtin");
      expect(v2.schema, b.name).toBe(2);
      const { schema: _, ...rest } = v2;
      expect(rest, b.name).toEqual(v1);
    }
  });

  it("the built-in files are still schema 1 (converted in memory; the files move in a later PR)", () => {
    for (const th of new ThemeManager().list()) expect(th.schema, th.name).toBeUndefined();
  });

  it("a file made for a newer deck loads what it understands, with a notice", () => {
    expect(newerSchemaNotice({ meta: { schema: SKIN_SCHEMA + 1 } })).toMatch(/newer ICEBREAKER/);
    expect(newerSchemaNotice({ meta: { schema: SKIN_SCHEMA } })).toBeNull();
    const t = parseTheme(`[meta]\nname = "future"\nschema = 9\n[frame]\nstyle = "double"\n[sparkles]\nlots = true`, parseTheme(nightshade.src, null, "builtin"), "vault");
    expect(t.border).toBe("double");
    expect(t.skinProblems?.[0].key).toBe("meta.schema");
  });

  it("a v2 file's [frame] style wins over a v1 [meta] border", () => {
    const t = parseTheme(`[meta]\nname = "both"\nborder = "single"\n[frame]\nstyle = "heavy"`, parseTheme(nightshade.src, null, "builtin"), "vault");
    expect(t.border).toBe("heavy");
  });
});

describe("theme check", () => {
  it("every built-in theme passes", async () => {
    const { checkTheme } = await import("../src/core/skin/check");
    for (const th of new ThemeManager().list()) {
      const r = checkTheme(th);
      expect(r.ok, `${th.name}: ${r.lines.join(" / ")}`).toBe(true);
      expect(r.lines[0]).toContain("schema 1");
    }
  });
  it("says what a theme file got wrong", async () => {
    const { checkTheme } = await import("../src/core/skin/check");
    const t = parseTheme(`[meta]\nname = "bad"\n[keys]\nradius = "round"\nface = "#e0e0e0"`, parseTheme(nightshade.src, null, "builtin"), "vault");
    const r = checkTheme(t);
    expect(r.ok).toBe(false);
    expect(r.lines.join("\n")).toMatch(/keys\.radius[\s\S]*keys\.face/);
  });
});
