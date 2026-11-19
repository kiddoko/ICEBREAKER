/**
 * Procedural glyphs: box-drawing lines, block elements, braille dots and
 * powerline separators are drawn with rectangles instead of the font.
 *
 * Why: font glyphs for these rarely fill the cell exactly, which leaves
 * hairline gaps between panels and graphs. Drawing them ourselves makes
 * borders seamless and graphs pixel-perfect at any font size — the same
 * trick used by kitty, WezTerm and Ghostty.
 *
 * Returns false when the code point isn't handled, so the caller falls back to the font.
 */
export function drawSpecialGlyph(
  ctx: CanvasRenderingContext2D,
  cp: number,
  x: number,
  y: number,
  w: number,
  h: number,
): boolean {
  if (cp >= 0x2500 && cp <= 0x257f) return drawBox(ctx, cp, x, y, w, h);
  if (cp >= 0x2580 && cp <= 0x259f) return drawBlock(ctx, cp, x, y, w, h);
  if (cp >= 0x2800 && cp <= 0x28ff) return drawBraille(ctx, cp - 0x2800, x, y, w, h);
  if (cp >= 0xe0b0 && cp <= 0xe0b7) return drawPowerline(ctx, cp, x, y, w, h);
  if (cp === 0x25a0) return drawSquare(ctx, x, y, w, h);
  return false;
}

/**
 * ■ drawn by hand: a true square, centred on the cell — on the same middle line as
 * ─ ━ (the slider's handle, the ticked boxes [■]). Fonts put theirs a bit off.
 */
function drawSquare(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): boolean {
  const side = Math.max(2, Math.round(Math.min(w, h) * 0.8));
  const sx = Math.round(x + (w - side) / 2);
  const sy = Math.round(y + (h - side) / 2);
  ctx.fillRect(sx, sy, side, side);
  return true;
}

// ── Box drawing ────────────────────────────────────────────────────────────
// Each character = the weight of its 4 arms [up, right, down, left]: 0 none, 1 light, 2 heavy.
const BOX: Record<number, [number, number, number, number]> = {
  0x2500: [0, 1, 0, 1], 0x2501: [0, 2, 0, 2], 0x2502: [1, 0, 1, 0], 0x2503: [2, 0, 2, 0],
  0x250c: [0, 1, 1, 0], 0x250f: [0, 2, 2, 0], 0x2510: [0, 0, 1, 1], 0x2513: [0, 0, 2, 2],
  0x2514: [1, 1, 0, 0], 0x2517: [2, 2, 0, 0], 0x2518: [1, 0, 0, 1], 0x251b: [2, 0, 0, 2],
  0x251c: [1, 1, 1, 0], 0x2523: [2, 2, 2, 0], 0x2524: [1, 0, 1, 1], 0x252b: [2, 0, 2, 2],
  0x252c: [0, 1, 1, 1], 0x2533: [0, 2, 2, 2], 0x2534: [1, 1, 0, 1], 0x253b: [2, 2, 0, 2],
  0x253c: [1, 1, 1, 1], 0x254b: [2, 2, 2, 2],
  0x2574: [0, 0, 0, 1], 0x2575: [1, 0, 0, 0], 0x2576: [0, 1, 0, 0], 0x2577: [0, 0, 1, 0],
  0x2578: [0, 0, 0, 2], 0x2579: [2, 0, 0, 0], 0x257a: [0, 2, 0, 0], 0x257b: [0, 0, 2, 0],
};

// Rounded corners ╭ ╮ ╯ ╰ — which two arms they connect.
const ARCS: Record<number, [number, number, number, number]> = {
  0x256d: [0, 1, 1, 0], 0x256e: [0, 0, 1, 1], 0x256f: [1, 0, 0, 1], 0x2570: [1, 1, 0, 0],
};

function lineWidth(w: number, weight: number): number {
  const light = Math.max(1, Math.round(w / 9));
  return weight === 2 ? light * 2 : light;
}

function drawBox(ctx: CanvasRenderingContext2D, cp: number, x: number, y: number, w: number, h: number): boolean {
  const arms = BOX[cp];
  if (arms) {
    const [up, right, down, left] = arms;
    const mx = x + Math.floor(w / 2);
    const my = y + Math.floor(h / 2);
    const tMax = lineWidth(w, Math.max(...arms));
    const half = Math.floor(tMax / 2);
    if (left) {
      const t = lineWidth(w, left);
      ctx.fillRect(x, my - Math.floor(t / 2), mx - x + Math.ceil(tMax / 2), t);
    }
    if (right) {
      const t = lineWidth(w, right);
      ctx.fillRect(mx - half, my - Math.floor(t / 2), x + w - (mx - half), t);
    }
    if (up) {
      const t = lineWidth(w, up);
      ctx.fillRect(mx - Math.floor(t / 2), y, t, my - y + Math.ceil(tMax / 2));
    }
    if (down) {
      const t = lineWidth(w, down);
      ctx.fillRect(mx - Math.floor(t / 2), my - half, t, y + h - (my - half));
    }
    return true;
  }

  const arc = ARCS[cp];
  if (arc) {
    const t = lineWidth(w, 1);
    // centre of the straight lines this arc must connect to
    const cx = x + Math.floor(w / 2) - Math.floor(t / 2) + t / 2;
    const cy = y + Math.floor(h / 2) - Math.floor(t / 2) + t / 2;
    const r = Math.min(w, h) / 2;
    const [, right, down] = arc;
    const ex = right ? x + w : x; // horizontal end
    const ey = down ? y + h : y; // vertical end
    ctx.save();
    ctx.lineWidth = t;
    ctx.strokeStyle = ctx.fillStyle;
    ctx.beginPath();
    ctx.moveTo(ex, cy);
    ctx.arcTo(cx, cy, cx, ey, r);
    ctx.lineTo(cx, ey);
    ctx.stroke();
    ctx.restore();
    return true;
  }
  return false; // double lines, dashes… → font
}

// ── Block elements ▀ ▄ █ ▌ ░ ▒ ▓ ▖ ▗ … ──────────────────────────────────────
const QUADS: Record<number, number> = {
  // bit 1 = upper-left, 2 = upper-right, 4 = lower-left, 8 = lower-right
  0x2596: 4, 0x2597: 8, 0x2598: 1, 0x2599: 13, 0x259a: 9,
  0x259b: 7, 0x259c: 11, 0x259d: 2, 0x259e: 6, 0x259f: 14,
};

function drawBlock(ctx: CanvasRenderingContext2D, cp: number, x: number, y: number, w: number, h: number): boolean {
  const hh = Math.round(h / 2);
  const hw = Math.round(w / 2);
  if (cp === 0x2580) ctx.fillRect(x, y, w, hh); // ▀
  else if (cp >= 0x2581 && cp <= 0x2588) {
    const eighths = cp - 0x2580; // ▁..█ : 1/8 .. 8/8 from the bottom
    const bh = Math.round((h * eighths) / 8);
    ctx.fillRect(x, y + h - bh, w, bh);
  } else if (cp >= 0x2589 && cp <= 0x258f) {
    const eighths = 8 - (cp - 0x2588); // ▉..▏ : 7/8 .. 1/8 from the left
    ctx.fillRect(x, y, Math.round((w * eighths) / 8), h);
  } else if (cp === 0x2590) ctx.fillRect(x + hw, y, w - hw, h); // ▐
  else if (cp >= 0x2591 && cp <= 0x2593) {
    // ░ ▒ ▓ — shades as translucent fills (clean on any background)
    const prev = ctx.globalAlpha;
    ctx.globalAlpha = prev * [0.25, 0.5, 0.75][cp - 0x2591];
    ctx.fillRect(x, y, w, h);
    ctx.globalAlpha = prev;
  } else if (cp === 0x2594) ctx.fillRect(x, y, w, Math.max(1, Math.round(h / 8))); // ▔
  else if (cp === 0x2595) {
    const bw = Math.max(1, Math.round(w / 8)); // ▕
    ctx.fillRect(x + w - bw, y, bw, h);
  } else {
    const q = QUADS[cp];
    if (q === undefined) return false;
    if (q & 1) ctx.fillRect(x, y, hw, hh);
    if (q & 2) ctx.fillRect(x + hw, y, w - hw, hh);
    if (q & 4) ctx.fillRect(x, y + hh, hw, h - hh);
    if (q & 8) ctx.fillRect(x + hw, y + hh, w - hw, h - hh);
  }
  return true;
}

// ── Braille ⣿ — 2×4 dots per cell, great for high-resolution graphs ──────────
// Unicode dot order: bit0..2 = left column rows 0..2, bit3..5 = right column rows 0..2, bit6/7 = row 3.
const BRAILLE_DOTS: [number, number][] = [
  [0, 0], [0, 1], [0, 2], [1, 0], [1, 1], [1, 2], [0, 3], [1, 3],
];

function drawBraille(ctx: CanvasRenderingContext2D, bits: number, x: number, y: number, w: number, h: number): boolean {
  const size = Math.max(1, Math.round(w / 5));
  for (let b = 0; b < 8; b++) {
    if (!(bits & (1 << b))) continue;
    const [col, row] = BRAILLE_DOTS[b];
    const cx = x + Math.round(((col * 2 + 1) * w) / 4) - Math.floor(size / 2);
    const cy = y + Math.round(((row * 2 + 1) * h) / 8) - Math.floor(size / 2);
    ctx.fillRect(cx, cy, size, size);
  }
  return true;
}

// ── Powerline separators     (no Nerd Font needed) ────────────────────────
function drawPowerline(ctx: CanvasRenderingContext2D, cp: number, x: number, y: number, w: number, h: number): boolean {
  ctx.beginPath();
  switch (cp) {
    case 0xe0b0: // solid right-pointing triangle
      ctx.moveTo(x, y);
      ctx.lineTo(x + w, y + h / 2);
      ctx.lineTo(x, y + h);
      break;
    case 0xe0b2: // solid left-pointing triangle
      ctx.moveTo(x + w, y);
      ctx.lineTo(x, y + h / 2);
      ctx.lineTo(x + w, y + h);
      break;
    case 0xe0b4: // right half-circle
      ctx.moveTo(x, y);
      ctx.ellipse(x, y + h / 2, w, h / 2, 0, -Math.PI / 2, Math.PI / 2);
      break;
    case 0xe0b6: // left half-circle
      ctx.moveTo(x + w, y);
      ctx.ellipse(x + w, y + h / 2, w, h / 2, 0, -Math.PI / 2, Math.PI / 2, true);
      break;
    default:
      return false;
  }
  ctx.closePath();
  ctx.fill();
  return true;
}
