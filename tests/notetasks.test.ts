import { describe, expect, it } from "vitest";
import { NoteTasks, openBoxes, parseRef, refOf, setBox, type NoteIO } from "../plugins/todo/notetasks";

/** a vault in memory: notes, their modification times, and how many reads it took */
function memVault(files: Record<string, string>) {
  const f = { ...files };
  const at: Record<string, number> = {};
  let clock = 1;
  for (const p of Object.keys(f)) at[p] = clock++;
  const reads: string[] = [];
  const io: NoteIO = {
    modified: async () => ({ ...at }),
    read: async (p) => (reads.push(p), f[p] ?? Promise.reject(new Error("gone"))),
    write: async (p, c) => void ((f[p] = c), (at[p] = clock++)),
  };
  /** changed elsewhere (another editor, Obsidian): a new modification time */
  const edit = (p: string, c: string) => void ((f[p] = c), (at[p] = clock++));
  const remove = (p: string) => void (delete f[p], delete at[p]);
  return { f, io, reads, edit, remove };
}

describe("the - [ ] of the notes (TODO)", () => {
  it("finds open checkboxes, not ticked ones, not those in code blocks", () => {
    const text = "# list\n- [ ] milk\n  * [ ] eggs\n- [x] bread\n+ [X] jam\n```\n- [ ] not a task\n```\n- [ ]   \n- [ ] tea\r";
    expect(openBoxes("n.md", text).map((t) => [t.line, t.text])).toEqual([
      [1, "milk"],
      [2, "eggs"],
      [9, "tea"],
    ]);
  });

  it("ticks and unticks a line, keeping its indent, its bullet and a Windows line end", () => {
    expect(setBox("  * [ ] eggs\r", true)).toBe("  * [x] eggs\r");
    expect(setBox("- [X] jam", false)).toBe("- [ ] jam");
    expect(setBox("just text", true)).toBeNull();
  });

  it("reads a note's line address like grep and `checkboxes` print it", () => {
    expect(parseRef("notes/courses.md:4")).toEqual({ path: "notes/courses.md", line: 3 });
    expect(parseRef("START HERE/a b.md:12")).toEqual({ path: "START HERE/a b.md", line: 11 });
    expect(parseRef("12")).toBeNull();
    expect(parseRef("x.md:0")).toBeNull();
    expect(refOf({ path: "a.md", line: 0 })).toBe("a.md:1");
  });

  it("reads each note once, then only the ones that changed, and forgets deleted ones", async () => {
    const v = memVault({ "a.md": "- [ ] one", "b.md": "nothing", "c.md": "- [ ] three", ".trash/old.md": "- [ ] trashed" });
    const n = new NoteTasks(v.io);
    expect(await n.refresh()).toBe(true);
    expect(n.list().map((t) => t.text)).toEqual(["one", "three"]);
    expect(v.reads.sort()).toEqual(["a.md", "b.md", "c.md"]);
    v.reads.length = 0;
    expect(await n.refresh()).toBe(false);
    expect(v.reads).toEqual([]);
    v.edit("b.md", "- [ ] two");
    v.remove("c.md");
    expect(await n.refresh()).toBe(true);
    expect(v.reads).toEqual(["b.md"]);
    expect(n.list().map((t) => t.text)).toEqual(["one", "two"]);
  });

  it("stays quick on a big vault: 2 000 notes read once, a second look reads nothing", async () => {
    const files: Record<string, string> = {};
    for (let i = 0; i < 2000; i++) files[`notes/n${i}.md`] = i % 10 ? "plain text\n".repeat(20) : "- [ ] task\n- [x] done";
    const v = memVault(files);
    const n = new NoteTasks(v.io);
    await n.refresh();
    expect(n.list()).toHaveLength(200);
    expect(v.reads).toHaveLength(2000);
    v.reads.length = 0;
    await n.refresh();
    expect(v.reads).toHaveLength(0);
  });

  it("writes - [x] on that very line, and refuses when the line changed since", async () => {
    const v = memVault({ "a.md": "intro\n- [ ] milk\n- [ ] eggs" });
    const n = new NoteTasks(v.io);
    await n.refresh();
    const eggs = n.find("a.md", 2)!;
    const r = await n.tick("a.md", 2, true, eggs.raw);
    expect(r).toEqual({ before: "- [ ] eggs", after: "- [x] eggs" });
    expect(v.f["a.md"]).toBe("intro\n- [ ] milk\n- [x] eggs");
    expect(n.list().map((t) => t.text)).toEqual(["milk"]);
    // someone added a line above in the meantime: line 1 isn't "milk" any more
    const milk = n.find("a.md", 1)!;
    v.edit("a.md", "intro\n- [ ] bread\n- [ ] milk\n- [x] eggs");
    await expect(n.tick("a.md", 1, true, milk.raw)).rejects.toThrow(/changed since/);
    expect(v.f["a.md"]).toBe("intro\n- [ ] bread\n- [ ] milk\n- [x] eggs");
    // and what TODO shows is the note as it is now
    expect(n.list().map((t) => t.text)).toEqual(["bread", "milk"]);
  });

  it("undoes a tick (what ⌘Z runs), and won't if the line was changed again", async () => {
    const v = memVault({ "a.md": "- [ ] milk" });
    const n = new NoteTasks(v.io);
    await n.refresh();
    const { before, after } = await n.tick("a.md", 0, true, n.find("a.md", 0)!.raw);
    await n.tick("a.md", 0, false, after);
    expect(v.f["a.md"]).toBe("- [ ] milk");
    await n.tick("a.md", 0, true, before);
    v.edit("a.md", "- [x] milk and honey");
    await expect(n.tick("a.md", 0, false, after)).rejects.toThrow(/changed since/);
    expect(v.f["a.md"]).toBe("- [x] milk and honey");
  });
});
