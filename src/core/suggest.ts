import type { Deck } from "../deck";

/**
 * The lists the prompts offer (the ▾ under the field, and Tab to complete):
 * one place, so every field that asks for a city, a folder or a command offers
 * the same choices. Anything else can always be typed.
 */

/** every time zone this system knows (Europe/Zurich…) */
export function timeZones(): string[] {
  try {
    return (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.("timeZone") ?? [];
  } catch {
    return [];
  }
}

/** the places you already used, then a few well-known cities */
export function places(deck: Deck): string[] {
  const yours = ((deck.settings.data.home.weatherPlaces ?? []) as { name: string }[]).map((p) => p.name);
  return [...new Set([...yours, "Lausanne", "Genève", "Zürich", "Paris", "London", "New York", "Tokyo", "Oslo", "Berlin", "Montréal", "Reykjavik", "Seoul"])];
}

/** the vault's folders (hidden ones left out) */
export function folders(deck: Deck): string[] {
  return deck.vault.entries.filter((e) => e.isDir && !e.path.startsWith(".")).map((e) => e.path);
}

/** every shell command's name */
export function commandNames(deck: Deck): string[] {
  return deck.commands.all().map((c) => c.name).sort();
}

/** the news categories the NEWS module knows, plus a few common interests */
export const NEWS_TOPICS = ["tech", "science", "ai", "space", "world", "economy", "nature", "health", "culture", "sports", "games", "F1"];

/** durations, the way timers read them */
export const DURATIONS = ["1m", "5m", "10m", "15m", "25m", "45m", "1h", "1h30"];
