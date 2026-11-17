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

/** Sample a multi-stop gradient at t ∈ [0, 1]. */
export function gradient(stops: RGB[], t: number): RGB {
  if (stops.length === 0) return 0xffffff;
  if (stops.length === 1) return stops[0];
  const x = Math.min(0.9999, Math.max(0, t)) * (stops.length - 1);
  const i = Math.floor(x);
  return mix(stops[i], stops[i + 1], x - i);
}
