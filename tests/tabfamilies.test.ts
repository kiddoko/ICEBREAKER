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

describe("the tabs are kept in the strip's order: ⌘1…9 and tab move count what you see (0.8.1)", async () => {
  const { Workspace } = await import("../src/workspace/workspace");
  const make = (kinds: string[], active: number) => {
    const ws = Object.create(Workspace.prototype) as InstanceType<typeof Workspace>;
    Object.assign(ws, { tabs: kinds.map((k) => app(k, k === "note" ? `note:${Math.random()}.md` : k)), active, deck: { requestFrame() {} } });
    return ws;
  };
  const kinds = (ws: { tabs: { kind: string }[] }) => ws.tabs.map((a) => a.kind);
  it("a page opened after the documents goes before them; the tab shown stays shown", () => {
    const ws = make(["home", "note", "sysmon", "journal", "settings"], 2);
    ws.orderFamilies();
    expect(kinds(ws)).toEqual(["home", "sysmon", "settings", "note", "journal"]);
    expect(ws.tabs[ws.active].kind).toBe("sysmon");
  });
  it("tab move keeps a tab in its family", () => {
    const ws = make(["home", "sysmon", "settings", "note", "journal"], 0);
    // a document dragged to the front stops at the first document's place
    expect(ws.moveTab(4, 1)).toBe(true);
    expect(kinds(ws)).toEqual(["home", "sysmon", "settings", "journal", "note"]);
    // a page dragged to the end stops at the last page's place
    expect(ws.moveTab(1, 4)).toBe(true);
    expect(kinds(ws)).toEqual(["home", "settings", "sysmon", "journal", "note"]);
  });
});
