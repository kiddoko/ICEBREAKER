import { describe, expect, it } from "vitest";
import { compareVersions, dependents, describeNeeds, satisfies, unmet, wakeOrder } from "../src/plugins/deps";

describe("module requirements (plugin.json requires)", () => {
  it("versions compare by number", () => {
    expect(compareVersions("0.10.0", "0.9.9")).toBeGreaterThan(0);
    expect(compareVersions("1.2", "1.2.0")).toBe(0);
    expect(satisfies("0.4.1", ">=0.4.0")).toBe(true);
    expect(satisfies("0.3.9", ">=0.4.0")).toBe(false);
    expect(satisfies("2.0.0", "*")).toBe(true);
    expect(satisfies("1.0.0", "1.0.0")).toBe(true);
  });

  it("what's missing, too old or off", () => {
    const there = new Map([
      ["todo", { version: "0.1.0", active: true }],
      ["stats", { version: "0.1.0", active: false }],
      ["cal", { version: "0.1.0", active: true }],
    ]);
    const needs = unmet({ todo: "*", stats: "*", cal: ">=0.2.0", music: "*", icebreaker: ">=9.0.0" }, there, "0.4.0");
    expect(needs.map((n) => `${n.id}:${n.problem}`)).toEqual(["stats:off", "cal:old", "music:missing", "icebreaker:old"]);
    expect(describeNeeds(needs)).toContain("music (not installed)");
    expect(unmet({ todo: "*" }, there, "0.4.0")).toEqual([]);
  });

  it("modules wake up after what they need, and a cycle doesn't hang", () => {
    const req: Record<string, Record<string, string>> = { a: { b: "*" }, b: { c: "*" }, c: {}, x: { y: "*" }, y: { x: "*" } };
    const order = wakeOrder(["a", "b", "c", "x", "y"], (id) => req[id]);
    expect(order.indexOf("c")).toBeLessThan(order.indexOf("b"));
    expect(order.indexOf("b")).toBeLessThan(order.indexOf("a"));
    expect(order).toHaveLength(5);
  });

  it("who needs a module, also through another", () => {
    const req: Record<string, Record<string, string>> = { a: { b: "*" }, b: { c: "*" }, d: {} };
    expect(dependents("c", ["a", "b", "c", "d"], (id) => req[id])).toEqual(["b", "a"]);
    expect(dependents("d", ["a", "b", "d"], (id) => req[id])).toEqual([]);
  });
});
