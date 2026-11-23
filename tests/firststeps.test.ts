import { describe, expect, it } from "vitest";
import { noteTitle } from "../src/shell/commands/deck";
import { emptiedNote } from "../src/apps/note";
import { stepSettled, STEP_SETTLE_MS } from "../src/apps/setup";

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
