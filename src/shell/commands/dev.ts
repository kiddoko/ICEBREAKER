/*
 * Developer tools: commands to help while building ICEBREAKER. deck.ts registers
 * them only when the native side has them (a build with `--features dev-tools`,
 * src-tauri/src/dev.rs): a release doesn't have these commands at all.
 */
import { fmt } from "../../core/ansi";
import type { Command } from "../types";

export const factoryReset: Command = {
  name: "factory-reset",
  interactive: true,
  summary: "[dev] back to a brand-new ICEBREAKER (vault + settings moved to backups)",
  usage: "factory-reset          asks first, then your account's password\nfactory-reset --yes    no question (still your password)",
  man: "Testing helper: only in builds made with the dev-tools feature (npm run app:mac), never in a release.\nRenames the vault folder and the config folder (settings, API key, login) with a -backup-<timestamp> suffix — nothing is deleted — then restarts: you get the first-run setup again.\nTo go back: quit, delete the new folders, rename the backups.",
  async run(ctx) {
    const { deck } = ctx;
    const dev = deck.platform.dev;
    if (!dev) return ctx.err("factory-reset: not available here\n"), 1;
    if (!ctx.args.includes("--yes")) {
      const ok = await deck.confirm(
        "Factory reset? (dev)",
        `The vault (${deck.vault.root}) and the settings, API key and login\nare moved to "-backup-…" folders, then the app restarts as new.\nNothing is deleted.`,
      );
      if (!ok) return ctx.out("cancelled\n"), 1;
    }
    if (!ctx.isTTY) return ctx.err("factory-reset: needs the terminal (it asks for your password)\n"), 1;
    const password = await ctx.read("your account's password", { mask: true });
    if (password === null) return ctx.out("cancelled\n"), 1;
    // let open notes save, then stop writing settings before the folders move
    for (const t of deck.workspace.tabs) await t.close?.();
    deck.settings.freeze();
    // pending writes (shell history is saved after 1 s) must land before the move,
    // or they'd recreate the old vault folder
    ctx.out(fmt.dim("saving…\n"));
    await new Promise((r) => setTimeout(r, 1500));
    try {
      const moved = await dev.factoryReset(password);
      for (const m of moved) ctx.out(`${fmt.dim("moved →")} ${m}\n`);
      ctx.out(fmt.magenta("restarting as new…\n"));
      deck.requestFrame();
      await new Promise((r) => setTimeout(r, 1200));
      await dev.restart();
    } catch (e) {
      ctx.err(`factory-reset: ${e instanceof Error ? e.message : String(e)}\n`);
      return 1;
    }
  },
};

export const devCommands: Command[] = [factoryReset];
