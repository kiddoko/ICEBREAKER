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
