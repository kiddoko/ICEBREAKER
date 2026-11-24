import { describe, expect, it } from "vitest";
import { isDocument } from "../src/workspace/tabstrip";

const app = (kind: string, key = kind, dirty = false) => ({ kind, key, title: () => kind, render() {}, ...(dirty ? { dirty: () => false } : {}) }) as never;

describe("two families of tabs: pages, then documents (0.8)", () => {
  it("notes, the journal, a module's file and anything that can be unsaved are documents", () => {
    expect(isDocument(app("note", "note:ideas.md"))).toBe(true);
    expect(isDocument(app("journal"))).toBe(true);
    expect(isDocument(app("breakermed", "breakermed:songs/intro.med"))).toBe(true);
    expect(isDocument(app("draw", "draw", true))).toBe(true);
  });
  it("the deck's pages are not", () => {
    for (const k of ["home", "explorer", "sysmon", "habits", "settings", "breakermed"]) expect(isDocument(app(k)), k).toBe(false);
    expect(isDocument(undefined)).toBe(false);
  });
});
