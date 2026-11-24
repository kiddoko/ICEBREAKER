import { describe, expect, it } from "vitest";
import { extOf, handlersFor, readOpens, chooseHandler } from "../src/plugins/fileassoc";

describe("a module's file types (plugin.json `opens`)", () => {
  it("reads the short form and the long one", () => {
    expect(readOpens({ id: "breakermed", opens: ["bmed", ".MOD", "med"] })).toEqual([{ types: ["bmed", "mod", "med"], page: undefined }]);
    expect(readOpens({ id: "x", opens: [{ types: ["png"], page: "viewer" }] })).toEqual([{ types: ["png"], page: "viewer" }]);
  });
  it("never takes a note (.md) nor a name that isn't an extension", () => {
    expect(readOpens({ id: "x", opens: ["md", "markdown", "a b", "../x", "", 3, "toolongextension"] })).toEqual([]);
    expect(readOpens({ id: "x" })).toEqual([]);
    expect(readOpens({ id: "x", opens: "bmed" })).toEqual([]);
  });
  it("extOf: the last extension, lowercase", () => {
    expect(extOf("songs/My Song.BMED")).toBe("bmed");
    expect(extOf("songs/archive.tar.gz")).toBe("gz");
    expect(extOf("songs/noext")).toBe("");
    expect(extOf("songs.d/noext")).toBe("");
  });
});

describe("which module opens a file", () => {
  const mods = [
    { id: "breakermed", opens: [{ types: ["bmed", "mod", "med"] }] },
    { id: "oldtracker", opens: [{ types: ["mod"], page: "tracker" }] },
  ];
  it("lists every module that claims the extension", () => {
    expect(handlersFor("x/a.bmed", mods)).toEqual([{ module: "breakermed", page: undefined }]);
    expect(handlersFor("x/a.MOD", mods).map((h) => h.module)).toEqual(["breakermed", "oldtracker"]);
    expect(handlersFor("x/a.md", mods)).toEqual([]);
  });
  it("one: that one; none: null; two: the one you chose before, else ask", () => {
    expect(chooseHandler(handlersFor("a.bmed", mods), {}, "bmed")).toEqual({ module: "breakermed", page: undefined });
    expect(chooseHandler([], {}, "txt")).toBeNull();
    expect(chooseHandler(handlersFor("a.mod", mods), {}, "mod")).toBe("ask");
    expect(chooseHandler(handlersFor("a.mod", mods), { mod: "oldtracker" }, "mod")).toEqual({ module: "oldtracker", page: "tracker" });
    // the one remembered is gone (switched off, removed): asked again
    expect(chooseHandler(handlersFor("a.mod", mods), { mod: "gone" }, "mod")).toBe("ask");
  });
});
