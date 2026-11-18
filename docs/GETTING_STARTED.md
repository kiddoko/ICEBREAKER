# Getting started

A ten-minute tour of the deck. Everything here also works with a gamepad.

## 1. The first launch

ICEBREAKER plays its boot sequence (each line is a real start-up step, with its
duration), then asks a few questions: your handle, an optional login, your
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
widget**: TODO, CALENDAR, MUSIC, LINGO… `Ctrl+K` → *Modules* lists them, and you
can switch any of them off. More from the community: `plugin search`.

## 5. Staying offline

Nothing needs the internet. Choose "No AI" (or a local model with Ollama), keep
the calendar local (`cal mode local`), set location to "Nothing", and the deck
never opens a connection. See [PRIVACY.md](PRIVACY.md).

## 6. Where things are

| what | where |
|------|-------|
| notes, journal, calendar | your vault (plain files) |
| modules' own data | `<vault>/.icebreaker/plugin-data/` |
| your themes, plugins, sounds | `<vault>/.icebreaker/` |
| settings, login, Google token | the app config folder (macOS: `~/Library/Application Support/org.icebreaker.deck/`) |

Questions or bugs: open an issue.
