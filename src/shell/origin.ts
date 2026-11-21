/**
 * WHO A COMMAND LINE COMES FROM. A line you type has no origin: it's you. A line a
 * module runs (`ib.shell.run`, a click on one of its areas, a function another module
 * calls) or a program sends from your real terminal carries one — for its whole run:
 * every command of the line, every line those commands run in turn (`ctx.shell.run`,
 * `deck.act`), the files they read and write. Nothing is a flag on a shared shell any
 * more: two lines running at once can't lend each other their rights.
 *
 *  - privileged commands are refused (shell/privileged.ts);
 *  - `grants` are the module's permissions (plugin.json): without `vault:read` its line
 *    reads no note and captures no output (no pipe, no `<`); without `vault:write` it
 *    writes none (no `>`, `touch`, `mv`, `rm`…); `.icebreaker/` — the deck's own folder:
 *    modules' code and data, scripts, themes, the shell's history — is never read or
 *    written; without `ai` it can't `ask`.
 *    Built-in modules and your real terminal have every grant ("all") — the privileged
 *    commands stay refused all the same.
 */
import type { Deck } from "../deck";
import type { PermSet } from "../plugins/permissions";
import { isDeckPath } from "../vault/paths";
import type { Vault } from "../vault/vault";

export interface Origin {
  /** a module's id, or "terminal" */
  source: string;
  /**
   * What it may reach (plugins/permissions.ts): "all" for your real terminal; a module's own
   * set otherwise — `everything` on it for a module that ships with the deck (all but what
   * you took away from it).
   */
  grants: (PermSet & { everything?: boolean }) | "all";
  /**
   * A high-risk permission is about to be really used (a note written, a host reached): asks
   * you the first time — this time / always / no — and throws when you say no. Set for the
   * STORE / vault modules (plugins/host.ts).
   */
  gate?: (perm: string, target: string) => Promise<void>;
  /** the access journal (core/access.ts): which permission, on what */
  note?: (perm: string, what: string) => void;
}

/** May this origin use `perm` — on `target` (a note's path, a host) when given, at all otherwise? */
export const allows = (o: Origin | null | undefined, perm: string, target?: string): boolean => !o || o.grants === "all" || o.grants.has(perm, target);

/** One of the deck's own: you, your real terminal, a module that ships with it — not a STORE / vault module. */
export const trusted = (o: Origin | null | undefined): boolean => !o || o.grants === "all" || o.grants.everything === true;

/** Commands that talk to the AI provider (your key, your plan): a module needs "ai". */
export const AI_COMMANDS = new Set(["ask", "chat"]);

const READS = new Set(["read", "readMany", "readBytes", "trashLog", "toolFiles"]);
const WRITES = new Set(["write", "append", "mkdir", "writeBytes", "trash", "rename", "restore"]);
const NEVER = new Set(["mount"]);
/** which arguments are paths (the rest is content: never read as one) */
const PATHS: Record<string, number[]> = { read: [0], readMany: [0], readBytes: [0], write: [0], append: [0], mkdir: [0], writeBytes: [0], trash: [0], rename: [0, 1], restore: [0, 1] };
const pathsOf = (name: string, a: unknown[]): string[] => (PATHS[name] ?? []).flatMap((i) => (Array.isArray(a[i]) ? (a[i] as unknown[]) : [a[i]])).filter((p): p is string => typeof p === "string");

/** The vault as a module's line sees it: its permissions, and never the deck's own folder for writing. */
export function guardedVault(vault: Vault, o: Origin): Vault {
  if (o.grants === "all") return vault;
  // a module that ships with the deck keeps the deck's own folder (its data is there); it only
  // loses what you took away from it
  const own = trusted(o);
  /** the permission, at all — and on every path named (a module allowed in one folder only) */
  const need = (perm: string, what: string, paths: string[]): void => {
    if (!allows(o, perm)) throw new Error(`${o.source} needs the "${perm}" permission to ${what}`);
    for (const p of paths) if (!allows(o, perm, p)) throw new Error(`${o.source} may ${what} only in the folders you allowed — not ${p}`);
  };
  const mine = (paths: string[]): void => {
    if (own) return;
    for (const p of paths) if (isDeckPath(p)) throw new Error(`${o.source}: .icebreaker/ is the deck's own folder`);
  };
  return new Proxy(vault, {
    get(target, prop) {
      const v = Reflect.get(target, prop, target) as unknown;
      if (typeof v !== "function") return v;
      const fn = (v as (...a: unknown[]) => unknown).bind(target);
      const name = String(prop);
      if (NEVER.has(name)) return () => Promise.reject(new Error(`${o.source}: not allowed from a module`));
      if (READS.has(name))
        return (...a: unknown[]) => {
          const paths = pathsOf(name, a);
          try {
            need("vault:read", "read notes", paths);
            // notes, not the deck's own folder (other modules' data and code, the shell's history)
            if (name === "toolFiles") mine([`.icebreaker/${String(a[0])}`]);
            else mine(paths);
          } catch (e) {
            return Promise.reject(e);
          }
          for (const p of paths) o.note?.("vault:read", p);
          return fn(...a);
        };
      if (WRITES.has(name))
        return (...a: unknown[]) => {
          const paths = pathsOf(name, a);
          try {
            need("vault:write", "change notes", paths);
            // trash / rename / restore: where it comes from and where it goes
            mine(paths);
          } catch (e) {
            return Promise.reject(e);
          }
          // the first time it really writes, you're asked (a high-risk permission)
          return (async () => {
            if (o.gate) await o.gate("vault:write", paths[0] ?? "");
            for (const p of paths) o.note?.("vault:write", p);
            return fn(...a);
          })();
        };
      return fn;
    },
  });
}

/**
 * The deck as a command sees it while it runs a line with an origin: `deck.vault` is
 * the guarded one, and what the command runs in turn (`deck.act`, `deck.shell.run…`)
 * keeps the origin. Once the command has returned (`live.on` false) it's the deck as
 * it is: what happens later is you, clicking in what the command opened.
 */
/** The real deck behind a guarded one (guardedDeck's Proxy answers it): what's kept per deck (the alarm clock) is kept on it. */
export const REAL_DECK = Symbol("realDeck");
export const realDeck = (deck: Deck): Deck => ((deck as unknown as Record<symbol, Deck | undefined>)[REAL_DECK] ?? deck);

export function guardedDeck(deck: Deck, o: Origin, run: (line: string) => Promise<number>, live: { on: boolean }): Deck {
  const vault = guardedVault(deck.vault, o);
  const shell = new Proxy(deck.shell, {
    get(target, prop) {
      const v = Reflect.get(target, prop, target) as unknown;
      if (live.on && (prop === "runLine" || prop === "runAction" || prop === "runUntrusted")) return (line: string) => run(line);
      return typeof v === "function" ? (v as (...a: unknown[]) => unknown).bind(target) : v;
    },
  });
  return new Proxy(deck, {
    get(target, prop) {
      if (prop === REAL_DECK) return target;
      if (live.on) {
        if (prop === "vault") return vault;
        if (prop === "act") return (line: string) => run(line);
        if (prop === "shell") return shell;
      }
      const v = Reflect.get(target, prop, target) as unknown;
      return typeof v === "function" ? (v as (...a: unknown[]) => unknown).bind(target) : v;
    },
  });
}
