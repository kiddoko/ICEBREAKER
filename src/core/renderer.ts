import { GlyphAtlas } from "./atlas";
import { css } from "./color";
import { BOLD, Grid, ITALIC, STRIKE, UNDERLINE } from "./grid";
import { fontStack } from "./fonts";
import { charWidth } from "./unicode";

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
  /** Canvas position on the page, in CSS pixels. */
  left = 0;
  top = 0;

  private ctx: CanvasRenderingContext2D;
  private bloomCtx: CanvasRenderingContext2D;
  private front: Grid | null = null;
  private atlas!: GlyphAtlas;
  private dirty = new Uint8Array(0);
  private fontPx = 16;
  private baseline = 0;
  /** [normal, bold] weights. Thin 200/500 is the crispest on HiDPI screens. */
  private weights: readonly [number, number] = [200, 500];
  private stack = FONT_STACK;
  private lineHeight = 1.12;
  bloomEnabled = true;
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
    this.setFontSize(fontSize);
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
    this.atlas = new GlyphAtlas(this.cellW, this.cellH, this.baseline, (a) => this.font(a));
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

  /** 0–100: chromatic aberration (red and blue fringes, an old tube's misconvergence). */
  chroma = 0;
  private chromaEl: HTMLCanvasElement | null = null;
  private chromaCtx: CanvasRenderingContext2D | null = null;
  private chromaTmp: HTMLCanvasElement | null = null;
  /** the theme background, taken out of the fringes so only the text casts them */
  private chromaBg = "#000000";
  setChroma(level: number, bg = "#000000"): void {
    this.chroma = Math.max(0, Math.min(100, level));
    this.chromaBg = bg;
    if (!this.chromaEl) {
      this.chromaEl = document.getElementById("chroma") as HTMLCanvasElement | null;
      this.chromaCtx = this.chromaEl?.getContext("2d") ?? null;
      this.chromaTmp = document.createElement("canvas");
    }
    if (this.chromaEl) {
      this.chromaEl.style.display = this.chroma > 0 ? "block" : "none";
      this.chromaEl.style.opacity = String(0.25 + (this.chroma / 100) * 0.55);
    }
    this.sizeChroma();
    this.front = null;
  }
  private sizeChroma(): void {
    const el = this.chromaEl, tmp = this.chromaTmp;
    if (!el || !tmp) return;
    const w = this.chroma > 0 ? Math.ceil(this.canvas.width / 2) : 0, h = this.chroma > 0 ? Math.ceil(this.canvas.height / 2) : 0;
    if (el.width !== w || el.height !== h) {
      el.width = tmp.width = w;
      el.height = tmp.height = h;
    }
    el.style.width = this.canvas.style.width;
    el.style.height = this.canvas.style.height;
    el.style.left = this.canvas.style.left;
    el.style.top = this.canvas.style.top;
  }
  /** red copy nudged left + blue copy nudged right, screened over the picture (CSS) */
  private drawChroma(): void {
    const el = this.chromaEl, ctx = this.chromaCtx, tmp = this.chromaTmp;
    if (!el || !ctx || !tmp || !el.width) return;
    const w = el.width, h = el.height;
    const o = 0.35 + (this.chroma / 100) * 0.9; // half-res px
    const t = tmp.getContext("2d")!;
    t.globalCompositeOperation = "source-over";
    t.clearRect(0, 0, w, h);
    t.drawImage(this.canvas, o, 0, w, h);
    t.globalCompositeOperation = "difference";
    t.fillStyle = this.chromaBg;
    t.fillRect(0, 0, w, h);
    t.globalCompositeOperation = "multiply";
    t.fillStyle = "#0000ff";
    t.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = "source-over";
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(this.canvas, -o, 0, w, h);
    ctx.globalCompositeOperation = "difference";
    ctx.fillStyle = this.chromaBg;
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = "multiply";
    ctx.fillStyle = "#ff0000";
    ctx.fillRect(0, 0, w, h);
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
  cellAt(clientX: number, clientY: number): { x: number; y: number } {
    const x = Math.floor(((clientX - this.left) * this.dpr) / this.cellW);
    const y = Math.floor(((clientY - this.top) * this.dpr) / this.cellH);
    return { x: Math.max(0, Math.min(this.cols - 1, x)), y: Math.max(0, Math.min(this.rows - 1, y)) };
  }

  /** Cell → CSS pixel position (used to place the IME popup under the text cursor). */
  cellToPixels(x: number, y: number): { left: number; top: number } {
    return { left: this.left + (x * this.cellW) / this.dpr, top: this.top + (y * this.cellH) / this.dpr };
  }

  /** Paint the cells of `g` that differ from what's on screen. Returns true if anything was painted. */
  draw(g: Grid): boolean {
    const { cellW: cw, cellH: ch, ctx } = this;
    let front = this.front;
    const full = !front || front.cols !== g.cols || front.rows !== g.rows;
    if (full) front = this.front = new Grid(g.cols, g.rows);
    if (this.dirty.length !== g.cols) this.dirty = new Uint8Array(g.cols);
    const dirty = this.dirty;
    let painted = false;

    for (let y = 0; y < g.rows; y++) {
      const base = y * g.cols;
      let rowDirty = false;
      for (let x = 0; x < g.cols; x++) {
        const i = base + x;
        const d =
          full ||
          g.ch[i] !== front!.ch[i] ||
          g.fg[i] !== front!.fg[i] ||
          g.bg[i] !== front!.bg[i] ||
          g.attr[i] !== front!.attr[i];
        dirty[x] = d ? 1 : 0;
        if (d) rowDirty = true;
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
        ctx.fillStyle = css(bg);
        ctx.fillRect(x * cw, y * ch, (end - x) * cw, ch);
        x = end;
      }

      // 2) glyphs + decorations
      for (let x = 0; x < g.cols; x++) {
        if (!dirty[x]) continue;
        const i = base + x;
        const cp = g.ch[i];
        if (cp === 0) continue;
        const attrs = g.attr[i];
        if (cp > 32) this.atlas.draw(ctx, cp, g.fg[i], attrs, x * cw, y * ch, charWidth(cp) === 2 ? 2 : 1);
        if (attrs & (UNDERLINE | STRIKE)) {
          ctx.fillStyle = css(g.fg[i]);
          const t = Math.max(1, Math.round(ch / 16));
          if (attrs & UNDERLINE) ctx.fillRect(x * cw, y * ch + this.baseline + t, cw, t);
          if (attrs & STRIKE) ctx.fillRect(x * cw, y * ch + Math.round(ch * 0.55), cw, t);
        }
      }
    }

    front!.ch.set(g.ch);
    front!.fg.set(g.fg);
    front!.bg.set(g.bg);
    front!.attr.set(g.attr);

    if (painted && this.bloomEnabled) {
      // Bloom = blurred, downscaled copy of the screen added on top (CSS does the blur on the GPU).
      const b = this.bloomCtx;
      if (this.canvasBlur) {
        b.clearRect(0, 0, this.bloom.width, this.bloom.height);
        // ≈ the old CSS blur(3px), in bloom pixels
        b.filter = `blur(${((3 * this.dpr) / Renderer.BLOOM_DIV).toFixed(2)}px) saturate(1.4)`;
      }
      b.drawImage(this.canvas, 0, 0, this.bloom.width, this.bloom.height);
      if (this.canvasBlur) b.filter = "none";
    }
    if (painted && this.chroma > 0) {
      this.drawChroma();
    }
    return painted;
  }
}
