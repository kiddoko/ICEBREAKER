import { describe, expect, it } from "vitest";
import { isTerminalKey, parseView, renameKeys } from "../src/workspace/sessionview";

describe("the saved desktop view (relaunch = as you left it)", () => {
  it("reads back everything that was saved", () => {
    const v = parseView({ tree: false, shell: false, ratio: 0.42, shellTab: "term", terms: 3, page: "settings", focus: "shell" });
    expect(v).toEqual({ tree: false, shell: false, ratio: 0.42, shellTab: "term", terms: 3, page: "settings", focus: "shell" });
  });

  it("nothing saved yet: nothing to put back", () => {
    expect(parseView(undefined)).toBeNull();
    expect(parseView([])).toBeNull();
  });

  it("odd values fall back to the defaults, never break the start", () => {
    const v = parseView({ tree: "no", ratio: 9, shellTab: "rm -rf", terms: -4, page: 3, focus: "nowhere" })!;
    expect(v.tree).toBe(true);
    expect(v.ratio).toBe(0.8);
    expect(v.shellTab).toBe("ibsh");
    expect(v.terms).toBe(0);
    expect(v.page).toBeUndefined();
    expect(v.focus).toBe("main");
    expect(parseView({ ratio: Number.NaN })!.ratio).toBe(0);
  });

  it("knows a terminal tab's key", () => {
    expect(isTerminalKey("terminal:4")).toBe(true);
    expect(isTerminalKey("note:terminal:4.md")).toBe(false);
    expect(isTerminalKey("ibsh")).toBe(false);
  });

  it("a terminal reopened under a new key keeps its group and its frame", () => {
    const ses = {
      groups: [{ id: "g1", name: "work", keys: ["note:a.md", "terminal:2"], active: "terminal:2" }],
      places: { "terminal:2": "panel", "note:b.md": "shell" },
      shows: { panel: "terminal:2", shell: "note:b.md" },
    };
    const out = renameKeys(ses, { "terminal:2": "terminal:7" });
    expect(out.groups).toEqual([{ id: "g1", name: "work", keys: ["note:a.md", "terminal:7"], active: "terminal:7" }]);
    expect(out.places).toEqual({ "terminal:7": "panel", "note:b.md": "shell" });
    expect(out.shows).toEqual({ panel: "terminal:7", shell: "note:b.md" });
  });

  it("leaves junk as it is (parsed and dropped later)", () => {
    expect(renameKeys({ groups: "x", places: [1], shows: null }, {})).toEqual({ groups: "x", places: [1], shows: null });
  });
});

describe("the shell panel's tabs come back after a relaunch (0.7.2: ibsh and your shells, mixed)", () => {
  it("each tab: its kind, its shell, the name you gave it, an ibsh's folder; and the one shown", () => {
    const v = parseView({ shellTab: "ibsh", terms: 1, shellTabs: [{ kind: "term", shell: "bash", name: "build" }, { kind: "ibsh" }, { kind: "ibsh", name: "notes", cwd: "/notes" }], shellAt: 2 });
    expect(v?.shellTabs).toEqual([{ kind: "term", shell: "bash", name: "build" }, { kind: "ibsh" }, { kind: "ibsh", name: "notes", cwd: "/notes" }]);
    expect(v?.shellAt).toBe(2);
  });
  it("anything odd is dropped, a 0.7.1 view (terms: n) still reads", () => {
    const v = parseView({ shellTabs: [{ kind: "rm -rf" }, { kind: "term", shell: 42, name: "x".repeat(200) }, null], shellAt: -3, terms: 2 });
    expect(v?.shellTabs).toEqual([{ kind: "term" }]);
    expect(v?.shellAt).toBe(0);
    expect(parseView({ terms: 2 })?.shellTabs).toBeUndefined();
  });
});
