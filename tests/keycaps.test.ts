import { describe, expect, it } from "vitest";
import { keysIn } from "../src/ui/keycaps";

describe("keycaps: shortcuts found in interface text", () => {
  it("finds modifier combos and symbols", () => {
    expect(keysIn("⌘⇧P hide the panel")).toEqual(["⌘⇧P"]);
    expect(keysIn("press ctrl+shift+k or Ctrl+/ now")).toEqual(["ctrl+shift+k", "Ctrl+/"]);
    expect(keysIn("⌘1…9 · ⌘W closes it")).toEqual(["⌘1…9", "⌘W"]);
    expect(keysIn("shift twice: ⇧⇧")).toEqual(["⇧⇧"]);
  });
  it("finds function and named keys, arrows", () => {
    expect(keysIn("F2 rename · esc done")).toEqual(["F2", "esc"]);
    expect(keysIn("←→ choose · enter open")).toEqual(["←→", "enter"]);
    expect(keysIn("Échap pour fermer")).toEqual(["Échap"]);
  });
  it("finds the letter at the start of a hint segment", () => {
    expect(keysIn("e edit · a add · x remove")).toEqual(["e", "a", "x"]);
    expect(keysIn("tab next field · enter unlock · ⌘Q / alt+F4 quit")).toEqual(["⌘Q", "alt+F4", "enter", "tab"].sort((a, b) => "tab next field · enter unlock · ⌘Q / alt+F4 quit".indexOf(a) - "tab next field · enter unlock · ⌘Q / alt+F4 quit".indexOf(b)));
    expect(keysIn("+ new account")).toEqual([]);
    expect(keysIn("Settings → SOUND, or THE MENU → tour")).toEqual([]);
    expect(keysIn("→ or enter: next · ← back")).toEqual(["→", "enter", "←"]);
  });
  it("leaves prose alone", () => {
    expect(keysIn("a new tab for your notes")).toEqual([]);
    expect(keysIn("Fix the F-word and the deltas")).toEqual([]);
    expect(keysIn("C++ code and 3+4")).toEqual([]);
    expect(keysIn("enterprise escape hatch")).toEqual([]);
    expect(keysIn("sun ↑08:05 ↓17:05 · ↑13° ↓9°")).toEqual([]);
    expect(keysIn("up 0d 0h · 1 procs")).toEqual([]);
  });
});

describe("the article a is not a key", () => {
  it("'a full path…' has no key; 'a add' and 'a ajouter' do", () => {
    expect(keysIn("a full path (~/notes works) · tab completes the folder's name")).toEqual(["tab"]);
    expect(keysIn("e edit · a add a widget · x remove")).toEqual(["e", "a", "x"]);
    expect(keysIn("e éditer · a ajouter un widget")).toEqual(["e", "a"]);
  });
});

describe("a key's name in a sentence is a word, not a key (bench 0.7.1)", () => {
  it("« Space Mono » (a font), « Delete the account? » (a question)", () => {
    expect(keysIn("font: Space Mono")).toEqual([]);
    expect(keysIn("Delete the account test3?")).toEqual([]);
    expect(keysIn("Tab names follow the shell")).toEqual([]);
  });
  it("still keys in hints", () => {
    expect(keysIn("Space plays · Esc back")).toEqual(["Space", "Esc"]);
    expect(keysIn("Delete: to the trash")).toEqual(["Delete"]);
  });
});
