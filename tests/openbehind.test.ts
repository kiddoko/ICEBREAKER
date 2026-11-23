import { describe, expect, it } from "vitest";
import { KEEP_KEYS_MS, opensBehind } from "../src/workspace/openbehind";

const base = { now: 1000, keepUntil: 1000 + KEEP_KEYS_MS, focus: "main", activeKind: "ibsh", newKind: "bmed" };

describe("the maximized shell keeps the keyboard", () => {
  it("a page a command opened right after enter goes behind the shell", () => {
    expect(opensBehind(base)).toBe(true);
  });
  it("long after the last enter (a click, ⌘K): the page comes to the front as before", () => {
    expect(opensBehind({ ...base, now: base.keepUntil })).toBe(false);
  });
  it("only from the maximized ibsh: another page in front, or the shell docked below, change nothing", () => {
    expect(opensBehind({ ...base, activeKind: "todo" })).toBe(false);
    expect(opensBehind({ ...base, focus: "shell" })).toBe(false);
  });
  it("maximizing the shell again is not a page behind it", () => {
    expect(opensBehind({ ...base, newKind: "ibsh" })).toBe(false);
  });
});
