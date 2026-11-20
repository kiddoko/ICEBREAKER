/**
 * ════════════════════════════════════════════════════════════════════════
 *  ICEBREAKER PLUGIN API
 * ════════════════════════════════════════════════════════════════════════
 *
 * A plugin is a folder with two files:
 *
 *   <vault>/.icebreaker/plugins/my-plugin/
 *     plugin.json   { "id": "my-plugin", "name": "My plugin", "version": "0.1.0",
 *                     "description": "…", "permissions": ["vault:read", "ai"] }
 *     main.js       export function activate(ib) { … }
 *
 * `activate` receives the object described by `IcebreakerAPI` below. That
 * object is everything a plugin can touch — read this file and you know
 * exactly what plugins are able to do. Built-in plugins (in /plugins of the
 * repository) use the very same API.
 *
 * Permissions (declared in plugin.json, shown to the user before enabling):
 *   vault:read   read notes            vault:write  create / change notes
 *   ai           talk to the AI provider (uses the user's key / local model)
 *   media        see and control the music playing on the computer,
 *                and play local music files (ib.media.player)
 *   google-calendar   read and change the user's Google Calendar
 *   stats:read   read the stats other modules keep (your own need nothing)
 *   audio        play sound of its own through the speakers (ib.audio: a sampler)
 *
 * See docs/PLUGINS.md for a walkthrough, and `plugin new <id>` in the shell
 * for a ready-to-edit template.
 */

import type { ChatSession, SessionOptions, ToolSpec } from "../ai/types";
import type { App, AppSpec, PaletteAction } from "../apps/types";
import type { Theme } from "../core/theme";
import type { Command } from "../shell/types";
import type { WidgetSpec } from "../widgets/types";
import type { BackgroundSpec } from "../fx/backgrounds";
import type { LocalTrack, MediaStatus, PlayerStatus } from "../platform/types";
import type { Stat, StatMeta, StatPoint } from "../core/stats";
import type { ModuleProxy, ServiceInfo, ServiceSpec } from "./services";
import type { AudioEvent, SampleOptions } from "../core/mixer";
export type { AudioEvent, SampleOptions } from "../core/mixer";

/** "terminal": type commands in the user's real shell (terminal.run / write) */
import type { BlockInfo, BlockKind } from "../core/catalog";

export type Permission = "vault:read" | "vault:write" | "ai" | "media" | "google-calendar" | "stats:read" | "terminal" | "audio";

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  description?: string;
  author?: string;
  permissions?: Permission[];
  /** Entry file, default "main.js". */
  main?: string;
  /** A glyph for the module launcher ("♪"). */
  icon?: string;
  /** Show it in the module launcher (default true). A module that only adds a widget may say false. */
  launcher?: boolean;
  /** (internal) a feature that ships with the deck, packaged as a module */
  core?: boolean;
  /**
   * What it needs to work: other modules by id with their lowest version ("*": any), and
   * `icebreaker` for the deck itself — `{ "todo": ">=0.1.0", "icebreaker": ">=0.4.0" }`.
   * Installing it installs them first (after asking); switching it on switches them on
   * first; it wakes up after them (plugins/deps.ts).
   */
  requires?: Record<string, string>;
}

export interface IcebreakerAPI {
  /** App version, e.g. "0.1.0". */
  readonly version: string;
  readonly manifest: PluginManifest;

  /** Add shell commands (`ib.commands.register({ name, summary, run(ctx) {…} })`). */
  commands: { register(cmd: Command): void };

  /** Add apps (screens that open in a tab) and open them. */
  apps: { register(spec: AppSpec): void; open(kind: string, args?: unknown): App | null };

  /**
   * Add entries to THE MENU (⌘K · shift twice · hold RB): they show up when the
   * user searches, and with `key` they get a menu key too (⌘K, that key, enter) —
   * only if the key is free: the deck's and the user's own come first.
   *
   *   ib.palette.register({ id: "todo.add", title: "Todo: add…", key: "+", run: () => ib.shell.run("todo add") });
   */
  palette: { register(action: PaletteAction): void };

  /**
   * Add a widget to the HOME grid (the user places it with `e` then `a`).
   * The id is prefixed with your plugin id automatically: "clock" → "myplugin.clock".
   */
  widgets: { register(spec: WidgetSpec): void };

  /** The user's notes. Paths are vault-relative: "notes/idea.md". */
  vault: {
    read(path: string): Promise<string>;
    exists(path: string): Promise<boolean>;
    /** All Markdown note paths. */
    notes(): string[];
    write(path: string, content: string): Promise<void>;
    append(path: string, text: string): Promise<void>;
    mkdir(path: string): Promise<void>;
    /** A folder's files and folders ("" = the vault's top), any kind of file (permission "vault:read"). */
    list(dir: string): Promise<{ path: string; name: string; isDir: boolean; size: number; modified: number }[]>;
    /** A binary file's bytes (a song, a sample), at most 16 MB (permission "vault:read"). */
    readBytes(path: string): Promise<Uint8Array>;
    /** Write a binary file, at most 16 MB (permission "vault:write"). */
    writeBytes(path: string, data: Uint8Array | ArrayBuffer): Promise<void>;
  };

  /**
   * Sound of your own (permission "audio"): a sampler the deck mixes for you,
   * on the exact frame. Load samples once, then send events dated on the audio
   * clock — a song computed ~100 ms ahead never stutters; a note played now is
   * `at: undefined`. 64 voices, 32 MB of samples; everything stops when your
   * module is switched off. The volume is the user's (Settings → SOUND → Modules).
   *
   *   const t = await ib.audio.now();
   *   await ib.audio.sample("kick", int8Data, { loopStart: 0, loopLength: 0 });
   *   await ib.audio.schedule([{ at: t + 0.1, voice: 0, play: "kick", rate: 8363, volume: 0.8 }]);
   */
  audio: {
    /** there's a sound output here */
    available(): boolean;
    /** the audio clock, in seconds */
    now(): Promise<number>;
    /** a mono sample: floats (-1…1), Int8Array (an Amiga's 8 bits), Int16Array, or Uint8Array (unsigned 8-bit WAV) */
    sample(id: string, data: Float32Array | Int8Array | Int16Array | Uint8Array, opts?: SampleOptions): Promise<void>;
    /** forget one sample, or all of yours */
    drop(id?: string): Promise<void>;
    /** change voices at given times (start a sample, its speed, volume, pan, stop) */
    schedule(events: AudioEvent[]): Promise<void>;
    /** silence all your voices now and forget what was scheduled */
    stop(): Promise<void>;
    /** decode an audio file (wav, aiff, mp3, m4a, ogg… what the system reads) into floats, one array per channel */
    decode(bytes: Uint8Array | ArrayBuffer): Promise<{ rate: number; channels: Float32Array[] }>;
  };

  /** The AI provider the user configured (Claude, or a local model). */
  ai: {
    ready(): boolean;
    /** Why it isn't ready, if it isn't. */
    problem(): string | null;
    ask(prompt: string, opts?: { system?: string; onText?: (delta: string) => void; signal?: AbortSignal }): Promise<string>;
    session(opts: SessionOptions): ChatSession;
    /** Ready-made tools that let the model read (and, with approval, write) notes. */
    vaultTools(): ToolSpec[];
  };

  /**
   * Run a shell command as if typed, echoed in the shell. Use it for what
   * your UI does on click, so users learn your commands by clicking around.
   * (Hits can also take `{ cmd: "…" }` directly: `ui.hit(rect, { cmd, tip })`.)
   */
  shell: { run(line: string): Promise<number> };

  /**
   * Add an animated background a theme can use ([background] effect = "<id>.<name>"):
   * `render(ui, rect, { density, speed, color, color2, glyphs, t })` draws one
   * frame; `t` is seconds × speed. Keep it a pure function of `t`.
   */
  backgrounds: { register(spec: BackgroundSpec): void };

  /**
   * The music playing on this computer (permission "media"). `status()` is
   * null when nothing plays; it throws where it isn't supported (browser,
   * Windows for now). Actions: toggle play pause next prev vol+ vol- vol:<0-100>.
   */
  media: {
    available(): boolean;
    status(): Promise<MediaStatus | null>;
    control(action: string): Promise<void>;
    /**
     * ICEBREAKER's own player for local files (desktop). `scan` reads tags
     * (never cover art); `control`: play pause toggle stop seek:<s> vol:<0-100>.
     */
    player: {
      available(): boolean;
      scan(folder: string): Promise<LocalTrack[]>;
      load(path: string, play?: boolean, duration?: number): Promise<void>;
      control(action: string): Promise<void>;
      status(): Promise<PlayerStatus>;
    };
  };

  /**
   * The user's Google account (permission "google-calendar", desktop): they
   * sign in in the browser (connect). Official builds carry ICEBREAKER's OAuth
   * client; `setup` switches to the user's own (empty id = back to ICEBREAKER's).
   * `calendar(method, path, { query, body })` calls the Calendar API v3
   * (path relative to /calendar/v3/) and returns the parsed JSON.
   */
  google: {
    available(): boolean;
    /** configured: a client is available (the user's, or ICEBREAKER's built-in one) */
    status(): Promise<{ configured: boolean; custom: boolean; connected: boolean }>;
    setup(clientId: string, clientSecret: string): Promise<void>;
    /** Sign in in the browser (resolves once connected, up to 5 min); `onPhase`: "browser", then "token". */
    connect(onPhase?: (phase: string) => void): Promise<void>;
    disconnect(): Promise<void>;
    calendar<T = any>(method: string, path: string, opts?: { query?: Record<string, string | number | boolean | undefined>; body?: unknown }): Promise<T>;
    /**
     * Where to keep Google data offline: outside the vault (so the AI and
     * sync tools never see it, as Google's Limited Use rules require), and
     * deleted on disconnect. Never put Google data in ib.storage.
     */
    cache: { read<T>(fallback: T): Promise<T>; write(value: unknown): Promise<void> };
  };

  /**
   * Numbers kept over time, shown by the STATS module (and its widget).
   * A name without a dot is yours: "left" → "<your id>.left". You write only
   * your own stats; reading another module's ("budget.left") needs the
   * "stats:read" permission. "value" stats keep the last value of each day,
   * "counter" stats add up (per day). Stored in the vault (.icebreaker/stats.json).
   *
   *   await ib.stats.define("left", { label: "budget left", unit: "€" });
   *   await ib.stats.set("left", 412.5);
   *   await ib.stats.add("pages", 12);          // a counter
   *   const last30 = await ib.stats.series("left", 30);
   */
  stats: {
    define(name: string, meta: StatMeta): Promise<Stat>;
    set(name: string, value: number, meta?: StatMeta): Promise<Stat>;
    add(name: string, delta?: number, meta?: StatMeta): Promise<Stat>;
    get(id: string): Promise<Stat | null>;
    /** one point per day, oldest first (default 30 days) */
    series(id: string, days?: number): Promise<StatPoint[]>;
    /** every stat you may read (yours, or all with "stats:read"), optionally by id prefix */
    list(prefix?: string): Promise<Stat[]>;
    remove(name: string): Promise<boolean>;
    /** called with the stat id whenever a stat you may read changes; returns unsubscribe */
    onChange(fn: (id: string) => void): () => void;
  };

  /**
   * Modules talk to each other. Expose functions under your id; call any
   * module's (built-in or downloaded). A function can require a permission
   * from its callers ({ needs: "vault:write" }).
   *
   *   ib.modules.expose("add", { doc: "add(title) → the new task", fn: (title) => … });
   *   if (ib.modules.has("todo", "add")) await ib.modules.call("todo", "add", "walk the dog");
   *   await ib.modules.call("journal", "append", "ran 5 km");   // needs vault:write
   *   ib.modules.list()  // every exposed function, with its doc
   */
  /**
   * Call another module — or a part of the deck itself — like an object:
   *
   *   await ib.use("todo").add("walk the dog");
   *   await ib.use("tree").reveal("notes/ideas.md");
   *   const c = await ib.use("theme").colors();
   *
   * The deck's own parts: tree · terminal · shell · theme · home · panel · tabs ·
   * notes · sound · menu · keys · deck (notify, alert, say, setting). `modules api` (in the shell)
   * lists every function of every module with one line of doc.
   */
  use<T = ModuleProxy>(module: string): T;

  /**
   * A line for developers: it lands in the shell's LOG tab under "debug",
   * tagged with your module's id (`log show debug` to see only those).
   *
   *   ib.debug(`fetched ${items.length} items in ${ms} ms`);
   */
  debug(text: string): void;

  /**
   * Everything the deck can do, as blocks you can read: commands, THE MENU's
   * actions, shortcuts, settings, functions (ib.use), widgets, apps, themes,
   * modules — each with who provides it, one line of doc and how to call it.
   * Plain data (JSON), the same as the BLOCKS page and `catalog` in the shell.
   *
   *   const fns = ib.catalog.list("function", "todo");   // [{ kind, id, name, doc, from, call, value }]
   *   const theme = ib.catalog.get("setting", "appearance.theme")?.value;
   */
  catalog: {
    list(kind?: BlockKind, words?: string): BlockInfo[];
    get(kind: BlockKind, id: string): BlockInfo | undefined;
    kinds(): readonly BlockKind[];
  };

  modules: {
    expose(name: string, spec: ServiceSpec | ServiceSpec["fn"]): void;
    call<T = unknown>(module: string, name: string, ...args: unknown[]): Promise<T>;
    has(module: string, name?: string): boolean;
    list(module?: string): ServiceInfo[];
    /** every module on the deck: id, name, on/off */
    installed(): { id: string; name: string; active: boolean }[];
  };

  /**
   * Your module's settings, shown in Settings → a section with your name
   * (after the normal sections). Values are kept for you; read them with get,
   * hear about changes with onChange. Shell: `modules set <id> <key> <value>`.
   *
   *   ib.settings.register([{ key: "before", label: "warn before (min)", type: "choice", options: ["0", "5", "15"], default: "15", help: "…" }]);
   */
  settings: {
    register(specs: ModuleSettingSpec[]): void;
    get<T = unknown>(key: string): T;
    set(key: string, value: unknown): void;
    onChange(fn: (key: string, value: unknown) => void): void;
  };

  /**
   * ⌘Z: whatever your module changes for the user (a task added, a reminder done…)
   * records how to take it back, so ⌘Z undoes the last thing done — not something
   * older elsewhere. `undo` / `redo` run with recording paused (no loops).
   *
   *   const before = snapshot();  …change…  ib.history.record({ label: "todo add milk", undo: () => restore(before), redo: () => restore(after) });
   *
   * (Modules in the sandbox can't record yet: their changes aren't undoable.)
   */
  history: {
    record(step: { label: string; undo(): void | Promise<void>; redo?(): void | Promise<void>; key?: string }): void;
  };

  /** Small JSON key/value store private to this plugin (.icebreaker/plugin-data/<id>.json). */
  storage: {
    get<T>(key: string, fallback: T): Promise<T>;
    set(key: string, value: unknown): Promise<void>;
  };

  /** Talk to the user. */
  ui: {
    notify(text: string, kind?: "info" | "success" | "warning" | "error"): void;
    confirm(title: string, detail?: string): Promise<boolean>;
    prompt(title: string, opts?: { initial?: string; placeholder?: string; mask?: boolean; suggestions?: string[] }): Promise<string | null>;
    /** Get the user's attention: system notification + the alert sound (+ the voice, if on). */
    alert(title: string, body?: string): void;
    /**
     * Have the voice say something — only if the user lets that topic speak
     * (Settings → VOICE → say aloud). Topics: "calendar", "reminders", "timers",
     * "weather", "system"… anything else counts as "modules".
     */
    say(text: string, topic?: string): void;
    /** Pick one option (type to filter). Resolves with its index, or null. */
    choose(title: string, options: ChoiceOption[], opts?: { selected?: number }): Promise<number | null>;
    /**
     * THE file browser (the deck's own): the user chooses a folder / a file on the
     * computer; you get its path (or null), nothing else — reading it is up to your
     * permissions (desktop only; null elsewhere).
     */
    pickFolder(title: string, start?: string): Promise<string | null>;
    pickFile(title: string, exts?: string[], start?: string): Promise<string | null>;
    theme(): Theme;
    /** Ask for a redraw (after changing state outside an input handler). */
    redraw(): void;
  };

  /**
   * Building blocks for drawing apps — the same ones the core uses.
   * `ui` in your app's render(ui, rect, focused) is a UI instance (see src/ui/ui.ts).
   */
  lib: typeof import("./lib");
}

export interface ModuleSettingSpec {
  key: string;
  label: string;
  /** action: a row that does something when chosen (enter / click) — `cmd` or `run` */
  type: "toggle" | "choice" | "text" | "number" | "action";
  options?: string[];
  default?: unknown;
  /** action: the shell command it runs (shown next to the row, like every setting) */
  cmd?: string | (() => string);
  /** action: run this instead of `cmd` (a picker, a confirmation…) */
  run?: () => void | Promise<void>;
  /** action: what the row shows on the right (a status: "connected", a name…) */
  value?: () => string;
  /** a sentence or two: what it does (shown under the settings list) */
  help?: string;
}

export interface ChoiceOption {
  label: string;
  /** dim text on the right */
  hint?: string;
  /** a colored ● before the label, "#rrggbb" */
  color?: string;
}

/** What a plugin's main.js exports. */
export interface PluginModule {
  activate(ib: IcebreakerAPI): void | Promise<void>;
  deactivate?(): void | Promise<void>;
}
