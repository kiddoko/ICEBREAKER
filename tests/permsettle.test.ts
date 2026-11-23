import { describe, expect, it } from "vitest";
import { PermissionDialog, SETTLE_MS } from "../src/workspace/permdialog";
import type { KeyInput } from "../src/core/input";

const key = (k: string): KeyInput => ({ key: k, code: "", ctrl: false, alt: false, shift: false, meta: false, combo: k });
const spec = { buttons: [{ label: "[N]o", value: "no", key: "n" }, { label: "[T]his time", value: "once", key: "t" }], selected: 1 };

describe("a permission question that pops up while you type", () => {
  it("swallows the keys typed right after it appears — and while you keep typing", () => {
    let now = 1000;
    let answer = "";
    const d = new PermissionDialog(spec, (v) => (answer = v), () => now);
    d.onText("n"); // typed a split second after it appeared (it was meant for the page)
    now += 200;
    d.onKey(key("enter"));
    now += SETTLE_MS - 50; // still typing: each key pushes the wait further
    d.onText("n");
    expect(answer).toBe("");
    expect(d.done).toBe(false);
  });
  it("answers a deliberate key once you've stopped", () => {
    let now = 1000;
    let answer = "";
    const d = new PermissionDialog(spec, (v) => (answer = v), () => now);
    d.onText("x");
    now += SETTLE_MS + 10;
    d.onText("n");
    expect(answer).toBe("no");
  });
  it("a click answers at once (the mouse never types by accident)", () => {
    let answer = "";
    const d = new PermissionDialog(spec, (v) => (answer = v), () => 1000);
    d.choose(0);
    expect(answer).toBe("no");
  });
});
