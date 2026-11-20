import { fmt } from "../../core/ansi";
import type { Command, ShellContext } from "../types";

/** Ask for a new password twice; null if cancelled or they don't match. */
async function newPassword(ctx: ShellContext): Promise<string | null> {
  for (let i = 0; i < 3; i++) {
    const a = await ctx.read("new password", { mask: true, placeholder: "8 characters or more" });
    if (a === null) return null;
    if (a.length < 8) {
      ctx.err("too short: 8 characters or more\n");
      continue;
    }
    const b = await ctx.read("again", { mask: true });
    if (b === null) return null;
    if (a === b) return a;
    ctx.err("they don't match, once more\n");
  }
  return null;
}

export const account: Command = {
  name: "account",
  interactive: true,
  examples: [
    ["account", "who you are"],
    ["account passwd", "a new name or password"],
    ["logout", "back to the login page (lock does the same)"],
  ],
  aliases: ["passwd"],
  summary: "your account: its name, its password, delete it · lock (log out)",
  usage: "account            who you're logged in as\naccount passwd     a new name / password\naccount delete     delete this account and its settings (its vault, your notes, stays)\nlock               log out: back to the login page",
  man: "Each account is its own deck: its settings, its theme, its vault. Accounts are made on the login page (+ new account, approved by an account of this deck).\nThe password is hashed with Argon2id on the native side and never stored or shown. It also opens your vault if it's encrypted (vault encrypt): a new password re-wraps the vault's key.\nForgot it? If your vault is encrypted: login page → forgot password?, with its recovery key (24 words). Otherwise: quit, and remove that account from accounts.json in the app's config folder.",
  complete: () => ["passwd", "delete"],
  async run(ctx) {
    const { deck } = ctx;
    const acc = deck.platform.account;
    const sub = ctx.args[0] ?? "";
    if (!sub) {
      ctx.out(`logged in as ${fmt.bold(deck.account ?? "?")} ${fmt.dim("· account passwd · lock to log out · new accounts: on the login page")}\n`);
      return 0;
    }
    if (sub === "create") return ctx.err("account: new accounts are made on the login page (lock, then + new account)\n"), 1;
    if (!ctx.isTTY) return ctx.err("account: needs the terminal\n"), 1;
    try {
      const cur = await ctx.read("current password", { mask: true });
      if (cur === null) return 130;
      if (sub === "passwd") {
        const user = (await ctx.read("account name", { placeholder: deck.account ?? "" }))?.trim();
        if (user === undefined) return 130;
        const pw = await newPassword(ctx);
        if (!pw) return 130;
        await acc.change(cur, user || deck.account || "", pw);
        deck.account = await acc.status();
        ctx.out(`${fmt.green("✓")} account updated\n`);
        return 0;
      }
      if (sub === "delete" || sub === "remove") {
        if (!(await deck.confirm(`Delete the account ${deck.account}?`, "Its settings go for good. Its vault — your notes — stays where it is."))) return 1;
        await acc.remove(cur);
        ctx.out(`${fmt.green("✓")} account deleted\n`);
        setTimeout(() => location.reload(), 600);
        return 0;
      }
      ctx.err(`account: unknown subcommand ${sub}\n`);
      return 1;
    } catch (e) {
      ctx.err(`account: ${e instanceof Error ? e.message : String(e)}\n`);
      return 1;
    }
  },
};

export const lock: Command = {
  name: "logout",
  aliases: ["lock"],
  summary: "log out of ICEBREAKER: back to the login page",
  run(ctx) {
    ctx.deck.lockNow();
  },
};

/**
 * SELF-DESTRUCT: the vault, gone for good. So many locks that nobody gets
 * there by accident: a dialog, the folder's name, DESTROY in capitals, the
 * password (if the deck has a login), then a 10-second countdown that any
 * ctrl+c stops. Copies elsewhere (iCloud, git, backups) are not touched.
 */
export const selfDestruct: Command = {
  name: "self-destruct",
  summary: "delete the whole vault for good (several confirmations, a countdown)",
  usage: "self-destruct      asks, asks again, asks a third time, then counts down from 10 (ctrl+c stops it)",
  man: "Everything inside the vault folder is deleted — notes, journal, settings files, the .trash. Not moved to the trash: gone. The folder itself stays, empty.\nCopies elsewhere are NOT touched: iCloud / Dropbox / Syncthing copies on other devices, git remotes, Time Machine and other backups.",
  async run(ctx) {
    const d = ctx.deck;
    if (!d.vault.canDestroy) return ctx.err("self-destruct: needs the desktop app\n"), 1;
    const root = d.vault.root;
    const name = root.split(/[\\/]/).filter(Boolean).pop() ?? "";
    const notes = d.vault.markdown().length;
    ctx.out(`${fmt.red(fmt.bold("☢ SELF-DESTRUCT"))}\n${fmt.red(`Everything in ${root} — ${notes} notes, the journal, the trash, every file — will be deleted for good.`)}\n${fmt.dim("Copies elsewhere (iCloud, git, backups) are not touched. There is no undo.")}\n`);
    // 1 — a dialog
    if (!(await d.confirm("Self-destruct the vault?", `${notes} notes and every file in ${root} will be deleted for good. There is no undo.`))) return ctx.out("aborted. nothing happened.\n"), 1;
    // 2 — the folder's name
    const typed = await ctx.read(`type the vault folder's name (${name}) to go on:`);
    if (typed?.trim() !== name) return ctx.out("that's not it. aborted, nothing happened.\n"), 1;
    // 3 — DESTROY
    const word = await ctx.read("last chance. type DESTROY (capitals) to arm it:");
    if (word?.trim() !== "DESTROY") return ctx.out("aborted. nothing happened.\n"), 1;
    // 4 — the account's password (checked again by the native side when it destroys)
    const pw = (await d.prompt("Your password", { mask: true })) ?? "";
    if (!pw) return ctx.out("no password. aborted, nothing happened.\n"), 1;
    // 5 — the countdown (ctrl+c stops it)
    ctx.out(fmt.red("armed. ctrl+c to abort.\n"));
    for (let n = 10; n > 0; n--) {
      ctx.out(fmt.red(`${n}… `));
      d.sound.play(n <= 3 ? "error" : "notify");
      await new Promise((r) => setTimeout(r, 1000));
      if (ctx.signal.aborted) return ctx.out("\naborted. nothing happened.\n"), 1;
    }
    ctx.out("\n");
    try {
      const gone = await d.vault.destroy(name, pw);
      ctx.out(`${fmt.red("☢")} vault destroyed: ${gone} items deleted. the folder ${root} is empty.\n`);
      d.requestFrame();
      return 0;
    } catch (e) {
      return ctx.err(`self-destruct: ${e instanceof Error ? e.message : e}\n`), 1;
    }
  },
};
