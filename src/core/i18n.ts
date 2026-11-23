/**
 * Translations. The key is the English text itself, so code stays readable and
 * a missing translation simply shows the English. `{name}` parts are filled
 * from `vars`. Languages: en (the source) and fr (src/core/i18n-fr.ts).
 *
 *   t("Let's go")                       → "C'est parti" in French
 *   t("{n} tracks", { n: 12 })          → "12 morceaux"
 *
 * Key hints written the Mac way ("⌘K") come out as the OS reads them ("Ctrl+K"
 * on Windows / Linux): core/keyhints.ts.
 *
 * The UI calls t() while drawing, so switching language is instant. Plugins
 * get it as ib.lib.t (and can add their own strings with addTranslations).
 */
import { FR } from "./i18n-fr";
import { osKeys } from "./keyhints";

export type Lang = "en" | "fr";
export const LANGS: { id: Lang; name: string }[] = [
  { id: "en", name: "English" },
  { id: "fr", name: "Français" },
];

let current: Lang = "en";
const tables: Record<Lang, Record<string, string>> = { en: {}, fr: { ...FR } };

export function setLang(l: string): void {
  current = l === "fr" ? "fr" : "en";
}

export function lang(): Lang {
  return current;
}

/**
 * THE INTERFACE IS LOWERCASE (docs/GUIDELINES.md "Case"): what t() gives is lowered here, once
 * (cached), before `{vars}` are filled in — so a note's name, a city, what you typed keep their
 * case. Kept: ICEBREAKER (the logo), acronyms (AI, API, CPU…), proper names (Claude, Google…),
 * and key hints (⌘K, F1, Ctrl+K: osKeys runs after). Module names go lowercase like the rest.
 */
const KEEP_CAPS = new Set(["ICEBREAKER", "AI", "API", "CPU", "GPU", "RAM", "JSON", "NAS", "OK", "URL", "USB", "MM", "YYYY", "DD", "HH", "RGB", "CRT", "PDF", "HTTP", "HTTPS", "ID", "UI", "CLI", "GUI", "BPM", "MIDI", "OS", "UTC", "GMT", "AM", "PM", "IP", "LAN", "VPN", "SSH", "MCP", "LLM", "MED", "TTS", "STT", "WAV", "MP", "OGG", "FLAC", "SVG", "PNG", "CSV", "PIN", "QR", "IA", "ZIP", "UK", "US", "ISO", "ICS"]);
const PROPER = new Set(["Ableton", "Claude", "Code", "Google", "Calendar", "Markdown", "Meteo", "Obsidian", "Anthropic", "Ollama", "Finder", "Explorer", "Windows", "Linux", "Mac", "Spotify", "Apple", "Music", "GitHub", "Tauri", "Chrome", "Safari", "Firefox", "Opus", "Sonnet", "Haiku", "Fable", "Paris", "Unicode", "Gemini", "English", "Français"]);
const lowered: Record<Lang, Map<string, string>> = { en: new Map(), fr: new Map() };
export function uiCase(s: string): string {
  return s.replace(/[A-Za-zÀ-ÖØ-öø-ÿ][A-Za-zÀ-ÖØ-öø-ÿ'’]*/g, (w, at: number) => {
    // inside a {var} or right after a digit / key glyph (F1, ⌘K): not a word to lower
    if (s[at - 1] === "{" || /[0-9⌘⌥⇧⌃]/.test(s[at - 1] ?? "")) return w;
    if (/^[A-ZÀ-ÖØ-Þ]{2,}$/.test(w)) return KEEP_CAPS.has(w) ? w : w.toLowerCase();
    if (/^[A-ZÀ-ÖØ-Þ][a-zß-öø-ÿ'’]+$/.test(w)) return PROPER.has(w) ? w : w.toLowerCase();
    return w;
  });
}

export function t(text: string, vars?: Record<string, string | number>): string {
  const raw = tables[current][text] ?? text;
  const cache = lowered[current];
  let s = cache.get(raw);
  if (s === undefined) cache.set(raw, (s = uiCase(raw)));
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
  return osKeys(s);
}

/** Modules add their own strings: addTranslations("fr", { "Add": "Ajouter" }). */
export function addTranslations(l: Lang, strings: Record<string, string>): void {
  Object.assign(tables[l], strings);
  lowered[l].clear();
}
