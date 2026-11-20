# ICEBREAKER — notes for Claude

Read by every Claude Code session on every machine, so this is where shared
context lives (memory files stay on the computer that wrote them).

## The project

An open-source, terminal-styled cyberdeck (notes, journal, AI plugins) for
Windows, macOS and Linux. Tauri 2 (Rust in `src-tauri/`) + TypeScript with a
custom canvas character-grid renderer (`src/`). Start at `src/deck.ts`, then
`docs/ARCHITECTURE.md`; module and theme rules are in `docs/GUIDELINES.md`.

- The user speaks French; answer in French. Code, commits and docs in English.
- The UI must look stunning, but the shell must behave like a real shell.
- Keep the code human-readable and easy to modify.

```
npm run dev      # UI only, in a browser, demo vault (no Rust)
npm run app      # desktop app, hot reload
npm run check    # type-check + unit tests
cargo test --manifest-path src-tauri/Cargo.toml
```

## Two computers: the Mac and the PC

The user works mainly on the **Mac**. A **Windows PC** runs the same project
and acts as the Windows test bench. Code moves between them only through
GitHub (`origin/master`), never through a shared folder.

- Before working: `git pull --rebase`. When done: commit and `git push`.
- Unfinished work that the other machine must see goes on a branch, pushed.
- Never assume the other machine has your local changes: push first, then say
  which branch and commit to test.

### Asking the PC to test something (from a Mac session)

The PC keeps a Claude Code session named **"ICEBREAKER · Windows test bench"**
open with Remote Control. To use it:

1. Push the branch to test.
2. `ListAgents`, then `SendMessage` to that session with: the branch, the
   commit, what to test, and what "working" looks like (steps + expected result).
3. It pulls, runs `npm run check`, builds, launches the app, tests it with
   computer use, and replies with what it saw (pass/fail, errors, screenshots).

The test bench only tests and reports. It does not commit or push fixes unless
the user asks it to. Fixes go back to the session that asked.

### Windows pitfalls already met

- Node path APIs (`path.join`, `readdirSync`) return `\` on Windows: normalise
  to `/` before comparing paths (see `tests/kit.test.ts`).
- Scripts in `package.json` that call `sh` (e.g. `app:mac`) are macOS-only.
