import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/** Fable J4: the docs keep up with what modules can use. */
describe("docs/PLUGINS.md names everything a module can use", () => {
  const doc = readFileSync("docs/PLUGINS.md", "utf8");
  it("every export of ib.lib (src/plugins/lib.ts)", () => {
    const lib = readFileSync("src/plugins/lib.ts", "utf8");
    const names = [...lib.matchAll(/^export \{([^}]+)\}/gm)].flatMap((m) => m[1].split(",").map((x) => x.trim()).filter((x) => x && !x.startsWith("type ")));
    names.push(...[...lib.matchAll(/^export \* as (\w+)/gm)].map((m) => m[1]));
    const missing = names.filter((n) => !doc.includes(`\`${n}\``));
    expect(missing, `add to docs/PLUGINS.md: ${missing.join(", ")}`).toEqual([]);
  });
  it("every member of ib.ui (src/plugins/api.ts)", () => {
    const api = readFileSync("src/plugins/api.ts", "utf8");
    const block = api.slice(api.indexOf("  ui: {"), api.indexOf("\n  };", api.indexOf("  ui: {")));
    const names = [...block.matchAll(/^ {4}(\w+)\??[(:]/gm)].map((m) => m[1]);
    expect(names.length).toBeGreaterThan(5);
    const missing = names.filter((n) => !doc.includes(n));
    expect(missing, `add to docs/PLUGINS.md: ${missing.join(", ")}`).toEqual([]);
  });
});
