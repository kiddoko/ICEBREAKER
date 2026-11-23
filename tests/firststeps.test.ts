import { describe, expect, it } from "vitest";
import { noteTitle } from "../src/shell/commands/deck";
import { emptiedNote } from "../src/apps/note";
import { pressCounts, stepSettled, STEP_SETTLE_MS } from "../src/apps/setup";

describe("the guide's first command (note new \"ideas\")", () => {
  it("reads `note new <title>` as `note <title>`", () => {
    expect(noteTitle(["new", "ideas"])).toBe("ideas");
    expect(noteTitle(["new", "gift", "ideas"])).toBe("gift ideas");
  });
  it("`note new` alone is an untitled note, other titles stay as typed", () => {
    expect(noteTitle(["new"])).toBe(null);
    expect(noteTitle(["ideas"])).toBe("ideas");
    expect(noteTitle(["renew", "x"])).toBe("renew x");
    expect(noteTitle([])).toBe("");
  });
});

describe("a note emptied by mistake", () => {
  it("is held back from the autosave when it had text", () => {
    expect(emptiedNote("", "# ideas\n\n- one\n")).toBe(true);
    expect(emptiedNote("  \n", "x")).toBe(true);
  });
  it("a note that was already empty, or still has text, saves as usual", () => {
    expect(emptiedNote("", "")).toBe(false);
    expect(emptiedNote("a", "abc")).toBe(false);
  });
});

describe("setup: ten enters in a row", () => {
  it("a question takes an answer only once it has shown for a moment", () => {
    expect(stepSettled(1000, 1100)).toBe(false);
    expect(stepSettled(1000, 1000 + STEP_SETTLE_MS - 1)).toBe(false);
    expect(stepSettled(1000, 1300)).toBe(true);
  });
});

describe("setup: a burst of enters answers exactly one question", () => {
  it("ten presses 60 ms apart after a question settled: one answer", () => {
    let stepAt = 0, earlyAt = -1e9, answered = 0;
    for (let i = 0; i < 10; i++) {
      const now = 1000 + i * 60;
      if (pressCounts(stepAt, earlyAt, now)) (answered++, (stepAt = now));
      else earlyAt = now;
    }
    expect(answered).toBe(1);
  });
  it("a deliberate press after a pause answers the next one", () => {
    expect(pressCounts(1000, 1100, 1400)).toBe(true);
  });
});
