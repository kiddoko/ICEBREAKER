# Reviewing ICEBREAKER

A guide for whoever reviews the code — a person or an AI. ICEBREAKER is a hobby project
([../DISCLAIMER.md](../DISCLAIMER.md)), written mostly by an AI: **assume nothing was checked
twice**. A good review finds what's wrong, says how bad it is, and proposes the smallest fix.

## Build, run, test

```bash
npm install
npm run check                                     # tsc (app + tests) + vitest
cargo test --manifest-path src-tauri/Cargo.toml   # Rust (crypto, encrypted store, accounts, files)
npm run dev                                       # the UI in a browser, demo vault (no Rust)
npm run app:mac                                   # macOS app with developer tools (factory-reset)
```

Test **only on copies** of vaults: `vault mount <a copy>` from a test account, never someone's
real notes. `debug perf [s]` measures frames; `debug hits` shows clickable areas; `debug layout` (and `debug layout pages`) lists what is cut or overlaps at 14 screen sizes; `debug state`.

## Where the risk is (read these first)

| area | files | what can go wrong |
|---|---|---|
| Vault sandbox | `src-tauri/src/vault.rs` (`resolve`, `guard`) | a path that leaves the vault (`..`, links, absolute, NFD names), the account's files readable |
| Encryption | `src-tauri/src/crypto.rs`, `store.rs`, `recovery.rs`, docs/ENCRYPTION.md | a key left in memory or on disk, a crash mid-write losing a note, `rekey` / `encrypt` / `decrypt` leaving a mix, wrong AAD binding |
| Accounts | `src-tauri/src/account.rs` | password checks bypassed, the login slow-down, the vault card adopted without approval |
| Modules | `src/plugins/host.ts`, `sandbox/`, `src/shell/origin.ts`, `privileged.ts`, `services.ts`, `frame-services.ts`, `install.ts`, `deps.ts` | a module escaping the Worker, a privileged command reachable (aliases, `;`, `&&`, **another command or function that runs it for you**), a line that reads or writes without its permission (pipes, `>`), a function that builds a command from an unquoted argument, a verified badge on unreviewed code, a path in `plugin.json` |
| Shell bridge | `src-tauri/src/term.rs`, `src/deck.ts` (`runBridged`) | a program in the real terminal getting the deck's powers |
| Native commands | `net.rs`, `files.rs`, `google.rs`, `media.rs`, `voice.rs`, `claude_code.rs` | argument / AppleScript / PowerShell / curl-config injection, SSRF, files readable by others |
| Updates | `src-tauri/src/appupdate.rs`, `src/core/updater.ts`, `src/plugins/updates.ts`, `scripts/release-update.mjs` | an unsigned update accepted, a module update from somewhere else, stealth mode leaking |
| The UI kit | `src/ui/` (kit.ts), `src/apps/settings*.ts`, `src/workspace/overlays.ts` | the same control drawn twice, keys stolen by the wrong pane, `--window` vs shell |

What was already found and fixed, and what's knowingly open: [SECURITY_AUDIT.md](SECURITY_AUDIT.md).
Don't re-report the open items — but do say if one is worse than written.

## What to check

- **Security**: the table above; also secrets in logs or the shell history, permissions of
  written files (`0600`), anything reaching the network in stealth mode, the CSP
  (`src-tauri/tauri.conf.json`).
- **Logic**: undo (`core/undo.ts`) after each kind of change, the settings registry (a
  setting with no default, a greyed row that still changes), the plugin host's order
  (`requires`), races (two clicks while a vault command is busy).
- **UI / UX**: one of each (docs/UI_KIT.md, `tests/kit.test.ts`), the spacing rules
  (docs/LAYOUT.md), keyboard-only, mouse-only and gamepad paths, French text (`core/i18n-fr.ts`)
  missing or too long, what a typed command does vs its `--window` form.
- **Docs**: every claim in README, docs/, the F1 manual (`src/apps/help.ts`) and the notes each
  vault gets (`src/vault/starthere.ts`) must match the code. Over-promising is a bug
  (DISCLAIMER.md is the tone).
- **Legal**: licenses of what's bundled or downloaded (docs/CREDITS.md), services used within
  their terms, nothing that helps break the law.
- **Performance**: `debug perf` while scrolling MODULES / NEXUS / the tree, with heavy effects
  and with none; a new glyph every frame or a CSS filter on the whole screen are the usual
  culprits.

## How to report

One finding = what, where (`file:line`), how bad (🔴 critical · 🟠 high · 🟡 medium · ⚪ low),
how to reproduce, the fix you suggest. Group by area. Say what you checked and found fine
too: it tells the next reviewer where not to look again.
