import { describe, expect, it } from "vitest";
import { NoteApp } from "../src/apps/note";
import type { Deck } from "../src/deck";
import { Workspace } from "../src/workspace/workspace";
import { fakeDeck, settle } from "./dataloss-helpers";

async function open(path: string, text: string) {
  const f = fakeDeck();
  await f.platform.vault.write(path, text);
  await f.vault.rescan();
  const note = new NoteApp(f.deck as unknown as Deck, path);
  await settle();
  await settle();
  return { ...f, note };
}

/** Workspace.follow on just the state it touches */
function follow(tabs: NoteApp[], from: string, to: string, extra: { places?: Record<string, string>; visited?: string[] } = {}) {
  const ws = { tabs, groups: [], places: extra.places ?? {}, shows: {}, visited: extra.visited ?? [], deck: { requestFrame: () => {} } };
  Workspace.prototype.follow.call(ws as unknown as Workspace, from, to);
  return ws;
}

describe("an open note renamed or moved", () => {
  it("follows its file: path, title, key, and the next save goes there", async () => {
    const { note, vault, platform } = await open("ta/old.md", "hello");
    await platform.vault.rename("ta/old.md", "tb/new.md");
    const ws = follow([note], "ta/old.md", "tb/new.md", { visited: ["note:ta/old.md"] });
    expect(note.path).toBe("tb/new.md");
    expect(note.key).toBe("note:tb/new.md");
    expect(note.title()).toBe("new");
    expect(ws.visited).toEqual(["note:tb/new.md"]);
    await vault.rescan();
    note.editor.onText("x");
    await note.save();
    expect(await platform.vault.exists("ta/old.md")).toBe(false);
    expect(await platform.vault.read("tb/new.md")).toBe("xhello");
  });

  it("a folder moved: every note open from it follows", async () => {
    const { note } = await open("ta/sub/n.md", "a");
    follow([note], "ta", "tc");
    expect(note.path).toBe("tc/sub/n.md");
  });

  it("other notes stay where they are (a name that only starts the same)", async () => {
    const { note } = await open("tab/n.md", "a");
    follow([note], "ta", "tc");
    expect(note.path).toBe("tab/n.md");
  });
});
