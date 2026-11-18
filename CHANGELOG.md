# Changelog

## Unreleased

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
