import { describe, expect, it } from "vitest";
import { isPrivileged, PRIVILEGED_NAMES } from "../src/shell/privileged";
import { keepUnknown } from "../src/core/settings";
import { keepInHistory } from "../src/shell/shell";

describe("what modules may never do", () => {
  it("refuses the vault's encryption, place and accounts", () => {
    for (const sub of ["encrypt", "decrypt", "export", "recovery", "rekey", "unlock", "adopt", "mount", "move"]) expect(isPrivileged("vault", [sub])).toBe(true);
    expect(isPrivileged("vault", ["--window", "decrypt"])).toBe(true);
    expect(isPrivileged("account", [])).toBe(true);
    expect(isPrivileged("factory-reset", [])).toBe(true);
    expect(isPrivileged("plugin", ["install", "x/y"])).toBe(true);
    expect(isPrivileged("config", ["set", "plugins.registry", "https://evil"])).toBe(true);
    // what would run a program, or plant a command you'd run later
    expect(isPrivileged("script", ["evil"])).toBe(true);
    expect(isPrivileged("factory-reset", ["--yes"])).toBe(true);
    expect(isPrivileged("bind", ["ctrl+s", "factory-reset --yes"])).toBe(true);
    expect(isPrivileged("macro", ["add", "notes", "factory-reset --yes"])).toBe(true);
    expect(isPrivileged("config", ["set", "keys.ctrl+s", "x"])).toBe(true);
  });
  it("refuses the settings a module could turn into code or a leak (Fable pass 24/11)", () => {
    // the voice name reached PowerShell; the others run, or send, things
    for (const k of ["voice.name", "voice.engine", "shell.macros", "ai.ollamaHost", "ai.reads", "updates.endpoint"]) {
      expect(isPrivileged("config", ["set", k, "x"]), k).toBe(true);
      expect(isPrivileged("config", ["reset", k]), k).toBe(true);
    }
    for (const sub of ["use", "engine", "language", "lang", "install"]) expect(isPrivileged("voice", [sub, "x"]), sub).toBe(true);
    expect(isPrivileged("voice", ["say", "hi"])).toBe(false);
    expect(isPrivileged("voice", ["stop"])).toBe(false);
    expect(isPrivileged("voice", ["list"])).toBe(false);
  });
  it("lets modules do their usual things", () => {
    expect(isPrivileged("vault", [])).toBe(false);
    expect(isPrivileged("vault", ["status"])).toBe(false);
    expect(isPrivileged("todo", ["add", "milk"])).toBe(false);
    expect(isPrivileged("config", ["set", "appearance.theme", "x"])).toBe(false);
    expect(isPrivileged("config", ["get", "keys"])).toBe(false);
    expect(isPrivileged("plugin", ["list"])).toBe(false);
    expect(isPrivileged("macro", ["show"])).toBe(false);
    expect(isPrivileged("home", ["add", "clock"])).toBe(false);
    expect(isPrivileged("menu", [])).toBe(false);
    expect(isPrivileged("stealth", ["on"])).toBe(false);
    expect(isPrivileged("theme", ["set", "e-ink"])).toBe(false);
    expect(isPrivileged("open", ["notes/a.md"])).toBe(false);
  });
  it("refuses every way round: a function with every permission, a planted key, a square, your macros", () => {
    // `modules call shell run "…"` ran anything as you (found in the 2026-11-20 review)
    expect(isPrivileged("modules", ["call", "shell", "run", "script x"])).toBe(true);
    expect(isPrivileged("modules", ["set", "todo", "x", "y"])).toBe(true);
    expect(isPrivileged("modules", ["api"])).toBe(false);
    // `menu add` is `bind` under another name; `keys set` moves the deck's own shortcuts
    expect(isPrivileged("menu", ["add", "k", "script x"])).toBe(true);
    expect(isPrivileged("menu", ["rm", "k"])).toBe(true);
    expect(isPrivileged("keys", ["set", "home", "ctrl+h"])).toBe(true);
    expect(isPrivileged("home", ["link", "add", "x", "script x"])).toBe(true);
    expect(isPrivileged("pin", ["command", "script x"])).toBe(true);
    // a macro types in your real terminal
    expect(isPrivileged("macro", ["run", "deploy"])).toBe(true);
    // settings that hold commands or say where things are, a whole section too
    for (const k of ["vault.path", "home.links", "favorites", "gamepad.wheel", "shell.macros", "KEYS.ctrl+s", "menu", "moduleSettings.todo.x"]) expect(isPrivileged("config", ["set", k, "x"])).toBe(true);
    expect(isPrivileged("config", ["reset", "keys"])).toBe(true);
    expect(isPrivileged("config", ["key"])).toBe(true);
    expect(isPrivileged("config", ["--window", "set", "keys.x", "y"])).toBe(true);
    // modules: switching others off, removing, reloading
    for (const sub of ["disable", "enable", "reload", "new", "remove", "update", "install"]) expect(isPrivileged("plugin", [sub, "todo"])).toBe(true);
    // the deck itself
    // `exit` quits the app (0.5.2): never a module's, alias `quit` included, flags or not
    for (const n of ["exit", "quit", "reboot", "logout", "starthere", "undo", "redo"]) expect(isPrivileged(n, [])).toBe(true);
    expect(isPrivileged("exit", ["--quit"])).toBe(true);
    expect(PRIVILEGED_NAMES.has("exit") && PRIVILEGED_NAMES.has("quit")).toBe(true);
    expect(isPrivileged("stealth", ["off"])).toBe(true);
    expect(isPrivileged("theme", ["install", "x/y"])).toBe(true);
    expect(isPrivileged("voice", ["install", "fr"])).toBe(true);
    // the encoder pack: a downloaded program — looking is fine, installing or removing is yours
    expect(isPrivileged("encoders", ["install"])).toBe(true);
    expect(isPrivileged("encoders", ["remove"])).toBe(true);
    expect(isPrivileged("encoders", ["--x", "install"])).toBe(true);
    expect(isPrivileged("encoders", [])).toBe(false);
    expect(isPrivileged("encoders", ["status"])).toBe(false);
    expect(PRIVILEGED_NAMES.has("encoders")).toBe(true);
    expect(isPrivileged("vault", ["anything-new"])).toBe(true);
    // a flag in front never makes the check and the command read different words
    expect(isPrivileged("macro", ["--x", "run", "deploy"])).toBe(true);
    expect(isPrivileged("config", ["set", "--x", "keys.y", "z"])).toBe(true);
    expect(isPrivileged("config", ["set", "appearance.theme", "keys.y"])).toBe(false);
    expect(isPrivileged("home", ["--x", "link", "add", "a", "b"])).toBe(true);
    expect(isPrivileged("home", ["links"])).toBe(true);
  });
  it("keeps the sensitive names for the deck", () => {
    for (const n of ["vault", "account", "factory-reset", "plugin", "lock"]) expect(PRIVILEGED_NAMES.has(n)).toBe(true);
  });
  it("settings: keeps keys a newer version wrote, not deleted record entries", () => {
    const out = keepUnknown({ future: 1, keys: { a: "x" } }, { keys: {} } as Record<string, unknown>);
    expect(out.future).toBe(1);
    expect(out.keys).toEqual({});
  });
  it("the shell history keeps no secret", () => {
    expect(keepInHistory("todo add milk")).toBe(true);
    expect(keepInHistory(" todo add secret plan")).toBe(false);
    expect(keepInHistory("curl -H 'x-api-key: sk-ant-abcdefgh123456'")).toBe(false);
    expect(keepInHistory("export GITHUB=ghp_abcdefghijkl")).toBe(false);
    expect(keepInHistory("login password=hunter2")).toBe(false);
    expect(keepInHistory("grep password notes")).toBe(true);
  });
  it("installing, removing and updating modules or ICEBREAKER stays yours", () => {
    for (const sub of ["install", "remove", "update", "sources"]) expect(isPrivileged("store", [sub, "x"])).toBe(true);
    expect(isPrivileged("store", ["search", "x"])).toBe(false);
    expect(isPrivileged("store", ["info", "x"])).toBe(false);
    for (const sub of ["install", "download", "modules"]) expect(isPrivileged("update", [sub])).toBe(true);
    expect(isPrivileged("update", [])).toBe(false);
    expect(isPrivileged("config", ["set", "updates.endpoint", "https://evil"])).toBe(true);
  });
});

describe("0.6: the screen and your alarms are yours (Fable's review)", () => {
  it("refuses rearranging the screen to a module, lets it look", () => {
    expect(isPrivileged("layout", [])).toBe(false);
    expect(isPrivileged("layout", ["presets"])).toBe(false);
    expect(isPrivileged("layout", ["preset", "shell-right"])).toBe(true);
    expect(isPrivileged("layout", ["reset"])).toBe(true);
    expect(isPrivileged("frame", ["fold", "tree"])).toBe(true);
    expect(isPrivileged("frame", ["move", "shell", "top"])).toBe(true);
    expect(isPrivileged("config", ["set", "layout.version", "7"])).toBe(true);
  });
  it("lets a module switch tabs, not move or group them", () => {
    expect(isPrivileged("tab", ["3"])).toBe(false);
    expect(isPrivileged("tab", ["next"])).toBe(false);
    for (const sub of ["move", "group", "ungroup", "groupname"]) expect(isPrivileged("tab", [sub, "2", "shell"])).toBe(true);
    expect(isPrivileged("tab", ["--x", "move", "2", "shell"])).toBe(true);
  });
  it("lets a module list your alarms, never set, remove, snooze or ring one", () => {
    expect(isPrivileged("clock", ["alarm"])).toBe(false);
    expect(isPrivileged("clock", ["alarm", "list"])).toBe(false);
    expect(isPrivileged("clock", ["style", "next"])).toBe(false);
    for (const sub of ["7:30", "rm", "off", "on", "snooze", "stop", "test"]) expect(isPrivileged("clock", ["alarm", sub])).toBe(true);
    expect(isPrivileged("clock", ["alarms", "rm", "1"])).toBe(true);
  });
});

describe("0.6: your real terminal may set an alarm (Main's decision, R2)", () => {
  it("sets one from the real terminal, nothing else; a module can't", () => {
    expect(isPrivileged("clock", ["alarm", "7:30", "wake", "up"], "terminal")).toBe(false);
    expect(isPrivileged("clock", ["alarm", "--days", "mon-fri", "7:30"], "terminal")).toBe(false);
    for (const sub of ["rm", "off", "on", "stop", "snooze", "test"]) expect(isPrivileged("clock", ["alarm", sub, "1"], "terminal")).toBe(true);
    expect(isPrivileged("clock", ["alarm", "--x", "rm", "1"], "terminal")).toBe(true);
    expect(isPrivileged("clock", ["alarm", "7:30"], "module:evil")).toBe(true);
    expect(isPrivileged("clock", ["alarm", "7:30"])).toBe(true);
    // the screen stays ibsh's, even from the real terminal
    expect(isPrivileged("layout", ["preset", "shell-right"], "terminal")).toBe(true);
    expect(isPrivileged("tab", ["move", "2", "shell"], "terminal")).toBe(true);
  });
});
