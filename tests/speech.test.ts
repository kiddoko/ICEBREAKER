import { describe, expect, it } from "vitest";
import { splitSay } from "../src/apps/link";

describe("the spoken line of an answer", () => {
  it("hides <say> from the screen and gives it to the voice", () => {
    expect(splitSay("<say>こんにちは。</say>\nHello there")).toEqual({ visible: "Hello there", said: { text: "こんにちは。", closed: true } });
    expect(splitSay("<say>こんに")).toEqual({ visible: "", said: { text: "こんに", closed: false } });
    expect(splitSay("<say>はい。</sa").said).toEqual({ text: "はい。", closed: false });
    expect(splitSay("Hi <sa").visible).toBe("Hi ");
    expect(splitSay("no tag here").said).toBeNull();
  });
});
