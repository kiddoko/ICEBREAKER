import { describe, expect, it } from "vitest";
import { fitPieces } from "../src/workspace/widgetpopup";

describe("a widget pop-up's hint", () => {
  it("keeps whole pieces, never a word cut in the middle", () => {
    const hint = "type + enter: add · space: done · del: remove · right-click: edit";
    expect(fitPieces(hint, 80)).toBe(hint);
    expect(fitPieces(hint, 40)).toBe("type + enter: add · space: done");
    expect(fitPieces(hint, 10)).toBe("");
  });
});
