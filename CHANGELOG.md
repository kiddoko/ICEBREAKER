# Changelog

## Unreleased

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
