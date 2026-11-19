/**
 * START HERE — the documentation, as notes in your vault: written into every
 * new vault, and (again) by `starthere` in the shell. Plain Markdown with a
 * bit of ASCII, readable in ICEBREAKER, Obsidian or any editor.
 */
import type { Command } from "../shell/types";
import type { Vault } from "./vault";
import { IS_MAC } from "../core/input";

const DIR = "START HERE";

const LOGO = `\`\`\`
 ██╗ ██████╗███████╗██████╗ ██████╗ ███████╗ █████╗ ██╗  ██╗███████╗██████╗
 ██║██╔════╝██╔════╝██╔══██╗██╔══██╗██╔════╝██╔══██╗██║ ██╔╝██╔════╝██╔══██╗
 ██║██║     █████╗  ██████╔╝██████╔╝█████╗  ███████║█████╔╝ █████╗  ██████╔╝
 ██║██║     ██╔══╝  ██╔══██╗██╔══██╗██╔══╝  ██╔══██║██╔═██╗ ██╔══╝  ██╔══██╗
 ██║╚██████╗███████╗██████╔╝██║  ██║███████╗██║  ██║██║  ██╗███████╗██║  ██║
 ╚═╝ ╚═════╝╚══════╝╚═════╝ ╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝
                    open-source cyberdeck · your notes, your machine
\`\`\``;

export const START_HERE: Record<string, string> = {
  "README.md": `# START HERE

${LOGO}

Welcome, netrunner. ICEBREAKER is a **notes app that looks like an old sci-fi
terminal** — and a little operating system around your notes: modules,
widgets, a real shell, an AI if you want one. Everything works offline, with
the keyboard, the mouse or a gamepad.

## The 30-second tour

\`\`\`
┌─ tabs ─────────────────────────────────────── nexus · store · modules · ⚙ ─┐
│ ┌ VAULT ┐ ┌ HOME ───────────────────────────────────────────────────────┐ │
│ │ ★ pins │ │  widgets: clock · weather · todo · habits · stats · chat… │ │
│ │ tree   │ │  e = edit the layout · a = add a widget · enter = open it  │ │
│ └────────┘ └───────────────────────────────────────────────────────────┘ │
│ ┌ shell: icbrkr_trm · ibsh · history · ≡ scripts · ▾ hide ──────────────┐ │
│ │ ◆ ~/notes ❯ _                                                         │ │
│ └───────────────────────────────────────────────────────────────────────┘ │
└ status bar: what keys do here · ▾ shell · ✦ fx · ^K palette · F1 help ────┘
\`\`\`

| You want to… | Do this |
|---|---|
| find anything | **⌘K / Ctrl+K** — the command palette |
| see every shortcut | **⌘/ / Ctrl+/** |
| write a note | **⌘N / Ctrl+N**, or *+ note* in the tree |
| today's journal | **⌘J / Ctrl+J** |
| change the look | ⚙ settings → APPEARANCE, or \`theme\` |
| switch a feature off | **MODULES** (⌘⇧M) → space |
| learn the shell | click anything: the command it runs shows in the shell |

## Read next

- [[modules]] — every module, what it does, its command
- [[ui]] — HOME, widgets, the tree, tabs, pins, settings
- [[shell]] — ibsh, your real terminal, scripts, macros
- [[keys]] — the keyboard, the mouse, the gamepad
- [[privacy]] — what stays here, what goes out, stealth, self-destruct
- \`for developers/\` — themes, modules, tweaking the deck

> Everything here is a normal note: change it, move it, delete it.
> \`starthere\` in the shell writes a fresh copy.
`,

  "modules.md": `# Modules

One feature = one module. Every module can be **switched off, removed and
reinstalled** (MODULES → space / x, or the STORE) — the built-in ones too.

\`\`\`
   ┌──┐ ┌──┐ ┌──┐ ┌──┐
   │▦ │ │◆ │ │☂ │ │◷ │   MODULES (⌘⇧M): a ring of floppy disks, like NEXUS
   └──┘ └──┘ └──┘ └──┘   ←↑↓→ choose · enter launch · space on/off · p pin
\`\`\`

| Module | What it does | Try |
|---|---|---|
| **TODO** | tasks with priorities, due dates, tags, **recurring** | \`todo add "gym" --every mon,wed,sat\` |
| **HABITS** | boxes that reset every day, streaks ▲ | \`habit add "water" --times 8\` |
| **REMINDERS** | a notification before and on time | \`remind "call mom" fri 18:00\` |
| **CALENDAR** | a local calendar (+ Google if you want) | \`cal add "dentist" fri 14:30\` |
| **JOURNAL** | one page a day, the evening check-in | \`today\` · \`daily\` |
| **STATS** | numbers over time, from modules and from you | \`stats set weight 72 --unit kg\` |
| **WEATHER** | any place, an animated ASCII sky, the week | \`weather Tokyo\` |
| **CLOCKS** | timers (several), a stopwatch with laps, the world | \`timer 4m tea\` |
| **FOCUS** | a pomodoro ring, zen mode | \`focus open\` |
| **NEWS** | your area + your interests | \`news add tech\` |
| **MUSIC** | your music folder, what's playing | \`music play daft punk\` |
| **UPLINK** | the AI: LINK chat, the chatbox widget | ⌘Space |
| **NEXUS** | the vault in pseudo-3D | \`explore\` |
| **SYSMON** | the machine's vitals | \`sysmon\` |
| **VOICE** | the deck speaks (local voices) | \`voice test\` |

Each module's own settings: ⚙ → the ◇ sections at the bottom.
Modules talk to each other (\`modules api\` lists what they share).
`,

  "ui.md": `# The interface

## HOME
Widgets on a 12-column grid, several pages (\`[\` \`]\`).

| Key | On HOME |
|---|---|
| ←↑↓→ / Tab | choose a widget |
| enter | open its pop-up (bigger, usable) |
| e | edit: arrows move, shift+arrows resize, **a** add, **x** remove |
| m | MODULES |

Widgets rise to the top on their own; holes close up.

## The tree (left)
\`\`\`
VAULT              8
 + note   + dir
 ●●●●●●●●            ← colour tags: click one to see only that colour
 ★ ✎ ideas          ← pinned (p pins the selected thing)
 ▾ journal/      2
 ├─ 2026-11-17
 └─ 2026-11-18
 ▸⚡ projects/        ← a custom icon, tagged cyan
\`\`\`

**Right-click anything** (or the menu key, shift+F10): open, rename (F2),
duplicate, pin, copy the path or a [[link]], a **colour** (red, orange, yellow,
green, cyan, blue, purple, pink — like Ableton), an **icon**, the trash.
In the shell: \`tag notes/ideas.md red\`, \`tag view red\`, \`icon projects ⚡\`.
Tags and icons live in your vault (.icebreaker/tags.json, icons.json).

## Tabs, pins, settings
- Tabs on top: 1…9 (when not typing) or ⌘1…9; ⌘W or ⇧Esc closes one and shows the tab before it. NEXUS, STORE, MODULES and settings open without a tab (Esc closes them).
- **Pins**: notes, folders, modules at the top of the tree and in the *pinned*
  widget — \`pin projects --key ctrl+shift+p\`.
- **Settings** (⌘,): categories left, settings right, type to search; each
  setting says what it does, and shows the shell command that does the same.
- **✦ fx** (status bar): bloom, scanlines, vignette, colour fringes, sharpness.
`,

  "shell.md": `# The shell

Two shells live in the panel at the bottom (▾ hides it, ⌘\` brings it back):

| Tab | What |
|---|---|
| **icbrkr_trm** | your real shell (zsh, bash, PowerShell…) **plus** every ICEBREAKER command. + opens another, right-click renames it |
| **ibsh** | ICEBREAKER's own shell: it only sees the vault, \`rm\` goes to .trash |
| **history** | what your clicks ran, with their output |

\`\`\`
◆ ~/notes ❯ todo add "ship it" --urgent --due fri
◆ ~/notes ❯ ls | grep idea
◆ ~/notes ❯ man todo          (every command has a manual: man <cmd>, <cmd> -h)
\`\`\`

## Scripts (≡ scripts)
Shell lines kept in \`.icebreaker/scripts/\`, run in one click or \`script <name>\`.
\`.ibsh\` scripts run in the deck; \`.sh .py .js .ps1\`… run in your terminal.
**Import** one from anywhere: ≡ scripts → import, or \`script import "~/x.sh" work\`.

\`\`\`
# morning.ibsh — one command per line, # comments, {blanks} are asked
todo ls --today
habit
news
\`\`\`

## Bigger
⤢ maximize turns the shell into a big tab after the others (the page you
were on stays a tab); \`term dock\` puts a terminal back in the panel.

## Macros
Buttons above your terminal that type a command: \`macro add deploy "git pull"\`.
`,

  "keys.md": `# Keys, mouse, gamepad

**Every shortcut, searchable: ⌘/ (Ctrl+/).** Bind your own: \`bind ctrl+shift+1 "open notes/ideas.md"\`.
On a Mac, ⌘ plays the role of Ctrl.

| Everywhere | |
|---|---|
| ⌘K | palette |
| ⌘/ | shortcuts |
| ⌘, | settings |
| ⌘⇧H · ⌘⇧M | HOME · MODULES |
| ⌘N · ⌘⇧N | new note · new folder |
| ⌘J | today's journal |
| ⌘⇧L | lock |
| ⇧Esc · ⌘W | close the tab |
| 1…9 | go to that tab (when not typing) |
| Tab · ⇧Tab | next thing · next part of the screen |

| Mouse | |
|---|---|
| click | does it — and shows the command in the shell |
| double-click | open (one click is enough in the tree) |
| back / forward buttons | the tab before / after |
| two-finger swipe ← → (trackpad) | the tab after / before |
| pinch · ctrl+wheel | interface bigger / smaller |
| right-click | a menu for what's under it: notes, folders, tabs, widgets, cards, the shell, the editor (copy, paste…) |
| hover | the command and the shortcut |

| Gamepad | |
|---|---|
| D-pad / stick | move |
| A · B | confirm · back |
| Y · X | palette · on-screen keyboard |
| LB · RB | tabs |
`,

  "privacy.md": `# Privacy

- Your notes are **plain Markdown files** in this folder. No account, no cloud.
- What goes online, and only when you use it: the AI you chose (or none — or
  a local model with Ollama), the weather (open-meteo.com), the news, Google
  Calendar if you connect it, GitHub when you install from the STORE.
- **Stealth** (⚙ PRIVACY, or \`stealth\`): nothing leaves the machine. At all.
- **Lock** (⌘⇧L): the deck asks for your password.
- **self-destruct**: deletes everything in the vault for good, after four
  confirmations and a countdown. Copies elsewhere are not touched.
`,

  "../FOR DEVELOPERS/README.md": `# For developers

ICEBREAKER is open source (MIT). The interface is TypeScript drawn on a
character grid; the native side is Rust (Tauri).

- [[themes]] — make the deck look like anything
- [[modules-api]] — write a module: commands, apps, widgets, settings
- [[tweaking]] — settings by hand, files, the source

\`\`\`
src/            the deck (TypeScript)        plugins/   bundled modules
src-tauri/      the native side (Rust)       docs/      the full docs
\`\`\`
`,

  "../FOR DEVELOPERS/themes.md": `# Themes

A theme is one TOML file in \`.icebreaker/themes/\`. \`theme new mytheme\` copies
the current one for you; THEME STUDIO edits it live.

\`\`\`toml
[ui]
bg = "#0b0b12"      # background
fg = "#d8d4f0"      # text
accent = "#b48cff"  # the main colour

[background]
effect = "rain"     # rain · stars · snow · scan · grain …

[fx]
bloom = 0.4         # glow
scanlines = 0.1
\`\`\`

| Command | |
|---|---|
| \`theme\` | list them |
| \`theme <name>\` | switch |
| \`theme tweak ui.accent "#ff2e88"\` | change one value, live |
| \`theme new <name>\` | a copy to edit |

Full reference: \`docs/THEMES.md\` in the repository.
`,

  "../FOR DEVELOPERS/modules-api.md": `# Writing a module

A module is a folder in \`.icebreaker/plugins/<id>/\` with \`plugin.json\` and
\`main.js\`. \`plugin new <id>\` writes a ready-to-edit one.

\`\`\`js
export function activate(ib) {
  ib.commands.register({ name: "hello", summary: "says hi", run(ctx) { ctx.out("hi\\\\n"); } });
  ib.widgets.register({ id: "hi", title: "hello", size: { w: 3, h: 2 }, render(ui, r) { ui.text(r.x, r.y, "hi!"); } });
}
\`\`\`

| \`ib.\`… | |
|---|---|
| \`commands\` · \`apps\` · \`widgets\` · \`palette\` | add things to the deck |
| \`vault\` | read / write notes (permissions) |
| \`stats\` | numbers over time, shown by STATS |
| \`modules\` | call other modules (\`todo.add\`, \`journal.append\`…), expose yours |
| \`settings\` | your settings, shown in ⚙ under your name |
| \`ui\` | notify, alert, confirm, prompt, choose |
| \`ai\` · \`media\` · \`google\` · \`storage\` | the rest |

Everything is typed and commented in \`src/plugins/api.ts\`; a walkthrough in
\`docs/PLUGINS.md\`. Share it through the STORE (a GitHub repo).
`,

  "../FOR DEVELOPERS/tweaking.md": `# Tweaking the deck

- **Every setting** has a command: \`config list\`, \`config set fx.bloom true\`.
- Settings live in the system's config folder (\`config path\`); the API key in
  a separate secrets file.
- Your files: \`.icebreaker/themes\`, \`.icebreaker/plugins\`, \`.icebreaker/scripts\`,
  \`.icebreaker/templates/journal.md\` (your journal template), \`.icebreaker/stats.json\`.
- \`modules api\` lists what modules share; \`modules call <module> <fn> [args]\`.
- The source: \`git clone\` the repository, \`npm install\`, \`npm run dev\` for the
  browser preview, \`npm run app:mac\` (or win / linux) for the app.
`,
};

/**
 * The notes are written with Mac keys (⌘ ⇧ ⌥). On Windows and Linux they're
 * rewritten the way that keyboard says it: Ctrl+, Shift+, Alt+.
 */
export function forThisOS(text: string): string {
  if (IS_MAC) return text;
  return text
    .replace(/On a Mac, ⌘ plays the role of Ctrl\.?/g, "On a Mac these are ⌘ shortcuts; here, Ctrl.")
    .replace(/⌘⇧⌥/g, "Ctrl+Shift+Alt+")
    .replace(/⌘⇧/g, "Ctrl+Shift+")
    .replace(/⌘⌥/g, "Ctrl+Alt+")
    .replace(/⌘/g, "Ctrl+")
    .replace(/⇧/g, "Shift+")
    .replace(/⌥/g, "Alt+")
    .replace(/Ctrl\+ /g, "Ctrl ")
    .replace(/(Ctrl|Shift|Alt)\+\+/g, "$1+");
}

/** Write START HERE into the vault (keeps notes you already have unless `force`). */
export async function writeStartHere(vault: Vault, force = false): Promise<number> {
  let n = 0;
  await vault.mkdir(`${DIR}`).catch(() => {});
  await vault.mkdir("FOR DEVELOPERS").catch(() => {});
  for (const [name, body] of Object.entries(START_HERE)) {
    const path = name.startsWith("../") ? name.slice(3) : `${DIR}/${name}`;
    if (!force && (await vault.exists(path))) continue;
    await vault.write(path, forThisOS(body));
    n++;
  }
  return n;
}

export const startHereCommand: Command = {
  name: "starthere",
  aliases: ["docs"],
  summary: "write the START HERE notes (the docs) into your vault",
  usage: "starthere          add what's missing\nstarthere --force  rewrite them all (your changes to them go)",
  async run(ctx) {
    const n = await writeStartHere(ctx.deck.vault, ctx.args.includes("--force"));
    await ctx.deck.vault.rescan();
    ctx.out(n ? `START HERE: ${n} notes written — open START HERE/README\n` : "START HERE is already there (starthere --force rewrites it)\n");
    if (n) void ctx.deck.openFile(`${DIR}/README.md`);
    return 0;
  },
};
