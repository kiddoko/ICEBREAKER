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
