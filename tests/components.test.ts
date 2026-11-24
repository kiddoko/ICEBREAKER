import { describe, expect, it } from "vitest";
import { contrast } from "../src/core/color";
import { Grid } from "../src/core/grid";
import { checkTheme } from "../src/core/skin/check";
import { iconGlyphs, look } from "../src/core/skin/components";
import { icon, setIconGlyphs } from "../src/core/skin/icons";
import { BUTTON, CARET, CHECKBOX, CHOICE, FRAME, ICONS_COMPONENT, LIST, PARTS, SLIDER, STATUSBAR, TABS, TIP, TREE } from "../src/core/skin/parts";
import { applyFloor, type Component, defaults, resolve } from "../src/core/skin/registry";
import { BORDER_STYLES, parseTheme, type Theme, ThemeManager } from "../src/core/theme";
import { checkbox, choice } from "../src/ui/controls";
import { ListView } from "../src/ui/list";
import { slider } from "../src/ui/slider";
import { UI } from "../src/ui/ui";
import { drawChip, frameLabel } from "../src/workspace/tabstrip";

/**
 * COMPONENTS v2.0 (themes v2, milestone 3): frames, tabs, button, checkbox, choice, slider, list,
 * caret, tree, icons, status bar and tip read their look from the skin registry. Per component:
 * each recipe drawn in each state (snapshot), the floor per recipe × built-in theme, hit sizes
 * unchanged. Nothing changes for the built-in themes (tests/skin.test.ts: the goldens).
 */

const THEMES = new ThemeManager().list();
const themeOf = (extra: string) => parseTheme(extra, nightshade, "vault");

/** a theme with one component on one recipe (a new object: looks are kept per theme object) */
const withSkin = (th: Theme, id: string, own: Record<string, unknown>): Theme => ({ ...th, skin: { ...(th.skin ?? {}), [id]: own } });

const recipesOf = (comp: Component<object>) => Object.keys(comp.recipes ?? { "": {} });

type State = { name: string; draw: (ui: UI) => void; quiet?: boolean };

/** what each grid-drawn component looks like, in each of its states, on a 30 × 3 grid */
const DRAWN: { comp: Component<object>; states: State[] }[] = [
  {
    comp: FRAME as unknown as Component<object>,
    states: [
      { name: "idle", draw: (ui) => void ui.box({ x: 0, y: 0, w: 30, h: 3 }, { title: "Notes", info: "3" }) },
      { name: "focused", draw: (ui) => void ui.box({ x: 0, y: 0, w: 30, h: 3 }, { title: "Notes", info: "3", focused: true }) },
    ],
  },
  {
    comp: TABS as unknown as Component<object>,
    states: [
      { name: "shown", draw: (ui) => drawChip(ui, 1, 0, 8, ui.c.accent) },
      { name: "frame label lit", draw: (ui) => void frameLabel(ui, 1, 0, "vault", true, {}) },
    ],
  },
  {
    comp: BUTTON as unknown as Component<object>,
    states: [
      { name: "idle", draw: (ui) => void ui.button(1, 1, "save", () => {}) },
      { name: "quiet", draw: (ui) => void ui.button(1, 1, "save", () => {}, { quiet: true }) },
      { name: "selected", draw: (ui) => void ui.button(1, 1, "save", () => {}, { selected: true }) },
      { name: "hovered", draw: (ui) => ((ui.mouse = { x: 2, y: 1 }), void ui.button(1, 1, "save", () => {})) },
      { name: "disabled", draw: (ui) => void ui.button(1, 1, "save", () => {}, { disabled: true }), quiet: true },
    ],
  },
  {
    comp: CHECKBOX as unknown as Component<object>,
    states: [
      { name: "on", draw: (ui) => void checkbox(ui, 1, 1, true, { label: "sync", onClick: () => {} }) },
      { name: "off", draw: (ui) => void checkbox(ui, 1, 1, false, { label: "sync", onClick: () => {} }) },
      { name: "some", draw: (ui) => void checkbox(ui, 1, 1, "some", { label: "sync", onClick: () => {} }) },
      { name: "hot", draw: (ui) => void checkbox(ui, 1, 1, true, { label: "sync", hot: true, onClick: () => {} }) },
      { name: "disabled", draw: (ui) => void checkbox(ui, 1, 1, true, { label: "sync", disabled: true }), quiet: true },
    ],
  },
  {
    comp: CHOICE as unknown as Component<object>,
    states: [
      { name: "arrows", draw: (ui) => void choice(ui, 3, 1, "dark", { arrows: true, onStep: () => {} }) },
      { name: "no arrows", draw: (ui) => void choice(ui, 3, 1, "dark", { onStep: () => {} }) },
    ],
  },
  {
    comp: SLIDER as unknown as Component<object>,
    states: [
      { name: "half", draw: (ui) => slider(ui, { x: 1, y: 1, w: 24, h: 1 }, 50, 0, 100, () => {}) },
      { name: "off", draw: (ui) => slider(ui, { x: 1, y: 1, w: 24, h: 1 }, 0, 0, 100, () => {}, { zeroIsOff: true }) },
      { name: "disabled", draw: (ui) => slider(ui, { x: 1, y: 1, w: 24, h: 1 }, 50, 0, 100, () => {}, { disabled: true }), quiet: true },
    ],
  },
  {
    comp: LIST as unknown as Component<object>,
    states: [
      { name: "focused", draw: (ui) => listOf(["one", "two", "three"]).render(ui, { x: 0, y: 0, w: 30, h: 3 }, true, (it, row) => void ui.text(row.x + 2, row.y, it, {})) },
      { name: "unfocused", draw: (ui) => listOf(["one", "two", "three"]).render(ui, { x: 0, y: 0, w: 30, h: 3 }, false, (it, row) => void ui.text(row.x + 2, row.y, it, {})) },
    ],
  },
];

function listOf(items: string[]): ListView<string> {
  const l = new ListView<string>();
  l.items = items;
  l.selected = 1;
  // a settled selection (no glide in the middle of the test)
  (l as unknown as { selAt: number }).selAt = -1e9;
  return l;
}

function drawIn(th: Theme, s: State): { ui: UI; g: Grid } {
  const g = new Grid(30, 3);
  const ui = new UI();
  ui.begin(g, th, 0, { x: -1, y: -1 });
  ui.still = true;
  s.draw(ui);
  return { ui, g };
}

/** each cell's ground, so a state shows in the snapshot: · the background, h highlight, s selection, a accent, o other */
const grounds = (g: Grid, th: Theme) => Array.from({ length: g.rows }, (_, y) => [...g.bg.slice(y * g.cols, (y + 1) * g.cols)].map((b) => (b === th.c.bg ? "·" : b === th.c.highlight ? "h" : b === th.c.selection ? "s" : b === th.c.accent ? "a" : "o")).join(""));
const rows = (g: Grid) => Array.from({ length: g.rows }, (_, y) => [...g.ch.slice(y * g.cols, (y + 1) * g.cols)].map((c) => (c ? String.fromCodePoint(c) : " ")).join("").trimEnd());
const hitsOf = (ui: UI) => ui.hits.map((h) => h.rect);

const nightshade = THEMES.find((t) => t.name === "nightshade")!;

describe("components v2.0: each recipe in each state (snapshot)", () => {
  for (const { comp, states } of DRAWN) {
    for (const recipe of recipesOf(comp)) {
      it(`${comp.id}${recipe ? ` · ${recipe}` : ""}`, () => {
        const th = recipe ? withSkin(nightshade, comp.id, { style: recipe }) : nightshade;
        const out = Object.fromEntries(states.map((s) => {
          const { g } = drawIn(th, s);
          return [s.name, [...rows(g), ...grounds(g, th)]];
        }));
        expect(out).toMatchSnapshot();
      });
    }
  }
  it("frame · every [frame] style", () => {
    const out: Record<string, string[]> = {};
    for (const style of BORDER_STYLES) out[style] = rows(drawIn({ ...nightshade, border: style }, DRAWN[0].states[1]).g);
    const fields: Record<string, Record<string, unknown>> = { "case upper": { case: "upper" }, "align center": { align: "center" }, "no mark, no info": { mark: false, info: false }, "focus both": { focus: "both" }, "own corners": { tl: "◢", tr: "◣", bl: "◥", br: "◤" } };
    for (const [name, own] of Object.entries(fields)) out[name] = rows(drawIn(withSkin(nightshade, "frame", own), DRAWN[0].states[1]).g);
    expect(out).toMatchSnapshot();
  });
  it("the looks drawn outside the grid: caret, tip, tree, icons, status bar (resolved, per recipe)", () => {
    const out: Record<string, unknown> = {};
    for (const comp of [CARET, TIP, TREE, ICONS_COMPONENT, STATUSBAR] as unknown as Component<object>[]) {
      for (const recipe of recipesOf(comp)) out[`${comp.id}${recipe ? ` · ${recipe}` : ""}`] = resolve(comp, recipe ? ({ style: recipe } as object) : {});
    }
    for (const shape of CARET.fields.shape.kind === "choice" ? CARET.fields.shape.options : []) out[`caret · ${shape}`] = resolve(CARET, { shape });
    expect(out).toMatchSnapshot();
  });
});

describe("components v2.0: the floor holds, per recipe × built-in theme", () => {
  it("every recipe keeps its component's floor rules, in every built-in theme", () => {
    for (const th of THEMES) {
      for (const comp of PARTS) {
        for (const recipe of recipesOf(comp)) {
          const own = recipe ? { style: recipe } : {};
          expect(applyFloor(comp, own, th.c).problems, `${th.name} · ${comp.id} · ${recipe}`).toEqual([]);
        }
      }
    }
  });

  /** the lowest contrast of the text (letters, digits) and of the other marks a state draws */
  function lowest(g: Grid, only?: (ch: string) => boolean): { text: number; marks: number } {
    let text = Infinity, marks = Infinity;
    for (let i = 0; i < g.ch.length; i++) {
      const ch = g.ch[i] ? String.fromCodePoint(g.ch[i]) : " ";
      if (ch.trim() === "" || (only && !only(ch))) continue;
      const r = contrast(g.fg[i], g.bg[i]);
      if (/[\p{L}\p{N}]/u.test(ch)) text = Math.min(text, r);
      else marks = Math.min(marks, r);
    }
    return { text, marks };
  }

  it("no recipe reads worse than the deck's own look, in any built-in theme and state", () => {
    const worse: string[] = [];
    for (const th of THEMES) {
      for (const { comp, states } of DRAWN) {
        for (const s of states) {
          if (s.quiet) continue; // disabled is meant to be faint
          const own = lowest(drawIn(th, s).g);
          for (const recipe of recipesOf(comp)) {
            const got = lowest(drawIn(recipe ? withSkin(th, comp.id, { style: recipe }) : th, s).g);
            const floor = (deck: number, need: number) => Math.min(deck, need) - 0.01;
            if (got.text < floor(own.text, 4.5)) worse.push(`${th.name} · ${comp.id} ${recipe} · ${s.name} · text ${got.text.toFixed(2)} < ${own.text.toFixed(2)}`);
            if (got.marks < floor(own.marks, 3)) worse.push(`${th.name} · ${comp.id} ${recipe} · ${s.name} · marks ${got.marks.toFixed(2)} < ${own.marks.toFixed(2)}`);
          }
        }
      }
    }
    expect(worse).toEqual([]);
  });

  it("the parts that carry a state read at 3:1 at least (WCAG 1.4.11): a tick, a knob, the arrows, the list's mark, a focused frame", () => {
    const low: string[] = [];
    const strict: Record<string, (th: Theme) => string[]> = {
      checkbox: (th) => { const k = look(th, CHECKBOX); return [k.on, k.some]; },
      choice: (th) => { const k = look(th, CHOICE); return [k.left, k.right]; },
      slider: (th) => [look(th, SLIDER).knob],
      list: (th) => [look(th, LIST).marker].filter(Boolean),
    };
    for (const th of THEMES) {
      for (const { comp, states } of DRAWN) {
        for (const recipe of recipesOf(comp)) {
          const t = recipe ? withSkin(th, comp.id, { style: recipe }) : th;
          for (const s of states) {
            if (s.quiet) continue;
            const marks = comp.id === "frame" ? (s.name === "focused" ? (ch: string) => !/[\p{L}\p{N}]/u.test(ch) && ch !== "◆" : null) : strict[comp.id] ? ((set) => (ch: string) => set.includes(ch))(strict[comp.id](t)) : null;
            if (!marks) continue;
            const r = lowest(drawIn(t, s).g, marks).marks;
            if (r < 3) low.push(`${th.name} · ${comp.id} ${recipe} · ${s.name} · ${r.toFixed(2)}:1`);
          }
        }
      }
    }
    expect(low).toEqual([]);
  });
});

describe("components v2.0: hit sizes don't change", () => {
  it("every recipe of every drawn component clicks exactly where the deck's own does", () => {
    for (const { comp, states } of DRAWN) {
      for (const s of states) {
        const base = hitsOf(drawIn(nightshade, s).ui);
        for (const recipe of recipesOf(comp)) {
          const th = recipe ? withSkin(nightshade, comp.id, { style: recipe }) : nightshade;
          expect(hitsOf(drawIn(th, s).ui), `${comp.id} · ${recipe} · ${s.name}`).toEqual(base);
        }
      }
    }
  });

  it("every glyph of every recipe is as wide as the deck's (layout never moves)", () => {
    for (const comp of PARTS) {
      const d = defaults(comp) as Record<string, unknown>;
      for (const [name, r] of Object.entries(comp.recipes ?? {})) {
        for (const [k, v] of Object.entries(r)) {
          const f = (comp.fields as Record<string, { kind: string; read: (v: unknown, c: { palette: {} }) => object }>)[k];
          expect(f, `${comp.id}.${k}`).toBeDefined();
          if (f.kind === "glyph") expect(f.read(v, { palette: {} }), `${comp.id} · ${name} · ${k}`).toEqual({ value: v });
        }
        expect(Object.keys(resolve(comp, { style: name } as object))).toEqual(Object.keys(d));
      }
    }
  });
});

describe("a theme file sets these components", () => {
  it("reads a recipe and fields over it, field by field", () => {
    const t = themeOf(`[checkbox]\nstyle = "ballot"\non = "✔"\n[slider]\nknob = "◆"\n[frame]\nstyle = "ascii"\ncase = "upper"\n[caret]\nshape = "block"\nblink = false`);
    expect(t.skinProblems).toBeUndefined();
    expect(t.border).toBe("ascii");
    expect(t.skin).toEqual({ checkbox: { style: "ballot", on: "✔" }, slider: { knob: "◆" }, frame: { case: "upper" }, caret: { shape: "block", blink: false } });
    expect(look(t, CHECKBOX)).toEqual({ style: "ballot", left: " ", right: " ", on: "✔", off: "☐", some: "⊟" });
    expect(look(t, CARET).shape).toBe("block");
    const { g } = drawIn(t, DRAWN[0].states[1]);
    expect(rows(g)[0]).toMatch(/^\+- ◆ NOTES -+ 3 -\+$/);
  });

  it("refuses a glyph of the wrong width, an unknown field, a recipe it doesn't know — and keeps the rest", () => {
    const t = themeOf(`[checkbox]\non = "OK"\noff = "-"\n[tabs]\nstyle = "wavy"\nwobble = 1\n[frame]\nstyle = "zigzag"`);
    expect(t.skin?.checkbox).toEqual({ off: "-" });
    expect(t.skinProblems?.map((p) => p.key).sort()).toEqual(["checkbox.on", "frame.style", "tabs.style", "tabs.wobble"]);
    expect(t.skinProblems?.find((p) => p.key === "checkbox.on")?.reason).toMatch(/one cell/);
    expect(t.border).toBe("round");
  });

  it("the floor: two states that look the same, or a blank part that carries meaning, go back to the deck's", () => {
    const t = themeOf(`[checkbox]\non = "x"\noff = "x"\n[slider]\nknob = " "\n[tree]\nopen = "+"\nclosed = "+"`);
    expect(t.skin?.checkbox).toBeUndefined();
    expect(t.skin?.slider).toBeUndefined();
    expect(t.skin?.tree).toBeUndefined();
    expect(t.skinProblems?.map((p) => p.key)).toEqual(["checkbox.on/off/some", "slider.knob/track", "tree.open/closed"]);
  });

  it("a theme built on another inherits them; a tweak sets them (theme set checkbox.style dots)", async () => {
    const parent = themeOf(`[checkbox]\nstyle = "dots"`);
    const child = parseTheme(`[meta]\nname = "child"\n[checkbox]\nsome = "◑"`, parent, "vault");
    expect(child.skin?.checkbox).toEqual({ style: "dots", some: "◑" });
    const { applyTweaks } = await import("../src/core/theme");
    const tw = applyTweaks(nightshade, { "checkbox.style": "dots", "tabs.close": "x" });
    expect(tw.skin).toEqual({ checkbox: { style: "dots" }, tabs: { close: "x" } });
  });

  it("theme check lists what a theme restyles, and what it got wrong", () => {
    const ok = checkTheme(themeOf(`[meta]\nname = "t"\n[button]\nstyle = "bracket"\n[tree]\nlast = "╰"`));
    expect(ok.lines).toContain("restyles: button (bracket), tree");
    expect(ok.ok).toBe(true);
    const bad = checkTheme(themeOf(`[meta]\nname = "t"\n[choice]\nleft = "<<"`));
    expect(bad.ok).toBe(false);
    expect(bad.lines.join("\n")).toMatch(/choice\.left/);
  });

  it("icons: a theme's [icons] is what icon() answers", () => {
    const t = themeOf(`[icons]\nstyle = "ascii"\nfile_python = "π"`);
    const glyphs = iconGlyphs(t);
    expect(glyphs["file.python"]).toBe("π");
    expect(glyphs["file.folder"]).toBe(">");
    setIconGlyphs(glyphs);
    expect(icon("file.python")).toBe("π");
    setIconGlyphs({});
    expect(icon("file.python")).toBe("∿");
  });

  it("no built-in theme restyles them yet (signatures come in milestone 5)", () => {
    for (const th of THEMES) expect(th.skin, th.name).toBeUndefined();
  });

  it("the deck's own looks are today's", () => {
    expect(look(nightshade, CHECKBOX)).toEqual({ style: "brackets", left: "[", right: "]", on: "■", off: " ", some: "▪" });
    expect(look(nightshade, TABS)).toEqual({ style: "thick", lip: "▀", close: "×", more: "▾", sep: "│" });
    expect(look(nightshade, BUTTON)).toEqual({ style: "pad", left: " ", right: " ", fill: true });
    expect(look(nightshade, CHOICE)).toEqual({ style: "angle", left: "‹", right: "›" });
    expect(look(nightshade, SLIDER)).toEqual({ style: "line", track: "─", fill: "━", knob: "■" });
    expect(look(nightshade, TREE)).toMatchObject({ pipe: "│", branch: "├", last: "└", dash: "─", open: "▾", closed: "▸" });
    expect(look(nightshade, CARET)).toEqual({ shape: "bar", blink: true, width: 2 });
    expect(look(nightshade, TIP)).toEqual({ style: "deck", cmd: "❯", edge: 3, border: 1, radius: 2, dashed: true });
    expect(look(nightshade, STATUSBAR)).toEqual({ style: "line", sep: "│", drop: "┃" });
    expect(look(nightshade, LIST)).toEqual({ style: "fill", marker: "", glide: true });
  });
});
