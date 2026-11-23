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
  // the page's language (WCAG 3.1.1): a screen reader or a translator reads it in the right one
  if (typeof document !== "undefined") document.documentElement.lang = current;
}

export function lang(): Lang {
  return current;
}

/**
 * How dates are written (Settings → you → date format, user.locale): "fr-FR", "en-GB"… Empty =
 * the system's — unless the system speaks another language than the deck, then the deck's
 * language (a French deck on an English Mac wrote its months in English, mixed with French).
 * Every date the deck writes goes through it; modules get ib.lib.dateLocale().
 */
let dateLoc = "";
export function setDateLocale(l: string): void {
  dateLoc = l;
}
export function dateLocale(): string {
  if (dateLoc) return dateLoc;
  const nav = typeof navigator !== "undefined" ? navigator.language || "" : "";
  if (nav && nav.split("-")[0].toLowerCase() === current) return nav;
  return current === "fr" ? "fr-FR" : nav.startsWith("en") ? nav : "en-GB";
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
    // a word in capitals — with its apostrophe too ("D'ENSEMBLE" stayed capital)
    if (/^[A-ZÀ-ÖØ-Þ][A-ZÀ-ÖØ-Þ'’]+$/.test(w)) return KEEP_CAPS.has(w) ? w : w.toLowerCase();
    // a one-letter word among capitals ("MISES À JOUR" → "mises À jour" before); a lone "I" stays
    if (/^[A-ZÀ-ÖØ-Þ]$/.test(w)) {
      const caps = (x?: string) => !!x && /^[A-ZÀ-ÖØ-Þ'’]{2,}$/.test(x) && !KEEP_CAPS.has(x);
      const before = /([A-Za-zÀ-ÖØ-öø-ÿ'’]+)\s*$/.exec(s.slice(0, at))?.[1];
      const after = /^\s*([A-Za-zÀ-ÖØ-öø-ÿ'’]+)/.exec(s.slice(at + 1))?.[1];
      return caps(before) || caps(after) ? w.toLowerCase() : w;
    }
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

/**
 * A text written without t() (a tip, a page's status line), translated when there's a translation
 * for it — the whole text, else each line, else each " · " part — and left exactly as it is
 * otherwise (no lowering: it may hold a path, a note's name, a command).
 */
export function tLoose(text: string): string {
  if (current === "en" || !text) return text;
  const table = tables[current];
  const one = (s: string) => (table[s] !== undefined ? uiCase(table[s]) : undefined);
  const whole = one(text);
  if (whole !== undefined) return whole;
  return text
    .split("\n")
    .map((line) => one(line) ?? line.split(" · ").map((part) => one(part) ?? part).join(" · "))
    .join("\n");
}

/** Modules add their own strings: addTranslations("fr", { "Add": "Ajouter" }). */
export function addTranslations(l: Lang, strings: Record<string, string>): void {
  Object.assign(tables[l], strings);
  lowered[l].clear();
}
