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
scanlines — and works with the keyboard, the mouse or a gamepad.

### Your notes
- **Plain Markdown**, an Obsidian-compatible vault (`[[wikilinks]]`, `#tags`, frontmatter) — or point it at the vault you already have.
- **Journal**: one file per day, a calendar, streaks; `journal add "…"` from the shell; `daily` asks a short end-of-day check-in.
- **The tree**: one click selects, a double-click opens; drag & drop, colour tags and icons, pins at the top, shift + wheel to walk file by file with a live preview.
- **Notes**: a toolbar (save, save as, new, previous / next, undo, redo), a red dot while unsaved, `⌘S`. A note changed elsewhere (Obsidian, a sync) reloads by itself, and never overwrites your unsaved edits.
- **Undo anything** with `⌘Z` / `Ctrl+Z` — a setting, a widget moved, a file sent to the trash, a rename. The **trash** is a page you can browse and restore from; nothing is ever deleted for good from inside the deck (apart from `self-destruct`, which asks four times).
- **NEXUS**: walk your vault in pseudo-3D — files on an endless ring above a synthwave floor (`explore`).

### HOME and the side panel
- **Widgets** anywhere on HOME, gaps included, on several pages; drag them, pull a corner to resize, open one for its pop-up and settings. TODO, REMINDERS and HABITS entries are edited and removed right in their widget. The **same widget several times**, each copy with its own settings (two clocks, two news feeds…).
- **The side panel** (◧): widgets that stay in view on every page, edited together with HOME.
- **Pins and shortcut squares are one list**: pin a note, folder, module, page, macro or command — it shows at the top of the tree, in the pinned widget, and as a square on HOME if you like.
- **PULSE**: one widget for what's happening — the next event, tasks due, reminders, music, focus, weather, errors.

### The shell
- **Your real terminal** (zsh / bash / fish, or PowerShell on Windows) in tabs, with your profile and prompt, every ICEBREAKER command added (`todo add …`, `theme set …`), and macros one click away.
- **ibsh**, the deck's own shell: pipes, redirections, globs, history, 70+ commands on your vault — `cat note.md | ask "summarize"` works.
- **Every click is a command**: the LOG tab shows what your clicks ran, errors (with a code, see [docs/ERRORS.md](docs/ERRORS.md)) and notifications.

### UPLINK, the AI (optional)
- Chat with **Claude** (Claude Code or an API key) or a **local model through [Ollama](https://ollama.com)**. It can search, read and — when you ask — write notes, inside the vault only.
- Several conversations in tabs; each message says who wrote it.
- A **context page** it reads before every conversation (`context`): who you are, how it should talk to you, how your vault is organised — built by the deck, no AI involved.
- The **voice** reads answers while they're written, in English, French — or Japanese, for the full cyberpunk effect. Local open-source voices (sherpa-onnx): nothing leaves your computer. You choose what else it says aloud (errors, reminders, your next event…).

### Modules
- **Everything is a module**, apart from the frame (HOME, notes, the tree, the shell, settings): TODO, CALENDAR (local + Google), HABITS, REMINDERS, STATS, MUSIC, WEATHER, CLOCKS, FOCUS, NEWS, NEXUS, UPLINK… Switch them off, remove them, reinstall them from the **STORE** (modules and themes from the [community index](https://github.com/kiddoko/icebreaker-modules) or your own server).
- **MODULES** shows them on a turning ring, each one a cyberdeck shard in its colour.
- Modules have a documented API and declared permissions; the built-in ones use the very same API ([docs/PLUGINS.md](docs/PLUGINS.md)). Everything is callable: `ib.use("tree").reveal("notes/a.md")`.

### Look and feel
- **11 themes**, each with its colours, font, animated background, sounds, widget frames and screensaver — from e-ink (matte paper) to neon-district (synthwave) and abyss (bioluminescent sonar). Make your own in a `.toml` file or the theme studio ([docs/THEMES.md](docs/THEMES.md)).
- **Effects**: one slider each for bloom, scanlines, vignette, RGB split, glow and sharpness, or a preset (none · light · medium · heavy · party).
- **Smooth**: vertical sync up to 120 Hz, letters that fade in as they appear, text that types itself out with a little blip; or *reduce motion* for slower machines. Nothing is drawn when nothing moves.
- **Sounds**: synthesized UI blips in 7 packs, a mixer, optional keyboard clicks; your own sound files too ([docs/SOUND_PACKS.md](docs/SOUND_PACKS.md)).
- **THE MENU** (`⌘K` or shift twice) searches everything; every shortcut is listed (`⌘/`) and can be changed; right-click works everywhere.
- **English or French**, chosen at setup. A **guided tour** after the setup (`tour` plays it again).
- **Docs in your vault**: START HERE/ (the tour, modules, interface, shell, keys, the AI, privacy) and FOR DEVELOPERS/ (themes, the module API), written into every vault and kept up to date.
- **Picks up where you left**: tabs, open folders and the page you were on come back at the next start. Mouse back / forward and a two-finger swipe switch tabs; pinch zooms.

### Accounts and privacy
- **Accounts**: each one is its own deck — settings, theme, sounds, vault, Google connection — behind its password (Argon2id, never stored). It locks the app; it doesn't encrypt your notes yet (vault encryption is planned: [docs/ENCRYPTION.md](docs/ENCRYPTION.md)). Forgot a password? Quit, remove that account from `accounts.json` in the config folder (macOS: `~/Library/Application Support/org.icebreaker.deck/`); its settings stay in `users/<id>/`.
- **Stealth mode** (`stealth on`): 100 % local, no internet at all.

> [!WARNING]
> **Not for sensitive documents.** ICEBREAKER is a hobby project, made with care
> but without any security audit. Your notes are plain files on your disk
> (vault encryption is being worked on, not there yet). Don't use it to keep
> passwords, medical, legal, financial or other sensitive documents. Use it at
> your own risk — see the [license](LICENSE): no warranty of any kind.

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
| THE MENU: search everything, or a key + enter | `Ctrl+K` (⌘K) · `Shift` twice (anywhere, even typing) | hold RB · Y |
| today's journal / new note | `Ctrl+J` / `Ctrl+N` | — |
| UPLINK, the AI | `Ctrl+Shift+U` · `Ctrl+Space` | — |
| tree · side panel · shell | `Ctrl+Shift+T` · `Ctrl+Shift+P` · ``Ctrl+` `` / `Ctrl+Shift+S` | — |
| HOME · MODULES · NEXUS | `Ctrl+Shift+H` · `Ctrl+Shift+M` · `Ctrl+Shift+E` | Start (HOME) |
| macros · effects | `Ctrl+Shift+K` · `Ctrl+Shift+F` | — |
| shell | ``Ctrl+` `` (key under Esc) | Select (switch pane) |
| move between panes | `Alt+←↑↓→` | Select |
| tabs | `Ctrl+1…9`, `Ctrl+Tab`, `Ctrl+W` | LB / RB (tap) |
| undo / redo anything | `Ctrl+Z` / `Ctrl+Shift+Z` (⌘Z / ⌘⇧Z) | — |
| put anything on THE MENU | right-click → *Add to THE MENU…* · `menu add <key> "<cmd>"` | — |
| on-screen keyboard | status bar `⌨` | X |
| interface scale (25–200 %) / fullscreen | `Ctrl+=` `Ctrl+-` `Ctrl+0` / `F11` | — |
| back to HOME | `h` (when not typing) | Start |

Every setting can go back to its default: ↺ next to it, or a button per category (`config reset <key>`). Every click runs the matching shell command (the LOG tab shows it): the mouse teaches you the command line (hover anything to see its command and shortcut). `Esc` closes the page you're on and goes back to the previous one. The mouse works everywhere: tabs, tree, tiles, calendar, buttons, drag-to-select, drag the shell border to resize.

## Reading the code

The codebase is meant to be read. Start at [`src/deck.ts`](src/deck.ts) (where everything is wired), then [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

```
src/
  main.ts        boot: font, settings, Deck
  deck.ts        composition root — every subsystem is created here
  core/          grid, renderer, glyph atlas, frame loop, input, gamepad, themes, settings
  ui/            immediate-mode drawing toolkit: editor, lists, chat, sliders, keycaps, typewriter
  workspace/     layout, tabs, focus, overlays (THE MENU, dialogs, OSK), boot sequence
  apps/          home, note, journal, link (UPLINK), modules, explorer (NEXUS), settings, help…
  shell/         parser, executor, terminal buffer, commands/
  ai/            Claude (Claude Code, Anthropic API) and Ollama providers, vault tools, prompts, context page
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
- Make a sound pack → [docs/SOUND_PACKS.md](docs/SOUND_PACKS.md)
- The house rules for modules and themes → [docs/GUIDELINES.md](docs/GUIDELINES.md)
- Modules and safety (the audit, the sandbox plan) → [docs/SANDBOX.md](docs/SANDBOX.md)
- Share them, install other people's → [docs/COMMUNITY.md](docs/COMMUNITY.md)
- Contribute to the core → [CONTRIBUTING.md](CONTRIBUTING.md) · report a vulnerability → [SECURITY.md](SECURITY.md)

## Roadmap

- [x] Vault file watcher (pick up edits made in Obsidian/vim live)
- [x] CALENDAR module (vault-local Markdown, optional Google Calendar) · local MUSIC player
- [ ] Notarized macOS builds, signed Windows installer
- [ ] Backlinks panel and a graph view in braille
- [ ] Tool use for local models (Ollama), more providers (llama.cpp server, LM Studio)
- [x] `plugin install` / `theme install` from GitHub + a community index
- [ ] Modules from the store in a sandboxed Worker ([docs/SANDBOX.md](docs/SANDBOX.md))
- [ ] Vim keybindings in the editor
- [ ] Native gamepad backend (gilrs) for Linux WebKitGTK builds without the Gamepad API
- [ ] Vault encryption, with a recovery key (plan agreed: [docs/ENCRYPTION.md](docs/ENCRYPTION.md))

## License

MIT — see [LICENSE](LICENSE). Nightshade's palette is inspired by [Catppuccin](https://catppuccin.com) (MIT). Font: [JetBrains Mono](https://www.jetbrains.com/lp/mono/) (OFL).
