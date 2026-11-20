# Contributing

Thanks for wanting to help. ICEBREAKER is a hobby project ([DISCLAIMER.md](DISCLAIMER.md))
that anyone can improve: report a bug, suggest an idea, fix something, write a module or a
theme, improve the docs. You don't need to be a developer — the project's creator isn't.

## Who decides

For now the project has **one maintainer, [kiddoko](https://github.com/kiddoko)** (working
with Claude, an AI, for most of the code). Every change to the `master` branch goes through
a **pull request** reviewed and approved by a maintainer (`.github/CODEOWNERS`). People who
contribute well and often can become maintainers too: then their approval counts the same.
Decisions are taken in the open, in the issue or the pull request.

## Ideas and bugs: open an issue — or talk in Discussions

ICEBREAKER is test software ([DISCLAIMER.md](DISCLAIMER.md)): every bug report, every "this
confused me", every idea helps. **A bug** → an issue. **An idea, feedback, a question, how it
went for you, what you built** → [Discussions](https://github.com/kiddoko/ICEBREAKER/discussions).

[Issues](https://github.com/kiddoko/ICEBREAKER/issues) → *New issue* → **Bug** or **Idea**.
Say what you did, what you expected, what happened (a screenshot helps), your system and
ICEBREAKER's version (Settings → UPDATES). One issue per thing. A **security problem** never
goes in an issue: see [SECURITY.md](SECURITY.md).

## Changing something: a pull request, step by step

1. **Fork** the repository (button *Fork* on GitHub): your own copy.
2. On your copy, make a **branch** for your change (`fix-tree-scroll`, `module-pomodoro`…).
3. Make the change. Run the checks (below) and try it in the app.
4. **Open a pull request** to `kiddoko/ICEBREAKER`, branch `master`. The template asks what
   changes for the user and how you tested it.
5. The automatic checks run; a maintainer reads it, asks questions or for changes, then
   **approves and merges** it — or explains why not. Nothing reaches `master` without that.
6. Your change ships in the next release, and you're credited in
   [CONTRIBUTORS.md](CONTRIBUTORS.md) and the [CHANGELOG](CHANGELOG.md).

Small things (a typo, a sentence of docs) can be edited right on GitHub (the ✎ on a file):
it makes the fork, the branch and the pull request for you.

**Written with an AI?** Fine — this project is too. But you must have **read, run and
tested** what you send, and say so in the pull request. Never paste secrets, keys or
someone else's code you don't have the right to share.

## Where your idea goes

- **A new feature** → almost always a **module**: its own commands, page and HOME widget.
  Build it in your vault (`plugin new <id>`), see [docs/PLUGINS.md](docs/PLUGINS.md). To have
  it in the **official STORE**, see [docs/COMMUNITY.md](docs/COMMUNITY.md): its code goes into
  the STORE's repository through a pull request and is reviewed — that's what makes it
  *verified*.
- **A look** → a **theme** (one `.toml` file): [docs/THEMES.md](docs/THEMES.md).
- **The core** (rendering, shell, workspace, plugin API, native side) → a pull request here.
  Open an issue first for anything bigger than a fix, so we agree on the idea before you
  spend time on it.

## Rules of the house

- **One feature = one module.** The core stays small; features live in modules.
- **Every UI action is a shell command**, and every command works from the UI (`--window`
  for the ones that ask questions).
- **Local first.** Everything must work offline, without an online account and without AI.
  Network features are opt-in, say where they connect, and stop in stealth mode.
- **Honest.** No dark patterns, no tracking, no feature that pretends to be safer than it is.
- **Legal.** Nothing that helps break the law or someone's rights (no piracy, no scraping
  against a site's terms, no bypassing protections); third-party content with its license
  ([docs/CREDITS.md](docs/CREDITS.md)).
- **Readable code.** Plain TypeScript and Rust, short files, comments that explain *why*.
- **One of each.** One text field, one list, one search bar… the UI kit
  ([docs/UI_KIT.md](docs/UI_KIT.md)) and the spacing rules ([docs/LAYOUT.md](docs/LAYOUT.md)).

## Development

```bash
npm install
npm run dev        # the UI in a browser with a demo vault (no Rust needed)
npm run app        # the desktop app with hot reload
npm run check      # type-check + the unit tests
cargo test --manifest-path src-tauri/Cargo.toml
```

Start reading at `src/deck.ts`, then [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): the map of
the code, how a frame is drawn, how input travels, how to add a command / app / widget /
setting / shortcut / translation, and the traps. House rules for modules and themes:
[docs/GUIDELINES.md](docs/GUIDELINES.md).

## Code style

- A file does one thing; its top comment says what and why (the commands it answers to).
- Comments explain *why* and what the user sees, not what the next line does.
- No copy-paste helpers: look in `core/` and `ui/` first (`ListView`, `FilterBar`, `Field`,
  `slider`, `Row`, `ib.lib.dates`…).
- UI text in `t("…")` with its French line in `core/i18n-fr.ts`.
- A new setting = its default in `DEFAULT_SETTINGS` (`settings.set` refuses unknown keys).

## Before your pull request

- `npm run check` and `cargo test` pass; the app builds and you tried the change in it.
- The docs follow the behaviour: README, `docs/`, the `man` text of commands, the F1 manual
  (`src/apps/help.ts`) **and the notes every vault gets** (`src/vault/starthere.ts`).
- A line in the CHANGELOG (*Unreleased*), in plain words.
