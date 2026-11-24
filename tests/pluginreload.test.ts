import { describe, expect, it } from "vitest";
import { PluginHost, withinManifest } from "../src/plugins/host";
import type { PluginManifest } from "../src/plugins/api";
import type { Deck } from "../src/deck";

/** BreakerMED 0.1.0 approved with the whole vault and "always" — then 0.13.1 copied over it, asking only for songs/ */
function setup() {
  const m: PluginManifest = { id: "med", name: "Med", version: "0.13.1", api: 2, permissions: ["vault:read:songs/", "vault:write:songs/"] };
  const data = { plugins: { granted: { med: ["audio", "notify", "shell", "vault:read", "vault:write"] }, always: { med: ["vault:write"] }, revoked: {}, pinned: { med: "old" } } } as Record<string, unknown>;
  let asked = 0;
  const deck = {
    settings: {
      data,
      set(path: string, v: unknown) {
        (data.plugins as Record<string, unknown>)[path.split(".")[1]] = v;
      },
    },
    vault: { read: async () => "// new code" },
    askPermission: async () => (asked++, "once"),
  } as unknown as Deck;
  const host = new PluginHost(deck);
  const p = { manifest: m, source: "vault", active: false } as never;
  host.list().push(p);
  return { host, m, p, data, asked: () => asked };
}

describe("a changed copy of a module (plugins/host.ts, Fable bench 24/11)", () => {
  it("never runs with more than its plugin.json asks for", async () => {
    const { host, m, asked } = setup();
    expect(host.effective("med")).toEqual(["vault:read:songs/", "vault:write:songs/"]);
    // the vault's root: refused; songs/: still asked, the old "always vault:write" doesn't cover it
    await host.gate(m, "vault:write", "songs/a.wav");
    expect(asked()).toBe(1);
  });

  it("plugin reload approves it from its own plugin.json: grants cut, nothing \"always\"", async () => {
    const { host, p, data } = setup();
    // (sameCode with trustChanges: what `plugin reload` does for a changed copy)
    expect(await (host as unknown as { sameCode(p: unknown, t: boolean): Promise<boolean> }).sameCode(p, true)).toBe(true);
    const plugins = data.plugins as { granted: Record<string, string[]>; always: Record<string, string[]>; pinned: Record<string, string> };
    expect(plugins.granted.med).toEqual(["vault:read:songs/", "vault:write:songs/"]);
    expect(plugins.always.med).toBeUndefined();
    expect(plugins.pinned.med).not.toBe("old");
  });

  it("withinManifest keeps what it asks for and you approved", () => {
    expect(withinManifest(["vault:write"], ["vault:write:songs/", "net:api.x.com"])).toEqual(["vault:write:songs/"]);
    expect(withinManifest(["vault:read:songs/"], ["vault:read"])).toEqual([]);
  });
});
