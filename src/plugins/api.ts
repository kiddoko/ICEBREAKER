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

export type Permission = "vault:read" | "vault:write" | "ai";

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  description?: string;
  author?: string;
  permissions?: Permission[];
  /** Entry file, default "main.js". */
  main?: string;
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

/** What a plugin's main.js exports. */
export interface PluginModule {
  activate(ib: IcebreakerAPI): void | Promise<void>;
  deactivate?(): void | Promise<void>;
}
