import { describe, expect, it } from "vitest";
import { grepLines } from "../src/shell/regexrun";

describe("grep's matching (shell/regexrun.ts)", () => {
  it("finds the lines and where the pattern is on them", async () => {
    const r = await grepLines(["one\ntwo two\nthree", "zero"], /two|o/, { spans: true });
    expect("hits" in r && r.hits.map((h) => [h.f, h.i])).toEqual([[0, 0], [0, 1], [1, 0]]);
    expect("hits" in r && r.hits[1].spans).toEqual([[0, 3], [4, 7]]);
  });
  it("-v: the other lines", async () => {
    const r = await grepLines(["a\nb\nab"], /a/, { invert: true });
    expect("hits" in r && r.hits.map((h) => h.i)).toEqual([1]);
  });
  it("ctrl+C before it ends: stopped, nothing printed", async () => {
    const stop = new AbortController();
    stop.abort();
    expect(await grepLines(["a"], /a/, { signal: stop.signal })).toEqual({ stopped: "interrupted" });
  });
  it("the worker's code stands alone (it's sent as text): run on its own, it answers", async () => {
    const { WORKER_SRC } = await import("../src/shell/regexrun");
    let got: unknown;
    const onmessage = new Function("postMessage", `let onmessage; ${WORKER_SRC}; return onmessage;`)((d: unknown) => (got = d));
    onmessage({ data: { source: "b+", flags: "i", invert: false, spans: true, texts: ["aBb\nc"] } });
    expect(got).toEqual([{ f: 0, i: 0, spans: [[1, 3]] }]);
  });
});
