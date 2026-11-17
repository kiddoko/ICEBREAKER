/**
 * ICEBREAKER entry point.
 *
 *   main.ts      → loads the font and settings, then starts the Deck
 *   deck.ts      → creates and wires every subsystem (start reading there)
 *   core/        → grid, renderer, input, themes, settings
 *   ui/          → drawing toolkit + widgets (editor, list, chat)
 *   workspace/   → layout, tabs, overlays, boot sequence
 *   apps/        → what opens in tabs (notes, journal, link, sysmon…)
 *   shell/       → the shell and its commands
 *   ai/          → Claude / Ollama providers and vault tools
 *   plugins/     → plugin host and the public plugin API
 *   platform/    → OS access (Tauri) or browser fallback
 */
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/700.css";
import "@fontsource/jetbrains-mono/400-italic.css";
import "@fontsource/jetbrains-mono/300.css";
import "@fontsource/jetbrains-mono/600.css";
import "@fontsource/jetbrains-mono/300-italic.css";
import "./style.css";
import { SettingsStore } from "./core/settings";
import { FONT_STACK } from "./core/renderer";
import { Deck } from "./deck";
import { detectPlatform } from "./platform";

async function main(): Promise<void> {
  const platform = detectPlatform();
  const settings = await SettingsStore.load(platform);

  // The grid is measured from the font, so it must be loaded before the first frame.
  await Promise.all([
    document.fonts.load(`400 16px ${FONT_STACK}`),
    document.fonts.load(`700 16px ${FONT_STACK}`),
    document.fonts.load(`italic 400 16px ${FONT_STACK}`),
    document.fonts.load(`300 16px ${FONT_STACK}`),
    document.fonts.load(`600 16px ${FONT_STACK}`),
    document.fonts.load(`italic 300 16px ${FONT_STACK}`),
  ]).catch(() => {});

  const deck = new Deck(platform, settings);
  (window as unknown as { deck: Deck }).deck = deck; // handy in devtools: `deck.notify("hi")`
  await deck.start();
}

main().catch((err) => {
  console.error(err);
  document.body.innerHTML = `<pre style="color:#f38ba8;background:#0b0b12;padding:2em;font:14px monospace;white-space:pre-wrap">ICEBREAKER failed to boot:\n\n${String(err?.stack ?? err)}</pre>`;
});
