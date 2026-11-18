import { css, type RGB } from "./color";
import { drawSpecialGlyph } from "./glyphs";
import { BOLD, DIM, ITALIC } from "./grid";

/**
 * Glyph cache. Rasterizing text with fillText is slow; copying pixels with
 * drawImage is fast. So each (character, color, style) is rendered once into
 * an off-screen "page" and then stamped onto the screen as many times as needed.
 *
 * Every slot is two cells wide so wide characters (漢字) fit too.
 */
export class GlyphAtlas {
  private static readonly PAGE = 1024;
  private static readonly MAX_PAGES = 4;

  private pages: { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D }[] = [];
  private slots = new Map<string, number>();
  private next = 0;
  private readonly slotW: number;
  private readonly perRow: number;
  private readonly perPage: number;

  constructor(
    private readonly cellW: number,
    private readonly cellH: number,
    private readonly baseline: number,
    private readonly fontFor: (attrs: number) => string,
  ) {
    this.slotW = cellW * 2;
    this.perRow = Math.max(1, Math.floor(GlyphAtlas.PAGE / this.slotW));
    this.perPage = this.perRow * Math.max(1, Math.floor(GlyphAtlas.PAGE / cellH));
  }

  /** Stamp one glyph onto `dst` at pixel position (dx, dy). */
  draw(dst: CanvasRenderingContext2D, cp: number, fg: RGB, attrs: number, dx: number, dy: number, cells: number): void {
    // colours rounded to 6 bits a channel: fades and gradients reuse glyphs
    // instead of filling the cache with a thousand near-identical tints
    if (fg >= 0) fg = (fg & 0xfcfcfc) as RGB;
    const key = `${cp}:${fg}:${attrs & (BOLD | ITALIC | DIM)}`;
    let slot = this.slots.get(key);
    if (slot === undefined) {
      slot = this.allocate();
      this.slots.set(key, slot);
      this.rasterize(slot, cp, fg, attrs, cells);
    }
    const page = this.pages[Math.floor(slot / this.perPage)];
    const local = slot % this.perPage;
    const sx = (local % this.perRow) * this.slotW;
    const sy = Math.floor(local / this.perRow) * this.cellH;
    const w = this.cellW * cells;
    dst.drawImage(page.canvas, sx, sy, w, this.cellH, dx, dy, w, this.cellH);
  }

  /** Free every page (the deck is hidden for a while); glyphs come back on demand. */
  release(): void {
    for (const p of this.pages) p.canvas.width = p.canvas.height = 0;
    this.pages = [];
    this.slots.clear();
    this.next = 0;
  }

  private allocate(): number {
    if (this.next >= this.perPage * GlyphAtlas.MAX_PAGES) {
      // Cache full (huge variety of colors/glyphs): start over. Pixels already
      // on screen are unaffected; glyphs are simply re-rasterized on demand.
      this.slots.clear();
      this.next = 0;
    }
    const slot = this.next++;
    const pageIndex = Math.floor(slot / this.perPage);
    if (!this.pages[pageIndex]) {
      const canvas = document.createElement("canvas");
      canvas.width = GlyphAtlas.PAGE;
      canvas.height = GlyphAtlas.PAGE;
      const ctx = canvas.getContext("2d")!;
      this.pages[pageIndex] = { canvas, ctx };
    }
    return slot;
  }

  private rasterize(slot: number, cp: number, fg: RGB, attrs: number, cells: number): void {
    const { ctx } = this.pages[Math.floor(slot / this.perPage)];
    const local = slot % this.perPage;
    const x = (local % this.perRow) * this.slotW;
    const y = Math.floor(local / this.perRow) * this.cellH;
    const w = this.cellW * Math.max(1, cells);

    ctx.clearRect(x, y, this.slotW, this.cellH);
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, this.cellH);
    ctx.clip();
    ctx.fillStyle = css(fg);
    ctx.globalAlpha = attrs & DIM ? 0.55 : 1;

    if (!drawSpecialGlyph(ctx, cp, x, y, w, this.cellH)) {
      const s = String.fromCodePoint(cp);
      ctx.font = this.fontFor(attrs);
      ctx.textBaseline = "alphabetic";
      // Fallback-font glyphs can be narrower/wider than the cell: center them,
      // and let fillText squeeze anything too wide (4th argument).
      const m = ctx.measureText(s).width;
      const ox = m < w ? (w - m) / 2 : 0;
      ctx.fillText(s, x + ox, y + this.baseline, w);
    }
    ctx.restore();
  }
}
