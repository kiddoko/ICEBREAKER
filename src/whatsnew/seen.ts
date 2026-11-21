/**
 * WHEN WHAT'S NEW OPENS BY ITSELF: once, the first time the desktop appears
 * after the app changed version. Remembered per device (device.json `whatsNew`,
 * core/device.ts), not per account: one screen per update, whoever logs in.
 *
 *   - a fresh install (the setup isn't done yet): no screen, the version is noted;
 *   - an update (the version noted is older, or none was noted yet — every
 *     version before 0.5.4 — while the setup is done): the screen, once;
 *   - the same version, or an older one (going back): nothing.
 * A version with no notes (src/whatsnew/notes.ts) shows nothing, but is noted.
 */

/** -1, 0 or 1, comparing "0.5.10" and "0.5.9" as numbers; "-beta" parts are ignored. */
export function compareVersions(a: string, b: string): number {
  const parts = (v: string) => v.split("-")[0].split(".").map((n) => Number.parseInt(n, 10) || 0);
  const x = parts(a), y = parts(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d) return Math.sign(d);
  }
  return 0;
}

/** A minor version (0.6.0, 1.0.0): the big "release" layout. */
export function isRelease(version: string): boolean {
  const [, , patch] = version.split("-")[0].split(".");
  return (Number.parseInt(patch ?? "0", 10) || 0) === 0;
}

export interface StartDecision {
  /** open WHAT'S NEW now */
  show: boolean;
  /** write the current version as seen */
  remember: boolean;
}

export function whatsNewAtStart(seen: string | undefined, current: string, setupDone: boolean, hasNotes: boolean): StartDecision {
  if (seen === current) return { show: false, remember: false };
  const newer = seen === undefined || compareVersions(seen, current) < 0;
  return { show: newer && setupDone && hasNotes, remember: true };
}
