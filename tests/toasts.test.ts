import { describe, expect, it } from "vitest";
import { Toasts } from "../src/workspace/overlays";

describe("notifications", () => {
  it("the same message twice in a row is one toast (a double click gave two)", () => {
    const t = new Toasts();
    t.push("choose a .csv file", "warning");
    t.push("choose a .csv file", "warning");
    expect(t.count).toBe(1);
    t.push("another one");
    expect(t.count).toBe(2);
  });
});
