import { describe, expect, it } from "vitest";
import { NoteApp, lineEnding, toLf, withEol } from "../src/apps/note";
import type { Deck } from "../src/deck";
import { fakeDeck, settle } from "./dataloss-helpers";

const CRLF = "# title\r\nfirst line\r\nsecond line\r\n";

async function openCrlf() {
  const f = fakeDeck();
  await f.vault.rescan();
  await f.platform.vault.write("win.md", CRLF);
  await f.vault.rescan();
  const note = new NoteApp(f.deck as unknown as Deck, "win.md");
  await settle();
  await settle();
  return { ...f, note };
}

describe("a note written on Windows (CRLF)", () => {
  it("line ends: detected, normalised, written back", () => {
    expect(lineEnding(CRLF)).toBe("\r\n");
    expect(lineEnding("a\nb")).toBe("\n");
    expect(toLf(CRLF)).toBe("# title\nfirst line\nsecond line\n");
    expect(withEol("a\nb", "\r\n")).toBe("a\r\nb");
    expect(withEol("a\nb", "\n")).toBe("a\nb");
  });

  it("opens clean: not dirty, no « changed on disk »", async () => {
    const { note, vault } = await openCrlf();
    expect(note.dirty()).toBe(false);
    await vault.rescan(); // the watcher's rescan
    await settle();
    expect(note.status()).not.toContain("changed on disk");
  });

  it("typing saves, keeping the file's CRLF, with no false conflict", async () => {
    const { note, platform } = await openCrlf();
    note.editor.cursor = { line: 1, col: 0 };
    note.editor.onText("x");
    expect(note.dirty()).toBe(true);
    await note.save();
    expect(note.status()).not.toContain("changed on disk");
    expect(note.dirty()).toBe(false);
    expect(await platform.vault.read("win.md")).toBe("# title\r\nxfirst line\r\nsecond line\r\n");
  });

  it("a real change on disk is still seen as one", async () => {
    const { note, platform, vault } = await openCrlf();
    note.editor.onText("x");
    await platform.vault.write("win.md", "someone else\r\n");
    await vault.rescan();
    await settle();
    await settle();
    expect(note.status()).toContain("changed on disk");
  });
});

describe("closing a note that can't be saved", () => {
  it("asks first, and keeps the tab when you say no", async () => {
    const { note, platform, vault, asked } = await openCrlf();
    note.editor.onText("mine");
    await platform.vault.write("win.md", "theirs\r\n");
    await vault.rescan();
    await settle();
    await settle();
    expect(await note.close()).toBe(false);
    expect(asked.length).toBe(1);
    expect(await platform.vault.read("win.md")).toBe("theirs\r\n");
  });

  it("closes with no question when everything is saved", async () => {
    const { note, asked } = await openCrlf();
    expect(await note.close()).toBe(true);
    expect(asked.length).toBe(0);
  });
});
