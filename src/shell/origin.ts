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
import type { Permission } from "../plugins/api";
import { isDeckPath } from "../vault/paths";
import type { Vault } from "../vault/vault";

export interface Origin {
  /** a module's id, or "terminal" */
  source: string;
  grants: ReadonlySet<Permission> | "all";
}

export const allows = (o: Origin | null | undefined, perm: Permission): boolean => !o || o.grants === "all" || o.grants.has(perm);

/** Commands that talk to the AI provider (your key, your plan): a module needs "ai". */
export const AI_COMMANDS = new Set(["ask", "chat"]);

const READS = new Set(["read", "readMany", "trashLog", "toolFiles"]);
const WRITES = new Set(["write", "append", "mkdir", "trash", "rename", "restore"]);
const NEVER = new Set(["mount"]);

/** The vault as a module's line sees it: its permissions, and never the deck's own folder for writing. */
export function guardedVault(vault: Vault, o: Origin): Vault {
  if (o.grants === "all") return vault;
  const need = (perm: Permission, what: string): void => {
    if (!allows(o, perm)) throw new Error(`${o.source} needs the "${perm}" permission to ${what}`);
  };
  const mine = (...paths: unknown[]): void => {
    for (const p of paths.flat()) if (typeof p === "string" && isDeckPath(p)) throw new Error(`${o.source}: .icebreaker/ is the deck's own folder`);
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
          try {
            need("vault:read", "read notes");
            // notes, not the deck's own folder (other modules' data and code, the shell's history)
            if (name !== "trashLog") mine(...a);
          } catch (e) {
            return Promise.reject(e);
          }
          return fn(...a);
        };
      if (WRITES.has(name))
        return (...a: unknown[]) => {
          try {
            need("vault:write", "change notes");
            // trash / rename / restore: where it comes from and where it goes
            mine(...a);
          } catch (e) {
            return Promise.reject(e);
          }
          return fn(...a);
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
