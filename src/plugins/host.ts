import { PRIVILEGED_NAMES } from "../shell/privileged";
import type { Origin } from "../shell/origin";
import { isDeckPath } from "../vault/paths";
import { FRAME_PARTS, frameServices } from "./frame-services";
import { sandboxed } from "./sandbox/bridge";
import { pickFile, pickFolder } from "../workspace/filebrowser";
import { auditCode, auditReport, type AuditFinding } from "./audit";
import { moduleSettingRows } from "../apps/settings-rows";
import { BLOCK_KINDS } from "../core/catalog";
import type { VoiceTopic } from "../deck";
import { corePackageEntries } from "./core-packages";
import { registerBackground } from "../fx/backgrounds";
import { vaultTools } from "../ai/tools";
import type { Deck } from "../deck";
import { spokenAlert } from "../core/voice";
import type { IcebreakerAPI, Permission, PluginManifest, PluginModule } from "./api";
import * as lib from "./lib";

import pkg from "../../package.json";
import { describeNeeds, unmet, wakeOrder, dependents, type Need } from "./deps";
/** the deck's version (package.json): what modules see as `ib.version`, what `requires.icebreaker` is checked against */
export const APP_VERSION: string = pkg.version;
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

  /**
   * `trustChanges`: you asked for this reload yourself (`plugin reload`, an update you
   * accepted): the switched-on modules' code as it is now is the code you approve.
   */
  async init(trustChanges = false): Promise<void> {
    const builtins = this.discoverBuiltins();
    // a module from the vault can never take the id of one that ships with the deck (it would
    // get its data, its stats — and pass for the deck's own): refused, said in `plugin ls`
    const shipped = new Set(this.allBuiltins().map((p) => p.manifest.id));
    const vault = (await this.discoverVault()).map((p) => (shipped.has(p.manifest.id) && !p.error ? { ...p, error: `"${p.manifest.id}" is the id of a module that ships with the deck: rename this one (its folder and its plugin.json)`, load: async () => Promise.reject(new Error("id taken")) } : p));
    this.plugins = [...builtins, ...vault];
    const { enabled, disabled } = this.deck.settings.data.plugins;
    const on = this.plugins.filter((p) => !(p.source === "vault" && p.error) && (p.source === "builtin" ? !disabled.includes(p.manifest.id) : enabled.includes(p.manifest.id)));
    // what a module needs wakes up first (plugins/deps.ts); one whose needs aren't met stays off, saying why
    const byId = new Map(on.map((p) => [p.manifest.id, p]));
    for (const id of wakeOrder([...byId.keys()], (x) => byId.get(x)?.manifest.requires)) {
      const p = byId.get(id)!;
      const needs = this.needsOf(p);
      if (needs.length) {
        p.error = `needs ${describeNeeds(needs)}`;
        continue;
      }
      // a module from the STORE or the vault runs with the permissions YOU approved, nothing
      // more: if its plugin.json asks for more now (an update, a changed file), it stays off
      // until you switch it on again and read them
      const more = this.unapproved(p);
      if (more === null) {
        p.error = `not approved on this deck yet: plugin enable ${id}`;
        continue;
      }
      if (more.length) {
        p.error = `asks for more than you approved (${more.join(", ")}): plugin enable ${id}`;
        continue;
      }
      // …and with the code you approved: changed since (another program or a sync wrote in the
      // vault, another vault holds a module of the same name), it stays off until you look again
      if (p.source === "vault" && !(await this.sameCode(p, trustChanges))) {
        p.error = (this.deck.settings.data.plugins.pinned ?? {})[id] ? `its code changed since you approved it: plugin enable ${id}` : `not approved on this deck yet: plugin enable ${id}`;
        continue;
      }
      await this.activate(p);
    }
  }

  /**
   * The permissions a vault module asks for that you never approved (plugins.granted, written
   * when you switch it on). null: it was never approved on this deck at all.
   */
  unapproved(p: LoadedPlugin): string[] | null {
    if (p.source !== "vault") return [];
    const granted = this.deck.settings.data.plugins.granted ?? {};
    const asks = [...new Set(p.manifest.permissions ?? [])];
    if (!Array.isArray(granted[p.manifest.id])) return null;
    return asks.filter((x) => !granted[p.manifest.id].includes(x));
  }

  /** What a module lacks to run: not installed, too old, switched off — or a newer deck. */
  needsOf(p: LoadedPlugin | string): Need[] {
    const m = typeof p === "string" ? this.plugins.find((x) => x.manifest.id === p) : p;
    if (!m) return [];
    const there = new Map(this.plugins.map((x) => [x.manifest.id, { version: x.manifest.version, active: x.active }]));
    return unmet(m.manifest.requires, there, APP_VERSION);
  }

  /** The modules switched on that need `id` (directly or through another), nearest first. */
  dependentsOf(id: string): string[] {
    const active = this.active().map((p) => p.manifest.id);
    return dependents(id, active, (x) => this.plugins.find((p) => p.manifest.id === x)?.manifest.requires);
  }

  async reload(trustChanges = false): Promise<void> {
    for (const p of this.active()) await this.deactivate(p);
    await this.init(trustChanges);
  }

  /** SHA-256 of a vault module's code and manifest, as hex ("" when it can't be read). */
  private async fingerprint(p: LoadedPlugin): Promise<string> {
    try {
      const dir = `${VAULT_PLUGIN_DIR}/${p.manifest.id}`;
      const text = `${await this.deck.vault.read(`${dir}/${p.manifest.main ?? "main.js"}`)}\n\u0000\n${JSON.stringify([p.manifest.id, [...(p.manifest.permissions ?? [])].sort(), p.manifest.main ?? "main.js"])}`;
      const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
      return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
    } catch {
      return "";
    }
  }

  /** Remember this module's code as the one you approved. */
  private async pin(p: LoadedPlugin): Promise<void> {
    const s = this.deck.settings;
    const print = await this.fingerprint(p);
    if (print) s.set("plugins.pinned", { ...(s.data.plugins.pinned ?? {}), [p.manifest.id]: print });
  }

  /** Is this module's code the one you approved? */
  private async sameCode(p: LoadedPlugin, trustChanges: boolean): Promise<boolean> {
    const pinned = (this.deck.settings.data.plugins.pinned ?? {})[p.manifest.id];
    const now = await this.fingerprint(p);
    if (!now) return false;
    if (trustChanges && pinned !== now) await this.pin(p);
    return trustChanges || pinned === now;
  }

  /**
   * Switch a module on. What it needs and is only switched off is switched on first; what
   * isn't there (or is too old) stops it with the command that fixes it. `ask` asks the
   * person (a dialog by default; the shell asks in the shell).
   */
  async enable(id: string, ask: (title: string, detail: string) => Promise<boolean> = (t, d) => this.deck.confirm(t, d), seen = new Set<string>()): Promise<boolean> {
    const p = this.plugins.find((x) => x.manifest.id === id);
    if (!p) throw new Error(`no plugin "${id}" (plugin ls)`);
    if (p.active) return false;
    if (p.source === "vault" && p.error && !p.error.startsWith("asks for more") && !p.error.startsWith("its code changed") && !p.error.startsWith("not approved") && !p.error.startsWith("needs ")) throw new Error(`${id}: ${p.error}`);
    seen.add(id);
    const needs = this.needsOf(p);
    const blocking = needs.filter((n) => n.problem !== "off");
    if (blocking.length) {
      const fix = blocking.filter((n) => n.id !== "icebreaker").map((n) => `store install ${n.id}`);
      throw new Error(`${id} needs ${describeNeeds(blocking)}${fix.length ? ` — ${fix.join(", ")}` : " — update ICEBREAKER"}`);
    }
    for (const n of needs) if (!seen.has(n.id)) await this.enable(n.id, ask, seen);
    if (this.needsOf(p).length) return false; // a need was refused: it stays off
    if (p.source === "vault") {
      const perms = p.manifest.permissions?.length ? p.manifest.permissions.map((x) => (x === "terminal" ? "terminal (it can type commands in your real terminal: any program on this computer)" : x)).join(", ") : "none";
      // what its code does that a module shouldn't need (plugins/audit.ts)
      const report = auditReport(await this.audit(id).catch(() => []));
      const ok = await ask(
        `Enable plugin "${p.manifest.name}"?`,
        `${p.manifest.description ?? ""}\nby ${p.manifest.author ?? "unknown"} · v${p.manifest.version}\n\npermissions: ${perms}\n\n${report}\n\nIt runs in a sandbox: only what its permissions allow, nothing of the deck, the page or the network. Its code: ${VAULT_PLUGIN_DIR}/${id}/.`,
      );
      if (!ok) return false;
      const s = this.deck.settings;
      // what you just read and approved: the module never runs with more (init, unapproved)
      s.set("plugins.granted", { ...(s.data.plugins.granted ?? {}), [id]: [...new Set(p.manifest.permissions ?? [])] });
      await this.pin(p); // …and this code
      s.set("plugins.enabled", [...new Set([...s.data.plugins.enabled, id])]);
    } else {
      const s = this.deck.settings;
      s.set("plugins.disabled", s.data.plugins.disabled.filter((x) => x !== id));
    }
    await this.activate(p);
    return p.active;
  }

  /** What a vault module's code does that a module shouldn't need (plugins/audit.ts). Built-in ones: nothing to read. */
  async audit(id: string): Promise<AuditFinding[]> {
    const p = this.plugins.find((x) => x.manifest.id === id);
    if (!p) throw new Error(`no plugin "${id}"`);
    if (p.source !== "vault") return [];
    return auditCode(await this.deck.vault.read(`${VAULT_PLUGIN_DIR}/${id}/${p.manifest.main ?? "main.js"}`));
  }

  async disable(id: string): Promise<boolean> {
    const p = this.plugins.find((x) => x.manifest.id === id);
    if (!p) throw new Error(`no plugin "${id}"`);
    const s = this.deck.settings;
    if (p.source === "vault") {
      s.set("plugins.enabled", s.data.plugins.enabled.filter((x) => x !== id));
      // switched off: nothing stays approved (switching it on again shows its permissions and its code's audit)
      const { [id]: _g, ...granted } = s.data.plugins.granted ?? {};
      const { [id]: _p, ...pinned } = s.data.plugins.pinned ?? {};
      s.set("plugins.granted", granted);
      s.set("plugins.pinned", pinned);
    } else s.set("plugins.disabled", [...new Set([...s.data.plugins.disabled, id])]);
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

  /** Every module that ships with the deck: the bundled plugins and the core's packages. */
  allBuiltins(): LoadedPlugin[] {
    const bundled = Object.entries(BUILTIN_MANIFESTS).map(([path, manifest]) => {
      const main = path.replace(/plugin\.json$/, "main.ts");
      return { manifest, source: "builtin" as const, active: false, load: BUILTIN_MAINS[main] };
    });
    const core = corePackageEntries(this.deck, APP_VERSION).map((e) => ({ ...e, source: "builtin" as const, active: false }));
    return [...core, ...bundled];
  }

  private discoverBuiltins(): LoadedPlugin[] {
    const removed = this.deck.settings.data.plugins.removed ?? [];
    return this.allBuiltins().filter((p) => !removed.includes(p.manifest.id));
  }

  /** Uninstall a built-in module (it can be reinstalled from the STORE). */
  async removeBuiltin(id: string): Promise<void> {
    const s = this.deck.settings;
    const p = this.plugins.find((x) => x.manifest.id === id);
    if (p?.active) await this.deactivate(p);
    s.set("plugins.removed", [...new Set([...(s.data.plugins.removed ?? []), id])]);
    this.plugins = this.plugins.filter((x) => x.manifest.id !== id);
  }

  /** Put a removed built-in module back (on). */
  async restoreBuiltin(id: string): Promise<void> {
    const s = this.deck.settings;
    s.set("plugins.removed", (s.data.plugins.removed ?? []).filter((x) => x !== id));
    s.set("plugins.disabled", s.data.plugins.disabled.filter((x) => x !== id));
    const p = this.allBuiltins().find((x) => x.manifest.id === id);
    if (!p) throw new Error(`no built-in module "${id}"`);
    this.plugins.push(p);
    await this.activate(p);
  }

  private async discoverVault(): Promise<LoadedPlugin[]> {
    const vault = this.deck.vault;
    if (!(await vault.exists(VAULT_PLUGIN_DIR))) return [];
    const out: LoadedPlugin[] = [];
    for (const dir of (await vault.list(VAULT_PLUGIN_DIR)).filter((e) => e.isDir)) {
      try {
        const manifest = JSON.parse(await vault.read(`${dir.path}/plugin.json`)) as PluginManifest;
        if (!manifest.id || !manifest.name || !manifest.version) throw new Error("plugin.json needs id, name and version");
        // its id is its folder's name, in lowercase letters, digits and dashes: it names its data
        // file, its stats and what you approve — two modules can't share one
        if (typeof manifest.id !== "string" || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(manifest.id)) throw new Error(`plugin.json: "id" must be lowercase letters, digits and dashes`);
        if (manifest.id !== dir.name) throw new Error(`plugin.json: "id" (${manifest.id}) must be its folder's name (${dir.name})`);
        if (manifest.permissions !== undefined && (!Array.isArray(manifest.permissions) || manifest.permissions.some((x) => typeof x !== "string"))) throw new Error(`plugin.json: "permissions" must be a list of names`);
        if (manifest.main !== undefined && !/^[\w.-]+\.m?js$/.test(manifest.main)) throw new Error(`plugin.json: "main" must be a file name like main.js`);
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
        // a module from the STORE or the vault runs in its own Worker (sandbox/): it reaches
        // the deck only through its `ib`, call by call — never the page, the native side or the network
        const code = await this.deck.vault.read(`${dir}/${manifest.main ?? "main.js"}`);
        return sandboxed(this.deck, code, manifest);
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
    this.deck.services.unregisterSource(id);
    // a module with the name of one of the deck's own parts (TERMINAL): the deck's functions
    // under that name (`ib.use("terminal").run`) stay when the module goes or reloads
    if (FRAME_PARTS.has(id)) this.deck.services.exposeAll(id, frameServices(this.deck)[id] ?? {});
    this.deck.moduleSettings.delete(id);
    this.deck.prefs.unregisterSource(id);
    this.deck.moduleSettingListeners.delete(id);
  }

  /** Build the API object for one plugin, enforcing its declared permissions. */
  private apiFor(m: PluginManifest): IcebreakerAPI {
    const deck = this.deck;
    // a module from the STORE or the vault (not one that ships with the deck) never takes
    // the place of the deck's own commands, pages or actions: a fake Settings or `vault`
    // could ask for your password
    const thirdParty = this.plugins.find((p) => p.manifest === m)?.source !== "builtin";
    const mine = (what: string, name: string, source: string | undefined) => {
      if (!thirdParty || source === undefined || source === m.id) return;
      // the deck's own, or another module's (a fake `todo` or `cal` could ask for anything)
      throw new Error(source === "core" ? `${m.id}: the ${what} "${name}" is the deck's own` : `${m.id}: the ${what} "${name}" belongs to the module ${source}`);
    };
    const granted = new Set<Permission>(m.permissions ?? []);
    // the lines it runs carry its origin (shell/origin.ts): privileged commands refused for every
    // module; a STORE / vault module's lines read and write only what its permissions allow
    const origin: Origin = { source: m.id, grants: thirdParty ? granted : "all" };
    const caller = { id: m.id, permissions: granted, origin };
    // a window a STORE / vault module opens says who is asking (it could ask "your password")
    const from = (title: string) => (thirdParty ? `${m.name} (module) — ${String(title)}` : title);
    const need = (perm: Permission) => {
      if (!granted.has(perm)) throw new Error(`plugin "${m.id}" needs the "${perm}" permission in its plugin.json`);
    };
    const dataPath = `.icebreaker/plugin-data/${m.id}.json`;
    // vault:write is for notes: the deck's own folder (modules' code, themes, settings) is never a
    // module's to change — its own data goes through ib.storage
    const notDeck = (p: string) => {
      // however it's written: ".ICEBREAKER" is the same folder on a Mac or on Windows
      if (isDeckPath(String(p))) throw new Error(`${m.id}: .icebreaker/ is the deck's own folder (your data: ib.storage)`);
    };
    const player = () => {
      if (!deck.platform.player) throw new Error("the music player needs the desktop app");
      return deck.platform.player;
    };
    const google = () => {
      if (!deck.platform.google) throw new Error("Google needs the desktop app");
      return deck.platform.google;
    };
    let storageQueue: Promise<void> = Promise.resolve();
    const readData = async (): Promise<Record<string, unknown>> => {
      let text = "";
      try {
        if (!(await deck.vault.exists(dataPath))) return {};
        text = await deck.vault.read(dataPath);
        return JSON.parse(text);
      } catch {
        // a broken file would be overwritten by the next ib.storage.set (a whole TODO list…): keep a copy
        if (text) await deck.vault.write(`${dataPath}.broken`, text).catch(() => {});
        return {};
      }
    };

    const api: IcebreakerAPI = {
      version: APP_VERSION,
      manifest: m,
      commands: {
        register: (cmd) => {
          // the deck's own sensitive commands can't be taken over (a fake `vault` could ask for your password)
          const names = [cmd.name, ...(cmd.aliases ?? [])];
          const taken = names.find((n) => PRIVILEGED_NAMES.has(n));
          if (taken) throw new Error(`${m.id}: the command name "${taken}" is the deck's own`);
          for (const n of names) {
            const before = deck.commands.get(n);
            if (before) mine("command", n, before.source ?? "core");
          }
          deck.commands.register({ ...cmd, source: m.id });
        },
      },
      apps: {
        register: (spec) => (mine("page", spec.kind, deck.apps.sourceOf(spec.kind)), deck.apps.register(spec, m.id)),
        // a STORE / vault module opens its own pages with what it likes; the deck's pages only
        // with a note, a folder or a day (never a prompt for the AI, a command…)
        open: (kind, args) => deck.openApp(kind, !thirdParty || deck.apps.sourceOf(kind) === m.id || typeof args === "string" || args instanceof Date ? args : undefined),
      },
      palette: { register: (a) => (mine("action", a.id, deck.actions.sourceOf(a.id)), deck.actions.register(a, m.id)) },
      shell: { run: (line) => deck.shell.runUntrusted(String(line), origin) },
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
        connect: (onPhase) => (need("google-calendar"), google().connect(onPhase)),
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
        // a STORE / vault module reads notes — not the deck's own folder (other modules' data
        // and code, the shell's history): its own data is ib.storage
        read: (p) => (need("vault:read"), thirdParty && notDeck(p), deck.vault.read(p)),
        exists: (p) => (need("vault:read"), thirdParty && notDeck(p), deck.vault.exists(p)),
        notes: () => (need("vault:read"), deck.vault.markdown().map((e) => e.path)),
        write: (p, c) => (need("vault:write"), notDeck(p), deck.vault.write(p, c)),
        append: (p, t) => (need("vault:write"), notDeck(p), deck.vault.append(p, t)),
        mkdir: (p) => (need("vault:write"), notDeck(p), deck.vault.mkdir(p)),
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
      stats: (() => {
        const own = (name: string) => (name.includes(".") ? name : `${m.id}.${name}`);
        const mine = (name: string) => {
          const id = own(name);
          if (!id.startsWith(`${m.id}.`)) throw new Error(`plugin "${m.id}" can only write its own stats (${m.id}.…), not "${id}"`);
          return id;
        };
        const readable = (id: string) => id.startsWith(`${m.id}.`) || granted.has("stats:read");
        const canRead = (id: string) => {
          if (!readable(id)) need("stats:read");
          return id;
        };
        const st = deck.stats;
        return {
          define: (name, meta) => st.define(mine(name), meta, m.id),
          set: (name, value, meta) => st.set(mine(name), value, m.id, meta),
          add: (name, delta = 1, meta) => st.add(mine(name), delta, m.id, meta),
          get: (id) => st.get(canRead(own(id))),
          series: (id, days) => st.series(canRead(own(id)), days),
          list: async (prefix) => (await st.list(prefix)).filter((s) => readable(s.id)),
          remove: (name) => st.remove(mine(name)),
          onChange: (fn) => st.onChange((id) => readable(id) && fn(id)),
        };
      })(),
      settings: {
        register: (specs) => {
          deck.moduleSettings.set(m.id, specs);
          deck.prefs.register(m.id, () => moduleSettingRows(deck, m.id));
        },
        get: <T,>(key: string) => deck.moduleSettingValue(m.id, key) as T,
        set: (key, value) => deck.setModuleSetting(m.id, key, value),
        onChange: (fn) => void deck.moduleSettingListeners.set(m.id, [...(deck.moduleSettingListeners.get(m.id) ?? []), fn]),
      },
      use: (module) => deck.services.proxy(caller, module),
      debug: (text) => deck.debug(String(text), m.id),
      catalog: {
        list: (kind, words = "") => deck.catalog.info(kind, String(words)),
        get: (kind, id) => deck.catalog.info(kind).find((b) => b.id === String(id)),
        kinds: () => BLOCK_KINDS,
      },
      modules: {
        expose: (name, spec) => deck.services.expose(m.id, name, spec),
        call: (module, name, ...args) => deck.services.call(caller, module, name, args) as Promise<never>,
        has: (module, name) => deck.services.has(module, name),
        list: (module) => deck.services.list(module),
        installed: () => deck.plugins.list().map((p) => ({ id: p.manifest.id, name: p.manifest.name, active: p.active })),
      },
      // ⌘Z: the module's own changes (a task added, a reminder done) are steps like the deck's
      history: {
        record: (step) => deck.history.record({ ...step, label: String(step.label) }),
      },
      storage: {
        get: async <T,>(key: string, fallback: T) => ((await readData())[key] as T) ?? fallback,
        // one write at a time: two set() calls not awaited would otherwise each read the
        // old file and the second would drop the first one's key
        set: (key, value) =>
          (storageQueue = storageQueue.catch(() => {}).then(async () => {
            const data = await readData();
            data[key] = value;
            await deck.vault.write(dataPath, JSON.stringify(data, null, 2));
          })),
      },
      ui: {
        notify: (text, kind) => deck.notify(`${m.name}: ${text}`, kind),
        confirm: (t, d) => deck.confirm(from(t), d),
        prompt: (t, o) => deck.prompt(from(t), o),
        choose: (t, options, o) => deck.choose(from(t), options, o),
        pickFolder: (title, start) => pickFolder(deck, from(title), start),
        pickFile: (title, exts, start) => pickFile(deck, from(title), exts, start),
        // on screen, a module from the STORE signs its alert; the voice reads only what it says
        alert: (title, body) => deck.alert(from(title), body, "reminders", spokenAlert(String(title), body)),
        say: (text, topic) => deck.speak((["calendar", "reminders", "timers", "weather", "system"].includes(topic ?? "") ? topic : "modules") as VoiceTopic, text),
        theme: () => deck.theme,
        redraw: () => deck.requestFrame(),
      },
      lib,
    };
    // one module can't rewire the API another one gets (ib.ui.notify = …)
    return freezeApi(api);
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

/** Freeze the API object and its sections (not what they return: themes, apps…). */
function freezeApi<T extends object>(api: T): T {
  for (const v of Object.values(api)) if (v && typeof v === "object" && Object.getPrototypeOf(v) === Object.prototype) Object.freeze(v);
  return Object.freeze(api);
}
