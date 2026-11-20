# Making a sound pack

A sound pack gives the deck its voice: the clicks when you move, the blip when
a tab opens, the "tu-dut" of a reminder. This page is everything a sound
designer needs: the sounds to make, the format, the limits, and how to test
and share a pack.

## What a pack is

A folder of audio files, one file per sound, named after the sound:

```
<vault>/.icebreaker/sounds/packs/<your-pack>/
  pack.toml        name, author, licence (see below)
  move.wav
  open.wav
  confirm.wav
  …
```

The folder name is the pack's id (`neon-rain`, `typewriter`…): lowercase,
letters, digits and `-`. Pick it in **Settings → SOUND → sound pack**, or
`sound pack neon-rain`. A pack is chosen **per theme**.

You don't have to make every sound: a sound your pack doesn't have is played
by the deck's built-in synthesizer. Start with the four you hear all the time
(`move`, `open`, `confirm`, `back`), they define the feel.

> Just want to change one sound for yourself? Put the file straight in
> `<vault>/.icebreaker/sounds/` (no pack): it's used with every pack.

## The sounds

| file | when it plays | heard | length |
|---|---|---|---|
| `move` | the cursor moves in a list, the arrows | **constantly** — the most important one | 20–60 ms |
| `tick` | one detent of a ring (MODULES, NEXUS), the menu opening | **constantly**, in fast bursts | 10–40 ms |
| `open` | a tab, an app or a page opens | often | 60–200 ms |
| `confirm` | enter, a choice validated | often | 60–200 ms |
| `back` | esc, closing something | often | 60–200 ms |
| `select` | picking a module, plugging a chip in | sometimes | 80–250 ms |
| `notify` | a neutral message | sometimes | 100–400 ms |
| `success` | something worked | sometimes | 150–500 ms |
| `error` | something failed | rarely | 150–500 ms |
| `alert` | a reminder, a timer, a module calling you — **must be heard from another room** | rarely | 0.5–2 s |
| `unlock` | the login is accepted | once a session | 0.3–1.5 s |
| `denied` | a wrong password | rarely | 0.2–1 s |
| `boot` | the deck starts | once a session | 1–4 s |
| `blip` | text typing itself out (the tour, UPLINK, the shell, notifications, dialogs) — a Game Boy RPG blip | **constantly** while text appears | 15–40 ms |
| `key` | your own keys, when "a click on your keys" is on (off by default) | **constantly** while typing | 10–30 ms |
| `erase` | backspace / delete, with the same switch — lower, sliding down | often while typing | 10–40 ms |

Each sound plays on one channel of the mixer (Settings → SOUND → mixer): **ui**
(move, tick, open, confirm, back, select), **alerts** (notify, success, error,
alert, unlock, denied), **boot**, **text** (blip), **typing** (key, erase).

## The rules

**Format**
- `.wav` (best: no decoding delay), `.ogg` or `.mp3`. If a folder has several
  for the same sound, `.wav` wins, then `.ogg`, then `.mp3`.
- 44.1 or 48 kHz, 16-bit. Mono is enough for everything (stereo works).
- **At most 1 MB per file.** A bigger file is left out (the synthesizer plays instead).

**Length**
- `boot`: 6 s at most · `alert`, `unlock`, `denied`: 3 s at most · `blip`, `key`,
  `erase`: 0.3 s at most · **everything else: 1.5 s at most**. Longer files are left out. Aim much shorter: see the table.

**Feel**
- **Start at once.** No silence at the beginning: trim to the first sample.
  20 ms of silence on `move` makes the whole deck feel slow.
- **End cleanly.** A short fade-out (5–20 ms) so nothing clicks.
- **Gentle on repeat.** `move` and `tick` play dozens of times a minute, sometimes
  ten times a second: short, soft, not tiring. Try holding an arrow key down.
- **Even loudness.** Peaks around −6 dBFS, the frequent sounds quieter than the
  rare ones (`move` well below `alert`). Don't normalise everything to 0 dB.
- **Distinct.** `confirm` and `back` should be told apart without looking (rising
  vs falling works well); `error` should never sound like `success`.
- **`alert` must cut through** music and a noisy room, without being shrill.
- The deck's volume slider and mute act on your sounds too: no need to make them quiet.

## pack.toml

```toml
name = "Neon Rain"
author = "your name or handle"
version = "1.0.0"
description = "Wet synth blips, a rainy city at night"
licence = "CC-BY-4.0"
```

The licence matters: only share sounds you made or have the right to share
(CC0, CC-BY…), and say so here. Sounds taken from games, films or other apps
can't go in a public pack.

## Testing

1. Put the folder in `<vault>/.icebreaker/sounds/packs/`.
2. `sound reload` in the shell (or restart the deck).
3. `sound pack <your-pack>`, then `sound test` plays every sound in turn;
   `sound move`, `sound alert`… play one.
4. Use the deck for ten minutes: browse MODULES fast, hold an arrow down in a long
   list, open and close tabs. If something tires you, it will tire everyone.

A file that's too big, too long or can't be decoded is left out and the deck
says why in the developer console (and the synthesizer plays instead).

## Sharing

Zip the folder (its name as the zip's name) or put it in a public Git repository,
with `pack.toml`, the files and a short README: what it sounds like, the licence.
Packs can then be listed with the community modules ([COMMUNITY.md](COMMUNITY.md)).
