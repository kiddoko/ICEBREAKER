import { createTauriPlatform } from "./tauri";
import type { Platform } from "./types";
import { createWebPlatform } from "./web";

export type { Platform, SystemStats, VaultEntry } from "./types";

/** Desktop app when running inside Tauri, otherwise the browser fallback. */
export function detectPlatform(): Platform {
  const inTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
  return inTauri ? createTauriPlatform() : createWebPlatform();
}
