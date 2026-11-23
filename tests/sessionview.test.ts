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
