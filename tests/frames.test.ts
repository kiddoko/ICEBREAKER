import { describe, expect, it } from "vitest";
import type { Rect } from "../src/core/grid";
import { solveLayout } from "../src/workspace/layout/solve";
import { col, findFrame, frame, frameOf, frames, row, todayLayout, type Today } from "../src/workspace/layout/tree";

/**
 * THE PROOF of step 1 (docs/FRAMES.md): the frames drawn from the layout tree are
 * exactly where Workspace.render put them before (0.5.x). `before()` is that code,
 * copied as it was, kept here as the reference.
 */
function before(s: Today, W: number): Record<string, Rect> {
  const H = s.bodyH + 2;
  const body = { x: 1, y: 1, w: W - 2, h: H - 2 };
  let shellH = 0;
  if (s.shell) shellH = Math.max(5, Math.min(body.h - 8, Math.round(body.h * s.shellRatio)));
  const top = { x: body.x, y: body.y, w: body.w, h: body.h - shellH };
  const max = s.shell && s.shellMax;
  const stripH = Math.max(6, Math.round(body.h * 0.3));
  const sideW = s.sidebar ? Math.max(20, Math.min(34, Math.round(W * 0.18))) : 0;
  const right = { x: body.x + (sideW ? sideW + 1 : 0), w: body.w - (sideW ? sideW + 1 : 0) };
  const out: Record<string, Rect> = {};
  if (s.sidebar) out.vault = { x: top.x, y: top.y, w: sideW, h: max ? body.h : top.h };
  const mainR = max ? { x: right.x, y: body.y + body.h - stripH, w: right.w, h: stripH } : { x: top.x + (sideW ? sideW + 1 : 0), y: top.y, w: top.w - (sideW ? sideW + 1 : 0), h: top.h };
  const panelW = Math.max(24, Math.min(36, Math.round(W * 0.2)));
  if (s.panel && mainR.w - panelW - 1 >= 40) {
    mainR.w -= panelW + 1;
    out.panel = { x: mainR.x + mainR.w + 1, y: mainR.y, w: panelW, h: mainR.h };
  }
  out.main = mainR;
  if (s.shell) out.shell = max ? { x: right.x, y: body.y, w: right.w, h: body.h - stripH } : { x: body.x, y: top.y + top.h, w: body.w, h: shellH };
  return out;
}

function after(s: Today): Record<string, Rect> {
  const body = { x: 1, y: 1, w: s.cols - 2, h: s.bodyH };
  const { rects } = solveLayout(todayLayout(s), body);
  return Object.fromEntries(rects);
}

/** 30 window sizes, from a tiny window with a big interface scale to a 4K screen and odd shapes */
const SIZES: [number, number][] = [
  [40, 12], [52, 16], [64, 20], [72, 22], [80, 24], [90, 28], [100, 30], [100, 36], [110, 34], [120, 34],
  [128, 38], [140, 40], [150, 46], [160, 45], [180, 50], [200, 56], [220, 60], [240, 68], [260, 52], [280, 80],
  [300, 84], [340, 96], [380, 52], [60, 64], [90, 50], [200, 16], [120, 20], [70, 40], [175, 49], [400, 110],
];
const valid = (rs: Record<string, Rect>) => Object.values(rs).every((r) => r.w > 0 && r.h > 0);

describe("the frames are where they always were (step 1: nothing moves)", () => {
  let compared = 0;
  for (const [W, Hs] of SIZES)
    for (const sidebar of [true, false])
      for (const panel of [true, false])
        for (const [shell, shellMax] of [[true, false], [true, true], [false, false]] as const)
          for (const shellRatio of [0.15, 0.3, 0.55, 0.8]) {
            const s: Today = { sidebar, panel, shell, shellMax, shellRatio, cols: W, bodyH: Hs - 2 };
            const ref = before(s, W);
            // where the old code made a negative or empty rect (too small a window), the new one may differ: it never does
            if (!valid(ref)) continue;
            compared++;
            it(`${W}×${Hs} tree ${sidebar} panel ${panel} shell ${shell}${shellMax ? " max" : ""} ${shellRatio}`, () => {
              expect(after(s)).toEqual(ref);
            });
          }
  it("compared many screens", () => expect(compared).toBeGreaterThan(1000));
});

describe("the solver", () => {
  const R = { x: 0, y: 0, w: 100, h: 30 };
  it("fixed cells, fills share the rest, gaps between", () => {
    const t = row(1, [[frame("a", []), { cells: 20 }], [frame("b", []), { fill: 1 }], [frame("c", []), { fill: 1 }]]);
    const { rects } = solveLayout(t, R);
    expect(rects.get("a")).toEqual({ x: 0, y: 0, w: 20, h: 30 });
    expect(rects.get("b")).toEqual({ x: 21, y: 0, w: 39, h: 30 });
    expect(rects.get("c")).toEqual({ x: 61, y: 0, w: 39, h: 30 });
  });
  it("folds the foldable neighbour when a frame would go below its minimum", () => {
    const t = row(1, [[frame("main", [], { min: { w: 60, h: 1 } }), { fill: 1 }], [frame("panel", [], { foldable: true }), { cells: 45 }]]);
    const s = solveLayout(t, R);
    expect([...s.folded]).toEqual(["panel"]);
    expect(s.rects.get("main")).toEqual(R);
  });
  it("folds the lowest foldOrder first, then the next if needed", () => {
    const t = row(0, [[frame("m", [], { min: { w: 70, h: 1 } }), { fill: 1 }], [frame("p", [], { foldable: true, foldOrder: 2 }), { cells: 20 }], [frame("i", [], { foldable: true, foldOrder: 1 }), { cells: 20 }]]);
    expect([...solveLayout(t, R).folded]).toEqual(["i"]);
    const t2 = row(0, [[frame("m", [], { min: { w: 90, h: 1 } }), { fill: 1 }], [frame("p", [], { foldable: true, foldOrder: 2 }), { cells: 20 }], [frame("i", [], { foldable: true, foldOrder: 1 }), { cells: 20 }]]);
    expect([...solveLayout(t2, R).folded]).toEqual(["i", "p"]);
  });
  it("never a negative rect: fixed cells shrink when there isn't room", () => {
    const t = col(0, [[frame("a", []), { cells: 20 }], [frame("b", []), { cells: 20 }], [frame("c", []), { fill: 1 }]]);
    const { rects } = solveLayout(t, R);
    expect(rects.get("a")?.h).toBe(20);
    expect(rects.get("b")?.h).toBe(10);
    expect(rects.get("c")?.h).toBe(0);
    for (const r of rects.values()) expect(r.h).toBeGreaterThanOrEqual(0);
  });
  it("fills share by weight, adding up exactly", () => {
    const t = row(0, [[frame("a", []), { fill: 1 }], [frame("b", []), { fill: 2 }]]);
    const { rects } = solveLayout(t, { x: 0, y: 0, w: 31, h: 1 });
    expect(rects.get("a")!.w + rects.get("b")!.w).toBe(31);
    expect(rects.get("b")!.w).toBe(21);
  });
  it("frames never overlap and stay inside, at every size of today's layout", () => {
    for (const [W, Hs] of SIZES) {
      const s: Today = { sidebar: true, panel: true, shell: true, shellMax: false, shellRatio: 0.3, cols: W, bodyH: Hs - 2 };
      const body = { x: 1, y: 1, w: W - 2, h: Hs - 2 };
      const rs = [...solveLayout(todayLayout(s), body).rects.values()];
      for (const r of rs) {
        expect(r.x >= body.x && r.y >= body.y && r.x + r.w <= body.x + body.w && r.y + r.h <= body.y + body.h).toBe(true);
        for (const o of rs) if (o !== r) expect(r.x < o.x + o.w && o.x < r.x + r.w && r.y < o.y + o.h && o.y < r.y + r.h).toBe(false);
      }
    }
  });
});

describe("the tree", () => {
  it("today's layout holds today's frames, in reading order", () => {
    const t = todayLayout({ sidebar: true, panel: true, shell: true, shellMax: false, shellRatio: 0.3, cols: 160, bodyH: 43 });
    expect(frames(t).map((f) => f.id)).toEqual(["vault", "main", "panel", "shell"]);
    expect(frameOf(t, "tool:shell")?.id).toBe("shell");
    expect(findFrame(t, "panel")?.foldable).toBe(true);
    const noShell = todayLayout({ sidebar: false, panel: false, shell: false, shellMax: false, shellRatio: 0.3, cols: 160, bodyH: 43 });
    expect(frames(noShell).map((f) => f.id)).toEqual(["main"]);
  });
});
