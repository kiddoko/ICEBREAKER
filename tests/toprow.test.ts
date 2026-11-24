import { describe, expect, it } from "vitest";
import { fitCorners, headerSpan, MIN_HEADER, stripClear, topRowForms } from "../src/workspace/layout/toprow";
import { CLASSIC, effectiveLayout, moveFrame, PRESETS } from "../src/workspace/layout/arrange";
import { solveLayout } from "../src/workspace/layout/solve";
import { frames } from "../src/workspace/layout/tree";

// the top row: the deck's menu in the left corner, uplink and the clock in the right one
const top = { y: 0, logoEnd: 16, clockStart: 200 };

describe("the top row (0.8: no menu bar)", () => {
  it("keeps a frame's header clear of the deck's menu and of the clock", () => {
    // the tree, top left: its label starts after "◆ icebreaker ▾" and a cell
    expect(headerSpan({ x: 1, y: 0, w: 40, h: 30 }, top)).toEqual({ x: 17, xEnd: 40 });
    // the page, top right: its tabs end a cell before uplink
    expect(headerSpan({ x: 42, y: 0, w: 188, h: 30 }, top)).toEqual({ x: 43, xEnd: 199 });
    // a frame lower down: its whole width (one cell in from each side)
    expect(headerSpan({ x: 1, y: 31, w: 228, h: 10 }, top)).toEqual({ x: 2, xEnd: 228 });
  });

  it("never gives a negative span, even to a frame narrower than a corner", () => {
    const s = headerSpan({ x: 1, y: 0, w: 8, h: 10 }, top);
    expect(s.xEnd).toBeGreaterThanOrEqual(s.x);
  });

  it("lowers a folded strip that starts under a corner, not the others", () => {
    expect(stripClear({ x: 1, y: 0, w: 1, h: 20 }, top)).toEqual({ x: 1, y: 1, w: 1, h: 19 });
    expect(stripClear({ x: 228, y: 0, w: 1, h: 20 }, top)).toEqual({ x: 228, y: 1, w: 1, h: 19 });
    expect(stripClear({ x: 100, y: 0, w: 1, h: 20 }, top)).toEqual({ x: 100, y: 0, w: 1, h: 20 });
    expect(stripClear({ x: 1, y: 5, w: 1, h: 20 }, top)).toEqual({ x: 1, y: 5, w: 1, h: 20 });
  });

  it("folds the corners on a narrow window (900 px is about 128 cells)", () => {
    expect(topRowForms(228)).toEqual({ logoCompact: false, clockNarrow: false });
    expect(topRowForms(160)).toEqual({ logoCompact: true, clockNarrow: false });
    expect(topRowForms(128)).toEqual({ logoCompact: true, clockNarrow: true });
  });

  it("shortens a corner when a narrow frame sits under it (the tree moved under the clock)", () => {
    const widths = { logo: [16, 5] as [number, number], clock: [33, 10] as [number, number] };
    // classic at 1600 px: the tree under the menu (40 cells), the page under the clock: full forms
    const wide = fitCorners(228, 0, [{ x: 1, y: 0, w: 40, h: 30 }, { x: 42, y: 0, w: 185, h: 30 }], widths);
    expect([wide.logoCompact, wide.clockNarrow]).toEqual([false, false]);
    // the tree moved right (34 cells): under the full clock it would keep nothing
    const right = fitCorners(228, 0, [{ x: 1, y: 0, w: 190, h: 30 }, { x: 193, y: 0, w: 34, h: 30 }], widths);
    expect(right.clockNarrow).toBe(true);
    const s = headerSpan({ x: 193, y: 0, w: 34, h: 30 }, right);
    expect(s.xEnd - s.x).toBeGreaterThanOrEqual(MIN_HEADER);
    // and a narrow tree on the left: "◆ ▾"
    expect(fitCorners(228, 0, [{ x: 1, y: 0, w: 30, h: 30 }], widths).logoCompact).toBe(true);
  });

  it("leaves every top frame at least 10 header cells at 900 px, however the frames are arranged", () => {
    // whichever frame ends up under a corner (the tree moved right, the shell on top…)
    const cols = 128, corners = { y: 0, logoEnd: 5, clockStart: cols - 9 };
    const arrangements = {
      ...Object.fromEntries(Object.entries(PRESETS).map(([k, v]) => [k, v.root])),
      "tree right": moveFrame(CLASSIC, "vault", "right"),
      "tree bottom": moveFrame(CLASSIC, "vault", "bottom"),
      "shell top": moveFrame(CLASSIC, "shell", "top"),
      "panel top": moveFrame(CLASSIC, "panel", "top"),
    };
    expect(Object.keys(arrangements).length).toBeGreaterThan(5);
    for (const [name, arr] of Object.entries(arrangements)) {
      const today = { sidebar: true, shell: true, shellMax: false, panel: true, shellRatio: 0.3, cols, bodyH: 40 };
      const layout = effectiveLayout(arr, today);
      const at = solveLayout(layout, { x: 1, y: 0, w: cols - 2, h: 40 }).rects;
      for (const f of frames(layout)) {
        const r = at.get(f.id);
        if (!r || f.strip || r.y !== 0 || r.w < 20) continue;
        const s = headerSpan(r, corners);
        expect(s.xEnd - s.x, `${name}: ${f.id}`).toBeGreaterThanOrEqual(10);
      }
    }
  });
});
