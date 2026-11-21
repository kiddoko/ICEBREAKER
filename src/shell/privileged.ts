/**
 * What a line that isn't you may never do — a module's (`ib.shell.run`, a click on one
 * of its areas, a function another module calls) or a program's in your real terminal
 * (shell/origin.ts): the vault's encryption and where it is, the accounts, factory-reset,
 * installing / switching / removing modules, updates, quitting or locking the deck — and anything that runs a program or plants a command for later:
 * scripts (`script x` runs bash / python… in your real terminal), your macros,
 * shortcuts and THE MENU's keys (`bind`, `menu add`, `keys set`: your next key press
 * would run it as you), pins and shortcut squares (`pin`, `home link`), the settings
 * that hold commands or decide what runs, and undoing what YOU did (`undo`, `redo`). `modules call` is refused too: it calls any
 * function with every permission. exec.ts refuses these (aliases and `;` / `&&` chains
 * included), and no module may register a command of these names (a fake `vault` could
 * ask for your password). Your own typing is never limited.
 */

/** Command names (and aliases) no module may take over. */
export const PRIVILEGED_NAMES = new Set([
  "vault", "account", "passwd", "logout", "lock", "login", "password", "sudo", "factory-reset", "plugin", "plugins", "config", "set", "script", "scripts",
  "bind", "unbind", "macro", "store", "update", "updates", "modules", "menu", "wheel", "keys", "shortcuts", "pin", "unpin", "stealth", "exit", "quit", "reboot",
]);

/** the settings that hold commands, or decide what runs, where things go and what leaves the computer */
const SETTINGS = /^(privacy|plugins|ai|keys|keyoverrides|menu|shell|updates|vault|favorites|gamepad|home|modulesettings|session|setup)(\.|$)/i;

const flagless = (args: string[]): string[] => args.filter((a) => !a.startsWith("-")).map((a) => a.toLowerCase());

/**
 * Would this command, with these arguments, be refused coming from a module or your real
 * terminal? A command may read its sub-command as the first word or as the first word that
 * isn't a flag (`vault --window decrypt`): BOTH readings must be allowed, so no flag placed
 * in front can make the check and the command disagree.
 */
export function isPrivileged(name: string, args: string[]): boolean {
  const words = flagless(args);
  const subs = [...new Set([(args[0] ?? "").toLowerCase(), words[0] ?? ""])];
  /** every reading of the sub-command is one of these */
  const only = (...ok: string[]) => subs.every((s) => ok.includes(s));
  /** some reading of the sub-command is one of these */
  const any = (...bad: string[]) => subs.some((s) => bad.includes(s));
  switch (name) {
    case "vault":
      // looking is fine; everything else (encrypt, decrypt, export, recovery, rekey, unlock, adopt, mount, move…) is yours
      return !only("", "status", "rescan");
    case "plugin":
    case "plugins":
      return !only("", "ls", "list", "audit", "search");
    case "store":
      return !only("", "ls", "list", "search", "info", "open");
    case "update":
    case "updates":
      return !only("", "check", "settings");
    case "config":
      // reading is fine; changing: not the settings that hold commands or decide what runs
      if (!only("", "list", "ls", "get", "path", "set", "reset")) return true;
      if (any("set", "reset")) return [args[1] ?? "", words[1] ?? ""].some((k) => !k || k.startsWith("-") || SETTINGS.test(k));
      return false;
    case "macro":
      // shown or hidden, never made — nor pressed: it types in your real terminal
      return !only("", "ls", "list", "show", "hide", "toggle");
    case "modules":
      // `modules call` calls any function with every permission; `modules set` changes another module's settings
      return !only("", "api", "ls", "list");
    case "menu":
    case "wheel":
      return !only("", "ls", "list", "open");
    case "keys":
    case "shortcuts":
      return !only("", "ls", "list");
    case "home":
      // a shortcut square runs its command as you
      return any("link", "links", "reset");
    case "stealth":
      return !only("", "on");
    case "theme":
    case "voice":
      // downloads
      return any("install");
    default:
      return ["account", "passwd", "logout", "lock", "factory-reset", "script", "scripts", "bind", "unbind", "pin", "unpin", "exit", "quit", "reboot", "starthere", "undo", "redo"].includes(name);
  }
}
