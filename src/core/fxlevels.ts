import type { Deck } from "../deck";

/**
 * One number per effect: 0 = off, up to 200 % (sharpness: 0–100, 100 = razor).
 * For bloom / scanlines / vignette the on/off switch and the strength are one
 * setting now: setting a strength turns it on, 0 turns it off.
 */
export const FX_LEVELS = ["bloom", "scanlines", "vignette", "chroma", "sharpness", "glow", "curve"] as const;
export type FxLevel = (typeof FX_LEVELS)[number];
const SWITCHED = ["bloom", "scanlines", "vignette"] as const;

export const fxMax = (e: FxLevel): number => (e === "sharpness" || e === "curve" ? 100 : 200);

export function getFx(deck: Deck, e: FxLevel): number {
  const fx = deck.settings.data.fx;
  const lv = fx.levels[e] ?? (e === "sharpness" ? 100 : e === "chroma" || e === "glow" || e === "curve" ? 0 : 100);
  if ((SWITCHED as readonly string[]).includes(e) && !fx[e as (typeof SWITCHED)[number]]) return 0;
  return lv;
}

export function setFx(deck: Deck, e: FxLevel, value: number): number {
  const v = Math.round(Math.max(0, Math.min(fxMax(e), value)));
  const s = deck.settings;
  if ((SWITCHED as readonly string[]).includes(e)) {
    s.set(`fx.${e}`, v > 0);
    if (v > 0) s.set(`fx.levels.${e}`, v);
  } else s.set(`fx.levels.${e}`, v);
  deck.applyFx();
  return v;
}

/**
 * Chromatic aberration: the slider's value → how strong the split is drawn (core/renderer.ts).
 * An ease-in curve, so the start is gentle: 10 % is a faint fringe, 50 % what 10 % used to
 * be, 100 % what 40 % used to be (0.5.0), 200 % (party) still a badly misconverged tube.
 */
/**
 * Bloom: a blurred copy of the screen laid over it, so bright things bleed a soft halo onto
 * what's around them. The slider sets how far the halo spreads (CSS px of blur) as well as
 * how strong it is: 0.5.2 only changed its opacity over a fixed 3 px blur, which hardly
 * showed — 50 % ≈ 3 px, 100 % 5 px, 200 % 8.5 px.
 */
export function bloomRadius(level: number): number {
  const k = Math.max(0, Math.min(200, level)) / 100;
  return 1.5 + 3.5 * k;
}

/** CRT flicker speed (fx.flickerSpeed, %): 100 = the tube's flicker every 4 s and its rolling band every 9 s; 200 = twice as fast. */
export function flickerSpeed(pct: number | undefined): number {
  return Math.max(10, Math.min(300, pct ?? 100)) / 100;
}

export function chromaStrength(level: number): number {
  const k = Math.max(0, Math.min(200, level)) / 100;
  return 40 * k * k;
}
