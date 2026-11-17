import type { Grid } from "../core/grid";

/**
 * Glitch: post-process that tears rows sideways and sprinkles noise.
 * Applied to the finished frame for a few hundred ms (theme switch, boot → desktop).
 */
const NOISE = [..."░▒▓█▚▞▖▗▘▝<>/\\|_-=+*#%@"];

export function glitch(g: Grid, intensity: number, seed: number): void {
  if (intensity <= 0) return;
  let s = seed | 0;
  const rand = () => {
    s = (Math.imul(s, 1103515245) + 12345) | 0;
    return ((s >>> 0) % 10000) / 10000;
  };

  const tears = Math.floor(g.rows * 0.15 * intensity) + 1;
  for (let k = 0; k < tears; k++) {
    const y = Math.floor(rand() * g.rows);
    const shift = Math.floor((rand() - 0.5) * 12 * intensity);
    if (!shift) continue;
    const base = y * g.cols;
    const ch = g.ch.slice(base, base + g.cols);
    const fg = g.fg.slice(base, base + g.cols);
    const bg = g.bg.slice(base, base + g.cols);
    for (let x = 0; x < g.cols; x++) {
      const src = (x - shift + g.cols) % g.cols;
      g.ch[base + x] = ch[src] === 0 ? 32 : ch[src];
      g.fg[base + x] = fg[src];
      g.bg[base + x] = bg[src];
    }
  }

  const sparks = Math.floor(g.cols * g.rows * 0.01 * intensity);
  for (let k = 0; k < sparks; k++) {
    const i = Math.floor(rand() * g.ch.length);
    if (g.ch[i] === 0) continue;
    g.ch[i] = NOISE[Math.floor(rand() * NOISE.length)].codePointAt(0)!;
  }
}

/**
 * "Decrypt" text reveal: characters before `progress` are final, the rest
 * cycle through random glyphs. progress ∈ [0, 1].
 */
export const SCRAMBLE_TEXT = [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&*+=<>/\\[]{}"];
export const SCRAMBLE_BLOCKS = [..."░▒▓▚▞▖▗▘▝▙▛▜▟"];

export function decrypt(target: string, progress: number, now: number, charset = SCRAMBLE_TEXT): string {
  const chars = [...target];
  const revealed = Math.floor(chars.length * Math.max(0, Math.min(1, progress)));
  const tick = Math.floor(now / 50);
  return chars
    .map((c, i) => {
      if (i < revealed || c === " ") return c;
      return charset[(i * 31 + tick * 17) % charset.length];
    })
    .join("");
}
