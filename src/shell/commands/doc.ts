import { copyToClipboard } from "../../core/clipboard";
import { t } from "../../core/i18n";
import { basename } from "../../vault/paths";
import type { Command, ShellContext } from "../types";

/**
 * What the note's buttons and menus do, as commands (every click has its command: the menus run
 * these, so a click shows in the log like the rest): save, save as, copy path / link.
 */

interface Doc {
  file: string;
  save(): Promise<void>;
  saveAs(to?: string): Promise<string | null>;
  dirty?(): boolean;
}

/** the note you're looking at (the focused frame's page, else the page's), or the open one at `path` */
function activeNote(ctx: ShellContext, path?: string): Doc | undefined {
  const ws = ctx.deck.workspace;
  const app = path ? ws.tabs.find((a) => a.key === `note:${path}`) : ws.focusedPage ?? ws.activeApp;
  return app?.kind === "note" ? (app as unknown as Doc) : undefined;
}

const save: Command = {
  name: "save",
  summary: "save the note you're looking at (⌘S) · save as <path>: a copy under another name",
  usage: "save [note]        the note in front (⌘S), or an open one\nsave as <path>     a copy under another name; the copy opens (⌘⇧S)",
  examples: [
    ["save", "writes the open note now"],
    ['save as "notes/ideas v2.md"', "a copy, opened"],
  ],
  async run(ctx) {
    const given = ctx.args[0] !== "as" ? ctx.args.join(" ").trim() : "";
    const doc = activeNote(ctx, given ? ctx.resolve(given) : undefined);
    if (!doc) return ctx.err(`save: ${given ? t("{path} isn't open", { path: given }) : t("no note in front (open one first)")}\n`), 1;
    if (ctx.args[0] === "as") {
      const to = ctx.args.slice(1).join(" ").trim();
      const path = await doc.saveAs(to || undefined);
      if (path) ctx.out(`+ ${path}\n`);
      return path ? 0 : 1;
    }
    const was = doc.dirty?.() ?? true;
    await doc.save();
    ctx.out(`✓ ${was ? t("saved") : t("already saved")} ${doc.file}\n`);
  },
};

const copy: Command = {
  name: "copy",
  summary: "copy a note's path or its [[link]] to the clipboard (text piped in: that text)",
  usage: "copy path [note]   its path in the vault (no note: the one in front)\ncopy link [note]   a [[link]] to paste in a note\n<cmd> | copy       what a command wrote",
  examples: [
    ["copy link", "[[ideas]] for the note in front"],
    ["ls notes | copy", "the list, to paste elsewhere"],
  ],
  complete: "path",
  async run(ctx) {
    const [what, ...rest] = ctx.args;
    if (!what && ctx.stdin) {
      await copyToClipboard(ctx.stdin.replace(/\n$/, ""));
      return ctx.out(`${t("copied")}\n`), 0;
    }
    if (what !== "path" && what !== "link") return ctx.err(`usage: copy path|link [note] · <cmd> | copy\n`), 1;
    const given = rest.join(" ").trim();
    const path = given ? ctx.resolve(given) : activeNote(ctx)?.file;
    if (!path) return ctx.err(`copy: ${t("no note in front (open one first)")}\n`), 1;
    const text = what === "path" ? path : `[[${basename(path).replace(/\.md$/, "")}]]`;
    await copyToClipboard(text);
    ctx.out(`${text}  (${t(what === "path" ? "path copied" : "link copied")})\n`);
  },
};

export const docCommands: Command[] = [save, copy];
