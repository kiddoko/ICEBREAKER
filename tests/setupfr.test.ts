import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FR } from "../src/core/i18n-fr";

/** names and examples that stay as they are in every language */
const AS_IS = new Set(["Français", "English (UK)", "English (US)", "Claude Code", "Ollama", "Paris", "/Volumes/nas/icebreaker"]);

describe("the setup speaks French", () => {
  it("every question, choice and hint of the setup has its French (an English text changed without its translation stayed English)", () => {
    const src = readFileSync("src/apps/setup.ts", "utf8");
    const missing: string[] = [];
    for (const m of src.matchAll(/\b(?:question|label|hint|title|placeholder): "((?:[^"\\]|\\.)+)"/g)) {
      const text = JSON.parse(`"${m[1]}"`) as string;
      if (!/[a-z]{3}/i.test(text) || AS_IS.has(text)) continue;
      if (FR[text] === undefined) missing.push(text.slice(0, 70));
    }
    expect(missing).toEqual([]);
  });
});
