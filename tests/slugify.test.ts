import { describe, expect, it } from "vitest";
import { slugify } from "../src/vault/paths";

describe("a note's file name (B4: a 250-character title was a raw disk error)", () => {
  it("cut at 80 characters, at a word when it can, never ending on a dash", () => {
    const long = "word ".repeat(60);
    const s = slugify(long);
    expect(s.length).toBeLessThanOrEqual(80);
    expect(s.endsWith("-")).toBe(false);
    expect(s.startsWith("word-word")).toBe(true);
    expect(slugify("x".repeat(200)).length).toBe(80);
  });
  it("short titles unchanged", () => {
    expect(slugify("Hello World")).toBe("hello-world");
    expect(slugify("")).toBe("untitled");
  });
});
