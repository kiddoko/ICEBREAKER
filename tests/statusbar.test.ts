import { describe, expect, it } from "vitest";
import { moveStatusItem, STATUS_IDS, statusOrder } from "../src/workspace/statusbar";

describe("the status bar's order", () => {
  it("nothing saved: every item, the default order", () => {
    expect(statusOrder(undefined)).toEqual([...STATUS_IDS]);
    expect(statusOrder({ order: [], hidden: [] })).toEqual([...STATUS_IDS]);
  });
  it("yours first, unknown ids and doubles dropped, the others where they belong", () => {
    const o = statusOrder({ order: ["help", "nope", "help", "fx"], hidden: [] });
    expect(o.indexOf("help")).toBeLessThan(o.indexOf("fx"));
    expect(new Set(o).size).toBe(STATUS_IDS.length);
    // stealth (first by default) has no left neighbour placed: it goes first
    expect(o.indexOf("stealth")).toBe(0);
  });
  it("hidden ones are left out", () => {
    expect(statusOrder({ order: [], hidden: ["fx", "screensaver"] })).not.toContain("fx");
  });
  it("moving an item", () => {
    const o = ["a", "b", "c", "d"];
    expect(moveStatusItem(o, "a", 2)).toEqual(["b", "c", "a", "d"]);
    expect(moveStatusItem(o, "d", 0)).toEqual(["d", "a", "b", "c"]);
    expect(moveStatusItem(o, "x", 0)).toEqual(o);
  });
});
