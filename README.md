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
- **A real-ish shell** — pipes, redirections, globs, history, fish-style suggestions, 70+ commands working on your vault. `cat note.md | ask "summarize"` works.
- **LINK** — chat with Claude, which can search and read your notes (and write them, with your approval). Or use a local open-source model through [Ollama](https://ollama.com).
- **Plugins** — small JS modules with a documented API and declared permissions. LINGO, an AI language tutor, ships as an example.
- **Themes** — TOML files, hot-swappable. Default: `nightshade` (violet, Catppuccin-flavoured). Also `amber` and `neon-ronin`.
- **Light** — renders only what changed, sleeps when idle, `fx potato` for old laptops. ~10 MB binary.

Everything is local: your notes are files on your disk, settings are JSON, nothing phones home. The only network traffic is to the AI provider *you* configure.

## Quick start

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
| zoom / fullscreen | `Ctrl+=` `Ctrl+-` / `F11` | — |

The mouse works everywhere: tabs, tree, tiles, calendar, buttons, drag-to-select, drag the shell border to resize.

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

## Roadmap

- [ ] Vault file watcher (pick up edits made in Obsidian/vim live)
- [ ] Backlinks panel and a graph view in braille
- [ ] Tool use for local models (Ollama), more providers (llama.cpp server, LM Studio)
- [ ] Plugins in a sandboxed Worker; a shareable theme & plugin registry (`plugin install <url>`)
- [ ] Vim keybindings in the editor
- [ ] Native gamepad backend (gilrs) for Linux WebKitGTK builds without the Gamepad API
- [ ] Encrypted journal option
- [ ] Spaced-repetition review for LINGO vocabulary

## License

MIT — see [LICENSE](LICENSE). Nightshade's palette is inspired by [Catppuccin](https://catppuccin.com) (MIT). Font: [JetBrains Mono](https://www.jetbrains.com/lp/mono/) (OFL).
