import { describe, expect, it } from "vitest";
import { DECK_KEYS, keysOf, MENU, menuKeyEntries, menuKeyOf, normalizeCombo, shortcutFor, SHORTCUTS } from "../src/core/shortcuts";

describe("normalizeCombo", () => {
  it("writes combos one way", () => {
    expect(normalizeCombo("Cmd+Shift+1")).toBe("ctrl+shift+1");
    expect(normalizeCombo("⌘⇧K")).toBe("ctrl+shift+k");
    expect(normalizeCombo("shift+ctrl+b")).toBe("ctrl+shift+b");
    expect(normalizeCombo("alt+t")).toBe("alt+t");
  });
  it("refuses a bare letter (it would eat your typing) and unknown modifiers", () => {
    expect(normalizeCombo("a")).toBeNull();
    expect(normalizeCombo("hyper+a")).toBeNull();
  });
  it("reads keys on THE MENU, old names included", () => {
    expect(normalizeCombo("menu g")).toBe(`${MENU}g`);
    expect(normalizeCombo("≡ g")).toBe(`${MENU}g`);
    expect(normalizeCombo("space g")).toBe(`${MENU}g`);
  });
});

describe("the shortcut table", () => {
  it("has unique ids and unique menu keys", () => {
    const ids = DECK_KEYS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    const keys = SHORTCUTS.map((s) => s.menuKey).filter(Boolean);
    expect(new Set(keys).size).toBe(keys.length);
  });
  it("no two global shortcuts share a key combo", () => {
    const seen = new Map<string, string>();
    for (const s of DECK_KEYS.filter((x) => x.global)) {
      for (const combo of s.keys.split(" · ")) {
        expect(seen.get(combo), `${combo}: ${s.id} and ${seen.get(combo)}`).toBeUndefined();
        seen.set(combo, s.id!);
      }
    }
  });
  it("finds a shortcut by its keys, with the user's changes", () => {
    expect(shortcutFor("ctrl+k", {})?.id).toBe("menu");
    expect(shortcutFor("ctrl+k", { menu: "ctrl+alt+m" })).toBeUndefined();
    expect(shortcutFor("ctrl+alt+m", { menu: "ctrl+alt+m" })?.id).toBe("menu");
    const menu = DECK_KEYS.find((s) => s.id === "menu")!;
    expect(keysOf(menu, { menu: "" })).toBe(""); // switched off
  });
  it("menu keys: the deck's, changed, then yours on top", () => {
    const home = DECK_KEYS.find((s) => s.id === "home")!;
    expect(menuKeyOf(home, {})).toBe("h");
    expect(menuKeyOf(home, { home: "j" })).toBe("j");
    const entries = menuKeyEntries({}, { [`${MENU}h`]: "open notes/x.md" });
    const h = entries.find((e) => e.key === "h")!;
    expect(h.cmd).toBe("open notes/x.md");
  });
});
