# breakerMED

A tracker for ICEBREAKER that works like **OctaMED** and **ProTracker**: blocks of tracks, one
line a step, each cell a note, an instrument and hex commands; a play sequence makes the song.
It reads **.med** (MMD0–MMD3) and **.mod** files. In ASCII, in your theme's colours, with the
keyboard, the mouse and a gamepad.

> Work in progress. Step 1 (read and play) is here; editing, saving, the sampler come next.
> breakerMED is our own code: it works *like* OctaMED and reads its files, it isn't OctaMED
> (no code, name, look or samples of it). Credits: [docs/CREDITS.md](../../docs/CREDITS.md).

## What it needs

- **`audio`**: it plays its sound through the deck's sampler (`ib.audio`).
- **`vault:read`**: it reads your songs from the vault (`.med`, `.mod`, `mod.xxx`).
- Nothing online, no account, no AI. An ICEBREAKER with `ib.audio` (the release after 0.5.0): on an older one it says so and stays off.

## The page

```
enter      play the song from the cursor        ⇧ enter    play the block, again and again
space      stop                                 ↑ ↓ PgUp PgDn   lines · ← → tracks
the keys   a piano: Z S X D C V… an octave, Q 2 W 3 E… the next (by their place: AZERTY works)
alt ↑ ↓    the piano's octave                   alt ← →    the instrument it plays
mouse      click a cell, the wheel scrolls, a track's name mutes it, a position plays from it
gamepad    the cross moves, A plays / stops
```

## The `med` command

```
med                         what's loaded, where it is
med open [file]             a song of the vault (no file: choose one)
med ls                      the songs in the vault
med demo                    a little song of ours, to try it right away
med play [song|block] [position] [line]
med stop
med pos <position> [line]
med mute <track> · med solo <track>
med paula on|off            stepped like the Amiga (on, the default), or smooth
med effects                 every command, one line each
med info                    the song's settings and instruments
```

## Commands (OctaMED's numbering)

`med effects` lists them: 00 arpeggio · 01/02 slides · 03 slide to note · 04 vibrato · 05/06 ·
07 tremolo · 09 speed · 0A/0D volume slide · 0B jump · 0C volume · 0F tempo and its specials ·
11/12 fine slides · 14 ProTracker vibrato · 15 finetune · 16 loop · 18 cut · 19 offset ·
1A/1B fine volume · 1D next block · 1E repeat line · 1F delay / retrigger · 2E pan.
Not yet: 08 hold/decay as a command, 0E synth jump, 20 reverse, the synth instruments' programs.

## Building

`node modules/breakermed/build.mjs` → `main.js`, one readable file (the STORE reads every line).
Tests: `npx vitest run modules`.
