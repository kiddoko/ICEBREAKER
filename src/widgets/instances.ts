import type { Deck } from "../deck";
import type { WidgetPlacement } from "./types";

/**
 * THE SAME WIDGET, SEVERAL TIMES. Every placed widget is a copy with a key:
 * the first one is just the widget's id ("clock"), the next ones "clock#2",
 * "clock#3"… — unique across HOME and the side panel together. Each copy keeps
 * its own settings (settings.home.widgetConfig[key]); what a copy hasn't set
 * comes from the shared setting it had before (home.clockStyle…).
 *
 * A widget's commands (`clock style next`, `worldclock add Tokyo`…) change the
 * copy whose pop-up is open, or the selected one — else the shared setting.
 */

/** "clock#2" → "clock" */
export const widgetIdOf = (key: string): string => key.split("#")[0];

/** a placement's key */
export const keyOf = (p: WidgetPlacement): string => p.key ?? p.id;

/** Every copy in use: HOME's, then the side panel's. */
export function allWidgetKeys(deck: Deck): string[] {
  return [...deck.settings.data.home.widgets.map(keyOf), ...(deck.settings.data.panel?.widgets ?? [])];
}

/** A key for one more copy of this widget (the id itself if it's the first). */
export function newWidgetKey(deck: Deck, id: string): string {
  const taken = new Set(allWidgetKeys(deck));
  if (!taken.has(id)) return id;
  for (let n = 2; ; n++) if (!taken.has(`${id}#${n}`)) return `${id}#${n}`;
}

/** The copy being worked on (its pop-up is open, or it's selected), if any. */
let current: string | null = null;
export function focusWidget(key: string | null): void {
  current = key;
}
/** The copy of this widget a command should change (null: the shared setting). */
export function widgetTarget(id: string): string | null {
  return current && widgetIdOf(current) === id ? current : null;
}

/** One setting of one copy, or `fallback` (usually the shared setting). */
export function widgetConfig<T>(deck: Deck, key: string | undefined, name: string, fallback: T): T {
  const v = key ? deck.settings.data.home.widgetConfig?.[key]?.[name] : undefined;
  return v === undefined ? fallback : (v as T);
}

/**
 * Change a widget's setting: the copy being worked on if there is one, else the
 * shared setting (`globalPath`, e.g. "home.clockStyle").
 */
export function setWidgetSetting(deck: Deck, id: string, name: string, value: unknown, globalPath?: string): void {
  const key = widgetTarget(id);
  if (key) {
    const all = { ...(deck.settings.data.home.widgetConfig ?? {}) };
    all[key] = { ...(all[key] ?? {}), [name]: value };
    deck.settings.set("home.widgetConfig", all);
  } else if (globalPath) deck.settings.set(globalPath, value);
  deck.requestFrame();
}

/** A copy is gone: its settings go too. */
export function forgetWidget(deck: Deck, key: string): void {
  const all = { ...(deck.settings.data.home.widgetConfig ?? {}) };
  if (!(key in all)) return;
  delete all[key];
  deck.settings.set("home.widgetConfig", all);
}
