# Changelog

## 0.5.4 — not released yet

- **Modules can play sound** (for a tracker, a drum machine, a game): a new permission
  **`audio`** and `ib.audio` — a sampler the deck mixes on the exact frame (an AudioWorklet:
  `src/core/mixer.ts`). A module loads samples and sends events dated on the audio clock;
  `interp: "none"` gives the Amiga's stepped grit; `decode` reads wav, mp3, m4a…. 64 voices
  and 32 MB per module, silenced when it's switched off. Settings → SOUND → mixer gets a
  **Modules** fader, the status bar shows **♪ the module** while it plays (a click, or the new
  `audio stop`, silences it — and tells the module, `ib.audio.onStop`, so its song stops too).
  A module can also compute its own sound and stream it (`ib.audio.stream()`: one line to an
  audio node of its own, ~30 ms from a key to the sound) — synths, effects, any instrument.
  docs/PLUGINS.md, SANDBOX.md, SECURITY_AUDIT.md (O21).
- **Binary files for modules**: `ib.vault.readBytes / writeBytes` (256 MB — a song's export —, the same permissions
  and walls as notes); natively `vault_write_bytes`. `ib.vault.list(dir)`: a folder's files of
  every kind (`vault:read`). Tested from the sandbox (`tests/sandbox/sbx-audio`, and the escape
  tests try the new doors: closed).
- **Pages that play the keyboard** (`rawKeys`: a piano, a tracker, a game): letters, digits and
  space come as keys with their place (`code`), not as text — a piano works on AZERTY; every alt
  combination is the page's on every system (alt + arrows too), ⌘Z / ⌘⇧Z reach it, esc gives the
  keys back to the deck (the tree takes them). SHORTCUTS page, F1 manual.

## 0.5.3 — 2026-11-21

- **Select and copy text in ibsh**: drag over what a command printed, double-click a word,
  triple-click a line, then ⌘C (Ctrl+C on Windows / Linux). Ctrl+C with nothing selected still
  stops the command. Right-click → Copy / Select all too. ibsh and the real terminal use the same
  selection now (the terminal gets the triple-click).
- **⇧⌫ deletes the whole previous word** in notes and every text field (⌥⌫ on a Mac and Ctrl+⌫
  on Windows / Linux still do), and in ibsh's command line.
- **The tree: ⇧↑ / ⇧↓** walk file by file with the preview tab, like ⇧ + wheel.
- **Settings and the trackpad**: the wheel or a two-finger swipe moves the row you're on (over
  the categories: the category) — it did nothing when the category fit on the screen. Over a
  slider a trackpad steps it 1 at a time, a step every 10 px (a swipe and its momentum used to run
  it far away); a mouse notch is still one step.
- **Suggestion lists show when the field already has text** (Settings → YOU → Date format, a
  model, a city…): ↓ or ▾ opens every choice with the current one picked; typing shows what
  fits. Fixed once in the shared prompt.
- **`say` speaks with the voice and language chosen in Settings → VOICE**, like UPLINK: in your
  real terminal too (it was macOS's own `say`, with the system's voice — `command say` still is);
  a voice chosen for another language is no longer used for this one; in Japanese a text that
  isn't Japanese is translated first by your AI, like UPLINK's answers.
- **TRASH: delete permanently**: a button and `del` on the TRASH page, *✕ empty the trash*, and
  `trash purge <n>` / `trash empty` in ibsh. It asks first and says it can't be undone (no ⌘Z, no
  copy). It is the only way the deck erases anything, only inside .trash (the native side refuses
  anything else), and only yours: a module or your real terminal can't.
- **Effects**:
  - the **RGB split** only splits what's drawn — text, frames, glyphs — never a background (it
    tinted every panel red and blue). It's drawn from a layer of its own: about 3× cheaper
    (8.5 → 2.7 ms a pass in the browser);
  - **bloom** now comes from bright things only (it used to blur the whole screen, backgrounds
    too: a grey haze) and its slider sets how far the halo spreads as well as how strong it is
    (50 % ≈ 3 px, 100 % 5 px, 200 % 8.5 px); its help says what it does in one sentence. No copy
    of the screen is made for a theme without bloom;
  - **CRT flicker speed** (Settings → APPEARANCE → Effects, `fx flicker 150`);
  - **CRT curvature** (`fx curve 0-100`, off by default; heavy 40, party 100): rounded screen
    corners, a darker rim and a soft reflection — a still overlay, no cost per frame.
- **NEWS headlines no longer stay scrambled** ("RK=WD P[1I*U…"): their "decrypt" reveal waited
  for frames that never came when animations are off (frames per second at 0) — now the text shows
  at once then, and the same for every reveal that stays on screen (MODULES, NEXUS, widgets).
- **Frames per second at 0** (no animations): the boot logo and the login page still play (the
  logo froze mid-scramble until a key).
- **WEATHER**: when open-meteo answers without a forecast (an error, the network not up yet at
  start), the widget says so and tries again a minute later — no more "Cannot read properties of
  undefined"; the pop-up's "no forecast yet" is wrapped instead of cut at both ends.
- **TRASH**: the restore button cuts a long path in the middle (its start and the file name kept)
  instead of running off the page; in a narrow window the buttons take short labels (↩, to…,
  open, ✕ delete) so "delete permanently" never falls off the edge.
- **THEME STUDIO**: a colour **palette** (18 hues × 10 shades at the saturation you choose,
  greys, the theme's own colours; arrows, mouse, gamepad; the #hex field still typable), and
  **↺** on every changed knob to put the theme's value back. A click on a value makes that row
  the one you're on (a colour opens the palette); ↑↓ skip the section titles and stop at the ends
  (a click changed the accent while enter still pointed at the theme row).

## 0.5.2 — 2026-11-21

- **`exit` quits ICEBREAKER** (typed in ibsh), like ⌘Q / Alt+F4: open pages save, the vault
  locks, an update waiting to be installed "by itself" installs. `quit` does the same. In a
  script, `exit` only ends the script; in your real terminal, `exit` is still that shell's own.
  Hiding the shell is ctrl+` (it used to be `exit`).
- **One `journal` command**: `journal` opens today's page, `journal "text"` adds a line to it
  without opening it (`date | journal` too); one word that names a day (`journal yesterday`,
  `journal 2026-11-05`) opens that day. `today` is the same command. Ctrl+J still opens the
  journal; THE MENU has *Journal: add a line*.
- **TODO reads your notes**: every open `- [ ]` written in a note shows in the TODO page and
  widget, under your tasks, with the note's name. Ticking it there writes `- [x]` on that very
  line of the note — and refuses if the line changed since; ⌘Z unticks it. In the shell,
  `todo` lists them (`notes/x.md:12`) and `todo done notes/x.md:12` ticks one. Each note is
  read once, then again only when it changes (fast on a big vault, encrypted or not). HABITS
  stays its own list. Modules get `ib.vault.modified()` for the same.
- **`self-destruct` is gone**: the command, its setting (DANGER ZONE) and its native side.
  Nothing in the deck deletes your vault for good; to get rid of one, delete its folder.
- **The real terminal on Windows**: `exit` in PowerShell now ends that tab properly ("process
  exited — press enter to start a new shell"); it used to stay dead.
- **What you type right after a terminal (re)starts** isn't lost any more: it waits for the shell.
- **Quotes**: “typographic” double quotes work like "…" in ibsh; a quote left open says so
  (`a " isn't closed`) instead of doing nothing; `note` says which note it created or opened.
- **Settings on Windows / Linux**: key hints read Ctrl+K, never "⌘K (ctrl+K)". A widget
  pop-up's hint no longer ends cut in the middle of a word.
- **⌘A / Ctrl+A** selects the text of the search fields of Settings, SHORTCUTS, BLOCKS and the
  STORE (what you type next replaces it).
- **`plugin reload`**: a module's page that was open switches to the new code (a sandboxed
  module's tab no longer stays frozen on its last frame until reopened); its widget's pop-up too.
- **Releases**: the installers' signatures (`.sig`) are attached to the release too; the CI's
  actions are pinned to a commit. Docs: issues and Discussions in English or French;
  maintainers by invitation; a patch version when a batch of fixes is tested on Mac and
  Windows, a minor version at the end of each big step (0.6 = the interface overhaul).

## 0.5.1 — 2026-11-21 (fixes from the first tests on Mac and Windows)

- **Sliders move 1 by 1**: dragging follows the pointer to the pixel, holding speeds up
  smoothly (always one step), every wheel notch is one step (Mac mouse, trackpad,
  Windows); sound previews are throttled, not the value.
- **Space in Settings** acts on the row you're on: a box ticks, a choice cycles, a
  slider goes to 0 and back (no 0 in its range: its default and back); it never scrolls the page.
- The **STORE's search bar** is the same as everywhere else. **Chromatic aberration**
  eased in (100 % is the old 40 %).
- **Shell**: ctrl+C (⌘X on a Mac) stops the running command or its question; Tab quotes
  names with spaces; **Ctrl+J opens the journal**; `login` says who you are; new
  **`say <text>`**.
- **The real terminal**: errors from `ib …` come back in red with their exit code;
  PowerShell starts much faster and keeps the deck's output; key hints show ctrl / alt
  on Windows and Linux.
- **`factory-reset` doesn't exist at all in a release** (only in dev-tools builds).
- **Dates**: one reader for every form, English and French (`+1h`, `1h`, `19:00`, `19h30`,
  `demain 9h`, `ven 18h`, `fri 6pm`, `24/12 9:00`, `ce soir`…) for REMINDERS, `todo
  --due` and `cal add`; an empty time means in 1 hour, without an error.
- **⌘Z**: adding in TODO, REMINDERS, HABITS and the calendar can be undone; uninstalling
  a module is one step, undoable only right after.
- **Voice**: silent until the session is ready, then the greeting; notifications are read
  for their content, never "ICEBREAKER".
- **Google Calendar on Windows** connects (the sign-in no longer waits on one call); the
  setup's calendar choice is kept.
- A note sent to the trash closes its tabs and leaves its pins (one ⌘Z brings it all back).
- `remind "test" 19:00` is a reminder called "test": a word is a sub-command only when
  what follows fits it.
- **shift + wheel walks the tree from anywhere** (not only over it; a slider keeps its wheel).
- Small things: NEWS is labelled with the right country when the language has no region
  ("fr" → FR, not US); no "settings save failed" in the console before login; the login
  card's line saying what a step is for wraps instead of being cut.

## 0.5.0 — 2026-11-20 (first public release)

- **Test software, said everywhere**: a big warning at the top of the README and in
  DISCLAIMER.md (store nothing sensitive, back up your vault, no warranty, how to help:
  Issues, Discussions, modules and themes); the same on the **login page**, at **start-up**,
  on a **READ THIS FIRST screen of the setup nobody can skip**, in the Welcome note, START
  HERE, the F1 manual and the site. The docs were checked again against the code (no broken
  link, no command or file named that doesn't exist; what was tested where is said plainly:
  macOS only for the encryption, the sandbox and the security fixes).
- **From a tour of the interface**: the F1 manual is a page to read (no Markdown symbols);
  a page opened from ibsh no longer takes the keyboard away from the shell; `open START
  HERE/README` works without quotes; the start-up shows the real version; hints that were
  too pale or cut are readable; the question a plain vault's newer settings ask answers
  "no" on enter; UPLINK says plainly that Claude Code can't read an encrypted vault.

- **A full security review, and what it fixed** (docs/SECURITY_AUDIT.md #32–52). The sandbox
  had ways round: `ib.modules.call("shell", "run", …)` ran any command as you, pipes and `>`
  in the shell ignored the `vault:read` / `vault:write` permissions, `.ICEBREAKER/` in
  capitals reached the protected files on a Mac or on Windows. Now **what a module has the
  deck do runs as that module** for its whole run (`src/shell/origin.ts`), the refused list
  is "what's allowed" (`src/shell/privileged.ts`), names are compared the way disks read
  them, a module never runs with more permissions than you approved (an update asking for
  more stays off), says who it is when it asks you something, and can't take a built-in
  module's id or another module's commands. **A plain vault can no longer change your
  password or your keys**: from a vault that isn't encrypted, never a password, never the
  settings that hold commands, the rest only after a yes; "open a vault" can't take an
  account over. Claude Code loads only your own settings (no hook from the vault) and can't
  write its own set-up. `voice install` checks each download's SHA-256. `vault export` and
  self-destruct check your password natively. Settings stay in their ranges (a text size
  of 0 no longer leaves a deck nobody can use); new file names can't hold control
  characters; a big note no longer slows every frame. `npm run app:mac:release` builds the
  macOS release without the developer tools. A module's approval is for its code too
  (a fingerprint): changed without you, it stays off. Tested for real in the macOS app:
  both escape modules, a forged plain vault, a planted Claude Code hook, 2 000 notes.
  New tests: `tests/origin.test.ts`,
  `tests/sandbox/sbx-bare/` (a module with no permission at all).

- **Modules from the STORE and the vault run in a sandbox** (a Worker, `src/plugins/sandbox/`):
  no page, no native bridge, no network of their own; every `ib` call is a message checked
  with their permissions; their pages and widgets are drawn in the Worker with the same kit
  and copied by the deck. A module written to escape found every door closed
  (`tests/sandbox/`, docs/SANDBOX.md).
- **One UI kit** (`src/ui/kit.ts`, docs/UI_KIT.md): one text field (`Field`) for every search,
  prompt, password and "add…" line — 16 hand-made ones replaced; one checkbox, one ‹ choice ›,
  one row of tabs, one button (now with `quiet` / `disabled`), the file browser for modules
  too (`ib.ui.pickFolder / pickFile`); word wrapping through `wrapWords` everywhere. A test
  keeps it that way. Modules get it all as `ib.lib.*`.
- **Getting ready to be public**: [DISCLAIMER.md](DISCLAIMER.md) (English and French: a hobby
  project, vibe-coded by someone who isn't a developer, never audited, no warranty), the same
  warning in the README, the setup, START HERE and the F1 manual; SECURITY.md, CONTRIBUTING.md
  (how a change gets in, who decides), CODEOWNERS, templates, docs/CREDITS.md (licenses),
  docs/REVIEWING.md (how to review the project). The STORE says **✓ verified** (reviewed in the
  official STORE, its code there) or **⚠ not verified** — with a warning to accept before
  installing — and `plugin install user/repo` warns too. Updates now come from this
  repository's releases. Fixed (SECURITY_AUDIT #26–31): a module's `main` could write anywhere
  in the vault; text read aloud and a Claude Code model name could pass as options; developer
  tools only in `--features dev-tools` builds; the dev server out of the published CSP; the
  Google agenda cache written `0600` from the start. WEATHER credits Open-Meteo.
- **Updates in the app** (docs/UPDATES.md): Settings → UPDATES and `update` — look every day /
  at start / never, download by itself, install by itself (modules at once, ICEBREAKER when
  you quit) or ask first; `update install`, `update download`, `store update [id | --all]`.
  ICEBREAKER's updates are signed (tauri-plugin-updater, the key in `~/.tauri/`): an
  unsigned one is refused. `scripts/release-update.mjs` signs and writes `latest.json`;
  CI signs Windows / Linux when the secret is there. Stealth mode looks for nothing.
- **Modules can need other modules** (`requires` in plugin.json, src/plugins/deps.ts):
  installed first, switched on first, woken first; switching off / removing one others need
  asks and takes them along; a need not met keeps a module off and says what's missing.
- **The STORE in the shell**: `store info <id>`, `store update`, install / remove / enable ask
  in the shell (with `--window`: in dialogs, what the buttons use); `plugin search` = `store
  search`; `store`, `update` and `config set updates.*` are refused to modules.
- **Settings read better**: small headings inside each category (APPEARANCE: Screen, Motion,
  Text, Performance, Effects, Screensaver and start…) with a line of air above each.
- **The TERMINAL is a module** (`core-packages.ts`): the shell panel, your real terminals,
  `term`, `script` and the terminal tab. Off: no panel at all, commands still run from THE
  MENU / BLOCKS / macros and what they ask comes as dialogs; the shell settings grey out.
- **Every built-in module is in the STORE** (official index, `"builtin": true`): the six
  bundled ones with their source in `modules/<id>/`, the 13 core packages as entries.
  Installing one puts the deck's own copy back (nothing downloaded). `scripts/pack-store.mjs`
  writes those entries; the STORE shows a removed built-in once.
- **From your tests (20 nov.)**: sliders go **1 at a time** (drag the handle, hold on the
  track, the wheel, ←→) and faster the longer you hold; **space** ticks a box / turns a
  ‹ choice › (under the mouse or selected); a setting that depends on another is **greyed**
  (voice, sounds, the AI's provider, Vault key / Recovery key on a plain vault…) instead of a
  sentence; MODULES and NEXUS: **typing searches** at once (no letter shortcuts there: space,
  del, enter, the menu); **one search bar** everywhere (Settings, BLOCKS, SHORTCUTS and the
  STORE now use `FilterBar`); the prompt's ▾ suggestions are the kit's list.
  Vault commands **typed** stay in the shell (y/N there); with `--window` (Settings, THE
  MENU, the setup) everything is a dialog — and the result too: where the plain backup went,
  "Wrong password" in a window. The setup encrypts **during** the setup (the tour waits).
  `vault move` into a folder that holds things puts the vault **inside it** (under its name).
  Fixed: MUSIC → f opened on "~/Music: No such file" (the browser starts at home when the
  folder isn't there); installing a module said "it asks for nothing special" then listed
  its permissions (one dialog now, the module's own list); adding a reminder / habit / event /
  stat from a pop-up closed it. THE MENU gains: open checkboxes, find a file, shell history,
  redo. Performance: `debug perf [s]` measures frames (building, painting, cells, new glyphs,
  stutters); depth tints in MODULES and NEXUS come in 12 steps and the glyph cache keeps
  colours to 5 bits a channel (8 pages): moving scenes stop redrawing letters every frame.
- **Security pass** (docs/SECURITY_AUDIT.md, #14–24): programs in your real terminal no
  longer get the deck's powers through the bridge (an encrypted vault refuses them all, a
  plain one treats them as untrusted, like a module); `secrets.json`, `config.json`,
  `accounts.json` and the key files are written `0600` from the start; dictation's sound and
  text no longer go through `/tmp`; `net_get` refuses non-web schemes and redirects away from
  https; the native file reader only reads text and script files outside system folders;
  `factory-reset` asks the account's password; the password hash costs 64 MiB (old ones are
  redone at the next login); the slow-down after wrong passwords survives a restart; lines
  that look like a key (or start with a space) aren't kept in the shell history; the
  recovery window warns before "copy all".
- **`vault rekey`** (Settings → PRIVACY → Vault key): a new vault key — every file encrypted
  again and checked, a new recovery key; the old key file, password and words open nothing.
  An interrupted rekey leaves the vault as it was.
- **Spacing rules** (docs/LAYOUT.md, `src/ui/layout.ts`): `INSET`, `GAP`, `LABEL`, `SECTION`
  and `Row`, which lays things out and drops what doesn't fit instead of overlapping.
- **Security pass, first round** (docs/SECURITY_AUDIT.md, #1–13): modules can't run scripts in your
  terminal, factory-reset, plant shortcuts / macros / key settings, take the deck's names,
  read the account's files, or write into `.icebreaker/`; the boot error screen is text.
- **Fixed**: HABITS and REMINDERS lists didn't scroll (past the window, items were cut and
  the selection vanished); REMINDERS pop-up: ✓ only selected the row; the shortcuts page put
  Enter into its search; text measured by characters instead of width in 6 places and in
  two word wrappings (emoji, Japanese); the music folder asked for a typed path (now the
  file browser); the store's own word wrapping and list scrolling (now the kit's).
- **Removed** (dead or from before 0.4.0): the CHECKBOXES widget and its pop-up (the
  `checkboxes` command stays), migrations of settings and accounts from before 0.4.0
  (update through 0.4.x first), the text-speed "85 → 50" fix-up that reset a speed you chose,
  unused helpers, `void x;` tricks that hid unused code.

- **Vault encryption** (`docs/ENCRYPTION.md`): `vault encrypt` turns the vault into one
  `.icebreaker-vault/` folder of encrypted files — notes, names, folders, the deck's own
  files — after a plain backup zip next to the vault and a check of every file; `vault
  decrypt` gives plain files back, `vault export <folder>` a plain copy, `vault status`
  says which. Your account's password opens it at login; lock, logout and quit wipe its
  key from memory; a new password re-wraps it. A random vault key wrapped by Argon2id
  (64 MiB) from the password, XChaCha20-Poly1305 per file; writes are whole-or-nothing
  and a crash never loses a note (unknown files come back in `.trash/recovered-…`).
  Claude Code gets no file access to an encrypted vault. Not yet: encryption by
  default for new accounts. Plain writes are now flushed to disk too.
- **The recovery key in a window** from the menus (Settings, THE MENU, the setup): the 24
  words, *copy all* (the clipboard is emptied a minute later), one word typed back to close;
  `vault encrypt --window` / `vault recovery --window` in the shell.
- **Choose folders instead of typing them**: the login page (open a vault, forgot its
  password), *Move vault*, *Vault folder*: the deck's file browser, *choose this folder*, ⏏ drives.
- **`vault move [folder]`** (Settings → VAULT → *Move vault*): the whole vault elsewhere,
  every file copied and checked, then used; the old folder goes only if you say so.
- **Modules can't touch the encryption**: `ib.shell.run` refuses the vault's encryption and
  place, accounts, self-destruct, installing modules; no module can take the names `vault`,
  `account`…; a STORE / vault module can't replace the deck's commands, pages or actions;
  the account's files in the vault are refused to everything but the native side; Claude
  Code can't read `.icebreaker/`.
- **THE MENU**: *Vault: encrypt / decrypt / a new recovery key / encrypted or plain? / a plain
  copy / move it*, *Guided tour*, *UPLINK's context page*, *Mute everything* (they had no
  button before).
- **Fixed**: after `vault mount` typed in the shell, the keys went to HOME instead of the shell;
  a module with `vault:write` could rewrite another module's code in `.icebreaker/plugins/`
  (now `.icebreaker/` is closed to `ib.vault` writes, and to the AI's `write_note`); the login
  page's caret showed through the file browser; *Vault folder* asked for a typed path.
- **Encryption is an option**: the setup asks (plain first), Settings → PRIVACY has *Vault
  encryption* and *Recovery key*; encrypt ↔ decrypt as often as you like.
- **Portable vaults**: the vault carries its account (`.icebreaker/account.json`: uid,
  name, password hash) and its settings (secrets only when encrypted). Login page → *open a
  vault*: a folder (USB key, another computer), the name and password — or *forgot its
  password?* with the 24 words; a new account there is approved like *+ new account*.
  Settings changed on another computer come back at mount.
- **Every system, every version**: names in one Unicode form (NFC) inside an encrypted
  vault; names Windows can't hold are said before decrypt / export writes anything; a vault
  from a newer ICEBREAKER is refused, never repaired; settings keep what a newer version
  wrote and survive a changed kind; `vault adopt` takes in plain files an older version
  wrote next to an encrypted vault. Found while testing: a Mac file name with separate
  accents stopped `vault encrypt` (safely: nothing was deleted) — fixed.
- **Recovery key**: 24 words (BIP39 list, with a checksum) made by `vault encrypt`,
  shown once, one of them asked back (no way around it), then the screen is cleared. Forgot the password:
  login page → *forgot password?* (name + the 24 words + a new password, for the
  account and its vault). `vault recovery` makes a new one (the old one stops working);
  `vault unlock` also takes the words.
- **Full screen**: leaving it no longer leaves the notch band behind (a second
  "ICEBREAKER" over the top bar): the band goes at once and is measured again once
  the window has settled; it has no text any more (the theme's background), and it
  exists only in the deck's own full screen (F11), checked by the window covering
  the top of the screen.
- **‹ value ›**: a click on the left half of the value goes back, the right half
  forward (settings, the clock face in its pop-up: `clock style prev`).
- **Reminders**: no time = in one hour (the command and the "when?" prompt, where
  an empty answer used to add nothing); words the prompt doesn't understand as a
  time make it ask again instead of landing in the title.
- **The caret, smoother**: the glide lasts longer the farther it goes (75–240 ms,
  an ease-out), a jump waits a breath, a faint trail follows it, a key makes it
  flare; letters fade in on a gentler S-curve (220 ms).

- **The tree: one click selects, a double-click opens** (one click still folds a
  folder): F2, Delete / ⌘⌫ and p act on the selected note, the focus stays in the tree.
- **Notes changed outside the deck reload** (the vault watcher's rescan): without
  unsaved edits the note follows the disk; with edits, nothing is written over —
  the toolbar shows *changed on disk* with **Take the disk's** (undoable) / **Keep
  mine**, and a save checks the disk first.
- **The sound comes back** after a long time in the background: the audio context
  (sounds and voice) is resumed on focus / the first click or key, and made anew
  when the system closed or "interrupted" it (WebKit).
- **Text that scrolls when it doesn't fit** works in the world clock, the shortcut
  squares, the tabs, THE MENU's cells and the file browser's path, and in the widget
  chosen with the keyboard (not only under the mouse).
- **Pins at the top of the tree show their colour tag** (icon and square).
- **Full screen covers the whole display on a Mac** (simple full screen, no Space):
  the rows behind a MacBook's notch become a thin band (the name, the time), the deck
  starts under it (`src-tauri/src/screen.rs`).
- **Lists in prompts**: Claude Code / API / Ollama models (Ollama's own list is read
  from it), the journal folder, news topics, cities, time zones, durations, commands
  (`core/suggest.ts`).
- **TODO, REMINDERS, HABITS widgets**: Delete / ⌘⌫ on the line under the mouse,
  right-click → Edit…; in their pop-ups e edits and Delete removes. New commands:
  `remind edit <n> "title" [time]`, `habit edit <n> "name" [--times] [--days]`.
  Widgets get keys while selected (`WidgetSpec.onKey`).
- **A widget to another HOME page**: right-click → Move to page, `[` `]` in edit mode,
  or drag it onto a page number.
- **The notes toolbar** has room: a blank line above and below it, wider margins.
- **The caret glides**: a thin bar that slides from letter to letter and breathes
  (an overlay, no cell repainted); letters fade in a bit slower (160 ms).
- **Emoji are two cells wide** (⏰ ⚡ ✅ 🚀… were squeezed into one); the deck's own
  emoji became text symbols (◷ for reminders, ϟ, ◐, ♪).

- **Docs checked against the code, everywhere** (2026-11-20): the README's features
  grouped by theme without repeats; the shell's LOG tab named everywhere (the old
  errors / history tabs were still mentioned); PRIVACY says what UPLINK sends (its
  context page, the text to translate for the Japanese voice) and that accounts are
  local and don't encrypt notes yet; one list of built-in themes; START HERE fixed
  (the shell's buttons, `theme set`, `theme tweak accent`, menu labels, the shortcut
  square's size); the F1 manual and the welcome note point to the LOG tab and START HERE.

- **The voice follows UPLINK's answer as it's written**: each finished sentence is
  said at once (`voice.stream`), the first piece kept short so it starts right away;
  Japanese full stops (。！？) now cut sentences (a Japanese text went to the
  synthesizer in one block). In Japanese, UPLINK starts its answer with a hidden
  `<say>` line of spoken Japanese, read immediately — no second call to translate
  (the old translation stays as a fallback). Sentences arriving while one plays are played.
- The context page sent to UPLINK is shorter (4000 characters at most).

- **MODULES rebuilt on NEXUS's scene** (the same ring, sky, floor, WheelSpin):
  shards in each module's colour with pins, a cut corner, a status light, facts;
  they power up one after the other; the data panel under the ring.
- **Notes**: a toolbar (save, save as, new, previous / next in the folder, undo,
  redo); a red dot on the tab while unsaved; Save in the tab's right-click menu.
- **UPLINK**: who wrote what (a header line per message, your messages on a tinted
  band); a context page (`.icebreaker/context.md`, `context`) read before every
  conversation — profile, vault folders, recent notes, pins, tags, modules, built
  without AI; how to talk + what it learned, editable. Japanese reading translated
  in small pieces, three at a time (the voice starts at once); a click on the VOICE
  box stops it.
- Settings: Effects preset cycles the presets (‹ ›) instead of opening the fx panel;
  shortcut rows draw every combination as keys, aligned.
- Shortcut squares too low for a real square become a readable chip.
- The store's repository (icebreaker-modules) is public.
- The shell's typewriter counts visible characters only (colour codes no longer slow it).

- **Pins and shortcut squares are one list** (settings.favorites): a pin can be
  a note, folder, module, page, macro or command; it shows in the tree, the pinned
  widget, and on HOME as a square (`link.<pin id>`). Old squares (home.links)
  become pins once. Unpinning removes its squares.
- **One date reader for every module**: `core/dates.ts` (`ib.lib.dates`:
  parseDay, parseTime, ymd…) used by calendar, reminders, todo, habits and the
  journal command — "demain 9h" means the same everywhere.
- MODULES: every card the same size while the ring turns; only the one coming
  to the centre grows.
- `docs/ENCRYPTION.md`: the plan for vault encryption and the module sandbox (not built).

## 0.4.0 — 2026-11-19

- **Accounts**: each one is its own deck (settings, theme, sounds, vault, Google),
  with a mandatory password (Argon2id). The login page is the way in, and the
  only place to create an account (an existing one approves it). The profile
  icon shows only once the name *and* the password are right. ⏻ log out, bigger.
- **THE MENU** (⌘K or shift twice): search everything, or a key + enter.
- **BLOCKS**: everything the deck is made of, browsable; settings rebuilt from one
  registry (`core/prefs.ts`), simpler sheet, notifications as boxes.
- **⌘Z undoes anything**, anywhere: settings, themes, widgets moved or resized,
  trash, renames, new notes and folders (`undo`, `undo list`, `redo`).
- **Guided tour** after the setup (`tour`): UPLINK lights each part of the screen
  and explains it; skipping asks first.
- **UPLINK**: conversations in tabs (ctrl+T, ctrl+[ ], right-click to close).
- **Setup**: the EYE CANDY presets show live on the whole deck, like themes.
- **HOME and the side panel**: one edit mode with a band across both; widgets stay
  where you put them (gaps allowed, nothing rises); the corner ◢ resizes; the
  panel scrolls when taller than the window; status-bar buttons click on their
  whole cell.
- **The same widget several times**, each copy with its own settings.
- **Clocks**: every style has tiny → huge versions (no more fallback clock).
- **News**: categories per widget (science, AI, nature, economy…) and a
  *featured* mode (one story, big, with its summary).
- Effects presets: none · light · medium · heavy · party. Sound 0-100, starts at 50.
- Glide scrolling everywhere; long text scrolls by itself on hover.
- Themes: an automatic contrast check (tests/themes.test.ts); PHOSPHOR's status
  bar and REDLINE's hints are easier to read.
- **Shortcuts on keycaps**: every key written in the interface (⌘⇧P, ctrl+K,
  F2, esc, hint letters) is drawn on a little key (ui/keycaps.ts).
- **Text that types itself out** with a Game Boy RPG blip (the tour, notifications,
  dialogs, the setup, UPLINK's lines): Settings → APPEARANCE → text speed
  (100 = instant). New sounds `blip` and `key` (your keys, off by default) per pack.
- **Sound mixer**: one fader per channel (moving around, notifications, text,
  your keys, start-up) under the main volume.
- **Guided tour**: texts checked against the app; UPLINK big, with an animated
  face (an eye that looks at what it shows, voice bars while it talks).
- **Sliders**: one look and one set of rules everywhere (visible track, a square
  handle drawn centred, the number in its own column); text size, screensaver
  and voice speed are sliders too.
- ⌘Z works with a widget's pop-up open; ⌘⇧Z redoes trash and new notes too;
  a widget moved between HOME and the panel is one undo step (`history.groupAsync`);
  undo messages name the thing ("the HOME layout"), not the setting key.
- Right-click menus: their shortcuts are keycaps too (`Style.key`); usual short
  names (Open, Rename…, Duplicate, Delete…), what a line does in a strip under the
  menu (`MenuItem.tip`); THE MENU / shortcuts / settings no longer repeated in
  every menu.
- The tour's UPLINK is the HOME widget's face (`ui/uplinkcore.ts`, shared), in its
  own card: a voice wave while it talks, an eye on what it shows.
- Typing: the letter coming in fades up, frames as fast as the screen; text speed
  50 by default (was 85: too fast to see), a gentler curve (15-240 characters/s).
- Sounds: a louder blip; `erase` for backspace/delete; the typing click plays on
  key down with an "interactive" audio context (in sync with your finger).
- Dropping on the side panel inserts between widgets (the ones below move down).
- Edit mode ends when you go to another page. Dropping a widget on the side
  panel shows a line where it lands. Shortcut squares are truly square.
- ⌘⌫ is Delete on a Mac. Right-click on a macro → *add to the menu…* shows again.
- **Smooth text everywhere**: letters fade in as they appear (core/renderer.ts
  `fadeMs`; not when many cells appear at once — motion, a new page); the
  typewriter also runs in UPLINK's chat and the shell's output, growing text
  carrying on, never more than 1 s behind (`ui/typewriter.ts` `revealed`).
- **Settings**: short usual names (Zoom, Font size, V-Sync, Reduce motion,
  Chromatic aberration, Mixer…), the details only in the help under the list;
  SHELL gets its own category; *Smooth text* setting.
- MODULES: the cards' descriptions wrap at a fixed width and show once the ring
  stops (re-wrapping text on cards that change size every frame looked choppy).
- One word-wrap (`wrapWords`), one easing (`easeOut`), one `pad2`/`mmss` instead
  of copies in the tour, setup, chat widget, news, popups, clocks, focus.
- Security: modules are audited before install, the vault refuses symlinks that
  lead out of it (docs/SANDBOX.md). README: a warning — not for sensitive
  documents (vault encryption is next).

## 0.3.1 — 2026-11-19

- MODULES and NEXUS glide: the ring moves on a spring (no jump when you spam the
  keys or the wheel) and the cards grow and shrink continuously with depth.
- macOS ProMotion: WebKit's 60 fps cap is lifted — with vertical sync the deck
  follows the screen (120 Hz at full speed, less in Low Power mode).
- One filter bar for MODULES, NEXUS and the file browser: type to search ("/"),
  tick several colours at once. The tree filters several colours too
  (`tag view red blue`, `tag view +red`).
- The tree: the wheel scrolls, shift + wheel walks file by file.
- Settings scroll with the wheel.
- Less of the same thing: one file browser (folder shortcuts and picking a file on
  the computer), one filter bar, one trash page, one shortcuts page.

## 0.3.0 — 2026-11-19

- MODULES and NEXUS share one wheel feel: a trackpad steps every few lines (no
  more racing), the ring glides and slows down little by little; MODULES sits in
  the middle when the shell is hidden. Each step clicks like a notched wheel
  (a `tick` sound per theme pack), choosing plays a `select`.
- MODULES: every module is a shard now — the chips netrunners slot in: gold
  contacts, a chamfered corner, a glowing stripe in its colour (its own accent,
  or the colour you give it: right-click → colour, `modules tag todo cyan`), a
  serial; enter plugs it UP into its socket. A colour filter (squares top right,
  `modules view cyan`). NEXUS follows the tree's colour filter.
- Sound packs per theme: Settings → SOUND → sound pack (this theme), `sound pack`;
  the theme's own shows as "(default)".
- Tree: drag & drop notes and folders onto folders (below the rows = the root);
  drop files from the Finder / Explorer to copy them into the vault (never
  overwrites). The wheel over the tree walks file by file and shows each one at
  once in a preview tab (Settings → VAULT to turn it off).
- TRASH page (⌫ above the tree, `trash open`): what's in .trash, where it lived,
  restore / restore elsewhere / open.
- Settings → ◇ CALENDAR: first day of the week (weeks can start on Sunday), where
  your calendar lives, Google account, sync, your own Google client, default
  calendar; `cal settings`. docs/GOOGLE.md explains connecting on Windows. Module
  settings get an `action` row type.
- Terminal: tabs drawn as chips (your terminals │ the deck's panes), the panel's
  buttons on the right; macros can be hidden (▴, `macro hide`) and bound to keys
  (right-click → shortcut…: press the keys, see conflicts, several actions in a
  row; `bind --pick`, `macro run`).
- Windows PowerShell: the ICEBREAKER prompt no longer shows garbled characters
  (UTF-8 console, script saved with a BOM).
- Login: the account isn't filled in unless "remember me" is ticked.
- Shortcut squares: 1×1 HOME widgets that open anything in one click (module,
  note, folder, page, macro, command): `home link new`, right-click → square on HOME.
- Side panel on the right (◧ in the status bar, `panel`): widgets always in view.
- Profile icon: pixel-art faces and glyphs in your colour (Settings → YOU, `avatar`),
  on the login screen and in `whoami`.
- Gamepad: hold RB for the action wheel (8 slots a page, point a stick, let go);
  a tap on RB still turns the tab. `wheel` opens it with the mouse; right-click →
  add to the wheel.
- Swipes and mouse side buttons switch tabs with an even shorter transition.
- Login: a centred card, labels above the fields; your icon shows only when the
  account is remembered. `logout` logs out of ICEBREAKER (also in the system terminal).
- Settings: ‹ › on every choice (click either side), sliders follow the pointer to
  the pixel (1 % steps), double-click a slider's number to type it (digits only).
- HOME: right-click → edit mode / stop edit mode; a widget with no room on the
  page goes to the next page with room (never off screen). The side panel takes
  HOME widgets dragged onto it in edit mode, and has its own edit controls
  (▲ ▼ ×, drag to reorder or back to HOME); ◧ is the last thing on the status bar.
- Tree: dragged things show a ghost under the pointer; the wheel wraps around.
- New default keys: ⌘⇧B side panel, ⌘⇧U macros, ⌘⇧E NEXUS, ⌘⇧A action wheel,
  ⌘⇧⌫ trash (Ctrl on Windows / Linux).
- Tabs like a browser's: wide when few, narrower as more open, `▾ +N` for the rest; × away from the edge.
- Voice: choose what it says aloud (errors, reminders, timers & focus, events 30 min before, weather changes, the time every half hour, CPU/memory overload, modules) — one `Deck.speak`, `ib.ui.say` for modules.
- PULSE widget (instead of the module launcher): the next event, tasks due, the next reminder, habits left, the music, focus, weather, errors.
- Everything callable: `ib.use("tree" | "terminal" | "shell" | "theme" | "home" | "panel" | "tabs" | "notes" | "sound" | "deck" | any module)`, `deck.use(…)` in the core; new `terminal` permission.
- Side panel: a focusable pane; `a` opens HOME's widget picker and adds at the end.
- Tree: a gap opens where the dragged thing will land. Sliders: smooth while dragging.
  Calendar month: events on tinted strips, two lines when there's room. UPLINK widget:
  an eye that follows the pointer. One-row widgets (shortcut squares) are drawn as flat
  chips instead of vanishing. Login: your icon shows while the account field holds your name.
- Graphics settings: vertical sync on/off (off: an fps slider 0-240, 0 = no animations),
  brightness 50-150 %, reduce animations (slower machines). Animations follow the
  screen's refresh rate (smoother at 120 Hz); backgrounds up to 20 fps; slider handles
  move by eighths of a cell. Smaller tabs before they gather in ▾ +N.
- Shortcut squares are square tiles with their kind on a coloured band; a folder
  square opens a little browser under it (back / forward, new note / folder, trash, NEXUS).
- Keys: the letter says what it does (⌘⇧E explore, ⌘⇧U uplink, ⌘⇧T tree, ⌘⇧P panel,
  ⌘⇧S shell, ⌘⇧K macros, ⌘⇧F effects, ⌘⇧A action wheel); every deck shortcut can be
  changed (SHORTCUTS → F2, Settings → KEYS, `keys set`) and put back to its default,
  one by one or all at once (asks first).
- Settings: ↺ next to every setting you changed, and a button per category to put
  everything back (asks first); `config reset <key>`.
- For developers: docs/ARCHITECTURE.md is a full map of the code now; small cleanups
  (one `ago()`, one `ring()`, the side panel in its own file).

## 0.2.1 — 2026-11-19

- Effects are per theme: each theme keeps the effects you last set on it
  (bloom, scanlines, vignette, RGB split, glow, sharpness, background, glitch, flicker).
- Bloom lowered or off no longer dims the screen: the picture gets that light back.
- Snappier: theme switch, page transitions (fade 100 ms, wipe 120 ms, e-ink 200 ms),
  HOME widgets coming in (220 ms, light stagger) and the NEXUS dive are all shorter.
- Reminders: ✓ on every line of the HOME widget (and right-click), no pop-up needed.
- Two-finger swipes go the right way (fingers to the right = the next tab).

## 0.2.0 — 2026-11-19

- MODULES is a ring of floppy disks, like NEXUS: an endless ring (5 in front),
  each module a disk with its metal shutter, label and status light; ←→ ↑↓ and the
  wheel turn it.
- Smoother: page transitions never go dark any more (fade starts at 40 %, wipe rolls
  a line over the new page, all shorter); sideways swipes don't bounce the page;
  swipes chain while macOS's momentum still runs (no click needed to swipe again).
- Glow is gentle at low levels (proportional); the RGB split bites early (a curve);
  scanlines are softer with a slow roll; names line up in the tree whatever the icon;
  the ICEBREAKER prompt re-asserts itself before every prompt (p10k can't come back).

- Real sliders everywhere (settings, the ✦ fx panel): drag or click on the track
  (1 % steps), the wheel and ←→ step by 5. One setting per effect: 0 = off, up to
  200 % (bloom, scanlines, vignette, RGB split, glow; sharpness 0-100). `fx glow 120`.
- RGB split (colour fringes) is a real chromatic aberration now, much stronger.
- Glow: bright, saturated things (accents, titles, lit buttons, neon) give off
  their own light; plain text stays crisp. Not a global bloom.
- Trash: ⌫ above the tree and `trash` show what's in .trash and put things back
  where they lived (`trash restore 3`).
- Every notification also reaches the system's notification centre when the deck
  isn't in front (Mac, Windows, Linux), following the notifications setting.
- Gestures: the mouse's back / forward buttons and a two-finger sideways swipe
  switch tabs (one per swipe); a pinch or ctrl+wheel zooms the interface.
- NEXUS: the wheel turns the ring anywhere on the page, a dive animation when you
  enter a folder, a quieter background.
- Top bar: when the tabs don't fit they scroll around the one shown (‹ ›); the
  logo and the right side shrink in a narrow window.

- Fixed: your own shortcuts (`bind`), module settings and theme tweaks were lost at
  every restart (settings records were dropped when loading). Now kept.
- The deck reopens as you left it: the tabs (and which one was shown), and the
  tree's open folders.
- Tree: one click opens or folds a folder. Colour tags are small squares at the right
  edge (they used to touch the name); icons always have a space before the name.
- Reminders: ✓ done and ✕ remove on every line (and right-click), and "When?" asks
  again with an example when it doesn't understand the time (it failed silently).
- Music widget: nothing playing still shows the whole widget with its buttons.
- Terminal: selection covers real text only; the ICEBREAKER prompt holds (p10k is
  taken out of the deck's terminals when you use it); `reboot` is the deck's.
- Settings never lose their lines at a big interface scale; FOCUS no longer crashes
  in a tiny window; `launch note` without a file opens a new note.
- CI builds on demand or for release tags, not on every push (Actions minutes).

- Error system: every error gets a code (E101 vault … E901 unexpected) with what to
  do. The shell panel grows an "errors" tab that blinks red with an error sound
  while some are unread; `errors`, `errors E102`, `errors codes`, `errors clear`.
  Uncaught errors and crashing widgets land there too. docs/ERRORS.md explains
  every code (the tab links straight to it).

- A screensaver per theme: terminal (an 80s mainframe typing its log, a framed
  clock) for phosphor, amber and graphite; sonar (range rings, a sweep, echoes)
  for abyss; warp (stars rushing past) for ghost and nightshade; the neon city
  for neon-district, neon-ronin and redline; the paper sleep screen for e-ink.

- NEXUS shows 5 lockers of the ring once there are 5 things or more, 3 for 3-4, 1 below.
- NEXUS is an endless ring: past the last thing comes the first, the disc keeps
  turning the same way (no jump back); a few things spread round the whole disc.

- e-ink: matte old-cream paper, darker ink (never pure black), more contrast;
  colour tags written as words (greys can't show colours); its own screensaver,
  an e-reader sleep screen (an engraved moon and hills, the time, redrawn once a
  minute). Themes pick their screensaver with `[anim] screensaver = "city" | "paper"`.
- New theme e-ink-night: e-ink's dark mode with its own greys (cream ink on
  charcoal), not just e-ink inverted.
- HOME drag & drop: the widget follows the mouse as a ghost, the spot it would
  land on shows dashed ("no room here" otherwise), and it moves only when you let
  go (no more hopping around while you drag). Hits can have `onUp`.
- HOME edit mode can't be missed: a pulsing band across the top with the keys and
  a ✓ done button. FOCUS has a compact 2×2 look.
- SHORTCUTS (⌘/) is a cheat sheet in columns (2-4 depending on the width), still
  searchable; Settings → KEYS opens it.
- Input boxes can suggest: a ▾ list (↓ or a click), the rest of the best match in
  grey, Tab completes it. Used for the date language, the weather city, custom
  pronouns, custom icons; modules get it with `ib.ui.prompt(title, { suggestions })`.
- Add a widget: grouped by module, each group folds (→ ←, enter, a click); a
  search still shows every match. START HERE is written with your keyboard's
  keys (Ctrl+, Shift+, Alt+ on Windows and Linux; ⌘ ⇧ ⌥ on a Mac).
- WEATHER: your own city is the first saved place from the start. HABITS: tick
  from the HOME widget (click; right-click unticks). The Welcome note opens
  right after the setup.
- HOME rows stretch to fill the page (each theme's font size used to leave it
  half empty or overflowing); a widget too small to draw anything shows its name.
- Windows: PowerShell no longer stays blank (the terminal now answers ConPTY's
  start-up cursor query); the boot sound plays without a click first (WebView2
  autoplay); Japanese voice: a clear message when Windows has no Japanese voice.

- Tabs: ⇧Esc (or ⌘W) closes a tab and shows the one before it; a stray Esc never
  closes one any more. 1…9 switch tabs when you're not typing. NEXUS, STORE,
  MODULES and settings open without a tab (their button lights up; Esc closes them).
- Settings: percentages step by 5 % and stop at the ends (sharpness no longer runs
  backwards); custom pronouns; the effect presets moved from SOUND to APPEARANCE;
  DANGER ZONE alone at the very bottom; a blinking caret in the search field.
- Defaults: robot voice 100 %, voice volume 50 %, speed ×1.1, sharpness 80 % with a
  gentler curve.
- `mute` and a ♪ button bottom-right silence everything (ui sounds, voice, alerts);
  ☾ starts the screensaver (`screensaver`).
- System terminal: drag to select text, double-click selects a word, ⌘C (Ctrl+C
  when something is selected, Ctrl+Shift+C) copies; right-click → copy / select all.
  A maximized shell has a ⤓ dock button.
- zsh + powerlevel10k: instant prompt off in the deck's terminals (the prompt_cr errors).
- macOS speed: the colour fringes measure their own cost and refresh less often when
  the webview is slow at them (they made tab switches and the login animation lag).
- e-ink is grey again (a filter on single layers let the glow's colour through).
- Shift+Tab always moves to the next part of the screen (it opened the shell's
  completion); the wheel walks the MODULES hive; HOME no longer scrolls by one row
  when nothing overflows; NEXUS stays centred on a tall page; scripts show their
  full file name; choice lists never cut the label for its hint; the colour dots
  have a row of their own above the tree.

- Right-click everywhere: a menu for the thing under the mouse — tree entries
  (open, new note/folder here, rename, duplicate, pin, copy path / [[link]],
  colour, icon, trash), tabs (close, close the others / the ones on the right,
  show in the tree), terminal tabs (rename, restart, close), the shell (paste,
  clear, new terminal, maximize, hide), the note editor (copy, cut, paste,
  select all, undo, redo, follow the link, save), HOME widgets (pop-up, module,
  move, remove), MODULES cards (launch, switch on/off, pin, remove). Keyboard:
  the menu key or shift+F10; sub-menus open on the right. Paste reads the
  clipboard natively (no permission bubble).
- Colour tags like Ableton (red, orange, yellow, green, cyan, blue, purple,
  pink) on files and folders, on the icon only; dots above the tree show one
  colour at a time. `tag <path> <colour>`, `tag ls <colour>`, `tag view <colour>`.
- Custom icons per file or folder (`icon <path> ★`). Tags and icons are in the
  vault (.icebreaker/tags.json, icons.json) and follow renames.
- Tree: F2 renames, Delete moves to the trash (after asking).

- File tree: an icon per file type (∿ Python, ʝ JS/TS, ❯ scripts, λ code, ⚙ config,
  ▣ images, ♪ audio, ▶ video, ▤ PDF, ▥ tables…).
- MODULES hive: card descriptions wrap instead of being cut.
- The docs folders: START HERE/ and FOR DEVELOPERS/ side by side at the vault root.
- Screensaver: a night city in ASCII — towers with flickering windows, neon
  signs, rain, a searchlight, a drone, the time in big digits, a ticker.
- Voice subtitles: while the voice speaks, its words type into a small sci-fi
  box bottom-right (Settings → voice → subtitles).
- The neural voice gets plain text (no dashes, fancy quotes or symbols) and,
  if it still fails, the system voice takes over quietly (no toast).
- Sharpness works on every webview (a soft halo where canvas blur is missing).
- Settings: two big groups, GENERAL and MODULES; the effects are part of
  APPEARANCE; the natural-voice row says "installed ✓" or downloads with the
  progress in the shell.
- ⤢ maximize: the shell becomes a big tab after the others (the page you were
  on stays a tab) and the panel folds away; `term dock` puts it back.
- zsh with powerlevel10k: no more "prompt_cr must be unset" error (p10k finalize, and
  prompt_cr kept off right before p10k's own prompt hook — a resize at start
  made p10k draw a second prompt while its instant prompt was still on).
- START HERE: the docs as notes in your vault — a README with the tour, one
  note per part (modules, ui, shell, keys, privacy) and `for developers/`
  (themes, the module API, tweaking). Written into every new vault; `starthere`
  adds them to an existing one.
- Terminals get ICEBREAKER's own prompt (◆ ~/path ❯, the same for everyone,
  zsh / bash / fish / PowerShell); Settings → terminal prompt → mine keeps
  your own theme (oh-my-zsh, starship, oh-my-posh…).
- Scripts: import from anywhere on the computer with the deck's own file
  browser (≡ scripts → import, or `script import "<path>" [folder]`), into
  subfolders of scripts/. Any language: .ibsh runs in the deck; .sh .py .js
  .ps1 .zsh .fish .rb… run in your terminal with their interpreter.
- Settings: every setting has a real description (under the list, for the
  row you're on or under the mouse); a section per module after the normal
  ones (WEATHER, NEWS, FOCUS, CLOCKS, and modules' own via `ib.settings`,
  `modules set <id> <key> <value>`); KEYS lists the shortcuts directly; no
  ◂ ▸ on rows that are actions; pronouns; a clearer natural-voice row.
- Softness is now SHARPNESS (100 = sharp, `fx sharpness 60`) and much more
  visible. The setup's Full CRT preset puts the colour fringes at max.
- The clock face is chosen from the clock widget (f in its pop-up), not Settings.
- One calendar widget in the picker (the duplicate is gone); an even, centred
  month grid.
- Terminals are named icbrkr_trm, icbrkr_trm2…; rename with a right-click on
  the tab or `term rename <name>`. A ▴/▾ shell button in the status bar brings
  the folded shell back.
- Fix: long hints no longer spill out of the command palette.
- FOCUS app: a big ring that empties with the minutes, what you're on
  (`focus task …`), presets 25/5 · 50/10 · 90/20, today's sessions, and zen
  (z: the tree and the shell fold away). The pomodoro now rings even when its
  widget isn't on screen.
- CLOCKS app: the time in your clock face, several named timers at once
  (`timer 4m tea`, `timer stop 2`), a stopwatch with laps (`stopwatch lap`),
  the world with day/night. Timers ring through notifications.
- WEATHER app: any place (s to search, saved places with ←→), the sky as an
  ASCII animation (sun rays, drifting clouds, rain, snow, storm flashes, fog,
  a moon at night), the next 24 h as a curve with the rain chances, the week.
  `weather Tokyo`, `weather open`, `weather save Lausanne`.
- NEWS interests: categories (tech, AI, science, space, politics, world,
  business, people, culture, art, music, cinema, gaming, sports, health,
  environment, security) and your own words, woven in with your area's news,
  each headline tagged. `news add tech`, `news add "formula 1"`, or i in the
  news pop-up.
- Pinned: notes, folders and modules at the top of the file tree, in a
  "pinned" HOME widget, and on a key if you want (`pin notes/ideas.md`,
  `pin projects`, `pin todo --key ctrl+shift+t`; p in the tree or the hive).
- Shell: several system terminals as tabs (+ adds one, × closes it, `term new`,
  `term 2`), a terminal in a main-window tab (`term open`), ▾ to fold the
  panel away (`term hide`, ctrl+` brings it back).
- Scripts: shell lines kept in the vault (.icebreaker/scripts/*.ibsh) and run in
  one go from the ≡ scripts menu, the palette or `script <name>`; {blanks} are
  asked; four examples (morning, end-of-day, inbox-sweep, quick-note).
- `mv a.md b.md folder/` moves several notes at once.
- Settings redesigned: categories on the left, their settings on the right,
  a search over every setting (just type), and under the list the shell
  command that does the same (`config set …`). New: KEYS, MODULES, DANGER ZONE,
  clock face, energy. The top bar's buttons shrink to icons in a narrow window.
- UPLINK chatbox widget: a running conversation with your AI right on HOME;
  enter opens it bigger to type, ctrl+l starts a new one, ctrl+s reads the
  answer aloud. (`home add chat`)
- TODO: recurring tasks — every day, several times a day (`--times 3`),
  every other day, chosen weekdays (`--every mon,wed,sat`), every (other)
  week, every month; for 10 / 100 times, a year, or forever (`--cycles`).
  Done → it comes back on its next date. `todo repeat <n> …`, or r in the app.
- HABITS module (takes CHECKBOXES' place): daily boxes that reset every day,
  several times a day (●●○○), chosen weekdays, streaks ▲, a 2-week strip, a
  widget and its pop-up, the numbers in STATS. `habit add "read" --days mon,wed`.
  `checkboxes` stays as a shell command.
- Modules talk to each other: `ib.modules.expose / call / has / list` — every
  built-in module publishes functions (todo.add, journal.append, calendar.events,
  uplink.ask, sysmon.stats…) that downloaded modules can call, permissions
  checked. Shell: `modules api`, `modules call todo add "walk the dog"`.
- STATS gets the modules' numbers: tasks open / added / done, reminders
  pending / rung, events this week, tracks played, focus sessions and minutes,
  timers, journal pages, messages to the AI. A setup page (s in STATS, or
  `stats setup`) lists each module with its stats to show or hide;
  `stats hide|unhide <id|module>`.
- `self-destruct`: deletes the whole vault for good, behind a dialog, the
  folder's name, DESTROY in capitals, your password (if the deck has a login)
  and a 10-second countdown that ctrl+c stops. Copies elsewhere aren't touched.
- New app icon: "IB" in ASCII block letters on black glass, with a glow and
  scanlines (scripts/make-icon.swift draws it).
- CRT: colour fringes (chromatic aberration, `fx chroma 30`) and softness
  (glyphs a touch out of focus, `fx softness 40`) — in the FX panel and
  Settings too. Softness is baked into the glyph cache: free at run time.
- Clock widget faces: dots, segment, analog (a braille dial with hands),
  binary, minimal — and the seconds if you want them (`clock style analog`,
  `clock seconds on`, or f / s in its pop-up).
- File tree: [+ note] and [+ dir] buttons (in the selected folder), tree
  guides ├─ └─ │, item counts, a marker on the open note; dot-files hidden.
- SHORTCUTS page (`ctrl+/`, or `shortcuts`): every shortcut by category,
  with a search field. Your own shortcuts: `bind ctrl+shift+1 "open notes/x.md"`
  (or F2 on the page), `unbind`. New: `ctrl+shift+h` HOME, `ctrl+shift+m`
  MODULES, `ctrl+shift+n` new folder, `ctrl+shift+l` lock.
- Tab = the next thing on the screen (widget, card, line); Shift+Tab = the
  next part of the screen (tree → deck → shell).
- Energy: no frames at all while the window is hidden or minimized; 12 fps
  animations in the background or after 90 s idle; the bloom is blurred in a
  small canvas instead of a full-window filter; a leaner glyph cache.
- HOME: widgets sit at the top and close the holes (same in and out of edit
  mode); the calendar widget fills its box.
- MODULES hive: loops forward (after the last row, the first one again), more
  depth, a lighter floor. Widget-only modules (voice, checkboxes, moon,
  matrix, quotes) leave the hive. Slower scan sweeps.
- Tab titles in lowercase. LINGO removed (it'll come back, rebuilt).
- Notifications: sound and on screen, sound only, on screen only, or nothing
  — a new setup step, and Settings → sound → notifications.
- STATS module: numbers over time from modules and from you — `stats`,
  graphs (7 / 30 / 90 / 365 days), a widget with sparklines, pins. Modules
  record theirs with `ib.stats` (permission `stats:read` to read others').

- REMINDERS module: local reminders, a system notification 15 min before and
  on time (macOS, Windows, Linux), with a retro "tu-dut"; `remind`.
- Notifications for modules: `ib.ui.alert(title, body)` — system
  notification, alert sound, toast, and the voice when it's on.
- No AI while the UPLINK module is off. Effect levels in Settings; softer
  vignette, stronger scanlines with a CRT rim. Setup previews themes live.
- Lists and the MODULES hive wrap around at the ends.

- Everything is a module: NEXUS, UPLINK, JOURNAL, SYSMON, THEME STUDIO, VOICE,
  NEWS, WEATHER, CLOCKS, FOCUS, CHECKBOXES, MOON, MATRIX, QUOTES join the
  bundled CALENDAR, MUSIC, TODO, LINGO — switch off, remove, reinstall.
- MODULES is a pseudo-3D hive of every module.
- Windows: PowerShell 7 or Windows PowerShell in the shell panel with your
  profile (oh-my-posh…) and ICEBREAKER's commands; the system media controls
  for the music widget. fish gets the bridge too. Linux CI builds with ALSA.
- Pop-ups block clicks behind them; a failing neural voice falls back.

- STORE: modules and themes from GitHub and your own sources (https, or http
  on your local network); install, enable, update, remove; `store`.
- NEXUS: new note / folder, search the vault, rename, trash, sort, actions menu.
- Top bar: nexus, store and modules buttons.
- Voice: female neural voices (Jenny, Amy, Siwis), Japanese (system voice,
  AI answers translated), the accent follows the text, a gentler robot filter.
- Music pop-up redesigned: spectrum, progress knob, controls, volume, up next.
- Smoother: animations ride the display's vsync; lists glide and scroll softly.

- English or French: setup asks the deck's language and the voice's; Settings too.
- The AI is your UPLINK (no more "neural link"); its widget shows idle,
  processing, speaking and offline, and its pop-up takes a quick question.
- Every widget has a pop-up: clock (timer, stopwatch), system, modules,
  matrix, checkboxes, uplink, calendar. New commands timer, stopwatch, matrix.
- CALENDAR widgets month and this week, linked to the module.
- Neural voices now run on sherpa-onnx (piper's macOS builds were broken).
- e-ink: dim cream paper, paper texture, everything monochrome.

- Voice: local text-to-speech (piper or the system voice) through a robot
  filter; greets you, can read LINK's answers. `voice`.
- Stealth mode: 100 % local, no internet; AI only through a local model. `stealth`.
- Setup: connected or stealth, optional gender, vault location (network drive),
  voice, theme.
- Themes e-ink, neon-district, abyss; new theme keys `[anim] page`, `[anim] type`,
  `[fx] flicker`, `[meta] widget_frame`; backgrounds grain, circuit, sonar;
  sound packs paper, neon, sonar.
- Widget pop-ups (enter / double-click / pad A) with a button to their module;
  `widget <id> [open | do]`, `focus`, `moon`, `worldclock`, `quote`.
- Calendar: a real grid, a settings page (show/hide calendars, default, mode),
  events in date order.

- CALENDAR module: `cal` command, app, "upcoming" HOME widget; a local calendar
  stored as Markdown in the vault (`calendar/YYYY-MM.md`), and optional Google
  Calendar (choose the calendar for each new event).
- MUSIC plays a local folder (mp3, m4a, flac, wav, ogg, aiff): a text-only
  library app with queue, shuffle and repeat. No cover art, ever.
- Live boot sequence: each line is a real start-up step with its duration.
- Module commands win over same-named system programs in your terminal (`cal`).
- Smoother scrolling (trackpads), centred HOME, lower macro bar.
- Setup asks how you want your calendar: vault only, Google, or later.

## 0.1.0

- First version: vault, journal, notes, HOME widgets, shell (system terminal +
  ibsh), LINK (AI), themes, NEXUS, TODO and MUSIC modules, login.
