import { describe, expect, it } from "vitest";
import { JournalApp } from "../src/apps/journal";
import type { Deck } from "../src/deck";
import { fakeDeck, settle } from "./dataloss-helpers";

const wait = async () => {
  for (let i = 0; i < 6; i++) await settle();
};

function journal() {
  const f = fakeDeck();
  const deck = { ...f.deck, settings: { data: { ...f.deck.settings.data, user: { locale: "en" } } } };
  return { ...f, deck };
}

describe("the journal writes a day only once you write in it", () => {
  it("looking at today and the days ahead creates no file", async () => {
    const { deck, vault } = journal();
    const today = new Date();
    const j = new JournalApp(deck as unknown as Deck, today);
    await wait();
    for (let i = 1; i <= 5; i++) {
      j.goto(new Date(today.getFullYear(), today.getMonth(), today.getDate() + i));
      await wait();
    }
    for (let i = 0; i <= 5; i++) expect(await vault.exists(vault.journalPath(new Date(today.getFullYear(), today.getMonth(), today.getDate() + i)))).toBe(false);
  });

  it("typing writes the day, with its template", async () => {
    const { deck, vault } = journal();
    const day = new Date(2099, 0, 2);
    const j = new JournalApp(deck as unknown as Deck, day);
    await wait();
    const note = (j as unknown as { note: { editor: { onText(s: string): void; text: string }; save(): Promise<void> } }).note;
    expect(note.editor.text).toContain("2099");
    note.editor.onText("hello");
    await note.save();
    const text = await vault.read(vault.journalPath(day));
    expect(text).toContain("hello");
    expect(text).toContain("2099");
  });
});
