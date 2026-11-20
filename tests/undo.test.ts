import { describe, expect, it } from "vitest";
import { UndoHistory } from "../src/core/undo";

describe("UndoHistory", () => {
  it("undoes and redoes in order", async () => {
    const h = new UndoHistory();
    let v = 0;
    const set = (n: number) => {
      const was = v;
      v = n;
      h.record({ label: `v=${n}`, undo: () => void (v = was), redo: () => void (v = n) });
    };
    set(1);
    set(2);
    expect(await h.undo()).toBe("v=2");
    expect(v).toBe(1);
    expect(await h.undo()).toBe("v=1");
    expect(v).toBe(0);
    expect(await h.undo()).toBeUndefined();
    expect(await h.redo()).toBe("v=1");
    expect(v).toBe(1);
  });

  it("merges quick changes to the same key, keeping the first undo", async () => {
    const h = new UndoHistory();
    let v = 0;
    for (const n of [1, 2, 3]) {
      const was = v;
      v = n;
      h.record({ label: "slider", key: "s", undo: () => void (v = was), redo: () => void (v = n) });
    }
    expect(h.list().length).toBe(1);
    await h.undo();
    expect(v).toBe(0);
    await h.redo();
    expect(v).toBe(3);
  });

  it("doesn't record what undoing does, and groups steps", async () => {
    const h = new UndoHistory();
    const log: string[] = [];
    h.group("theme", () => {
      h.record({ label: "a", undo: () => { log.push("-a"); h.record({ label: "loop", undo: () => {} }); } });
      h.record({ label: "b", undo: () => void log.push("-b") });
    });
    expect(h.list().map((e) => e.label)).toEqual(["theme"]);
    await h.undo();
    expect(log).toEqual(["-b", "-a"]);
    expect(h.canUndo).toBe(false);
  });

  it("a new change forgets what could be redone", async () => {
    const h = new UndoHistory();
    h.record({ label: "a", undo: () => {}, redo: () => {} });
    await h.undo();
    expect(h.canRedo).toBe(true);
    h.record({ label: "b", undo: () => {} });
    expect(h.canRedo).toBe(false);
  });

  it("groups steps that take a moment into one", async () => {
    const h = new UndoHistory();
    const log: string[] = [];
    await h.groupAsync("move", async () => {
      h.record({ label: "a", undo: () => void log.push("-a") });
      await Promise.resolve();
      h.record({ label: "b", undo: () => void log.push("-b") });
    });
    expect(h.list().map((e) => e.label)).toEqual(["move"]);
    await h.undo();
    expect(log).toEqual(["-b", "-a"]);
  });

  it("a lastOnly step (an uninstall) is undoable only while it's the last thing done", async () => {
    const h = new UndoHistory();
    const done: string[] = [];
    h.record({ label: "theme", undo: () => void done.push("theme") });
    h.record({ label: "uninstall hello", lastOnly: true, undo: () => void done.push("hello back") });
    // right after: ⌘Z brings the module back
    expect(h.list()[0].label).toBe("uninstall hello");
    // something else happens: the uninstall can't come back by surprise any more
    h.record({ label: "todo add milk", undo: () => void done.push("milk gone") });
    expect(await h.undo()).toBe("todo add milk");
    expect(await h.undo()).toBe("theme");
    expect(done).toEqual(["milk gone", "theme"]);
  });
});
