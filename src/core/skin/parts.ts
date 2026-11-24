import { bool, choice, glyph, int } from "./fields";
import { ICONS, type IconId } from "./icons";
import { type Component, defineComponent, distinctRule, type Recipes, visibleRule } from "./registry";

/**
 * COMPONENTS v2.0 (themes v2, milestone 3 — docs/THEMES_V2_PLAN.md § 2.3): the frames, tabs,
 * controls, list, caret, tree, icons, status bar and tip. Each is a TOML table of its name
 * ([checkbox] on = "✔") and a `theme set` prefix (checkbox.on). Most have a `style`: one of
 * their recipes (the deck's own looks, by name), which a theme may then change field by field.
 *
 * What a theme can't do here (§ 3): change a size (a glyph is always as wide as the deck's, so
 * layout and every click area stay put), make two states look the same, or blank a part that
 * carries meaning. Colours stay the theme's tokens ([ui]): these tables only change shapes.
 */

// ── frame ────────────────────────────────────────────────────────────────────

export interface FrameLook {
  tl: string; tr: string; bl: string; br: string; h: string; v: string;
  case: string;
  align: string;
  mark: boolean;
  info: boolean;
  focus: string;
}

const edge = (doc: string) => glyph("", `${doc} ("": the style's)`, { blank: true });

/** HOW A PANEL'S FRAME LOOKS (ui.box) — its style ([frame] style: round, single…) picks the chars, these change them */
export const FRAME = defineComponent<FrameLook>({
  id: "frame",
  since: 3,
  label: "frames",
  group: "shape",
  doc: "the frame round every panel (its `style` picks the chars: round · single · heavy · double · dashed · ascii)",
  fields: {
    tl: edge("top-left corner"), tr: edge("top-right corner"), bl: edge("bottom-left corner"), br: edge("bottom-right corner"),
    h: edge("top and bottom edge"), v: edge("left and right edge"),
    case: choice(["as-is", "lower", "upper"], "as-is", "the title's letters"),
    align: choice(["left", "center"], "left", "where the title sits on the top edge"),
    mark: bool(true, "the [glyphs] mark before a focused frame's title"),
    info: bool(true, "the small text on the right of the top edge"),
    focus: choice(["color", "both"], "color", "how a focused frame shows it: its colour, or its colour and heavier chars"),
  },
  floor: [],
});

// ── tabs ─────────────────────────────────────────────────────────────────────

export interface TabsLook {
  style: string;
  lip: string;
  close: string;
  more: string;
  sep: string;
}

const TABS_RECIPES: Recipes<TabsLook> = {
  thick: {},
  thin: { lip: "▔" },
  flat: { lip: " " },
};

/** HOW THE TAB STRIP LOOKS (workspace/tabstrip.ts): the bar under each tab, its ×, the ▾ +N list */
export const TABS = defineComponent<TabsLook>({
  id: "tabs",
  since: 3,
  label: "tabs",
  group: "shape",
  doc: "the tab strip on top of a frame",
  fields: {
    style: choice(Object.keys(TABS_RECIPES), "thick", "thick (a half-block bar under each tab) · thin · flat (colours only)"),
    lip: glyph("▀", "the bar under a tab, on the frame's line"),
    close: glyph("×", "a tab's close mark"),
    more: glyph("▾", "the list of the tabs that don't fit"),
    sep: glyph("│", "the line between the pages and the documents"),
  },
  recipes: TABS_RECIPES,
  floor: [visibleRule<TabsLook>(["close", "more"], "a tab's × and the ▾ list")],
});

// ── button ───────────────────────────────────────────────────────────────────

export interface ButtonLook {
  style: string;
  left: string;
  right: string;
  fill: boolean;
}

const BUTTON_RECIPES: Recipes<ButtonLook> = {
  pad: {},
  bracket: { left: "[", right: "]" },
  angle: { left: "⟨", right: "⟩" },
  bare: { fill: false },
};

/** HOW A BUTTON LOOKS (ui.button): " save " on the highlight; lit when hovered or selected */
export const BUTTON = defineComponent<ButtonLook>({
  id: "button",
  since: 3,
  label: "buttons",
  group: "shape",
  doc: "a button: its ends and its ground",
  fields: {
    style: choice(Object.keys(BUTTON_RECIPES), "pad", "pad (a filled pad) · bracket [ save ] · angle ⟨ save ⟩ · bare (no ground until hovered)"),
    left: glyph(" ", "the cell before the label"),
    right: glyph(" ", "the cell after the label"),
    fill: bool(true, "the highlight ground behind an idle button"),
  },
  recipes: BUTTON_RECIPES,
  floor: [],
});

// ── checkbox ─────────────────────────────────────────────────────────────────

export interface CheckboxLook {
  style: string;
  left: string;
  right: string;
  on: string;
  off: string;
  some: string;
}

const CHECKBOX_RECIPES: Recipes<CheckboxLook> = {
  brackets: {},
  ballot: { left: " ", right: " ", on: "☑", off: "☐", some: "⊟" },
  dots: { left: " ", right: " ", on: "●", off: "○", some: "◐" },
};

/** HOW A CHECKBOX LOOKS (ui/controls.ts): [■] on, [ ] off, [▪] some — always three cells */
export const CHECKBOX = defineComponent<CheckboxLook>({
  id: "checkbox",
  since: 3,
  label: "checkboxes",
  group: "shape",
  doc: "a box you tick",
  fields: {
    style: choice(Object.keys(CHECKBOX_RECIPES), "brackets", "brackets [■] · ballot ☑ · dots ●"),
    left: glyph("[", "the cell before the tick"),
    right: glyph("]", "the cell after the tick"),
    on: glyph("■", "ticked"),
    off: glyph(" ", "not ticked"),
    some: glyph("▪", "partly ticked (some of a group)"),
  },
  recipes: CHECKBOX_RECIPES,
  floor: [distinctRule<CheckboxLook>(["on", "off", "some"], "on, off and some")],
});

// ── choice ───────────────────────────────────────────────────────────────────

export interface ChoiceLook {
  style: string;
  left: string;
  right: string;
}

const CHOICE_RECIPES: Recipes<ChoiceLook> = {
  angle: {},
  triangle: { left: "◂", right: "▸" },
  ascii: { left: "<", right: ">" },
};

/** HOW A CHOICE LOOKS (ui/controls.ts): ‹ value › */
export const CHOICE = defineComponent<ChoiceLook>({
  id: "choice",
  since: 3,
  label: "choices",
  group: "shape",
  doc: "one value among several, with an arrow each side",
  fields: {
    style: choice(Object.keys(CHOICE_RECIPES), "angle", "angle ‹ › · triangle ◂ ▸ · ascii < >"),
    left: glyph("‹", "the back arrow"),
    right: glyph("›", "the forward arrow"),
  },
  recipes: CHOICE_RECIPES,
  floor: [visibleRule<ChoiceLook>(["left", "right"], "the arrows"), distinctRule<ChoiceLook>(["left", "right"], "back and forward")],
});

// ── slider ───────────────────────────────────────────────────────────────────

export interface SliderLook {
  style: string;
  track: string;
  fill: string;
  knob: string;
}

const SLIDER_RECIPES: Recipes<SliderLook> = {
  line: {},
  blocks: { track: "░", fill: "▓", knob: "█" },
  dots: { track: "·", fill: "•", knob: "●" },
};

/** HOW A SLIDER LOOKS (ui/slider.ts): ━━━━■──── */
export const SLIDER = defineComponent<SliderLook>({
  id: "slider",
  since: 3,
  label: "sliders",
  group: "shape",
  doc: "a value along a track",
  fields: {
    style: choice(Object.keys(SLIDER_RECIPES), "line", "line ━■─ · blocks ▓█░ · dots •●·"),
    track: glyph("─", "the part after the value"),
    fill: glyph("━", "the part up to the value"),
    knob: glyph("■", "the handle"),
  },
  recipes: SLIDER_RECIPES,
  floor: [visibleRule<SliderLook>(["knob", "track"], "the handle and the track"), distinctRule<SliderLook>(["knob", "track"], "the handle and the track")],
});

// ── list ─────────────────────────────────────────────────────────────────────

export interface ListLook {
  style: string;
  marker: string;
  glide: boolean;
}

const LIST_RECIPES: Recipes<ListLook> = {
  fill: {},
  bar: { marker: "▌" },
  caret: { marker: "›" },
};

/** HOW A LIST SHOWS ITS SELECTED ROW (ui/list.ts): always its fill, and maybe a mark on its first cell */
export const LIST = defineComponent<ListLook>({
  id: "list",
  since: 3,
  label: "lists",
  group: "shape",
  doc: "the selected row of a list",
  fields: {
    style: choice(Object.keys(LIST_RECIPES), "fill", "fill (the row lit) · bar ▌ · caret ›"),
    marker: glyph("", "a mark on the selected row's first cell (\"\": none)", { blank: true }),
    glide: bool(true, "the selection fades from row to row"),
  },
  recipes: LIST_RECIPES,
  floor: [],
});

// ── caret ────────────────────────────────────────────────────────────────────

export interface CaretLook {
  shape: string;
  blink: boolean;
  width: number;
}

/** HOW THE TEXT CURSOR LOOKS (core/renderer.ts setCaret): a thin gliding bar */
export const CARET = defineComponent<CaretLook>({
  id: "caret",
  since: 3,
  label: "text cursor",
  group: "shape",
  doc: "the text cursor (desktop deck)",
  fields: {
    shape: choice(["bar", "block", "underline", "hollow"], "bar", "bar · block · underline · hollow"),
    blink: bool(true, "it breathes a few times after a key, then stays solid"),
    width: int(1, 4, 2, "the bar's or the line's thickness, in pixels"),
  },
  floor: [],
});

// ── tree ─────────────────────────────────────────────────────────────────────

export interface TreeLook {
  style: string;
  pipe: string;
  branch: string;
  last: string;
  dash: string;
  open: string;
  closed: string;
}

const TREE_RECIPES: Recipes<TreeLook> = {
  lines: {},
  round: { last: "╰" },
  ascii: { pipe: "|", branch: "|", last: "`", dash: "-", open: "v", closed: ">" },
};

/** HOW THE VAULT TREE LOOKS (workspace/sidebar.ts): │ ├─ └─ and the folders' ▾ ▸ */
export const TREE = defineComponent<TreeLook>({
  id: "tree",
  since: 3,
  label: "tree",
  group: "shape",
  doc: "the vault's tree guides and folder marks",
  fields: {
    style: choice(Object.keys(TREE_RECIPES), "lines", "lines ├─ · round ╰─ · ascii (plain signs)"),
    pipe: glyph("│", "an open branch above"),
    branch: glyph("├", "an item with more after it"),
    last: glyph("└", "the last item of its folder"),
    dash: glyph("─", "the stroke to the item"),
    open: glyph("▾", "an open folder"),
    closed: glyph("▸", "a closed folder"),
  },
  recipes: TREE_RECIPES,
  floor: [distinctRule<TreeLook>(["open", "closed"], "an open and a closed folder"), visibleRule<TreeLook>(["open", "closed"], "the folder marks")],
});

// ── icons ────────────────────────────────────────────────────────────────────

/** a field per icon id: "file.python" → file_python (TOML keys and `theme set` stay simple) */
export const iconField = (id: IconId): string => id.replace(/\./g, "_");

export type IconsLook = { style: string } & Record<string, string>;

const ASCII_ICONS: Partial<Record<IconId, string>> = {
  "file.folder": ">", "file.note": "=", "file.python": "~", "file.js": "j", "file.script": "$", "file.code": "#",
  "file.config": "*", "file.table": "+", "file.web": "@", "file.text": "=", "file.image": "%", "file.pdf": "&",
  "file.audio": "!", "file.video": ">", "file.archive": "z", "file.canvas": "^", "file.other": ".",
};

const ICONS_RECIPES: Recipes<IconsLook> = {
  deck: {},
  ascii: Object.fromEntries(Object.entries(ASCII_ICONS).map(([id, g]) => [iconField(id as IconId), g])) as Partial<IconsLook>,
};

/** WHICH GLYPH EACH ICON ID SHOWS (core/skin/icons.ts): the deck asks icon("file.python"), the theme answers */
export const ICONS_COMPONENT = defineComponent<IconsLook>({
  id: "icons",
  since: 3,
  label: "icons",
  group: "shape",
  doc: "the glyph of each icon (file types…), by its id",
  fields: {
    style: choice(Object.keys(ICONS_RECIPES), "deck", "deck (the deck's own) · ascii (plain letters and signs)"),
    ...Object.fromEntries((Object.entries(ICONS) as [IconId, string][]).map(([id, g]) => [iconField(id), glyph(g, `icon ${id}`)])),
  } as Component<IconsLook>["fields"],
  recipes: ICONS_RECIPES,
  floor: [],
});

// ── status bar ───────────────────────────────────────────────────────────────

export interface StatusbarLook {
  style: string;
  sep: string;
  drop: string;
}

const STATUSBAR_RECIPES: Recipes<StatusbarLook> = {
  line: {},
  dots: { sep: "·" },
  blank: { sep: " " },
};

/** HOW THE STATUS BAR LOOKS (workspace/chrome.ts): the line between its items */
export const STATUSBAR = defineComponent<StatusbarLook>({
  id: "statusbar",
  since: 3,
  label: "status bar",
  group: "shape",
  doc: "the status bar at the bottom",
  fields: {
    style: choice(Object.keys(STATUSBAR_RECIPES), "line", "line │ · dots · · blank"),
    sep: glyph("│", "between two items (and on the top row, before the clock)"),
    drop: glyph("┃", "where a dragged item would land"),
  },
  recipes: STATUSBAR_RECIPES,
  floor: [visibleRule<StatusbarLook>(["drop"], "where a dragged item lands")],
});

// ── tip ──────────────────────────────────────────────────────────────────────

export interface TipLook {
  style: string;
  cmd: string;
  edge: number;
  border: number;
  radius: number;
  dashed: boolean;
}

const TIP_RECIPES: Recipes<TipLook> = {
  deck: {},
  plain: { edge: 1, radius: 0, dashed: false },
  round: { edge: 1, radius: 8 },
};

/** HOW A HOVER TIP LOOKS (ui/tipview.ts): a box at the pointer, the command it runs under its text */
export const TIP = defineComponent<TipLook>({
  id: "tip",
  since: 3,
  label: "tips",
  group: "shape",
  doc: "the tip shown when the pointer rests on something",
  fields: {
    style: choice(Object.keys(TIP_RECIPES), "deck", "deck (a thicker accent edge) · plain · round"),
    cmd: glyph("❯", "before the command a tip shows"),
    edge: int(1, 6, 3, "the left edge's thickness, in pixels"),
    border: int(1, 3, 1, "the other edges' thickness, in pixels"),
    radius: int(0, 12, 2, "corners, in pixels"),
    dashed: bool(true, "a dashed line between the text and the command (else solid)"),
  },
  recipes: TIP_RECIPES,
  floor: [],
});

/** the components of milestone 3, in the order the docs list them */
export const PARTS = [FRAME, TABS, BUTTON, CHECKBOX, CHOICE, SLIDER, LIST, CARET, TREE, ICONS_COMPONENT, STATUSBAR, TIP] as unknown as Component<object>[];
