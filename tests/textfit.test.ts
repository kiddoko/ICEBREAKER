import { describe, expect, it } from "vitest";
import { Grid } from "../src/core/grid";
import { ThemeManager } from "../src/core/theme";
import { UI } from "../src/ui/ui";

const row = (g: Grid, y: number) => Array.from({ length: g.cols }, (_, x) => String.fromCodePoint(g.ch[y * g.cols + x] || 32)).join("").trimEnd();

describe("text that fits whole (a widget's short version)", () => {
  const setup = (w: number) => {
    const ui = new UI();
    const g = new Grid(w, 1);
    ui.begin(g, new ThemeManager().current, 0, { x: -1, y: -1 });
    return { ui, g };
  };
  it("the first version that fits whole, never a cut sentence", () => {
    const { ui, g } = setup(12);
    ui.textFit(0, 0, ["nothing to remember", "none"], {}, 12);
    expect(row(g, 0)).toBe("none");
  });
  it("the long one when there's room", () => {
    const { ui, g } = setup(30);
    ui.textFit(0, 0, ["nothing to remember", "none"], {}, 30);
    expect(row(g, 0)).toBe("nothing to remember");
  });
  it("none fits: the shortest, cut with …", () => {
    const { ui, g } = setup(3);
    ui.textFit(0, 0, ["nothing to remember", "none"], {}, 3);
    expect(row(g, 0)).toBe("no…");
  });
});
