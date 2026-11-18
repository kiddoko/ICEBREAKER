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
- **Everything is a module** — only the frame is fixed (HOME, notes and their editor, the tree, the shell, settings). NEXUS, UPLINK, the journal, calendar, music, clocks, news, weather… are modules you can switch off, remove and reinstall from the STORE, like the ones made by the community. The MODULES hive shows them all in pseudo-3D.
- **Your real terminal, upgraded** — the shell panel runs your own zsh / bash / fish, or PowerShell on Windows (your profile, oh-my-posh and all), (ssh, git, vim, htop…) in the vault folder, with every ICEBREAKER command added (`todo add …`, `journal`, `theme set …`; `ib <cmd>` when a name clashes). Your ~/.zshrc is loaded, never modified. Prefer a vault-only sandbox? `term mode ibsh`. Clicks log their commands in a separate **history** tab.
- **A real-ish shell** — pipes, redirections, globs, history, fish-style suggestions, 70+ commands working on your vault. `cat note.md | ask "summarize"` works.
- **LINK** — chat with Claude, which can search, read and write your notes ("make me a note with a shopping list for a spinach pie"). With Claude Code it writes inside the vault only, never elsewhere (`config set ai.allowWrites false` to keep it read-only); with an API key it asks before each write. Or use a local open-source model through [Ollama](https://ollama.com).
- **Plugins** — small JS modules with a documented API and declared permissions; the bundled modules (TODO, CALENDAR, STATS…) use the very same API.
- **Themes** — TOML files, hot-swappable: colors, font, border style and symbols. Default: `nightshade` (violet, Catppuccin-flavoured). Also `amber`, `neon-ronin`, `phosphor`, `ghost`, `redline`, `graphite`.
- **Modules** — one feature, one module, each with its own command, app and HOME widget. So far: **TODO** (`todo add "walk the dog" --urgent --due tomorrow +home`, or the app, or the widget), **CALENDAR** (a local calendar plus your Google calendars: `cal add "dentist" fri 14:30 --cal work`, the app, and an "upcoming" widget that shows more as it grows; Google setup in `man cal`), **STATS** (numbers over time — what your modules record, like a budget left or the commands you ran, and your own: `stats set weight 72.4 --unit kg`, `stats add pushups 20`; a graph per stat, a widget, and `ib.stats` for module makers), **HABITS** (boxes that reset every day, with streaks: `habit add "drink water" --times 8`, `habit check water`), **REMINDERS** (`remind "call mom" fri 18:00`) and **MUSIC** (your own music folder played by the deck, a text-only mini iTunes with no cover art: `music play daft punk`; plus what's playing in Spotify / Music on macOS or any player on Linux).
- **NEXUS** — walk your vault in pseudo-3D: files ride a carousel above a synthwave floor grid under glyph rain (`explore`, or MODULES → Nexus).
- **Daily log** — `daily` asks a short end-of-day check-in in the shell (quick answers 1-5) and writes it to your journal; `daily trend` charts it.
- **Login** — optional account that locks the deck at start-up. The password is hashed with Argon2id and never stored. It locks the app, it does not encrypt your notes (they stay readable Markdown files). Forgot it? Quit, delete `account.json` in the config folder (macOS: `~/Library/Application Support/org.icebreaker.deck/`), restart.
- **English or French** — the whole interface and the voice, chosen at setup (Settings → language).
- **Voice** — the deck can talk: local, open-source neural female voices (Jenny in English, Siwis in French, on sherpa-onnx), or Japanese — whatever the UI language — for the full cyberpunk effect, through a robot filter — clearly a machine, not choppy. It greets you at start-up and can read the AI's answers — from the setup, Settings → VOICE, or `voice install`, `voice on`, `voice read on`. Nothing leaves your computer.
- **Stealth mode** — `stealth on`: 100 % local. No internet at all; AI only through a local model (Ollama on this machine or a box at home); your vault can live on your own server.
- **Themes** — 10 built-in looks, each with its own colors, font, background animation, sounds, widget frames and motion: from **e-ink** (matte paper, black and greys, pages that refresh like an e-reader) to **neon-district** (synthwave, circuit traces) and **abyss** (bioluminescent sonar). Make your own in a `.toml` file or the theme studio.
- **STORE** — modules and themes from the community index on GitHub, or from your own server / NAS: browse, install, enable, update, remove (top bar → ⇣ store, or `store`).
- **NEXUS** — the vault as a 3D place, now with actions: new note / folder, search the whole vault, rename, trash, sort (top bar → ⬡ nexus).
- **Widgets that open up** — enter, double-click or the pad's A on a HOME widget opens its pop-up (add a city to the world clock, quick-add a task, the week's weather, the next moon phases…) with a button to its full module.
- **Sounds** — UI blips synthesized on the fly; drop your own `move.wav`, `open.wav`, `confirm.wav`, `back.wav`, `success.wav`, `error.wav`, `notify.wav`, `boot.wav`, `unlock.wav`, `denied.wav` (or .ogg / .mp3) in `.icebreaker/sounds/` to replace them.
- **Light** — renders only what changed, sleeps when idle, `fx potato` for old laptops. ~10 MB binary.

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
for Windows, `.AppImage` / `.deb` for Linux.

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
| AI link | `Ctrl+Space` | — |
| shell | ``Ctrl+` `` (key under Esc) | Select (switch pane) |
| move between panes | `Alt+←↑↓→` | Select |
| tabs | `Alt+1…9`, `Ctrl+Tab`, `Ctrl+W` | LB / RB |
| on-screen keyboard | status bar `⌨` | X |
| interface scale (25–200 %) / fullscreen | `Ctrl+=` `Ctrl+-` `Ctrl+0` / `F11` | — |
| back to HOME | `h` (when not typing) | Start |

Every click runs the matching shell command, echoed in the shell: the mouse teaches you the command line (hover anything to see its command and shortcut). `Esc` closes the page you're on and goes back to the previous one. The mouse works everywhere: tabs, tree, tiles, calendar, buttons, drag-to-select, drag the shell border to resize.

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
