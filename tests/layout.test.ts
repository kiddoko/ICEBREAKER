import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { Grid } from "../src/core/grid";
import { ThemeManager } from "../src/core/theme";
import { UI } from "../src/ui/ui";
import { Bar, cards, layoutBar, sizeClass, stack } from "../src/ui/layout";
import { caller, groupIssues, LayoutProbe, parseSize } from "../src/ui/probe";

/** a UI drawing into a fresh grid, with the default theme (no screen needed) */
function makeUI(cols = 40, rows = 10): UI {
  const ui = new UI();
  ui.keycaps = false;
  ui.begin(new Grid(cols, rows), new ThemeManager().current, 0, { x: -1, y: -1 });
  return ui;
}
const row = (ui: UI, y: number) => [...ui.grid.ch.slice(y * ui.cols, (y + 1) * ui.cols)].map((c) => (c ? String.fromCodePoint(c) : "")).join("");

describe("sizeClass: a frame's size in four steps", () => {
  it("goes by the smaller side", () => {
    expect(sizeClass({ w: 20, h: 40 })).toBe("xs");
    expect(sizeClass({ w: 200, h: 6 })).toBe("xs");
    expect(sizeClass({ w: 50, h: 40 })).toBe("s");
    expect(sizeClass({ w: 100, h: 30 })).toBe("m");
    expect(sizeClass({ w: 120, h: 40 })).toBe("l");
  });
});

describe("Bar: the least important things go first", () => {
  const item = (w: number, priority: number, side: "left" | "right", order: number, minW = w) => ({ w, minW, priority, side, order });
  it("keeps everything when it fits", () => {
    expect(layoutBar([item(5, 1, "left", 0), item(5, 1, "right", 1)], 20, 2).map((k) => k.w)).toEqual([5, 5]);
  });
  it("drops the lowest priority, not the last one", () => {
    const kept = layoutBar([item(10, 9, "left", 0), item(10, 1, "left", 1), item(10, 5, "right", 2)], 25, 2);
    expect(kept.map((k) => k.item.order)).toEqual([0, 2]);
  });
  it("among equals, the latest added goes first", () => {
    const kept = layoutBar([item(10, 3, "left", 0), item(10, 3, "left", 1)], 15, 2);
    expect(kept.map((k) => k.item.order)).toEqual([0]);
  });
  it("shrinks a fit text before dropping anything", () => {
    const kept = layoutBar([item(30, 1, "left", 0, 8), item(6, 5, "right", 1)], 20, 2);
    expect(kept.map((k) => k.w)).toEqual([12, 6]);
  });
  it("draws both sides without overlap, the right side ending at the end", () => {
    const ui = makeUI(30, 1);
    const bar = new Bar(ui, 0, 0, 30);
    bar.text("LEFT", {}, { priority: 9 });
    bar.text("a long status that will not fit", {}, { priority: 1, fit: 6 });
    bar.text("RIGHT", {}, { side: "right", priority: 8 });
    bar.draw();
    const line = row(ui, 0);
    expect(line.startsWith("LEFT  a lon")).toBe(true);
    expect(line.endsWith("RIGHT")).toBe(true);
    expect(bar.dropped).toBe(0);
  });
  it("reports what it left out", () => {
    const ui = makeUI(12, 1);
    const bar = new Bar(ui, 0, 0, 12);
    bar.text("IMPORTANT", {}, { priority: 9 });
    bar.text("extra", {}, { priority: 1 });
    bar.draw();
    expect(row(ui, 0).trim()).toBe("IMPORTANT");
    expect(bar.dropped).toBe(1);
  });
});

describe("stack: sections down a frame", () => {
  const r = { x: 0, y: 0, w: 40, h: 20 };
  it("gives fixed parts their height and the fill part the rest", () => {
    const [head, list, help] = stack(r, [{ h: 1 }, { min: 3, fill: 1 }, { h: 2 }], 1);
    expect(head).toEqual({ x: 0, y: 0, w: 40, h: 1 });
    expect(list).toEqual({ x: 0, y: 2, w: 40, h: 15 });
    expect(help).toEqual({ x: 0, y: 18, w: 40, h: 2 });
  });
  it("leaves out the least important when rows are missing", () => {
    const [head, list, help] = stack({ ...r, h: 6 }, [{ h: 1, priority: 9 }, { min: 3, fill: 1, priority: 8 }, { h: 2, priority: 1 }], 1);
    expect(help).toBeNull();
    expect(head?.h).toBe(1);
    expect(list).toEqual({ x: 0, y: 2, w: 40, h: 4 });
  });
  it("shares by weight and respects max", () => {
    const [a, b] = stack(r, [{ min: 1, fill: 1, max: 5 }, { min: 1, fill: 1 }], 0);
    expect(a?.h).toBe(5);
    expect(b?.h).toBe(15);
  });
  it("never goes past the frame", () => {
    for (let h = 0; h < 12; h++) {
      const parts = stack({ ...r, h }, [{ h: 2 }, { min: 2, fill: 1 }, { h: 3, priority: 2 }]);
      for (const p of parts) if (p) expect(p.y + p.h).toBeLessThanOrEqual(h);
    }
  });
});

describe("cards: reflow with the width", () => {
  it("puts as many on a row as fit, and centres the row", () => {
    const { rects, perRow, rows } = cards({ x: 0, y: 0, w: 50, h: 20 }, 7, { minW: 10, h: 4, gap: 2, gapY: 1 });
    expect(perRow).toBe(4);
    expect(rows).toBe(2);
    expect(rects[4]).toEqual({ x: 0, y: 5, w: 11, h: 4 });
    for (const c of rects) expect(c.x + c.w).toBeLessThanOrEqual(50);
  });
  it("one per row when narrow, and says how many are fully shown", () => {
    const { perRow, shown } = cards({ x: 0, y: 0, w: 8, h: 9 }, 5, { minW: 10, h: 4, gapY: 1 });
    expect(perRow).toBe(1);
    expect(shown).toBe(2);
  });
  it("maxW keeps them from getting huge", () => {
    const { rects } = cards({ x: 0, y: 0, w: 100, h: 10 }, 2, { minW: 10, maxW: 20, h: 4, gap: 2 });
    expect(rects.map((c) => c.w)).toEqual([20, 20]);
    expect(rects[0].x).toBe(29);
  });
});

describe("the layout probe (debug layout)", () => {
  it("finds a text cut by its frame, not a text that fits or is fully hidden", () => {
    const ui = makeUI(30, 4);
    const probe = (ui.probe = new LayoutProbe(30, 4));
    ui.clip({ x: 0, y: 0, w: 10, h: 4 }, () => {
      ui.text(0, 0, "fits");
      ui.text(0, 1, "this one is far too long");
      ui.text(12, 2, "scrolled away"); // entirely outside: a list row off screen, fine
      ui.text(0, 3, "long but cut", {}, 10); // maxW: cut with …, on purpose
    });
    expect(probe.issues.map((i) => [i.kind, i.text, i.y])).toEqual([["cut", "this one is far too long", 1]]);
  });
  it("finds a text written over another, but not a redraw or what follows a fill", () => {
    const ui = makeUI(30, 3);
    const probe = (ui.probe = new LayoutProbe(30, 3));
    ui.text(0, 0, "status text here");
    ui.text(8, 0, "60fps"); // over "text here"
    ui.text(0, 1, "same");
    ui.text(0, 1, "same", { fg: ui.c.accent }); // the same letters again: a hover
    ui.text(0, 2, "old");
    ui.fill({ x: 0, y: 2, w: 10, h: 1 });
    ui.text(0, 2, "new"); // after a fill: meant
    expect(probe.issues.map((i) => [i.kind, i.text, i.under])).toEqual([["overlap", "60fps", "status text here"]]);
  });
  it("doesn't look inside ui.art (overlaps on purpose)", () => {
    const ui = makeUI(20, 1);
    const probe = (ui.probe = new LayoutProbe(20, 1));
    ui.text(0, 0, "a frame title");
    ui.art(() => ui.text(0, 0, "▓▒░ rain ░▒▓"));
    expect(probe.issues).toEqual([]);
    expect(ui.probe).toBe(probe);
  });
  it("names the function that drew it, in Chrome's and WebKit's stacks", () => {
    const v8 = "Error\n    at UI.text (http://localhost:1420/src/ui/ui.ts:180:5)\n    at Row.text (http://localhost:1420/src/ui/layout.ts?t=1:80:3)\n    at renderStatusBar (http://localhost:1420/src/workspace/chrome.ts?t=123:374:9)";
    expect(caller(v8)).toBe("chrome.ts › renderStatusBar");
    const wk = "text@http://localhost:1420/src/ui/ui.ts:180:5\nrender@tauri://localhost/src/apps/home.ts:430:12";
    expect(caller(wk)).toBe("home.ts › render");
    // a module's file keeps its folder: they're all main.ts
    expect(caller("Error\n    at UI.text (http://localhost:1420/src/ui/ui.ts:1:1)\n    at CalendarApp.render (http://localhost:1420/plugins/calendar/main.ts:9:9)")).toBe("calendar/main.ts › CalendarApp.render");
  });
  it("reads sizes and folds the same place seen at many sizes into one line", () => {
    expect(parseSize("120x34")).toEqual({ label: "120×34", cols: 120, rows: 34 });
    expect(parseSize("5x5")).toBeNull();
    const issue = { kind: "cut" as const, x: 0, y: 0, text: "a", where: "chrome.ts › renderStatusBar" };
    const g = groupIssues([
      { label: "tiny", cols: 40, rows: 12, issues: [issue, issue] },
      { label: "small", cols: 64, rows: 20, issues: [issue] },
    ]);
    expect(g).toEqual([{ where: issue.where, kind: "cut", sizes: ["tiny", "small"], sample: "a", under: undefined, count: 3 }]);
  });
});

/**
 * THE RATCHET (docs/LAYOUT.md): horizontal spacing written by hand — `r.x + 2`,
 * `inner.w - 4` — instead of INSET / GAP / Row. Each file may have at most what it
 * had when the rule started (tests/layout-baseline.json), and a new file none. The
 * numbers only go down: when you clean a file, lower its line in the baseline
 * (`UPDATE_LAYOUT_BASELINE=1 npx vitest run tests/layout.test.ts` rewrites it, and
 * refuses to raise a number).
 */
describe("hand-made spacing never grows", () => {
  const OFFSET = /\.(x|w) [+-] [1-9]\d*\b/g;
  function walk(dir: string): string[] {
    return readdirSync(dir).flatMap((n) => {
      const p = join(dir, n);
      return statSync(p).isDirectory() ? walk(p) : p.endsWith(".ts") ? [p] : [];
    });
  }
  // forward slashes, so the baseline's names match on Windows too
  const files = [...walk("src"), ...walk("plugins")].map((f) => f.replaceAll("\\", "/")).sort();
  const counts: Record<string, number> = Object.fromEntries(files.map((f) => [f, (readFileSync(f, "utf8").match(OFFSET) ?? []).length] as const).filter(([, n]) => n > 0));
  const BASELINE = "tests/layout-baseline.json";
  let baseline: Record<string, number> = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, "utf8")) : {};

  if (process.env.UPDATE_LAYOUT_BASELINE) {
    const raised = Object.entries(counts).filter(([f, n]) => n > (baseline[f] ?? 0));
    if (raised.length && Object.keys(baseline).length) throw new Error(`the baseline only goes down: ${raised.map(([f, n]) => `${f} ${baseline[f] ?? 0} → ${n}`).join(", ")}`);
    writeFileSync(BASELINE, `${JSON.stringify(counts, null, 2)}\n`);
    baseline = counts;
  }

  it("no file has more than its baseline (use INSET, GAP, Row, Bar)", () => {
    const over = Object.entries(counts)
      .filter(([f, n]) => n > (baseline[f] ?? 0))
      .map(([f, n]) => `${f}: ${n} (allowed ${baseline[f] ?? 0})`);
    expect(over).toEqual([]);
  });
});
