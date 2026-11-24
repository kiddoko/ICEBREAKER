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
  it("a speed you chose stays yours (85 isn't changed any more)", async () => {
    const s = await SettingsStore.load(platformWith({ appearance: { textSpeed: 85 } }));
    expect(s.data.appearance.textSpeed).toBe(85);
  });
  it("keeps what a newer ICEBREAKER wrote, and survives what another one changed", async () => {
    const s = await SettingsStore.load(platformWith({ futureThing: { a: 1 }, sound: { muted: "yes please", futureKnob: 3 }, keys: { "ctrl+1": "x" } }));
    // a value of another kind: the default stays (no crash)
    expect(s.data.sound.muted).toBe(false);
    // what's unknown here is written back as it was
    delete s.data.keys["ctrl+1"];
    const saved = JSON.parse(s.serialize());
    expect(saved.futureThing).toEqual({ a: 1 });
    expect(saved.sound.futureKnob).toBe(3);
    expect(saved.sound.muted).toBe(false);
    // a free-form record is this version's: deleted stays deleted
    expect(saved.keys["ctrl+1"]).toBeUndefined();
  });
});

import { limitSetting, limitAll, DEFAULT_SETTINGS as DEFAULTS, type Settings as S } from "../src/core/settings";

describe("a setting stays what it may be, wherever the value comes from", () => {
  it("numbers stay in their range", () => {
    expect(limitSetting("appearance.fontSize", 0, 13)).toBe(8);
    expect(limitSetting("appearance.fontSize", 99999, 13)).toBe(40);
    expect(limitSetting("appearance.scale", -100, 100)).toBe(25);
    expect(limitSetting("appearance.scale", 1e6, 100)).toBe(200);
    expect(limitSetting("appearance.maxFps", -1, 60)).toBe(0);
    expect(limitSetting("editor.tabSize", 0, 2)).toBe(1);
    expect(limitSetting("sound.volume", 99999, 50)).toBe(100);
    expect(limitSetting("sound.mix.ui", -5, 50)).toBe(0);
    expect(limitSetting("appearance.fontSize", Number.NaN, 13)).toBe(13);
    expect(limitSetting("appearance.fontSize", Infinity, 13)).toBe(13);
  });
  it("choices are one of their words", () => {
    expect(limitSetting("boot.mode", "fast", "full")).toBe("fast");
    expect(() => limitSetting("boot.mode", "weird", "full")).toThrow(/full, fast, off/);
    expect(limitSetting("boot.mode", "weird", "full", false)).toBe("full");
  });
  it("names and folders hold nothing that breaks the screen or leaves the vault", () => {
    expect(limitSetting("user.handle", "\u001b[31m\u0000evil\n\n", "neo")).toBe("[31mevil");
    expect(limitSetting("user.handle", "\n", "neo")).toBe("neo");
    expect(limitSetting("journal.folder", "../../x", "journal")).toBe("x");
    expect(limitSetting("journal.folder", "..", "journal")).toBe("journal");
    expect(limitSetting("journal.folder", ".icebreaker/plugins", "journal")).toBe("journal");
    expect(limitSetting("journal.folder", "/diary/2026/", "journal")).toBe("diary/2026");
  });
  it("a whole settings object is put right in place (a file, a vault from elsewhere)", () => {
    const d = JSON.parse(JSON.stringify(DEFAULTS)) as S;
    d.appearance.fontSize = 0;
    d.appearance.scale = 1e9;
    (d.boot as { mode: string }).mode = "weird";
    d.journal.folder = "../../etc";
    limitAll(d);
    expect([d.appearance.fontSize, d.appearance.scale, d.boot.mode, d.journal.folder]).toEqual([8, 200, "full", "etc"]);
  });
});

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
describe("every setting the deck writes exists (shell.logWidth was written but never declared: E701)", () => {
  const files = (dir: string): string[] => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? files(join(dir, f)) : f.endsWith(".ts") ? [join(dir, f)] : []));
  it("settings.set(\"a.b\", …) and set(\"a.b\", …) name a default", async () => {
    const s = await SettingsStore.load(platformWith({}));
    const has = (path: string) => {
      let o: unknown = s.data;
      for (const k of path.split(".")) {
        if (!o || typeof o !== "object" || !(k in (o as object))) return false;
        o = (o as Record<string, unknown>)[k];
      }
      return true;
    };
    const missing = new Set<string>();
    for (const f of files("src")) {
      for (const m of readFileSync(f, "utf8").matchAll(/(?:settings\.set|(?<![.\w])set)\("([a-z][A-Za-z0-9]*(?:\.[A-Za-z0-9]+)+)"/g)) if (!has(m[1])) missing.add(`${m[1]} (${f.replace(/\\/g, "/")})`);
    }
    expect([...missing]).toEqual([]);
  });
});

import { codeFor } from "../src/core/errors";
describe("an unknown setting is not a read-only folder", () => {
  it("E702, not E701", () => {
    expect(codeFor("unknown setting: shell.logWidth")).toBe("E702");
    expect(codeFor("couldn't write settings.json")).not.toBe("E702");
  });
});

describe("a settings file that can't be read", () => {
  it("is kept as settings.json.broken before the defaults go over it", async () => {
    const written: Record<string, string> = {};
    const broken = '{"user": {"handle": "neo"'; // cut short
    const p = { config: { read: async (n: string) => (n === "settings.json" ? broken : null), write: async (n: string, c: string) => void (written[n] = c) } } as unknown as Platform;
    const s = await SettingsStore.load(p);
    expect(written["settings.json.broken"]).toBe(broken);
    expect(s.data.user).toBeTruthy();
  });
  it("a good one, or none, leaves no copy", async () => {
    const written: Record<string, string> = {};
    for (const raw of ['{"user":{}}', null, "﻿{}"]) {
      const p = { config: { read: async (n: string) => (n === "settings.json" ? raw : null), write: async (n: string, c: string) => void (written[n] = c) } } as unknown as Platform;
      await SettingsStore.load(p);
    }
    expect(written["settings.json.broken"]).toBeUndefined();
  });
});
