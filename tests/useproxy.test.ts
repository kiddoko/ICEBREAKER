import { describe, expect, it } from "vitest";
import { useProxy } from "../src/plugins/sandbox/useproxy";

describe("ib.use in a sandboxed module (plugins/sandbox/useproxy.ts)", () => {
  it("is modules.call under another name (Windows bench 24/11: « ib.use is not a function »)", async () => {
    const calls: unknown[][] = [];
    const term = useProxy("terminal", async (m, n, a) => (calls.push([m, n, ...a]), "ok"));
    expect(await term.run("git status")).toBe("ok");
    expect(calls).toEqual([["terminal", "run", "git status"]]);
    // not a promise itself: `await ib.use("x")` gives the proxy back
    expect((term as unknown as { then?: unknown }).then).toBeUndefined();
  });
});
