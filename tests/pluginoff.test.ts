import { describe, expect, it } from "vitest";
import { PluginHost } from "../src/plugins/host";
import { deckCommands } from "../src/shell/commands/deck";
import type { PluginManifest } from "../src/plugins/api";
import type { Deck } from "../src/deck";

/** BreakerMED 0.13.1 over an approval that lacks songs/ writes: it stays off, asking for more */
function setup() {
  const m: PluginManifest = { id: "breakermed", name: "BreakerMED", version: "0.13.1", api: 2, permissions: ["vault:read:songs/", "vault:write:songs/"] };
  const logged: string[] = [];
  const deck = {
    settings: { data: { plugins: { enabled: ["breakermed"], disabled: [], granted: { breakermed: ["audio", "notify", "shell", "vault:read"] }, always: {}, revoked: {} } }, set() {} },
    log: { add: (_k: string, s: string) => void logged.push(s) },
    access: { lastUse: () => undefined, of: () => [] },
  } as unknown as Deck;
  const host = new PluginHost(deck);
  const error = "asks for more than you approved (Change your notes → songs/): plugin enable breakermed";
  host.list().push({ manifest: m, source: "vault", active: false, error } as never);
  (deck as unknown as { plugins: PluginHost }).plugins = host;
  host.reload = async () => {}; // (the files aren't there: what reload leaves is set above)
  return { host, deck, logged, error };
}

async function run(deck: Deck, args: string[]) {
  const out: string[] = [];
  const cmd = deckCommands.find((c) => c.name === "plugin")!;
  const code = await cmd.run({ deck, args, out: (s: string) => void out.push(s), err: (s: string) => void out.push(s), env: {}, isTTY: false } as never);
  return { code, text: out.join("").replace(/\x1b\[[0-9;]*m/g, "") };
}

describe("a module you switched on that stays off (Windows bench 24/11)", () => {
  it("plugin reload says which and why, with what to type", async () => {
    const { deck, error } = setup();
    const { code, text } = await run(deck, ["reload"]);
    expect(text).toContain("0 plugins active");
    expect(text).toContain(`off breakermed: ${error}`);
    expect(code).toBe(1);
  });

  it("plugin info tells what it is, its state and why, what it asks and what you approved", async () => {
    const { deck } = setup();
    const { code, text } = await run(deck, ["info", "breakermed"]);
    expect(code).toBe(0);
    expect(text).toContain("v0.13.1");
    expect(text).toContain("asks for more than you approved");
    expect(text).toMatch(/asks for\s+.*songs\//);
    expect(text).toMatch(/approved\s+.*Play sound/);
    expect((await run(deck, ["info", "nope"])).code).toBe(1);
  });

  it("plugin perms says why it's off", async () => {
    const { deck } = setup();
    expect((await run(deck, ["perms", "breakermed"])).text).toContain("asks for more than you approved");
  });

  it("offReasons lists only what you switched on", () => {
    const { host, error } = setup();
    expect(host.offReasons()).toEqual([{ id: "breakermed", error }]);
    (host.list()[0] as { error?: string }).error = undefined;
    expect(host.offReasons()).toEqual([]);
  });
});
