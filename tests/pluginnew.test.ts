import { describe, expect, it } from "vitest";
import { PluginHost, starterManifest } from "../src/plugins/host";
import { readPerms } from "../src/plugins/permissions";

describe("plugin new (plugins/host.ts)", () => {
  it("scaffolds a module with today's permissions: only what it lists (Fable pass 24/11)", () => {
    const m = starterManifest("hello", "kid");
    expect(m.api).toBe(2);
    expect(PluginHost.legacy(m)).toBe(false);
    // read as the host reads it: nothing implied (no notify, no shell)
    expect(readPerms(m.permissions, PluginHost.legacy(m)).perms).toEqual(["vault:read"]);
  });
});
