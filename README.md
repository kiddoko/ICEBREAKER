```
██╗ ██████╗███████╗██████╗ ██████╗ ███████╗ █████╗ ██╗  ██╗███████╗██████╗
██║██╔════╝██╔════╝██╔══██╗██╔══██╗██╔════╝██╔══██╗██║ ██╔╝██╔════╝██╔══██╗
██║██║     █████╗  ██████╔╝██████╔╝█████╗  ███████║█████╔╝ █████╗  ██████╔╝
██║██║     ██╔══╝  ██╔══██╗██╔══██╗██╔══╝  ██╔══██║██╔═██╗ ██╔══╝  ██╔══██╗
██║╚██████╗███████╗██████╔╝██║  ██║███████╗██║  ██║██║  ██╗███████╗██║  ██║
╚═╝ ╚═════╝╚══════╝╚═════╝ ╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝
```

**An open-source cyberdeck for your notes, your journal and your AI.**
A standalone desktop app (Windows · macOS · Linux) that looks and feels like a
terminal from the future — pure character-cell UI, ASCII art, glow and
scanlines — but works with the keyboard, the mouse, or a gamepad.

- **Notes** — plain Markdown, Obsidian-compatible vault (`[[wikilinks]]`, `#tags`, frontmatter). Point it at your existing vault.
- **Journal** — one file per day, calendar, streaks, `journal add "…"` from the shell.
- **Everything callable** — any module, and the deck's own parts (tree, terminal, shell, theme, HOME, side panel, tabs, notes), are objects a module calls in one line: `ib.use("tree").reveal("notes/a.md")`, `ib.use("theme").colors()`. `modules api` lists every function.
- **Everything is a module** — only the frame is fixed (HOME, notes and their editor, the tree, the shell, settings). NEXUS, UPLINK, the journal, calendar, music, clocks, news, weather… are modules you can switch off, remove and reinstall from the STORE, like the ones made by the community. MODULES shows them all as a turning ring of shards — the chips netrunners slot in (give each a colour, show one colour at a time; enter plugs it into its socket).
- **Your real terminal, upgraded** — the shell panel runs your own zsh / bash / fish, or PowerShell on Windows (your profile, oh-my-posh and all), (ssh, git, vim, htop…) in the vault folder, with every ICEBREAKER command added (`todo add …`, `journal`, `theme set …`; `ib <cmd>` when a name clashes). Your ~/.zshrc is loaded, never modified. Prefer a vault-only sandbox? `term mode ibsh`. Clicks log their commands in a separate **history** tab.
- **A real-ish shell** — pipes, redirections, globs, history, fish-style suggestions, 70+ commands working on your vault. `cat note.md | ask "summarize"` works.
- **LINK** — chat with Claude, which can search, read and write your notes ("make me a note with a shopping list for a spinach pie"). With Claude Code it writes inside the vault only, never elsewhere (`config set ai.allowWrites false` to keep it read-only); with an API key it asks before each write. Or use a local open-source model through [Ollama](https://ollama.com).
- **Plugins** — small JS modules with a documented API and declared permissions; the bundled modules (TODO, CALENDAR, STATS…) use the very same API.
- **Themes** — TOML files, hot-swappable: colors, font, border style and symbols. Default: `nightshade` (violet, Catppuccin-flavoured). Also `amber`, `neon-ronin`, `phosphor`, `ghost`, `redline`, `graphite`.
- **Modules** — one feature, one module, each with its own command, app and HOME widget. So far: **TODO** (`todo add "walk the dog" --urgent --due tomorrow +home`, or the app, or the widget), **CALENDAR** (a local calendar plus your Google calendars: `cal add "dentist" fri 14:30 --cal work`, the app, and an "upcoming" widget that shows more as it grows; Google setup in `man cal`), **STATS** (numbers over time — what your modules record, like a budget left or the commands you ran, and your own: `stats set weight 72.4 --unit kg`, `stats add pushups 20`; a graph per stat, a widget, and `ib.stats` for module makers), **HABITS** (boxes that reset every day, with streaks: `habit add "drink water" --times 8`, `habit check water`), **REMINDERS** (`remind "call mom" fri 18:00`) and **MUSIC** (your own music folder played by the deck, a text-only mini iTunes with no cover art: `music play daft punk`; plus what's playing in Spotify / Music on macOS or any player on Linux).
- **NEXUS** — walk your vault in pseudo-3D: files ride an endless ring above a synthwave floor grid (5 in front; the wheel turns it; a dive when you enter a folder) — `explore`, or ⬡ in the top bar.
- **Daily log** — `daily` asks a short end-of-day check-in in the shell (quick answers 1-5) and writes it to your journal; `daily trend` charts it.
- **Login** — optional account that locks the deck at start-up. The password is hashed with Argon2id and never stored. It locks the app, it does not encrypt your notes (they stay readable Markdown files). Forgot it? Quit, delete `account.json` in the config folder (macOS: `~/Library/Application Support/org.icebreaker.deck/`), restart.
- **English or French** — the whole interface and the voice, chosen at setup (Settings → language).
- **Voice** — the deck can talk: local, open-source neural female voices (Jenny in English, Siwis in French, on sherpa-onnx), or Japanese — whatever the UI language — for the full cyberpunk effect, through a robot filter — clearly a machine, not choppy. It greets you at start-up, and you choose what else it says aloud (Settings → VOICE → say aloud): errors, reminders, timers, your next event 30 min before, weather changes, the time every half hour, CPU / memory overload, the AI's answers, what modules announce. `voice install`, `voice on`. Nothing leaves your computer.
- **Stealth mode** — `stealth on`: 100 % local. No internet at all; AI only through a local model (Ollama on this machine or a box at home); your vault can live on your own server.
- **Themes** — 11 built-in looks, each with its own colors, font, background animation, sounds, widget frames and motion: from **e-ink** (matte paper, black and greys, pages that refresh like an e-reader) to **neon-district** (synthwave, circuit traces) and **abyss** (bioluminescent sonar). Make your own in a `.toml` file or the theme studio.
- **STORE** — modules and themes from the community index on GitHub, or from your own server / NAS: browse, install, enable, update, remove (top bar → ⇣ store, or `store`).
- **Modules with their own app** — WEATHER (any place, the sky as an ASCII animation, the next 24 h, the week: `weather Tokyo`), CLOCKS (several named timers, a stopwatch with laps, the world: `timer 4m tea`), FOCUS (a pomodoro ring, what you're on, zen mode: `focus open`), NEWS with your interests (`news add tech`).
- **Modules talk to each other** — `ib.modules`: every module can expose functions and call the others' (`modules api` lists them, `modules call todo add "walk the dog"` calls one).
- **Keys** — `ctrl+/` (⌘/ on a Mac) shows every shortcut, searchable; the letter says what it does (H home, E explore, T tree, P panel, S shell…); change any of them (F2 there, or `keys set`) and put defaults back one by one or all; `bind` your own; `pin` notes, folders and modules to the top of the tree, a HOME widget or a key. Tab moves between the things on a screen, Shift+Tab between the parts of the screen.
- **Docs in your vault** — START HERE/ (the tour, modules, interface, shell, keys, the AI as a work assistant, privacy) and FOR DEVELOPERS/ (themes, the module API, tweaking), written into every new vault; `starthere` adds them to yours.
- **Shell** — your real terminal(s) in tabs, one in the main window too (`term open`), saved scripts one click away (≡ scripts).
- **Widgets that open up** — enter, double-click or the pad's A on a HOME widget opens its pop-up (add a city to the world clock, quick-add a task, the week's weather, the next moon phases…) with a button to its full module.
- **Sounds** — UI blips synthesized on the fly, in 7 packs (retro, crystal, soft, industrial, paper, neon, sonar): each theme has its own, and you can pick another per theme (Settings → SOUND, `sound pack`). MODULES and NEXUS click like a notched wheel at each step. Drop your own `move.wav`, `open.wav`, `confirm.wav`, `back.wav`, `success.wav`, `error.wav`, `notify.wav`, `boot.wav`, `unlock.wav`, `denied.wav`, `alert.wav`, `tick.wav`, `select.wav` (or .ogg / .mp3) in `.icebreaker/sounds/` to replace them.
- **Right-click everywhere** — a menu for the thing under the mouse (notes, folders, tabs, widgets, modules, the shell, the editor); the menu key or Shift+F10 on the keyboard.
- **Colour tags and icons** — Ableton-style colours (small squares on the right of the tree, written out in grey themes) and a custom icon per file or folder; a click on a colour shows only that colour (`tag`, `icon`).
- **Smooth, light, for every machine** — vertical sync (one frame per screen refresh, 120 Hz ProMotion included; the rings glide on a spring) or your own cap from 0 to 240 fps (0 = no animations), a brightness slider, and *reduce animations* for slower machines. The deck draws nothing when nothing moves.
- **PULSE** — one widget for what's happening everywhere: the next event, tasks due, the next reminder, habits left, the music, the focus timer, the weather, new errors; a click opens the module.
- **Tabs like a browser** — wide when few, narrower as you open more; past the limit, `▾ +N` lists the rest.
- **Side panel** — ◧ in the status bar: widgets that stay in view on every page, on the right (`panel add clock`).
- **Profile icon** — a pixel-art face or a glyph in your colour (`avatar`), on the login screen and in `whoami`.
- **Shortcut squares** — square HOME tiles that open anything in one click, their kind written on them (module, folder, file, page, macro, command). A folder square opens a little browser right under it: go in and out (‹ ›), make a note or a folder, trash something. `home link new`, or right-click → square on HOME.
- **Browse with the wheel** — shift + wheel over the tree walks file by file and shows each one at once (a preview tab the next file replaces); the plain wheel scrolls.
- **Find things fast** — MODULES, NEXUS and the file browser share one bar: type to search, tick several colours at once; the tree filters several colours too.
- **Drag & drop in the tree** — move notes and folders by dragging them onto a folder; drop files from the Finder / Explorer to copy them into the vault (never overwrites).
- **Trash you can browse** — ⌫ above the tree or `trash open`: a TRASH page with what's in `.trash` and where each thing lived; put things back in one key. Nothing is ever hard-deleted from inside the deck.
- **Errors with codes** — an errors tab in the shell blinks red when something goes wrong, with a code (E102…) and what to do; [docs/ERRORS.md](docs/ERRORS.md) explains each one.
- **Effects** — one real slider per effect, 0 = off up to 200 %: bloom, scanlines, vignette, RGB split, glow (bright things give off light), sharpness. Each theme has its own screensaver (a neon city, an 80s mainframe, sonar, warp, an e-reader's sleep screen).
- **Gestures** — mouse back / forward and a two-finger sideways swipe switch tabs; pinch zooms the interface.
- **Picks up where you left** — the tabs, the open folders of the tree, the page you were on come back at the next start. Notifications reach your system's notification centre when the deck isn't in front.
- **Light** — renders only what changed, sleeps when idle, effects throttle themselves on slow webviews, `fx potato` for old laptops. ~10 MB binary.

## Yours, offline, anonymous — if you want

ICEBREAKER offers tools; it never requires them. You can keep **everything in
your vault** — notes, journal, calendar, tasks, music library — stay **offline**,
use **no account** and **no AI**, and the deck works the same.

- Your data is plain files on your disk (Markdown, TOML, JSON). Open them with anything; sync them with anything — or don't.
- Nothing phones home. There is no ICEBREAKER server and no telemetry.
- Network traffic only goes where *you* point it, when you use it: the AI provider you choose (or a local model with Ollama), the weather widget (open-meteo.com, no account), news feeds, Google Calendar if you connect it, and GitHub when you install a module or theme.
- Google data, if you connect it, is never written into your vault (so no AI or sync tool sees it), and `cal google disconnect` removes it. See the [privacy policy](docs/PRIVACY.md).

## Install

Download the latest build for your system from the **Releases** page (or from the
latest successful **Actions → build** run): `.zip` for macOS, `.exe` installer
for Windows, `.AppImage` / `.deb` for Linux. Builds run for release tags and on
demand (`gh workflow run build.yml`), not on every push.

- **macOS**: the app isn't notarized yet. The first time, right-click it → *Open*
  (or run `xattr -dr com.apple.quarantine ICEBREAKER.app`).
- **Windows**: SmartScreen may warn about an unknown publisher → *More info* → *Run anyway*.

Then follow the first-run setup — every question can be skipped. New to the deck?
Read **[Getting started](docs/GETTING_STARTED.md)**.

## Build from source

Requirements: [Node.js](https://nodejs.org) 20+, [Rust](https://rustup.rs), and the [Tauri prerequisites](https://tauri.app/start/prerequisites/) for your OS (WebView2 on Windows is already there; on Linux `webkit2gtk-4.1`).

```bash
npm install
npm run app          # desktop app, dev mode (hot reload)
npm run app:build    # release build + installers in src-tauri/target/release/bundle
npm run dev          # UI only, in your browser, with a demo vault (no Rust needed)
```

First launch creates a vault in `Documents/Icebreaker`. To use an existing Obsidian vault: `vault mount /path/to/vault` in the shell, or Settings → vault folder.

To talk to Claude: get an API key at [console.anthropic.com](https://console.anthropic.com), then `config key` (or set `ANTHROPIC_API_KEY`). For a fully offline setup: install Ollama, `ollama pull llama3.1`, then `config set ai.provider ollama`.

## Controls (short version — `F1` in the app for the full manual)

| | keyboard | gamepad |
|---|---|---|
| command palette | `Ctrl+K` | Y |
| today's journal / new note | `Ctrl+J` / `Ctrl+N` | — |
| AI link (UPLINK) | `Ctrl+Shift+U` · `Ctrl+Space` | — |
| tree · side panel · shell | `Ctrl+Shift+T` · `Ctrl+Shift+P` · ``Ctrl+` `` / `Ctrl+Shift+S` | — |
| HOME · MODULES · NEXUS | `Ctrl+Shift+H` · `Ctrl+Shift+M` · `Ctrl+Shift+E` | Start (HOME) |
| macros · effects · action wheel | `Ctrl+Shift+K` · `Ctrl+Shift+F` · `Ctrl+Shift+A` | hold RB (wheel) |
| shell | ``Ctrl+` `` (key under Esc) | Select (switch pane) |
| move between panes | `Alt+←↑↓→` | Select |
| tabs | `Alt+1…9`, `Ctrl+Tab`, `Ctrl+W` | LB / RB (tap) |
| action wheel: 8 slots a page, any command | `wheel` (click a slot) | hold RB, point a stick, let go (LB: next page) |
| on-screen keyboard | status bar `⌨` | X |
| interface scale (25–200 %) / fullscreen | `Ctrl+=` `Ctrl+-` `Ctrl+0` / `F11` | — |
| back to HOME | `h` (when not typing) | Start |

Every setting can go back to its default: ↺ next to it, or a button per category (`config reset <key>`). Every click runs the matching shell command, echoed in the shell: the mouse teaches you the command line (hover anything to see its command and shortcut). `Esc` closes the page you're on and goes back to the previous one. The mouse works everywhere: tabs, tree, tiles, calendar, buttons, drag-to-select, drag the shell border to resize.

## Reading the code

The codebase is meant to be read. Start at [`src/deck.ts`](src/deck.ts) (where everything is wired), then [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

```
src/
  main.ts        boot: font, settings, Deck
  deck.ts        composition root — every subsystem is created here
  core/          grid, renderer, glyph atlas, frame loop, input, gamepad, themes, settings
  ui/            immediate-mode drawing toolkit + widgets (editor, list, chat)
  workspace/     layout, tabs, focus, overlays (palette, dialogs, OSK), boot sequence
  apps/          home, note, journal, link (AI), sysmon, settings, help
  shell/         parser, executor, terminal buffer, commands/
  ai/            Claude (Anthropic SDK) and Ollama providers, vault tools, prompts
  plugins/       plugin host + the public API (api.ts)
  platform/      Tauri bridge, or a browser fallback
src-tauri/       Rust: vault file access (sandboxed), config files, system stats
plugins/         built-in plugins (same API as user plugins)
themes/          built-in themes (nightshade.toml is the annotated reference)
```

- Write a plugin → [docs/PLUGINS.md](docs/PLUGINS.md)
- Error codes (E101…) and what to do → [docs/ERRORS.md](docs/ERRORS.md)
- Who made it → [CONTRIBUTORS.md](CONTRIBUTORS.md)
- Make a theme → [docs/THEMES.md](docs/THEMES.md)
- Share them, install other people's → [docs/COMMUNITY.md](docs/COMMUNITY.md)
- Contribute to the core → [CONTRIBUTING.md](CONTRIBUTING.md) · report a vulnerability → [SECURITY.md](SECURITY.md)

## Roadmap

- [x] Vault file watcher (pick up edits made in Obsidian/vim live)
- [x] CALENDAR module (vault-local Markdown, optional Google Calendar) · local MUSIC player
- [ ] Notarized macOS builds, signed Windows installer
- [ ] Backlinks panel and a graph view in braille
- [ ] Tool use for local models (Ollama), more providers (llama.cpp server, LM Studio)
- [x] `plugin install` / `theme install` from GitHub + a community index
- [ ] Plugins in a sandboxed Worker
- [ ] Vim keybindings in the editor
- [ ] Native gamepad backend (gilrs) for Linux WebKitGTK builds without the Gamepad API
- [ ] Encrypted journal option

## License

MIT — see [LICENSE](LICENSE). Nightshade's palette is inspired by [Catppuccin](https://catppuccin.com) (MIT). Font: [JetBrains Mono](https://www.jetbrains.com/lp/mono/) (OFL).
