import { t } from "../../core/i18n";
import { fmt } from "../../core/ansi";
import type { Command, ShellContext } from "../types";

/** Ask for a new password twice; null if cancelled or they don't match. */
async function newPassword(ctx: ShellContext): Promise<string | null> {
  for (let i = 0; i < 3; i++) {
    const a = await ctx.read(t("new password"), { mask: true, placeholder: t("8 characters or more") });
    if (a === null) return null;
    if (a.length < 8) {
      ctx.err("too short: 8 characters or more\n");
      continue;
    }
    const b = await ctx.read(t("again"), { mask: true });
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
      const cur = await ctx.read(t("current password"), { mask: true });
      if (cur === null) return 130;
      if (sub === "passwd") {
        const user = (await ctx.read(t("account name"), { placeholder: deck.account ?? "" }))?.trim();
        if (user === undefined) return 130;
        const pw = await newPassword(ctx);
        if (!pw) return 130;
        await acc.change(cur, user || deck.account || "", pw);
        deck.account = await acc.status();
        ctx.out(`${fmt.green("✓")} account updated\n`);
        return 0;
      }
      if (sub === "delete" || sub === "remove") {
        const user0 = deck.account ?? "";
        if (!(await deck.confirm(t("Delete the account {name}?", { name: deck.account ?? "" }), t("Its settings go for good. Its vault — your notes — stays where it is.")))) return 1;
        await acc.remove(cur);
        ctx.out(`${fmt.green("✓")} account deleted\n`);
        // said where you look, before the deck goes back to the login page
        deck.notify(t("account {name} deleted — its vault stays where it was", { name: user0 }), "success");
        setTimeout(() => location.reload(), 1800);
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
 * `login` typed for `logout` (in ibsh or your real terminal, where macOS's own login
 * would ask for a user and ignore ctrl+C): says who you are and what logs out.
 */
export const login: Command = {
  name: "login",
  summary: "you're already logged in: says as whom (logout goes back to the login page)",
  man: "Logging in happens on the login page. To log in as someone else: logout (or lock), then pick the account.\nIn your real terminal, `command login` still runs the system's own login.",
  run(ctx) {
    ctx.out(`logged in as ${fmt.bold(ctx.deck.account ?? "?")} ${fmt.dim("· logout (or lock) goes back to the login page")}\n`);
  },
};

