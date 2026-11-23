import { describe, expect, it } from "vitest";
import { fileNameOf, pickFileBytes } from "../src/workspace/filebrowser";
import type { Deck } from "../src/deck";

describe("a module imports a file the user chooses (ib.ui.pickFileBytes)", () => {
  it("its name, whatever the system writes paths with", () => {
    expect(fileNameOf("/Users/neo/Music/kick.wav")).toBe("kick.wav");
    expect(fileNameOf("C:\\Users\\neo\\snare.flac")).toBe("snare.flac");
  });
  it("in a browser (no computer files): nothing, and it says so", async () => {
    const said: string[] = [];
    const deck = { platform: {}, notify: (s: string) => void said.push(s) } as unknown as Deck;
    expect(await pickFileBytes(deck, "a sound", ["wav"])).toBeNull();
    expect(said.length).toBe(1);
  });
});
