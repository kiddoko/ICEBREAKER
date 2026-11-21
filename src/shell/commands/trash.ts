import { ago } from "../../core/time";
import { fmt } from "../../core/ansi";
import type { Deck } from "../../deck";
import { t } from "../../core/i18n";
import type { Command } from "../types";

/**
 * The vault's trash (.trash): what `rm`, the tree's Delete and right-click →
 * trash put there. See it, put things back where they were — or delete one thing
 * (or everything) for good: `trash purge`, `trash empty`, after a clear question.
 * That's the only irreversible delete of the deck (no ⌘Z), and only yours: a module
 * or your real terminal can't (shell/privileged.ts).
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


/** Delete for good, after asking (irreversible, said in the dialog). The ones deleted. */
export async function purgeItems(deck: Deck, items: TrashItem[], all = false): Promise<number> {
  if (!items.length) return 0;
  const one = items.length === 1 ? items[0] : null;
  const title = all ? t("Empty the trash?") : one ? t("Delete “{name}” for good?", { name: one.isDir ? `${one.name}/` : one.name }) : t("Delete {n} things for good?", { n: items.length });
  // (two short lines: the dialog doesn't wrap, a long sentence was cut)
  const detail = `${t("This can't be undone: it is erased from the vault.")}\n${t("Nothing keeps a copy, and ⌘Z won't bring it back.")}${all ? `\n${items.length === 1 ? t("1 thing") : t("{n} things", { n: items.length })}` : ""}`;
  // the safe answer is no: enter alone keeps everything
  if (!(await deck.confirm(title, detail, false))) return 0;
  let n = 0;
  for (const it of items) {
    try {
      await deck.vault.purge(it.path);
      n++;
    } catch (e) {
      deck.notify(`${it.name}: ${e instanceof Error ? e.message : String(e)}`, "error");
    }
  }
  return n;
}

export const trashCommand: Command = {
  name: "trash",
  summary: "what's in the vault's trash, and put things back (⌫ above the tree)",
  usage: "trash                      the list\ntrash restore <n|name>     back where it was\ntrash restore <n> <path>   somewhere else\ntrash purge <n|name>       delete it for good (asks first, can't be undone)\ntrash empty                delete everything in it for good (asks first)\ntrash open                 the TRASH page (⌫ above the tree, ⌘⇧⌫)",
  man: "rm, Delete in the tree and right-click → trash move things to <vault>/.trash — that is not deleted yet.\nThe deck remembers where each thing lived (.icebreaker/trash.json), so restore puts it back.\ntrash purge and trash empty (the TRASH page: delete permanently) erase for good, after a question that says so: it can't be undone, ⌘Z won't bring it back. Only you can: a module or your real terminal can't.",
  complete: () => ["restore", "purge", "empty", "open"],
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
    if (sub === "purge" || sub === "empty") {
      if (!items.length) return ctx.out(fmt.dim("the trash is empty\n")), 0;
      let chosen = items;
      if (sub === "purge") {
        if (!which) return ctx.err("usage: trash purge <n|name> · trash empty\n"), 1;
        const it = /^\d+$/.test(which) ? items[Number(which) - 1] : items.find((x) => x.path === which || x.name === which);
        if (!it) return ctx.err(`trash: nothing called ${which} in the trash\n`), 1;
        chosen = [it];
      }
      const n = await purgeItems(d, chosen, sub === "empty");
      if (!n) return ctx.out(fmt.dim("nothing deleted\n")), 1;
      ctx.out(`${fmt.red("✕")} ${n === 1 ? "1 thing" : `${n} things`} deleted for good\n`);
      return n === chosen.length ? 0 : 1;
    }
    return ctx.err("usage: trash · trash restore <n> · trash purge <n> · trash empty · trash open\n"), 1;
  },
};
