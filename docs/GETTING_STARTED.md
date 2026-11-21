# Getting started

> **⚠ Test software.** ICEBREAKER is a hobby project, never audited, not ready for heavy,
> secure or professional use: **store nothing sensitive in it, back up your vault
> regularly**, and tell us what breaks ([../DISCLAIMER.md](../DISCLAIMER.md)). The deck says
> so too: on the login page, at start-up and on the first screen of the setup.

A ten-minute tour of the deck. Everything here also works with a gamepad.

## 1. The first launch

ICEBREAKER plays its boot sequence (each line is a real start-up step, with its
duration), then the **login page**: the first time, create your account (a name
and a password — every account is its own deck: settings, theme, sounds, vault).
Then a few questions: the deck's language (English or French), connected or
stealth, your handle, terminal, location (only as precise as you want), AI,
calendar, theme and effects (both show live on the whole deck as you move through
them), sounds and notifications. **Every question has a "no" or "later" answer.**
After it, a **guided tour**: UPLINK lights each part of the screen and explains
it (`tour` plays it again). Run the setup again any time: `Ctrl+K` → *setup*.

Your vault is a folder of Markdown files (default `Documents/Icebreaker`). Point
the deck at an existing Obsidian vault with `vault mount /path` or in Settings.

## 2. The screen

```
┌ VAULT ┐┌ HOME / the page you opened ──────────────┐┌ PANEL ┐
│ tree  ││ widgets, notes, apps…                    ││widgets│
└───────┘└──────────────────────────────────────────┘└───────┘
┌ zsh ─ ibsh ─ log ─────────────────────────── ≡ ─ ▢ ┐
│ the shell                                           │
└─────────────────────────────────────────────────────┘
 status bar · ✦ fx · ⌘K menu · F1 help · ◧ panel
```

- **HOME** — widgets. `e` to edit (drag them, pull the corner ◢ to resize, gaps
  allowed), `a` to add one (the same widget several times if you like), `[` `]`
  to change page.
- **The side panel** (◧, `Ctrl+Shift+P`) — widgets that stay in view on every page.
- **The shell** — your real terminal (zsh/bash/PowerShell) with every ICEBREAKER
  command added, ICEBREAKER's own sandboxed shell (*ibsh*), and the *log* of what
  your clicks ran, errors and notifications.
- **Every click is a command.** Hover anything to see the command it runs; the
  log tab shows it. The mouse teaches you the keyboard.
- **THE MENU** — `Ctrl+K`, or shift twice: search everything, or a key + enter.
- **Undo** — `Ctrl+Z` (⌘Z) takes back the last thing you did, anywhere.

## 3. Things to try

```bash
journal "first night on the deck"         # a line in today's journal
note new "ideas"                          # a note
todo add "walk the dog" --due tomorrow    # a task
cal add "dentist" fri 14:30               # an event (in calendar/ in your vault)
music folder ~/Music                      # your music, played by the deck
daily                                     # end-of-day check-in
theme set <Tab>                           # change the look
help                                      # every command · man <cmd> for details
```

`Ctrl+K` opens THE MENU (commands, notes, themes, settings). `F1` is the full manual.

## 4. Modules

One feature = one module, each with its **command**, its **app** and its **HOME
widget**: TODO, CALENDAR, MUSIC, STATS… `Ctrl+K` → *Modules* lists them, and you
can switch any of them off. More from the community: the **STORE** (`store`, `store search`);
modules marked ⚠ *not verified* weren't reviewed by the project — read [DISCLAIMER.md](../DISCLAIMER.md).

## 5. Staying offline: stealth mode

Nothing needs the internet. Pick **Stealth** at the start of the setup, or type
`stealth on` any time: the deck then never goes online — no cloud AI (a local
model through Ollama still works, on this machine or a computer on your
network), no weather, news, Google or installs. The status bar shows `◉ stealth`.
Your vault can still live on your own server: mount it as a network drive and
point the deck at it (`vault mount /Volumes/nas/vault`). See [PRIVACY.md](PRIVACY.md).

## 6. A voice

```bash
voice install en      # a neural English voice (Jenny), once (~85 MB) — or fr (Siwis), en-us (Amy)
voice language ja     # or: Japanese, always (the system's Japanese voice; UPLINK writes a Japanese line to say, the rest is translated)
voice on              # then: voice test
voice read on         # UPLINK reads its answers aloud
voice robot 80        # more machine (0 = clean, 100 = full robot)
```

No command line needed: the setup and **Settings → VOICE** do the same (download,
language, robot filter, reading UPLINK's answers). Without the download, the system voice works too (macOS `say`, `espeak-ng` on
Linux, Windows' own). Everything is synthesized on your computer.

## 7. Widgets and themes

Enter, double-click or A on a HOME widget opens its **pop-up** — the widget,
bigger and usable — with a button to its module. `theme set e-ink`,
`theme set neon-district`, `theme set abyss`… each theme brings its own motion
and sounds; `theme studio` tweaks everything live.

## 8. Store and NEXUS

The top bar has your shortcuts: **⬡ nexus** (the vault in 3D: `+` new note,
`/` search, F2 rename, delete → trash, `:` every action), **⇣ store** (modules
and themes to install, and your own sources) and **▦ modules**.

## 9. Where things are

| what | where |
|------|-------|
| notes, journal, calendar | your vault (plain files) |
| modules' own data | `<vault>/.icebreaker/plugin-data/` |
| your themes, plugins, sounds | `<vault>/.icebreaker/` |
| settings, login, Google token and cache | the app config folder (macOS: `~/Library/Application Support/org.icebreaker.deck/`) |
| downloaded voices (piper) | the app data folder, `voice/` |

Questions or bugs: open an issue.
