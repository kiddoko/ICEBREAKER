import { GlyphAtlas } from "./atlas";
import { css, NONE } from "./color";
import { BOLD, Grid, ITALIC, NOFADE, PIXELS, STRIKE, UNDERLINE } from "./grid";
import { fontStack } from "./fonts";
import { BEVELLED, drawCapSlice, type KeycapLook } from "./keycap";
import { setPadFont } from "./padglyphs";
import { chromaStrength } from "./fxlevels";
import { charWidth } from "./unicode";
import { CrtGlass, curveK, unwarpPoint, warpPoint, type GlassInput } from "./crt";

export const FONT_STACK = fontStack("JetBrains Mono");

/**
 * Paints a Grid onto the canvas.
 *
 * It keeps a copy of what is currently on screen ("front" grid) and only
 * repaints the cells that changed since the last frame. A typical frame
 * touches a handful of cells, which is what keeps us at 60fps on weak laptops.
 */
export class Renderer {
  cellW = 0;
  cellH = 0;
  cols = 0;
  rows = 0;
  dpr = 1;
  /** how the shortcuts' keys look: the theme's (Theme.keys, core/keycap.ts), set by the deck */
  keycapLook: KeycapLook = BEVELLED;
  /** Canvas position on the page, in CSS pixels. */
  left = 0;
  top = 0;

  private ctx: CanvasRenderingContext2D;
  private bloomCtx: CanvasRenderingContext2D;
  private front: Grid | null = null;
  private atlas!: GlyphAtlas;
  private dirty = new Uint8Array(0);
  /**
   * Letters fade in: a cell going from empty to a glyph is drawn see-through
   * first, then solid, over `fadeMs` (0 = off). Everything that appears does it
   * — what you type, the terminal, the chat — so text flows instead of popping.
   * `fading` says frames are still needed (the deck asks for the next one).
   */
  fadeMs = 220;
  /** `debug state`: cells fading now, and those fading for too long (should be 0) */
  fadeStats(): { fading: number; stuck: number } {
    const now = performance.now();
    let fading = 0, stuck = 0;
    for (const b of this.born) if (b > 0) (fading++, now - b > this.fadeMs * 3 && stuck++);
    return { fading, stuck };
  }
  /** more letters than this appearing in one frame: no fade (motion, a new page) */
  static readonly FADE_MAX_PER_FRAME = 48;
  fading = false;
  private born = new Float64Array(0);
  private fontPx = 16;
  private baseline = 0;
  /** [normal, bold] weights. Thin 200/500 is the crispest on HiDPI screens. */
  private weights: readonly [number, number] = [200, 500];
  private stack = FONT_STACK;
  private lineHeight = 1.12;
  bloomEnabled = true;
  /**
   * The bloom's source: the screen at the bloom canvas's size (a quarter), kept up to date cell
   * by cell in draw() like the chroma's foreground layer. The bloom used to read the whole screen
   * canvas 20 times a second, and each read made WebKit keep a full copy of it (~28 MB each:
   * 600–700 MB at rest). `bsrcFresh`: it holds the whole screen (false: repaint all next draw).
   */
  private bsrc: HTMLCanvasElement | null = null;
  private bsrcCtx: CanvasRenderingContext2D | null = null;
  private bsrcFresh = false;
  /**
   * Only what's bright blooms: the copy's contrast is raised first, so dark backgrounds
   * drop to black and give nothing (0.5.2 bloomed the whole screen, backgrounds too: a grey
   * haze over everything rather than a halo around the bright things)
   */
  private static readonly BRIGHT_PASS = "contrast(1.8) brightness(1.15)";
  /** how far the bloom's halo spreads, in CSS px of blur (fxlevels.ts bloomRadius) */
  private bloomR = 3;
  setBloomRadius(px: number): void {
    if (Math.abs(px - this.bloomR) < 0.01) return;
    this.bloomR = px;
    // old webviews blur with CSS; the others in the bloom canvas (next bloom frame)
    if (!this.canvasBlur) this.bloom.style.filter = `${Renderer.BRIGHT_PASS} blur(${px.toFixed(2)}px) saturate(1.4)`;
    this.front = null;
  }
  /** the bloom is blurred in its canvas (true) or by CSS (false) */
  private canvasBlur = false;
  /** the bloom canvas is this many times smaller than the screen */
  private static readonly BLOOM_DIV = 4;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly bloom: HTMLCanvasElement,
    fontSize: number,
  ) {
    this.ctx = canvas.getContext("2d", { alpha: false })!;
    this.bloomCtx = bloom.getContext("2d")!;
    // Blur inside the small bloom canvas when the webview can (cheap, once per
    // painted frame) instead of a CSS filter the compositor redoes over the
    // whole window on every frame. Older webviews keep the CSS blur.
    this.bloomCtx.filter = "blur(1px)";
    this.canvasBlur = this.bloomCtx.filter === "blur(1px)";
    this.bloomCtx.filter = "none";
    if (this.canvasBlur) bloom.classList.add("canvas-blur");
    // the caret: a thin bar above the grid that glides from letter to letter and
    // breathes instead of blinking hard (CSS: no cell is repainted for it)
    // + a faint trail that follows it a little later (a smear of light when it jumps)
    const bar = (cls: string) => {
      const el = document.createElement("div");
      el.className = cls;
      Object.assign(el.style, { position: "absolute", left: "0", top: "0", width: "2px", pointerEvents: "none", display: "none", zIndex: "3", borderRadius: "1px", willChange: "transform, opacity" });
      canvas.parentElement?.appendChild(el);
      return el;
    };
    this.trailEl = bar("ib-caret-trail");
    this.caretEl = bar("ib-caret");
    if (!document.getElementById("ib-caret-style")) {
      const st = document.createElement("style");
      st.id = "ib-caret-style";
      st.textContent = [
        // breathing, not blinking: a slow sine between bright and dim
        "@keyframes ib-caret-breathe{0%,40%{opacity:1}70%,85%{opacity:.18}100%{opacity:1}}",
        // a key pressed: a short flare
        "@keyframes ib-caret-key{0%{filter:brightness(1.9);box-shadow:0 0 10px currentColor}100%{filter:none}}",
        // a few breaths after the last key or move, then solid: a never-ending CSS animation kept
        // the compositor redrawing the whole stack (canvases, bloom) 60 times a second — 22 % of a
        // core with a note open while the deck itself drew 2 frames (Windows bench, 0.7.2)
        `.ib-caret{animation:ib-caret-breathe 1.2s cubic-bezier(.45,0,.55,1) .7s ${Renderer.CARET_BREATHS}}`,
        `.ib-caret.key{animation:ib-caret-key .22s ease-out,ib-caret-breathe 1.2s cubic-bezier(.45,0,.55,1) .9s ${Renderer.CARET_BREATHS}}`,
        ".ib-caret-trail{opacity:.3;filter:blur(1px)}",
        ".ib-caret.still,.ib-caret-trail.still{transition:none!important}",
      ].join("");
      document.head.appendChild(st);
    }
    this.setFontSize(fontSize);
  }

  private caretEl: HTMLDivElement;
  private trailEl: HTMLDivElement;
  private caretAt = { x: -1, y: -1, typed: 0 };

  /**
   * Where the caret is this frame (null: none). `typedAt` restarts the breathing
   * (solid while you type); `still` drops the glide (reduce motion).
   */
  /** how many times the caret breathes after the last key or move before it stays solid */
  static readonly CARET_BREATHS = 5;

  setCaret(pos: { x: number; y: number } | null, color: string, typedAt: number, still: boolean): void {
    const el = this.caretEl, tr = this.trailEl;
    if (!pos || !this.cellW) {
      if (el.style.display !== "none") el.style.display = tr.style.display = "none";
      this.caretAt.x = -1;
      return;
    }
    const cw = this.cellW / this.dpr, ch = this.cellH / this.dpr;
    const shown = el.style.display !== "none";
    // appearing: straight there, no slide from where it was last
    el.classList.toggle("still", still || !shown);
    tr.classList.toggle("still", still || !shown);
    if (!shown) el.style.display = tr.style.display = "block";
    const h = `${Math.round(ch * 0.86)}px`;
    for (const e of [el, tr]) {
      e.style.background = color;
      e.style.height = h;
    }
    el.style.color = color;
    el.style.boxShadow = `0 0 6px ${color}`;
    const moved = pos.x !== this.caretAt.x || pos.y !== this.caretAt.y;
    if (moved) {
      // the farther it goes, the longer (and softer) the glide; a jump (end of line,
      // another line) waits a breath before leaving, the trail a little more
      const far = this.caretAt.x < 0 ? 0 : Math.abs(pos.x - this.caretAt.x) + Math.abs(pos.y - this.caretAt.y) * 4;
      const ms = Math.min(240, 75 + far * 9);
      const wait = far > 3 ? 30 : 0;
      const ease = "cubic-bezier(.22,1,.36,1)";
      el.style.transition = `transform ${ms}ms ${ease} ${wait}ms, height 80ms`;
      tr.style.transition = `transform ${Math.round(ms * 1.9)}ms ${ease} ${wait + 25}ms, height 80ms`;
      const at = this.toScreen(this.left + pos.x * cw, this.top + pos.y * ch + ch * 0.07);
      const to = `translate(${Math.round(at.left)}px, ${Math.round(at.top)}px)`;
      el.style.transform = to;
      tr.style.transform = to;
    }
    if (typedAt !== this.caretAt.typed || (moved && shown)) {
      // a key: a short flare, then it breathes again (solid while you type); moved (a click, the
      // arrows): it breathes again. Both from the start: a finished breath of the same name is
      // kept as it is by the browser unless the animations are cleared first
      el.classList.remove("key");
      el.style.animation = "none";
      void el.offsetWidth;
      el.style.animation = "";
      if (typedAt !== this.caretAt.typed) el.classList.add("key");
    }
    this.caretAt = { x: pos.x, y: pos.y, typed: typedAt };
  }


  /** Change the font size in CSS px (zoom). Rebuilds metrics and forces a full repaint. */
  setFontSize(size: number): void {
    this.fontPx = Math.max(4, Math.min(64, size));
    this.measure();
  }

  /** Change typeface and weights (themes, the weight setting). */
  setFont(stack: string, weights: readonly [number, number], lineHeight = 1.12): void {
    this.stack = stack;
    this.weights = weights;
    this.lineHeight = lineHeight;
    this.measure();
  }

  get fontSize(): number {
    return this.fontPx;
  }
  /** the deck's font stack (the hover tip, a page element, writes in it too) */
  get fontFamily(): string {
    return this.stack;
  }

  private font(attrs: number): string {
    const style = attrs & ITALIC ? "italic " : "";
    const weight = attrs & BOLD ? this.weights[1] : this.weights[0];
    return `${style}${weight} ${Math.round(this.fontPx * this.dpr)}px ${this.stack}`;
  }

  private measure(): void {
    this.dpr = window.devicePixelRatio || 1;
    const ctx = this.ctx;
    ctx.font = this.font(0);
    const m = ctx.measureText("M");
    const ascent = m.fontBoundingBoxAscent ?? m.actualBoundingBoxAscent;
    const descent = m.fontBoundingBoxDescent ?? m.actualBoundingBoxDescent;
    this.cellW = Math.ceil(m.width);
    this.cellH = Math.ceil((ascent + descent) * this.lineHeight);
    this.baseline = Math.round((this.cellH - (ascent + descent)) / 2 + ascent);
    // the old atlas's pages handed back now (canvases to 0×0), not whenever the GC gets to them:
    // every theme / font / effect change made a new one (memory climbed past 1 GB)
    (this.atlas as GlyphAtlas | undefined)?.release();
    this.atlas = new GlyphAtlas(this.cellW, this.cellH, this.baseline, (a) => this.font(a));
    setPadFont(this.stack);
    this.atlas.softness = this.soft ?? 0;
    this.front = null;
  }

  /** Fit the grid to the window. Returns the new size in cells. */
  resize(): { cols: number; rows: number } {
    if ((window.devicePixelRatio || 1) !== this.dpr) this.measure();
    const pw = Math.floor(window.innerWidth * this.dpr);
    const ph = Math.floor(window.innerHeight * this.dpr);
    this.cols = Math.max(20, Math.floor(pw / this.cellW));
    this.rows = Math.max(8, Math.floor(ph / this.cellH));

    const w = this.cols * this.cellW;
    const h = this.rows * this.cellH;
    this.canvas.width = w;
    this.canvas.height = h;
    this.bloom.width = Math.ceil(w / Renderer.BLOOM_DIV);
    this.bloom.height = Math.ceil(h / Renderer.BLOOM_DIV);
    this.bsrc ??= document.createElement("canvas");
    this.bsrcCtx ??= this.bsrc.getContext("2d");
    this.bsrc.width = this.bloom.width;
    this.bsrc.height = this.bloom.height;
    this.bsrcFresh = false;

    const cssW = w / this.dpr;
    const cssH = h / this.dpr;
    this.left = Math.floor((window.innerWidth - cssW) / 2);
    this.top = Math.floor((window.innerHeight - cssH) / 2);
    for (const el of [this.canvas, this.bloom]) {
      el.style.width = `${cssW}px`;
      el.style.height = `${cssH}px`;
      el.style.left = `${this.left}px`;
      el.style.top = `${this.top}px`;
    }
    this.sizeChroma();
    this.glass?.fit(this.canvas);
    this.front = null;
    return { cols: this.cols, rows: this.rows };
  }

  /** 0–100: CRT softness (glyphs a touch out of focus). Rebuilds the glyph cache. */
  private soft = 0;
  setSoftness(level: number): void {
    // works everywhere: the atlas uses a canvas blur where the webview has one, a soft halo otherwise
    const px = (Math.max(0, Math.min(100, level)) / 100) * 1.3 * this.dpr;
    this.atlas.canvasBlur = this.canvasBlur;
    if (Math.abs(px - this.soft) < 0.001) return;
    this.soft = px;
    this.atlas.softness = px;
    this.release();
  }

  /**
   * The picture's brightness (the bloom's light given back, Settings → Brightness), in
   * the colours themselves: each colour is scaled once (cached) — never a CSS filter on
   * the screen, which the compositor would redo over the whole window on every frame.
   */
  private light = 1;
  private lit = new Map<number, number>();
  setLight(k: number): void {
    if (Math.abs(k - this.light) < 0.005) return;
    this.light = k;
    this.lit.clear();
    this.release();
  }
  private L(c: number): number {
    if (this.light === 1 || c < 0) return c;
    let v = this.lit.get(c);
    if (v === undefined) {
      const ch = (s: number) => Math.min(255, Math.round(((c >> s) & 255) * this.light));
      v = (ch(16) << 16) | (ch(8) << 8) | ch(0);
      this.lit.set(c, v);
    }
    return v;
  }

  /** 0–200: chromatic aberration (red and blue fringes, an old tube's misconvergence), the slider's value */
  chroma = 0;
  /** how strong it is drawn (fxlevels.ts chromaStrength: gentle at first) */
  private chromaE = 0;
  private chromaEl: HTMLCanvasElement | null = null;
  private chromaCtx: CanvasRenderingContext2D | null = null;
  private chromaTmp: HTMLCanvasElement | null = null;
  /**
   * The foreground alone — glyphs, frames, underlines, never a background — at half the
   * screen's size, kept up to date cell by cell like the screen. The colour fringes are
   * cut from it: only what's drawn splits, a panel's or a button's background never tints
   * (0.5.2 took the screen and removed the theme's background: every other background
   * — panels, the shell, selections — came out as a red / blue wash).
   */
  private fgEl: HTMLCanvasElement | null = null;
  private fgCtx: CanvasRenderingContext2D | null = null;
  setChroma(level: number): void {
    this.chroma = Math.max(0, Math.min(200, level));
    this.chromaE = chromaStrength(this.chroma);
    if (!this.chromaEl) {
      this.chromaEl = document.getElementById("chroma") as HTMLCanvasElement | null;
      this.chromaCtx = this.chromaEl?.getContext("2d") ?? null;
      this.chromaTmp = document.createElement("canvas");
      this.fgEl = document.createElement("canvas");
      this.fgCtx = this.fgEl.getContext("2d");
    }
    if (this.chromaEl) {
      this.chromaEl.style.display = this.chroma > 0 ? "block" : "none";
      // a real RGB split, saturated as it goes up; it fades in at the start (no harsh first step)
      const e = this.chromaE;
      this.chromaAmt = Math.min(0.95, 0.5 * Math.min(1, e / 10) + Math.sqrt(e / 200) * 0.45);
      this.chromaEl.style.opacity = String(this.chromaAmt);
    }
    this.sizeChroma();
    this.front = null;
  }
  /**
   * GLOW: what's bright gives light, not the whole screen. A tiny canvas with
   * one pixel per cell holds what each cell emits (a bright glyph's colour, or a
   * lit background: buttons, the selected tab…); CSS scales it up blurred and
   * screens it over the picture. One pixel per changed cell: nearly free.
   */
  glow = 0;
  private glowEl: HTMLCanvasElement | null = null;
  private glowCtx: CanvasRenderingContext2D | null = null;
  private glowBg = 0;
  setGlow(level: number, bg: number): void {
    this.glow = Math.max(0, Math.min(200, level));
    this.glowBg = bg;
    if (!this.glowEl && this.glow > 0) {
      const el = document.createElement("canvas");
      el.id = "glow";
      this.canvas.after(el);
      this.glowEl = el;
      this.glowCtx = el.getContext("2d");
    }
    if (this.glowEl) {
      this.glowEl.style.display = this.glow > 0 ? "block" : "none";
      // past 100 %: a wider, brighter halo
      const k = this.glow / 100;
      // gentle: proportional to the level (8 % is a hint, 100 % a clear halo, 200 % a lot)
      this.glowEl.style.opacity = String(Math.min(1, k * 0.55));
      this.glowAmt = Math.min(1, k * 0.55);
      this.glowSigma = 0.3 + k * 0.25;
      this.glowBright = 1 + Math.max(0, k - 1) * 0.8;
      this.glowEl.style.filter = `blur(${((0.3 + k * 0.25) * (this.cellH || 16)) / (this.dpr || 1)}px) saturate(1.6) brightness(${1 + Math.max(0, k - 1) * 0.8})`;
    }
    this.front = null;
  }
  private sizeGlow(cols: number, rows: number): void {
    const el = this.glowEl;
    if (!el || this.glow <= 0) return;
    if (el.width !== cols || el.height !== rows) (el.width = cols), (el.height = rows);
    el.style.width = this.canvas.style.width;
    el.style.height = this.canvas.style.height;
    el.style.left = this.canvas.style.left;
    el.style.top = this.canvas.style.top;
  }

  private sizeChroma(): void {
    const el = this.chromaEl, tmp = this.chromaTmp, fg = this.fgEl;
    if (!el || !tmp || !fg) return;
    const w = this.chroma > 0 ? Math.ceil(this.canvas.width / 2) : 0, h = this.chroma > 0 ? Math.ceil(this.canvas.height / 2) : 0;
    if (el.width !== w || el.height !== h) {
      el.width = tmp.width = fg.width = w;
      el.height = tmp.height = fg.height = h;
    }
    el.style.width = this.canvas.style.width;
    el.style.height = this.canvas.style.height;
    el.style.left = this.canvas.style.left;
    el.style.top = this.canvas.style.top;
  }
  /** red copy nudged left + blue copy nudged right, screened over the picture (CSS) */
  /**
   * The fringes cost ~9 full-screen compositing passes. Chromium does them on
   * the GPU; WebKit (macOS) and some Linux webviews do them on the CPU, and
   * during an animation (tab switch, login screen) that makes every frame late.
   * So they measure themselves: when they're expensive they only refresh every
   * so often, with a last pass once the screen settles.
   */
  private chromaAt = 0;
  private chromaEvery = 0;
  private chromaTimer: ReturnType<typeof setTimeout> | 0 = 0;
  private chromaFrame(): void {
    const now = performance.now();
    const wait = this.chromaAt + this.chromaEvery - now;
    if (wait > 0) {
      // too soon: one catch-up pass later (the screen may have settled by then)
      if (!this.chromaTimer) this.chromaTimer = setTimeout(() => ((this.chromaTimer = 0), this.chromaFrame()), wait);
      return;
    }
    const t0 = performance.now();
    this.drawChroma();
    this.touchGlass("chroma");
    const cost = performance.now() - t0;
    this.chromaAt = now;
    // cheap (< 2 ms): every frame; else at most ~1/8 of the time goes to it (max 5 per second)
    this.chromaEvery = cost < 2 ? 0 : Math.min(200, cost * 8);
  }

  /**
   * The fringes, from the foreground layer (same size: no scaling): its blue nudged right,
   * its red nudged left, on black — screened over the picture, black adds nothing, so only
   * the text, the frames and the glyphs cast fringes.
   */
  private drawChroma(): void {
    const el = this.chromaEl, ctx = this.chromaCtx, tmp = this.chromaTmp, fg = this.fgEl;
    if (!el || !ctx || !tmp || !fg || !el.width) return;
    const w = el.width, h = el.height;
    // how far the red and the blue move apart (the strength is already eased in: chromaStrength)
    const e = this.chromaE;
    const o = 0.6 * Math.min(1, e / 10) + Math.sqrt(e / 200) * 4.4; // half-res px
    const split = (c: CanvasRenderingContext2D, dx: number, tint: string) => {
      c.globalCompositeOperation = "source-over";
      c.fillStyle = "#000000";
      c.fillRect(0, 0, w, h);
      c.drawImage(fg, dx, 0);
      c.globalCompositeOperation = "multiply";
      c.fillStyle = tint;
      c.fillRect(0, 0, w, h);
    };
    split(tmp.getContext("2d")!, o, "#0000ff");
    split(ctx, -o, "#ff0000");
    ctx.globalCompositeOperation = "lighter";
    ctx.drawImage(tmp, 0, 0);
    ctx.globalCompositeOperation = "source-over";
  }

  /** Hidden for a while: give the glyph cache's memory back (it refills on the next frames). */
  release(): void {
    this.atlas.release();
    this.front = null;
  }

  /** Forget what's on screen: the next draw repaints everything (theme change…). */
  invalidate(): void {
    this.front = null;
  }

  /** Mouse position (CSS px) → cell coordinates. */
  cellAt(clientX: number, clientY: number): { x: number; y: number; fx: number } {
    if (this.glass) ({ left: clientX, top: clientY } = this.toPicture(clientX, clientY));
    const fx = ((clientX - this.left) * this.dpr) / this.cellW;
    const x = Math.floor(fx);
    const y = Math.floor(((clientY - this.top) * this.dpr) / this.cellH);
    return { x: Math.max(0, Math.min(this.cols - 1, x)), y: Math.max(0, Math.min(this.rows - 1, y)), fx: Math.max(0, Math.min(this.cols, fx)) };
  }

  /** Cell → CSS pixel position (used to place the IME popup under the text cursor). */
  cellToPixels(x: number, y: number): { left: number; top: number } {
    return this.toScreen(this.left + (x * this.cellW) / this.dpr, this.top + (y * this.cellH) / this.dpr);
  }

  /**
   * Real CRT curvature (crt.ts): 0 = flat (the cheap overlay alone), up to 1. `bloom` and `scan`
   * are the --bloom and --scanlines strengths the CSS layers use. Needs WebGL and the bloom
   * blurred in its canvas (an old webview's CSS-blurred bloom can't be composed): else flat.
   */
  setCurve(curve: number, bloom: number, scan: number): void {
    this.glassBloom = bloom;
    this.glassScan = scan;
    const want = curve > 0 && this.canvasBlur;
    if (want && !this.glass) {
      // the one put away last time, if its context still lives: one WebGL context for the whole run
      if (this.spareGlass && !this.spareGlass.isLost) (this.glass = this.spareGlass), this.glass.unpark();
      else this.glass = CrtGlass.create(this.canvas, () => this.setCurve(0, bloom, scan));
      this.spareGlass = null;
      this.glass?.fit(this.canvas);
    } else if (!want && this.glass) {
      this.glass.park();
      this.spareGlass = this.glass.isLost ? null : this.glass;
      this.glass = null;
    }
    this.canvas.parentElement?.classList.toggle("glass", !!this.glass);
    if (this.glass) {
      this.glass.k = curveK(curve);
      this.touchGlass("screen");
    }
    this.caretAt.x = -1; // placed again through the new bend
    this.front = null;
  }
  /** the curved glass is on (`debug perf`) */
  get curved(): boolean {
    return !!this.glass;
  }
  private glass: CrtGlass | null = null;
  /** the glass put away (curvature 0), kept for when it comes back (crt.ts park) */
  private spareGlass: CrtGlass | null = null;
  private glassBloom = 0;
  private glassScan = 0;
  private chromaAmt = 0;
  private glowAmt = 0;
  private glowSigma = 0;
  private glowBright = 1;
  private glassInput = (): GlassInput => ({
    screen: this.canvas,
    bloom: this.bloomEnabled ? this.bloom : null,
    bloomAmt: this.glassBloom,
    chroma: this.chroma > 0 ? this.chromaEl : null,
    chromaAmt: this.chromaAmt,
    glow: this.glow > 0 ? this.glowEl : null,
    glowAmt: this.glowAmt,
    glowSigma: this.glowSigma,
    glowBright: this.glowBright,
    cellAspect: this.cellW / (this.cellH || 1),
    scan: this.glassScan,
    dpr: this.dpr,
    top: this.top,
  });
  private touchGlass(layer: "screen" | "bloom" | "chroma" | "glow"): void {
    this.glass?.touch(layer, this.glassInput);
  }
  /** a point on the page (CSS px) → the picture's point shown there (through the bend) */
  private toPicture(x: number, y: number): { left: number; top: number } {
    const w = this.canvas.width / this.dpr, h = this.canvas.height / this.dpr;
    if (!this.glass || !w || !h) return { left: x, top: y };
    const [u, v] = warpPoint((x - this.left) / w, (y - this.top) / h, this.glass.k);
    return { left: this.left + u * w, top: this.top + v * h };
  }
  /** a point of the picture (CSS px) → where it shows on the page */
  private toScreen(x: number, y: number): { left: number; top: number } {
    const w = this.canvas.width / this.dpr, h = this.canvas.height / this.dpr;
    if (!this.glass || !w || !h) return { left: x, top: y };
    const [u, v] = unwarpPoint((x - this.left) / w, (y - this.top) / h, this.glass.k);
    return { left: this.left + u * w, top: this.top + v * h };
  }

  /** Paint the cells of `g` that differ from what's on screen. Returns true if anything was painted. */
  /** cells repainted by the last draw (`debug perf`) */
  lastCells = 0;
  /** glyphs rasterized since the last call (`debug perf`) */
  takeAtlasMisses(): number {
    return this.atlas?.takeMisses() ?? 0;
  }

  draw(g: Grid): boolean {
    const { cellW: cw, cellH: ch, ctx } = this;
    let cellsPainted = 0;
    // the bloom's small copy: switched on (or resized) since the last draw, every cell is drawn again
    if (!this.bloomEnabled) this.bsrcFresh = false;
    else if (!this.bsrcFresh) this.front = null;
    let front = this.front;
    const full = !front || front.cols !== g.cols || front.rows !== g.rows;
    if (full) front = this.front = new Grid(g.cols, g.rows);
    if (this.dirty.length !== g.cols) this.dirty = new Uint8Array(g.cols);
    const dirty = this.dirty;
    let painted = false;
    const now = performance.now();
    this.lastCells = 0;
    const fade = this.fadeMs;
    if (this.born.length !== g.cols * g.rows) this.born = new Float64Array(g.cols * g.rows);
    const born = this.born;
    this.fading = false;
    // Fade only what appears a few letters at a time (typing, text typing itself out).
    // Many letters appearing in one frame is something moving or a page changing:
    // fading those would make them flicker — they're drawn as they are.
    let appearing = 0;
    if (fade > 0 && !full) {
      const n = g.cols * g.rows;
      for (let i = 0; i < n && appearing <= Renderer.FADE_MAX_PER_FRAME; i++) if (g.ch[i] > 32 && front!.ch[i] <= 32 && !(g.attr[i] & NOFADE)) appearing++;
    }
    const fadeNew = appearing <= Renderer.FADE_MAX_PER_FRAME;

    // the foreground layer for the colour fringes (half size: cells in half pixels)
    const bctx = this.bloomEnabled && this.bsrc?.width ? this.bsrcCtx : null;
    if (bctx) {
      bctx.setTransform(1 / Renderer.BLOOM_DIV, 0, 0, 1 / Renderer.BLOOM_DIV, 0, 0);
      this.bsrcFresh = true;
    }
    const fctx = this.chroma > 0 && this.fgEl?.width ? this.fgCtx : null;
    if (fctx) {
      fctx.setTransform(0.5, 0, 0, 0.5, 0, 0);
      if (full) fctx.clearRect(0, 0, g.cols * cw, g.rows * ch);
    }
    const gctx = this.glow > 0 ? this.glowCtx : null;
    if (gctx) {
      this.sizeGlow(g.cols, g.rows);
      if (full) gctx.clearRect(0, 0, g.cols, g.rows);
    }
    for (let y = 0; y < g.rows; y++) {
      const base = y * g.cols;
      let rowDirty = false;
      for (let x = 0; x < g.cols; x++) {
        const i = base + x;
        let d =
          full ||
          g.ch[i] !== front!.ch[i] ||
          g.fg[i] !== front!.fg[i] ||
          g.bg[i] !== front!.bg[i] ||
          g.attr[i] !== front!.attr[i] ||
          g.cap[i] !== front!.cap[i] ||
          g.capEdge[i] !== front!.capEdge[i];
        if (fade > 0) {
          // born[i]: > 0 = fading in since then · < 0 = empty since -born[i] · 0 = settled
          if (g.attr[i] & NOFADE) born[i] = 0; // scenery: drawn as it is
          else if (g.ch[i] <= 32) {
            if (front!.ch[i] > 32 || born[i] > 0) born[i] = -now;
          } else if (d && !full && front!.ch[i] <= 32 && fadeNew) {
            // a letter where there was nothing — but not one that only blinked (a cursor,
            // a blinking badge, a theme's typing effect): empty for 150 ms at least
            born[i] = born[i] === 0 || now + born[i] > 150 ? now : 0;
          }
          // still fading: drawn again, a bit more solid (and settled for good once it's done,
          // so a letter can never stay see-through)
          if (born[i] > 0) {
            if (now - born[i] < fade) d = true;
            else {
              d = true; // one last draw, solid — however late that frame came
              born[i] = 0;
            }
          }
        } else born[i] = 0;
        dirty[x] = d ? 1 : 0;
        if (d) (rowDirty = true), cellsPainted++;
      }
      if (!rowDirty) continue;
      painted = true;

      // Wide characters span two cells: if either half changed, repaint both.
      for (let x = 0; x < g.cols; x++) {
        if (!dirty[x]) continue;
        const cp = g.ch[base + x];
        if (cp === 0 && x > 0) dirty[x - 1] = 1;
        else if (x + 1 < g.cols && g.ch[base + x + 1] === 0) dirty[x + 1] = 1;
      }

      // 1) backgrounds, merged into runs of the same color
      for (let x = 0; x < g.cols; ) {
        if (!dirty[x]) {
          x++;
          continue;
        }
        const bg = g.bg[base + x];
        let end = x + 1;
        while (end < g.cols && dirty[end] && g.bg[base + end] === bg) end++;
        ctx.fillStyle = css(this.L(bg));
        ctx.fillRect(x * cw, y * ch, (end - x) * cw, ch);
        if (bctx) {
          bctx.fillStyle = ctx.fillStyle;
          bctx.fillRect(x * cw, y * ch, (end - x) * cw, ch);
        }
        x = end;
      }

      // 1b) the shortcuts' keys (core/keycap.ts), over the background, under their text
      for (let x = 0; x < g.cols; x++) {
        const i = base + x;
        if (dirty[x] && g.cap[i] !== NONE) drawCapSlice(ctx, x * cw, y * ch, cw, ch, this.L(g.cap[i]), g.capEdge[i], this.keycapLook);
      }

      // the foreground layer: these cells emptied (rounded outward to whole half pixels)
      if (fctx) {
        for (let x = 0; x < g.cols; ) {
          if (!dirty[x]) {
            x++;
            continue;
          }
          let end = x + 1;
          while (end < g.cols && dirty[end]) end++;
          fctx.setTransform(1, 0, 0, 1, 0, 0);
          const x0 = Math.floor((x * cw) / 2), y0 = Math.floor((y * ch) / 2);
          fctx.clearRect(x0, y0, Math.ceil((end * cw) / 2) - x0, Math.ceil(((y + 1) * ch) / 2) - y0);
          fctx.setTransform(0.5, 0, 0, 0.5, 0, 0);
          x = end;
        }
      }

      // 2) glyphs + decorations
      for (let x = 0; x < g.cols; x++) {
        if (!dirty[x]) continue;
        const i = base + x;
        const cp = g.ch[i];
        if (cp === 0) continue;
        const attrs = g.attr[i];
        if (cp > 32) {
          const age = born[i] > 0 ? (now - born[i]) / fade : 1;
          let alpha = 1;
          if (age < 1) {
            // a soft S-curve: it starts gently, settles gently (never invisible)
            alpha = ctx.globalAlpha = 0.15 + 0.85 * age * age * (3 - 2 * age);
            this.fading = true;
          } else born[i] = 0;
          const fgc = this.L(g.fg[i]), cells = charWidth(cp) === 2 ? 2 : 1;
          this.atlas.draw(ctx, cp, fgc, attrs, x * cw, y * ch, cells);
          ctx.globalAlpha = 1;
          if (bctx) {
            bctx.globalAlpha = alpha;
            this.atlas.draw(bctx, cp, fgc, attrs, x * cw, y * ch, cells);
            bctx.globalAlpha = 1;
          }
          // block glyphs (▀ █ ░ — a tab's bar, a picture's pixels, shaded fills) are surfaces, not
          // text: they stay out of the fringes, or every bar and picture tinted red and blue
          if (fctx && !(cp >= 0x2580 && cp <= 0x259f) && !(attrs & PIXELS)) {
            fctx.globalAlpha = alpha;
            this.atlas.draw(fctx, cp, fgc, attrs, x * cw, y * ch, cells);
            fctx.globalAlpha = 1;
          }
        }
        if (gctx) {
          // what this cell gives off: its glyph if it's bright, else a lit background
          // neon gives light, plain text doesn't: bright AND saturated colours emit
          const fgE = cp > 32 ? emission(g.fg[i]) : 0, bgE = g.bg[i] === this.glowBg || g.bg[i] === NONE ? 0 : emission(g.bg[i]);
          const src = fgE >= bgE ? g.fg[i] : g.bg[i];
          const e = Math.max(fgE, bgE);
          gctx.clearRect(x, y, 1, 1);
          if (e > 0) {
            gctx.globalAlpha = Math.min(1, e * 1.8);
            gctx.fillStyle = css(src);
            gctx.fillRect(x, y, 1, 1);
            gctx.globalAlpha = 1;
          }
        }
        if (attrs & (UNDERLINE | STRIKE)) {
          ctx.fillStyle = css(this.L(g.fg[i]));
          const t = Math.max(1, Math.round(ch / 16));
          if (attrs & UNDERLINE) ctx.fillRect(x * cw, y * ch + this.baseline + t, cw, t);
          if (attrs & STRIKE) ctx.fillRect(x * cw, y * ch + Math.round(ch * 0.55), cw, t);
          if (fctx) {
            fctx.fillStyle = ctx.fillStyle;
            if (attrs & UNDERLINE) fctx.fillRect(x * cw, y * ch + this.baseline + t, cw, t);
            if (attrs & STRIKE) fctx.fillRect(x * cw, y * ch + Math.round(ch * 0.55), cw, t);
          }
        }
      }
    }

    front!.ch.set(g.ch);
    front!.fg.set(g.fg);
    front!.bg.set(g.bg);
    front!.attr.set(g.attr);
    front!.cap.set(g.cap);
    front!.capEdge.set(g.capEdge);

    if (painted && this.bloomEnabled) this.bloomFrame();
    if (painted && this.chroma > 0) this.chromaFrame();
    if (painted) (this.touchGlass("screen"), this.glow > 0 && this.touchGlass("glow"));
    this.lastCells = cellsPainted;
    return painted;
  }

  /** the bloom copy: at most 20 times a second, with a catch-up pass once things settle */
  private bloomAt = 0;
  private bloomTimer: ReturnType<typeof setTimeout> | 0 = 0;
  private bloomFrame(): void {
    const wait = this.bloomAt + 50 - performance.now();
    if (wait > 0) {
      if (!this.bloomTimer) this.bloomTimer = setTimeout(() => ((this.bloomTimer = 0), this.bloomFrame()), wait);
      return;
    }
    this.bloomAt = performance.now();
    {
      // Bloom = blurred, downscaled copy of the screen added on top (CSS does the blur on the GPU).
      const b = this.bloomCtx;
      if (this.canvasBlur) {
        b.clearRect(0, 0, this.bloom.width, this.bloom.height);
        // the halo's spread (CSS px), in bloom pixels
        b.filter = `${Renderer.BRIGHT_PASS} blur(${((this.bloomR * this.dpr) / Renderer.BLOOM_DIV).toFixed(2)}px) saturate(1.4)`;
      }
      // from its own small copy: the screen canvas is never read for it (G3)
      b.drawImage(this.bsrcFresh && this.bsrc ? this.bsrc : this.canvas, 0, 0, this.bloom.width, this.bloom.height);
      if (this.canvasBlur) b.filter = "none";
    }
    this.touchGlass("bloom");
  }
}

/** perceived brightness 0..1 of an RGB packed as 0xRRGGBB */
function lum(c: number): number {
  return (((c >> 16) & 255) * 0.299 + ((c >> 8) & 255) * 0.587 + (c & 255) * 0.114) / 255;
}

/** how much light a colour gives off: bright and saturated (neon) = a lot, greys and whites = none */
function emission(c: number): number {
  const r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  const sat = mx ? (mx - mn) / mx : 0;
  return Math.max(0, lum(c) * (0.2 + sat) - 0.32);
}
