import { PRIVILEGED_NAMES } from "../shell/privileged";
import type { Origin } from "../shell/origin";
import { describePerm, Grants, levelOf, levelRank, missing, parsePerm, readPerms, sortPerms, quietWrite } from "./permissions";
import type { PermDialogSpec, PermLine } from "../workspace/permdialog";
import { isOfficialSource } from "./install";
import { stealth } from "../core/stealth";
import { t } from "../core/i18n";
import { NO } from "../ui/dialog";
import { isDeckPath } from "../vault/paths";
import { FRAME_PARTS, frameServices } from "./frame-services";
import { sandboxed } from "./sandbox/bridge";
import { AudioStream } from "../core/audiostream";
import { pickFile, pickFileBytes, pickFileText, pickFolder } from "../workspace/filebrowser";
import { whenForModules } from "../ui/calendar";
import { auditCode, auditReport, type AuditFinding } from "./audit";
import { moduleSettingRows } from "../apps/settings-rows";
import { BLOCK_KINDS } from "../core/catalog";
import type { VoiceTopic } from "../deck";
import { corePackageEntries } from "./core-packages";
import { registerBackground } from "../fx/backgrounds";
import { vaultTools } from "../ai/tools";
import type { Deck } from "../deck";
import { spokenAlert } from "../core/voice";
import type { IcebreakerAPI, PluginManifest, PluginModule } from "./api";
import * as lib from "./lib";
import type { App } from "../apps/types";

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
        p.error = `asks for more than you approved (${more.map((x) => describePerm(x).label + (parsePerm(x)?.scope ? ` → ${parsePerm(x)!.scope}` : "")).join(", ")}): plugin enable ${id}`;
        continue;
      }
      // …and with the code you approved: changed since (another program or a sync wrote in the
      // vault, another vault holds a module of the same name), it stays off until you look again
      if (p.source === "vault" && !(await this.sameCode(p, trustChanges))) {
        // (said as what happened and what to do: "needs you — see the LOG" said neither)
        p.error = (this.deck.settings.data.plugins.pinned ?? {})[id]
          ? `its code changed since you approved it — the copy in the vault isn't the one you approved (an update, a sync, a file put there by hand). Read it and switch it on again: plugin enable ${id} (or the STORE)`
          : `not approved on this deck yet: plugin enable ${id}`;
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
    if (!Array.isArray(granted[p.manifest.id])) return null;
    return missing(this.asks(p.manifest), granted[p.manifest.id]);
  }

  // ── permissions (plugins/permissions.ts, docs/PERMISSIONS.md) ─────────────

  /** written before 0.6's permissions (no `"api": 2`): it also notifies and runs the deck's commands, as every module could */
  static legacy(m: PluginManifest): boolean {
    return !(typeof m.api === "number" && m.api >= 2);
  }

  /** What a module's plugin.json asks for, in today's names. */
  asks(m: PluginManifest): string[] {
    return readPerms(m.permissions, PluginHost.legacy(m)).perms;
  }

  /**
   * What a module may use right now: what you approved (a STORE / vault module) or what it
   * declares (one that ships with the deck), minus what you took away.
   */
  effective(id: string): string[] {
    const p = this.plugins.find((x) => x.manifest.id === id);
    if (!p) return [];
    const s = this.deck.settings.data.plugins;
    const base = p.source === "vault" ? (Array.isArray(s.granted?.[id]) ? s.granted[id] : []) : this.asks(p.manifest);
    const off = s.revoked?.[id] ?? [];
    return off.length ? base.filter((x) => !off.includes(x)) : base;
  }

  /** A module's permissions, for the page and `plugin perms`: each with whether it's on and when it was last used. */
  permissionsOf(id: string): { perm: string; on: boolean; always: boolean; lastUse?: number }[] {
    const p = this.plugins.find((x) => x.manifest.id === id);
    if (!p) return [];
    const s = this.deck.settings.data.plugins;
    const all = p.source === "vault" ? (Array.isArray(s.granted?.[id]) ? s.granted[id] : this.asks(p.manifest)) : this.asks(p.manifest);
    const off = s.revoked?.[id] ?? [];
    const always = s.always?.[id] ?? [];
    return sortPerms(all).map((perm) => ({ perm, on: !off.includes(perm), always: always.includes(perm), lastUse: this.deck.access.lastUse(id, parsePerm(perm)?.base ?? perm) }));
  }

  /** Take a permission away from a module (it keeps running; what needs it says so). False: it didn't have it. */
  revoke(id: string, perm: string): boolean {
    const name = this.permissionsOf(id).find((x) => x.perm === perm || parsePerm(x.perm)?.base === perm)?.perm;
    if (!name) return false;
    const s = this.deck.settings;
    const off = s.data.plugins.revoked ?? {};
    if (!(off[id] ?? []).includes(name)) s.set("plugins.revoked", { ...off, [id]: [...(off[id] ?? []), name] });
    // taken away: "always" goes with it (given back, it's asked again at first use)
    const always = s.data.plugins.always ?? {};
    if ((always[id] ?? []).includes(name)) s.set("plugins.always", { ...always, [id]: always[id].filter((x) => x !== name) });
    // no more sound: silenced now (it's told, like `audio stop`, so its song stops too), and its
    // stream closed — a frame it was already writing kept playing (BreakerMED did, 0.6.1)
    if (parsePerm(name)?.base === "audio") this.deck.mixer.stop(id, true), this.deck.mixer.closeStream(id);
    this.deck.requestFrame();
    return true;
  }

  /** Give back a permission you took away. Never more than what was approved: that's `plugin enable`. */
  grant(id: string, perm: string): boolean {
    const s = this.deck.settings;
    const off = s.data.plugins.revoked ?? {};
    const name = (off[id] ?? []).find((x) => x === perm || parsePerm(x)?.base === perm);
    if (!name) return false;
    const left = off[id].filter((x) => x !== name);
    const { [id]: _gone, ...rest } = off;
    s.set("plugins.revoked", left.length ? { ...rest, [id]: left } : rest);
    this.deck.requestFrame();
    return true;
  }

  /** the high-risk questions being asked now (two writes at once ask once) */
  private asking = new Map<string, Promise<string>>();
  /** "this time": until when (ms), by module and permission */
  private once = new Map<string, number>();
  /** "no": until when (ms) — the same action's next steps (the file after its folder) aren't asked again */
  private refused = new Map<string, number>();

  /**
   * A high-risk permission is about to be really used by a STORE / vault module: the first
   * time, you're asked — this time / always / no. A "total" one (your real terminal) shows
   * every command unless you said always. Throws when you say no.
   */
  async gate(m: PluginManifest, perm: string, target: string, command?: string): Promise<void> {
    const want = parsePerm(perm) ?? (perm === "net" ? { base: "net" as const } : null);
    if (!want) return;
    // the name you approved that covers this use ("vault:write:songs/" for songs/a.bmed)
    const name = this.effective(m.id).find((g) => new Grants(() => [g]).has(want.base, target || undefined));
    if (!name) return; // (not allowed at all: `need` already said so)
    const level = levelOf(name);
    if (levelRank(level) < levelRank("high")) return;
    const s = this.deck.settings;
    if ((s.data.plugins.always?.[m.id] ?? []).includes(name)) return;
    const key = `${m.id}|${name}`;
    if (level !== "total" && (this.once.get(key) ?? 0) > Date.now()) return;
    const d = describePerm(name, t);
    const no = () => new Error(t("{m}: you said no to “{p}”", { m: m.name.toLowerCase(), p: d.label }));
    // you just said no to this: the rest of the same action (an export's file after its folder) stops
    // without a second question — its autosave too
    if (level !== "total" && (this.refused.get(key) ?? 0) > Date.now()) throw no();
    // its own autosave (a .recovery/ folder in the folder you granted): never a question mid-work
    if (want.base === "vault:write" && quietWrite(target, name)) return;
    const scope = parsePerm(name)?.scope;
    const what = want.base === "vault:write" ? t("It wants to write: {x}", { x: target || "?" }) : want.base === "net" ? t("It wants to reach: {x}", { x: target || "?" }) : "";
    const spec: PermDialogSpec = {
      frame: t("{m} (module) asks", { m: m.name.toLowerCase() }),
      heading: level === "total" ? `⚠ ${t("TOTAL: this command has all your rights on this computer")}` : what,
      command,
      lines: [{ icon: d.icon, label: d.label, scope: d.scope, level: d.level }],
      body: level === "total" ? [] : [d.means],
      buttons: [
        { label: NO(), value: "no", key: "n", tone: "error" },
        { label: t("[T]his time"), value: "once", key: "t" },
        { label: level === "total" ? t("[A]lways for this module") : scope ? t("[A]lways in {x}", { x: scope }) : t("[A]lways"), value: "always", key: "a", tone: level === "total" ? "warning" : undefined },
      ],
      selected: level === "total" ? 0 : 1,
    };
    // a command for the terminal is its own question each time; the rest: one question at a time
    let ask = level === "total" ? undefined : this.asking.get(key);
    if (!ask) {
      const asked = this.deck.askPermission(spec);
      ask = asked;
      if (level !== "total") {
        this.asking.set(key, asked);
        void asked.finally(() => this.asking.delete(key));
      }
    }
    const answer = await ask;
    if (answer === "always") {
      const always = s.data.plugins.always ?? {};
      if (!(always[m.id] ?? []).includes(name)) s.set("plugins.always", { ...always, [m.id]: [...(always[m.id] ?? []), name] });
      return;
    }
    if (answer === "once") {
      // "this time" is this action: what it does in the next moments (several files of one export)
      if (level !== "total") this.once.set(key, Date.now() + 10_000);
      return;
    }
    if (level !== "total") this.refused.set(key, Date.now() + 10_000);
    throw no();
  }

  /**
   * Why a module that should be on is off, in a few words a person reads at start
   * ("its code changed", "asks for more", "not approved yet", "needs todo") — the whole
   * reason is `p.error`, in the LOG and in `plugin ls`.
   */
  static shortReason(error: string): string {
    if (error.startsWith("its code changed")) return "its code changed since you approved it";
    if (error.startsWith("asks for more")) return "asks for more than you approved";
    if (error.startsWith("not approved")) return "not approved here yet";
    if (error.startsWith("needs ")) return error.split(" — ")[0];
    return error.split("\n")[0].slice(0, 60);
  }

  /** `gate` for a module known by its id (the deck's functions it calls: plugins/frame-services.ts). */
  async gateById(id: string, perm: string, target: string, command?: string): Promise<void> {
    const p = this.plugins.find((x) => x.manifest.id === id);
    if (p && p.source === "vault") await this.gate(p.manifest, perm, target, command);
  }

  /** The lines of the dialog for a list of permissions (what's `fresh` is marked new). */
  permLines(perms: string[], m: PluginManifest, fresh: string[] = []): PermLine[] {
    const implied = PluginHost.legacy(m) ? new Set(["notify", "shell"].filter((x) => !(m.permissions ?? []).includes(x as never))) : new Set<string>();
    return sortPerms(perms).map((perm) => {
      const d = describePerm(perm, t);
      const note =
        d.level === "total" ? t("every command is shown to you first")
        : d.level === "high" ? t("asked again the first time it's really used")
        : implied.has(perm) ? t("every module could before 0.6 — this one was written then")
        : d.level === "medium" ? d.means
        : undefined;
      return { icon: d.icon, label: d.label, scope: d.scope, level: d.level, note, fresh: fresh.includes(perm) };
    });
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
    // the modules' pages open now are made again from the new code: a tab that kept the old
    // page would show the old module (a sandboxed one: its last frame, frozen) until reopened
    const deck = this.deck;
    const theirs = deck.workspace.tabs.filter((a) => this.isModulePage(a.kind)).map((app) => ({ app, kind: app.kind, args: deck.appArgs.get(app) }));
    for (const { app } of theirs) await Promise.resolve(app.close?.()).catch(() => {});
    for (const p of this.active()) await this.deactivate(p);
    await this.init(trustChanges);
    for (const { app, kind, args } of theirs) {
      const spec = this.isModulePage(kind) ? deck.apps.get(kind) : undefined;
      let fresh: App | null = null;
      try {
        fresh = spec ? spec.create(deck, args) : null;
      } catch (e) {
        deck.log.add("error", `[${kind}] ${e instanceof Error ? e.message : String(e)}`);
      }
      if (fresh) deck.appArgs.set(fresh, args);
      deck.workspace.replaceTab(app, fresh);
    }
  }

  /** a page that a module (not the deck's core) registered */
  private isModulePage(kind: string): boolean {
    const from = this.deck.apps.sourceOf(kind);
    const p = from ? this.plugins.find((x) => x.manifest.id === from) : undefined;
    return !!p && !p.manifest.core;
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
  // (the safe answer is no: Yes was lit for a module asking to write in your vault)
  async enable(id: string, ask?: (title: string, detail: string) => Promise<boolean>, seen = new Set<string>()): Promise<boolean> {
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
      const m = p.manifest;
      const { perms, unknown } = readPerms(m.permissions, PluginHost.legacy(m));
      const s = this.deck.settings;
      // what its code does that a module shouldn't need (plugins/audit.ts)
      const report = auditReport(await this.audit(id).catch(() => []));
      // what's new since what you approved (an update that asks for more): marked
      const before = Array.isArray(s.data.plugins.granted?.[id]) ? s.data.plugins.granted[id] : null;
      const fresh = before ? missing(perms, before) : [];
      const source = (m as { source?: string }).source;
      const risky = perms.some((x) => levelRank(levelOf(x)) >= levelRank("high")) || unknown.length > 0;
      let ok: boolean;
      if (ask) {
        // asked in the shell (`plugin enable`): the same words, as text
        const lines = this.permLines(perms, m, fresh).map((l) => `  ${l.icon} ${l.label}${l.scope ? ` → ${l.scope}` : ""}  [${l.level}]${l.fresh ? " (new)" : ""}${l.note ? `\n      ${l.note}` : ""}`);
        ok = await ask(
          `Switch the module ${m.name} on?`,
          `${m.description ?? ""}\nby ${m.author ?? "unknown"} · this copy: v${m.version}\n\nIt asks for:\n${lines.join("\n") || "  nothing"}${unknown.length ? `\n\n⚠ it also names permissions this deck doesn't know (ignored): ${unknown.join(", ")}` : ""}\n\n${report}\n\nIt runs in a sandbox: only what its permissions allow, nothing of the deck, the page or the network. Its code: ${VAULT_PLUGIN_DIR}/${id}/. You can take any permission away later: plugin revoke ${id} <permission>.`,
        );
      } else {
        const answer = await this.deck.askPermission({
          frame: t(before ? "A MODULE ASKS FOR MORE" : "SWITCH A MODULE ON"),
          heading: `${m.name.toLowerCase()} · v${m.version} · ${t("by {a}", { a: m.author ?? t("unknown") })}`,
          facts: [
            source && isOfficialSource(source) ? `✔ ${t("from the official STORE")}` : source ? `⚠ ${t("not from the official STORE: {s}", { s: source })}` : `⚠ ${t("put in the vault by hand: nobody checked it")}`,
            ...report.split("\n").filter(Boolean),
            ...(unknown.length ? [`⚠ ${t("it also names permissions this deck doesn't know (ignored): {l}", { l: unknown.join(", ") })}`] : []),
          ],
          intro: perms.length ? t(fresh.length ? "This version asks for (new ones marked):" : "This module asks for:") : t("This module asks for nothing."),
          lines: this.permLines(perms, m, fresh),
          body: [
            t("Without asking, it can: show its page and widgets, keep its own data and settings, ask you questions under its name."),
            t("It never can: go online by itself, touch your accounts, the encryption, other modules, your screen's layout or your alarms."),
            t("You can take any of these away later: Settings → PERMISSIONS."),
          ],
          buttons: [
            { label: NO(), value: "no", key: "n", tone: "error" },
            { label: t("[R]ead its code"), value: "code", key: "r" },
            { label: t("[Y]es, switch it on"), value: "yes", key: "y" },
          ],
          // the safe answer is no as soon as one line is high-risk
          selected: risky ? 0 : 2,
        });
        if (answer === "code") void this.deck.openFile(`${VAULT_PLUGIN_DIR}/${id}/${m.main ?? "main.js"}`);
        ok = answer === "yes";
      }
      if (!ok) return false;
      // what you just read and approved: the module never runs with more (init, unapproved)
      s.set("plugins.granted", { ...(s.data.plugins.granted ?? {}), [id]: perms });
      // a fresh approval: nothing is "always" yet, nothing is taken away
      const { [id]: _a, ...always } = s.data.plugins.always ?? {};
      const { [id]: _r, ...revoked } = s.data.plugins.revoked ?? {};
      s.set("plugins.always", always);
      s.set("plugins.revoked", revoked);
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
      const { [id]: _a, ...always } = s.data.plugins.always ?? {};
      const { [id]: _r, ...revoked } = s.data.plugins.revoked ?? {};
      s.set("plugins.granted", granted);
      s.set("plugins.pinned", pinned);
      s.set("plugins.always", always);
      s.set("plugins.revoked", revoked);
    } else s.set("plugins.disabled", [...new Set([...s.data.plugins.disabled, id])]);
    if (!p.active) return false;
    // its pages close with it (a removed module's tab stayed open on a page that was gone)
    const pages = this.deck.workspace.tabs.filter((a) => this.deck.apps.sourceOf(a.kind) === id);
    await this.deactivate(p);
    for (const app of pages) this.deck.workspace.replaceTab(app, null);
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
    // its sound stops, its samples go
    this.deck.mixer.release(id);
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
    // what it may use is read at every call (plugins.granted / revoked): a permission you take
    // away stops working at once, without a restart
    const granted = new Grants(() => this.effective(m.id));
    /** the access journal (core/access.ts): which permission, on what — a name, never the content */
    const note = (perm: string, what = "") => {
      const base = parsePerm(perm)?.base ?? perm;
      // a module that ships with the deck reads notes all day (TODO, CALENDAR…): its reads aren't
      // journaled — what it writes, asks the AI or sends is
      if (!thirdParty && (base === "vault:read" || base === "notify" || base === "media:control")) return;
      deck.access.note(m.id, base, what);
    };
    // the lines it runs carry its origin (shell/origin.ts): privileged commands refused for every
    // module; a STORE / vault module's lines read and write only what its permissions allow, and
    // one that ships with the deck everything but what you took away from it
    const origin: Origin = {
      source: m.id,
      grants: thirdParty ? granted : new Grants(() => deck.settings.data.plugins.revoked?.[m.id] ?? [], true),
      gate: thirdParty ? (perm, target) => this.gate(m, perm, target) : undefined,
      note,
    };
    const caller = { id: m.id, permissions: granted, origin };
    // a window a STORE / vault module opens says who is asking (it could ask "your password")
    const from = (title: string) => (thirdParty ? `${m.name} (module) — ${String(title)}` : title);
    /** `perm` — on `target` (a note's path, a host) when given — or a clear error */
    const need = (perm: string, target?: string) => {
      if (granted.has(perm, target)) return;
      const label = describePerm(perm).label;
      const want = parsePerm(perm) ?? (perm === "net" ? { base: "net" as const } : null);
      const off = (deck.settings.data.plugins.revoked?.[m.id] ?? []).some((x) => parsePerm(x)?.base === want?.base);
      if (off) throw new Error(`${m.name}: you took “${label}” away from it (Settings → PERMISSIONS, or: plugin grant ${m.id} ${perm})`);
      if (target !== undefined && granted.has(perm)) throw new Error(`${m.name}: “${label}” is allowed only ${want?.base === "net" ? "for the hosts" : "in the folders"} you approved — not ${target}`);
      throw new Error(`plugin "${m.id}" needs the "${perm}${want?.base === "net" && target ? `:${target}` : ""}" permission in its plugin.json`);
    };
    /** a high-risk permission really used: asked the first time (a STORE / vault module) */
    const gate = async (perm: string, target: string, command?: string) => {
      if (thirdParty) await this.gate(m, perm, target, command);
    };
    /** the folders a narrowed vault permission is limited to: is this entry in (or on the way to) one? */
    const inScope = (path: string, isDir = false) => {
      const folders = granted.folders("vault:read");
      if (!folders) return true;
      const p = path.toLowerCase();
      return folders.some((f) => (p + "/").startsWith(f.toLowerCase()) || (isDir && f.toLowerCase().startsWith(p + "/")));
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
      // (the shell checks "shell" itself, on every line with an origin — a click on one of its areas too)
      shell: { run: (line) => deck.shell.runUntrusted(String(line), origin) },
      // the internet, one approved host at a time, through the deck's native side
      net: {
        get: async (url) => {
          let u: URL;
          try {
            u = new URL(String(url));
          } catch {
            throw new Error(`net.get: "${String(url)}" isn't an address`);
          }
          if (u.protocol !== "https:" || u.username || u.password) throw new Error("net.get: only https:// addresses, without a user name");
          need("net", u.hostname.toLowerCase());
          if (stealth.on) throw new Error(`stealth mode: ${m.name} can't go online (stealth off to allow it)`);
          if (!deck.platform.netGet) throw new Error("net.get needs the desktop app");
          await gate("net", u.hostname.toLowerCase());
          note("net", u.hostname.toLowerCase());
          return deck.platform.netGet(u.toString());
        },
      },
      media: {
        available: () => !!deck.platform.media,
        status: async () => {
          need("media:control");
          if (!deck.platform.media) throw new Error("music control needs the desktop app");
          return deck.platform.media.status();
        },
        control: async (action) => {
          need("media:control");
          if (!deck.platform.media) throw new Error("music control needs the desktop app");
          note("media:control", String(action));
          return deck.platform.media.control(action);
        },
        // the audio files of any folder of the computer: its own permission (not the vault's)
        player: {
          available: () => !!deck.platform.player,
          scan: (folder) => (need("media:files"), note("media:files", String(folder)), player().scan(folder)),
          load: (path, play = true, duration) => (need("media:files"), note("media:files", String(path)), player().load(path, play, duration)),
          control: (action) => (need("media:files"), player().control(action)),
          status: () => (need("media:files"), player().status()),
        },
      },
      google: {
        available: () => !!deck.platform.google,
        status: () => (need("google-calendar:read"), google().status()),
        setup: (id, secret) => (need("google-calendar"), google().setup(id, secret)),
        connect: (onPhase) => (need("google-calendar"), google().connect(onPhase)),
        disconnect: () => (need("google-calendar"), google().disconnect()),
        calendar: async (method, path, opts = {}) => {
          // reading is its own, narrower permission; anything that changes needs the whole one
          need(String(method).toUpperCase() === "GET" ? "google-calendar:read" : "google-calendar");
          note("google-calendar", `${String(method).toUpperCase()} ${String(path).split("?")[0]}`);
          const query = Object.entries(opts.query ?? {})
            .filter(([, v]) => v !== undefined)
            .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
            .join("&");
          const text = await google().calendar(method, path, query || undefined, opts.body === undefined ? undefined : JSON.stringify(opts.body));
          return text.trim() ? JSON.parse(text) : null;
        },
        cache: {
          read: async <T,>(fallback: T) => {
            need("google-calendar:read");
            try {
              const t = await google().cache();
              return t ? (JSON.parse(t) as T) : fallback;
            } catch {
              return fallback;
            }
          },
          write: async (value) => {
            need("google-calendar:read");
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
        read: async (p) => (need("vault:read", String(p)), thirdParty && notDeck(p), note("vault:read", String(p)), deck.vault.read(p)),
        exists: async (p) => (need("vault:read", String(p)), thirdParty && notDeck(p), deck.vault.exists(p)),
        // (allowed in some folders only: their notes)
        notes: () => (need("vault:read"), deck.vault.markdown().map((e) => e.path).filter((x) => inScope(x))),
        modified: async () => (need("vault:read"), Object.fromEntries(deck.vault.markdown().filter((e) => inScope(e.path)).map((e) => [e.path, e.modified]))),
        // changing notes is high-risk: the first time it really writes, you're asked
        write: async (p, c) => (need("vault:write", String(p)), notDeck(p), await gate("vault:write", String(p)), note("vault:write", String(p)), deck.vault.write(p, c)),
        append: async (p, text) => (need("vault:write", String(p)), notDeck(p), await gate("vault:write", String(p)), note("vault:write", String(p)), deck.vault.append(p, text)),
        mkdir: async (p) => (need("vault:write", String(p)), notDeck(p), await gate("vault:write", String(p)), note("vault:write", String(p)), deck.vault.mkdir(p)),
        readBytes: async (p) => (need("vault:read", String(p)), thirdParty && notDeck(p), note("vault:read", String(p)), deck.vault.readBytes(p)),
        // never the deck's own folders' contents (other modules' code, the trash's log…) for a STORE / vault module
        list: async (dir) => {
          need("vault:read");
          if (thirdParty) notDeck(dir);
          const all = await deck.vault.list(String(dir ?? ""));
          return all.filter((e) => (!thirdParty || !isDeckPath(e.path)) && inScope(e.path, e.isDir)).map((e) => ({ path: e.path, name: e.name, isDir: e.isDir, size: e.size, modified: e.modified }));
        },
        writeBytes: async (p, data) => {
          need("vault:write", String(p));
          notDeck(p);
          if (!(data instanceof Uint8Array || data instanceof ArrayBuffer)) throw new Error("vault.writeBytes: the data must be a Uint8Array");
          await gate("vault:write", String(p));
          note("vault:write", String(p));
          return deck.vault.writeBytes(p, data);
        },
      },
      // its own sound (core/mixer.ts): its samples and voices are its own, gone when it's switched off
      audio: {
        available: () => deck.mixer.available(),
        now: async () => (need("audio"), deck.mixer.now()),
        sample: async (id, data, opts) => (need("audio"), deck.mixer.sample(m.id, id, data, opts)),
        drop: async (id) => (need("audio"), deck.mixer.drop(m.id, id)),
        schedule: async (events) => (need("audio"), note("audio"), deck.mixer.schedule(m.id, events)),
        stop: async () => (need("audio"), deck.mixer.stop(m.id)),
        onStop: (fn) => (need("audio"), deck.mixer.onStop(m.id, fn)),
        stream: async () => (need("audio"), note("audio"), AudioStream.open(await deck.mixer.openStream(m.id))),
        decode: async (bytes) => (need("audio"), deck.mixer.decode(bytes)),
        // the encoder pack (encoders.rs): sound the module already has, as a file's bytes
        encode: async (pcm, opts) => {
          need("audio");
          const enc = deck.platform.encoders;
          if (!enc) throw new Error("audio.encode: needs the desktop app");
          if (!(pcm instanceof Float32Array)) throw new Error("audio.encode: the sound must be a Float32Array (interleaved)");
          const o = (opts ?? {}) as Partial<import("../platform/types").EncodeOptions>;
          if (!["mp3", "m4a", "ogg", "opus"].includes(o.format as string)) throw new Error("audio.encode: format mp3, m4a, ogg or opus");
          if (o.channels !== 1 && o.channels !== 2) throw new Error("audio.encode: channels 1 or 2");
          if (!Number.isInteger(o.rate)) throw new Error("audio.encode: the rate in Hz");
          if (!(await enc.info()).installed) throw new Error("the encoder pack isn't installed: run `encoders install` (once, ~3 MB)");
          return enc.encode(pcm, { format: o.format!, quality: typeof o.quality === "string" ? o.quality : "", rate: o.rate!, channels: o.channels, title: typeof o.title === "string" ? o.title : "" });
        },
        encoders: async () => {
          const i = await deck.platform.encoders?.info();
          return { installed: !!i?.installed, supported: !!i?.supported, formats: i?.installed ? i.formats : [] };
        },
      },
      ai: {
        ready: () => deck.ai.ready,
        problem: () => deck.ai.problem,
        ask: (prompt, opts) => (need("ai"), note("ai"), deck.ai.ask(prompt, opts)),
        session: (opts) => (need("ai"), note("ai"), deck.ai.session(opts)),
        vaultTools: () => {
          need("vault:read");
          // the tools list, search and read anywhere: not for a module allowed in some folders only
          if (granted.folders("vault:read")) throw new Error(`${m.name}: ai.vaultTools needs the whole vault ("vault:read"), not only some folders`);
          const tools = vaultTools(deck.vault, (title, d) => deck.confirm(title, d));
          return granted.has("vault:write") && !granted.folders("vault:write") ? tools : tools.filter((x) => x.name !== "write_note");
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
        notify: (text, kind) => (need("notify"), note("notify"), deck.notify(`${m.name}: ${text}`, kind)),
        confirm: (t, d) => deck.confirm(from(t), d),
        prompt: (t, o) => deck.prompt(from(t), o),
        choose: (t, options, o) => deck.choose(from(t), options, o),
        pickFolder: (title, start) => pickFolder(deck, from(title), start),
        pickWhen: (title, o) => deck.pickWhen(from(title), o ?? {}).then((r) => (r ? whenForModules(r) : null)),
        pickFile: (title, exts, start) => pickFile(deck, from(title), exts, start),
        pickFileText: (title, exts) => pickFileText(deck, from(title), exts),
        pickFileBytes: (title, exts) => pickFileBytes(deck, from(title), exts),
        // only the module's own page, only while it's the one in front — and only while the page
        // has the keyboard: folding the shell away would hand it the keys typed there (a password)
        fullWindow: (on = true) => {
          const app = deck.workspace.activeApp;
          if (!app || deck.apps.sourceOf(app.kind) !== m.id || deck.workspace.focus !== "main") return false;
          return deck.workspace.fullWindow(app, on !== false);
        },
        // on screen, a module from the STORE signs its alert; the voice reads only what it says
        alert: (title, body) => (need("notify"), deck.alert(from(title), body, "reminders", spokenAlert(String(title), body))),
        say: (text, topic) => (need("notify"), deck.speak((["calendar", "reminders", "timers", "weather", "system"].includes(topic ?? "") ? topic : "modules") as VoiceTopic, text)),
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
