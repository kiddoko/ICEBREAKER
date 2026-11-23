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

import { SetupApp } from "../src/apps/setup";
import { DEFAULT_SETTINGS } from "../src/core/settings";
import { LANGS } from "../src/core/i18n";
import type { Deck } from "../src/deck";

/** a deck just good enough to build the setup (anything else it asks for: an empty answer) */
function fakeDeck(language: "en" | "fr"): Deck {
  const data = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
  data.user.language = language;
  const empty: ProxyHandler<object> = { get: (_t, k) => (k === Symbol.toPrimitive ? () => "" : new Proxy(() => undefined, empty)), apply: () => undefined };
  const base = { settings: { data, set: () => {} }, account: "test2", vault: { root: "/v" }, platform: {}, themes: { list: () => [], get: () => undefined }, commands: { get: () => undefined } };
  return new Proxy(base, { get: (t, k) => (k in t ? (t as Record<string | symbol, unknown>)[k] : new Proxy(() => undefined, empty)) }) as unknown as Deck;
}

describe("the setup, run again on a French deck", () => {
  it("the first question has Français chosen, not English (enter switched the deck to English)", () => {
    const app = new SetupApp(fakeDeck("fr")) as unknown as { sel: number };
    expect(app.sel).toBe(LANGS.findIndex((l) => l.id === "fr"));
  });
  it("an English deck: English", () => {
    const app = new SetupApp(fakeDeck("en")) as unknown as { sel: number };
    expect(app.sel).toBe(LANGS.findIndex((l) => l.id === "en"));
  });
});
