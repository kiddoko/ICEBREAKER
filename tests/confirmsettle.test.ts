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
