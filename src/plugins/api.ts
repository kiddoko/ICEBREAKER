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

export type Permission = "vault:read" | "vault:write" | "ai" | "media" | "google-calendar";

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
}

export interface IcebreakerAPI {
  /** App version, e.g. "0.1.0". */
  readonly version: string;
  readonly manifest: PluginManifest;

  /** Add shell commands (`ib.commands.register({ name, summary, run(ctx) {…} })`). */
  commands: { register(cmd: Command): void };

  /** Add apps (screens that open in a tab) and open them. */
  apps: { register(spec: AppSpec): void; open(kind: string, args?: unknown): App | null };

  /** Add entries to the command palette (Ctrl+K). */
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
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    calendar<T = any>(method: string, path: string, opts?: { query?: Record<string, string | number | boolean | undefined>; body?: unknown }): Promise<T>;
    /**
     * Where to keep Google data offline: outside the vault (so the AI and
     * sync tools never see it, as Google's Limited Use rules require), and
     * deleted on disconnect. Never put Google data in ib.storage.
     */
    cache: { read<T>(fallback: T): Promise<T>; write(value: unknown): Promise<void> };
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
    prompt(title: string, opts?: { initial?: string; placeholder?: string; mask?: boolean }): Promise<string | null>;
    /** Get the user's attention: system notification + the alert sound (+ the voice, if on). */
    alert(title: string, body?: string): void;
    /** Pick one option (type to filter). Resolves with its index, or null. */
    choose(title: string, options: ChoiceOption[], opts?: { selected?: number }): Promise<number | null>;
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
