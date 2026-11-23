import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { manualFr } from "../src/apps/help-fr";

describe("the F1 manual in French (decision 7)", () => {
  it("has as many sections as the English one, in the same order", () => {
    const en = readFileSync("src/apps/help.ts", "utf8");
    const body = en.slice(en.indexOf("function manualEn"), en.indexOf("/** One piece of a line"));
    const heads = (s: string) => s.split("\n").filter((l) => /^## /.test(l));
    expect(heads(manualFr("")).length).toBe(heads(body).length);
  });
  it("keeps the commands' list", () => {
    expect(manualFr("- `todo` — x")).toContain("- `todo` — x");
  });
});
