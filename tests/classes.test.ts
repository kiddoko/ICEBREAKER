import { describe, expect, it } from "vitest";
import { classOf, COMMAND_CLASS, NOTE_COMMANDS } from "../src/shell/classes";
import { isPrivileged } from "../src/shell/privileged";
import { fileCommands } from "../src/shell/commands/files";
import { systemCommands } from "../src/shell/commands/system";
import { deckCommands } from "../src/shell/commands/deck";
import { shortcutCommands } from "../src/apps/shortcuts";
import { scriptCommand } from "../src/shell/commands/scripts";
import { pinCommand, unpinCommand } from "../src/workspace/favorites";
import { iconCommand, tagCommand } from "../src/shell/commands/marks";
import { trashCommand } from "../src/shell/commands/trash";
import { weatherCommand } from "../src/apps/weather";
import { startHereCommand } from "../src/vault/starthere";
import { storeCommand } from "../src/apps/store";
import { updateCommand } from "../src/shell/commands/update";
import { devCommands } from "../src/shell/commands/dev";
import { CORE_PACKAGES } from "../src/plugins/core-packages";

/** every command the deck itself registers (deck.ts registerCore, the developer tools) */
const CORE = [...fileCommands, ...systemCommands, ...deckCommands, storeCommand, updateCommand, ...shortcutCommands, scriptCommand, pinCommand, unpinCommand, tagCommand, iconCommand, trashCommand, weatherCommand, startHereCommand, ...devCommands];

describe("every command of the deck is classed for modules (shell/classes.ts)", () => {
  it("a new command must be classed before it ships: open, mixed, notify, ai, online or yours", () => {
    // (a command that isn't here is refused to a STORE / vault module: say what it is, on purpose)
    const unclassed = CORE.map((c) => c.name).filter((n) => !classOf(n));
    expect(unclassed, `class these in src/shell/classes.ts: ${unclassed.join(", ")}`).toEqual([]);
  });
  it("the commands packaged as modules are the deck's own too", () => {
    const names = CORE_PACKAGES.flatMap((p) => p.commands ?? []);
    expect(names.filter((n) => !classOf(n))).toEqual([]);
  });
  it("nothing is classed that doesn't exist (a renamed command leaves no open door)", () => {
    const known = new Set(CORE.map((c) => c.name));
    expect(Object.keys(COMMAND_CLASS).filter((n) => !known.has(n))).toEqual([]);
    expect([...NOTE_COMMANDS].filter((n) => !known.has(n))).toEqual([]);
  });
  it("what only you may do is never open", () => {
    for (const n of ["logout", "account", "script", "bind", "unbind", "pin", "undo", "redo", "exit", "reboot", "frame", "factory-reset", "history", "env", "export", "log", "cd", "clear"]) expect(classOf(n), n).toBe("yours");
    for (const n of ["weather", "news"]) expect(classOf(n), n).toBe("online");
    for (const n of ["ask", "chat"]) expect(classOf(n), n).toBe("ai");
    // a "mixed" command has its yours-only sub-commands in shell/privileged.ts
    for (const n of Object.keys(COMMAND_CLASS).filter((x) => COMMAND_CLASS[x] === "mixed")) expect(typeof isPrivileged(n, []), n).toBe("boolean");
    expect(isPrivileged("term", ["close"])).toBe(true);
    expect(isPrivileged("term", ["--x", "restart"])).toBe(true);
    expect(isPrivileged("term", ["max"])).toBe(false);
    expect(isPrivileged("plugin", ["revoke", "todo", "vault:write"])).toBe(true);
    expect(isPrivileged("plugin", ["grant", "x", "terminal"])).toBe(true);
    expect(isPrivileged("plugin", ["perms"])).toBe(true);
    expect(isPrivileged("config", ["set", "ai.reads", "all"])).toBe(true);
    expect(isPrivileged("config", ["set", "shell.bridge", "more"])).toBe(true);
    expect(isPrivileged("config", ["set", "plugins.revoked", "{}"])).toBe(true);
  });
  it("limited to your notes, your real terminal runs note commands only", () => {
    for (const n of ["ls", "cat", "open", "note", "grep", "mv", "rm"]) expect(NOTE_COMMANDS.has(n), n).toBe(true);
    for (const n of ["timer", "clock", "theme", "layout", "launch", "weather"]) expect(NOTE_COMMANDS.has(n), n).toBe(false);
  });
});
