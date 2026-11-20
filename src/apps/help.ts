import { BOLD, type Rect } from "../core/grid";
import { strWidth } from "../core/unicode";
import type { Action, KeyInput } from "../core/input";
import type { Deck } from "../deck";
import type { UI } from "../ui/ui";
import type { App, AppSpec } from "./types";

/** F1 — the manual, generated so it never goes stale (commands come from the registry). */
function manual(deck: Deck): string {
  const cmds = deck.commands
    .all()
    .map((c) => `- \`${c.name}\` — ${c.summary}`)
    .join("\n");
  return `# ICEBREAKER manual

> ⚠ TEST SOFTWARE — not ready for heavy, secure or professional use.
> A hobby project made by one person who isn't a developer, with an AI writing most of the code: never audited, no warranty, no support — its author isn't responsible for bugs, data loss or security problems.
> Store nothing sensitive in it (encrypted vault or not). Back up your vault regularly.
> You can help: report bugs, say how it went, share ideas, make modules and themes — github.com/kiddoko/ICEBREAKER (Issues and Discussions). The whole text: DISCLAIMER.md there.

Everything works with **keyboard only**, **mouse only**, a **gamepad**, or any mix.

## Keyboard
**Every shortcut, searchable: \`Ctrl+/\` (the SHORTCUTS page).** Change any of them in Settings → KEYS; bind your own with \`bind\`. On a Mac, ⌘ plays the role of Ctrl.
- \`Ctrl+K\` or **Shift twice** — THE MENU: type to search everything, or a menu key + Enter
- \`Ctrl+Z\` / \`Ctrl+Shift+Z\` — undo / redo anything (settings, widgets, trash, renames, new notes)
- \`Tab\` — the next thing on the screen · \`Shift+Tab\` — the next part of the screen (tree → page → shell)
- \`Ctrl+Shift+H / M / E / U\` — HOME · MODULES · NEXUS · UPLINK (the AI)
- \`Ctrl+Shift+T / P / S\` — the tree · the side panel · the shell
- \`Ctrl+N\` new note · \`Ctrl+Shift+N\` new folder · \`Ctrl+J\` today's journal · \`Ctrl+,\` settings
- \`Ctrl+Tab\` / \`Ctrl+Shift+Tab\` — next / previous tab · \`Ctrl+1…9\` — that tab · \`Ctrl+W\` / \`Shift+Esc\` — close it
- \`Ctrl+S\` — save (notes also save themselves) · \`Ctrl+Enter\` — follow the [[link]] under the cursor
- \`Ctrl+=\` / \`Ctrl+-\` / \`Ctrl+0\` — interface scale · \`F11\` — fullscreen · \`F1\` — this manual
- \`Ctrl+Shift+L\` — log out · \`Ctrl+Shift+Backspace\` — the trash
- \`h\` — HOME, from anywhere you're not typing · \`Esc\` — back to the page before
- In the shell: \`tour\` — the guided tour · \`undo list\` · \`chat\` — talk to the AI · \`daily\` — end-of-day check-in

## Mouse
Click anything: tabs, files, tiles, buttons, calendar days (in the tree, one click selects a note, a double-click opens it). Every click runs a
shell command, shown in the shell's **log** tab: click around to learn the
command line. Hover something for a moment to see its command and shortcut. Drag to select text,
wheel to scroll, double-click to select a word, Ctrl+click to follow a link.
Drag the line above the shell to resize it. The ⌨ button in the status bar opens
the on-screen keyboard (mouse-only typing).

## Gamepad (Xbox / PlayStation layout)
- **D-pad / left stick** — move · **right stick** — scroll
- **A** — confirm · **B** — back · **Y** (or hold **RB**) — THE MENU · **X** — on-screen keyboard
- **LB / RB** — previous / next tab · **LT / RT** — page up / down
- **Select** — switch pane · **Start** — home
On-screen keyboard: A types, B deletes, Y space, Start enter, LB/RB move the cursor, X closes.

## Shell
A small POSIX-like shell over your vault: pipes \`|\`, redirections \`> >> <\`, \`&&\` \`||\` \`;\`,
quotes, \`$VARS\`, globs \`*.md\`, history (↑), fish-style suggestions (→), Tab completion.
\`/\` and \`~\` are the vault root. \`<cmd> -h\` (or \`man <cmd>\`) shows a command's help with full examples: \`todo -h\`.

${cmds}

## Files
- Vault: your notes, plain Markdown — \`vault\` shows where. \`vault encrypt\`: encrypted on the disk (names too; a plain backup zip first; a recovery key of 24 words, shown once), \`vault decrypt\`, \`vault export <folder>\` (a plain copy), \`vault recovery\` (a new recovery key), \`vault rekey\` (a new vault key, everything encrypted again). Forgot the password: login page → forgot password?. Encryption is an option: Settings → PRIVACY. Another computer or a USB key: login page → open a vault (the vault carries its account and settings; browse chooses the folder). \`vault move [folder]\`: the whole vault elsewhere, checked (a folder that holds things gets it inside, under its name). Typed in the shell it stays in the shell; with \`--window\` (the menus) every step is a window. The vault key encrypts the files; your password and the recovery key are two doors to it.
- Updates: Settings → UPDATES, or \`update\` (look), \`update install\`, \`store update\` (modules). Every day by default; install asks first unless you say "by itself" (ICEBREAKER then installs when you quit).
- STORE in the shell: \`store search\`, \`store info <id>\`, \`store install <id>\` (and what it needs), \`store remove <id>\`.
- Settings: space ticks a box / turns a choice; sliders go 1 at a time (hold: faster); greyed = depends on another setting. MODULES and NEXUS: just type to search.
- \`.icebreaker/themes/*.toml\` — your themes (\`theme new <name>\`)
- \`.icebreaker/plugins/<id>/\` — your plugins (\`plugin new <id>\`) · they run in a sandbox: only what their permissions allow, in the shell too, never more than you approved (docs/SANDBOX.md)
- \`.icebreaker/templates/journal.md\` — your journal template
- \`.trash/\` — where \`rm\` puts things (\`trash open\` to see it, restore). Nothing is ever deleted for good, apart from \`self-destruct\` (it asks four times).
`;
}

/** One piece of a line, in one style. */
interface Run {
  text: string;
  kind: "plain" | "bold" | "code" | "title" | "quote";
}

/**
 * A line of the manual's Markdown as styled pieces — without the symbols (**, `, #, >):
 * the manual is a page to read, not a note to edit.
 */
function runsOf(line: string): { runs: Run[]; indent: string } {
  const h = /^(#{1,6})\s+(.*)$/.exec(line);
  if (h) return { runs: [{ text: h[1].length === 1 ? h[2].toUpperCase() : h[2], kind: "title" }], indent: "" };
  const q = /^>\s?(.*)$/.exec(line);
  if (q) return { runs: [{ text: q[1].replace(/\*\*|`/g, ""), kind: "quote" }], indent: "" };
  const li = /^(\s*)[-*]\s+(.*)$/.exec(line);
  const body = li ? li[2] : line;
  const indent = li ? `${li[1]}· ` : "";
  const runs: Run[] = [];
  const re = /\*\*(.+?)\*\*|`([^`]+)`/g;
  let at = 0;
  for (let m = re.exec(body); m; m = re.exec(body)) {
    if (m.index > at) runs.push({ text: body.slice(at, m.index), kind: "plain" });
    runs.push(m[1] !== undefined ? { text: m[1], kind: "bold" } : { text: m[2], kind: "code" });
    at = m.index + m[0].length;
  }
  if (at < body.length) runs.push({ text: body.slice(at), kind: "plain" });
  return { runs, indent };
}

/** The pieces of one line folded to a width, on word boundaries (a piece keeps its style across rows). */
function fold(runs: Run[], indent: string, width: number): Run[][] {
  const rows: Run[][] = [[]];
  let used = 0;
  const room = Math.max(8, width);
  const push = (text: string, kind: Run["kind"]) => {
    const row = rows[rows.length - 1];
    const last = row[row.length - 1];
    if (last && last.kind === kind) last.text += text;
    else row.push({ text, kind });
    used += strWidth(text);
  };
  if (indent) push(indent, "plain");
  for (const r of runs) {
    for (const word of r.text.split(/(\s+)/)) {
      if (!word) continue;
      if (used + strWidth(word) > room && used > strWidth(indent)) {
        rows.push([]);
        used = 0;
        if (indent) push(" ".repeat(strWidth(indent)), "plain");
        if (/^\s+$/.test(word)) continue;
      }
      push(word, r.kind);
    }
  }
  return rows;
}

export class HelpApp implements App {
  readonly kind = "help";
  readonly key = "help";
  private readonly source: string[];
  private rows: Run[][] = [];
  private width = -1;
  private top = 0;
  private pageH = 10;

  constructor(deck: Deck) {
    this.source = manual(deck).split("\n");
  }

  title(): string {
    return "manual";
  }

  status(): string {
    return "↑↓ pgup pgdn scroll · ctrl+w close";
  }

  private scroll(by: number): void {
    this.top = Math.max(0, Math.min(Math.max(0, this.rows.length - this.pageH), this.top + by));
  }

  onKey(k: KeyInput): boolean {
    const step = k.key === "up" ? -1 : k.key === "down" ? 1 : k.key === "pageup" ? -(this.pageH - 2) : k.key === "pagedown" || k.key === "space" ? this.pageH - 2 : k.key === "home" ? -1e9 : k.key === "end" ? 1e9 : 0;
    if (!step) return false;
    this.scroll(step);
    return true;
  }

  onAction(a: Action): boolean {
    const step = a === "up" || a === "scroll-up" ? -2 : a === "down" || a === "scroll-down" ? 2 : a === "page-up" ? -15 : a === "page-down" ? 15 : 0;
    if (!step) return false;
    this.scroll(step);
    return true;
  }

  render(ui: UI, r: Rect, _focused: boolean): void {
    const c = ui.c;
    const w = r.w - 5;
    if (w !== this.width) {
      this.width = w;
      this.rows = this.source.flatMap((line) => {
        const { runs, indent } = runsOf(line);
        return fold(runs, indent, w);
      });
    }
    this.pageH = r.h;
    this.scroll(0);
    const style = (kind: Run["kind"]) =>
      kind === "title" ? { fg: c.accent, attrs: BOLD } : kind === "bold" ? { fg: c.fg, attrs: BOLD } : kind === "code" ? { fg: c.accentAlt, bg: c.panelAlt } : kind === "quote" ? { fg: c.warning } : { fg: c.muted };
    for (let y = 0; y < r.h; y++) {
      const row = this.rows[this.top + y];
      if (!row) break;
      let x = r.x + 2;
      for (const run of row) {
        ui.text(x, r.y + y, run.text, style(run.kind));
        x += strWidth(run.text);
      }
    }
    // the scrollbar, when there's more than a page
    if (this.rows.length > r.h) {
      const thumbH = Math.max(1, Math.round((r.h * r.h) / this.rows.length));
      const thumbY = r.y + Math.round((this.top / Math.max(1, this.rows.length - r.h)) * (r.h - thumbH));
      ui.vline(r.x + r.w - 1, r.y, r.h, { fg: c.faint }, "│");
      ui.vline(r.x + r.w - 1, thumbY, thumbH, { fg: c.accent }, "┃");
    }
    // the wheel
    ui.hit(r, { onWheel: (delta) => this.scroll(delta > 0 ? 3 : -3) });
  }
}

export const helpSpec: AppSpec = {
  kind: "help",
  title: "Manual",
  description: "keys, gamepad, commands",
  icon: "?",
  create: (deck) => new HelpApp(deck),
};
