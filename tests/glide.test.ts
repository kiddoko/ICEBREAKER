import { describe, expect, it } from "vitest";
import { Glide } from "../src/ui/glide";
import type { UI } from "../src/ui/ui";

const ui = { animate: () => {} } as unknown as UI;

describe("the scroll glide", () => {
  it("stops dead at the bottom and at the top (no wrapping round)", () => {
    const g = new Glide();
    let s = g.follow(ui, 0, 10);
    g.push(50);
    s = g.follow(ui, s, 10);
    expect(s).toBe(10);
    g.push(-80);
    s = g.follow(ui, s, 10);
    expect(s).toBe(0);
  });
  it("keeps going a little after the last push, then rests", async () => {
    const g = new Glide();
    let s = g.follow(ui, 0, 1000);
    g.push(3);
    s = g.follow(ui, s, 1000);
    const right = s;
    for (let i = 0; i < 60; i++) {
      await new Promise((r) => setTimeout(r, 4));
      s = g.follow(ui, s, 1000);
    }
    expect(s).toBeGreaterThan(right);
    expect(s).toBeLessThan(40);
  });
  it("lets the app move the view itself (a key, a jump)", () => {
    const g = new Glide();
    let s = g.follow(ui, 0, 100);
    g.push(5);
    s = g.follow(ui, s, 100);
    expect(g.follow(ui, 42, 100)).toBe(42);
  });
});
