import { fmt } from "../../core/ansi";
import { asker } from "../ask";
import type { Command } from "../types";

/** `update` — ICEBREAKER's and the modules' updates (core/updater.ts), from the shell. */
export const updateCommand: Command = {
  name: "update",
  aliases: ["updates"],
  interactive: true,
  summary: "updates of ICEBREAKER and of your modules: look, download, install",
  usage: [
    "update                  look now: what's new (ICEBREAKER and the modules)",
    "update download         download ICEBREAKER's update (nothing installed)",
    "update install          install everything ready (ICEBREAKER then restarts)",
    "update modules          only the modules (= store update --all)",
    "update settings         when it looks, downloads, installs (Settings → UPDATES)",
    "  --window              ask in dialogs instead of the shell",
  ].join("\n"),
  man: "Settings → UPDATES: look every day / at start / never · download by itself · install by itself or ask first. With install by itself, ICEBREAKER installs when you quit; modules right away. Stealth mode looks for nothing. Every ICEBREAKER update is signed: an unsigned one is refused. See docs/UPDATES.md.",
  complete: () => ["download", "install", "modules", "settings"],
  async run(ctx) {
    const d = ctx.deck;
    const u = d.updater;
    const window = ctx.args.includes("--window");
    const [sub] = ctx.args.filter((a) => a !== "--window");
    const ask = asker(ctx, window);
    const s = d.settings.data.updates;
    if (sub === "settings") {
      ctx.out(`${fmt.bold("look")}      ${s.check === "daily" ? "every day" : s.check === "start" ? "at start" : "never"}${d.settings.data.privacy.stealth ? fmt.yellow(" (not in stealth mode)") : ""}\n`);
      ctx.out(`${fmt.bold("download")}  ${s.download ? "by itself" : "when you say (update download)"}\n`);
      ctx.out(`${fmt.bold("install")}   ${s.install === "auto" ? "by itself (ICEBREAKER: when you quit)" : "asks first"}\n`);
      ctx.out(`${fmt.bold("from")}      ${s.endpoint || "the official releases"}\n`);
      ctx.out(fmt.dim("change them: Settings → UPDATES, or config set updates.check daily|start|never · updates.download true|false · updates.install ask|auto\n"));
      return 0;
    }
    if (d.settings.data.privacy.stealth) return ctx.err("stealth mode is on: nothing leaves this computer, no update is looked for\n"), 1;
    try {
      if (!sub || sub === "check") {
        ctx.out(fmt.dim(`ICEBREAKER ${u.version} · looking…\n`));
        await u.check();
        if (u.error) ctx.err(`${u.error}\n`);
        if (!u.pending()) return ctx.out(`${fmt.green("✓")} ${u.appError ? "the modules are up to date" : "everything is up to date"}\n`), 0;
        ctx.out(`${u.summary()}\n`);
        ctx.out(fmt.dim(`update install${u.app && !u.app.downloaded ? " · update download" : ""}\n`));
        return 0;
      }
      if (sub === "download") {
        if (!u.canUpdateApp) return ctx.err("update: ICEBREAKER updates itself in the desktop app\n"), 1;
        if (!u.app) await u.check();
        if (!u.app) return ctx.out(`${fmt.green("✓")} ICEBREAKER ${u.version} is the newest\n`), 0;
        ctx.out(fmt.dim(`downloading ICEBREAKER ${u.app.version}…\n`));
        await u.download();
        return ctx.out(`${fmt.green("✓")} ICEBREAKER ${u.app.version} downloaded · update install puts it in (it restarts)\n`), 0;
      }
      if (sub === "modules") {
        if (!u.checkedAt) await u.check();
        if (!u.modules.length) return ctx.out(`${fmt.green("✓")} every module is up to date\n`), 0;
        const done = await u.installModules();
        for (const x of done) ctx.out(`${fmt.green("✓")} ${x}\n`);
        return 0;
      }
      if (sub === "install") {
        if (!u.checkedAt) await u.check();
        if (!u.pending()) return ctx.out(`${fmt.green("✓")} nothing to install: everything is up to date\n`), 0;
        if (!(await ask("Install the updates?", `${u.summary()}${u.app ? "\n\nICEBREAKER restarts when it's done." : ""}`))) return 1;
        ctx.out(fmt.dim("installing…\n"));
        await u.installAll(true);
        if (!u.app) ctx.out(`${fmt.green("✓")} done\n`);
        return 0;
      }
    } catch (e) {
      ctx.err(`update: ${e instanceof Error ? e.message : e}\n`);
      return 1;
    }
    ctx.err(`update: "${sub}"? try update -h\n`);
    return 1;
  },
};
