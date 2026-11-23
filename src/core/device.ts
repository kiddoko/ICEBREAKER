import type { Platform } from "../platform/types";

/**
 * What the deck itself remembers, outside every account (device.json in the
 * app's config folder): what the login screen shows before anyone is logged
 * in. Nothing private: no settings, no vault, no password.
 *
 *   remember   fill in the last account's name (off by default)
 *   last       that name (kept only while `remember` is on)
 *   look       per account name: its theme and its icon, so the login screen
 *              takes your look as soon as you've typed your name
 *   whatsNew   the last version WHAT'S NEW was shown for (src/whatsnew/seen.ts)
 *   starting   the account (its id) whose start isn't over yet: still there at the next
 *              start, that one never got to its desktop (a crash) — see beginStart
 */
export interface DeviceInfo {
  remember: boolean;
  last: string;
  look: Record<string, { theme?: string; avatar?: { id?: string; color?: string } }>;
  whatsNew?: string;
  starting?: string;
}

const EMPTY: DeviceInfo = { remember: false, last: "", look: {} };

/** an account name as the device keys it */
export const lookKey = (user: string) => user.trim().toLowerCase();

export async function readDevice(platform: Platform): Promise<DeviceInfo> {
  try {
    const raw = await platform.config.read("device.json");
    const d = raw ? (JSON.parse(raw) as Partial<DeviceInfo>) : {};
    return { ...EMPTY, ...d, look: { ...(d.look ?? {}) } };
  } catch {
    return { ...EMPTY, look: {} };
  }
}

export async function writeDevice(platform: Platform, patch: (d: DeviceInfo) => void): Promise<void> {
  const d = await readDevice(platform);
  patch(d);
  if (!d.remember) d.last = "";
  await platform.config.write("device.json", JSON.stringify(d, null, 2)).catch(() => {});
}

/**
 * An account starts: true when its last start never got to the desktop (the app crashed
 * on the way — a GPU effect WebKitGTK couldn't take, say): this start is then a safe one,
 * effects off. The mark stays until endStart (the desktop has been up a while, or a clean
 * quit / log out).
 */
export async function beginStart(platform: Platform, id: string): Promise<boolean> {
  let unfinished = false;
  await writeDevice(platform, (d) => {
    unfinished = d.starting === id;
    d.starting = id;
  });
  return unfinished;
}

/** This start went fine (or the app quits cleanly): no safe start next time. */
export async function endStart(platform: Platform): Promise<void> {
  if ((await readDevice(platform)).starting === undefined) return;
  await writeDevice(platform, (d) => void delete d.starting);
}
