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
 */
export interface DeviceInfo {
  remember: boolean;
  last: string;
  look: Record<string, { theme?: string; avatar?: { id?: string; color?: string } }>;
  whatsNew?: string;
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
