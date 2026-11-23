import { describe, expect, it } from "vitest";
import { helpList, HELP_START } from "../src/shell/help";
import type { Command } from "../src/shell/types";

const cmd = (name: string, source?: string, more: Partial<Command> = {}): Command => ({ name, summary: `${name} things`, source, run: () => 0, ...more });
const all = [cmd("note"), cmd("ls"), cmd("todo", "todo"), cmd("view", undefined, { hidden: true }), cmd("frame"), cmd("zzz")];
const plain = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, "");

describe("help: short by default (B4), every command with `help all`", () => {
  it("help: a dozen commands to start, then how to see more", () => {
    const out = plain(helpList(all, [], false));
    expect(out).toContain("note");
    expect(out).toContain("help all");
    expect(out).not.toContain("zzz");
    expect(out.split("\n").length).toBeLessThan(HELP_START.length + 10);
  });
  it("help all: grouped, lowercase headers, « module » not « PLUGIN », hidden aliases left out (E1)", () => {
    const out = plain(helpList(all, ["all"], false));
    expect(out).toContain("zzz");
    expect(out).toContain("module: todo");
    expect(out).not.toMatch(/PLUGIN|CORE/);
    expect(out).not.toMatch(/^\s+view\b/m);
  });
  it("help <module>: that module's commands", () => {
    const out = plain(helpList(all, ["todo"], false));
    expect(out).toContain("todo");
    expect(out).not.toContain("zzz");
  });
});
