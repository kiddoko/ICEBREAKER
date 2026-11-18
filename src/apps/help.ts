import type { Rect } from "../core/grid";
import type { Action, KeyInput } from "../core/input";
import type { Deck } from "../deck";
import { TextEditor } from "../ui/editor";
import type { UI } from "../ui/ui";
import type { App, AppSpec } from "./types";

/** F1 — the manual, generated so it never goes stale (commands come from the registry). */
function manual(deck: Deck): string {
  const cmds = deck.commands
    .all()
    .map((c) => `- \`${c.name}\` — ${c.summary}`)
    .join("\n");
  return `# ICEBREAKER manual

Everything works with **keyboard only**, **mouse only**, a **gamepad**, or any mix.

## Keyboard
**Every shortcut, searchable: \`Ctrl+/\` (the SHORTCUTS page, or \`shortcuts\` in the shell).** Bind your own with \`bind\`.
- \`Tab\` — the next thing on the screen (widget, card, line) · \`Shift+Tab\` — the next part of the screen (tree → deck → shell)
- \`Ctrl+K\` / \`Ctrl+P\` — command palette (search everything)
- \`Ctrl+J\` — today's journal · \`Ctrl+N\` — new note · \`Ctrl+Space\` — AI link · \`Ctrl+,\` — settings
- \`Ctrl+\`\` (key under Esc) — show / focus the shell · \`Ctrl+B\` — toggle the file tree
- \`Alt+←↑↓→\` — move focus between panes · \`Alt+1…9\` — switch tab
- \`Ctrl+Tab\` / \`Ctrl+Shift+Tab\` — next / previous tab · \`Ctrl+W\` — close tab
- \`Ctrl+S\` — save (notes also autosave) · \`Ctrl+Enter\` — follow [[link]] under cursor
- \`Ctrl+=\` / \`Ctrl+-\` / \`Ctrl+0\` — interface scale 25–200 % · \`F11\` — fullscreen · \`F1\` — this manual
- \`h\` — back to HOME from anywhere you're not typing
- \`Esc\` — close the page you're on and go back to the previous one (HOME stays)
- In the shell: \`daily\` — end-of-day check-in · \`chat\` — talk to the AI · \`lock\` — lock the deck

## Mouse
Click anything: tabs, files, tiles, buttons, calendar days. Every click runs a
shell command, shown in the shell (marked ◂ ui): click around to learn the
command line. Hover something for a moment to see its command and shortcut. Drag to select text,
wheel to scroll, double-click to select a word, Ctrl+click to follow a link.
Drag the line above the shell to resize it. The ⌨ button in the status bar opens
the on-screen keyboard (mouse-only typing).

## Gamepad (Xbox / PlayStation layout)
- **D-pad / left stick** — move · **right stick** — scroll
- **A** — confirm · **B** — back · **Y** — command palette · **X** — on-screen keyboard
- **LB / RB** — previous / next tab · **LT / RT** — page up / down
- **Select** — switch pane · **Start** — home
On-screen keyboard: A types, B deletes, Y space, Start enter, LB/RB move the cursor, X closes.

## Shell
A small POSIX-like shell over your vault: pipes \`|\`, redirections \`> >> <\`, \`&&\` \`||\` \`;\`,
quotes, \`$VARS\`, globs \`*.md\`, history (↑), fish-style suggestions (→), Tab completion.
\`/\` and \`~\` are the vault root. \`<cmd> -h\` (or \`man <cmd>\`) shows a command's help with full examples: \`todo -h\`.

${cmds}

## Files
- Vault: your notes, plain Markdown — \`vault\` shows where.
- \`.icebreaker/themes/*.toml\` — your themes (\`theme new <name>\`)
- \`.icebreaker/plugins/<id>/\` — your plugins (\`plugin new <id>\`)
- \`.icebreaker/templates/journal.md\` — your journal template
- \`.trash/\` — where \`rm\` puts things. Nothing is ever hard-deleted.
`;
}

export class HelpApp implements App {
  readonly kind = "help";
  readonly key = "help";
  private view: TextEditor;

  constructor(deck: Deck) {
    this.view = new TextEditor(manual(deck), { markdown: true, readOnly: true });
  }

  title(): string {
    return "manual";
  }

  status(): string {
    return "↑↓ pgup pgdn scroll · ctrl+w close";
  }

  onKey(k: KeyInput): boolean {
    if (k.key === "up" || k.key === "down") {
      this.view.scroll(k.key === "up" ? -1 : 1);
      return true;
    }
    return this.view.onKey(k);
  }

  onAction(a: Action): boolean {
    const step = a === "up" || a === "scroll-up" ? -2 : a === "down" || a === "scroll-down" ? 2 : a === "page-up" ? -15 : a === "page-down" ? 15 : 0;
    if (!step) return false;
    this.view.scroll(step);
    return true;
  }

  render(ui: UI, r: Rect, focused: boolean): void {
    this.view.render(ui, { x: r.x + 2, y: r.y, w: r.w - 3, h: r.h }, focused);
  }
}

export const helpSpec: AppSpec = {
  kind: "help",
  title: "Manual",
  description: "keys, gamepad, commands",
  icon: "?",
  create: (deck) => new HelpApp(deck),
};
