import { describe, expect, it } from "vitest";
import { Grid } from "../src/core/grid";
import { NONE } from "../src/core/color";
import { glitch } from "../src/fx/glitch";

describe("the keys follow the glitch (bench 0.8: they stayed put under torn text)", () => {
  it("a key's cells move with its text in a torn row", () => {
    const g = new Grid(40, 4);
    for (let y = 0; y < 4; y++) {
      g.set(10, y, "k".codePointAt(0)!, 0xffffff, NONE, 0);
      g.setCap(10, y, 0x334455, 0);
    }
    // seeds until some row tore: wherever the "k" went, its key went too
    for (let seed = 1; seed < 50; seed++) {
      const h = new Grid(40, 4);
      h.ch.set(g.ch); h.cap.set(g.cap); h.capEdge.set(g.capEdge); h.fg.set(g.fg); h.bg.set(g.bg);
      glitch(h, 1, seed);
      for (let i = 0; i < h.ch.length; i++) if (h.ch[i] === "k".codePointAt(0)) expect(h.cap[i]).toBe(0x334455);
    }
  });
});
