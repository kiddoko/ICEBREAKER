import type { Deck } from "../deck";

/**
 * One number per effect: 0 = off, up to 200 % (sharpness: 0–100, 100 = razor).
 * For bloom / scanlines / vignette the on/off switch and the strength are one
 * setting now: setting a strength turns it on, 0 turns it off.
 */
export const FX_LEVELS = ["bloom", "scanlines", "vignette", "chroma", "sharpness", "glow"] as const;
export type FxLevel = (typeof FX_LEVELS)[number];
const SWITCHED = ["bloom", "scanlines", "vignette"] as const;

export const fxMax = (e: FxLevel): number => (e === "sharpness" ? 100 : 200);

export function getFx(deck: Deck, e: FxLevel): number {
  const fx = deck.settings.data.fx;
  const lv = fx.levels[e] ?? (e === "sharpness" ? 100 : e === "chroma" || e === "glow" ? 0 : 100);
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
export function chromaStrength(level: number): number {
  const k = Math.max(0, Math.min(200, level)) / 100;
  return 40 * k * k;
}
