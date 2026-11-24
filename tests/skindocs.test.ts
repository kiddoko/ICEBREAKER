import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DOCS_BEGIN, DOCS_END, jsonSchema, referenceTable } from "../src/core/skin/docs";

/** docs/THEMES.md's component table and themes/schema-2.json are generated (UPDATE_THEME_DOCS=1 rewrites them) */
const DOC = "docs/THEMES.md", SCHEMA = "themes/schema-2.json";
// Windows checkouts may turn \n into \r\n: compare without them
const read = (f: string) => readFileSync(f, "utf8").replace(/\r\n/g, "\n");
const schemaText = `${JSON.stringify(jsonSchema(), null, 2)}\n`;

if (process.env.UPDATE_THEME_DOCS) {
  const doc = readFileSync(DOC, "utf8");
  const a = doc.indexOf(DOCS_BEGIN), b = doc.indexOf(DOCS_END);
  if (a < 0 || b < 0) throw new Error(`${DOC}: put ${DOCS_BEGIN} … ${DOCS_END} where the table goes`);
  writeFileSync(DOC, doc.slice(0, a) + referenceTable() + doc.slice(b + DOCS_END.length));
  writeFileSync(SCHEMA, schemaText);
}

describe("theme docs generated from the skin registry", () => {
  it("THEMES.md's component table is up to date (UPDATE_THEME_DOCS=1 npx vitest run tests/skindocs.test.ts)", () => {
    expect(read(DOC)).toContain(referenceTable());
  });
  it("themes/schema-2.json is up to date", () => {
    expect(existsSync(SCHEMA) && read(SCHEMA)).toBe(schemaText);
  });
});
