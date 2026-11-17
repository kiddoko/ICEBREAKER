import { GlyphAtlas } from "./atlas";
import { css } from "./color";
import { BOLD, Grid, ITALIC, STRIKE, UNDERLINE } from "./grid";
import { charWidth } from "./unicode";

export const FONT_STACK = '"JetBrains Mono", "Cascadia Mono", "SF Mono", Menlo, Consolas, "DejaVu Sans Mono", monospace';

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
  /** Light = JetBrains Mono 300 / 600 (crisp on HiDPI), regular = 400 / 700. */
  private light = true;
  bloomEnabled = true;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly bloom: HTMLCanvasElement,
    fontSize: number,
    weight: "light" | "regular" = "light",
  ) {
    this.ctx = canvas.getContext("2d", { alpha: false })!;
    this.bloomCtx = bloom.getContext("2d")!;
    this.light = weight === "light";
    this.setFontSize(fontSize);
  }

  /** Change the font size (zoom). Rebuilds metrics and forces a full repaint. */
  setFontSize(size: number): void {
    this.fontPx = Math.max(8, Math.min(48, size));
    this.measure();
  }

  setWeight(weight: "light" | "regular"): void {
    this.light = weight === "light";
    this.measure();
  }

  get fontSize(): number {
    return this.fontPx;
  }

  private font(attrs: number): string {
    const style = attrs & ITALIC ? "italic " : "";
    const weight = attrs & BOLD ? (this.light ? "600 " : "700 ") : this.light ? "300 " : "400 ";
    return `${style}${weight}${Math.round(this.fontPx * this.dpr)}px ${FONT_STACK}`;
  }

  private measure(): void {
    this.dpr = window.devicePixelRatio || 1;
    const ctx = this.ctx;
    ctx.font = this.font(0);
    const m = ctx.measureText("M");
    const ascent = m.fontBoundingBoxAscent ?? m.actualBoundingBoxAscent;
    const descent = m.fontBoundingBoxDescent ?? m.actualBoundingBoxDescent;
    const lineHeight = 1.12;
    this.cellW = Math.ceil(m.width);
    this.cellH = Math.ceil((ascent + descent) * lineHeight);
    this.baseline = Math.round((this.cellH - (ascent + descent)) / 2 + ascent);
    this.atlas = new GlyphAtlas(this.cellW, this.cellH, this.baseline, (a) => this.font(a));
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
    this.bloom.width = Math.ceil(w / 2);
    this.bloom.height = Math.ceil(h / 2);

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
    this.front = null;
    return { cols: this.cols, rows: this.rows };
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
      this.bloomCtx.drawImage(this.canvas, 0, 0, this.bloom.width, this.bloom.height);
    }
    return painted;
  }
}
