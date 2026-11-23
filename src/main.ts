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
import "./style.css";
import { SettingsStore } from "./core/settings";
import { loadFont } from "./core/fonts";
import { Deck } from "./deck";
import { detectPlatform } from "./platform";
import { guardConsole, redact } from "./core/redact";

// passwords, keys and recovery words never reach the console (core/redact.ts)
guardConsole();

async function main(): Promise<void> {
  const platform = detectPlatform();
  const settings = await SettingsStore.load(platform);

  // The grid is measured from the font, so it must be loaded before the first frame.
  await loadFont("JetBrains Mono", [200, 300, 400, 500, 600, 700]);

  const deck = new Deck(platform, settings);
  (window as unknown as { deck: Deck }).deck = deck; // handy in devtools: `deck.notify("hi")`
  await deck.start();
}

main().catch((err) => {
  console.error(err);
  // as text, never as HTML (the error may quote a file's content)
  const pre = document.createElement("pre");
  pre.style.cssText = "color:#f38ba8;background:#0b0b12;padding:2em;font:14px monospace;white-space:pre-wrap";
  pre.textContent = `ICEBREAKER failed to boot:\n\n${redact(String(err?.stack ?? err))}`;
  document.body.replaceChildren(pre);
});
