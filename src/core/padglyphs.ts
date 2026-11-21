import { hex, type RGB } from "./color";

/**
 * GAMEPAD ICONS IN PIXEL ART — the buttons of the pad you hold, drawn like the rest
 * of the grid: Xbox's coloured A B X Y, PlayStation's ✕ ○ □ △, Nintendo's B A Y X in
 * their own places, the shoulders (LB / L1 / L), the triggers, the cross, the sticks,
 * start / select. The INFO panel and the hints use them ("◈ [A] open").
 *
 * Each icon is two cells wide: a 10 × 10 sprite whose left half is one code point and
 * right half the next, in the Private Use Area (U+E100…), drawn by the renderer with
 * rectangles (core/glyphs.ts → drawPadGlyph) — crisp at any font size, the colour is
 * the text's own (padIcon gives the button's colour: A green, ✕ blue…).
 *
 *   const icon = padIcon("south", padKind(deck.gamepad.name));   // { text, color, name }
 *   ui.text(x, y, icon.text, { fg: icon.color ?? c.fg });
 */

export type PadKind = "xbox" | "playstation" | "nintendo" | "generic";

/** a button by its place on the pad (the standard mapping), not its letter */
export type PadButton =
  | "south" | "east" | "west" | "north"
  | "lb" | "rb" | "lt" | "rt"
  | "select" | "start" | "ls" | "rs"
  | "up" | "down" | "left" | "right" | "dpad" | "home";

/** the Gamepad API's standard mapping: button i is STANDARD_BUTTONS[i] */
export const STANDARD_BUTTONS: PadButton[] = ["south", "east", "west", "north", "lb", "rb", "lt", "rt", "select", "start", "ls", "rs", "up", "down", "left", "right", "home"];

/**
 * Which pad it is, from the Gamepad API's id (what each browser engine writes there
 * differs: "Xbox Wireless Controller", "DualSense Wireless Controller",
 * "…(STANDARD GAMEPAD Vendor: 054c Product: 0ce6)", "045e-0b13-…").
 */
export function padKind(id: string): PadKind {
  const s = id.toLowerCase();
  if (/045e|xbox|xinput/.test(s)) return "xbox";
  // a DualShock 4 on a Mac calls itself just "Wireless Controller"
  if (/054c|playstation|dualsense|dualshock|ps[345]\b|^wireless controller\b/.test(s.trim())) return "playstation";
  if (/057e|nintendo|pro controller|joy-?con/.test(s)) return "nintendo";
  return "generic";
}

// ── the sprites ───────────────────────────────────────────────────────────────

const N = 10;
type Sprite = Uint8Array; // N × N, 1 = lit

/** 4 × 5 letters (knocked out of a disc) */
const BIG: Record<string, string[]> = {
  A: [".XX.", "X..X", "XXXX", "X..X", "X..X"],
  B: ["XXX.", "X..X", "XXX.", "X..X", "XXX."],
  X: ["X..X", "X..X", ".XX.", "X..X", "X..X"],
  Y: ["X..X", "X..X", ".XX.", ".XX.", ".XX."],
  L: ["X...", "X...", "X...", "X...", "XXXX"],
  R: ["XXX.", "X..X", "XXX.", "X.X.", "X..X"],
  "+": ["....", ".XX.", "XXXX", ".XX.", "...."],
  "-": ["....", "....", "XXXX", "....", "...."],
};
/** 3 × 5 letters (two side by side on a shoulder) */
const SMALL: Record<string, string[]> = {
  L: ["X..", "X..", "X..", "X..", "XXX"],
  R: ["XX.", "X.X", "XX.", "XX.", "X.X"],
  B: ["XX.", "X.X", "XX.", "X.X", "XX."],
  T: ["XXX", ".X.", ".X.", ".X.", ".X."],
  Z: ["XXX", "..X", ".X.", "X..", "XXX"],
  "1": [".X.", "XX.", ".X.", ".X.", "XXX"],
  "2": ["XX.", "..X", ".X.", "X..", "XXX"],
};
/** 6 × 6 shapes (knocked out of a disc) */
const SHAPE: Record<string, string[]> = {
  cross: ["X....X", ".X..X.", "..XX..", "..XX..", ".X..X.", "X....X"],
  circle: [".XXXX.", "X....X", "X....X", "X....X", "X....X", ".XXXX."],
  square: ["XXXXXX", "X....X", "X....X", "X....X", "X....X", "XXXXXX"],
  triangle: ["..XX..", "..XX..", ".X..X.", ".X..X.", "X....X", "XXXXXX"],
  view: ["XXXX..", "X..X..", "X.XXXX", "XXXX.X", "..X..X", "..XXXX"],
  menu: ["......", "XXXXXX", "......", "XXXXXX", "......", "XXXXXX"],
  share: ["..XX..", ".XXXX.", "X.XX.X", "..XX..", "..XX..", "..XX.."],
  home: ["..XX..", ".XXXX.", "XXXXXX", ".X..X.", ".X..X.", ".XXXX."],
};

const blank = (): Sprite => new Uint8Array(N * N);
const set = (s: Sprite, c: number, r: number, v: number) => c >= 0 && c < N && r >= 0 && r < N && (s[r * N + c] = v);
const at = (s: Sprite, c: number, r: number) => (c >= 0 && c < N && r >= 0 && r < N ? s[r * N + c] : 0);

/** stamp a pattern at (c, r) with value v (0 knocks out) */
function stamp(s: Sprite, pat: string[], c: number, r: number, v: number): Sprite {
  pat.forEach((row, y) => [...row].forEach((ch, x) => ch === "X" && set(s, c + x, r + y, v)));
  return s;
}

function disc(): Sprite {
  const s = blank();
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (Math.hypot(c + 0.5 - 5, r + 0.5 - 5) <= 5.05) set(s, c, r, 1);
  return s;
}
const letterDisc = (ch: string) => stamp(disc(), BIG[ch], 3, 2, 0);
const shapeDisc = (name: string) => stamp(disc(), SHAPE[name], 2, 2, 0);

/** a shoulder or trigger: a pill with two small letters knocked out (LB, R2, ZL…) */
function pill(text: string): Sprite {
  const s = blank();
  for (let r = 2; r <= 8; r++) for (let c = 0; c < N; c++) if (!((r === 2 || r === 8) && (c === 0 || c === N - 1))) set(s, c, r, 1);
  const letters = [...text];
  if (letters.length === 1) return stamp(s, BIG[letters[0]] ?? SMALL[letters[0]], 3, 3, 0);
  stamp(s, SMALL[letters[0]], 1, 3, 0);
  return stamp(s, SMALL[letters[1]], 6, 3, 0);
}

/** the cross; `lit`: the arm pressed (filled), the others in outline — or all filled */
function dpad(lit: "up" | "down" | "left" | "right" | "all"): Sprite {
  const shape = blank();
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if ((c >= 3 && c <= 6) || (r >= 3 && r <= 6)) set(shape, c, r, 1);
  if (lit === "all") {
    for (const [c, r] of [[4, 4], [5, 4], [4, 5], [5, 5]]) set(shape, c, r, 0);
    return shape;
  }
  const arm = (c: number, r: number) => (r <= 2 ? "up" : r >= 7 ? "down" : c <= 2 ? "left" : c >= 7 ? "right" : "mid");
  const s = blank();
  for (let r = 0; r < N; r++)
    for (let c = 0; c < N; c++) {
      if (!at(shape, c, r)) continue;
      const edge = !at(shape, c - 1, r) || !at(shape, c + 1, r) || !at(shape, c, r - 1) || !at(shape, c, r + 1);
      if (arm(c, r) === lit || edge) set(s, c, r, 1);
    }
  return s;
}

/** a stick: a ring with its letter in the middle */
function stick(letter: "L" | "R"): Sprite {
  const s = blank();
  for (let r = 0; r < N; r++)
    for (let c = 0; c < N; c++) {
      const d = Math.hypot(c + 0.5 - 5, r + 0.5 - 5);
      if (d <= 5.05 && d >= 3.9) set(s, c, r, 1);
    }
  return stamp(s, SMALL[letter], 4, 3, 1);
}

/** every sprite, by name; its place in this list is its code point */
const SPRITES: [string, () => Sprite][] = [
  ["a", () => letterDisc("A")], ["b", () => letterDisc("B")], ["x", () => letterDisc("X")], ["y", () => letterDisc("Y")],
  ["cross", () => shapeDisc("cross")], ["circle", () => shapeDisc("circle")], ["square", () => shapeDisc("square")], ["triangle", () => shapeDisc("triangle")],
  ["lb", () => pill("LB")], ["rb", () => pill("RB")], ["lt", () => pill("LT")], ["rt", () => pill("RT")],
  ["l1", () => pill("L1")], ["r1", () => pill("R1")], ["l2", () => pill("L2")], ["r2", () => pill("R2")],
  ["l", () => pill("L")], ["r", () => pill("R")], ["zl", () => pill("ZL")], ["zr", () => pill("ZR")],
  ["dpad", () => dpad("all")], ["up", () => dpad("up")], ["down", () => dpad("down")], ["left", () => dpad("left")], ["right", () => dpad("right")],
  ["ls", () => stick("L")], ["rs", () => stick("R")],
  ["view", () => shapeDisc("view")], ["menu", () => shapeDisc("menu")], ["share", () => shapeDisc("share")], ["options", () => shapeDisc("menu")],
  ["minus", () => letterDisc("-")], ["plus", () => letterDisc("+")], ["home", () => shapeDisc("home")],
];
export const PAD_GLYPH_BASE = 0xe100;
const INDEX = new Map(SPRITES.map(([name], i) => [name, i]));
const CACHE: (Sprite | undefined)[] = [];
function sprite(i: number): Sprite | undefined {
  return (CACHE[i] ??= SPRITES[i]?.[1]());
}

/** The two characters that draw sprite `name` ("" if there's none). */
export function padGlyph(name: string): string {
  const i = INDEX.get(name);
  return i === undefined ? "" : String.fromCodePoint(PAD_GLYPH_BASE + i * 2, PAD_GLYPH_BASE + i * 2 + 1);
}

export function isPadGlyph(cp: number): boolean {
  return cp >= PAD_GLYPH_BASE && cp < PAD_GLYPH_BASE + SPRITES.length * 2;
}

// ── which icon for which button on which pad ─────────────────────────────────

const C = {
  green: hex("#5fb83c"), red: hex("#e5483b"), blue: hex("#3a86e8"), yellow: hex("#f0c02c"),
  psBlue: hex("#7fb4ea"), psRed: hex("#ec6a6d"), psPink: hex("#dc93cb"), psTeal: hex("#3fc4a6"),
};

/** [sprite, name shown in words, colour] per button, per pad */
const MAP: Record<PadKind, Partial<Record<PadButton, [string, string, RGB | null]>>> = {
  xbox: {
    south: ["a", "A", C.green], east: ["b", "B", C.red], west: ["x", "X", C.blue], north: ["y", "Y", C.yellow],
    lb: ["lb", "LB", null], rb: ["rb", "RB", null], lt: ["lt", "LT", null], rt: ["rt", "RT", null],
    select: ["view", "View", null], start: ["menu", "Menu", null], home: ["home", "Xbox", null],
  },
  playstation: {
    south: ["cross", "✕", C.psBlue], east: ["circle", "○", C.psRed], west: ["square", "□", C.psPink], north: ["triangle", "△", C.psTeal],
    lb: ["l1", "L1", null], rb: ["r1", "R1", null], lt: ["l2", "L2", null], rt: ["r2", "R2", null],
    select: ["share", "Create", null], start: ["options", "Options", null], home: ["home", "PS", null],
  },
  // Nintendo's letters sit elsewhere: the bottom button is B, the right one A
  nintendo: {
    south: ["b", "B", null], east: ["a", "A", null], west: ["y", "Y", null], north: ["x", "X", null],
    lb: ["l", "L", null], rb: ["r", "R", null], lt: ["zl", "ZL", null], rt: ["zr", "ZR", null],
    select: ["minus", "−", null], start: ["plus", "+", null], home: ["home", "Home", null],
  },
  generic: {
    south: ["a", "A", null], east: ["b", "B", null], west: ["x", "X", null], north: ["y", "Y", null],
    lb: ["lb", "LB", null], rb: ["rb", "RB", null], lt: ["lt", "LT", null], rt: ["rt", "RT", null],
    select: ["view", "Select", null], start: ["menu", "Start", null], home: ["home", "Home", null],
  },
};
/** the same everywhere */
const COMMON: Partial<Record<PadButton, [string, string]>> = {
  up: ["up", "↑"], down: ["down", "↓"], left: ["left", "←"], right: ["right", "→"], dpad: ["dpad", "✛"], ls: ["ls", "L stick"], rs: ["rs", "R stick"],
};

/**
 * A button's icon on this pad: `text` (two cells), its `color` (null: the theme's
 * text colour) and its `name` in words, for the screen readers and the narrow places.
 */
export function padIcon(button: PadButton, kind: PadKind): { text: string; color: RGB | null; name: string } {
  const own = MAP[kind][button];
  if (own) return { text: padGlyph(own[0]), color: own[2], name: own[1] };
  const common = COMMON[button];
  return common ? { text: padGlyph(common[0]), color: null, name: common[1] } : { text: "", color: null, name: button };
}

// ── drawing (core/glyphs.ts calls this for U+E100…) ──────────────────────────

/**
 * Draw this cell's half of a pad icon: square pixels as big as fit in the two cells,
 * centred. Returns false for a code point that isn't one of ours.
 */
export function drawPadGlyph(ctx: CanvasRenderingContext2D, cp: number, x: number, y: number, w: number, h: number): boolean {
  if (!isPadGlyph(cp)) return false;
  const k = cp - PAD_GLYPH_BASE;
  const s = sprite(k >> 1);
  if (!s) return false;
  const half = k & 1;
  const p = Math.min((2 * w) / N, h / N);
  const ox = (2 * w - N * p) / 2 - half * w; // the icon's left edge, from this cell's left edge
  const oy = (h - N * p) / 2;
  for (let r = 0; r < N; r++) {
    const y0 = Math.round(y + oy + r * p), y1 = Math.round(y + oy + (r + 1) * p);
    for (let c = 0; c < N; c++) {
      if (!s[r * N + c]) continue;
      const x0 = Math.round(x + ox + c * p), x1 = Math.round(x + ox + (c + 1) * p);
      if (x1 <= x || x0 >= x + w) continue; // the other cell's half
      ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    }
  }
  return true;
}

/** For tests and `debug pad`: a sprite as text rows ("X" lit, "." not). */
export function spriteRows(name: string): string[] {
  const i = INDEX.get(name);
  const s = i === undefined ? undefined : sprite(i);
  if (!s) return [];
  return Array.from({ length: N }, (_, r) => Array.from({ length: N }, (_, c) => (s[r * N + c] ? "X" : ".")).join(""));
}

export const PAD_SPRITES = SPRITES.map(([name]) => name);
