# Getting started

A ten-minute tour of the deck. Everything here also works with a gamepad.

## 1. The first launch

ICEBREAKER plays its boot sequence (each line is a real start-up step, with its
duration), then asks a few questions: the deck's language (English or French),
connected or stealth, your handle, an optional gender, an optional login, your
terminal, language, location (only as precise as you want), AI, calendar, HOME
layout, effects and sounds. **Every question has a "no" or "later" answer.**
Run it again any time: `Ctrl+K` → *Setup*.

Your vault is a folder of Markdown files (default `Documents/Icebreaker`). Point
the deck at an existing Obsidian vault with `vault mount /path` or in Settings.

## 2. The screen

```
┌ VAULT ┐┌ HOME / the page you opened ─────────────────────────┐
│ tree  ││ widgets, notes, apps…                               │
└───────┘└─────────────────────────────────────────────────────┘
┌ zsh ─ ibsh ─ history ─ ⤢ maximize ──────────────────────────┐
│ the shell                                                    │
└──────────────────────────────────────────────────────────────┘
 status bar · ✦ fx · ^K palette · F1 help
```

- **HOME** — widgets. `e` to edit the layout, `a` to add a widget, `[` `]` to change page.
- **The shell** — your real terminal (zsh/bash) with every ICEBREAKER command added,
  ICEBREAKER's own sandboxed shell (*ibsh*), and the *history* of what your clicks ran.
- **Every click is a command.** Hover anything to see the command it runs; the
  history tab shows it. The mouse teaches you the keyboard.

## 3. Things to try

```bash
journal add "first night on the deck"     # today's journal
note new "ideas"                          # a note
todo add "walk the dog" --due tomorrow    # a task
cal add "dentist" fri 14:30               # an event (in calendar/ in your vault)
music folder ~/Music                      # your music, played by the deck
daily                                     # end-of-day check-in
theme set <Tab>                           # change the look
help                                      # every command · man <cmd> for details
```

`Ctrl+K` opens the palette (commands, notes, themes). `F1` is the full manual.

## 4. Modules

One feature = one module, each with its **command**, its **app** and its **HOME
widget**: TODO, CALENDAR, MUSIC, STATS… `Ctrl+K` → *Modules* lists them, and you
can switch any of them off. More from the community: `plugin search`.

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
voice language ja     # or: Japanese, always (the system's Japanese voice; AI answers get translated)
voice on              # then: voice test
voice read on         # LINK reads its answers aloud
voice robot 80        # more machine (0 = clean, 100 = full robot)
```

No command line needed: the setup and **Settings → VOICE** do the same (download,
language, robot filter, reading LINK's answers). Without the download, the system voice works too (macOS `say`, `espeak-ng` on
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
