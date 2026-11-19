# Contributing

Thanks for wanting to help. ICEBREAKER is meant to be built mostly by its users.

## Where your idea goes

- **A new feature** → almost always a **module** (a plugin): its own command, app
  and HOME widget. Build it in your vault with `plugin new <id>`, publish it in your
  own repo, and add it to the community index. See [docs/PLUGINS.md](docs/PLUGINS.md)
  and [docs/COMMUNITY.md](docs/COMMUNITY.md).
- **A look** → a **theme** (one `.toml` file). See [docs/THEMES.md](docs/THEMES.md).
- **The core** (rendering, shell, workspace, plugin API, native side) → a pull
  request here. Open an issue first for anything bigger than a fix.

## Rules of the house

- **One feature = one module.** The core stays small; features live in modules.
- **Every UI action is a shell command.** Buttons run `deck.act("…")` / `{ cmd }`
  hits, so clicks show up in the history and teach the command line.
- **Every module ships commands**, not only a UI.
- **Local first.** Everything must work offline, without an account and without
  AI. Network features are opt-in and say where they connect.
- **Readable code.** The codebase is meant to be read: plain TypeScript, short
  files, comments that explain *why*.
- **No images in the UI.** It's a character grid: text, box drawing, braille, glyphs.

## Development

```bash
npm install
npm run dev        # the UI in a browser with a demo vault (no Rust needed)
npm run app        # the desktop app with hot reload
npm run check      # type-check
cargo test --manifest-path src-tauri/Cargo.toml
```

Start reading at `src/deck.ts`, then [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md):
the map of the code, how a frame is drawn, how input travels, how to add a
command / app / widget / setting / shortcut / translation, and the traps.

## Code style

The house rules for modules and themes (and the spirit of the code) are in
[docs/GUIDELINES.md](docs/GUIDELINES.md).

- A file does one thing; its top comment says what and why (the commands it
  answers to, if any). Functions get a one-line `/** … */` when the name isn't enough.
- Comments explain *why* and what the user sees, not what the next line does.
- No copy-paste helpers: look in `core/` and `ui/` first (`ago()`, `ring()`,
  `inside()`, `ListView`, `slider`, `WheelSpin`…).
- UI text in `t("…")` with its French line in `core/i18n-fr.ts`.
- A new setting = its default in `DEFAULT_SETTINGS` (`settings.set` refuses unknown keys).

## Pull requests

- Keep them focused; describe what changes for the user.
- `npm run check` passes; the app builds.
- Update the docs when behaviour changes: README, docs/, the `man` text of
  commands, **and the notes every vault gets** (`src/vault/starthere.ts`).
- By contributing you agree your work is released under the MIT licence.

Be kind: see [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
