/**
 * SETTINGS AS BLOCKS. Every setting the deck shows — its own and the modules' —
 * is a row described here, kept in one registry (deck.prefs) by whoever
 * provided it ("core", a module id). Settings draws them, the catalog lists
 * them, anything can read or change them.
 */
import { DEFAULT_SETTINGS } from "./settings";
import type { Deck } from "../deck";

/**
 * What a row is, so it's drawn and driven the same way everywhere:
 *   toggle  a box you tick                     [■]
 *   choice  values you step through          ‹ English ›   (the arrows show on the chosen row)
 *   text    something you type                 netrunner ✎
 *   action  opens / does something              edit ›
 *   slider  a number on a bar             ━━━━━╸──── 80%
 *   info    just a value
 *   keys    a shortcut (KEYS)                ⌘⇧H  ≡ h
 *   head    a heading inside a category
 */
export type RowKind = "toggle" | "choice" | "text" | "action" | "slider" | "info" | "keys" | "head";

export interface SettingRow {
  kind?: RowKind;
  section?: string;
  /** the settings key (search, and the command shown under the list) */
  key?: string;
  label: string;
  value: () => string;
  /** dir: +1 = next / confirm, -1 = previous */
  change?: (dir: 1 | -1) => void | Promise<void>;
  /** a text value (opens an input box, no ‹ ›) */
  isText?: boolean;
  /** a choice you step through both ways (‹ value ›); rows with a settings key and change() are by default */
  steps?: boolean;
  /** The shell command for one click (next value). */
  cmd?: () => string;
  /** greyed and locked (e.g. the fps cap while vsync is on) */
  disabled?: () => boolean;
  /** a real slider instead of a value (drag / hold / wheel / ←→: one at a time, faster when held) */
  slider?: { min: number; max: number; get: () => number; set: (v: number) => void; zeroIsOff?: boolean; show?: (v: number) => string; step?: number };
  /** not shown right now (e.g. "your own word" while gender isn't "other") */
  hidden?: () => boolean;
  /** a small heading inside a category (KEYS: everywhere, notes…); not selectable */
  head?: boolean;
  /** rows without a settings key: their own "is it the default?" and "back to default" */
  isDefault?: () => boolean;
  reset?: () => void;
  /** a shortcut (KEYS): its keys and its key on THE MENU, each one click away */
  keys?: {
    combo: () => string;
    menuKey?: () => string;
    editCombo?: () => void;
    editMenuKey?: () => void;
    /** one of yours: × removes it */
    remove?: () => void;
  };
}

/** A row's kind (the helpers set it; older rows are read from what they have). */
export function kindOf(row: SettingRow): RowKind {
  if (row.kind) return row.kind;
  if (row.head) return "head";
  if (row.keys) return "keys";
  if (row.slider) return "slider";
  if (row.isText) return "text";
  if (!row.change) return "info";
  const v = row.value();
  if (v === "on" || v === "off") return "toggle";
  return row.steps ? "choice" : "action";
}

/**
 * Who provides which rows. A provider is a function, so its rows can follow
 * the state (your own shortcuts, the modules that are on).
 */
export class SettingsRegistry {
  private providers = new Map<string, () => SettingRow[]>();

  register(source: string, provider: () => SettingRow[]): void {
    this.providers.set(source, provider);
  }

  unregisterSource(source: string): void {
    this.providers.delete(source);
  }

  /** every row, core first (with each row's provider) */
  rows(): (SettingRow & { from: string })[] {
    const out: (SettingRow & { from: string })[] = [];
    for (const [from, p] of this.providers) for (const r of p()) out.push({ ...r, from });
    return out;
  }

  /** the categories, in order, with their rows: GENERAL, then MODULES, then the danger zone */
  sections(): { name: string; rows: (SettingRow & { from: string })[]; group: "GENERAL" | "MODULES" | "DANGER" }[] {
    const out: ReturnType<SettingsRegistry["sections"]> = [];
    for (const r of this.rows()) {
      if (!r.label && r.section) out.push({ name: r.section, rows: [], group: r.section === "DANGER ZONE" ? "DANGER" : r.section === "OVERVIEW" || r.section.startsWith("◇") ? "MODULES" : "GENERAL" });
      else if (out.length) {
        const rows = out[out.length - 1].rows;
        // a heading inside a category gets an empty line above it (not the first one): groups breathe
        if (r.head && rows.length && !rows[rows.length - 1].head) rows.push({ label: "", head: true, kind: "head", value: () => "", from: r.from } as SettingRow & { from: string });
        rows.push(r);
      }
    }
    return [...out.filter((x) => x.group === "GENERAL"), ...out.filter((x) => x.group === "MODULES"), ...out.filter((x) => x.group === "DANGER")];
  }
}

// ── defaults ───────────────────────────────────────────────────────────────

/** A setting's default value (module settings: what the module registered). */
export function defaultOf(deck: Deck, key: string): unknown {
  if (key.startsWith("plugin.")) {
    const [, id, k] = key.split(".");
    return deck.moduleSettings.get(id)?.find((m) => m.key === k)?.default;
  }
  return key.split(".").reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], DEFAULT_SETTINGS);
}

/** Is a setting at its default? (no key: always) */
export function isDefault(deck: Deck, key: string | undefined): boolean {
  if (!key) return true;
  if (key.startsWith("plugin.")) {
    const [, id, k] = key.split(".");
    return JSON.stringify(deck.moduleSettingValue(id, k) ?? null) === JSON.stringify(defaultOf(deck, key) ?? null);
  }
  const def = defaultOf(deck, key);
  return def === undefined || JSON.stringify(deck.settings.get(key) ?? null) === JSON.stringify(def);
}

/** Put one setting back to its default. */
export function resetKey(deck: Deck, key: string): void {
  if (key.startsWith("plugin.")) {
    const [, id, k] = key.split(".");
    return deck.setModuleSetting(id, k, defaultOf(deck, key));
  }
  const def = defaultOf(deck, key);
  if (def === undefined) return;
  deck.settings.set(key, structuredClone(def));
  deck.applySettings(key);
}

/** A row: at its default? can it go back to one? back to it. */
export const rowIsDefault = (deck: Deck, row: SettingRow): boolean => (row.isDefault ? row.isDefault() : isDefault(deck, row.key));
export const rowResettable = (deck: Deck, row: SettingRow): boolean => !!row.reset || (!!row.key && defaultOf(deck, row.key) !== undefined);
export function resetRow(deck: Deck, row: SettingRow): void {
  if (row.reset) row.reset();
  else if (row.key) resetKey(deck, row.key);
}
