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
  return s.replace(/[A-Za-zÀ-ÖØ-öø-ÿŒœ][A-Za-zÀ-ÖØ-öø-ÿŒœ'’]*/g, (w, at: number) => {
    // inside a {var} or right after a digit / key glyph (F1, ⌘K): not a word to lower
    if (s[at - 1] === "{" || /[0-9⌘⌥⇧⌃]/.test(s[at - 1] ?? "")) return w;
    // a word in capitals — with its apostrophe too ("D'ENSEMBLE" stayed capital)
    if (/^[A-ZÀ-ÖØ-ÞŒ][A-ZÀ-ÖØ-ÞŒ'’]+$/.test(w)) return KEEP_CAPS.has(w) ? w : w.toLowerCase();
    // a one-letter word among capitals ("MISES À JOUR" → "mises À jour" before); a lone "I" stays
    if (/^[A-ZÀ-ÖØ-ÞŒ]$/.test(w)) {
      const caps = (x?: string) => !!x && /^[A-ZÀ-ÖØ-ÞŒ'’]{2,}$/.test(x) && !KEEP_CAPS.has(x);
      const before = /([A-Za-zÀ-ÖØ-öø-ÿŒœ'’]+)\s*$/.exec(s.slice(0, at))?.[1];
      const after = /^\s*([A-Za-zÀ-ÖØ-öø-ÿŒœ'’]+)/.exec(s.slice(at + 1))?.[1];
      return caps(before) || caps(after) ? w.toLowerCase() : w;
    }
    if (/^[A-ZÀ-ÖØ-ÞŒ][a-zß-öø-ÿœ'’]+$/.test(w)) return PROPER.has(w) ? w : w.toLowerCase();
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
  delete patterns[l];
}

// ── command output ──────────────────────────────────────────────────────────

/** the table's keys with {parts}, as patterns (made once per language, again after addTranslations) */
const patterns: Partial<Record<Lang, { re: RegExp; names: string[]; to: string }[]>> = {};
function patternsOf(l: Lang): { re: RegExp; names: string[]; to: string }[] {
  const have = patterns[l];
  if (have) return have;
  return (patterns[l] = compile(tables[l]));
}

/**
 * Each sandboxed module's own translations (its addTranslations, sent from its worker:
 * plugins/sandbox): its command output is looked up there first, then in the deck's table.
 */
const moduleTables = new Map<string, { tables: Partial<Record<Lang, Record<string, string>>>; patterns: Partial<Record<Lang, Pattern[]>> }>();
export function addModuleTranslations(source: string, l: string, strings: Record<string, string>): void {
  const lg: Lang = l === "fr" ? "fr" : "en";
  const m = moduleTables.get(source) ?? { tables: {}, patterns: {} };
  m.tables[lg] = { ...(m.tables[lg] ?? {}), ...strings };
  delete m.patterns[lg];
  moduleTables.set(source, m);
}

type Pattern = { re: RegExp; names: string[]; to: string };
function compile(table: Record<string, string>): Pattern[] {
  const out: Pattern[] = [];
  for (const [key, to] of Object.entries(table)) {
    if (!key.includes("{")) continue;
    // at least a few letters of its own: "{n}" alone would match anything
    if (key.replace(/\{\w+\}/g, "").replace(/[^A-Za-z]/g, "").length < 3) continue;
    const names: string[] = [];
    const src = key.split(/(\{\w+\})/).map((part) => {
      const m = /^\{(\w+)\}$/.exec(part);
      if (!m) return part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      names.push(m[1]);
      return "(.+?)";
    });
    out.push({ re: new RegExp(`^${src.join("")}$`), names, to });
  }
  // the longest keys first: the most precise wins
  out.sort((a, b) => b.re.source.length - a.re.source.length);
  return out;
}

const table = () => tables[current];

/** One piece of text (no colour codes in it): its translation, or undefined. */
function outPiece(core: string, source?: string): string | undefined {
  // the module's own words first (its commands): « tracks » is a tracker's « pistes », not « morceaux »
  const mod = source ? moduleTables.get(source) : undefined;
  const mt = mod?.tables[current];
  if (mod && mt) {
    const own = lookup(core, mt, (mod.patterns[current] ??= compile(mt)));
    if (own !== undefined) return own;
  }
  return lookup(core, tables[current], patternsOf(current));
}

function lookup(core: string, table: Record<string, string>, pats: Pattern[]): string | undefined {
  // a single word is left alone: it may be a note's name, a value, a command ("open", "done")
  if (core.includes(" ") && table[core] !== undefined) return uiCase(table[core]);
  for (const p of pats) {
    const m = p.re.exec(core);
    // a value never spans pieces ("from /{x}" took "notes/a.md · 1 h ago" whole)
    if (!m || m.slice(1).some((v) => v.includes(" · "))) continue;
    const vars: Record<string, string> = {};
    p.names.forEach((n, i) => (vars[n] = m[i + 1]));
    let s = uiCase(p.to);
    for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(v);
    return s;
  }
  return undefined;
}

/**
 * A command's output on its way to the screen, in the deck's language (French: the outputs
 * were half English, half French). Only what's shown — never what goes into a pipe or a file,
 * never a note's text (`cat`, `grep`… are never passed here). Each run of text between colour
 * codes is looked up whole (a key of the table, or one with {parts}), else piece by piece at
 * " · "; what isn't known stays as it is. `usage:` lines stay in English (like man pages).
 */
export function tOutput(text: string, source?: string): string {
  if (current === "en" || !text) return text;
  return text
    .split("\n")
    .map((line) => {
      if (/^(\x1b\[[0-9;]*m)*\s*usage:/.test(line)) return line;
      return line
        .split(/(\x1b\[[0-9;]*m)/)
        .map((run) => {
          if (!run || run.startsWith("\x1b")) return run;
          const lead = /^\s*/.exec(run)![0], trail = /\s*$/.exec(run)![0];
          const core = run.slice(lead.length, run.length - trail.length);
          if (!core) return run;
          const whole = outPiece(core, source);
          if (whole !== undefined) return lead + whole + trail;
          if (!core.includes(" · ")) return run;
          // pieces: a single word too ("late", "tomorrow" — a name sits in its own run)
          return lead + core.split(" · ").map((p) => outPiece(p, source) ?? (table()[p] !== undefined && !/\s/.test(p) ? uiCase(table()[p]) : p)).join(" · ") + trail;
        })
        .join("");
    })
    .join("\n");
}
