import { ago } from "../../core/time";
import { fmt } from "../../core/ansi";
import type { Deck } from "../../deck";
import type { Command } from "../types";

/**
 * The vault's trash (.trash): what `rm`, the tree's Delete and right-click →
 * trash put there. See it, put things back where they were. Nothing is ever
 * deleted for good from inside the deck: empty it in your file manager.
 */
export interface TrashItem {
  /** .trash/<seconds>-<name> */
  path: string;
  name: string;
  /** where it lived (when the deck knows) */
  from: string;
  at: Date;
  isDir: boolean;
}

export async function trashItems(deck: Deck): Promise<TrashItem[]> {
  const v = deck.vault;
  if (!(await v.exists(".trash"))) return [];
  const log = await v.trashLog();
  const entries = await v.list(".trash").catch(() => []);
  return entries
    .map((e) => {
      const m = /^(\d+)-(.*)$/.exec(e.name);
      const at = m ? new Date(Number(m[1]) * (m[1].length > 11 ? 1 : 1000)) : new Date(e.modified || 0);
      const known = log.find((l) => l.dest === e.path);
      return { path: e.path, name: m ? m[2] : e.name, from: known?.from ?? "", at, isDir: e.isDir };
    })
    .sort((a, b) => b.at.getTime() - a.at.getTime());
}


export const trashCommand: Command = {
  name: "trash",
  summary: "what's in the vault's trash, and put things back (⌫ above the tree)",
  usage: "trash                      the list\ntrash restore <n|name>     back where it was\ntrash restore <n> <path>   somewhere else\ntrash open                 the TRASH page (⌫ above the tree, ⌘⇧⌫)",
  man: "rm, Delete in the tree and right-click → trash move things to <vault>/.trash — nothing is deleted for good.\nThe deck remembers where each thing lived (.icebreaker/trash.json), so restore puts it back.\nTo empty the trash for real, delete the .trash folder in your file manager.",
  complete: () => ["restore", "open"],
  async run(ctx) {
    const d = ctx.deck;
    const [sub, which, to] = ctx.args;
    const items = await trashItems(d);
    if (!sub || sub === "ls") {
      if (!items.length) return ctx.out(fmt.dim("the trash is empty\n")), 0;
      items.forEach((it, i) => ctx.out(`${fmt.dim(String(i + 1).padStart(3))}  ${it.isDir ? fmt.bold(`${it.name}/`) : it.name}  ${fmt.dim(`${it.from ? `from /${it.from} · ` : ""}${ago(it.at.getTime(), true)} ago`)}\n`));
      ctx.out(fmt.dim("trash restore <n> puts one back\n"));
      return 0;
    }
    if (sub === "open" || sub === "page" || sub === "menu") return void d.openApp("trash"), 0;
    if (sub === "restore") {
      if (!which) return ctx.err("usage: trash restore <n|name> [path]\n"), 1;
      const it = /^\d+$/.test(which) ? items[Number(which) - 1] : items.find((x) => x.path === which || x.name === which);
      if (!it) return ctx.err(`trash: nothing called ${which} in the trash\n`), 1;
      try {
        const where = await d.vault.restore(it.path, to);
        ctx.out(`${fmt.green("↩")} ${where}\n`);
        d.workspace.sidebar.reveal(where);
        return 0;
      } catch (e) {
        return ctx.err(`trash: ${e instanceof Error ? e.message : e}\n`), 1;
      }
    }
    return ctx.err("usage: trash · trash restore <n> · trash open\n"), 1;
  },
};
