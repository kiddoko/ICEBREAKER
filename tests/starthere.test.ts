import { describe, expect, it } from "vitest";
import { START_HERE, syncStartHere, forThisOS } from "../src/vault/starthere";
import type { Vault } from "../src/vault/vault";

/** a vault in memory: just what the docs need */
function memVault(files: Record<string, string> = {}) {
  const f = { ...files };
  const v = {
    files: f,
    exists: async (p: string) => p in f,
    read: async (p: string) => f[p] ?? "",
    write: async (p: string, t: string) => void (f[p] = t),
    mkdir: async () => {},
  };
  return v as unknown as Vault & { files: Record<string, string> };
}
const readme = "START HERE/README.md";

describe("the docs in the vault", () => {
  it("are written into a new vault", async () => {
    const v = memVault();
    const r = await syncStartHere(v);
    expect(r.written).toBe(Object.keys(START_HERE).length);
    expect(v.files[readme]).toBe(forThisOS(START_HERE["README.md"]));
  });
  it("are updated when untouched, kept when you edited them, not brought back when deleted", async () => {
    const v = memVault();
    await syncStartHere(v);
    // the deck's text changed in a new version: simulate with an old copy on disk + its stamp
    v.files[readme] = "old version";
    const stamps = JSON.parse(v.files[".icebreaker/starthere.json"]);
    let h = 2166136261;
    for (let i = 0; i < "old version".length; i++) h = Math.imul(h ^ "old version".charCodeAt(i), 16777619);
    stamps[readme] = (h >>> 0).toString(36);
    v.files[".icebreaker/starthere.json"] = JSON.stringify(stamps);
    expect((await syncStartHere(v)).written).toBe(1);
    expect(v.files[readme]).toBe(forThisOS(START_HERE["README.md"]));
    // you edit it: it stays yours
    v.files[readme] += "\nmy own line";
    const r = await syncStartHere(v);
    expect(r.yours).toContain(readme);
    expect(v.files[readme]).toContain("my own line");
    // you delete one: it stays deleted
    delete v.files["START HERE/ai.md"];
    await syncStartHere(v);
    expect("START HERE/ai.md" in v.files).toBe(false);
  });
});
