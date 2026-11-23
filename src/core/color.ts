/**
 * Colors are plain numbers (0xRRGGBB). Numbers are cheap to store in typed
 * arrays and cheap to compare — the renderer diffs every cell every frame.
 */
export type RGB = number;

/** "No color": when drawing, keep whatever color the cell already has. */
export const NONE = -1;

/** Parse "#rrggbb" or "#rgb". Throws on garbage so theme typos are loud. */
export function hex(input: string): RGB {
  let h = input.trim().replace(/^#/, "");
  if (h.length === 3) h = [...h].map((c) => c + c).join("");
  if (!/^[0-9a-fA-F]{6}$/.test(h)) throw new Error(`invalid color "${input}" (expected #rrggbb)`);
  return parseInt(h, 16);
}

const cssCache = new Map<RGB, string>();

/** Number → "#rrggbb" for canvas fillStyle (cached, called a lot). */
export function css(c: RGB): string {
  let s = cssCache.get(c);
  if (s === undefined) {
    s = "#" + (c & 0xffffff).toString(16).padStart(6, "0");
    cssCache.set(c, s);
  }
  return s;
}

const clamp = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));

export function rgb(r: number, g: number, b: number): RGB {
  return (clamp(r) << 16) | (clamp(g) << 8) | clamp(b);
}

export function channels(c: RGB): [number, number, number] {
  return [(c >> 16) & 255, (c >> 8) & 255, c & 255];
}

/** Linear blend: t=0 → a, t=1 → b. */
export function mix(a: RGB, b: RGB, t: number): RGB {
  const [ar, ag, ab] = channels(a);
  const [br, bg, bb] = channels(b);
  return rgb(ar + (br - ar) * t, ag + (bg - ag) * t, ab + (bb - ab) * t);
}

/** relative luminance (WCAG 2.1) */
function luminance(c: RGB): number {
  const lin = (v: number) => ((v /= 255) <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  const [r, g, b] = channels(c);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** The contrast ratio of two colours, 1 to 21 (WCAG: text ≥ 4.5, large text and graphics ≥ 3). */
export function contrast(a: RGB, b: RGB): number {
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/**
 * `c` as it is when it reads at `ratio` on every one of `bgs`; else moved towards `towards`
 * (the theme's text colour) just enough that it does — its hue kept as far as it can be.
 */
export function readable(c: RGB, bgs: RGB[], ratio: number, towards: RGB): RGB {
  const ok = (x: RGB) => bgs.every((b) => contrast(x, b) >= ratio);
  if (ok(c)) return c;
  for (let t = 0.05; t < 1; t += 0.05) {
    const m = mix(c, towards, t);
    if (ok(m)) return m;
  }
  return towards;
}

/** Sample a multi-stop gradient at t ∈ [0, 1]. */
export function gradient(stops: RGB[], t: number): RGB {
  if (stops.length === 0) return 0xffffff;
  if (stops.length === 1) return stops[0];
  const x = Math.min(0.9999, Math.max(0, t)) * (stops.length - 1);
  const i = Math.floor(x);
  return mix(stops[i], stops[i + 1], x - i);
}

/** Hue (0–360), saturation and lightness (0–1) → RGB (the theme studio's palette). */
export function hsl(h: number, s: number, l: number): RGB {
  const hh = (((h % 360) + 360) % 360) / 60;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs((hh % 2) - 1));
  const [r, g, b] = hh < 1 ? [c, x, 0] : hh < 2 ? [x, c, 0] : hh < 3 ? [0, c, x] : hh < 4 ? [0, x, c] : hh < 5 ? [x, 0, c] : [c, 0, x];
  const m = l - c / 2;
  return rgb((r + m) * 255, (g + m) * 255, (b + m) * 255);
}

/** RGB → [hue 0–360, saturation 0–1, lightness 0–1]. */
export function toHsl(c: RGB): [number, number, number] {
  const [r, g, b] = channels(c).map((v) => v / 255);
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn;
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = mx === r ? ((g - b) / d + (g < b ? 6 : 0)) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}
