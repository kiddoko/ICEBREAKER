import { fmt } from "../core/ansi";
import { t, tOutput } from "../core/i18n";
import type { ShellContext } from "./types";

/**
 * THE rule for a command that asks something: typed in the shell, it asks in the shell
 * (y/N there); with `--window` (Settings, THE MENU, MODULES, the STORE's buttons) it asks
 * in a dialog. One helper, so every command does the same.
 */
export async function askInShell(ctx: ShellContext, title: string, detail: string): Promise<boolean> {
  if (detail) ctx.out(fmt.dim(`${detail}\n`));
  // the question in the deck's language too (its detail is, on its way out): « [o/N] » in French
  const a = await ctx.read(`${tOutput(title)} ${t("[y/N]")}`, { placeholder: t("y or n") });
  return /^(y|yes|o|oui)$/i.test((a ?? "").trim());
}

/** The asking function for this command: a dialog with `--window`, else the shell. */
export function asker(ctx: ShellContext, window: boolean): (title: string, detail: string) => Promise<boolean> {
  return (title, detail) => (window ? ctx.deck.confirm(tOutput(title), tOutput(detail)) : askInShell(ctx, title, detail));
}
