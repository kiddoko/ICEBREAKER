import { COMPONENTS } from "./components";
import type { Field } from "./fields";
import { SKIN_SCHEMA } from "./schema";

/**
 * DOCS FROM THE REGISTRY (themes v2, milestone 2): the reference table in docs/THEMES.md and the
 * JSON Schema editors read (themes/schema-2.json) are written from the component declarations,
 * never by hand. `UPDATE_THEME_DOCS=1 npx vitest run tests/skindocs.test.ts` rewrites them;
 * the same test fails while they're out of date.
 */

export const DOCS_BEGIN = "<!-- generated: components (src/core/skin/docs.ts) -->";
export const DOCS_END = "<!-- end of generated -->";

const hexOf = (n: number) => `#${n.toString(16).padStart(6, "0")}`;

function bounds(f: Field): string {
  if (f.kind === "number") return `${f.min}–${f.max}${f.integer ? ", whole" : ""}`;
  if (f.kind === "bool") return "true / false";
  if (f.kind === "choice") return f.options.join(" · ");
  return f.default === null ? "#hex · palette name · auto" : "#hex · palette name";
}

function shown(f: Field): string {
  if (f.kind === "color") return f.default === null ? "auto" : hexOf(f.default);
  return String(f.default);
}

/** the markdown reference: one row per field, grouped by component */
export function referenceTable(): string {
  const rows = ["| component | field | what | values | the deck's own |", "|---|---|---|---|---|"];
  for (const comp of COMPONENTS) {
    let first = true;
    for (const [k, f] of Object.entries(comp.fields) as [string, Field][]) {
      rows.push(`| ${first ? `\`[${comp.id}]\`` : ""} | \`${k}\` | ${f.doc} | ${bounds(f)} | ${shown(f)} |`);
      first = false;
    }
  }
  return `${DOCS_BEGIN}\n${rows.join("\n")}\n${DOCS_END}`;
}

/** a JSON Schema (draft 2020-12) for the components' tables, for editors */
export function jsonSchema(): Record<string, unknown> {
  const color = { type: "string", pattern: "^(#[0-9a-fA-F]{3}|#[0-9a-fA-F]{6}|[A-Za-z0-9_-]+)$" };
  const properties: Record<string, unknown> = {
    meta: { type: "object", properties: { schema: { type: "integer", minimum: 1, maximum: SKIN_SCHEMA } } },
    frame: { type: "object", properties: { style: { type: "string" } } },
    widget_frame: { type: "object", properties: { style: { type: "string" } } },
    logo: { type: "object", properties: { text: { type: "string" } } },
  };
  for (const comp of COMPONENTS) {
    const props: Record<string, unknown> = {};
    for (const [k, f] of Object.entries(comp.fields) as [string, Field][]) {
      const base = { description: f.doc };
      if (f.kind === "number") props[k] = { ...base, type: f.integer ? "integer" : "number", minimum: f.min, maximum: f.max, default: f.default };
      else if (f.kind === "bool") props[k] = { ...base, type: "boolean", default: f.default };
      else if (f.kind === "choice") props[k] = { ...base, enum: [...f.options], default: f.default };
      else props[k] = { ...base, ...color, default: shown(f) };
    }
    properties[comp.id] = { type: "object", description: comp.doc, additionalProperties: false, properties: props };
  }
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: `ICEBREAKER theme (schema ${SKIN_SCHEMA})`,
    description: "Generated from src/core/skin — do not edit. The colour tables ([palette], [ui]…) are in docs/THEMES.md.",
    type: "object",
    properties,
  };
}
