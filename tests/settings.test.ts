import { describe, expect, it } from "vitest";
import { SettingsStore } from "../src/core/settings";
import type { Platform } from "../src/platform/types";

const platformWith = (settings: object) =>
  ({ config: { read: async (n: string) => (n === "settings.json" ? JSON.stringify(settings) : null), write: async () => {} } }) as unknown as Platform;

describe("settings", () => {
  it("fills every default", async () => {
    const s = await SettingsStore.load(platformWith({}));
    expect(s.data.sound.muted).toBe(false);
    expect(s.data.menu.doubleShift).toBe(true);
  });
  it("refuses an unknown key", async () => {
    const s = await SettingsStore.load(platformWith({}));
    expect(() => s.set("nope.nothing", 1)).toThrow();
  });
  it("keeps free-form records (your keys) whole", async () => {
    const s = await SettingsStore.load(platformWith({ keys: { "ctrl+shift+1": "open a.md" } }));
    expect(s.data.keys["ctrl+shift+1"]).toBe("open a.md");
  });
  it("turns the old notification choice into boxes", async () => {
    const s = await SettingsStore.load(platformWith({ notifications: { mode: "sound" } }));
    expect(s.data.notifications).toMatchObject({ sound: true, voice: true, screen: false, system: false });
  });
  it("moves the old space-menu keys to THE MENU", async () => {
    const s = await SettingsStore.load(platformWith({ leader: { keys: { home: "j" } }, keys: { "space g": "open a.md" } }));
    expect(s.data.menu.keys).toEqual({ home: "j" });
    expect(s.data.keys).toEqual({ "menu g": "open a.md" });
  });
});
