import { describe, expect, it } from "vitest";
import { allows, guardedVault, type Origin } from "../src/shell/origin";
import { ServiceRegistry, type Caller } from "../src/plugins/services";
import { foldName, isDeckPath } from "../src/vault/paths";
import { isOfficialSource, isVerified, OFFICIAL_INDEX } from "../src/plugins/install";
import type { Vault } from "../src/vault/vault";
import type { Permission } from "../src/plugins/api";

/** a vault that only remembers what was asked of it */
function fakeVault() {
  const calls: string[] = [];
  const rec = (name: string) => (...a: unknown[]) => (calls.push(`${name} ${a.join(" ")}`), Promise.resolve(name === "read" ? "text" : undefined));
  const v = { read: rec("read"), readMany: rec("readMany"), write: rec("write"), append: rec("append"), mkdir: rec("mkdir"), trash: rec("trash"), rename: rec("rename"), restore: rec("restore"), mount: rec("mount"), exists: rec("exists"), entries: [{ path: "a.md" }] };
  return { vault: v as unknown as Vault, calls };
}
const origin = (...p: Permission[]): Origin => ({ source: "evil", grants: new Set(p) });

describe("a module's line reads and writes only what its permissions allow (shell/origin.ts)", () => {
  it("no permission: no note read, none written", async () => {
    const { vault, calls } = fakeVault();
    const g = guardedVault(vault, origin());
    await expect(g.read("journal/x.md")).rejects.toThrow(/vault:read/);
    await expect(g.readMany(["a.md"])).rejects.toThrow(/vault:read/);
    await expect(g.write("notes/a.md", "x")).rejects.toThrow(/vault:write/);
    await expect(g.trash("notes/a.md")).rejects.toThrow(/vault:write/);
    await expect(g.rename("a.md", "b.md")).rejects.toThrow(/vault:write/);
    expect(calls).toEqual([]);
    // the index (names) and exists stay: `ls` shows them to YOU, the module can't capture it
    expect(g.entries.length).toBe(1);
  });
  it("vault:write never reaches the deck's own folder, however it's written", async () => {
    const { vault, calls } = fakeVault();
    const g = guardedVault(vault, origin("vault:read", "vault:write"));
    await g.write("notes/a.md", "x");
    for (const p of [".icebreaker/plugins/other/main.js", ".ICEBREAKER/scripts/x.sh", "/.icebreaker/themes/t.toml", ".Icebreaker./x", "notes/../.icebreaker/x", "ICEBRE~1/x"]) {
      await expect(g.write(p, "x"), p).rejects.toThrow(/deck's own folder/);
      await expect(g.rename("notes/a.md", p), p).rejects.toThrow(/deck's own folder/);
    }
    await expect(g.trash(".icebreaker")).rejects.toThrow(/deck's own folder/);
    // nor read there: other modules' data and code, the shell's history
    await expect(g.read(".icebreaker/plugin-data/todo.json")).rejects.toThrow(/deck's own folder/);
    await expect(g.readMany(["notes/a.md", ".ICEBREAKER/history"])).rejects.toThrow(/deck's own folder/);
    expect(calls).toEqual(["write notes/a.md x"]);
  });
  it("never mounts, with any permission", async () => {
    const g = guardedVault(fakeVault().vault, origin("vault:read", "vault:write"));
    await expect(g.mount("/tmp")).rejects.toThrow();
  });
  it("built-in modules and your terminal keep the whole vault", () => {
    const { vault } = fakeVault();
    expect(guardedVault(vault, { source: "todo", grants: "all" })).toBe(vault);
    expect(allows({ source: "terminal", grants: "all" }, "ai")).toBe(true);
    expect(allows(origin(), "ai")).toBe(false);
    expect(allows(null, "ai")).toBe(true);
  });
});

describe("names as a disk reads them (vault/paths.ts)", () => {
  it("folds capitals, trailing dots and spaces, streams and invisible characters", () => {
    for (const n of [".ICEBREAKER", ".Icebreaker", ".icebreaker.", ".icebreaker ", ".icebreaker::$DATA", ".ice\u200cbreaker"]) expect(foldName(n), n).toBe(".icebreaker");
  });
  it("knows the deck's own folder under any spelling", () => {
    for (const p of [".icebreaker", ".icebreaker/x", "/.ICEBREAKER/x", "a/../.icebreaker/x", ".icebreaker./x", "ICEBRE~1/x", "./.icebreaker/x"]) expect(isDeckPath(p), p).toBe(true);
    for (const p of ["notes/.icebreaker/x", "icebreaker/x", ".icebreaker2/x", "notes/a.md", ""]) expect(isDeckPath(p), p).toBe(false);
  });
});

describe("functions modules call (plugins/services.ts)", () => {
  it("a function that runs a line is called for its caller, not as you", async () => {
    const reg = new ServiceRegistry();
    const seen: string[] = [];
    reg.expose("shell", "run", { fn: () => seen.push("as you"), by: (c: Caller) => () => seen.push(c.origin ? `as ${c.origin.source}` : "as you") });
    await reg.call({ id: "evil", permissions: new Set(), origin: origin() }, "shell", "run", ["script x"]);
    await reg.call({ id: "core", permissions: "all" }, "shell", "run", ["script x"]);
    expect(seen).toEqual(["as evil", "as you"]);
  });
  it("a function that needs a permission refuses a caller without it", async () => {
    const reg = new ServiceRegistry();
    reg.expose("todo", "list", { needs: "vault:read", fn: () => ["milk"] });
    await expect(reg.call({ id: "evil", permissions: new Set() }, "todo", "list", [])).rejects.toThrow(/vault:read/);
    expect(await reg.call({ id: "ok", permissions: new Set<Permission>(["vault:read"]) }, "todo", "list", [])).toEqual(["milk"]);
  });
});

describe("what counts as the official STORE (plugins/install.ts)", () => {
  it("is decided on the address the download uses", () => {
    expect(isOfficialSource("kiddoko/icebreaker-modules/modules/todo-plus")).toBe(true);
    expect(isOfficialSource("https://github.com/kiddoko/icebreaker-modules/tree/main/modules/x")).toBe(true);
    for (const s of ["https://evil.example/github.com/kiddoko/icebreaker-modules/", "kiddoko/icebreaker-modules-evil/x", "evil/kiddoko/icebreaker-modules/x", "kiddoko/icebreaker-modules/tree/someone-branch/modules/x", "https://raw.githubusercontent.com/kiddoko/icebreaker-modules/main/../../evil/repo/main/"]) expect(isOfficialSource(s), s).toBe(false);
    expect(isVerified({ index: OFFICIAL_INDEX, repo: "kiddoko/icebreaker-modules/modules/x" })).toBe(true);
    expect(isVerified({ index: "https://evil.example/index.json", repo: "kiddoko/icebreaker-modules/modules/x" })).toBe(false);
  });
});
