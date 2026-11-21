# Updates — ICEBREAKER and its modules

ICEBREAKER updates itself and the modules you installed, without GitHub and without
reinstalling the app — like any program.

## For you

**Settings → UPDATES** (or the `update` command):

| setting | choices | what it does |
|---|---|---|
| Look for updates | every day · at start · never | when it looks (ICEBREAKER and the modules at once) |
| Download by itself | on · off | a new ICEBREAKER downloads in the background (nothing installed) |
| Install | ask me first · by itself | *ask*: a window shows what's new, yes or later · *by itself*: modules at once, ICEBREAKER **when you quit** (never in the middle of your work) |
| Releases | empty · an https address | where ICEBREAKER's releases are (empty: the official ones) |

```
update                 look now: what's new
update download        download ICEBREAKER's update, nothing installed
update install         install everything ready (ICEBREAKER restarts)
update modules         only the modules (= store update --all)
update settings        what's set
store update [<id> | --all]   the modules only
```

**Stealth mode looks for nothing.** Typed in the shell, `update install` asks in the shell;
from Settings (`--window`) it asks in a window. Modules can't run `update` or `store
install/remove/update` (src/shell/privileged.ts).

- **Modules**: each one installed from a repo remembers where it came from (`source` in its
  plugin.json); the newest `plugin.json` there is compared with yours. **An update that asks
  for more permissions than you approved is installed but stays switched off** until you
  switch the module on again and read them (a warning says so).
- **Built-in modules** (TODO, NEXUS, TERMINAL…) come with ICEBREAKER's own updates.
- **ICEBREAKER** reads `latest.json` from the releases (tauri-plugin-updater), downloads the
  file for your system and **checks its signature** before installing: an update not signed
  with ICEBREAKER's key is refused (src-tauri/src/appupdate.rs).

## For whoever makes releases

1. **The key** (once, done on 2026-11-20): `~/.tauri/icebreaker-updater.key` (private, never
   shared, never committed) and its public half in `src-tauri/tauri.conf.json`
   (`plugins.updater.pubkey`). **Back the private key up** (a password manager): lost,
   installed ICEBREAKERs can't be updated any more — everyone would have to reinstall by hand.
2. **CI** (Windows, Linux) signs when the repository has the secret `TAURI_SIGNING_PRIVATE_KEY`
   (the content of the key file): each installer gets its `.sig`, attached to the release
   with it (and to the run's artifacts).
3. **A release**: raise the version (`package.json`, `src-tauri/tauri.conf.json`,
   `src-tauri/Cargo.toml`), a CHANGELOG section, the version's short WHAT'S NEW notes in
   `src/whatsnew/notes.ts` (English and French, 3–8 lines per group, its `date`; a minor
   version also gets a `headline`; a test checks this version has some), commit, then `git tag v0.5.0 && git push
   --tags` → CI builds Windows and Linux and attaches them to the release *v0.5.0*.
4. **macOS** (built on a Mac): `npm run app:mac:release` — **not** `npm run app:mac`, the
   testing build, which carries the developer tools (`factory-reset`…); the script below
   refuses it — then
   `node scripts/release-update.mjs --mac --notes "what's new" --publish kiddoko/ICEBREAKER`
   → takes CI's files and their `.sig` from the release (a file without one is signed again
   here, with the local key), signs the Mac app, writes `latest.json` and adds it all to the
   release, then makes it the **latest** release. From then on, every installed ICEBREAKER
   finds it at `https://github.com/kiddoko/ICEBREAKER/releases/latest/download/latest.json`.
   (CI creates the release *not* as the latest, so installed apps keep reading the previous
   release's `latest.json` until this one is complete — never a release without it.)
   The script then tidies the release: title *ICEBREAKER x.y.z*, the notes as its text, and only
   this version's files — the macOS `.zip` (to install) and `.app.tar.gz` (to update), the
   Windows `-setup.exe`, the Linux `.AppImage` and `.deb`, and `latest.json` (GitHub adds the
   source code). No other version's file, no `.sig` (`latest.json` carries the signatures).
   It works in `dist-update/<version>/`, emptied first, so nothing from an earlier run is sent.

The repository must be **public** for that address to work without an account.

### When a release comes

- **A patch version** (0.5.1, 0.5.2…) as soon as a batch of fixes is tested on macOS and on
  Windows.
- **A new minor version** (0.6, 0.7…) at the end of each big step of the roadmap — 0.6 is the
  overhaul of the interface.
- Only from `master`, only when the creator says so.
