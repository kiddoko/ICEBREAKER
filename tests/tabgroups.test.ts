import { describe, expect, it } from "vitest";
import { groupOf, joinGroup, parseGroups, pick, prune, renameGroup, stripEntries, takeOut, type TabGroup } from "../src/workspace/tabgroups";

describe("tab groups", () => {
  const keys = ["home", "note:a.md", "note:b.md", "weather", "note:c.md"];
  it("dropping a tab on another makes a group of the two; more join it", () => {
    let g: TabGroup[] = joinGroup([], "note:a.md", "note:b.md", "research");
    expect(g).toHaveLength(1);
    expect(g[0]).toMatchObject({ name: "research", keys: ["note:a.md", "note:b.md"], active: "note:b.md" });
    g = joinGroup(g, "note:b.md", "note:c.md");
    expect(g[0].keys).toEqual(["note:a.md", "note:b.md", "note:c.md"]);
    expect(groupOf(g, "note:c.md")?.id).toBe(g[0].id);
  });
  it("a tab moving to another group leaves the first; a group of one dissolves", () => {
    let g = joinGroup([], "note:a.md", "note:b.md");
    g = joinGroup(g, "home", "weather");
    g = joinGroup(g, "home", "note:b.md");
    expect(g.map((x) => x.keys)).toEqual([["home", "weather", "note:b.md"]]);
  });
  it("taking a tab out, renaming, picking", () => {
    let g = joinGroup(joinGroup([], "note:a.md", "note:b.md"), "note:a.md", "note:c.md");
    g = takeOut(g, "note:c.md");
    expect(g[0].keys).toEqual(["note:a.md", "note:b.md"]);
    expect(g[0].active).toBe("note:a.md"); // the shown one left: the first one shows
    g = renameGroup(g, "note:a.md", "  notes  ");
    expect(g[0].name).toBe("notes");
    g = pick(g, "note:a.md");
    expect(g[0].active).toBe("note:a.md");
    expect(takeOut(g, "note:a.md")).toEqual([]);
  });
  it("closed tabs leave their groups (prune), unchanged groups stay the same object", () => {
    const g = joinGroup(joinGroup([], "note:a.md", "note:b.md"), "note:a.md", "note:c.md");
    expect(prune(g, keys)).toBe(g);
    expect(prune(g, ["home", "note:a.md"])).toEqual([]);
    expect(prune(g, ["note:a.md", "note:c.md"])[0].keys).toEqual(["note:a.md", "note:c.md"]);
  });
  it("the strip: each group once, at its first tab's place", () => {
    const g = joinGroup([], "note:a.md", "note:c.md");
    const s = stripEntries(g, keys);
    expect(s.map((e) => (e.kind === "tab" ? e.index : `g${e.indexes.join("")}`))).toEqual([0, "g14", 2, 3]);
  });
  it("saved groups are checked", () => {
    expect(parseGroups(null)).toEqual([]);
    expect(parseGroups([{ id: "g1", name: "x", keys: ["a"] }])).toEqual([]);
    // one group per id (a second with the same id hid its tabs)
    expect(parseGroups([{ id: "g1", name: "x", keys: ["a", "b"] }, { id: "g1", name: "y", keys: ["c", "d"] }]).map((g) => g.name)).toEqual(["x"]);
    expect(parseGroups([{ id: "g1", name: "x", keys: ["a", "b"], active: "zz" }])).toEqual([{ id: "g1", name: "x", keys: ["a", "b"], active: "a" }]);
    // a key in two groups: only the first keeps it
    expect(parseGroups([{ id: "g1", name: "", keys: ["a", "b"] }, { id: "g2", name: "", keys: ["b", "c"] }])).toHaveLength(1);
  });
});
