import { describe, expect, it } from "vitest";
import { guardedDeck, realDeck } from "../src/shell/origin";
import type { Deck } from "../src/deck";

describe("the real deck behind a guarded one", () => {
  it("is the same object, so what's kept per deck (the alarm clock) is kept once", () => {
    const deck = { vault: {}, shell: {}, act: () => 0 } as unknown as Deck;
    const guarded = guardedDeck(deck, { source: "mod", grants: new Set() }, async () => 0, { on: true });
    expect(guarded).not.toBe(deck);
    expect(realDeck(guarded)).toBe(deck);
    expect(realDeck(deck)).toBe(deck);
  });
});
