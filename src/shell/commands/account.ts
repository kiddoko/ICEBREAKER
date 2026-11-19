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
    ["account create", "add a login"],
    ["account passwd", "change it"],
    ["lock", "lock now"],
  ],
  aliases: ["passwd"],
  summary: "the deck login: create, change or remove it, lock now",
  usage: "account            status\naccount create     add a login (name + password)\naccount passwd     change name / password\naccount remove     no more login\nlock               lock the deck now",
  man: "The password is hashed with Argon2id on the native side and never stored or shown.\nIt locks the app; your notes stay plain Markdown files on disk.\nForgot it? Quit, delete account.json in the app's config folder, restart.",
  complete: () => ["create", "passwd", "remove"],
  async run(ctx) {
    const { deck } = ctx;
    const acc = deck.platform.account;
    const sub = ctx.args[0] ?? "";
    if (!sub) {
      ctx.out(deck.account ? `login: ${fmt.bold(deck.account)} ${fmt.dim("(Argon2id · `account passwd` to change, `lock` to lock now)")}\n` : `no login ${fmt.dim("— `account create` to add one")}\n`);
      return 0;
    }
    if (!ctx.isTTY) return ctx.err("account: needs the terminal\n"), 1;
    try {
      if (sub === "create") {
        if (deck.account) return ctx.err("account: there's already one (account passwd to change it)\n"), 1;
        const user = (await ctx.read("account name", { placeholder: deck.settings.data.user.handle }))?.trim();
        if (user === undefined) return 130;
        const pw = await newPassword(ctx);
        if (!pw) return 130;
        await acc.create(user || deck.settings.data.user.handle, pw);
        deck.account = await acc.status();
        ctx.out(`${fmt.green("✓")} login created for ${fmt.bold(deck.account ?? "")}\n`);
        return 0;
      }
      if (!deck.account) return ctx.err("account: no login yet (account create)\n"), 1;
      const cur = await ctx.read("current password", { mask: true });
      if (cur === null) return 130;
      if (sub === "passwd") {
        const user = (await ctx.read("account name", { placeholder: deck.account }))?.trim();
        if (user === undefined) return 130;
        const pw = await newPassword(ctx);
        if (!pw) return 130;
        await acc.change(cur, user || deck.account, pw);
        deck.account = await acc.status();
        ctx.out(`${fmt.green("✓")} login updated\n`);
        return 0;
      }
      if (sub === "remove") {
        await acc.remove(cur);
        deck.account = null;
        ctx.out(`${fmt.green("✓")} login removed — the deck opens without a password\n`);
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
  name: "lock",
  aliases: ["logout"],
  summary: "log out of ICEBREAKER: back to the login screen (needs a login: account create)",
  run(ctx) {
    if (!ctx.deck.account) return ctx.err("lock: no login yet — account create\n"), 1;
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
    // 4 — the password, when the deck has a login
    if (d.account) {
      const pw = await d.prompt("Your password", { mask: true });
      if (!pw || !(await d.platform.account?.verify(d.account, pw).catch(() => false))) return ctx.out("wrong password. aborted, nothing happened.\n"), 1;
    }
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
      const gone = await d.vault.destroy(name);
      ctx.out(`${fmt.red("☢")} vault destroyed: ${gone} items deleted. the folder ${root} is empty.\n`);
      d.requestFrame();
      return 0;
    } catch (e) {
      return ctx.err(`self-destruct: ${e instanceof Error ? e.message : e}\n`), 1;
    }
  },
};
