import { registerBackground } from "../fx/backgrounds";
import { vaultTools } from "../ai/tools";
import type { Deck } from "../deck";
import type { IcebreakerAPI, Permission, PluginManifest, PluginModule } from "./api";
import * as lib from "./lib";

export const APP_VERSION = "0.1.0";
const VAULT_PLUGIN_DIR = ".icebreaker/plugins";

interface LoadedPlugin {
  manifest: PluginManifest;
  source: "builtin" | "vault";
  active: boolean;
  error?: string;
  load(): Promise<PluginModule>;
  module?: PluginModule;
}

// Built-in plugins: /plugins/<id>/plugin.json + main.ts, bundled at build time.
const BUILTIN_MANIFESTS = import.meta.glob("../../plugins/*/plugin.json", { eager: true, import: "default" }) as Record<string, PluginManifest>;
const BUILTIN_MAINS = import.meta.glob("../../plugins/*/main.ts") as Record<string, () => Promise<PluginModule>>;

/**
 * Finds, activates and deactivates plugins.
 *
 *  - built-in plugins are on unless listed in `plugins.disabled`
 *  - vault plugins are off until enabled with `plugin enable <id>`, which
 *    shows the permissions they request and asks for confirmation
 *
 * Everything a plugin registers is tagged with its id, so disabling it
 * removes its commands, apps and palette entries cleanly.
 */
export class PluginHost {
  private plugins: LoadedPlugin[] = [];

  constructor(private readonly deck: Deck) {}

  list(): LoadedPlugin[] {
    return this.plugins;
  }

  active(): LoadedPlugin[] {
    return this.plugins.filter((p) => p.active);
  }

  async init(): Promise<void> {
    this.plugins = [...this.discoverBuiltins(), ...(await this.discoverVault())];
    const { enabled, disabled } = this.deck.settings.data.plugins;
    for (const p of this.plugins) {
      const on = p.source === "builtin" ? !disabled.includes(p.manifest.id) : enabled.includes(p.manifest.id);
      if (on) await this.activate(p);
    }
  }

  async reload(): Promise<void> {
    for (const p of this.active()) await this.deactivate(p);
    await this.init();
  }

  async enable(id: string): Promise<boolean> {
    const p = this.plugins.find((x) => x.manifest.id === id);
    if (!p) throw new Error(`no plugin "${id}" (plugin ls)`);
    if (p.active) return false;
    if (p.source === "vault") {
      const perms = p.manifest.permissions?.length ? p.manifest.permissions.join(", ") : "none";
      const ok = await this.deck.confirm(
        `Enable plugin "${p.manifest.name}"?`,
        `${p.manifest.description ?? ""}\nby ${p.manifest.author ?? "unknown"} · v${p.manifest.version}\n\npermissions: ${perms}\n\nPlugins run with access to what they're granted. Only enable code you trust — read ${VAULT_PLUGIN_DIR}/${id}/ first.`,
      );
      if (!ok) return false;
      const s = this.deck.settings;
      s.set("plugins.enabled", [...new Set([...s.data.plugins.enabled, id])]);
    } else {
      const s = this.deck.settings;
      s.set("plugins.disabled", s.data.plugins.disabled.filter((x) => x !== id));
    }
    await this.activate(p);
    return p.active;
  }

  async disable(id: string): Promise<boolean> {
    const p = this.plugins.find((x) => x.manifest.id === id);
    if (!p) throw new Error(`no plugin "${id}"`);
    const s = this.deck.settings;
    if (p.source === "vault") s.set("plugins.enabled", s.data.plugins.enabled.filter((x) => x !== id));
    else s.set("plugins.disabled", [...new Set([...s.data.plugins.disabled, id])]);
    if (!p.active) return false;
    await this.deactivate(p);
    return true;
  }

  /** Write a starter plugin into the vault. Returns the path of main.js. */
  async scaffold(id: string): Promise<string> {
    const dir = `${VAULT_PLUGIN_DIR}/${id}`;
    if (await this.deck.vault.exists(dir)) throw new Error(`${dir} already exists`);
    const manifest: PluginManifest = {
      id,
      name: id,
      version: "0.1.0",
      description: "My first ICEBREAKER plugin",
      author: this.deck.settings.data.user.handle,
      permissions: ["vault:read"],
    };
    await this.deck.vault.write(`${dir}/plugin.json`, JSON.stringify(manifest, null, 2) + "\n");
    await this.deck.vault.write(`${dir}/main.js`, PLUGIN_TEMPLATE.replaceAll("__ID__", id));
    this.plugins.push(this.vaultPlugin(manifest, dir));
    return `${dir}/main.js`;
  }

  // ── internals ────────────────────────────────────────────────────────────

  private discoverBuiltins(): LoadedPlugin[] {
    return Object.entries(BUILTIN_MANIFESTS).map(([path, manifest]) => {
      const main = path.replace(/plugin\.json$/, "main.ts");
      return { manifest, source: "builtin" as const, active: false, load: BUILTIN_MAINS[main] };
    });
  }

  private async discoverVault(): Promise<LoadedPlugin[]> {
    const vault = this.deck.vault;
    if (!(await vault.exists(VAULT_PLUGIN_DIR))) return [];
    const out: LoadedPlugin[] = [];
    for (const dir of (await vault.list(VAULT_PLUGIN_DIR)).filter((e) => e.isDir)) {
      try {
        const manifest = JSON.parse(await vault.read(`${dir.path}/plugin.json`)) as PluginManifest;
        if (!manifest.id || !manifest.name || !manifest.version) throw new Error("plugin.json needs id, name and version");
        out.push(this.vaultPlugin(manifest, dir.path));
      } catch (e) {
        out.push({
          manifest: { id: dir.name, name: dir.name, version: "?" },
          source: "vault",
          active: false,
          error: `bad plugin.json: ${e instanceof Error ? e.message : e}`,
          load: async () => Promise.reject(new Error("invalid manifest")),
        });
      }
    }
    return out;
  }

  private vaultPlugin(manifest: PluginManifest, dir: string): LoadedPlugin {
    return {
      manifest,
      source: "vault",
      active: false,
      load: async () => {
        // Vault plugins are plain ES modules: load the file's text as a module.
        const code = await this.deck.vault.read(`${dir}/${manifest.main ?? "main.js"}`);
        const url = URL.createObjectURL(new Blob([code], { type: "text/javascript" }));
        try {
          return (await import(/* @vite-ignore */ url)) as PluginModule;
        } finally {
          URL.revokeObjectURL(url);
        }
      },
    };
  }

  private async activate(p: LoadedPlugin): Promise<void> {
    try {
      p.module ??= await p.load();
      if (typeof p.module.activate !== "function") throw new Error("main must export function activate(ib)");
      await p.module.activate(this.apiFor(p.manifest));
      p.active = true;
      p.error = undefined;
    } catch (e) {
      p.active = false;
      p.error = e instanceof Error ? e.message : String(e);
      this.cleanup(p.manifest.id);
      console.error(`[plugin ${p.manifest.id}]`, e);
    }
  }

  private async deactivate(p: LoadedPlugin): Promise<void> {
    try {
      await p.module?.deactivate?.();
    } catch (e) {
      console.error(`[plugin ${p.manifest.id}] deactivate failed`, e);
    }
    this.cleanup(p.manifest.id);
    p.active = false;
    p.module = undefined;
  }

  private cleanup(id: string): void {
    this.deck.commands.unregisterSource(id);
    this.deck.apps.unregisterSource(id);
    this.deck.actions.unregisterSource(id);
    this.deck.widgets.unregisterSource(id);
  }

  /** Build the API object for one plugin, enforcing its declared permissions. */
  private apiFor(m: PluginManifest): IcebreakerAPI {
    const deck = this.deck;
    const granted = new Set<Permission>(m.permissions ?? []);
    const need = (perm: Permission) => {
      if (!granted.has(perm)) throw new Error(`plugin "${m.id}" needs the "${perm}" permission in its plugin.json`);
    };
    const dataPath = `.icebreaker/plugin-data/${m.id}.json`;
    const player = () => {
      if (!deck.platform.player) throw new Error("the music player needs the desktop app");
      return deck.platform.player;
    };
    const google = () => {
      if (!deck.platform.google) throw new Error("Google needs the desktop app");
      return deck.platform.google;
    };
    const readData = async (): Promise<Record<string, unknown>> => {
      try {
        return (await deck.vault.exists(dataPath)) ? JSON.parse(await deck.vault.read(dataPath)) : {};
      } catch {
        return {};
      }
    };

    return {
      version: APP_VERSION,
      manifest: m,
      commands: { register: (cmd) => deck.commands.register({ ...cmd, source: m.id }) },
      apps: {
        register: (spec) => deck.apps.register(spec, m.id),
        open: (kind, args) => deck.openApp(kind, args),
      },
      palette: { register: (a) => deck.actions.register(a, m.id) },
      shell: { run: (line) => deck.act(line) },
      media: {
        available: () => !!deck.platform.media,
        status: async () => {
          need("media");
          if (!deck.platform.media) throw new Error("music control needs the desktop app");
          return deck.platform.media.status();
        },
        control: async (action) => {
          need("media");
          if (!deck.platform.media) throw new Error("music control needs the desktop app");
          return deck.platform.media.control(action);
        },
        player: {
          available: () => !!deck.platform.player,
          scan: (folder) => (need("media"), player().scan(folder)),
          load: (path, play = true, duration) => (need("media"), player().load(path, play, duration)),
          control: (action) => (need("media"), player().control(action)),
          status: () => (need("media"), player().status()),
        },
      },
      google: {
        available: () => !!deck.platform.google,
        status: () => (need("google-calendar"), google().status()),
        setup: (id, secret) => (need("google-calendar"), google().setup(id, secret)),
        connect: () => (need("google-calendar"), google().connect()),
        disconnect: () => (need("google-calendar"), google().disconnect()),
        calendar: async (method, path, opts = {}) => {
          need("google-calendar");
          const query = Object.entries(opts.query ?? {})
            .filter(([, v]) => v !== undefined)
            .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
            .join("&");
          const text = await google().calendar(method, path, query || undefined, opts.body === undefined ? undefined : JSON.stringify(opts.body));
          return text.trim() ? JSON.parse(text) : null;
        },
        cache: {
          read: async <T,>(fallback: T) => {
            need("google-calendar");
            try {
              const t = await google().cache();
              return t ? (JSON.parse(t) as T) : fallback;
            } catch {
              return fallback;
            }
          },
          write: async (value) => {
            need("google-calendar");
            await google().cache(JSON.stringify(value));
          },
        },
      },
      backgrounds: { register: (b) => registerBackground({ ...b, name: b.name.startsWith(`${m.id}.`) ? b.name : `${m.id}.${b.name}` }) },
      widgets: {
        register: (w) => void deck.widgets.register({ ...w, id: w.id.startsWith(`${m.id}.`) ? w.id : `${m.id}.${w.id}` }, m.id),
      },
      vault: {
        read: (p) => (need("vault:read"), deck.vault.read(p)),
        exists: (p) => (need("vault:read"), deck.vault.exists(p)),
        notes: () => (need("vault:read"), deck.vault.markdown().map((e) => e.path)),
        write: (p, c) => (need("vault:write"), deck.vault.write(p, c)),
        append: (p, t) => (need("vault:write"), deck.vault.append(p, t)),
        mkdir: (p) => (need("vault:write"), deck.vault.mkdir(p)),
      },
      ai: {
        ready: () => deck.ai.ready,
        problem: () => deck.ai.problem,
        ask: (prompt, opts) => (need("ai"), deck.ai.ask(prompt, opts)),
        session: (opts) => (need("ai"), deck.ai.session(opts)),
        vaultTools: () => {
          need("vault:read");
          const tools = vaultTools(deck.vault, (t, d) => deck.confirm(t, d));
          return granted.has("vault:write") ? tools : tools.filter((t) => t.name !== "write_note");
        },
      },
      storage: {
        get: async <T,>(key: string, fallback: T) => ((await readData())[key] as T) ?? fallback,
        set: async (key, value) => {
          const data = await readData();
          data[key] = value;
          await deck.vault.write(dataPath, JSON.stringify(data, null, 2));
        },
      },
      ui: {
        notify: (text, kind) => deck.notify(`${m.name}: ${text}`, kind),
        confirm: (t, d) => deck.confirm(t, d),
        prompt: (t, o) => deck.prompt(t, o),
        choose: (t, options, o) => deck.choose(t, options, o),
        theme: () => deck.theme,
        redraw: () => deck.requestFrame(),
      },
      lib,
    };
  }
}

const PLUGIN_TEMPLATE = `// ICEBREAKER plugin: __ID__
// Docs: docs/PLUGINS.md — the full API is described in src/plugins/api.ts.
// Edit, save, then run \`plugin reload\` in the shell.

export function activate(ib) {
  // A shell command: try "__ID__" in the shell.
  ib.commands.register({
    name: "__ID__",
    summary: "says hello and counts your notes",
    run(ctx) {
      const notes = ib.vault.notes();
      ctx.out(ib.lib.fmt.magenta("hello from __ID__!") + " you have " + notes.length + " notes\\n");
    },
  });

  // An app (opens in a tab): Ctrl+K → "__ID__".
  ib.apps.register({
    kind: "__ID__",
    title: "__ID__",
    icon: "✦",
    launcher: true,
    create: () => ({
      kind: "__ID__",
      key: "__ID__",
      title: () => "__ID__",
      render(ui, rect, focused) {
        const box = ui.box(rect, { title: "__ID__", focused });
        ui.textCenter(box, box.y + Math.floor(box.h / 2), "edit .icebreaker/plugins/__ID__/main.js", { fg: ui.c.accent });
      },
    }),
  });
}

export function deactivate() {}
`;
