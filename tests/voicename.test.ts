import { describe, expect, it } from "vitest";
import { DeckVoice } from "../src/core/voice";
import type { Deck } from "../src/deck";

describe("a voice this computer doesn't have (core/voice.ts)", () => {
  it("the default voice speaks, and it's said once (Windows bench 24/11)", async () => {
    const told: string[] = [];
    const deck = {
      settings: { data: { voice: { name: "Nobody Here", engine: "system", language: "en" } } },
      platform: { voice: { info: async () => ({ system: "sapi", piper: false, piper_voices: [] }), list: async () => [{ id: "Microsoft Zira Desktop", lang: "en-US" }] } },
      notify: (text: string) => told.push(text),
    } as unknown as Deck;
    const v = new DeckVoice(deck);
    expect(await v.resolve()).toEqual({ engine: "system", voice: "Microsoft Zira Desktop" });
    await v.resolve();
    expect(told.length).toBe(1);
    expect(told[0]).toContain("Nobody Here");
    expect(told[0]).toContain("voice list");
  });
});
