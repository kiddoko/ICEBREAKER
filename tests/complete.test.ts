import { describe, expect, it } from "vitest";
import { quoteWord, wordAtCursor } from "../src/shell/complete";
import { parse } from "../src/shell/parser";
import { osKeys } from "../src/core/keyhints";

const words = (line: string) => parse(line, {})[0].commands[0].words.map((w) => w.value);

/** what Tab gives for `before` when the only match is `name` */
const tab = (before: string, name: string, done = true) => {
  const w = wordAtCursor(before);
  return before.slice(0, w.start) + quoteWord(name, w.open, done);
};

describe("Tab completion and names with spaces", () => {
  it("finds the word at the cursor the way the parser reads it", () => {
    expect(wordAtCursor("cd STA")).toEqual({ start: 3, value: "STA", open: null, first: false });
    expect(wordAtCursor("ls")).toMatchObject({ value: "ls", first: true });
    expect(wordAtCursor('cat "START HE')).toEqual({ start: 4, value: "START HE", open: '"', first: false });
    expect(wordAtCursor("cat START\\ HE")).toMatchObject({ start: 4, value: "START HE", open: null });
    expect(wordAtCursor('cat "START HERE/"We')).toMatchObject({ start: 4, value: "START HERE/We", open: null });
    expect(wordAtCursor("cd ")).toEqual({ start: 3, value: "", open: null, first: false });
    expect(wordAtCursor("ls | gr")).toMatchObject({ value: "gr", first: true });
    expect(wordAtCursor("echo hi > no")).toMatchObject({ value: "no", first: false });
  });

  it("quotes a name with spaces: cd STA<Tab> → cd \"START HERE/\"", () => {
    const line = tab("cd STA", "START HERE/");
    expect(line).toBe('cd "START HERE/"');
    expect(words(line)).toEqual(["cd", "START HERE/"]);
  });

  it("keeps the quote you opened, and goes on inside a folder already quoted", () => {
    expect(tab('cd "STA', "START HERE/")).toBe('cd "START HERE/"');
    expect(tab("cat 'my no", "my notes.md")).toBe("cat 'my notes.md' ");
    const deeper = tab('cat "START HERE/"We', "START HERE/Welcome.md");
    expect(deeper).toBe('cat "START HERE/Welcome.md" ');
    expect(words(deeper)).toEqual(["cat", "START HERE/Welcome.md"]);
  });

  it("leaves the quote open on a common prefix, so you keep typing inside it", () => {
    expect(tab("cat my", "my no", false)).toBe('cat "my no');
  });

  it("leaves plain names alone and escapes what double quotes would read", () => {
    expect(tab("cat no", "notes/")).toBe("cat notes/");
    expect(tab("cat id", "ideas.md")).toBe("cat ideas.md ");
    const odd = tab("cat pr", 'price $5 "deal".md');
    expect(odd).toBe('cat "price \\$5 \\"deal\\".md" ');
    expect(words(odd)).toEqual(["cat", 'price $5 "deal".md']);
    const apos = tab("cat it", "it's here.md");
    expect(words(apos)).toEqual(["cat", "it's here.md"]);
  });
});

describe("key hints on Windows / Linux", () => {
  it("writes Mac glyphs the PC way", () => {
    expect(osKeys("⌘K menu · ⇧⌘Z redo · ⌘⇧P hide", false)).toBe("Ctrl+K menu · Ctrl+Shift+Z redo · Ctrl+Shift+P hide");
    expect(osKeys("⌘C ⌘V copy/paste", false)).toBe("Ctrl+C Ctrl+V copy/paste");
    // a hint that gives both forms shows one ("⌘K (ctrl+K)" on Windows was the KEYS page's)
    expect(osKeys("⌘K (ctrl+K) always opens it", false)).toBe("Ctrl+K always opens it");
    expect(osKeys("⌘Z / ctrl+Z undo", false)).toBe("Ctrl+Z undo");
    expect(osKeys("⌘1…9 tabs · ⌥⌘← pane", false)).toBe("Ctrl+1…9 tabs · Ctrl+Alt+← pane");
  });
  it("leaves the Mac alone, and what's about the Mac on purpose", () => {
    expect(osKeys("⌘K menu", true)).toBe("⌘K menu");
    expect(osKeys("fullscreen (F11, ⌃⌘F on macOS)", false)).toBe("fullscreen (F11, ⌃⌘F on macOS)");
    expect(osKeys("Delete (⌘⌫ on a Mac) sends to the trash", false)).toBe("Delete (⌘⌫ on a Mac) sends to the trash");
    expect(osKeys("⇧⇧ menu", false)).toBe("⇧⇧ menu");
  });
  it("says a key once when both forms are written", () => {
    expect(osKeys("undo (⌘Z / ctrl+Z)", false)).toBe("undo (Ctrl+Z)");
    expect(osKeys("⌘/ / Ctrl+/", false)).toBe("Ctrl+/");
  });
});

import { commandWords, subCompletions } from "../src/shell/complete";
describe("Tab completion of a command's sub-commands (med <tab>)", () => {
  it("the words of the command being typed, before the cursor's word", () => {
    expect(commandWords("med ")).toEqual(["med"]);
    expect(commandWords("med exp")).toEqual(["med"]);
    expect(commandWords("med export w")).toEqual(["med", "export"]);
    expect(commandWords("ls | med export ")).toEqual(["med", "export"]);
    expect(commandWords('med "my song" ')).toEqual(["med", "my song"]);
    expect(commandWords("med")).toEqual([]);
  });
  it("a list: the first word after the command; a record: by the words before", () => {
    const list = () => ["new", "open", "export", "help"];
    expect(subCompletions(list, [], "e")).toEqual(["export"]);
    expect(subCompletions(list, [], "")).toEqual(["new", "open", "export", "help"]);
    expect(subCompletions(list, ["export"], "")).toBeNull(); // deeper: the paths
    const rec = { "": ["export", "play"], export: ["wav", "mod"] };
    expect(subCompletions(rec, ["export"], "w")).toEqual(["wav"]);
    expect(subCompletions(rec, [], "p")).toEqual(["play"]);
    expect(subCompletions(rec, ["play"], "")).toBeNull();
    expect(subCompletions("path", [], "x")).toBeNull();
    expect(subCompletions(undefined, [], "x")).toBeNull();
  });
  it("a function sees the words before", () => {
    const fn = (args: string[]) => (args[0] === "export" ? ["wav"] : ["export"]);
    expect(subCompletions(fn, ["export"], "")).toEqual(["wav"]);
    expect(subCompletions(fn, [], "ex")).toEqual(["export"]);
  });
  it("nothing matching: null (the paths, then)", () => {
    expect(subCompletions(() => ["export"], [], "songs/")).toBeNull();
  });
});

import { completeSpec } from "../src/plugins/sandbox/bridge";
describe("a sandboxed module's completion crosses as words only", () => {
  it("keeps lists, records and the three names; drops anything else", () => {
    expect(completeSpec(["new", 3, "open"])).toEqual(["new", "open"]);
    expect(completeSpec({ "": ["export"], export: ["wav", {}] })).toEqual({ "": ["export"], export: ["wav"] });
    expect(completeSpec("path")).toBe("path");
    expect(completeSpec("rm -rf")).toBeUndefined();
    expect(completeSpec(42)).toBeUndefined();
  });
});
