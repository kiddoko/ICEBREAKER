import { describe, expect, it } from "vitest";
import { inOrder } from "../src/platform/inorder";
import { parseFlags } from "../src/shell/parser";

describe("the bridge's chunks reach the native side in order", () => {
  it("each call waits for the one before, even when that one is slower", async () => {
    const got: string[] = [];
    // the first rows take longer to answer than the later ones (what Windows did)
    const slow = [30, 5, 20, 1, 0];
    let n = 0;
    const send = inOrder(async (chunk: string) => {
      const wait = slow[n++];
      await new Promise((r) => setTimeout(r, wait));
      got.push(chunk);
    });
    ["row 1", "row 2", "row 3", "row 4", "<end>"].forEach((c) => void send(c));
    await send("after");
    expect(got).toEqual(["row 1", "row 2", "row 3", "row 4", "<end>", "after"]);
  });
  it("one that fails doesn't stop the next", async () => {
    const got: string[] = [];
    const send = inOrder(async (c: string) => {
      if (c === "bad") throw new Error("x");
      got.push(c);
    });
    void send("bad");
    await send("good");
    expect(got).toEqual(["good"]);
  });
});

describe("ls -1", () => {
  it("-1 is a flag for a command that has it, a number for the others", () => {
    expect(parseFlags(["-1"], [], "1")).toEqual({ flags: { "1": true }, rest: [] });
    expect(parseFlags(["-1a", "notes"], [], "1")).toEqual({ flags: { "1": true, a: true }, rest: ["notes"] });
    expect(parseFlags(["-1"])).toEqual({ flags: {}, rest: ["-1"] });
    expect(parseFlags(["-3"], [], "1")).toEqual({ flags: {}, rest: ["-3"] });
  });
});
