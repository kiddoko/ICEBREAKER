// A deck small enough for a note, the journal or the vault to run in a test: the browser's
// in-memory vault (platform/web.ts) behind the real Vault, and what NoteApp asks of the deck.
import { createWebPlatform } from "../src/platform/web";
import { Vault } from "../src/vault/vault";

export function fakeDeck(opts: { confirm?: boolean } = {}) {
  const platform = createWebPlatform();
  const vault = new Vault(platform.vault);
  const notes: string[] = [];
  const asked: string[] = [];
  const deck = {
    vault,
    platform,
    settings: { data: { appearance: { lineNumbers: false }, editor: { tabSize: 2, autosave: true }, favorites: [] } },
    notify: (text: string) => void notes.push(text),
    requestFrame: () => {},
    confirm: async (title: string) => (asked.push(title), opts.confirm ?? false),
    openFile: async () => {},
  };
  return { deck, vault, platform, notes, asked };
}

/** Lets the note's loads and saves (promises) finish. */
export const settle = () => new Promise((r) => setTimeout(r, 0));
