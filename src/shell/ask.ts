import { fmt } from "../core/ansi";
import type { ShellContext } from "./types";

/**
 * THE rule for a command that asks something: typed in the shell, it asks in the shell
 * (y/N there); with `--window` (Settings, THE MENU, MODULES, the STORE's buttons) it asks
 * in a dialog. One helper, so every command does the same.
 */
export async function askInShell(ctx: ShellContext, title: string, detail: string): Promise<boolean> {
  if (detail) ctx.out(fmt.dim(`${detail}\n`));
  const a = await ctx.read(`${title} [y/N]`, { placeholder: "y or n" });
  return /^(y|yes|o|oui)$/i.test((a ?? "").trim());
}

/** The asking function for this command: a dialog with `--window`, else the shell. */
export function asker(ctx: ShellContext, window: boolean): (title: string, detail: string) => Promise<boolean> {
  return (title, detail) => (window ? ctx.deck.confirm(title, detail) : askInShell(ctx, title, detail));
}
