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
GitHub, never through a shared folder.

**`master` is what users get: never push to it.** It must always build and
work (in-app updates and releases come from it). Every change goes:

1. on a **branch** (`fix-sliders`, `breakermed`…), pushed to GitHub;
2. tested (the checks, the app; on Windows by the test bench when it matters);
3. into `master` through a **pull request**, merged only when the user says so.

- Before working: `git fetch` and start your branch from `origin/master`.
- Never assume the other machine has your local changes: push the branch
  first, then say which branch and commit to test.
- A release is a tag on `master` (`docs/UPDATES.md`), made only when the user
  says so.

### Asking the PC to test something (from a Mac session)

The PC keeps a Claude Code session named **"ICEBREAKER · Windows test bench"**
open with Remote Control. To use it:

1. Push the branch to test.
2. `ListAgents`, then `SendMessage` to that session with: the branch, the
   commit, what to test, and what "working" looks like (steps + expected result).
3. It pulls, runs `npm run check`, builds, launches the app, tests it with
   computer use, and replies with what it saw (pass/fail, errors, screenshots).

The test bench only tests and reports. It does not commit or push fixes unless
the user asks it to — and then on a branch, never on `master`. Fixes go back to
the session that asked.

### Windows pitfalls already met

- Node path APIs (`path.join`, `readdirSync`) return `\` on Windows: normalise
  to `/` before comparing paths (see `tests/kit.test.ts`).
- Scripts in `package.json` that call `sh` (e.g. `app:mac`) are macOS-only.
