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

export function t(text: string, vars?: Record<string, string | number>): string {
  let s = tables[current][text] ?? text;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
  return osKeys(s);
}

/** Modules add their own strings: addTranslations("fr", { "Add": "Ajouter" }). */
export function addTranslations(l: Lang, strings: Record<string, string>): void {
  Object.assign(tables[l], strings);
}
