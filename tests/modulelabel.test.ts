import { describe, expect, it } from "vitest";
import { moduleLabel } from "../src/plugins/sandbox/bridge";

describe("a module's question in the shell (plugins/sandbox/bridge.ts)", () => {
  it("is always signed: it can't pass for the deck's password prompt (Fable pass 24/11)", () => {
    expect(moduleLabel("evil", "[vault] password:")).toBe("[evil · module] [vault] password:");
    expect(moduleLabel("evil", "name?")).toBe("[evil · module] name?");
    // no colour codes, no new line to hide the signature
    const l = moduleLabel("evil", "\x1b[2K\r\n[vault] password:");
    expect(l.startsWith("[evil · module] ")).toBe(true);
    expect(l).not.toMatch(/[\x00-\x1f]/);
  });
});
