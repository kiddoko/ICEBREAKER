# Changelog

## Unreleased

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
