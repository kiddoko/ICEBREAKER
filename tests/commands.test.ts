import { describe, expect, it } from "vitest";
import { CommandRegistry, type Command } from "../src/shell/types";

const cmd = (name: string, source?: string): Command => ({ name, summary: source ?? "core", source, run: () => 0 });

describe("the command registry", () => {
  it("gives a hidden command back when the module that hid it goes", () => {
    const r = new CommandRegistry();
    r.register(cmd("cal"));
    r.register(cmd("cal", "calendar"));
    expect(r.get("cal")?.source).toBe("calendar");
    r.unregisterSource("calendar");
    expect(r.get("cal")?.summary).toBe("core");
  });
  it("removes a module's own commands", () => {
    const r = new CommandRegistry();
    r.register(cmd("todo", "todo"));
    r.unregisterSource("todo");
    expect(r.get("todo")).toBeUndefined();
  });
});
