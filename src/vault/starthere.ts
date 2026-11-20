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

> **⚠ Read this first — test software.** ICEBREAKER is a hobby project made by one person
> who isn't a developer, with an AI (Claude) writing most of the code. It's free and open,
> built with care — but **never audited, with no warranty and no support**, and **not ready
> for heavy, secure or professional use**. Its author isn't responsible for bugs, data loss
> or security problems.
>
> - **Store nothing sensitive in it**: no passwords, banking, medical, legal or confidential
>   documents — encrypted vault or not.
> - **Back up your vault regularly**: it's a folder, copy it (\`vault export\` when it's encrypted).
> - **Help if you like**: report bugs, say how it went, share ideas, make modules and themes —
>   github.com/kiddoko/ICEBREAKER (Issues and Discussions).
>
> The whole text: DISCLAIMER.md on github.com/kiddoko/ICEBREAKER.

## The 30-second tour

\`\`\`
┌─ tabs ─────────────────────────────────────── nexus · store · modules · ⚙ ─┐
│ ┌ VAULT ┐ ┌ HOME ───────────────────────────────────────────────────────┐ │
│ │ ★ pins │ │  widgets: clock · weather · todo · habits · stats · chat… │ │
│ │ tree   │ │  e = edit the layout · a = add a widget · enter = open it  │ │
│ └────────┘ └───────────────────────────────────────────────────────────┘ │
│ ┌ shell: icbrkr_trm · ibsh · log ────────────────────────── ≡ ─ □ ───┐ │
│ │ ◆ ~/notes ❯ _                                                         │ │
│ └───────────────────────────────────────────────────────────────────────┘ │
└ status bar: what keys do here · ▾ shell · ✦ fx · ⌘K menu · F1 help ────┘
\`\`\`

| You want to… | Do this |
|---|---|
| find or do anything | **THE MENU**: ⌘K, or shift twice (even while typing) — type to search, or a key + enter (m ⏎ = MODULES) |
| see every shortcut | **⌘/ / Ctrl+/** |
| write a note | **⌘N / Ctrl+N**, or *+ note* in the tree |
| today's journal | **⌘J / Ctrl+J** |
| change the look | ⚙ settings → APPEARANCE, or \`theme\` |
| switch a feature off | **MODULES** (⌘⇧M) → space |
| learn the shell | click anything: the command it runs shows in the shell's **log** tab |
| see everything the deck can do | **BLOCKS** (\`blocks\`): every command, setting, shortcut, function… and how to call it |
| someone else on this deck (or a work deck) | the login page → **+ new account**: its own settings, theme and vault |

## Read next

- [[modules]] — every module, what it does, its command
- [[ui]] — HOME, widgets, the tree, tabs, pins, settings
- [[shell]] — ibsh, your real terminal, scripts, macros
- [[keys]] — the keyboard, the mouse, the gamepad
- [[privacy]] — what stays here, what goes out, stealth, modules you install, self-destruct
- [[ai]] — the AI as a work assistant: write, sort, plan (optional, can be local)
- \`for developers/\` — themes, modules, sound packs, tweaking the deck

> Everything here is a normal note: change it, move it, delete it.
> \`starthere\` in the shell writes a fresh copy.
`,

  "modules.md": `# Modules

One feature = one module. Every module can be **switched off, removed and
reinstalled** (MODULES → space / x, or the STORE) — the built-in ones too.

\`\`\`
   ┌──┐ ┌──┐ ┌──┐ ┌──┐
   │▦ │ │◆ │ │☂ │ │◷ │   MODULES (⌘⇧M): a ring of shards (the chips netrunners slot in)
   └──┘ └──┘ └──┘ └──┘   ←↑↓→ choose · enter launch · space on/off · del remove · type to search
\`\`\`

Give a module a **colour** (right-click a module → colour, or \`modules tag todo cyan\`):
its shard takes that colour. The bar on top filters: type to search (**/**),
click colour squares to see only those colours (\`modules view cyan pink\`). NEXUS
has the same bar. The tree's colour squares tick several colours too (\`tag view red blue\`).

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
| **UPLINK** | the AI: the chat (in tabs), the chatbox widget | ⌘⇧U |
| **NEXUS** | the vault in pseudo-3D | \`explore\` |
| **SYSMON** | the machine's vitals | \`sysmon\` |
| **VOICE** | the deck speaks (local voices) — you pick what it says: errors, reminders, events, the time… | \`voice test\` |

Each module's own settings: ⚙ → the ◇ sections at the bottom.
Modules talk to each other (\`modules api\` lists what they share). **BLOCKS**
(\`blocks\`, or \`catalog\` in the shell) shows everything the deck and its modules
can do — commands, settings, shortcuts, functions, widgets — and how to call each.

A module from the STORE or your vault starts **switched off**: switching it on
shows what it asks for and what its code does that a module shouldn't need
(\`plugin audit <id>\`). Only switch on what you trust — see [[privacy]].
`,

  "ui.md": `# The interface

## HOME
Widgets on a 12-column grid, several pages (\`[\` \`]\`).
**Shortcut squares** are your **pins** on HOME: e then a → *Shortcut*, or
right-click a note / folder → *Add to HOME*, or \`home link new\`. A square opens anything in one click — a
module, a note, a folder, a page, a macro, any command — and says which on its
coloured band. A **folder** square opens a little browser under it: enter goes
in, ← back, → forward, n a note, d a folder, del to the trash.

| Key | On HOME |
|---|---|
| ←↑↓→ / Tab | choose a widget |
| enter | open its pop-up (bigger, usable) |
| e | edit: arrows move, shift+arrows resize (or pull the corner **◢**), **a** add, **x** remove |
| m | MODULES |

Widgets stay **exactly where you put them** — leave gaps if you like. Drag a
widget in edit mode: a ghost follows the mouse, the spot it will land on shows
dashed, it moves when you let go.
**The same widget, several times**: add it again (a, or right-click → *one more
of this widget*). Each copy has its own settings — two clocks with different
faces, two weather widgets for two cities (c in its pop-up), world clocks with
their own cities.
**Text too long** for its room scrolls by itself when the mouse is over it or
its line is chosen — everywhere in the deck.

## The tree (left)
\`\`\`
VAULT              8
 + note   + dir    ⌫   ← ⌫: the trash (see it, put things back)
 ■■■■■■■■            ← colour tags: click one to see only that colour
 ★ ✎ ideas          ← pinned (p pins the selected thing)
 ▾ journal/      2
 ├─ 2026-11-17
 └─ 2026-11-18
 ▸ϟ projects/  ■ 3   ← a custom icon, tagged cyan (the square, on the right)
\`\`\`

**Right-click anything** (or the menu key, shift+F10): open, rename (F2),
duplicate, pin, copy the path or a [[link]], a **colour** (red, orange, yellow,
green, cyan, blue, purple, pink — like Ableton), an **icon**, the trash.
In the shell: \`tag notes/ideas.md red\`, \`tag view red\`, \`icon projects ϟ\`.
Tags and icons live in your vault (.icebreaker/tags.json, icons.json).
**Shift + wheel over the tree** walks file by file (a little click each time) and
shows each file at once in a preview tab that the next one replaces — open one
for real (click, enter) and it stays. The plain wheel scrolls the tree.
**Drag & drop**: drag a note or a folder onto another folder to move it there
(below the last row = the vault's root; \`mv\` does the same). Drag files from
the Finder / Explorer onto a folder of the tree: they're **copied** into it
(the originals stay where they were; never overwritten: "a copy.md").
**One click selects** a note (so F2, Delete / ⌘⌫, p act on it), a **double-click**
(or enter) opens it; one click folds a folder. The tree, your tabs and the page you
were on come back as you left them next time.

## Tabs, pins, settings
- Tabs on top: 1…9 (when not typing) or ⌘1…9; ⌘W or ⇧Esc closes one and shows the tab before it. NEXUS, STORE, MODULES and settings open without a tab (Esc closes them).
- **Pins**: one list for everything you keep one click away — notes, folders,
  modules, pages, macros, commands. They show at the top of the tree and in the
  *pinned* widget, and *Add to HOME* also puts one on HOME as a square. Unpin it:
  its square goes too. \`pin projects --key ctrl+shift+p\`.
- **Settings** (⌘,): categories left, settings right, type to search. A setting
  shows its value on the right; its controls (‹ ›, ✎, ›) appear on the line you're
  on. A changed one has a **▎** on its left: **del** puts it back to default, and
  *↺ all back to default* (bottom right) resets the whole category. Hover a
  setting to see what it does and the shell command that does the same.
  **Space** ticks a box or turns a ‹ choice › (the line under the mouse, else the one
  you're on). Sliders go **1 at a time** — drag the handle, hold on the bar, the wheel
  or ←→ — faster the longer you hold. A **greyed** line depends on another setting
  (the voice's lines while the voice is off, Vault key on a plain vault…).
- **Settings → KEYS**: every shortcut on one page — click its keys to change them,
  click its **≡** key to change its key on THE MENU, del for the default.
- **Settings → NOTIFICATIONS**: one box each — on screen, sound, the notification
  center (only when the deck isn't in front, if you like), read aloud.
- **Accounts**: each account is its own deck — its settings, its theme, its
  sounds, its vault, its Google connection. The **login page** is the way in:
  your name and password, or **+ new account** (an account of this deck approves
  it with its name and password, then you choose the new name and password, and
  the setup runs for it). Your profile icon appears only once the name **and**
  the password are right — never just because a name exists. ⚙ YOU → *log out* (or ⌘⇧L, \`lock\`) brings the login
  page back; \`account passwd\` changes your name or password, \`account delete\`
  deletes your account (your notes stay).
- **The setup** (THE MENU → *setup*): the chapters on top, your answers written on
  the left (click one to change it). A number or a click chooses (a theme, and
  the effects of EYE CANDY, show at once on the whole deck), enter or a second
  click keeps it; tab skips, ctrl+enter finishes. After it, a **guided tour**:
  UPLINK (the same face as its HOME widget) shows each part of the screen in turn (→ next, ← back, esc skips — it
  asks first). \`tour\` plays it again.
- **⌘Z undoes anything** (ctrl+Z on Windows / Linux), wherever you are: a
  setting, a theme, a widget moved or resized, a file sent to the trash, a
  rename, a new note or folder — also with a widget's pop-up open. ⌘⇧Z (or
  ctrl+Y) does it again. In a note, ⌘Z
  undoes your typing first. \`undo list\` shows what can be undone, \`undo 3\`
  takes back three things.
- **✦ fx** (status bar): a slider per effect — bloom, scanlines, vignette, RGB
  split, glow (bright things give off light), sharpness. 0 = off, up to 200 %.
  Or a preset: **none · light · medium · heavy · party** (\`fx heavy\`). Each
  theme remembers its own effects.
- Status bar, right: **♪** mutes everything · **☾** the screensaver (each theme
  has its own: a neon city, an 80s mainframe, sonar, warp, an e-reader).
- **◧ side panel** (status bar, ⌘⇧P, or \`panel\`): a column on the right whose
  widgets stay in view on every page. Click it: **a** adds a widget, **e** edits.
  **Edit mode is shared** by HOME and the panel (e on either, esc ends it), and
  works the same way: tab chooses a widget, the arrows move it, **shift+arrows**
  make it bigger / smaller, drag it to move it (between HOME and the panel too),
  drag the panel widget's bottom edge to resize it, x removes. A band across
  HOME and the panel says you're editing (**✓ done** ends it).
  The panel's widgets stay **where you put them**, gaps included (nothing rises
  to fill a hole); taller than the window, it **scrolls** (wheel). Dragging a
  widget onto the panel, a **line shows where it will land** — between two
  widgets, the ones below move down to make room. One ⌘Z undoes the move. Going to another
  page ends edit mode.
- **Clocks at any size**: every clock style (digital, segments, binary, dots,
  analog, minimal…) has a tiny, small, medium, large and huge version — make the
  widget as small as you like, it stays the style you chose.
- **News**: each news widget shows the **categories** you choose (science, AI,
  nature, economy, world…: click the widget → THIS WIDGET), so two news widgets
  can show different things. **Featured** mode: one story, big, with its
  summary (↻ another one). \`news show science ai\`, \`news mode featured\`.
- **⏻** (top right): log out — back to the login page.
- **Tabs** are wide when there are few and get narrower as you open more; when
  they don't fit any more, **▾ +N** lists the others.
- **PULSE** (a HOME widget): what's happening in your modules, one line each —
  the next event, tasks due, the next reminder, the music, the focus timer…
- **Your profile icon**: Settings → YOU → profile icon (or \`avatar\`): a little
  pixel-art face or a glyph, in the colour you like. It's on the login screen
  and in \`whoami\`.
- **Sounds**: Settings → SOUND: the volume of everything, then a **mixer** — one
  fader each for moving around, notifications, the text that types itself out,
  your keys, the start-up, and the sound **modules** play themselves (a module
  allowed to — permission "audio" — shows ♪ its name in the status bar while it
  plays: a click, or \`audio stop\`, silences it).
- A page that **plays the keyboard** (a piano, a tracker, a game) keeps every key while
  it's in front, alt + arrows too: **esc** gives them back to the deck (the tree takes
  them), a click on the page brings them back. *A click on your keys* (off by default) gives your
  typing the theme's own key sound — another one when you erase — played the
  moment the key goes down.
- **Text that types itself out** — the tour, notifications, dialogs, the setup,
  UPLINK's answers, the shell's output — with a little blip, like an old RPG,
  never more than a second behind. Settings → APPEARANCE → *Text speed* (50 by
  default; 100 = at once, one blip).
- **Notes**: a toolbar on top — save (● red when not saved: the tab has a red dot
  too, ⌘S or right-click on the tab saves), save as, a new note, the note before /
  after in the folder, undo, redo.
- **A note changed elsewhere** (Obsidian, iCloud, another editor, the AI) comes back
  on its own when you have no unsaved edits. With edits, nothing is overwritten:
  its toolbar says *changed on disk* — **Take the disk's** (⌘Z brings yours back)
  or **Keep mine**.
- **REMINDERS, TODO, HABITS on HOME**: Delete (⌘⌫) on the line under the mouse
  removes it (a habit asks first), right-click → **Edit…** changes it; in their
  pop-up, e edits and Delete removes the chosen line. In the shell: \`todo edit 3 "…"\`,
  \`remind edit 2 "…" fri 18:00\`, \`habit edit 1 "…" --times 8\`.
- **A widget to another HOME page**: right-click → *Move to page*, or in edit mode
  **[ ]** (it goes, and you go with it), or drag it onto a page number at the bottom.
- **Full screen** (F11, \`fullscreen\`): the whole screen, the notch of a MacBook
  included — the rows behind the camera become a thin band (the deck's name, the time).
- **The caret** is a thin bar that glides from letter to letter (longer and softer
  when it jumps far, a faint trail behind it), flares a little at each key and
  breathes instead of blinking hard (*Reduce motion*: it jumps).
- **‹ value ›** (settings, a clock's face…): a click on the left half goes back, on
  the right half forward.
- **A reminder without a time** is for in an hour (\`remind "tea"\`, or enter on an
  empty "when?").
- **Lists everywhere**: a field that asks for a city, a folder, a model, a command…
  offers a list (▾) and completes with Tab.
- **UPLINK**: each message says who wrote it — you on a tinted band, UPLINK with its
  model. Before each conversation it reads its **context page** (\`context\` opens
  it): who you are, how it should talk to you, how your vault is organised — built
  by the deck, no AI — plus what you add, and what it learns. A click on the VOICE
  box (bottom right) stops the reading. The voice reads an answer while it's
  being written, sentence by sentence; in Japanese, UPLINK starts with a short
  spoken version, read at once.
- **MODULES** is NEXUS's scene with modules on it: each one a shard in its colour,
  with its state; they power up one after the other when the page opens. Just **type**
  to search (MODULES and NEXUS have no letter shortcuts): space switches a module,
  del removes it, enter launches. Even the **TERMINAL** is a module: switch it off and
  the shell panel is gone (commands still run from THE MENU, what they ask comes as a
  window). Every module that ships with the deck is in the **STORE**: remove one, put it
  back from there. **Updates**: Settings → UPDATES (every day, download by
  itself, install by itself or ask first) or \`update\` in the shell; \`store update\` for the
  modules. A module that needs another one (\`requires\`) gets it installed and switched on with it.
- **Smooth text**: every letter that appears fades in — what you type, the
  terminal, the chat (Settings → APPEARANCE → *Smooth text*).
- **Settings** have short, usual names (Zoom, Font size, V-Sync, Reduce motion,
  Volume, Mixer…); what each one does shows under the list for the line you're on
  or under the mouse.
- **Right-click menus**: short, usual names (Open, Rename…, Duplicate, Delete…);
  what a line does shows in a strip under the menu when it's chosen.
- **Shortcuts stand out**: every key written in the interface (⌘⇧P, ctrl+K, F2,
  esc, the letters of hint lines) sits on a little key of its own.
- **On a Mac without a Delete key**: ⌘⌫ does what Delete does (trash a note in the
  tree, remove a widget, a file in the browser).
- **Sliders** all look and work the same: the bar, a square handle, the number on
  the right (← → step, the wheel too, double-click the number to type it).
- Sound packs: Settings → SOUND → sound pack — each theme keeps its own. Packs made
  of audio files go in \`.icebreaker/sounds/packs/<name>/\` (how to make one:
  \`FOR DEVELOPERS/sound-packs\`).
- **Scrolling**: lists and pages glide a little after the wheel and stop at the
  top and the bottom.
- **Smoothness** (Settings → APPEARANCE): vertical sync (follows your screen,
  120 Hz included) or your own frames per second (0-240; 0 = no animations),
  brightness, and *Reduce motion* for slower machines.
`,

  "shell.md": `# The shell

Two shells live in the panel at the bottom (─ or *▾ shell* in the status bar hides
it, ⌘\` brings it back):

| Tab | What |
|---|---|
| **icbrkr_trm** | your real shell (zsh, bash, PowerShell…) **plus** every ICEBREAKER command. + opens another, right-click renames it |
| **ibsh** | ICEBREAKER's own shell: it only sees the vault, \`rm\` goes to .trash |
| **log** | what you typed and clicked (with the output), errors (a code — E102… — and what to do: \`errors E102\`), messages; chips on top filter them (\`log show errors\`) |

\`\`\`
◆ ~/notes ❯ todo add "ship it" --urgent --due fri
◆ ~/notes ❯ ls | grep idea
◆ ~/notes ❯ man todo          (every command has a manual: man <cmd>, <cmd> -h)
\`\`\`

## Handy commands
| | |
|---|---|
| \`menu\` | THE MENU (\`menu add t "launch todo"\`: ⌘K t ⏎ runs it) |
| \`catalog function todo\` | what you can call — \`--json\` for scripts |
| \`notify --alert "tea" "it's ready"\` | call yourself like a reminder does |
| \`account\` · \`lock\` | who you're logged in as · log out (the login page) |
| \`plugin audit <id>\` | what a module's code does before you trust it |

## Scripts (≡)
Shell lines kept in \`.icebreaker/scripts/\`, run in one click (≡, top right of the
shell) or \`script <name>\`.
\`.ibsh\` scripts run in the deck; \`.sh .py .js .ps1\`… run in your terminal.
**Import** one from anywhere: ≡ → import, or \`script import "~/x.sh" work\`.

\`\`\`
# morning.ibsh — one command per line, # comments, {blanks} are asked
todo ls --today
habit
news
\`\`\`

## Bigger
□ (top right of the shell) turns it into a big tab after the others (the page you
were on stays a tab); \`term dock\` puts a terminal back in the panel.

## The trash
\`rm\`, Delete in the tree and right-click → trash move things to .trash (never
deleted for good). \`trash\` lists it, \`trash restore 2\` puts one back where it
lived. ⌫ above the tree (or \`trash open\`) opens the TRASH page: everything in
it, newest first, with where it lived — enter puts it back, r somewhere else,
o opens it to read.

## Macros
Buttons above your terminal that type a command: \`macro add deploy "git pull"\`.
Right-click one → **Set shortcut…**: press the keys, see what they'd replace, OK.
A shortcut can do several things in a row (+ another action). ◂ at the end of
the row hides the macros, ⌗ on the shell (or ⌘⇧K) brings them back
(\`macro hide\` / \`macro show\`).
`,

  "keys.md": `# Keys, mouse, gamepad

**Every shortcut, searchable: ⌘/ (Ctrl+/).** The letter says what it does
(H home, M modules, E explore, U uplink, T tree, P panel, S shell, K macros,
F effects, L lock). **Change any of them** in **Settings → KEYS**: click its keys,
press the new ones (it tells you what they'd replace); its **≡** column is its key
on THE MENU; del puts the default back; *↺ all back to default* resets them all
(asks first). On the SHORTCUTS page: F2 and Del do the same. Shell: \`keys list\`,
\`keys set panel ctrl+shift+b\`, \`keys reset all\`. Your own: \`bind ctrl+shift+1 "open notes/ideas.md"\`.
On a Mac, ⌘ plays the role of Ctrl.

| Everywhere | |
|---|---|
| ⌘/ | shortcuts |
| ⌘, | settings |
| ⌘⇧H · ⌘⇧M · ⌘⇧E | HOME · MODULES · NEXUS (explore) |
| ⌘⇧U | UPLINK, the AI chat |
| ⌘⇧T · ⌘⇧P · ⌘⇧S | the tree · the side panel · the shell |
| ⌘K · ⇧⇧ | **THE MENU**: type to search everything, or a key + enter (m ⏎ = MODULES). Shift twice works anywhere, even while typing |
| ⌘⇧K · ⌘⇧F | macros · effects |
| ⌘N · ⌘⇧N | new note · new folder |
| ⌘J | today's journal |
| ⌘⇧L | lock (log out) |
| ⌘Z · ⌘⇧Z | undo · redo — anything (settings, widgets, trash, renames, new notes) |
| ⌘⇧⌫ | the trash |
| ⇧Esc · ⌘W | close the tab |
| 1…9 | go to that tab (when not typing) |
| Tab · ⇧Tab | next thing · next part of the screen |

Every setting can go back to its default: a changed one has a **▎** on its left,
**del** (or ↺ on its row) puts it back, and the button at the bottom right of each
category resets them all (\`config reset <key>\`). Settings → KEYS: every shortcut
and its key on THE MENU, changed with one click.

| Mouse | |
|---|---|
| click | does it — and the shell's **log** tab shows the command |
| double-click | open (in the tree too: one click selects, one click folds a folder) |
| back / forward buttons | the tab before / after |
| two-finger swipe → ← (trackpad) | the tab after / before |
| pinch · ctrl+wheel | interface bigger / smaller |
| right-click | a menu for what's under it: notes, folders, tabs, widgets, cards, the shell, the editor (copy, paste…) |
| hover | the command and the shortcut |

| Gamepad | |
|---|---|
| D-pad / stick | move |
| A · B | confirm · back |
| Y · X | THE MENU · on-screen keyboard |
| LB · RB | tabs (a tap) |
| hold RB | **THE MENU**: the stick chooses, let go to run it (or the d-pad and A) |

Anything can go on THE MENU: right-click a note, a folder, a module or a macro →
*Add to THE MENU…* and press the key you want, or \`menu add t "launch todo"\`.
`,

  "ai.md": `# The AI, as a work assistant

Optional. ICEBREAKER works fully without it; with it, it's a colleague who has
read your notes when you ask it to. Choose one in ⚙ UPLINK (AI): Claude Code
(your Claude plan), an API key, or **Ollama** (a model on this machine, nothing
leaves it). Stealth mode switches it off entirely.

## Where it is
| | |
|---|---|
| **UPLINK** (⌘⇧U) | a chat, as long as you like — several at once in tabs (ctrl+T a new one, ctrl+[ ctrl+] to move, ctrl+shift+W or right-click a tab to close it) |
| the **chat** widget | a quick question from HOME |
| \`ask\` in the shell | one question, and you can pipe anything into it |

## Write
\`\`\`
ask "a polite email declining the meeting on friday" > notes/reply.md
cat notes/draft.md | ask "shorter, keep my tone" > notes/draft-v2.md
\`\`\`

## Sort and sum up
\`\`\`
cat notes/inbox/*.md | ask "group these by topic, one line each"
journal ls | ask "what did I keep postponing this month?"
grep -r "TODO" notes | ask "which of these are really urgent?"
\`\`\`

## Plan, then make it real
Ask for a plan, then turn the lines you keep into tasks yourself — you stay the
one who decides:
\`\`\`
ask "break 'move flat' into steps of an hour or less"
todo add "call the movers" --due fri
todo add "pack the books" --every sat --cycles 3
\`\`\`

## Good habits
- Give it the text (\`cat … |\`): it only sees what you send.
- Ask for a format: "a table", "bullets", "one line each".
- Keep what's useful in a note (\`> notes/x.md\`): the answer becomes yours.
- Voice: ⚙ VOICE → read UPLINK's answers aloud.
`,

  "privacy.md": `# Privacy

- Your notes are **plain Markdown files** in this folder, unless you encrypt it
  (below). No cloud, no online account.
- What goes online, and only when you use it: the AI you chose (or none — or
  a local model with Ollama), the weather (open-meteo.com), the news, Google
  Calendar if you connect it, GitHub when you install from the STORE.
- **What the AI receives**: your messages, the notes you or it pick, and its
  **context page** (\`context\` opens it): your profile, the names of your folders,
  recent notes and pins, the modules that are on. With Ollama, none of it leaves
  the machine.
- **Stealth** (⚙ PRIVACY, or \`stealth\`): nothing leaves the machine. At all.
- **Accounts**: every account has a password (hashed with Argon2id, never
  stored). Before you log in, nothing of anyone is loaded: no vault, no
  settings, no module. A new account must be approved by an existing one.
- An account **locks the app**. Its vault can be **encrypted** too: \`vault encrypt\`
  (a plain backup zip next to the vault first, every file checked). Then this folder
  holds only noise — no note, no name — and your password opens it at login; ICEBREAKER
  and ibsh work as always, your real terminal, Obsidian and git see noise.
  \`vault export <folder>\`: a plain copy. \`vault decrypt\`: back to plain files.
  It gives a **recovery key**: 24 words, shown once — write them on paper. Forgot
  the password? Login page → *forgot password?*. \`vault recovery\`: a new one. \`vault rekey\` (Settings → PRIVACY → Vault key): a new key for the whole vault, everything encrypted again — if an old copy may be in someone's hands.
  It's an option (Settings → PRIVACY), either way, as often as you like.
  Three things: the **vault key** encrypts the files (you never see it); your **password**
  and the **recovery key** are two doors to it. Typed in the shell, these commands stay in
  the shell; from Settings or THE MENU every step is a window.
- **Your vault carries your account** (its name, a hash of the password, your
  settings): on another computer or from a USB key, login page → *open a vault*
  (*browse* chooses the folder). Moving it: Settings → VAULT → *Move vault*.
  An encrypted vault brings everything. A vault that isn't encrypted is a folder
  anyone with access can write in: it never brings a password, your keys, macros,
  pins or module list, and its other settings only after you say yes.
- **Modules can't touch the encryption**, nor your account's files in the vault.
  Not encrypted, anyone who can open this folder on your disk can read your notes.
- **Log out** (⌘⇧L): back to the login page.
- **Notifications** (⚙ NOTIFICATIONS): on screen, sound, your system's
  notification center, read aloud — one box each.
- **The vault is a wall**: the deck reads and writes only inside it — no path,
  no link (symlink) leads out. Only your terminal reaches the rest of the
  computer, with your own rights.
- **Modules you install** start switched off. Switching one on shows its
  permissions and what its code does that a module shouldn't need (\`plugin
  audit <id>\`). They run in a **sandbox**: only what their permissions allow —
  nothing of the deck, the page, the native side or the network. A module never
  runs with more than the permissions you approved, nor with other code: if an
  update asks for more, or its code changed without you, it stays off until you
  switch it on again (\`plugin reload\` approves the code of a module you're writing). What a module asks you is headed
  with its name.
- **self-destruct**: deletes everything in the vault for good, after four
  confirmations and a countdown. Copies elsewhere are not touched.
`,

  "../FOR DEVELOPERS/README.md": `# For developers

ICEBREAKER is open source (MIT). The interface is TypeScript drawn on a
character grid (no web framework: every frame, things draw themselves with
\`ui.text\`, \`ui.box\`, \`ui.hit\`…); the native side is Rust (Tauri).

- [[themes]] — make the deck look like anything (no code)
- [[sound-packs]] — make the deck sound like anything (audio files)
- [[modules-api]] — write a module: commands, apps, widgets, settings (JavaScript)
- [[guidelines]] — the house rules: a module or a theme others can use and build on
- [[tweaking]] — settings by hand, files, the source
- [[architecture]] — how the deck itself is built, where to find what

\`\`\`
src/            the deck (TypeScript)        plugins/   bundled modules
src-tauri/      the native side (Rust)       docs/      the full docs
\`\`\`

Three rules the whole deck follows: **one feature = one module**, **every
click is a shell command** (so it can be typed, bound to a key, put on THE MENU
or in a macro), and **everything works offline, without an online account, without AI**.
**BLOCKS** (\`blocks\`) lists everything there is to call.

Where the safety lines are (read before you publish a module): \`docs/SANDBOX.md\` (what a
module can reach), \`docs/SECURITY_AUDIT.md\` (what was found, fixed, still open),
\`docs/COMMUNITY.md\` (getting a module verified in the STORE), \`docs/REVIEWING.md\` (how to
review the deck itself). ICEBREAKER is test software: bug reports, ideas, modules and themes
are what it needs most — github.com/kiddoko/ICEBREAKER (Issues and Discussions).
`,
  "../FOR DEVELOPERS/architecture.md": `# How the deck is built

The full map is \`docs/ARCHITECTURE.md\` in the repository. In short:

| Folder | What's there |
|---|---|
| \`src/deck.ts\` | the object everything hangs off; start-up; \`deck.act("command")\` |
| \`src/core/\` | the engine: grid, renderer, input, gamepad, settings, themes, sounds, voice, shortcuts, \`prefs.ts\` (every setting row), \`catalog.ts\` (everything as blocks), \`undo.ts\` (⌘Z: \`deck.history.record({ label, undo, redo })\`) |
| \`src/ui/\` | drawing pieces: \`UI\`, lists, editor, sliders, the ring wheel, \`glide.ts\` (scrolling) |
| \`src/workspace/\` | the screen: panes and input (\`workspace.ts\`), the frame (\`chrome.ts\`), right-click menus (\`menus.ts\`), THE MENU (\`quickmenu.ts\`), the guided tour (\`tour.ts\`), the tree, the side panel, dialogs |
| \`src/apps/\` | what opens in a tab or a page: HOME, notes, settings, MODULES, NEXUS… |
| \`src/widgets/\` | HOME widgets |
| \`src/shell/\` | ibsh, every command (\`commands/*.ts\`), your real terminal; \`origin.ts\` (who a line comes from: a module's line runs as that module) and \`privileged.ts\` (what only you may run) |
| \`src/vault/\` | the notes folder, tags, the journal |
| \`src/plugins/\` | the module system and the \`ib.*\` API (\`api.ts\`), the sandbox (\`sandbox/\`), the STORE's installer |
| \`src-tauri/src/\` | Rust: files, terminal, voice, Google, system stats |

**One frame**: an input changes some state → the deck draws everything again
into a grid of cells → only the cells that changed are repainted. Nothing moves =
nothing is drawn (0 % CPU).

**Clicks**: while drawing, \`ui.hit(rect, { onClick, cmd, menu, tip })\` marks
an area; the last one drawn under the pointer wins. A \`cmd\` area runs that
shell command and the shell's LOG tab shows it — the mouse teaches the command line.

**Traps**: a new setting needs its default in \`core/settings.ts\` (setting an
unknown key fails); dialogs get raw keys, not "up/confirm" actions.

Try things live: \`npm run dev\` opens the deck in a browser with a demo vault,
and \`window.deck\` is there in the console (\`await deck.act("panel show")\`).
\`npm run check\` checks the types and runs the tests (\`tests/\`, including one that
refuses import cycles); \`cargo test\` in \`src-tauri\` checks the vault's walls.
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

[anim]
screensaver = "city"  # city · paper · terminal · sonar · warp
\`\`\`

| Command | |
|---|---|
| \`theme\` | list them |
| \`theme set <name>\` | switch |
| \`theme tweak accent #ff2e88\` | change one value, live (\`theme tweak\` lists them) |
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
| \`commands\` · \`apps\` · \`widgets\` · \`palette\` | add things to the deck (\`palette\` = THE MENU; \`key: "g"\` gives it a menu key if free) |
| \`vault\` | read / write notes (permissions); \`readBytes\` / \`writeBytes\` for binary files (a song, a sample: 16 MB at most) |
| \`apps\` + \`rawKeys: true\` | a page that plays the keyboard (a piano, a game): every key with its place (\`code\`), never as text |
| \`audio\` | sound of your own (permission "audio"): \`sample(id, data, { loopStart, loopLength })\`, then \`schedule([{ at, voice, play, rate, volume, pan, interp }])\` on the clock of \`now()\`; \`decode(bytes)\` reads wav, mp3, m4a… |
| \`stats\` | numbers over time, shown by STATS |
| \`modules\` | call other modules (\`todo.add\`, \`journal.append\`…), expose yours |
| \`settings\` | your settings, shown in ⚙ under your name |
| \`ui\` | notify, alert, confirm, prompt (with \`suggestions\`: ▾ and Tab), choose |
| \`catalog\` | everything the deck can do, as plain data: \`ib.catalog.list("function", "todo")\` |
| \`ai\` · \`media\` · \`google\` · \`storage\` | the rest |

Right-click menus: give a clickable area a \`menu\`: \`ui.hit(rect, { cmd, menu: () => [{ label: "done", cmd: "todo done 3" }] })\`.
Call anything — another module or the deck's own parts — in one line:
\`await ib.use("tree").reveal("notes/ideas.md")\`, \`ib.use("theme").colors()\`,
\`ib.use("terminal").run("git status")\` (permission "terminal"), \`ib.use("todo").add("…")\` (permission "vault:write").
What a module has the deck do runs **as that module**: \`ib.shell.run\` and the functions that run a
command (\`shell.run\`, \`home.add\`…) refuse what only you may do (the vault's encryption, accounts,
scripts, macros, shortcuts, THE MENU's keys, pins, the STORE, updates…) and read, pipe or write notes
only with \`vault:read\` / \`vault:write\` — never \`.icebreaker/\`. A module's id is its folder's name.
\`modules api\` in the shell lists every function; the deck's own parts include
\`menu\` (open, items), \`keys\` (list, run) and \`deck\` (notify, alert, say, setting: the look
and sound settings). \`menu.add\`, \`keys.bind\` and \`home.link\` plant a command behind a key or
a square: they're the deck's own, a module can't call them.
Settings rows: \`ib.settings.register([{ key, label, type: "toggle" | "choice" | "text" | "number" | "action", … }])\`
— an \`action\` row runs a \`cmd\` (or \`run()\`) and shows a \`value()\` ("connected"…).
Widgets: \`size\`, \`min\`, \`max\` (a shortcut square: \`max: { w: 1, h: 2 }\`), \`popup\` or
\`activate\` for Enter, \`clickActivates\` for one-click widgets.
Errors you report with \`ib.ui.notify(text, "error")\` land in the error log with a code (docs/ERRORS.md).

Everything is typed and commented in \`src/plugins/api.ts\`; a walkthrough in
\`docs/PLUGINS.md\`; the house rules in [[guidelines]]. Before someone switches
your module on, the deck shows what its code does that a module shouldn't need
(reaching the native side, \`eval\`, its own network calls…): use \`ib.*\` for
everything and the report stays clean (\`plugin audit <id>\`). Share it through
the STORE (a GitHub repo).
`,

  "../FOR DEVELOPERS/guidelines.md": `# The house rules

The full version is \`docs/GUIDELINES.md\` in the repository. In short — a module
(or a theme) the ICEBREAKER way:

1. **Everything is a command.** What your UI does, a shell command does too, and
   the UI runs it: then it can be bound to a key, put on THE MENU, in a macro.
2. **Everything is callable.** Expose what's useful (\`ib.modules.expose\`), with
   one line of doc; return plain data.
3. **Everything is readable.** \`summary\`, \`usage\`, \`examples\` on commands, a
   \`help\` on settings: nobody should need your code to use it.
4. **One thing, one place.** Use what exists (\`ib.lib\`: lists, the filter bar,
   sliders…) and call other modules (\`ib.use("todo")\`) instead of copying them.
5. **The theme decides the look.** Colours from \`ui.c\`, never a hex colour.
6. **Offline, private, polite.** Works without internet, online account or AI; asks only
   for the permissions it uses; the user's data stays readable in the vault.
7. **The user is in charge.** Never steal a key; every setting has a default to
   come back to.

A theme: readable first (a whole evening of reading), one accent, good without
its effects, tested on HOME, a note, the settings, the shell and a dialog.
`,

  "../FOR DEVELOPERS/sound-packs.md": `# Sound packs

The full charter is \`docs/SOUND_PACKS.md\` in the repository. In short:

\`\`\`
.icebreaker/sounds/packs/<your-pack>/
  pack.toml        name, author, version, description, licence
  move.wav  tick.wav  open.wav  confirm.wav  back.wav  select.wav
  notify.wav  success.wav  error.wav  alert.wav  unlock.wav  denied.wav  boot.wav
  blip.wav (text typing itself out)  key.wav  erase.wav (your keys, if switched on)
\`\`\`

| | |
|---|---|
| format | .wav (best), .ogg or .mp3 · 44.1 / 48 kHz · mono is enough |
| size | 1 MB per file at most |
| length | boot ≤ 6 s · alert, unlock, denied ≤ 3 s · blip, key, erase ≤ 0.3 s · everything else ≤ 1.5 s |
| feel | starts at once (no silence), ends with a tiny fade, soft on repeat (\`move\` and \`tick\` play all the time), \`alert\` heard from another room |

Missing sounds are played by the deck's synthesizer: start with \`move\`, \`open\`,
\`confirm\`, \`back\`. Test: \`sound reload\`, \`sound pack <your-pack>\`, \`sound test\`.
Only share sounds you made or may share, and say the licence in \`pack.toml\`.
`,

  "../FOR DEVELOPERS/tweaking.md": `# Tweaking the deck

- **Every setting** has a command: \`config list\`, \`config set fx.bloom true\`;
  effects take one number: \`fx glow 60\`, \`fx chroma 120\` (0 = off, up to 200).
- Settings live in the system's config folder (\`config path\`); the API key in
  a separate secrets file.
- Your files: \`.icebreaker/themes\`, \`.icebreaker/plugins\`, \`.icebreaker/scripts\`,
  \`.icebreaker/templates/journal.md\` (your journal template), \`.icebreaker/stats.json\`.
- \`modules api\` lists what modules share; \`modules call <module> <fn> [args]\`;
  \`catalog <kind> [words] --json\` everything, as JSON.
- Your own sounds: \`.icebreaker/sounds/<name>.wav\`, or a whole pack in
  \`.icebreaker/sounds/packs/<id>/\` ([[sound-packs]]).
- The source: \`git clone\` the repository, \`npm install\`, \`npm run dev\` for the
  browser preview, \`npm run app\` for the app with hot reload, \`npm run app:mac\`
  (a Mac) or \`npm run app:build\` (Windows / Linux) to build it.
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

/** where the deck remembers what it wrote (to tell your edits from its own) */
const STAMP = ".icebreaker/starthere.json";

/** a short fingerprint of a text (not for security: "is it still what we wrote?") */
function fingerprint(text: string): string {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}

/**
 * Write START HERE into the vault, and keep it up to date: a missing note is
 * written; a note still exactly as the deck wrote it is replaced by the new
 * version; a note you changed is left alone (`force` rewrites it anyway).
 * Runs at every start, so every vault gets the docs of the deck it runs on.
 * Returns how many notes were written, and which ones were kept because you edited them.
 */
export async function writeStartHere(vault: Vault, force = false): Promise<number> {
  const r = await syncStartHere(vault, force);
  vault.docsYours = r.yours;
  return r.written;
}

export async function syncStartHere(vault: Vault, force = false): Promise<{ written: number; yours: string[] }> {
  let written = 0;
  const yours: string[] = [];
  let stamps: Record<string, string> = {};
  try {
    if (await vault.exists(STAMP)) stamps = JSON.parse(await vault.read(STAMP)) as Record<string, string>;
  } catch {
    stamps = {};
  }
  await vault.mkdir(`${DIR}`).catch(() => {});
  await vault.mkdir("FOR DEVELOPERS").catch(() => {});
  for (const [name, body] of Object.entries(START_HERE)) {
    const path = name.startsWith("../") ? name.slice(3) : `${DIR}/${name}`;
    const text = forThisOS(body);
    const there = await vault.exists(path);
    // a note the deck wrote and you deleted stays deleted
    if (!force && !there && stamps[path]) continue;
    if (!force && there) {
      const now = await vault.read(path).catch(() => "");
      if (now === text) {
        stamps[path] = fingerprint(text);
        continue;
      }
      // changed since the deck wrote it (or written before stamps existed): yours, left alone
      if (stamps[path] !== fingerprint(now)) {
        yours.push(path);
        continue;
      }
    }
    await vault.write(path, text);
    stamps[path] = fingerprint(text);
    written++;
  }
  await vault.write(STAMP, JSON.stringify(stamps, null, 2)).catch(() => {});
  return { written, yours };
}

export const startHereCommand: Command = {
  name: "starthere",
  aliases: ["docs"],
  summary: "write the START HERE notes (the docs) into your vault",
  usage: "starthere          bring the docs up to date (notes you changed stay as they are)\nstarthere --force  rewrite them all (your changes to them go)",
  async run(ctx) {
    const n = await writeStartHere(ctx.deck.vault, ctx.args.includes("--force"));
    await ctx.deck.vault.rescan();
    ctx.out(n ? `START HERE: ${n} notes written — open START HERE/README\n` : "START HERE is already there (starthere --force rewrites it)\n");
    if (n) void ctx.deck.openFile(`${DIR}/README.md`);
    return 0;
  },
};
