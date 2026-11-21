import { lang, t } from "../../core/i18n";
import { osKeys } from "../../core/keyhints";
import { NOTES, notesFor } from "../../whatsnew/notes";
import type { Command } from "../types";
import { fmt } from "../../core/ansi";

/**
 * undo / redo: the deck's history (core/undo.ts), the same as ⌘Z and ⌘⇧Z.
 * Settings, widgets moved, files sent to the trash, renames, new notes.
 */
export const undoCommand: Command = {
  name: "undo",
  summary: "take back the last thing you did (⌘Z / ctrl+Z)",
  usage: "undo          the last thing\nundo <n>      the last n things\nundo list     what can be undone, newest first\nundo clear    forget the history",
  man: "Settings, widgets moved or resized (HOME, the panel), themes, files sent to the trash, renames, new notes and folders.\nWhile you type in a note, ⌘Z undoes the typing first (the editor's own history).\nThe history lasts until you quit the app.",
  async run(ctx) {
    const h = ctx.deck.history;
    const a = ctx.args[0];
    if (a === "list") {
      const items = h.list(30);
      if (!items.length) return void ctx.out(fmt.dim("nothing to undo\n"));
      for (const [i, e] of items.entries()) ctx.out(`${fmt.dim(String(i + 1).padStart(3))}  ${e.label}\n`);
      return;
    }
    if (a === "clear") return void (h.clear(), ctx.out(fmt.dim("history cleared\n")));
    const n = Math.max(1, Math.min(50, Number(a) || 1));
    for (let i = 0; i < n; i++) {
      const label = await h.undo();
      if (!label) {
        if (i === 0) ctx.out(fmt.dim("nothing to undo\n"));
        break;
      }
      ctx.out(`${fmt.cyan("↶")} ${label}\n`);
    }
  },
};

export const redoCommand: Command = {
  name: "redo",
  summary: "do again what undo took back (⌘⇧Z / ctrl+shift+Z / ctrl+Y)",
  usage: "redo",
  async run(ctx) {
    const label = await ctx.deck.history.redo();
    ctx.out(label ? `${fmt.cyan("↷")} ${label}\n` : fmt.dim("nothing to redo\n"));
  },
};

/** tour: the guided tour again (it plays once after the setup). */
export const tourCommand: Command = {
  name: "tour",
  summary: "the guided tour: UPLINK shows you around the deck",
  usage: "tour",
  man: "→ / enter next · ← back · esc skip. The panel, tree and shell are put back as they were at the end.",
  run(ctx) {
    ctx.deck.workspace.tour();
    ctx.deck.requestFrame();
  },
};

/** changelog / whatsnew: WHAT'S NEW, a version's short notes (src/whatsnew/notes.ts). */
export const changelogCommand: Command = {
  name: "changelog",
  aliases: ["whatsnew"],
  summary: "what's new in this version (and the ones before)",
  usage: "changelog            what's new in this version, in a window\nchangelog <version>  another version's (changelog 0.5.3)\nchangelog --list     every version there are notes for\nchangelog --print    the notes here, as text (with a version: that one)",
  man: "It opens by itself once after an update. In the window: ←→ other versions, ↑↓ scroll, esc closes. Also Settings → UPDATES → What's new, and THE MENU. The full details: CHANGELOG.md on GitHub.",
  examples: [["changelog", "this version's notes"], ["changelog 0.5.3", "an older version's"], ["whatsnew --print | grep TRASH", "search them"]],
  complete: () => ["--list", "--print", ...NOTES.map((n) => n.version)],
  run(ctx) {
    const flags = ctx.args.filter((a) => a.startsWith("--"));
    const version = ctx.args.find((a) => !a.startsWith("--"));
    if (flags.includes("--list")) {
      for (const n of NOTES) ctx.out(`${n.version === ctx.deck.updater.version ? fmt.magenta("●") : " "} ${n.version}  ${fmt.dim(n.date ?? t("not released yet"))}\n`);
      return 0;
    }
    if (version && !notesFor(version)) return ctx.err(`changelog: no notes for ${version} — changelog --list\n`), 1;
    if (flags.includes("--print")) {
      const n = notesFor(version ?? ctx.deck.updater.version) ?? NOTES[0];
      const raw = lang() === "fr" ? n.fr : n.en;
      const text = { added: raw.added.map((l) => osKeys(l)), fixed: raw.fixed.map((l) => osKeys(l)), headline: raw.headline && osKeys(raw.headline) };
      ctx.out(`${fmt.bold(`ICEBREAKER ${n.version}`)}${n.date ? fmt.dim(`  ${n.date}`) : ""}\n`);
      if (text.headline) ctx.out(`${text.headline}\n`);
      ctx.out(`${fmt.magenta(t("NEW"))}\n${text.added.map((l) => `  ▸ ${l}\n`).join("")}`);
      ctx.out(`${fmt.green(t("FIXED"))}\n${text.fixed.map((l) => `  · ${l}\n`).join("")}`);
      return 0;
    }
    ctx.deck.workspace.whatsNew(version);
    ctx.deck.requestFrame();
    return 0;
  },
};
