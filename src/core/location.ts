import type { Deck } from "../deck";

/**
 * Turning what the user told us (a country, a city, coordinates) into
 * coordinates for the weather, and a country code for local news.
 * Geocoding uses open-meteo.com (free, no key, no account).
 */

export interface Place {
  name: string;
  /** Region / state, when known. */
  admin: string;
  country: string;
  /** ISO 3166-1 alpha-2, e.g. "FR". */
  countryCode: string;
  lat: number;
  lon: number;
}

export async function geocode(query: string, lang = "en"): Promise<Place[]> {
  const url = `https://geocoding-api.open-meteo.com/v1/search?count=5&language=${encodeURIComponent(lang)}&name=${encodeURIComponent(query.trim())}`;
  const data = await (await fetch(url)).json();
  return ((data.results ?? []) as Record<string, any>[]).map((r) => ({
    name: r.name,
    admin: r.admin1 ?? "",
    country: r.country ?? "",
    countryCode: r.country_code ?? "",
    lat: r.latitude,
    lon: r.longitude,
  }));
}

let cached: { key: string; place: Place | null } | null = null;

/** Where to get weather for, from the user's location setting (falls back to home.weatherCity). */
export async function resolvePlace(deck: Deck): Promise<Place | null> {
  const loc = deck.settings.data.user.location;
  if (loc.precision !== "none" && loc.lat != null && loc.lon != null) {
    return { name: loc.name || `${loc.lat.toFixed(2)}, ${loc.lon.toFixed(2)}`, admin: "", country: loc.country, countryCode: loc.country, lat: loc.lat, lon: loc.lon };
  }
  const query = loc.precision !== "none" && loc.name ? loc.name : deck.settings.data.home.weatherCity;
  if (!query) return null;
  if (cached?.key === query) return cached.place;
  const place = (await geocode(query, langOf(deck)))[0] ?? null;
  cached = { key: query, place };
  return place;
}

/** "fr" from "fr-FR" (or the system language). */
export function langOf(deck: Deck): string {
  return (deck.settings.data.user.locale || navigator.language || "en").split("-")[0].toLowerCase();
}

/** Country code for news: the location's, else the locale's region. */
export function countryOf(deck: Deck): string {
  const loc = deck.settings.data.user.location;
  if (loc.country) return loc.country.toUpperCase();
  const region = (deck.settings.data.user.locale || navigator.language || "en-US").split("-")[1];
  return (region ?? "US").toUpperCase();
}
