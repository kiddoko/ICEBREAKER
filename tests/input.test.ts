import { describe, expect, it } from "vitest";
import { toKeyInput, typesText } from "../src/core/input";

const ev = (key: string, mods: Partial<{ ctrlKey: boolean; metaKey: boolean; altKey: boolean; shiftKey: boolean }> = {}, code = "") =>
  ({ key, code, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, repeat: false, ...mods }) as unknown as KeyboardEvent;

describe("keys that type vs shortcuts", () => {
  it("a plain character types", () => {
    expect(typesText(ev("a"), false, false)).toBe(true);
    expect(typesText(ev("Enter"), false, false)).toBe(false);
  });

  it("AltGr types on Windows (ctrl+alt) and on Linux (reported as alt): # is never alt+3", () => {
    expect(typesText(ev("#", { ctrlKey: true, altKey: true }), true, false)).toBe(true);
    expect(typesText(ev("#", { altKey: true }), true, false)).toBe(true);
    // the same key without AltGr held: a shortcut (alt+1…9 goes to a tab)
    expect(typesText(ev("&", { altKey: true }), false, false)).toBe(false);
  });

  it("⌥ alone types on a Mac, ⌘ never does", () => {
    expect(typesText(ev("|", { altKey: true }), false, true)).toBe(true);
    expect(typesText(ev("s", { metaKey: true }), false, true)).toBe(false);
    expect(typesText(ev("s", { metaKey: true }), true, true)).toBe(false);
  });

  it("⇧Tab is shift+tab, whatever name the system gives it", () => {
    expect(toKeyInput(ev("Tab", { shiftKey: true }, "Tab")).combo).toBe("shift+tab");
    expect(toKeyInput(ev("ISO_Left_Tab", { shiftKey: true }, "")).combo).toBe("shift+tab");
    expect(toKeyInput(ev("Unidentified", { shiftKey: true }, "Tab")).combo).toBe("shift+tab");
  });
});
