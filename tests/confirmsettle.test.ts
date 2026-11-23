import { afterEach, describe, expect, it } from "vitest";
import { ConfirmDialog } from "../src/workspace/overlays";
import type { KeyInput } from "../src/core/input";

const key = (k: string, repeat = false): KeyInput => ({ key: k, code: "", ctrl: false, alt: false, shift: false, meta: false, combo: k, repeat });

describe("a yes / no question right after another step (a file chosen with enter)", () => {
  let now = 1000;
  const real = ConfirmDialog.clock;
  afterEach(() => (ConfirmDialog.clock = real));
  it("the enter that chose the file never answers the question that follows", () => {
    ConfirmDialog.clock = () => now;
    let answer: boolean | null = null;
    const d = new ConfirmDialog("Import 2 events?", "", (ok) => (answer = ok));
    d.onKey(key("enter"));
    d.onAction("confirm");
    expect(answer).toBe(null);
    now += 300;
    d.onKey(key("enter", true)); // held down: still not an answer
    expect(answer).toBe(null);
    d.onKey(key("enter"));
    expect(answer).toBe(true);
  });
});

describe("a yes / no question that pops up while you type", () => {
  const real = ConfirmDialog.clock;
  afterEach(() => (ConfirmDialog.clock = real));
  it("keys typed less than 250 ms apart never answer; one after a pause does", () => {
    let now = 1000;
    ConfirmDialog.clock = () => now;
    let answer: boolean | null = null;
    const d = new ConfirmDialog("Remove it?", "", (ok) => (answer = ok));
    for (const dt of [100, 200, 200]) {
      now += dt;
      d.onText("o");
    }
    expect(answer).toBe(null);
    now += 300;
    d.onText("o");
    expect(answer).toBe(true);
  });
  it("a click right after it appears doesn't answer (it was meant for the page behind)", () => {
    let now = 1000;
    ConfirmDialog.clock = () => now;
    let answer: boolean | null = null;
    const d = new ConfirmDialog("Remove it?", "", (ok) => (answer = ok));
    now += 100;
    d.click(true);
    expect(answer).toBe(null);
    now += 300;
    d.click(true);
    expect(answer).toBe(true);
  });
});
