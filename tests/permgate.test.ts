import { describe, expect, it } from "vitest";
import { PluginHost } from "../src/plugins/host";
import type { PluginManifest } from "../src/plugins/api";
import type { Deck } from "../src/deck";
import type { PermDialogSpec } from "../src/workspace/permdialog";

/** a host with one vault module allowed to write in safe/, and the questions it asks */
function setup() {
  const m: PluginManifest = { id: "mod", name: "Mod", version: "1.0.0", api: 2, permissions: ["vault:write:safe/"] };
  const asked: { spec: PermDialogSpec; answer: (v: string) => void }[] = [];
  const deck = {
    settings: { data: { plugins: { granted: { mod: ["vault:write:safe/"] }, always: {}, revoked: {} } }, set() {} },
    askPermission: (spec: PermDialogSpec) => new Promise<string>((answer) => asked.push({ spec, answer })),
  } as unknown as Deck;
  const host = new PluginHost(deck);
  host.list().push({ manifest: m, source: "vault", active: true } as never);
  return { host, m, asked };
}
const tick = () => new Promise((r) => setTimeout(r, 0));

describe("a high-risk permission's question (plugins/host.ts gate)", () => {
  it("\"this time\" covers the file it showed, not the next one (Fable pass 24/11)", async () => {
    const { host, m, asked } = setup();
    const a = host.gate(m, "vault:write", "safe/a.md");
    await tick();
    expect(asked.length).toBe(1);
    asked[0].answer("once");
    await a;
    // the same file again: no question
    await host.gate(m, "vault:write", "safe/a.md");
    expect(asked.length).toBe(1);
    // another file: asked
    const b = host.gate(m, "vault:write", "safe/b.md");
    await tick();
    expect(asked.length).toBe(2);
    expect(asked[1].spec.heading).toContain("safe/b.md");
    asked[1].answer("no");
    await expect(b).rejects.toThrow();
  });

  it("questions asked at once come one after the other, each about its own file", async () => {
    const { host, m, asked } = setup();
    const c = host.gate(m, "vault:write", "safe/c.md");
    const d = host.gate(m, "vault:write", "safe/d.md");
    await tick();
    expect(asked.length).toBe(1); // one on screen
    expect(asked[0].spec.heading).toContain("safe/c.md");
    asked[0].answer("once");
    await c;
    await tick();
    expect(asked.length).toBe(2);
    expect(asked[1].spec.heading).toContain("safe/d.md");
    asked[1].answer("once");
    await d;
  });
});
