import { describe, expect, it } from "vitest";
import { pageNamed } from "../src/shell/commands/ui";

// a deck with three pages: a module's (title with "(beta)"), a core app, and the note editor
const pages = [
  { kind: "breakermed", title: "BreakerMED (beta)" },
  { kind: "explorer", title: "NEXUS" },
  { kind: "note", title: "note" },
];
const deck = { apps: { get: (k: string) => pages.find((p) => p.kind === k), list: () => pages } } as never;

describe("open <name>: the page first (bench 0.8: `open breakermed` made an empty note)", () => {
  it("by id, by the tab's name (without « (beta) »), by its title, any case", () => {
    expect(pageNamed(deck, "breakermed")).toBe("breakermed");
    expect(pageNamed(deck, "BreakerMED")).toBe("breakermed");
    expect(pageNamed(deck, "nexus")).toBe("explorer");
  });
  it("no page by that name, or the note editor itself: none (open makes a note)", () => {
    expect(pageNamed(deck, "idees")).toBeUndefined();
    expect(pageNamed(deck, "note")).toBeUndefined();
    expect(pageNamed(deck, " ")).toBeUndefined();
  });
});

describe("open <name>: a note you have comes first, then a page, then a new note (bench 0.8)", async () => {
  const { deckCommands } = await import("../src/shell/commands/deck");
  const open = deckCommands.find((c) => c.name === "open")!;
  const run = async (typed: string, notes: string[]) => {
    const did: string[] = [];
    const ctx = {
      args: typed.split(" "),
      resolve: (p: string) => p,
      err: (s: string) => did.push(`err ${s}`),
      deck: {
        apps: { get: (k: string) => pages.find((p) => p.kind === k), list: () => pages },
        vault: { find: (p: string) => (notes.includes(p) ? { path: p } : undefined), isDir: () => false },
        openApp: (k: string) => did.push(`page ${k}`),
        openFile: async (p: string) => void did.push(`note ${p}`),
      },
    } as never;
    await open.run(ctx);
    return did;
  };
  it("todo.md exists: the note, not the page", async () => {
    pages.push({ kind: "todo", title: "TODO" });
    expect(await run("todo", ["todo.md"])).toEqual(["note todo.md"]);
    expect(await run("todo", [])).toEqual(["page todo"]);
    pages.pop();
  });
  it("no note, a page: the page; neither: a new note; a path: always a note", async () => {
    expect(await run("breakermed", [])).toEqual(["page breakermed"]);
    expect(await run("idees", [])).toEqual(["note idees.md"]);
    expect(await run("breakermed.md", [])).toEqual(["note breakermed.md"]);
  });
});
