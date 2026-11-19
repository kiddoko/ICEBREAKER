# Architecture

ICEBREAKER is a [Tauri](https://tauri.app) app: a small Rust process hosts a
webview, and the whole UI is TypeScript drawing on a `<canvas>`. No UI
framework, no virtual DOM — a character grid and a few hundred lines that paint it.

This page is the map. Read it top to bottom once, then use it to find your way:
**where a thing lives, how a frame is drawn, how input travels, how to add
something, and the few traps worth knowing.** Start reading the code at
`src/deck.ts` (the object everything hangs off), then `src/workspace/workspace.ts`.

---

## 1. The code, folder by folder

```
src/
  main.ts          creates the platform (desktop or browser) and the Deck
  deck.ts          THE object: settings, vault, themes, sound, voice, AI, plugins,
                   workspace, frame loop; start-up (boot steps), act("command")
  core/            no UI here — the engine and shared state
  ui/              drawing building blocks (immediate mode)
  workspace/       the screen: panes, tabs, overlays, input routing
  apps/            what lives in a tab (or a page): HOME, notes, settings…
  widgets/         HOME widgets (and their pop-ups)
  shell/           ibsh (the deck's shell), its commands, the system-terminal bridge
  vault/           the notes folder: files, journal, tags & icons, START HERE
  plugins/         the module system: host, API given to modules, core packages
  fx/              backgrounds, transitions, glitch, screensavers
  ai/              chat providers (Anthropic, Claude Code, Ollama) and tools
  platform/        desktop (Tauri invoke) vs browser (demo vault) back ends
plugins/           modules shipped with the deck (calendar, todo, music…)
src-tauri/src/     the native side, one file per area (see §8)
```

| Folder | Files worth knowing |
|---|---|
| `core/` | `grid.ts` cells · `renderer.ts` paints them · `loop.ts` frames on demand · `input.ts` keys/mouse/gestures · `gamepad.ts` pad + the RB action wheel · `settings.ts` **every setting and its default** · `theme.ts` TOML themes · `shortcuts.ts` the shortcut table (some keys are bound right there: `global`) · `sound.ts` synthesized UI sounds, packs · `voice.ts` · `errors.ts` error codes · `i18n.ts` + `i18n-fr.ts` · `avatar.ts` profile icons · `time.ts` `ago()` · `fxlevels.ts` effect strengths · `stealth.ts` the offline guard |
| `ui/` | `ui.ts` the `UI` class (text, box, fill, button, **hit**) · `list.ts` `ListView` (selection, scroll, drag & drop, wheel hook) · `editor.ts` text editing · `slider.ts` sliders + `askNumber` · `wheelspin.ts` the wheel/trackpad feel of rings (`WheelSpin`, `ring()`) · `tagbar.ts` the 8 colour squares · `markdown.ts`, `chatview.ts`, `bigtext.ts`, `dots.ts` |
| `workspace/` | `workspace.ts` layout + routing + top/status bars + shell panel · `sidebar.ts` the tree · `sidepanel.ts` the right panel · `overlays.ts` palette, prompt, choose, confirm, toasts, on-screen keyboard · `contextmenu.ts` right-click menus · `keycapture.ts` "press the keys" dialog · `actionwheel.ts` the action wheel · `avatarpicker.ts` · `widgetpicker.ts`, `widgetpopup.ts` · `fxpanel.ts` · `filepicker.ts` · `lock.ts` login · `boot.ts` · `favorites.ts` pins |
| `apps/` | `types.ts` the `App` interface · `home.ts` the widget grid · `note.ts` editor · `settings.ts` (+ `settings-help.ts` one sentence per setting) · `modules.ts` the shard ring · `explorer.ts` NEXUS · `trash.ts` · `shortcuts.ts` · `store.ts` · `setup.ts` · `terminal.ts` · weather / clocks / focus / journal / sysmon / studio / link / help |
| `widgets/` | `types.ts` `WidgetSpec` · `builtin.ts` core widgets · `extra.ts` more · `links.ts` 1×1 shortcut squares · `popups.ts` widget pop-ups · shared state in dependency-free files (`clockstate.ts`, `focusstate.ts`) |
| `shell/` | `shell.ts` ibsh · `parser.ts` (pipes, `;` `&&` `\|\|`, quotes) · `exec.ts` · `commands/*.ts` every command, by area · `systerm.ts` your real shell in a PTY · `terminal.ts` the terminal emulator |
| `vault/` | `vault.ts` (cached entries, events `changed` / `renamed` / `trashed`, trash log) · `marks.ts` colour tags & icons · `journal.ts` · `paths.ts` · `starthere.ts` the START HERE notes |
| `plugins/` | `api.ts` **the API modules get** (`ib.*`) · `host.ts` loading, on/off, remove · `core-packages.ts` core features presented as modules · `services.ts` modules calling each other |

---

## 2. Start-up

`main.ts` → `new Deck(platform)` → `deck.start()`:

1. stealth guard, theme + font (so the boot screen already looks right);
2. the boot screen's lines are real steps: settings, **vault mount**, user themes,
   **account** (login?), sounds, AI detection, `registerCore()` (core commands,
   apps, widgets, the 1×1 squares), plugins, STATS;
3. the session comes back (`Workspace.restoreSession`: tabs, open folders);
4. login screen if there's an account (`workspace/lock.ts`), else the greeting.

---

## 3. One frame

```
input event ──► Deck (InputSink) ──► Workspace routes it ──► app/overlay changes state
                                                                    │
FrameLoop.request() ◄───────────────────────────────────────────────┘
      │
      ▼
Deck.frame(now)
  ui.begin(grid)            clear the Grid (cols × rows cells)
  workspace.render(ui)      every visible thing draws itself with ui.text/box/…
  renderer.draw(grid)       diff against what's on screen, repaint changed cells only
  return ui.wakeIn          "call me again in N ms" (cursor blink, animation) or never
```

- **Grid** (`core/grid.ts`) — typed arrays: code point, fg, bg, attributes per cell.
- **UI** (`ui/ui.ts`) — immediate-mode drawing: `text`, `box`, `fill`, `button`,
  `hit`. No widget tree to keep in sync: what you draw this frame *is* the UI.
- **Renderer** (`core/renderer.ts`) — compares the new grid with the previous one,
  repaints only dirty cells. Glyphs come from a cache (`core/atlas.ts`); box-drawing,
  blocks, braille and powerline separators are drawn as rectangles
  (`core/glyphs.ts`) so borders and graphs are seamless at any size.
- **FrameLoop** (`core/loop.ts`) — renders on demand. Idle = 0 frames.
  Animations ask for the next frame with `ui.animate(ms)`.
- **Post-effects** — bloom, scanlines, vignette, flicker, RGB split, glow are CSS
  layers / small canvases over the main canvas (`style.css`, `core/renderer.ts`),
  driven by the theme's `[fx]` and one number per effect (`core/fxlevels.ts`).
- **After the frame**: `fx/transition.ts` plays the theme's page transition,
  `fx/glitch.ts` the glitch for big moments.

**The screen** (`Workspace.render`): top bar (tabs, page buttons) · the tree
(left) · the page (an `App`) · the side panel (right, optional) · the shell panel
(bottom, or a big tab when maximized) · status bar · overlays · toasts · tooltip.

**Tabs and pages.** Notes and apps open as tabs. A few screens are *pages*
(`Workspace.PAGES`: modules, store, NEXUS, settings, trash): they don't make a
tab, Esc closes them. The tree's wheel opens notes in a *preview tab* that the
next file replaces (`Workspace.previewNote`).

---

## 4. Input

`core/input.ts` turns DOM events into `KeyInput`, text and `MouseInput` (cell
`x`, `y`, and `fx` — the x with the fraction of a cell, used by sliders);
`core/gamepad.ts` turns the Gamepad API into `Action`s (`up`, `confirm`, `back`…)
and holding RB into the action wheel.

Routing (`workspace/workspace.ts`):

1. a **modal overlay** gets everything — as raw keys only (`onKey` / `onText`);
   map the arrows yourself (see `avatarpicker.ts`). Gamepad actions reach it
   through `onAction`;
2. the system terminal, when it has the focus, gets nearly every key;
3. global shortcuts: your own (`settings.keys`, `bind`), then the deck's —
   entries marked `global` in `core/shortcuts.ts` run their `cmd` with no other
   code, the rest are handled in `Workspace.globalKey`;
4. the focused pane's `onKey` / `onText`;
5. unused keys become Actions (`enter` → `confirm`, `esc` → `back`…) → `onAction`.

So an app that only implements `onAction` works with keyboard, gamepad and
on-screen keyboard.

**Mouse.** While drawing, `ui.hit(rect, { onClick, onDouble, onDrag, onUp,
onWheel, menu, cmd, tip })` registers areas; **the last registered area under the
pointer wins**. So to let a widget's own buttons work, register its frame *before*
drawing its content; to make a whole thing draggable (edit mode), register the
frame *after* (see `apps/home.ts`, `workspace/sidepanel.ts`). `onClick` fires on
press; a drag gets `onDrag` then `onUp` even outside the area. A `cmd` hit runs
that shell command (and echoes it in the shell: clicks teach the command line).

Text goes through a hidden `<textarea>` so IME (日本語), dead keys (ê, ü) and
paste work like in any native app.

---

## 5. Data and settings

- **Vault** (`vault/vault.ts`) — the notes folder. All file access goes through
  Rust (`src-tauri/src/vault.rs`), whose `resolve()` refuses any path outside the
  vault. `rm` moves to `.trash/` (and the trash log remembers where things lived);
  writes are atomic (temp file + rename). Files dragged in from the Finder /
  Explorer go through `vault_import` (copies, never overwrites).
- **Settings** (`core/settings.ts`) — `settings.json` / `secrets.json` in the OS
  config folder. Every key is reachable with `config set a.b value`.
  > ⚠️ **Every key must exist in `DEFAULT_SETTINGS`.** `settings.set()` throws on
  > an unknown key — add the default with the type, even for an empty record.
- **Module data** — `ib.storage` (a JSON file per module in the vault),
  `ib.settings` (rows in Settings), Google data in the config folder (never the vault).
- **Themes** (`core/theme.ts`) — TOML, merged over the default theme.
- **Per theme**: effects (`settings.fxByTheme`) and the sound pack
  (`settings.sound.packByTheme`) are remembered for each theme.

---

## 6. Adding things

**A shell command** — add an object to a list in `shell/commands/*.ts`:

```ts
const hello: Command = {
  name: "hello",
  summary: "say hello",                      // one line, shown in `help`
  usage: "hello [name]",                     // shown by `man hello`
  complete: () => ["world"],                 // Tab completion
  run(ctx) { ctx.out(fmt.magenta("hello ") + ctx.args.join(" ") + "\n"); },
};
```

If the system terminal should run the deck's version instead of a program of the
same name, add it to `CORE_IN_TERMINAL` (`shell/systerm.ts`), like `reboot` and `logout`.

**An app** — implement `App` (`apps/types.ts`: `title()` + `render()`, then
`onKey` / `onText` / `onAction` / `menu`), export an `AppSpec`, register it in
`Deck.registerCore()`. Make it a page (no tab) by adding its kind to `Workspace.PAGES`.

**Calling another part** — modules and the deck's own parts expose functions
(`plugins/services.ts`, `plugins/core-services.ts`, `plugins/frame-services.ts`):
`deck.use("tree").reveal(path)`, `deck.use("todo").add("…")` — in a module,
`ib.use(…)`. Add a function to the frame in `frame-services.ts` (one line: `doc`
+ `fn`, and `needs` if it touches the user's machine); it appears in `modules api`.

**Making the deck talk** — `deck.speak(topic, text)`: one place decides whether
the voice may say it (Settings → VOICE → say aloud). Add a topic to `VoiceTopic`
(`deck.ts`), its default in `voice.speak` (`core/settings.ts`), a toggle in
`apps/settings.ts`.

**A widget** — a `WidgetSpec` (`widgets/types.ts`): `size`, `min`, optional `max`,
`render`, and `popup` / `activate` / `open` for what Enter does. `clickActivates`
makes one click run `activate` (the 1×1 squares).

**An overlay** (a dialog, a menu) — implement `Overlay` (`workspace/overlays.ts`)
and `deck.workspace.push(new MyOverlay(…))`. Set `done = true` to close.

**A shortcut** — a line in `core/shortcuts.ts` (it shows on the SHORTCUTS page).
With `cmd` and `global: true`, the key works everywhere with no other code.

**A setting** — its default in `DEFAULT_SETTINGS`, a row in `apps/settings.ts`
(`toggle`, `cycle`, `slide`, `text`, or a custom row), one sentence in
`apps/settings-help.ts` (English + French).

**A translation** — wrap UI text in `t("English")`, add the line to
`core/i18n-fr.ts`. Missing keys simply show in English.

**A theme / a module** — see [THEMES.md](THEMES.md) and [PLUGINS.md](PLUGINS.md);
no rebuild needed.

---

## 7. Traps worth knowing

- `settings.set()` throws on keys missing from `DEFAULT_SETTINGS` (see §5).
- Modal overlays get raw keys, not Actions (see §4).
- Hits: last registered wins (see §4).
- **Import cycles**: `widgets/popups` ↔ `widgets/builtin` ↔ `widgets/extra`, and
  apps ↔ widgets. Shared state goes in small dependency-free files
  (`widgets/clockstate.ts`, `core/time.ts`); apps don't import `widgets/popups`.
- The browser preview (`npm run dev`) has no native side: no system terminal, no
  Google, no file drop, no real login. `window.deck` is exposed there for testing:
  `await deck.act("panel show")`, `deck.errors.list`…
- Every UI action should be a shell command (`cmd` on hits, `deck.act()`): it's
  how the history, macros, key bindings and the action wheel can reuse it.

---

## 8. The native side (`src-tauri/src`)

| File | What |
|---|---|
| `lib.rs` | the Tauri builder: plugins, every command registered |
| `vault.rs` | the vault: list, read, write, rename, trash, import; the path guard |
| `term.rs` | the PTY (your shell) and the bridge that lets it run deck commands; shell hooks for zsh, bash, fish, PowerShell |
| `files.rs` | read-only access to the computer for the deck's file picker |
| `config.rs` | settings and secrets files |
| `account.rs` | the optional login (password hash) |
| `voice.rs` | text to speech (sherpa-onnx / piper, system voices) |
| `media.rs`, `audio.rs` | what's playing (Spotify…), local music |
| `google.rs` | Google OAuth (PKCE) and the Calendar API |
| `net.rs` | `net_get` for the STORE and modules (https, LAN http) |
| `system.rs` | CPU, memory, uptime for SYSMON |
| `claude_code.rs` | runs the Claude Code CLI for UPLINK |
| `dev.rs` | developer helpers |

---

## 9. AI

`ai/types.ts` defines a provider-neutral `ChatSession`. `ai/anthropic.ts` uses the
official Anthropic SDK (streaming, tool use, prompt caching); `ai/claudecode.ts`
drives the Claude Code CLI; `ai/ollama.ts` talks to a local Ollama.
`ai/tools.ts` gives the model `list_notes`, `search_notes`, `read_note` and
`write_note` (the last one always asks you first). Stealth mode refuses cloud providers.

---

## 10. Checking your work, releasing

```bash
npm run check          # types (also covers plugins/)
npm run dev            # the UI in a browser, demo vault, window.deck to poke at
npm run app            # the desktop app, hot reload
cargo check --manifest-path src-tauri/Cargo.toml
cargo test  --manifest-path src-tauri/Cargo.toml
npm run app:mac        # a signed .app for your own Mac (scripts/mac-dev-sign.sh)
```

A release: bump the version in `package.json`, `package-lock.json`,
`src-tauri/tauri.conf.json` and `src-tauri/Cargo.toml`; a section in
`CHANGELOG.md`; tag `vX.Y.Z` and push the tag — CI builds the Windows and Linux
installers and attaches them to the GitHub release (macOS builds on demand).
