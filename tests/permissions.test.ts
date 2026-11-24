import { describe, expect, it, vi } from "vitest";
import { describePerm, Grants, levelOf, migrateGranted, missing, parsePerm, readPerms, sortPerms } from "../src/plugins/permissions";
import { allows, guardedVault, trusted, type Origin } from "../src/shell/origin";
import { DEFAULT_SETTINGS, migratePermissions, type Settings } from "../src/core/settings";
import { AccessLog } from "../src/core/access";
import { givenNotes, vaultTools } from "../src/ai/tools";
import type { Vault } from "../src/vault/vault";

describe("permissions in plain words (plugins/permissions.ts)", () => {
  it("reads the names a plugin.json may use, and refuses the rest", () => {
    expect(parsePerm("vault:read")).toEqual({ base: "vault:read" });
    expect(parsePerm("vault:write:songs")).toEqual({ base: "vault:write", scope: "songs/" });
    expect(parsePerm("vault:read:notes\\work/")).toEqual({ base: "vault:read", scope: "notes/work/" });
    expect(parsePerm("net:API.Example.com")).toEqual({ base: "net", scope: "api.example.com" });
    expect(parsePerm("net:*.example.com")).toEqual({ base: "net", scope: "*.example.com" });
    // no host named, an address, a port, a path, the deck's own folder, a way up
    for (const bad of ["net", "net:", "net:https://x.com", "net:x.com:8080", "net:x.com/a", "net:localhost", "net:10.0.0.1", "vault:read:", "vault:read:../x", "vault:write:.icebreaker", "vault:write:.ICEBREAKER/plugins", "everything", "", 3, null]) expect(parsePerm(bad), String(bad)).toBeNull();
  });

  it("a module written before 0.6 is read the old way: media both halves, notify and shell as it always could", () => {
    expect(readPerms(["vault:read", "media"], true).perms).toEqual(sortPerms(["media:control", "notify", "media:files", "shell", "vault:read"]));
    // written for 0.6 ("api": 2): exactly what it lists
    expect(readPerms(["vault:read", "media"], false).perms).toEqual(sortPerms(["media:control", "media:files", "vault:read"]));
    expect(readPerms(["vault:read", "fly"], false).unknown).toEqual(["fly"]);
    expect(readPerms(undefined, false).perms).toEqual([]);
  });

  it("levels: what's asked when", () => {
    expect(levelOf("audio")).toBe("low");
    expect(levelOf("vault:read:songs/")).toBe("medium");
    expect(levelOf("vault:write")).toBe("high");
    expect(levelOf("net:api.example.com")).toBe("high");
    expect(levelOf("terminal")).toBe("total");
    // what we can't name is treated as the worst
    expect(levelOf("fly")).toBe("total");
    // the riskiest last
    expect(sortPerms(["terminal", "audio", "vault:write", "ai"])).toEqual(["audio", "ai", "vault:write", "terminal"]);
    expect(describePerm("vault:write:songs/")).toMatchObject({ label: "Change your notes", scope: "songs/", level: "high" });
  });

  it("a folder's permission covers that folder, nothing else", () => {
    const g = new Grants(() => ["vault:read:songs/", "vault:write:songs/demos/"]);
    expect(g.has("vault:read")).toBe(true); // "at all?"
    expect(g.has("vault:read", "songs/a.bmed")).toBe(true);
    expect(g.has("vault:read", "Songs/Sub/a.bmed")).toBe(true); // as the disk reads it
    expect(g.has("vault:read", "songs")).toBe(true); // the folder itself
    expect(g.has("vault:read", "songs2/a.md")).toBe(false);
    expect(g.has("vault:read", "notes/a.md")).toBe(false);
    expect(g.has("vault:write", "songs/a.bmed")).toBe(false);
    expect(g.has("vault:write", "songs/demos/a.bmed")).toBe(true);
    expect(g.folders("vault:read")).toEqual(["songs/"]);
    expect(new Grants(() => ["vault:read"]).folders("vault:read")).toBeNull();
    expect(new Grants(() => ["vault:read"]).has("vault:read", "anything/at/all.md")).toBe(true);
  });

  it("a host's permission covers that host, nothing else", () => {
    const g = new Grants(() => ["net:api.example.com", "net:*.github.io"]);
    expect(g.has("net", "api.example.com")).toBe(true);
    expect(g.has("net", "evil.example.com")).toBe(false);
    expect(g.has("net", "example.com")).toBe(false);
    expect(g.has("net", "api.example.com.evil.org")).toBe(false);
    expect(g.has("net", "me.github.io")).toBe(true);
    expect(g.has("net", "github.io")).toBe(true);
    expect(g.has("net", "notgithub.io")).toBe(false);
    expect(new Grants(() => []).has("net", "api.example.com")).toBe(false);
  });

  it("reading the calendar is covered by the whole calendar, not the other way", () => {
    expect(new Grants(() => ["google-calendar"]).has("google-calendar:read")).toBe(true);
    expect(new Grants(() => ["google-calendar:read"]).has("google-calendar")).toBe(false);
  });

  it("what you take away stops working at once (the list is read at every question)", () => {
    const list = ["vault:read", "ai"];
    const g = new Grants(() => list);
    expect(g.has("ai")).toBe(true);
    list.splice(list.indexOf("ai"), 1);
    expect(g.has("ai")).toBe(false);
    // a module that ships with the deck: everything but what you took away
    const off: string[] = [];
    const own = new Grants(() => off, true);
    expect(own.has("vault:write", "notes/a.md")).toBe(true);
    off.push("vault:write");
    expect(own.has("vault:write", "notes/a.md")).toBe(false);
    expect(own.has("vault:read", "notes/a.md")).toBe(true);
  });

  it("an update: only what's really new is asked", () => {
    expect(missing(["vault:read", "audio"], ["audio", "vault:read", "notify"])).toEqual([]);
    expect(missing(["vault:read", "vault:write"], ["vault:read"])).toEqual(["vault:write"]);
    // narrower than what you approved: nothing new; wider: new
    expect(missing(["vault:read:songs/"], ["vault:read"])).toEqual([]);
    expect(missing(["vault:read:songs/demos/"], ["vault:read:songs/"])).toEqual([]);
    expect(missing(["vault:read"], ["vault:read:songs/"])).toEqual(["vault:read"]);
    expect(missing(["vault:read:notes/"], ["vault:read:songs/"])).toEqual(["vault:read:notes/"]);
    expect(missing(["net:b.example.com"], ["net:a.example.com"])).toEqual(["net:b.example.com"]);
    expect(missing(["google-calendar:read"], ["google-calendar"])).toEqual([]);
  });
});

describe("accounts from before 0.6 keep what they approved (core/settings.ts)", () => {
  const fresh = (): Settings => JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
  it("old names are translated, high-risk ones already had aren't asked again", () => {
    const data = fresh();
    data.plugins.granted = { breakermed: ["audio", "vault:read", "vault:write"], player: ["media"] };
    migratePermissions(data, { plugins: { granted: data.plugins.granted }, ai: { provider: "claude-code" } });
    expect(data.plugins.granted.breakermed).toEqual(sortPerms(["audio", "notify", "shell", "vault:read", "vault:write"]));
    expect(data.plugins.granted.player).toEqual(sortPerms(["media:control", "media:files", "notify", "shell"]));
    expect(data.plugins.always.breakermed).toEqual(["vault:write"]);
    expect(data.plugins.always.player).toEqual([]);
    expect(data.plugins.model).toBe(2);
    // the AI keeps reading the whole vault, as it did
    expect(data.ai.reads).toBe("all");
    expect(migrateGranted(["terminal"])).toEqual(sortPerms(["notify", "shell", "terminal"]));
  });
  it("already in 0.6's names: left as it is", () => {
    const data = fresh();
    data.plugins.granted = { m: ["vault:read:songs/"] };
    data.ai.reads = "nothing";
    migratePermissions(data, { plugins: { model: 2, granted: data.plugins.granted }, ai: { reads: "nothing" } });
    expect(data.plugins.granted.m).toEqual(["vault:read:songs/"]);
    expect(data.plugins.always).toEqual({});
    expect(data.ai.reads).toBe("nothing");
  });
  it("a new account: the AI reads what you give it", () => {
    const data = fresh();
    migratePermissions(data, {});
    expect(data.ai.reads).toBe("given");
    expect(data.shell.bridge).toBe("more");
  });
});

/** a vault that only remembers what was asked of it */
function fakeVault() {
  const calls: string[] = [];
  const rec = (name: string) => (...a: unknown[]) => (calls.push(`${name} ${a[0]}`), Promise.resolve(name === "read" ? "text" : undefined));
  const v = { read: rec("read"), readMany: rec("readMany"), readBytes: rec("readBytes"), write: rec("write"), writeBytes: rec("writeBytes"), append: rec("append"), mkdir: rec("mkdir"), trash: rec("trash"), rename: rec("rename"), restore: rec("restore"), toolFiles: rec("toolFiles"), entries: [] };
  return { vault: v as unknown as Vault, calls };
}

describe("a module's line, with 0.6's permissions (shell/origin.ts)", () => {
  it("allowed in one folder: reads and writes there only", async () => {
    const { vault, calls } = fakeVault();
    const o: Origin = { source: "med", grants: new Grants(() => ["vault:read:songs/", "vault:write:songs/"]) };
    const g = guardedVault(vault, o);
    await g.read("songs/a.bmed");
    await g.write("songs/b.bmed", "x");
    await expect(g.read("notes/secret.md")).rejects.toThrow(/only in the folders you allowed/);
    await expect(g.write("notes/x.md", "x")).rejects.toThrow(/only in the folders you allowed/);
    await expect(g.rename("songs/a.bmed", "notes/a.bmed")).rejects.toThrow(/only in the folders you allowed/);
    await expect(g.readMany(["songs/a.bmed", "journal/today.md"])).rejects.toThrow(/only in the folders you allowed/);
    // what's written is content, never read as a path (".icebreaker/x" as a note's text is fine)
    await g.write("songs/c.txt", ".icebreaker/plugins/x/main.js");
    expect(calls).toEqual(["read songs/a.bmed", "write songs/b.bmed", "write songs/c.txt"]);
  });
  it("a high-risk write asks first; no means nothing is written; every use is journaled", async () => {
    const { vault, calls } = fakeVault();
    const asked: string[] = [], noted: string[] = [];
    let answer = true;
    const o: Origin = { source: "m", grants: new Grants(() => ["vault:read", "vault:write"]), gate: async (perm, target) => (asked.push(`${perm} ${target}`), answer ? undefined : Promise.reject(new Error("you said no"))), note: (perm, what) => void noted.push(`${perm} ${what}`) };
    const g = guardedVault(vault, o);
    await g.write("notes/a.md", "x");
    answer = false;
    await expect(g.write("notes/b.md", "x")).rejects.toThrow(/you said no/);
    await g.read("notes/a.md");
    expect(asked).toEqual(["vault:write notes/a.md", "vault:write notes/b.md"]);
    expect(calls).toEqual(["write notes/a.md", "read notes/a.md"]);
    expect(noted).toEqual(["vault:write notes/a.md", "vault:read notes/a.md"]);
  });
  it("a module that ships with the deck: everything, its own data too — minus what you took away", async () => {
    const { vault, calls } = fakeVault();
    const off: string[] = [];
    const o: Origin = { source: "todo", grants: new Grants(() => off, true) };
    expect(trusted(o)).toBe(true);
    const g = guardedVault(vault, o);
    await g.write(".icebreaker/plugin-data/todo.json", "{}");
    off.push("vault:write");
    await expect(g.write("notes/a.md", "x")).rejects.toThrow(/vault:write/);
    expect(allows(o, "shell")).toBe(true);
    expect(calls).toEqual(["write .icebreaker/plugin-data/todo.json"]);
    // a STORE / vault module isn't one of the deck's own, whatever it holds
    expect(trusted({ source: "x", grants: new Grants(() => ["terminal"]) })).toBe(false);
    expect(trusted({ source: "terminal", grants: "all" })).toBe(true);
  });
});

describe("the access journal (core/access.ts)", () => {
  it("keeps who, which permission, on what — the same thing once, and the last use", () => {
    const log = new AccessLog(null);
    const seen: string[] = [];
    log.onAdd = (a) => seen.push(`${a.who} ${a.perm} ${a.what}`);
    log.note("med", "vault:write", "songs/a.bmed");
    log.note("med", "vault:write", "songs/a.bmed");
    log.note("med", "vault:read", "songs/a.bmed");
    log.note("ai", "vault:read", "notes/ideas.md");
    expect(seen).toEqual(["med vault:write songs/a.bmed", "med vault:read songs/a.bmed", "ai vault:read notes/ideas.md"]);
    expect(log.lastUse("med", "vault:write")).toBeTypeOf("number");
    expect(log.lastUse("med", "ai")).toBeUndefined();
    expect(log.of("med").map((a) => a.perm)).toEqual(["vault:read", "vault:write"]);
    log.clear("med");
    expect(log.list.length).toBe(1);
    expect(log.lastUse("med", "vault:write")).toBeUndefined();
  });
  it("names only, of a sane length, no control characters", () => {
    const log = new AccessLog(null);
    log.note("m", "net", `api.example.com\n\u0007${"x".repeat(500)}`);
    expect(log.list[0].what.length).toBe(160);
    expect(log.list[0].what).not.toMatch(/[\u0000-\u001f]/);
  });
  it("an encrypted vault: access.json never gets a note's name (it's outside the vault)", async () => {
    const files: Record<string, string> = {};
    const platform = { config: { read: async (n: string) => files[n] ?? null, write: async (n: string, c: string) => void (files[n] = c) } } as never;
    vi.useFakeTimers();
    try {
      const log = new AccessLog(platform, async () => true);
      await log.load();
      log.note("med", "vault:write", "secret/plans.md");
      log.note("ai", "vault:read", "diary/2026-11-24.md");
      log.note("med", "net", "api.example.com");
      await vi.advanceTimersByTimeAsync(2500);
      expect(files["access.json"]).toBeDefined();
      expect(files["access.json"]).not.toContain("plans.md");
      expect(files["access.json"]).not.toContain("diary");
      // who and when stay; a host isn't a note
      expect(files["access.json"]).toContain("vault:write");
      expect(files["access.json"]).toContain("api.example.com");
      // the names stay in memory for the LOG and Settings
      expect(log.list.map((a) => a.what)).toContain("secret/plans.md");
      // a plain vault keeps them
      expect(JSON.stringify(AccessLog.forDisk(log.list, false))).toContain("plans.md");
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("what the AI may read by itself (ai/tools.ts)", () => {
  const notes = ["notes/ideas.md", "notes/reading-list.md", "journal/2026-11-21.md", "n.md", ".icebreaker/context.md"];
  const read: string[] = [];
  const vault = { markdown: () => notes.map((path) => ({ path })), read: async (p: string) => (read.push(p), `text of ${p}`), readMany: async (ps: string[]) => ps.map((p) => `text of ${p}`), exists: async () => true } as unknown as Vault;
  const tool = (level: "nothing" | "given" | "all", given: string[] = [], seen: string[] = []) => {
    const tools = vaultTools(vault, async () => true, { level: () => level, given: () => given, onRead: (p) => void seen.push(p) });
    return (name: string, input: Record<string, unknown>) => tools.find((x) => x.name === name)!.run(input);
  };
  it("the notes you gave: named by path or by name (three letters at least, a whole word), or in front", () => {
    expect(givenNotes(vault, ["summarize ideas please"])).toEqual(["notes/ideas.md"]);
    expect(givenNotes(vault, ["what's in notes/reading-list.md?"])).toEqual(["notes/reading-list.md"]);
    // "n" is too short a name; "idea" isn't the word "ideas"; the deck's own folder never
    expect(givenNotes(vault, ["n", "an idea about context"])).toEqual([]);
    expect(givenNotes(vault, [], "journal/2026-11-21.md")).toEqual(["journal/2026-11-21.md"]);
  });
  it("nothing: no list, no search, no read", async () => {
    const run = tool("nothing");
    for (const [name, input] of [["list_notes", {}], ["search_notes", { query: "x" }], ["read_note", { path: "notes/ideas.md" }]] as const) expect(await run(name, input)).toMatch(/hasn't allowed/);
  });
  it("given: only those notes are listed, searched and read", async () => {
    const seen: string[] = [];
    const run = tool("given", ["notes/ideas.md"], seen);
    expect(await run("list_notes", {})).toBe("notes/ideas.md");
    expect(await run("read_note", { path: "notes/ideas.md" })).toBe("text of notes/ideas.md");
    expect(await run("read_note", { path: "journal/2026-11-21.md" })).toMatch(/hasn't given you/);
    expect(await run("search_notes", { query: "text" })).toBe("notes/ideas.md:1: text of notes/ideas.md");
    expect(seen).toEqual(["notes/ideas.md", "search in 1 given note"]);
  });
  it("all: the whole vault, and each read is told", async () => {
    const seen: string[] = [];
    const run = tool("all", [], seen);
    expect(String(await run("list_notes", {})).split("\n").length).toBe(notes.length);
    await run("read_note", { path: "journal/2026-11-21.md" });
    expect(seen).toEqual(["journal/2026-11-21.md"]);
  });
});

describe("the access journal doesn't flood", () => {
  it("a burst is the first names, then one line that counts", () => {
    const log = new AccessLog(null);
    for (let i = 0; i < 500; i++) log.note("med", "vault:read", `songs/${i}.bmed`);
    expect(log.list.length).toBe(13);
    expect(log.list[12].what).toBe("+488 more");
    // another permission, another module: their own count
    log.note("med", "vault:write", "songs/a.bmed");
    log.note("other", "vault:read", "notes/a.md");
    expect(log.list.length).toBe(15);
  });
});

describe("why a module is off, in a few words (plugins/host.ts)", () => {
  it("says what happened, short enough for the start screen", async () => {
    const { PluginHost } = await import("../src/plugins/host");
    expect(PluginHost.shortReason("its code changed since you approved it — the copy in the vault isn't the one you approved (…). Read it and switch it on again: plugin enable x (or the STORE)")).toBe("its code changed since you approved it");
    expect(PluginHost.shortReason("asks for more than you approved (Change your notes): plugin enable x")).toBe("asks for more than you approved");
    expect(PluginHost.shortReason("not approved on this deck yet: plugin enable x")).toBe("not approved here yet");
    expect(PluginHost.shortReason("needs todo ≥ 0.2.0")).toBe("needs todo ≥ 0.2.0");
  });
});
