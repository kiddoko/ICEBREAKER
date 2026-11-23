import { describe, expect, it } from "vitest";
import { PageAlone } from "../src/workspace/pagealone";

describe("a page alone (a module's full-window mode)", () => {
  const tracker = { kind: "breakermed" }, home = { kind: "home" };
  it("the page asks: everything else folds away; it asks again: it all comes back", () => {
    const p = new PageAlone();
    expect(p.request(tracker, true, false)).toBe("fold");
    expect(p.request(tracker, true, true)).toBe(null); // already
    expect(p.request(tracker, false, true)).toBe("restore");
  });
  it("leaving the page (another tab in front, or it closed) brings everything back once", () => {
    const p = new PageAlone();
    p.request(tracker, true, false);
    expect(p.tick(tracker, true)).toBe(null);
    expect(p.tick(home, true)).toBe("restore");
    expect(p.tick(home, false)).toBe(null);
  });
  it("you brought the frames back yourself: the page lets go, nothing is folded again behind your back", () => {
    const p = new PageAlone();
    p.request(tracker, true, false);
    expect(p.tick(tracker, false)).toBe(null);
    expect(p.tick(home, false)).toBe(null);
    expect(p.owner).toBe(null);
  });
  it("everything was already folded by you: the page doesn't own it, leaving restores nothing", () => {
    const p = new PageAlone();
    expect(p.request(tracker, true, true)).toBe(null);
    expect(p.tick(home, true)).toBe(null);
  });
});

describe("a page alone can't fight you", () => {
  const tracker = { kind: "breakermed" }, home = { kind: "home" };
  it("you brought the frames back: the same page can't fold them again until it has left the front once", () => {
    const p = new PageAlone();
    p.request(tracker, true, false);
    p.tick(tracker, false); // you brought them back
    expect(p.request(tracker, true, false)).toBe(null);
    p.tick(home, false); // another page in front
    p.tick(tracker, false); // back to the tracker
    expect(p.request(tracker, true, false)).toBe("fold");
  });
});
