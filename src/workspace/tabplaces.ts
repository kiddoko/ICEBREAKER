/**
 * WHERE EACH TAB LIVES (Refonte UI step 3b, docs/FRAMES.md) — pure, no deck.
 *
 * A tab lives in the page's frame unless it was moved to another one: the tree's
 * (VAULT), the side panel's or the shell's. There it sits after the frame's own tab
 * (VAULT, PANEL, the terminals), and when it's the one shown, the frame shows it
 * instead of its own content.
 *
 *   places = { "home": "panel", "note:ideas.md": "shell" }   (the rest: the page's frame)
 *   shows  = { panel: "home" }                                (shell: its terminals)
 *
 * Both are saved with the session (settings.session.places / .shows).
 */
import type { Pane } from "./workspace";

/** the frames a tab can move to, besides the page's own ("main") */
export type PlaceFrame = "vault" | "panel" | "shell";
export type Places = Record<string, PlaceFrame>;
/** the tab each frame shows (absent: its own content) */
export type Shows = Partial<Record<PlaceFrame, string>>;

export const PLACE_FRAMES: readonly PlaceFrame[] = ["vault", "panel", "shell"];

/** a frame's pane (what `focus` calls it) */
export const PANE_OF: Record<PlaceFrame | "main", Pane> = { vault: "sidebar", panel: "panel", shell: "shell", main: "main" };

/** the frame a pane is, or "main" */
export function frameOfPane(p: Pane): PlaceFrame | "main" {
  return p === "sidebar" ? "vault" : p === "panel" ? "panel" : p === "shell" ? "shell" : "main";
}

/** A frame named in a command: tree / vault, panel, shell, main / page. */
export function frameArg(s: string | undefined): PlaceFrame | "main" | null {
  const a = (s ?? "").toLowerCase();
  if (a === "tree" || a === "vault") return "vault";
  if (a === "panel" || a === "shell") return a;
  if (a === "main" || a === "page") return "main";
  return null;
}

/** Saved places, checked: only known frames, only tabs that are open. */
export function parsePlaces(v: unknown, keys: readonly string[]): Places {
  const out: Places = {};
  if (!v || typeof v !== "object" || Array.isArray(v)) return out;
  for (const [k, f] of Object.entries(v as Record<string, unknown>)) {
    if (keys.includes(k) && typeof f === "string" && (PLACE_FRAMES as readonly string[]).includes(f)) out[k] = f as PlaceFrame;
  }
  return out;
}

/** Saved "shown" tabs, checked: each must live in that frame. */
export function parseShows(v: unknown, places: Places): Shows {
  const out: Shows = {};
  if (!v || typeof v !== "object" || Array.isArray(v)) return out;
  for (const f of PLACE_FRAMES) {
    const k = (v as Record<string, unknown>)[f];
    if (typeof k === "string" && places[k] === f) out[f] = k;
  }
  return out;
}

/** The places without the tabs that are gone (and the shown ones that left their frame). */
export function prunePlaces(places: Places, shows: Shows, keys: readonly string[]): { places: Places; shows: Shows } {
  const p = parsePlaces(places, keys);
  return { places: p, shows: parseShows(shows, p) };
}
