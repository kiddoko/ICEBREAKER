import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FR } from "../src/core/i18n-fr";

/** the start-up: Deck.start() and the BIOS screen (the Windows bench saw it all in English on a French deck) */
const deck = readFileSync("src/deck.ts", "utf8");
const start = deck.slice(deck.indexOf("  async start(): Promise<void> {"), deck.indexOf("setInterval(() => this.checkIdle()"));
const bios = readFileSync("src/workspace/boot.ts", "utf8");

describe("the boot log speaks the deck's language", () => {
  it("no line of the boot log is a bare English text", () => {
    // `text: "Mounted…"` or `text: \`Sound…\`` — a line must go through t() (a leading `CPU0  ` is fine)
    const bare = [...start.matchAll(/\btext: ["`](?!CPU0 {2}|\$\{)[^"`]*/g)].map((m) => m[0].slice(0, 60));
    expect(bare).toEqual([]);
  });
  it("every text of the boot log has its French", () => {
    const keys = [...start.matchAll(/\bt\("((?:[^"\\]|\\.)+)"/g), ...bios.matchAll(/\btr\("((?:[^"\\]|\\.)+)"/g)].map((m) => JSON.parse(`"${m[1]}"`) as string);
    expect(keys.length).toBeGreaterThan(20);
    expect(keys.filter((k) => FR[k] === undefined)).toEqual([]);
  });
});
