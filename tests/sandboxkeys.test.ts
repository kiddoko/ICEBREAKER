import { describe, expect, it } from "vitest";
import { moduleTakesKey } from "../src/plugins/sandbox/bridge";
import type { KeyInput } from "../src/core/input";

const key = (combo: string): KeyInput => {
  const parts = combo.split("+");
  const k = parts[parts.length - 1];
  return { key: k, code: "", ctrl: parts.includes("ctrl"), alt: parts.includes("alt"), shift: parts.includes("shift"), meta: false, combo };
};

describe("a sandboxed module's page and the deck's keys", () => {
  it("a page that plays the keyboard (rawKeys) gets F1–F8, ⌘/ctrl ← →, Tab, ⇧Tab, ⌘Z, ⌘S", () => {
    for (const c of ["f1", "f5", "f8", "ctrl+left", "ctrl+right", "tab", "shift+tab", "ctrl+z", "ctrl+shift+z", "ctrl+s", "ctrl+shift+s"]) expect(moduleTakesKey(key(c), true), c).toBe(true);
  });
  it("…but never esc, F9–F12 or the deck's other shortcuts", () => {
    for (const c of ["esc", "f9", "f12", "ctrl+k", "ctrl+w", "ctrl+1"]) expect(moduleTakesKey(key(c), true), c).toBe(false);
  });
  it("a page that doesn't play the keyboard leaves them all to the deck", () => {
    for (const c of ["f1", "ctrl+left", "tab", "shift+tab", "ctrl+s"]) expect(moduleTakesKey(key(c), false), c).toBe(false);
    expect(moduleTakesKey(key("a"), false)).toBe(true);
  });
});

import { quietWrite } from "../src/plugins/permissions";
describe("an autosave never asks", () => {
  it("writing in a .recovery folder inside the folder you granted: no question", () => {
    expect(quietWrite("songs/.recovery/my song.bmed", "vault:write:songs/")).toBe(true);
    expect(quietWrite("songs/sub/.recovery/x.bmed", "vault:write:songs/")).toBe(true);
  });
  it("anything else still asks the first time", () => {
    expect(quietWrite("songs/my song.bmed", "vault:write:songs/")).toBe(false);
    expect(quietWrite("notes/.recovery/x.md", "vault:write:songs/")).toBe(false);
    // the whole vault granted: a .recovery anywhere is still a write it asks about
    expect(quietWrite(".recovery/x", "vault:write")).toBe(false);
    expect(quietWrite("songs/.recovery/../a.md", "vault:write:songs/")).toBe(false);
  });
});

import { Grid, NOFADE } from "../src/core/grid";
import { UI } from "../src/ui/ui";
import { ThemeManager } from "../src/core/theme";
describe("ui.art for a module's scenery (a tracker's scrolling pattern)", () => {
  it("what it draws inside art() never fades in — the sandbox copies that mark with the cells", () => {
    const ui = new UI();
    const g = new Grid(10, 2);
    ui.begin(g, new ThemeManager().current, 0, { x: -1, y: -1 });
    ui.art(() => ui.text(0, 0, "C-4"));
    ui.text(0, 1, "C-4");
    expect(g.attr[0] & NOFADE).toBe(NOFADE);
    expect(g.attr[10] & NOFADE).toBe(0);
  });
});

describe("an autosave never asks — the edges", () => {
  it("a folder that only starts like the granted one still asks", () => {
    expect(quietWrite("songsx/.recovery/a", "vault:write:songs/")).toBe(false);
  });
  it("written the Windows way, or the .recovery folder itself (its mkdir): quiet", () => {
    expect(quietWrite("songs\\.recovery\\a.bmed", "vault:write:songs/")).toBe(true);
    expect(quietWrite("songs/.recovery", "vault:write:songs/")).toBe(true);
  });
});
