import { gradient as sampleGradient, mix, NONE, type RGB } from "../core/color";
import { keySpans } from "./keycaps";
import { padCells } from "./keyicons";
import { keycapLook, type KeycapLook } from "../core/keycap";
import { keyFace } from "../core/skin/components";
import { CAP_END, CAP_PAD_L, CAP_PAD_R, CAP_START } from "../core/grid";
import type { PadKind } from "../core/padglyphs";
import { BOLD, Grid, type Rect, type Style } from "../core/grid";
import type { MouseInput } from "../core/input";
import type { Theme } from "../core/theme";
import { charWidth, strWidth, truncate } from "../core/unicode";
import { decrypt, SCRAMBLE_TEXT } from "../fx/glitch";
import type { LayoutProbe } from "./probe";

export type { Rect, Style };

/** One line of a right-click menu. `"-"` is a separator. */
export type MenuEntry = MenuItem | "-";

export interface MenuItem {
  label: string;
  /** A shell command to run (echoed like any click), or… */
  cmd?: string;
  /** …a function. */
  run?: () => void | Promise<void>;
  /** Shown on the right: a shortcut ("⌘C") or a hint. */
  hint?: string;
  /** What it does, in a few words: shown when the mouse is on it (the label stays short). */
  tip?: string;
  /** Red: deletes or destroys something. */
  danger?: boolean;
  disabled?: boolean;
  /** A coloured dot before the label (colour tags). */
  color?: RGB;
  /** A ✓ before the label. */
  checked?: boolean;
  /** Opens a sub-menu (▸). */
  sub?: MenuEntry[] | (() => MenuEntry[]);
}

/** A clickable / scrollable area registered while drawing (immediate-mode UI). */
export interface Hit {
  rect: Rect;
  onClick?: (m: MouseInput) => void;
  onDouble?: (m: MouseInput) => void;
  /** Called on mouse moves while the button is held after a click on this area. */
  onDrag?: (m: MouseInput) => void;
  /** The button is released after a click on this area (end of a drag). */
  onUp?: (m: MouseInput) => void;
  /** onDrag also gets the moves inside one cell, onWheel the wheel's events under a line (`m.fine`): sliders */
  fine?: boolean;
  /** the wheel over it: lines (positive = down), and the mouse event (shift held…) */
  onWheel?: (delta: number, m: MouseInput) => void;
  /** Right click: a custom handler. Most places give a `menu` instead. */
  onRight?: (m: MouseInput) => void;
  /** the middle button (a tab: closes it, like a browser's) — without it, a middle click is a click */
  onMiddle?: (m: MouseInput) => void;
  /**
   * What right-click shows here (a context menu). The deck adds the common
   * lines (copy/paste in text, palette, shortcuts, settings) under it.
   */
  menu?: (m?: MouseInput) => MenuEntry[];
  /**
   * The shell command this click runs. It's echoed in the shell, so clicking
   * around teaches the command line. Hovering shows it in a tooltip.
   */
  cmd?: string;
  /** Hover tooltip text (shortcuts, what it does). */
  tip?: string;
  /** The system pointer over it (a border you drag: "col-resize" / "row-resize"); else the arrow. */
  cursor?: "col-resize" | "row-resize" | "grab" | "grabbing" | "nwse-resize";
  /** Nothing under it gets the mouse (modal backdrops, pop-ups). */
  block?: boolean;
}

const NO_KEYS: [number, number][] = [];

const BORDERS: Record<string, { tl: string; tr: string; bl: string; br: string; h: string; v: string; hb?: string }> = {
  round: { tl: "╭", tr: "╮", bl: "╰", br: "╯", h: "─", v: "│" },
  single: { tl: "┌", tr: "┐", bl: "└", br: "┘", h: "─", v: "│" },
  heavy: { tl: "┏", tr: "┓", bl: "┗", br: "┛", h: "━", v: "┃" },
  double: { tl: "╔", tr: "╗", bl: "╚", br: "╝", h: "═", v: "║" },
  // widget frame styles a theme can pick ([meta] widget_frame)
  dashed: { tl: "┌", tr: "┐", bl: "└", br: "┘", h: "╌", v: "╎" },
  corners: { tl: "┌", tr: "┐", bl: "└", br: "┘", h: " ", v: " " },
  line: { tl: "─", tr: "─", bl: " ", br: " ", h: "─", v: " ", hb: " " },
};

export interface BoxOptions {
  title?: string;
  /** Small text on the right of the top border. */
  info?: string;
  focused?: boolean;
  /** Fill the inside with the panel color (default true). */
  fill?: boolean;
  bg?: RGB;
  border?: string;
}

const SPINNER = "⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏";

/**
 * The drawing toolkit handed to every app and plugin.
 *
 * It's "immediate mode" (like ratatui or Dear ImGui): every frame, the whole
 * screen is described from scratch by calling these functions. There are no
 * widget objects to keep in sync — what you draw *is* the UI. The renderer
 * then works out which cells actually changed.
 *
 * Mouse support works the same way: while drawing, call `ui.hit(rect, …)` to
 * declare a clickable area. Areas declared later sit on top.
 */
export class UI {
  grid!: Grid;
  theme!: Theme;
  /** Milliseconds since the app started — use it for animations. */
  now = 0;
  /**
   * Nothing animates (frames per second at 0: the deck redraws only on input; or reduce
   * motion): an effect that needs more frames to finish must show its end at once.
   */
  still = false;
  mouse = { x: -1, y: -1 };
  hits: Hit[] = [];
  /** Where the text cursor is this frame (for IME placement), if anyone drew one. */
  caret: { x: number; y: number } | null = null;
  /** Cell width ÷ cell height (≈0.5): use it to draw round things (see ui/dots.ts). */
  cellAspect = 0.5;
  private wake = Infinity;
  /**
   * Text too long for its room scrolls by itself — under the mouse, and inside
   * this zone (a list's selected row sets it while it's drawn): after a short
   * pause it runs like a ticker, then starts again. Everywhere, for free: any
   * ui.text with a maxW does it.
   */
  marqueeZone: Rect | null = null;
  /** the renderer draws the caret (a gliding bar): ui.cursor only says where */
  softCaret = false;
  /** when the text at the caret last changed (the caret stays solid while you type) */
  caretTyped = 0;
  private marquees = new Map<string, number>();
  private marqueesSeen = new Set<string>();
  /** `debug layout`: reports texts that are cut or drawn over another (ui/probe.ts); null = off */
  probe: LayoutProbe | null = null;

  begin(grid: Grid, theme: Theme, now: number, mouse: { x: number; y: number }): void {
    this.grid = grid;
    this.theme = theme;
    this.now = now;
    this.mouse = mouse;
    this.hits = [];
    this.caret = null;
    this.wake = Infinity;
    this.awake = false;
    this.marqueeZone = null;
    // a text that wasn't drawn scrolling last frame starts from its beginning next time
    for (const k of this.marquees.keys()) if (!this.marqueesSeen.has(k)) this.marquees.delete(k);
    this.marqueesSeen.clear();
    grid.clear(theme.c.fg, theme.c.bg);
  }

  /** Theme colors shortcut: `ui.c.accent`. */
  get c() {
    return this.theme.c;
  }

  get cols(): number {
    return this.grid.cols;
  }

  get rows(): number {
    return this.grid.rows;
  }

  /**
   * The "decrypt" reveal (fx/glitch.ts) of a text that stays on screen: `progress` 0 → 1.
   * Asks for the next frame while it runs; when nothing animates (`still`) the text shows at
   * once — a reveal waiting for frames that never came left headlines as "RK=WD P[1I*U".
   */
  reveal(text: string, progress: number, charset = SCRAMBLE_TEXT): string {
    if (this.still || progress >= 1) return text;
    this.animate(40);
    return decrypt(text, Math.max(0, progress), this.now, charset);
  }

  /** Ask for another frame in `ms` milliseconds (animations call this every frame). */
  animate(ms = 0): void {
    if (ms < this.wake) this.wake = ms;
  }

  /**
   * Keep the deck at full pace while this frame's thing runs (music playing, a game):
   * without it, animations slow down to 12 frames a second after 20 s without input,
   * and to 2 after a minute (core/loop.ts restLevel).
   */
  stayAwake(): void {
    this.awake = true;
  }
  /** something asked for stayAwake() during this frame */
  awake = false;

  /** Smallest wake-up delay requested during this frame. */
  get wakeIn(): number {
    return this.wake;
  }

  // ── text ─────────────────────────────────────────────────────────────────

  /**
   * Draw text at (x, y). Returns the x just after the last character.
   * `maxW` truncates with an ellipsis.
   */
  /**
   * The first of `versions` (longest first) that fits whole in `maxW`: a widget's long sentence
   * when there's room, its short one in a small square — never a sentence cut in the middle
   * ("nothing to rem…"). None fits: the shortest, cut with …. Returns where it ended.
   *
   *   ui.textFit(x, y, [t("nothing to remember"), t("none")], { fg: c.muted }, r.w)
   */
  textFit(x: number, y: number, versions: string[], style: Style = {}, maxW: number): number {
    const fit = versions.find((v) => strWidth(v) <= maxW) ?? versions[versions.length - 1] ?? "";
    return this.text(x, y, fit, style, maxW);
  }

  text(x: number, y: number, s: string, style: Style = {}, maxW?: number): number {
    if (maxW !== undefined) s = maxW > 2 && strWidth(s) > maxW && this.marqueeHere(x, y, maxW) ? this.scrolled(x, y, s, maxW) : truncate(s, maxW);
    if (this.probe) this.probeText(this.probe, x, y, s);
    const fg = style.fg ?? this.c.fg;
    const bg = style.bg ?? NONE;
    const attrs = style.attrs ?? 0;
    // the shortcuts in it sit on little keys (ui/keycaps.ts); the width doesn't change
    const keys = style.raw || !this.keycaps ? NO_KEYS : style.key ? [[0, [...s].length] as [number, number]] : keySpans(s);
    if (!keys.length) {
      for (const ch of s) {
        const cp = ch.codePointAt(0)!;
        if (cp === 10 || cp === 13) continue;
        x += this.grid.set(x, y, cp === 9 ? 32 : cp, fg, bg, attrs);
      }
      return x;
    }
    // each shortcut on a key (core/keycap.ts: the renderer draws the key behind its text, the
    // font draws the text) — or the pad's button while a pad is used (ui/keyicons.ts) — in as many
    // cells as its text. The key's face: on a coloured strip (a selected line, a band) a lighter
    // patch of that colour; on the theme's own backgrounds a raised tone with a hint of the accent
    const c = this.c;
    const onColour = bg !== NONE && bg !== c.bg && bg !== c.panel && bg !== c.panelAlt && bg !== c.highlight;
    const look = themeKeys(this.theme);
    const face = onColour ? mix(bg, fg, 0.2) : (look.face ?? keyFace(c));
    const label = onColour ? fg : c.fg;
    const chars = [...s];
    const put = (ch: string, f: RGB, b: RGB, a: number) => {
      const cp = ch.codePointAt(0)!;
      if (cp !== 10 && cp !== 13) x += this.grid.set(x, y, cp === 9 ? 32 : cp, f, b, a);
    };
    let i = 0;
    // the spaces after the keys: their half is the key's (set once they're written)
    const padR: number[] = [];
    // a pad's button is narrower than the key it replaces ("enter" → Ⓐ): the text goes on right
    // after it, and the cells left over go at the end (the text keeps its width, no blank before Ⓐ)
    let slack = 0;
    for (const [a, b] of keys) {
      for (; i < a && i < chars.length; i++) put(chars[i], fg, bg, attrs);
      const written = chars.slice(a, b).join("");
      const pad = /[\n\r\t]/.test(written) ? null : padCells(written, this.pad);
      if (pad) {
        const x0 = x;
        for (const ch of pad.text) put(ch, pad.color ?? label, bg, attrs);
        slack += strWidth(written) - (x - x0);
      }
      else {
        // the key: its text, a cap behind it (one key across all its cells), reaching half a cell
        // into the spaces on each side when there are some — the text gets room, nothing moves
        const x0 = x;
        for (const ch of chars.slice(a, b)) put(ch, label, bg, look.bold ? attrs | BOLD : attrs);
        // (at either end of this text: a blank cell already there, a menu's margin around its key)
        const g = this.grid;
        const blank = (cx: number) => cx >= 0 && cx < g.cols && g.inClip(cx, y) && g.ch[y * g.cols + cx] === 32 && g.cap[y * g.cols + cx] === NONE;
        const left = a > 0 ? chars[a - 1] === " " && x0 > 0 : blank(x0 - 1);
        const right = b < chars.length ? chars[b] === " " : blank(x);
        for (let k = x0; k < x; k++) this.grid.setCap(k, y, face, (k === x0 && !left ? CAP_START : 0) | (k === x - 1 && !right ? CAP_END : 0));
        if (left) this.grid.setCap(x0 - 1, y, face, CAP_PAD_L);
        if (right) {
          if (b < chars.length) padR.push(x);
          else this.grid.setCap(x, y, face, CAP_PAD_R);
        }
      }
      i = Math.max(i, b);
    }
    for (; i < chars.length; i++) put(chars[i], fg, bg, attrs);
    for (let k = 0; k < slack; k++) put(" ", fg, bg, attrs);
    for (const px of padR) this.grid.setCap(px, y, face, CAP_PAD_R);
    return x;
  }

  /** What `text` is about to write, told to the layout probe: cut letters, letters over another text. */
  private probeText(probe: LayoutProbe, x: number, y: number, s: string): void {
    const g = this.grid;
    const id = probe.begin(s);
    let shown = 0, hidden = -1;
    for (const ch of s) {
      const cp0 = ch.codePointAt(0)!;
      if (cp0 === 10 || cp0 === 13) continue;
      const cp = cp0 === 9 ? 32 : cp0;
      const w = charWidth(cp);
      if (w === 0) continue;
      const vis = g.inClip(x, y) && (w === 1 || g.inClip(x + 1, y));
      if (vis) shown++;
      else if (cp !== 32 && hidden < 0) hidden = x;
      probe.letter(id, x, y, cp, vis, vis ? g.ch[y * g.cols + x] : 0);
      x += w;
    }
    if (shown && hidden >= 0) probe.cut(id, hidden, y);
  }

  /** shortcuts drawn as keycaps (off while drawing content that isn't interface) */
  keycaps = true;
  /** the pad in use (a pad button was the last thing pressed): the shortcuts show its buttons */
  pad: PadKind | null = null;

  /** Is this text's room under the mouse, or in the marquee zone? */
  private marqueeHere(x: number, y: number, w: number): boolean {
    const m = this.mouse, z = this.marqueeZone;
    return (m.y === y && m.x >= x && m.x < x + w) || (!!z && y >= z.y && y < z.y + z.h && x >= z.x && x < z.x + z.w);
  }

  /** The window of a too-long text to show now: still for 0.9 s, then it runs. */
  private scrolled(x: number, y: number, s: string, w: number): string {
    const key = `${x},${y},${s}`;
    this.marqueesSeen.add(key);
    let since = this.marquees.get(key);
    if (since === undefined) this.marquees.set(key, (since = this.now));
    const t = this.now - since - 900;
    if (t <= 0) {
      this.animate(Math.max(16, -t));
      return truncate(s, w);
    }
    this.animate(110);
    const loop = [...`${s}     ·     `];
    const off = Math.floor(t / 110) % loop.length;
    return truncate([...loop.slice(off), ...loop.slice(0, off)].join(""), w, "");
  }

  /** Text centered horizontally inside a rect row. */
  textCenter(r: Rect, y: number, s: string, style: Style = {}): number {
    const w = Math.min(strWidth(s), r.w);
    return this.text(r.x + Math.floor((r.w - w) / 2), y, s, style, r.w);
  }

  /** Right-aligned text ending at x (exclusive). */
  textRight(xEnd: number, y: number, s: string, style: Style = {}): number {
    const start = xEnd - strWidth(s);
    this.text(start, y, s, style);
    return start;
  }

  /** Each character gets a color sampled from `colors` (theme gradient by default). */
  gradientText(x: number, y: number, s: string, colors: RGB[] = this.theme.gradient, attrs = BOLD, phase = 0): number {
    const chars = [...s];
    const n = Math.max(1, chars.length - 1);
    chars.forEach((ch, i) => {
      const t = (i / n + phase) % 1;
      x += this.grid.set(x, y, ch.codePointAt(0)!, sampleGradient(colors, Math.abs(t)), NONE, attrs);
    });
    return x;
  }

  // ── shapes ───────────────────────────────────────────────────────────────

  fill(r: Rect, style: Style = {}, ch = " "): void {
    const cp = ch.codePointAt(0)!;
    const fg = style.fg ?? this.c.fg;
    const bg = style.bg ?? NONE;
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) this.grid.set(x, y, cp, fg, bg, style.attrs ?? 0);
    if (this.probe) {
      // what was written there is meant to be covered (only the part inside the clip was)
      const c = this.grid.clip;
      const x = Math.max(c.x, r.x), y = Math.max(c.y, r.y);
      this.probe.cleared({ x, y, w: Math.min(c.x + c.w, r.x + r.w) - x, h: Math.min(c.y + c.h, r.y + r.h) - y });
    }
  }

  /** Recolor a rect without changing its characters (highlights, selections). */
  /**
   * What's behind a dialog, a menu, a pop-up: every text in `fg` and every background pushed
   * towards the page's (a light background — the tab shown, a chosen button — kept its colour
   * while its text went grey: unreadable). Block glyphs — a picture's half blocks too — keep
   * their colours, darkened (the moon stays a moon, dimmer).
   */
  dim(r: Rect, fg: RGB): void {
    const g = this.grid;
    for (let y = Math.max(0, r.y); y < Math.min(g.rows, r.y + r.h); y++)
      for (let x = Math.max(0, r.x); x < Math.min(g.cols, r.x + r.w); x++) {
        const i = y * g.cols + x;
        if (g.bg[i] !== NONE) g.bg[i] = mix(g.bg[i], this.c.bg, 0.6);
        if (g.cap[i] !== NONE) g.cap[i] = mix(g.cap[i], this.c.bg, 0.6); // a shortcut's key, dimmed with its text
        const ch = g.ch[i];
        // block glyphs (▀ ▄ █ ▌…: a tab's bar, a logo, a picture's pixels: the moon) are shapes,
        // not text: their own colour, darkened like their background — in the text's grey a
        // tab's dark bar came out as a light one, and the moon as a flat grey disc
        if (ch >= 0x2580 && ch <= 0x259f) g.fg[i] = mix(g.fg[i], this.c.bg, 0.6);
        else if (g.inClip(x, y)) g.tint(x, y, fg, NONE);
      }
  }

  tint(r: Rect, fg: RGB = NONE, bg: RGB = NONE): void {
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) this.grid.tint(x, y, fg, bg);
  }

  hline(x: number, y: number, w: number, style: Style = {}, ch = "─"): void {
    this.fill({ x, y, w, h: 1 }, style, ch);
  }

  vline(x: number, y: number, h: number, style: Style = {}, ch = "│"): void {
    this.fill({ x, y, w: 1, h }, style, ch);
  }

  /**
   * A bordered panel. Returns the inner rect (inside the border).
   *
   *   ╭─ ◆ TITLE ──────────── info ─╮
   *   │                            │
   *   ╰────────────────────────────╯
   */
  box(r: Rect, o: BoxOptions = {}): Rect {
    if (r.w < 2 || r.h < 2) return { x: r.x, y: r.y, w: 0, h: 0 };
    const b = BORDERS[o.border ?? this.theme.border] ?? BORDERS.round;
    const bc = o.focused ? this.c.borderFocus : this.c.border;
    const bg = o.bg ?? this.c.panel;
    if (o.fill !== false) this.fill(r, { bg });
    const st = { fg: bc, bg };
    this.hline(r.x + 1, r.y, r.w - 2, st, b.h);
    this.hline(r.x + 1, r.y + r.h - 1, r.w - 2, st, b.hb ?? b.h);
    this.vline(r.x, r.y + 1, r.h - 2, st, b.v);
    this.vline(r.x + r.w - 1, r.y + 1, r.h - 2, st, b.v);
    this.text(r.x, r.y, b.tl, st);
    this.text(r.x + r.w - 1, r.y, b.tr, st);
    this.text(r.x, r.y + r.h - 1, b.bl, st);
    this.text(r.x + r.w - 1, r.y + r.h - 1, b.br, st);

    let titleEnd = r.x + 2;
    if (o.title) {
      // focused: accent text with a mark, no filled badge (stays readable next to the tab bar)
      const mark = this.theme.glyphs.mark;
      const label = o.focused ? ` ${mark} ${o.title} ` : ` ${o.title} `;
      const style = o.focused ? { fg: this.c.titleFocus, bg, attrs: BOLD } : { fg: this.c.title, bg };
      titleEnd = this.text(r.x + 2, r.y, label, style, r.w - 4);
    }
    if (o.info) {
      const room = r.x + r.w - 2 - titleEnd - 2;
      if (room > 3) this.textRight(r.x + r.w - 2, r.y, ` ${truncate(o.info, room - 2)} `, { fg: o.focused ? this.c.muted : this.c.subtle, bg });
    }
    return { x: r.x + 1, y: r.y + 1, w: r.w - 2, h: r.h - 2 };
  }

  /**
   * THE button: " label " on the highlight, lit when hovered or selected. Returns
   * its width. `quiet`: muted until hovered (a bar of many, the top bar); `disabled`:
   * faint, not clickable (‹ with nothing before). docs/UI_KIT.md.
   */
  button(x: number, y: number, label: string, onClick: () => void, o: { selected?: boolean; accent?: RGB; cmd?: string; tip?: string; quiet?: boolean; disabled?: boolean } = {}): number {
    const s = ` ${label} `;
    const w = strWidth(s);
    const rect = { x, y, w, h: 1 };
    const accent = o.accent ?? this.c.accent;
    if (o.disabled) {
      this.text(x, y, s, { fg: this.c.faint, bg: this.c.highlight });
      return w;
    }
    const hot = o.selected || this.hovered(rect);
    this.text(x, y, s, hot ? { fg: this.c.panel, bg: accent, attrs: BOLD } : { fg: o.quiet ? this.c.muted : accent, bg: this.c.highlight });
    this.hit(rect, o.cmd ? { cmd: o.cmd, tip: o.tip } : { onClick: () => onClick(), tip: o.tip });
    return w;
  }

  /** Horizontal bar ▕██████░░░░▏ for a 0..1 ratio, with eighth-block precision. */
  bar(x: number, y: number, w: number, ratio: number, fg: RGB = this.c.accent, bg: RGB = this.c.faint): void {
    const r = Math.max(0, Math.min(1, ratio));
    const eighths = Math.round(r * w * 8);
    for (let i = 0; i < w; i++) {
      const filled = Math.max(0, Math.min(8, eighths - i * 8));
      const ch = filled === 0 ? " " : filled === 8 ? "█" : String.fromCodePoint(0x2590 - filled);
      this.grid.set(x + i, y, ch.codePointAt(0)!, fg, bg, 0);
    }
  }

  /**
   * Braille area chart: 2 samples per cell horizontally, 4 dots vertically.
   * `values` are 0..1, newest last.
   */
  chart(r: Rect, values: number[], color: RGB): void {
    const samples = r.w * 2;
    const data = values.slice(-samples);
    const offset = samples - data.length;
    const dotsH = r.h * 4;
    for (let cx = 0; cx < r.w; cx++) {
      for (let cy = 0; cy < r.h; cy++) {
        let bits = 0;
        for (let sub = 0; sub < 2; sub++) {
          const idx = cx * 2 + sub - offset;
          if (idx < 0) continue;
          const level = Math.round(Math.max(0, Math.min(1, data[idx])) * dotsH);
          for (let row = 0; row < 4; row++) {
            const dotFromBottom = (r.h - 1 - cy) * 4 + (3 - row);
            if (dotFromBottom < level) bits |= brailleBit(sub, row);
          }
        }
        if (bits) this.grid.set(r.x + cx, r.y + cy, 0x2800 + bits, color, NONE, 0);
      }
    }
  }

  spinner(): string {
    this.animate(80);
    const frames = [...(this.theme.glyphs.spinner || SPINNER)];
    return frames[Math.floor(this.now / 80) % frames.length];
  }

  /**
   * Draw a block cursor at (x, y), blinking. Also tells the IME where we are.
   * With `softCaret` (the desktop deck) the renderer draws a gliding bar instead.
   */
  cursor(x: number, y: number, blinkFrom = 0): void {
    this.caret = { x, y };
    this.caretTyped = blinkFrom;
    if (this.softCaret) return;
    const t = this.now - blinkFrom;
    const on = t < 600 || Math.floor(t / 530) % 2 === 0;
    this.animate(530 - (t % 530));
    if (on) this.grid.tint(x, y, this.c.panel, this.c.cursor);
  }

  // ── mouse ────────────────────────────────────────────────────────────────

  hit(rect: Rect, h: Omit<Hit, "rect">): void {
    // only the visible part is clickable (scrolled / clipped content)
    const c = this.grid.clip;
    const x = Math.max(c.x, rect.x), y = Math.max(c.y, rect.y);
    const w = Math.min(c.x + c.w, rect.x + rect.w) - x, hh = Math.min(c.y + c.h, rect.y + rect.h) - y;
    if (w <= 0 || hh <= 0) return;
    this.hits.push({ rect: { x, y, w, h: hh }, ...h });
  }

  hovered(r: Rect): boolean {
    const { x, y } = this.mouse;
    return x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h;
  }

  /**
   * Draw something that overlaps on purpose — an animated background, a pseudo-3D
   * scene, art over a frame: `debug layout` (ui/probe.ts) doesn't report what's
   * drawn inside. Nothing else changes.
   */
  art(fn: () => void): void {
    const p = this.probe, amb = this.grid.ambient;
    this.probe = null;
    // scenery: no fade-in, no ink (core/grid.ts NOFADE)
    this.grid.ambient = true;
    try {
      fn();
    } finally {
      this.probe = p;
      this.grid.ambient = amb;
    }
  }

  /** Restrict drawing to a rect while `fn` runs. */
  clip(r: Rect, fn: () => void): void {
    this.grid.pushClip(r);
    try {
      fn();
    } finally {
      this.grid.popClip();
    }
  }
}

function brailleBit(col: number, row: number): number {
  if (row === 3) return col === 0 ? 0x40 : 0x80;
  return 1 << (col * 3 + row);
}

/** Quote a shell argument when it needs it: my note.md → "my note.md". */
export function q(arg: string): string {
  return /^[\w./~@:+-]+$/.test(arg) ? arg : `"${arg.replace(/(["\\$`])/g, "\\$1")}"`;
}

export function inside(r: Rect, x: number, y: number): boolean {
  return x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h;
}

/** Split a rect: take `n` rows/cols from one side. */
export const split = {
  top: (r: Rect, n: number): [Rect, Rect] => [
    { x: r.x, y: r.y, w: r.w, h: n },
    { x: r.x, y: r.y + n, w: r.w, h: Math.max(0, r.h - n) },
  ],
  bottom: (r: Rect, n: number): [Rect, Rect] => [
    { x: r.x, y: r.y, w: r.w, h: Math.max(0, r.h - n) },
    { x: r.x, y: r.y + r.h - n, w: r.w, h: n },
  ],
  left: (r: Rect, n: number): [Rect, Rect] => [
    { x: r.x, y: r.y, w: n, h: r.h },
    { x: r.x + n, y: r.y, w: Math.max(0, r.w - n), h: r.h },
  ],
  right: (r: Rect, n: number): [Rect, Rect] => [
    { x: r.x, y: r.y, w: Math.max(0, r.w - n), h: r.h },
    { x: r.x + r.w - n, y: r.y, w: n, h: r.h },
  ],
};

export function inset(r: Rect, dx: number, dy = dx): Rect {
  return { x: r.x + dx, y: r.y + dy, w: Math.max(0, r.w - dx * 2), h: Math.max(0, r.h - dy * 2) };
}

export { charWidth, strWidth, truncate };

/** a key's face on the theme's own backgrounds: a raised tone of the panel, a hint of the accent */
export { keyFace } from "../core/skin/components";

/** a theme's key look (Theme.keys over the bevelled key), worked out once per theme */
const keyLooks = new WeakMap<object, KeycapLook>();
function themeKeys(theme: { keys?: Partial<KeycapLook> } | undefined): KeycapLook {
  if (!theme) return keycapLook();
  let k = keyLooks.get(theme);
  if (!k) keyLooks.set(theme, (k = keycapLook(theme.keys)));
  return k;
}
