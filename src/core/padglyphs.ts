import { css, hex, type RGB } from "./color";
import { PAD } from "./skin/components";
import { defaults, resolve } from "./skin/registry";

/**
 * GAMEPAD ICONS — the buttons of the pad you hold, drawn like the rest of the grid: Xbox's
 * coloured A B X Y, PlayStation's ✕ ○ □ △ on dark buttons, Nintendo's B A Y X in their own
 * places, the shoulders (LB / L1 / L), the triggers, the cross, the sticks, start / select.
 * The hints and every shortcut on screen use them while a pad is used (ui/keyicons.ts).
 *
 * Each icon is two cells wide (or one, smaller: padGlyphSmall): its left half is one code
 * point and its right half the next, in the Private Use Area (U+E100…), drawn by the
 * renderer as clean shapes — circles, rounded bodies, strokes — with the letter in the deck's
 * own font (core/glyphs.ts → drawPadGlyph), crisp at any size. The colour is the text's own
 * (padIcon gives the button's: A green, ✕ blue…); the letter is dark or white, whichever reads.
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

// ── the icons ─────────────────────────────────────────────────────────────────

/** every icon, by name; its place in this list is its code point (core/glyphs.ts draws it: drawPadGlyph) */
const NAMES = [
  "a", "b", "x", "y", "cross", "circle", "square", "triangle",
  "lb", "rb", "lt", "rt", "l1", "r1", "l2", "r2", "l", "r", "zl", "zr",
  "dpad", "up", "down", "left", "right", "ls", "rs",
  "view", "menu", "share", "options", "minus", "plus", "home",
] as const;
export const PAD_GLYPH_BASE = 0xe100;
const INDEX = new Map<string, number>(NAMES.map((name, i) => [name, i]));

/** The two characters that draw sprite `name` ("" if there's none). */
export function padGlyph(name: string): string {
  const i = INDEX.get(name);
  return i === undefined ? "" : String.fromCodePoint(PAD_GLYPH_BASE + i * 2, PAD_GLYPH_BASE + i * 2 + 1);
}

/** the same icons in ONE cell (smaller), where a shortcut written in one character stands (⏎, ↑) */
export const PAD_GLYPH_SMALL = 0xe180;

/** The one character that draws sprite `name` in a single cell, smaller ("" if there's none). */
export function padGlyphSmall(name: string): string {
  const i = INDEX.get(name);
  return i === undefined ? "" : String.fromCodePoint(PAD_GLYPH_SMALL + i);
}

export function isPadGlyph(cp: number): boolean {
  return (cp >= PAD_GLYPH_BASE && cp < PAD_GLYPH_BASE + NAMES.length * 2) || (cp >= PAD_GLYPH_SMALL && cp < PAD_GLYPH_SMALL + NAMES.length);
}

// ── which icon for which button on which pad ─────────────────────────────────

const C = {
  // the letters on them: dark on green and yellow, white on red and blue — each ≥ 4.5:1
  green: hex("#5fbf3f"), red: hex("#cf3a30"), blue: hex("#2b72cf"), yellow: hex("#f2c230"),
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
export function padIcon(button: PadButton, kind: PadKind): { text: string; color: RGB | null; name: string; small: string } {
  const own = MAP[kind][button];
  if (own) return { text: padGlyph(own[0]), color: own[2], name: own[1], small: padGlyphSmall(own[0]) };
  const common = COMMON[button];
  return common ? { text: padGlyph(common[0]), color: null, name: common[1], small: padGlyphSmall(common[0]) } : { text: "", color: null, name: button, small: "" };
}

// ── drawing (core/glyphs.ts calls this for U+E100…) ──────────────────────────

/**
 * HOW THE PAD'S BUTTONS LOOK — a theme hook (docs/THEMES.md, Theme.pad, any part of it): what a
 * theme leaves out is the deck's own. The buttons' colours (A green…) stay the pad maker's.
 */
export interface PadLook {
  /** the letter on a light button, and on a dark one (whichever reads is used) */
  inkDark: RGB;
  inkLight: RGB;
  /** a PlayStation button's body (its symbol is drawn in its colour on it) */
  psBody: RGB;
  /** how strongly the thin ring round a PlayStation button shows, 0–1 */
  ring: number;
  /** the letters' weight (100–900) */
  weight: number;
  /** the icon's size, as a share of the cell's height */
  size: number;
}
/** the deck's own pad look — the defaults of the skin's `pad` component */
export const PAD_LOOK: PadLook = defaults(PAD);

let LOOK: PadLook = PAD_LOOK;
/** A theme's pad look (its own parts over the deck's, kept in bounds), for every button drawn from now on. */
export function setPadLook(own?: Partial<PadLook>): void {
  LOOK = resolve(PAD, own);
}

/** the deck's font, for the letters on the buttons (the renderer says it: setPadFont) */
let FONT = "ui-monospace, monospace";
export function setPadFont(family: string): void {
  FONT = family;
}

/** the ink on a button: dark on a light button, light on a dark one */
function inkOn(fill: string): string {
  const n = parseInt(fill.slice(1, 7), 16);
  const lum = (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
  return css(lum > 0.55 ? LOOK.inkDark : LOOK.inkLight);
}

function rr(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, r: number, rTop = r): void {
  ctx.beginPath();
  ctx.moveTo(x0 + rTop, y0);
  ctx.arcTo(x1, y0, x1, y1, rTop);
  ctx.arcTo(x1, y1, x0, y1, r);
  ctx.arcTo(x0, y1, x0, y0, r);
  ctx.arcTo(x0, y0, x1, y0, rTop);
  ctx.closePath();
}

function label(ctx: CanvasRenderingContext2D, text: string, cx: number, cy: number, size: number, color: string): void {
  ctx.fillStyle = color;
  ctx.font = `${LOOK.weight} ${Math.round(size)}px ${FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  // the font's middle sits a hair low for capitals: lifted by 4 % of the size
  ctx.fillText(text, cx, cy + size * 0.04);
}

/**
 * Draw icon `name` in the square box (bx, by, size): clean shapes, the button's colour (the
 * context's fill colour as the atlas set it), its letter in the deck's font.
 */
function drawIcon(ctx: CanvasRenderingContext2D, name: string, bx: number, by: number, size: number): void {
  const fill = typeof ctx.fillStyle === "string" ? ctx.fillStyle : "#ffffff";
  const ink = inkOn(fill);
  const cx = bx + size / 2, cy = by + size / 2;
  const R = size * 0.46;
  const stroke = Math.max(1.5, size * 0.1);
  const disc = (color: string) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.fill();
  };
  const line = (color: string, w = stroke) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = w;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  };
  switch (name) {
    case "a": case "b": case "x": case "y":
      disc(fill);
      return label(ctx, name.toUpperCase(), cx, cy, size * 0.62, ink);
    case "minus": case "plus":
      disc(fill);
      line(ink);
      ctx.beginPath();
      ctx.moveTo(cx - R * 0.45, cy);
      ctx.lineTo(cx + R * 0.45, cy);
      if (name === "plus") (ctx.moveTo(cx, cy - R * 0.45), ctx.lineTo(cx, cy + R * 0.45));
      return void ctx.stroke();
    case "cross": case "circle": case "square": case "triangle": {
      // PlayStation: a dark button, the symbol in its colour, a thin ring of it
      disc(css(LOOK.psBody));
      line(fill, Math.max(1, size * 0.045));
      ctx.beginPath();
      ctx.arc(cx, cy, R - ctx.lineWidth / 2, 0, Math.PI * 2);
      const alpha = ctx.globalAlpha;
      ctx.globalAlpha = alpha * LOOK.ring;
      ctx.stroke();
      ctx.globalAlpha = alpha;
      line(fill);
      const k = R * 0.42;
      ctx.beginPath();
      if (name === "cross") (ctx.moveTo(cx - k, cy - k), ctx.lineTo(cx + k, cy + k), ctx.moveTo(cx + k, cy - k), ctx.lineTo(cx - k, cy + k));
      else if (name === "circle") ctx.arc(cx, cy, k * 1.05, 0, Math.PI * 2);
      else if (name === "square") ctx.rect(cx - k * 0.92, cy - k * 0.92, k * 1.84, k * 1.84);
      else (ctx.moveTo(cx, cy - k * 1.05), ctx.lineTo(cx + k * 1.1, cy + k * 0.8), ctx.lineTo(cx - k * 1.1, cy + k * 0.8), ctx.closePath());
      return void ctx.stroke();
    }
    case "lb": case "rb": case "l1": case "r1": case "l": case "r":
    case "lt": case "rt": case "l2": case "r2": case "zl": case "zr": {
      // a shoulder: a wide rounded body; a trigger: its top more rounded, like the real thing
      const trigger = ["lt", "rt", "l2", "r2", "zl", "zr"].includes(name);
      const w = size * 0.96, h = size * 0.62;
      ctx.fillStyle = fill;
      rr(ctx, cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2, h * 0.28, trigger ? h * 0.5 : h * 0.28);
      ctx.fill();
      return label(ctx, name.toUpperCase(), cx, cy + (trigger ? h * 0.06 : 0), h * (name.length > 1 ? 0.72 : 0.8), ink);
    }
    case "dpad": case "up": case "down": case "left": case "right": {
      // the cross: the arm pressed filled, the others outlined — or all filled
      const a = size * 0.15, L = size * 0.46;
      const arm = (dx: number, dy: number) => {
        const x0 = dx ? (dx < 0 ? cx - L : cx + a) : cx - a, x1 = dx ? (dx < 0 ? cx - a : cx + L) : cx + a;
        const y0 = dy ? (dy < 0 ? cy - L : cy + a) : cy - a, y1 = dy ? (dy < 0 ? cy - a : cy + L) : cy + a;
        return [x0, y0, x1, y1] as const;
      };
      const arms: [string, number, number][] = [["up", 0, -1], ["down", 0, 1], ["left", -1, 0], ["right", 1, 0]];
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.rect(cx - a, cy - a, a * 2, a * 2);
      ctx.fill();
      for (const [n, dx, dy] of arms) {
        const [x0, y0, x1, y1] = arm(dx, dy);
        rr(ctx, x0, y0, x1, y1, a * 0.35);
        if (name === "dpad" || name === n) ctx.fill();
        else {
          line(fill, Math.max(1, size * 0.06));
          ctx.stroke();
        }
      }
      return;
    }
    case "ls": case "rs":
      line(fill, Math.max(1.5, size * 0.09));
      ctx.beginPath();
      ctx.arc(cx, cy, R - ctx.lineWidth / 2, 0, Math.PI * 2);
      ctx.stroke();
      return label(ctx, name[0].toUpperCase(), cx, cy, size * 0.5, fill);
    case "view": case "menu": case "share": case "options": case "home": {
      disc(fill);
      line(ink, Math.max(1, size * 0.07));
      const k = R * 0.48;
      ctx.beginPath();
      if (name === "menu" || name === "options") for (const dy of [-0.6, 0, 0.6]) (ctx.moveTo(cx - k, cy + dy * k), ctx.lineTo(cx + k, cy + dy * k));
      else if (name === "view") (ctx.rect(cx - k, cy - k * 0.7, k * 1.2, k), ctx.rect(cx - k * 0.2, cy - k * 0.3, k * 1.2, k));
      else if (name === "share") (ctx.moveTo(cx, cy + k), ctx.lineTo(cx, cy - k), ctx.moveTo(cx - k * 0.6, cy - k * 0.4), ctx.lineTo(cx, cy - k), ctx.lineTo(cx + k * 0.6, cy - k * 0.4));
      else (ctx.moveTo(cx - k, cy), ctx.lineTo(cx, cy - k), ctx.lineTo(cx + k, cy), ctx.moveTo(cx - k * 0.7, cy - k * 0.2), ctx.lineTo(cx - k * 0.7, cy + k), ctx.lineTo(cx + k * 0.7, cy + k), ctx.lineTo(cx + k * 0.7, cy - k * 0.2));
      return void ctx.stroke();
    }
  }
}

/**
 * Draw this cell's part of a pad icon: the whole icon in a square box centred on its two cells
 * (or on its one cell, for the small ones), clipped to this cell by the atlas. Returns false for a
 * code point that isn't one of ours.
 */
export function drawPadGlyph(ctx: CanvasRenderingContext2D, cp: number, x: number, y: number, w: number, h: number): boolean {
  if (!isPadGlyph(cp)) return false;
  const small = cp >= PAD_GLYPH_SMALL;
  const k = small ? cp - PAD_GLYPH_SMALL : (cp - PAD_GLYPH_BASE) >> 1;
  const name = NAMES[k];
  if (!name) return false;
  const half = small ? 0 : (cp - PAD_GLYPH_BASE) & 1;
  const boxW = small ? w : 2 * w;
  // a little air above and below, whole pixels
  const size = Math.floor(Math.min(boxW, h * LOOK.size));
  const bx = Math.round(x - half * w + (boxW - size) / 2), by = Math.round(y + (h - size) / 2);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  drawIcon(ctx, name, bx, by, size);
  ctx.restore();
  return true;
}

export const PAD_SPRITES: readonly string[] = NAMES;
