import { BOLD, type Rect } from "../core/grid";
import { strWidth } from "../core/unicode";
import type { Action, KeyInput } from "../core/input";
import type { Deck } from "../deck";
import type { UI } from "../ui/ui";
import type { App, AppSpec } from "./types";
import { lang, t, tLoose } from "../core/i18n";
import { manualFr } from "./help-fr";

/**
 * F1 — the manual, generated so it never goes stale (commands come from the registry). In the
 * deck's language: English here, French in help-fr.ts (the same sections, kept in step).
 */
function manual(deck: Deck): string {
  const cmds = deck.commands
    .all()
    .map((c) => `- \`${c.name}\` — ${tLoose(c.summary)}`)
    .join("\n");
  return lang() === "fr" ? manualFr(cmds) : manualEn(cmds);
}

function manualEn(cmds: string): string {
  return `# ICEBREAKER manual

> ⚠ TEST SOFTWARE — not ready for heavy, secure or professional use.
> A hobby project made by one person who isn't a developer, with an AI writing most of the code: never audited, no warranty, no support — its author isn't responsible for bugs, data loss or security problems.
> Store nothing sensitive in it (encrypted vault or not). Back up your vault regularly.
> You can help: report bugs, say how it went, share ideas, make modules and themes — github.com/kiddoko/ICEBREAKER (Issues and Discussions). The whole text: DISCLAIMER.md there.

Everything works with **keyboard only**, **mouse only**, a **gamepad**, or any mix.

## Keyboard
**Every shortcut, searchable: \`Ctrl+/\` (the SHORTCUTS page).** Change any of them in Settings → KEYS; bind your own with \`bind\`. On a Mac, ⌘ plays the role of Ctrl.
- \`Ctrl+K\` or **Shift twice** — THE MENU: type to search everything, or a menu key + Enter
- \`Ctrl+Z\` / \`Ctrl+Shift+Z\` — undo / redo the last thing done (settings, widgets, trash, renames, new notes, tasks, reminders, habits, events; a module uninstalled, right after)
- \`Tab\` — the next thing on the screen · \`F6\` / \`Shift+F6\` (or \`Shift+Tab\`) — the next / previous part of the screen (page → panel → shell → tree)
- \`Ctrl+Shift+H / M / E / U\` — HOME · MODULES · NEXUS · UPLINK (the AI)
- \`Ctrl+Shift+T / P\` — the tree (also \`Ctrl+B\`) · the side panel · **Ctrl+\`** — the shell · \`F10\` or a click on **◆ ICEBREAKER ▾** (top left): the deck's menu
- \`Ctrl+N\` new note · \`Ctrl+Shift+N\` new folder · \`Ctrl+J\` the journal (open at today) · \`Ctrl+,\` settings
- \`Ctrl+Tab\` / \`Ctrl+Shift+Tab\` — next / previous tab · \`Ctrl+1…9\` — that tab · \`Ctrl+W\` / \`Shift+Esc\` — close it (the one you're looking at, in whichever frame) · drag a tab onto another frame or another tab
- \`Ctrl+S\` — save (notes also save themselves; a note emptied by mistake is only written by \`Ctrl+S\`, closing it or 30 s later, and its text goes to the trash first) · \`Ctrl+Shift+S\` — save as · \`Ctrl+Enter\` — follow the [[link]] under the cursor
- \`Alt+Backspace\` on a Mac, \`Ctrl+Backspace\` on Windows / Linux — delete the whole previous word (\`Shift+Backspace\` is a plain backspace)
- \`Shift\` + wheel in a note — one line at a time
- In the tree: \`Shift+↑\` / \`Shift+↓\` — file by file, each one shown at once in the preview tab (like Shift + wheel)
- \`Ctrl+=\` / \`Ctrl+-\` / \`Ctrl+0\` — interface scale · \`F11\` — fullscreen · \`F1\` — this manual
- \`Ctrl+Shift+L\` — log out · \`Ctrl+Shift+Backspace\` — the trash
- \`h\` — HOME, from anywhere you're not typing · \`Esc\` — back to the page (from the tree or the shell); on HOME with nothing to close, the **◆ ICEBREAKER** menu
- In the shell: \`tour\` — the guided tour · \`undo list\` · \`chat\` — talk to the AI · \`journal\` — today's page, \`journal "a line"\` — a line in it without opening it · \`daily\` — end-of-day check-in · \`exit\` — hide the shell · \`quit\` — quit

## Mouse
Click anything: tabs, files, tiles, buttons, calendar days (in the tree, one click selects a note, a double-click opens it). Every click runs a
shell command, shown in the shell's **log**: click around to learn the
command line. Hover something for a moment to see its command and shortcut. Drag to select text
(in notes, ibsh and your real terminal), double-click a word, triple-click a line, Ctrl+click to follow a link.
The wheel scrolls; in Settings it moves the row you're on (a trackpad too), and over a slider it steps it 1 by 1.
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
- \`help\` — the commands to start with; \`help all\` every command, \`help todo\` a module's. The **CATALOG** (\`catalog\`) lists everything else: commands, settings, shortcuts, the functions modules share, the module API (\`catalog api\`).
- **At rest**: 20 s without a key or the mouse, animations slow to 12 frames a second; after a minute, to 2 (the clock still ticks) — the first key wakes everything (Settings → APPEARANCE → save energy).
- **Stop a command**: \`Ctrl+C\` (on a Mac \`⌘X\`, or the real Control key + C) stops what's running or the question it asks — it ends with ^C and the prompt comes back. \`Esc\` stops a question too. In your real terminal, \`⌘X\` on a Mac sends ctrl+C.
- **Copy what a command printed**: drag over it with the mouse (double-click: a word, triple-click: a line), then \`⌘C\` on a Mac, \`Ctrl+C\` on Windows / Linux — \`Ctrl+C\` with nothing selected still stops the command. Right-click → Copy works too, in ibsh and in your real terminal.
- **Names with spaces**: Tab puts them between quotes — \`cd STA\` + Tab gives \`cd "START HERE/"\`.
- \`exit\` — hides the shell, like **Ctrl+\`** (what runs in it keeps running). \`quit\` — quits ICEBREAKER, like ⌘Q / Alt+F4: pages save, the vault locks, an update waiting installs. In a script \`exit\` ends the script; in your real terminal it's that shell's own \`exit\`.
- **Every click has its command**: \`save\`, \`save as <path>\`, \`copy path|link\`, \`tree reveal\`, \`tab close others|right|all\`, \`modules on|off <id>\`, \`settings <category>\`, \`setup\` — what a menu does shows in the log.
- **Shell tabs**: **+** (or **Ctrl+Shift+\`**) opens a little menu — **ibsh** (enter), then each shell of this computer (zsh, bash, fish; PowerShell, cmd, WSL on Windows), then rename. Several ibsh tabs, each with its own folder and ↑ history; any tab closes (×) and renames (right-click, \`term rename <n> <name>\`). \`term new [ibsh|bash|pwsh…]\`, \`term shells\`; Settings → SHELL → New tab picks what + opens with enter. The tabs come back as you left them.
- **Your real terminal** (zsh, bash, PowerShell): pasting several lines asks first; \`Shift+PgUp\` / \`Shift+PgDn\` scroll back; 10 000 lines are kept.
- \`say <text>\` — the deck's voice says it, with the voice and the language chosen in Settings → VOICE, like UPLINK (in Japanese, a text that isn't Japanese is translated first by your AI). Silent when the sound is muted or the voice is off. In your real terminal too (\`command say\` is macOS's own).

${cmds}

## Files
- Vault: your notes, plain Markdown — \`vault\` shows where. \`vault encrypt\`: encrypted on the disk (names too; a plain backup zip first; a recovery key of 24 words, shown once), \`vault decrypt\`, \`vault export <folder>\` (a plain copy), \`vault recovery\` (a new recovery key), \`vault rekey\` (a new vault key, everything encrypted again). Forgot the password: login page → forgot password?. Encryption is an option: Settings → PRIVACY. Another computer or a USB key: login page → open a vault (the vault carries its account and settings; browse chooses the folder). \`vault move [folder]\`: the whole vault elsewhere, checked (a folder that holds things gets it inside, under its name). Choosing a folder already full of things (Documents…) as the vault offers an \"Icebreaker\" folder inside. Typed in the shell it stays in the shell; with \`--window\` (the menus) every step is a window. The vault key encrypts the files; your password and the recovery key are two doors to it.
- Updates: Settings → UPDATES, or \`update\` (look), \`update install\`, \`store update\` (modules). Every day by default; install asks first unless you say "by itself" (ICEBREAKER then installs when you quit).
- **What's new**: after an update, a short WHAT'S NEW opens once (the version, what's new, what's fixed). Again any time: \`changelog\` (or \`whatsnew\`), Settings → UPDATES → What's new, or THE MENU; ←→ go through the older versions, esc closes.
- STORE in the shell: \`store search\`, \`store info <id>\`, \`store install <id>\` (and what it needs), \`store remove <id>\`.
- Settings: space acts on the line you're on (under the mouse, else the chosen one): ticks a box, turns a choice, puts a slider to 0 and back (mute / unmute; a slider with no 0, like brightness: to its default and back); sliders always go 1 at a time (held: faster, still 1 by 1); greyed = depends on another setting. \`settings <category>\` opens one directly. The STORE: just type to search, del removes. MODULES and NEXUS: just type to search.
- \`.icebreaker/themes/*.toml\` — your themes (\`theme new <name>\`)
- \`.icebreaker/plugins/<id>/\` — your plugins (\`plugin new <id>\`) · they run in a sandbox: only what their permissions allow, in the shell too, never more than you approved (docs/SANDBOX.md)
- **Permissions**: what a module may reach is said in plain words, with a level; the riskiest are asked again the first time they're used. **Settings → PERMISSIONS** shows every module's, with the last use — enter takes one away or gives it back — and what the AI may read (nothing · what you give it · your whole vault) and what your real terminal may ask the deck. \`plugin perms\`, \`plugin revoke <id> <permission>\`, \`plugin grant …\`. The LOG's **◈ access** filter is the journal: who used what, when, on what (docs/PERMISSIONS.md).
- A module allowed to play sound (permission "audio": a tracker, a drum machine) shows **♪ its name** in the status bar while it plays: click it (or \`audio stop\`) to silence it. Its page's tab shows **♪** too: a click there mutes just that tab (**⊘**: it keeps playing, you don't hear it), again to hear it. Its volume: Settings → SOUND → mixer → Modules.
- A page that **plays the keyboard** (a tracker, a piano, a game: the keys are its own) keeps every key while it's in front — letters, digits, space and all the **alt** combinations, alt + arrows too (on Windows and Linux the deck's pane keys): **esc** gives the keys back to the deck (the tree takes them), a click on the page brings them back. ⌘ / ctrl shortcuts stay the deck's.
- \`.icebreaker/templates/journal.md\` — your journal template
- \`.trash/\` — where \`rm\` puts things (\`trash open\` to see it, restore). A note sent there closes its tabs and leaves the pins; ⌘Z brings it back. To delete for good: TRASH → **delete permanently** (or \`del\`), \`trash purge <n>\`, \`trash empty\` — it asks first and **can't be undone** (no ⌘Z): it's the only way the deck erases anything, and only you can (never a module, nor your real terminal).

## Look
- Effects: Settings → APPEARANCE → Effects, the ✦ fx button, or \`fx\`. **Bloom**: a soft glow around the bright things (the logo, the selected tab, accent text) like neon tubes; at 100 % a clear halo a few letters wide, dark backgrounds and grey text don't glow. **RGB split** (\`fx chroma\`): red and blue fringes on the text, the frames and the glyphs, never the backgrounds. **CRT curvature** (\`fx curve 0-100\`, off by default): rounded screen corners, a darker rim, a soft reflection. **Flicker speed** (\`fx flicker 150\`): how fast the CRT flicker goes. Presets: \`fx none | light | medium | heavy | party\` (\`fx off\` = \`fx none\`). \`debug perf\` measures what the screen costs.
- Top bar: **◆ ICEBREAKER ▾** (top left, \`F10\`) is the deck's menu — what's new, updates, the setup again, the guided tour, log out, quit. Beside it, the **menu bar**: modules, store, nexus, settings, help — one click each; each opens as a tab like any other.
- **Frames**: the tree, the page, the side panel and the shell each have their tabs on their border. Drag a tab onto another frame to keep it there (or \`tab move 3 panel\`, or right-click → Move to); drop it onto another tab: a group. Drag the border between two frames to resize (it lights up with ↔ / ↕ under the pointer); **right-click a frame's name (VAULT, PANEL, the shell's tabs) → Move to** left / right / top / bottom, Fold, Layout; Settings → APPEARANCE → Layout; in **ibsh** (not your real terminal, nor a module): \`frame fold tree\` folds one into a strip, \`layout preset shell-right\`, \`layout reset\`, \`tab move 3 panel\`; ⌘Z undoes. **HOME is pinned**: always the first tab, never closed by mistake.
- **Alarms**: \`clock alarm 7:30 [label] [--days mon-fri]\`, \`clock alarm\` lists them, \`rm\` / \`on\` / \`off\` / \`snooze\` / \`test\` — in ibsh (your real terminal can only set one; a module can only list them). They ring (a full screen, the sound, a notification) while ICEBREAKER is running. A **reminder** stays on screen until a click or esc, is written in the log, and reaches the system's notifications when the window is minimized.
- Top bar: **UPLINK ■** — green when your AI is there, amber while it thinks, red when it's off (its tip says which AI; a click opens it).
- **Dialogs**: the answers are always bottom right — No (or close) on the left, Yes (or open) on the right; ← → choose, \`y\` / \`n\` answer, esc is no. A question whose safe answer is no starts on No.
- A small window: the status bar and the page headers drop the least useful things first, never overlapping or cutting them. Developers: \`debug layout\` lists what is cut at 14 sizes, \`debug pad\` shows the gamepad's buttons.
- THEME STUDIO (\`launch studio\`): every knob of the theme, live. Enter on a colour opens the **palette** — 18 hues × 10 shades at the saturation you pick, greys, the theme's own colours; arrows / mouse choose, tab reaches the saturation and the #hex field (still typable), enter keeps it. ↺ on a changed knob (or \`r\`) puts the theme's value back.

## The screen
- **Menu bar** (top): modules · store · nexus · settings · help. The date on the right opens a **mini calendar** (\`clock calendar\`).
- **Frames**: the tree, the page, the side panel, the shell. **▣** in the status bar (\`frame solo\`): the page alone, the others folded away; again: they come back.
- **Status bar** (bottom): arrange it — drag an item sideways, right-click it (move, hide, **join the one on its left** / on its own: groups like tabs), \`statusbar move | hide | show | join | alone | reset\`. ◧ ▾ ◨ ▣ (the tree, the shell, the panel, the page alone) are four items that each move.
- **Log** beside a wide shell: what you type, what clicks run, errors, messages. **›** on its line folds it into a tab (\`log side off\`), the line drags its width (\`log width 40\`); in its tab, **‹ beside the shell** puts it back.
- **HOME**: widgets on pages; ✎ edit shows near the top right (or \`Ctrl+E\`); a widget's pop-up has **⚙ settings** for its module. \`neofetch\` sums up the machine.
- **NEXUS**: the vault as a place — folders are boxes, files are sheets with a little drawing of their kind.

## Modules and the STORE
Everything beyond the core is a module: TODO, CALENDAR, REMINDERS, HABITS, MUSIC, STATS, UPLINK, WEATHER, NEWS… **MODULES** (\`Ctrl+Shift+M\`, \`modules\`) switches them on and off (\`modules on|off <id>\`); a command of a module that's off says so. The **STORE** (\`store\`) installs more, and themes: what a module asks for is shown before it's switched on, and it never gets more (Settings → PERMISSIONS). \`store update\` updates them. \`cal import\` reads a .csv or .ics into your calendar (never twice, never from a hidden folder).

## Offline: stealth
\`stealth on\` (or Settings → PRIVACY, or the setup): **nothing leaves this computer** and your local network — no cloud AI (a local model still works), no weather, no news, no Google, no installs, no update check. **◉ stealth** shows in the status bar; \`stealth off\` brings each network feature back, each still yours to switch on.

## Days and times
The same words everywhere (reminders, \`todo add … --due\`, \`cal add\`), in English or French:
\`+1h\` · \`1h\` · \`30min\` · \`19:00\` · \`19h\` · \`19h30\` · \`demain 9h\` · \`tomorrow 9am\` · \`ven 18h\` · \`fri 6pm\` · \`24/12 9:00\` · \`dans 1h\` · \`à 19h\` · \`ce soir\`.
"1h"… "6h" alone mean "in that long"; with a day ("demain 6h"), or from 7h on, a time of day. A reminder with no time: in an hour.
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
  if (h) return { runs: [{ text: h[2], kind: "title" }], indent: "" };
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
    return t("↑↓ pgup pgdn scroll · ctrl+w close");
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
