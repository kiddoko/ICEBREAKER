import { describe, expect, it } from "vitest";
import type { Rect } from "../src/core/grid";
import { bordersOf, solveLayout } from "../src/workspace/layout/solve";
import { paneToward } from "../src/workspace/layout/focus";
import { col, findFrame, frame, frameOf, frames, row, todayLayout, type Today } from "../src/workspace/layout/tree";
import { CLASSIC, effectiveLayout, isFolded, moveFrame, parseArrangement, PRESETS, arrangedIds, resizeBetween, setFolded, type ANode } from "../src/workspace/layout/arrange";

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

// ── step 2: the saved arrangement ────────────────────────────────────────────

describe("the classic arrangement is today's screen (every account without a saved layout)", () => {
  let n = 0;
  for (const [W, Hs] of SIZES)
    for (const sidebar of [true, false])
      for (const panel of [true, false])
        for (const shell of [true, false])
          for (const shellRatio of [0.15, 0.3, 0.8]) {
            const s: Today = { sidebar, panel, shell, shellMax: false, shellRatio, cols: W, bodyH: Hs - 2 };
            const ref = before(s, W);
            if (!valid(ref)) continue;
            n++;
            it(`${W}×${Hs} tree ${sidebar} panel ${panel} shell ${shell} ${shellRatio}`, () => {
              const body = { x: 1, y: 1, w: W - 2, h: Hs - 2 };
              expect(Object.fromEntries(solveLayout(effectiveLayout(CLASSIC, s), body).rects)).toEqual(ref);
            });
          }
  it("compared many screens", () => expect(n).toBeGreaterThan(500));
});

describe("a saved arrangement is checked before it's used", () => {
  const ok = (root: ANode) => ({ version: 1, root });
  it("accepts the presets and what frame move makes", () => {
    for (const p of Object.values(PRESETS)) expect(parseArrangement(ok(p.root))).not.toBeNull();
    for (const id of ["vault", "panel", "shell"] as const)
      for (const side of ["left", "right", "top", "bottom"] as const) expect(parseArrangement(ok(moveFrame(CLASSIC, id, side)))).not.toBeNull();
  });
  it("refuses anything else: today's arrangement is used", () => {
    expect(parseArrangement({})).toBeNull();
    expect(parseArrangement(null)).toBeNull();
    expect(parseArrangement({ version: 2, root: CLASSIC })).toBeNull();
    // a frame missing, twice, unknown
    expect(parseArrangement(ok({ kind: "split", dir: "row", gap: 1, children: [{ kind: "frame", id: "main" }], sizes: [{ fill: 1 }] }))).toBeNull();
    const twice = structuredClone(CLASSIC) as { children: ANode[] };
    twice.children[1] = { kind: "frame", id: "main" };
    expect(parseArrangement(ok(twice as unknown as ANode))).toBeNull();
    expect(parseArrangement(ok({ kind: "frame", id: "evil" } as unknown as ANode))).toBeNull();
    // a bad size, a bad gap, sizes not matching children
    const badSize = structuredClone(CLASSIC) as { sizes: unknown[] };
    badSize.sizes[0] = { cells: -5 };
    expect(parseArrangement(ok(badSize as unknown as ANode))).toBeNull();
    const badGap = structuredClone(CLASSIC) as { gap: number };
    badGap.gap = 40;
    expect(parseArrangement(ok(badGap as unknown as ANode))).toBeNull();
    // too deep
    let deep: ANode = CLASSIC;
    for (let i = 0; i < 6; i++) deep = { kind: "split", dir: "row", gap: 1, children: [deep], sizes: [{ fill: 1 }] };
    expect(parseArrangement(ok(deep))).toBeNull();
  });
});

describe("moving a frame", () => {
  const S: Today = { sidebar: true, panel: true, shell: true, shellMax: false, shellRatio: 0.3, cols: 160, bodyH: 43 };
  const body = { x: 1, y: 1, w: 158, h: 43 };
  const solve = (a: ANode) => solveLayout(effectiveLayout(a, S), body).rects;
  it("puts it along that edge, the rest keeps its places", () => {
    const right = solve(moveFrame(CLASSIC, "shell", "right"));
    const shell = right.get("shell")!;
    expect(shell.x + shell.w).toBe(body.x + body.w);
    expect(shell.h).toBe(body.h);
    expect(arrangedIds(moveFrame(CLASSIC, "shell", "right"))).toEqual(["vault", "main", "panel", "shell"]);
    const bottomTree = solve(moveFrame(CLASSIC, "vault", "bottom")).get("vault")!;
    expect(bottomTree.y + bottomTree.h).toBe(body.y + body.h);
    expect(bottomTree.w).toBe(body.w);
    const leftPanel = solve(moveFrame(CLASSIC, "panel", "left")).get("panel")!;
    expect(leftPanel.x).toBe(body.x);
  });
  it("the page doesn't move: everything moves around it", () => {
    expect(moveFrame(CLASSIC, "main", "left")).toBe(CLASSIC);
  });
  it("every preset and every move: frames inside, never overlapping, at every size", () => {
    const all = [...Object.values(PRESETS).map((p) => p.root), ...(["vault", "panel", "shell"] as const).flatMap((id) => (["left", "right", "top", "bottom"] as const).map((side) => moveFrame(CLASSIC, id, side)))];
    for (const a of all)
      for (const [W, Hs] of SIZES) {
        const s: Today = { ...S, cols: W, bodyH: Hs - 2 };
        const b = { x: 1, y: 1, w: W - 2, h: Hs - 2 };
        const rs = [...solveLayout(effectiveLayout(a, s), b).rects.values()];
        for (const r of rs) {
          expect(r.w >= 0 && r.h >= 0 && r.x >= b.x && r.y >= b.y && r.x + r.w <= b.x + b.w && r.y + r.h <= b.y + b.h).toBe(true);
          for (const o of rs) if (o !== r && r.w && r.h && o.w && o.h) expect(r.x < o.x + o.w && o.x < r.x + r.w && r.y < o.y + o.h && o.y < r.y + r.h).toBe(false);
        }
      }
  });
  it("a hidden frame gives its room to its neighbours", () => {
    const a = moveFrame(CLASSIC, "shell", "right");
    const noShell = solveLayout(effectiveLayout(a, { ...S, shell: false }), body).rects;
    expect(noShell.has("shell")).toBe(false);
    const panel = noShell.get("panel")!;
    expect(panel.x + panel.w).toBe(body.x + body.w);
  });
});

describe("⌘⌥ arrows go to the part really in that direction", () => {
  type P = "sidebar" | "main" | "panel" | "shell";
  const ID: Record<string, P> = { vault: "sidebar", main: "main", panel: "panel", shell: "shell" };
  const rectsOf = (a: ANode, s: Today): Partial<Record<P, Rect>> => {
    const body = { x: 1, y: 1, w: s.cols - 2, h: s.bodyH };
    return Object.fromEntries([...solveLayout(effectiveLayout(a, s), body).rects].map(([k, r]) => [ID[k], r]));
  };
  // the rules before step 2, for the classic layout (Workspace.moveFocus)
  const old = (from: P, dir: "left" | "right" | "up" | "down", s: Today, rs: Partial<Record<P, Rect>>): P => {
    if (dir === "left" && from === "panel") return "main";
    if (dir === "left" && s.sidebar) return "sidebar";
    if (dir === "right" && from === "sidebar") return "main";
    if (dir === "right" && from === "main" && rs.panel) return "panel";
    if (dir === "down" && s.shell) return "shell";
    if (dir === "up" && from === "shell") return "main";
    return from;
  };
  const neu = (from: P, dir: "left" | "right" | "up" | "down", s: Today, rs: Partial<Record<P, Rect>>): P => paneToward(rs, from, dir) ?? old(from, dir, s, rs);
  it("the classic layout: the same as before, from every part, every way", () => {
    for (const [W, Hs] of [[160, 45], [240, 68], [120, 34]])
      for (const sidebar of [true, false]) for (const panel of [true, false]) for (const shell of [true, false]) {
        const s: Today = { sidebar, panel, shell, shellMax: false, shellRatio: 0.3, cols: W, bodyH: Hs - 2 };
        const rs = rectsOf(CLASSIC, s);
        for (const from of Object.keys(rs) as P[]) for (const dir of ["left", "right", "up", "down"] as const) expect(`${from} ${dir} → ${neu(from, dir, s, rs)}`).toBe(`${from} ${dir} → ${old(from, dir, s, rs)}`);
      }
  });
  it("moved frames: the panel on the left is left of the page, the shell on the right is right of it", () => {
    // (a wide screen: at 160 columns the shell on the right leaves the page under 40, and the panel folds away)
    const s: Today = { sidebar: true, panel: true, shell: true, shellMax: false, shellRatio: 0.3, cols: 260, bodyH: 60 };
    expect(paneToward(rectsOf(moveFrame(CLASSIC, "panel", "left"), s), "main", "left")).toBe("sidebar");
    expect(paneToward(rectsOf(moveFrame(CLASSIC, "shell", "right"), s), "main", "right")).toBe("panel");
    expect(paneToward(rectsOf(moveFrame(CLASSIC, "shell", "right"), s), "panel", "right")).toBe("shell");
    // the tree and the shell side by side under the page: down goes to the one under most of it, left from the shell to the tree
    expect(paneToward(rectsOf(PRESETS["tree-bottom"].root, s), "main", "down")).toBe("shell");
    expect(paneToward(rectsOf(PRESETS["tree-bottom"].root, s), "shell", "left")).toBe("sidebar");
  });
});

// ── step 2b: folding and dragging borders ────────────────────────────────────

describe("folding a frame into a strip", () => {
  const S: Today = { sidebar: true, panel: true, shell: true, shellMax: false, shellRatio: 0.3, cols: 200, bodyH: 54 };
  const body = { x: 1, y: 1, w: 198, h: 54 };
  const solve = (a: ANode) => solveLayout(effectiveLayout(a, S), body).rects;
  it("one cell along its split, the page takes the rest", () => {
    const r = solve(setFolded(CLASSIC, "vault", true));
    expect(r.get("vault")!.w).toBe(1);
    expect(r.get("main")!.x).toBe(body.x + 2);
    const shell = solve(setFolded(CLASSIC, "shell", true)).get("shell")!;
    expect(shell.h).toBe(1);
    expect(shell.y + shell.h).toBe(body.y + body.h);
  });
  it("a folded strip never becomes the one that grows", () => {
    // the tree and the shell side by side at the bottom, the shell folded: the tree takes the rest, the shell stays one cell
    const a = setFolded(PRESETS["tree-bottom"].root, "shell", true);
    const r = solve(a);
    expect(r.get("shell")!.w).toBe(1);
    expect(r.get("vault")!.w).toBeGreaterThan(100);
  });
  it("the page never folds; unfolding gives the frame back; a saved fold is checked", () => {
    expect(setFolded(CLASSIC, "main", true)).toBe(CLASSIC);
    const f = setFolded(CLASSIC, "panel", true);
    expect(isFolded(f, "panel")).toBe(true);
    expect(isFolded(setFolded(f, "panel", false), "panel")).toBe(false);
    expect(parseArrangement({ version: 1, root: f })).not.toBeNull();
    const bad = JSON.parse(JSON.stringify(CLASSIC).replace('"id":"main"}', '"id":"main","folded":true}'));
    expect(parseArrangement({ version: 1, root: bad })).toBeNull();
  });
});

describe("dragging the border between two frames", () => {
  const S: Today = { sidebar: true, panel: true, shell: true, shellMax: false, shellRatio: 0.3, cols: 200, bodyH: 54 };
  const body = { x: 1, y: 1, w: 198, h: 54 };
  const solve = (a: ANode) => solveLayout(effectiveLayout(a, S), body).rects;
  it("finds every border, with the cells to grab", () => {
    const layout = effectiveLayout(CLASSIC, S);
    const bs = bordersOf(layout, solveLayout(layout, body).rects);
    expect(bs.map((b) => `${b.dir} ${b.a}|${b.b}`)).toEqual(["col vault|shell", "row vault|main", "row main|panel"]);
    const tree = bs.find((b) => b.a === "vault" && b.b === "main")!;
    expect(tree.grip.w).toBe(1);
    expect(tree.grip.x).toBe(tree.ra.x + tree.ra.w);
  });
  it("the fixed side takes its new length in cells, the page the rest", () => {
    const a = resizeBetween(CLASSIC, "vault", "main", "row", 50, 100);
    const r = solve(a);
    expect(r.get("vault")!.w).toBe(50);
    expect(r.get("main")!.x).toBe(body.x + 51);
    const p = resizeBetween(CLASSIC, "main", "panel", "row", 100, 40);
    expect(solve(p).get("panel")!.w).toBe(40);
    expect(parseArrangement({ version: 1, root: p })).not.toBeNull();
  });
  it("a dragged size is a share of the screen: another font (more or fewer cells) keeps the proportions", () => {
    // dragged on a 160-column screen to 48 cells (30 %)
    const a = resizeBetween(CLASSIC, "vault", "main", "row", 48, 100, 160);
    expect(parseArrangement({ version: 1, root: a })).not.toBeNull();
    // a theme with a wider font: 120 columns → still 30 % (36 cells), not 48
    const narrow = { ...S, cols: 120 };
    const r = solveLayout(effectiveLayout(a, narrow), { x: 1, y: 1, w: 118, h: S.bodyH }).rects;
    expect(r.get("vault")!.w).toBe(36);
    // the shell's height too (a share of the body's rows)
    const sh = resizeBetween(CLASSIC, "vault", "shell", "col", 30, 13, 43);
    const tall = solveLayout(effectiveLayout(sh, { ...S, bodyH: 86 }), { x: 1, y: 1, w: 158, h: 86 }).rects;
    expect(tall.get("shell")!.h).toBe(26);
  });
  it("the shell's height, dragged from its top border", () => {
    const a = resizeBetween(CLASSIC, "vault", "shell", "col", 40, 14);
    expect(solve(a).get("shell")!.h).toBe(14);
  });
  it("two fill sides share by the new lengths", () => {
    const a = resizeBetween(PRESETS["tree-bottom"].root, "vault", "shell", "row", 100, 97);
    const r = solve(a);
    expect(Math.abs(r.get("vault")!.w - 100)).toBeLessThanOrEqual(1);
  });
  it("frames that aren't neighbours along that way: nothing changes", () => {
    expect(resizeBetween(CLASSIC, "vault", "main", "col", 10, 10)).toEqual(CLASSIC);
  });
});
