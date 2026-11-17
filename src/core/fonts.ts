/**
 * Bundled typefaces (all SIL Open Font License, from @fontsource). Themes pick
 * one with `[font] family = "…"`; anything else falls back to the system font
 * of that name, then to JetBrains Mono.
 */
import "@fontsource/jetbrains-mono/200.css";
import "@fontsource/jetbrains-mono/300.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
import "@fontsource/jetbrains-mono/600.css";
import "@fontsource/jetbrains-mono/700.css";
import "@fontsource/jetbrains-mono/200-italic.css";
import "@fontsource/jetbrains-mono/300-italic.css";
import "@fontsource/jetbrains-mono/400-italic.css";
import "@fontsource/ibm-plex-mono/200.css";
import "@fontsource/ibm-plex-mono/300.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "@fontsource/ibm-plex-mono/600.css";
import "@fontsource/ibm-plex-mono/700.css";
import "@fontsource/fira-code/300.css";
import "@fontsource/fira-code/400.css";
import "@fontsource/fira-code/500.css";
import "@fontsource/fira-code/600.css";
import "@fontsource/space-mono/400.css";
import "@fontsource/space-mono/700.css";
import "@fontsource/vt323/400.css";
import "@fontsource/share-tech-mono/400.css";

export const FONTS = ["JetBrains Mono", "IBM Plex Mono", "Fira Code", "Space Mono", "VT323", "Share Tech Mono"];

/** User weight setting → [normal, bold]. */
export const WEIGHTS = { thin: [200, 500], light: [300, 600], regular: [400, 700] } as const;
export type WeightName = keyof typeof WEIGHTS;

export function fontStack(family: string): string {
  return `"${family}", "JetBrains Mono", "SF Mono", Menlo, Consolas, "DejaVu Sans Mono", monospace`;
}

/** Make sure the faces we're about to measure are loaded (canvas won't wait for them). */
export async function loadFont(family: string, weights: readonly number[]): Promise<void> {
  const stack = fontStack(family);
  await Promise.all(weights.flatMap((w) => [document.fonts.load(`${w} 16px ${stack}`), document.fonts.load(`italic ${w} 16px ${stack}`)])).catch(() => {});
}
