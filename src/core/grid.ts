import { NONE, type RGB } from "./color";
import { charWidth } from "./unicode";

/** Text attributes, combined as bit flags: BOLD | ITALIC. */
export const BOLD = 1;
export const ITALIC = 2;
export const UNDERLINE = 4;
export const DIM = 8;
export const STRIKE = 16;
/** Swap fg/bg — only interpreted by the terminal buffer (ANSI code 7). */
export const INVERSE = 32;
/** A half block that is two pixels of a picture (the moon): dimmed as one colour (tint), never in stripes. */
export const PIXELS = 64;
/**
 * Scenery (a theme's background, ui.art: rain, stars, a sky): it never fades in and never
 * takes the theme's ink / glow — it moves all the time, and each of its glyphs kept the deck
 * drawing at the screen's rate (core/renderer.ts, fx/transition.ts). Set by `Grid.ambient`.
 */
export const NOFADE = 128;

/**
 * where a cell is on a key (Grid.capEdge): its left end, its right end — or the space just
 * before / after the key, where the key reaches half a cell so its text has room (no layout moves)
 */
export const CAP_START = 1;
export const CAP_END = 2;
export const CAP_PAD_L = 4;
export const CAP_PAD_R = 8;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Style {
  fg?: RGB;
  /** Omit (or NONE) to keep the background already in the cell. */
  bg?: RGB;
  attrs?: number;
  /** drawn as is: no keycaps on the shortcuts in it (typed text) — see ui/keycaps.ts */
  raw?: boolean;
  /** the whole text is a key (a menu line's shortcut: "n", "p", "⌘K") */
  key?: boolean;
}

/**
 * A screen-sized grid of character cells — the single thing every part of the UI
 * draws into. One code point + colors + attributes per cell, stored in typed
 * arrays (structure-of-arrays) so a full-screen diff stays fast.
 *
 * Wide characters (CJK) use two cells: the head holds the code point and the
 * following cell holds 0 ("continuation").
 */
export class Grid {
  readonly ch: Uint32Array;
  readonly fg: Int32Array;
  readonly bg: Int32Array;
  readonly attr: Uint8Array;
  /**
   * A shortcut's key (0.8, core/keycap.ts): the face colour of the key drawn behind this cell's
   * character (NONE: no key), and where the cell is on it — CAP_START, CAP_END (both: a one-cell
   * key). The renderer draws the key, the character stays the font's: as sharp as all the text.
   */
  readonly cap: Int32Array;
  readonly capEdge: Uint8Array;
  /** while true, what's written is scenery (NOFADE): ui.art and the backgrounds set it */
  ambient = false;

  /** Drawing is clipped to this rectangle (see pushClip/popClip). */
  clip: Rect;
  private clipStack: Rect[] = [];

  constructor(
    readonly cols: number,
    readonly rows: number,
  ) {
    const n = cols * rows;
    this.ch = new Uint32Array(n);
    this.fg = new Int32Array(n);
    this.bg = new Int32Array(n);
    this.attr = new Uint8Array(n);
    this.cap = new Int32Array(n).fill(NONE);
    this.capEdge = new Uint8Array(n);
    this.clip = { x: 0, y: 0, w: cols, h: rows };
  }

  clear(fg: RGB, bg: RGB): void {
    this.ch.fill(32);
    this.fg.fill(fg);
    this.bg.fill(bg);
    this.attr.fill(0);
    this.cap.fill(NONE);
    this.capEdge.fill(0);
    this.clipStack = [];
    this.clip = { x: 0, y: 0, w: this.cols, h: this.rows };
  }

  /** Restrict drawing to `r` (intersected with the current clip). */
  pushClip(r: Rect): void {
    this.clipStack.push(this.clip);
    const c = this.clip;
    const x = Math.max(c.x, r.x);
    const y = Math.max(c.y, r.y);
    const x2 = Math.min(c.x + c.w, r.x + r.w);
    const y2 = Math.min(c.y + c.h, r.y + r.h);
    this.clip = { x, y, w: Math.max(0, x2 - x), h: Math.max(0, y2 - y) };
  }

  popClip(): void {
    this.clip = this.clipStack.pop() ?? { x: 0, y: 0, w: this.cols, h: this.rows };
  }

  inClip(x: number, y: number): boolean {
    const c = this.clip;
    return x >= c.x && y >= c.y && x < c.x + c.w && y < c.y + c.h;
  }

  /**
   * Write one character. Returns how many cells it used (0, 1 or 2).
   * fg/bg = NONE keeps the existing color, which lets text float over panels.
   */
  set(x: number, y: number, cp: number, fg: RGB, bg: RGB, attrs = 0): number {
    const w = charWidth(cp);
    if (w === 0) return 0;
    if (!this.inClip(x, y)) return w;
    if (w === 2 && !this.inClip(x + 1, y)) cp = 32; // a wide char can't be half-visible

    const i = y * this.cols + x;
    this.breakWide(x, y);
    if (this.ambient) attrs |= NOFADE;
    this.ch[i] = cp;
    if (fg !== NONE) this.fg[i] = fg;
    if (bg !== NONE) this.bg[i] = bg;
    this.attr[i] = attrs;
    this.cap[i] = NONE;
    this.capEdge[i] = 0;

    if (w === 2 && cp !== 32) {
      this.breakWide(x + 1, y);
      this.ch[i + 1] = 0;
      if (fg !== NONE) this.fg[i + 1] = fg;
      if (bg !== NONE) this.bg[i + 1] = bg;
      this.attr[i + 1] = attrs;
      this.cap[i + 1] = NONE;
      this.capEdge[i + 1] = 0;
    }
    return w;
  }

  /** Put a key behind cell (x, y) (after `set`): its face colour, and CAP_START / CAP_END. */
  setCap(x: number, y: number, face: RGB, edge: number): void {
    if (!this.inClip(x, y)) return;
    const i = y * this.cols + x;
    this.cap[i] = face;
    this.capEdge[i] = edge;
  }

  /** Change only the colors of a cell (used for highlights and selections). */
  tint(x: number, y: number, fg: RGB, bg: RGB): void {
    if (!this.inClip(x, y)) return;
    const i = y * this.cols + x;
    if (fg !== NONE) this.fg[i] = fg;
    if (bg !== NONE) this.bg[i] = bg;
    // a picture's half block (two pixels: PIXELS) dimmed in one colour: both halves take it (the
    // moon came out in stripes). Only those: a tab's bar or a logo's ▀ keep their background
    // (every one turned into a light block)
    else if (fg !== NONE && this.attr[i] & PIXELS && this.bg[i] !== NONE) this.bg[i] = fg;
  }

  /** Overwriting half of a wide char would leave garbage: blank the other half. */
  private breakWide(x: number, y: number): void {
    const i = y * this.cols + x;
    if (this.ch[i] === 0 && x > 0) this.ch[i - 1] = 32; // we're a continuation
    else if (x + 1 < this.cols && this.ch[i + 1] === 0 && charWidth(this.ch[i]) === 2) this.ch[i + 1] = 32;
  }
}
