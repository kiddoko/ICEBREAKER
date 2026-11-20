import { describe, expect, it } from "vitest";
import { splitSay } from "../src/apps/link";
import { spokenAlert } from "../src/core/voice";

describe("the spoken line of an answer", () => {
  it("hides <say> from the screen and gives it to the voice", () => {
    expect(splitSay("<say>こんにちは。</say>\nHello there")).toEqual({ visible: "Hello there", said: { text: "こんにちは。", closed: true } });
    expect(splitSay("<say>こんに")).toEqual({ visible: "", said: { text: "こんに", closed: false } });
    expect(splitSay("<say>はい。</sa").said).toEqual({ text: "はい。", closed: false });
    expect(splitSay("Hi <sa").visible).toBe("Hi ");
    expect(splitSay("no tag here").said).toBeNull();
  });
});

describe("what the voice reads of an alert", () => {
  it("reads the content, never the app's name", () => {
    expect(spokenAlert("◷ ICEBREAKER", "this is what a reminder looks like")).toBe("this is what a reminder looks like");
    expect(spokenAlert("ICEBREAKER · error", "the vault is locked")).toBe("error. the vault is locked");
    expect(spokenAlert("Test", "this is how you'll be called")).toBe("this is how you'll be called");
    expect(spokenAlert("◷ call mom", "now")).toBe("call mom. now");
    expect(spokenAlert("◎ focus done — take a break")).toBe("focus done — take a break");
  });
});
