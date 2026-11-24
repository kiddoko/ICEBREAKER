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
  ui/              drawing building blocks (immediate mode) — THE UI KIT (ui/kit.ts, docs/UI_KIT.md):
                   one field, one checkbox, one list… and the spacing rules (ui/layout.ts, docs/LAYOUT.md)
  workspace/       the screen: panes, tabs, overlays, input routing
  apps/            what lives in a tab (or a page): HOME, notes, settings…
  widgets/         HOME widgets (and their pop-ups)
  shell/           ibsh (the deck's shell), its commands, the system-terminal bridge;
                   origin.ts = who a line comes from (you, a module, your real terminal) and what it may
                   read and write; privileged.ts = the commands only you may run;
                   classes.ts = every command classed for modules (an allow-list, guarded by a test)
  vault/           the notes folder: files, journal, tags & icons, START HERE
  plugins/         the module system: host, API given to modules, core packages (TERMINAL among them:
                   workspace.terminalOn hides the shell panel; shell.readLine asks in dialogs then);
                   sandbox/ = STORE and vault modules in a Worker (docs/SANDBOX.md); deps.ts = what a module
                   `requires`; updates.ts = module updates; install.ts = the STORE's indexes, verified or not
  fx/              backgrounds, transitions, glitch, screensavers
  ai/              chat providers (Anthropic, Claude Code, Ollama) and tools
  platform/        desktop (Tauri invoke) vs browser (demo vault) back ends
plugins/           modules shipped with the deck (calendar, todo, music…)
src-tauri/src/     the native side, one file per area (see §8)
```

| Folder | Files worth knowing |
|---|---|
| `core/` | `grid.ts` cells · `renderer.ts` paints them · `loop.ts` frames on demand · `input.ts` keys/mouse/gestures · `gamepad.ts` pad (hold RB: THE MENU; `kind`: Xbox / PlayStation / Nintendo; `padButtonFor(action)`) · `padglyphs.ts` the pad's buttons in pixel art (two cells each, U+E100…, drawn by `glyphs.ts`; `padIcon(button, kind)`, `debug pad` shows them) · `settings.ts` **every setting and its default** · `theme.ts` TOML themes · `shortcuts.ts` the shortcut table (some keys are bound right there: `global`) · `sound.ts` synthesized UI sounds, packs · `mixer.ts` the modules' sampler (`ib.audio`: an AudioWorklet, `mixer-worklet.ts`, maths in `mixer-dsp.ts`) · `voice.ts` · `errors.ts` error codes · `i18n.ts` + `i18n-fr.ts` · `avatar.ts` profile icons · `time.ts` `ago()` · `dates.ts` day / time parsing (`ib.lib.dates`) · `undo.ts` the ⌘Z history · `eventlog.ts` what the LOG tab shows · `fxlevels.ts` effect strengths · `stealth.ts` the offline guard · `updater.ts` ICEBREAKER's and the modules' updates (Settings → UPDATES, docs/UPDATES.md); WHAT'S NEW after an update: `src/whatsnew/` (the notes, the once-per-version rule) and `workspace/whatsnew.ts` (the page) · `prefs.ts` **the settings registry** (every row, the deck's and the modules', with its kind and its way back to default) · `catalog.ts` **the catalog**: everything the deck can do as blocks (commands, actions, shortcuts, settings, functions, widgets, apps, themes, modules) |
| `ui/` | `ui.ts` the `UI` class (text, box, fill, button, **hit**) · `list.ts` `ListView` (selection, scroll, drag & drop, wheel hook) · `editor.ts` text editing · `slider.ts` sliders + `askNumber` · `wheelspin.ts` the wheel/trackpad feel of rings (`WheelSpin`: a critically damped spring, `ring()`) · `filterbar.ts` **the** search + colours bar (`FilterBar`) every list of things uses · `keycaps.ts` keys drawn as keycaps · `typewriter.ts` text that types itself out · `uplinkcore.ts` UPLINK's face (widget and tour) · `layout.ts` the spacing rules and `Row` / `Bar` / `stack` / `cards` (docs/LAYOUT.md) · `probe.ts` what `debug layout` finds cut or overlapping · `pagebar.ts`, `floor.ts`, `glide.ts`, `markdown.ts`, `chatview.ts`, `bigtext.ts`, `dots.ts` |
| `workspace/` | `workspace.ts` layout, tabs, focus, input routing · `layout/tree.ts` + `layout/solve.ts` the screen as a tree of frames, solved into rects · `layout/arrange.ts` where the frames sit (`settings.layout`, `layout preset`, `frame move`) · `layout/focus.ts` ⌘⌥ arrows by geometry (docs/FRAMES.md) · `chrome.ts` the top bar (the deck menu), the status bar, the shell panel, tips, subtitles · `tabstrip.ts` the tabs on each frame's border (two rows, drag to move or onto another frame, groups, HOME pinned) · `tabgroups.ts` tab groups, `tabplaces.ts` which frame a tab lives in (both pure) · `menus.ts` the right-click menus and the deck menu · `sidebar.ts` the tree · `sidepanel.ts` the right panel · `overlays.ts` prompt, choose, confirm, toasts, on-screen keyboard · `quickmenu.ts` **THE MENU** (⌘K / shift twice: search everything, or a key + enter) · `contextmenu.ts` right-click menus · `keycapture.ts` "press the keys" dialog · `avatarpicker.ts` · `widgetpicker.ts`, `widgetpopup.ts` · `fxpanel.ts` · `filebrowser.ts` **the** little file browser (a vault folder, or picking a file on the computer) · `lock.ts` login · `boot.ts` · `favorites.ts` pins |
| `apps/` | `types.ts` the `App` interface · `home.ts` the widget grid · `note.ts` editor · `settings.ts` draws the settings (its rows come from `settings-rows.ts` through `deck.prefs`; `settings-help.ts` one sentence per setting) · `blocks.ts` the CATALOG page · `modules.ts` the shard ring · `explorer.ts` NEXUS · `trash.ts` · `shortcuts.ts` · `store.ts` · `setup.ts` · `terminal.ts` · weather (its sky: `weathersky.ts`, a pure drawing) / clocks / news (the NEWS page) / moon (the MOON page) / focus / journal / sysmon / studio / link / help |
| `widgets/` | `types.ts` `WidgetSpec` · `builtin.ts` core widgets · `extra.ts` more · `links.ts` the shortcut squares (one per pin) · `popups.ts` widget pop-ups · `news.ts` NEWS (sources, feeds, the widget, `news`) · `moonphase.ts` the moon's phase (Meeus, pure) and `moondraw.ts` the moon drawn in half blocks · `alarms.ts` alarms (pure: days, next ring) and `alarmring.ts` the clock that rings them and the ringing screen · shared state in dependency-free files (`clockstate.ts`, `focusstate.ts`) |
| `shell/` | `shell.ts` ibsh · `parser.ts` (pipes, `;` `&&` `\|\|`, quotes) · `exec.ts` · `commands/*.ts` every command, by area · `systerm.ts` your real shell in a PTY · `terminal.ts` the terminal emulator |
| `vault/` | `vault.ts` (cached entries, events `changed` / `renamed` / `trashed`, trash log) · `marks.ts` colour tags & icons · `journal.ts` · `paths.ts` · `starthere.ts` the START HERE notes (`starthere-fr.ts` in French) |
| `plugins/` | `api.ts` **the API modules get** (`ib.*`) · `host.ts` loading, on/off, remove · `core-packages.ts` core features presented as modules · `services.ts` modules calling each other |

---

## 2. Start-up

`main.ts` → `new Deck(platform)` → `deck.start()`:

0. **who's logged in?** The native side remembers the account unlocked in this
   run of the app (`account_session`). Nobody → `Deck.startLogin()`: the login
   page alone (`workspace/lock.ts`), with default settings (read-only) and the
   look of the last account (`core/device.ts`, device.json) — no vault, no
   module. Logging in or making an account unlocks it natively, then the page
   reloads and starts again as that account. Logging out (`lockNow`) saves,
   locks natively and reloads.
1. stealth guard, theme + font (so the boot screen already looks right);
2. the boot screen's lines are real steps: the account's settings, **its vault
   mount** (a new account gets its own folder), user themes, sounds, AI detection,
   `registerCore()` (core commands, apps, widgets, the pins' squares), plugins, STATS;
3. the session comes back (`Workspace.restoreSession`: tabs, open folders);
4. the greeting (and the setup, the first time an account logs in).

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
  Animations ask for the next frame with `ui.animate(ms)`; anything ≤ 17 ms means
  "the next frame", so animations run at the screen's rate (vsync) or the user's
  cap (vsync off: timers pace frames, 0–240 fps; 0 = no animation frames at all).
  *Reduce animations* caps them at 30 fps and drops transitions and the animated
  background. Settings → APPEARANCE: `vsync`, `maxFps`, `brightness`, `reduceMotion`.
- **Smoothness tricks** — the grid can't draw between cells, so motion is smooth
  through frame rate and easing (rings, transitions follow `dt`), and through
  partial blocks where it counts (a slider's handle moves by eighths of a cell).
- **Post-effects** — bloom, scanlines, vignette, flicker, RGB split, glow are CSS
  layers / small canvases over the main canvas (`style.css`, `core/renderer.ts`),
  driven by the theme's `[fx]` and one number per effect (`core/fxlevels.ts`).
- **After the frame**: `fx/transition.ts` plays the theme's page transition,
  `fx/glitch.ts` the glitch for big moments.

**The screen** (`Workspace.render`, drawn from a layout tree of frames: [FRAMES.md](FRAMES.md)): the top row (the frames' tabs, with the deck menu ◆ icebreaker and UPLINK + the clock in its corners) · each frame with its tabs on its border · the tree
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
and holding RB into THE MENU.

**THE MENU** (`workspace/quickmenu.ts`) is the one place to do anything: ⌘K
(ctrl+K), shift pressed twice (`InputManager.onDoubleShift`: works anywhere, even
in a note or a terminal), holding RB or Y. Typing searches everything (commands,
notes, apps, themes — `Deck.paletteEntries()`); empty, it shows the menu keys of
the things you use most, and a key + enter runs it (m ⏎ = MODULES: the exact
key always comes first, so nothing fires by itself). Menu keys come from the
shortcut table (`menuKey`), then modules (`PaletteAction.key`, only if free),
then the user's own (`settings.keys` `"menu g"`). It replaced the command palette
and the gamepad's action wheel.

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
that shell command (and the shell's log shows it: clicks teach the command line).

Text goes through a hidden `<textarea>` so IME (日本語), dead keys (ê, ü) and
paste work like in any native app.

---

## 5. Data and settings

- **Vault** (`vault/vault.ts`) — the notes folder. All file access goes through
  Rust (`src-tauri/src/vault.rs`), whose `resolve()` refuses any path outside the
  vault. `rm` moves to `.trash/` (and the trash log remembers where things lived);
  writes are atomic (temp file + rename). Files dragged in from the Finder /
  Explorer go through `vault_import` (copies, never overwrites).
- **Accounts** (`src-tauri/src/account.rs`) — `accounts.json` (names + Argon2id
  hashes) in the OS config folder; each account's own files in `users/<id>/`:
  `settings.json`, `secrets.json`, `google.json`. The native side only reads and
  writes the files of the account unlocked (`config.rs`), so an account can't see
  another's settings. `device.json` (the deck's own) only holds the login page's
  look. A new account needs an existing one's name + password (they all run as
  the same computer user: a new one could otherwise open a terminal).
- **Settings** (`core/settings.ts`) — the unlocked account's `settings.json` /
  `secrets.json`. Every key is reachable with `config set a.b value`.
  > ⚠️ **Every key must exist in `DEFAULT_SETTINGS`.** `settings.set()` throws on
  > an unknown key — add the default with the type, even for an empty record.
- **Undo** (`core/undo.ts`, `deck.history`) — one history for ⌘Z / ⌘⇧Z. The
  settings store records every `set()` (except `session`, `setup`, `vault`,
  `plugins`, `fxByTheme`), merging quick changes to one key (a slider, a drag)
  into one step; the vault records trash and renames, `vault.recordCreated(path)`
  a new file. Anything else: `deck.history.record({ label, undo, redo })`;
  several changes as one step: `history.group(label, fn)`; automatic changes that
  shouldn't be undone: `history.quiet(fn)`. The workspace gives ⌘Z to the focused
  pane first (a note's editor has its own), then to the history.
- **The guided tour** (`workspace/tour.ts`) — an overlay: a list of steps, each
  lighting a part of the screen (`ws.rects`) while UPLINK's bubble explains.
  Starts after the setup and with `tour`; puts the tree, shell and panel back.
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
same name, add it to `CORE_IN_TERMINAL` (`shell/systerm.ts`), like `reboot`, `logout` and `login`.

A command that asks (`ctx.read`) or works for a while should still listen to `ctx.signal`, but
it doesn't have to: ^C (ctrl+C, ⌘X on a Mac) stops it at once — `exec.ts` gives the prompt back
with status 130 and drops whatever the command prints after that.

**An app** — implement `App` (`apps/types.ts`: `title()` + `render()`, then
`onKey` / `onText` / `onAction` / `menu`), export an `AppSpec`, register it in
`Deck.registerCore()`. Make it a page (no tab) by adding its kind to `Workspace.PAGES`.

**Finding anything** — `deck.catalog` (`core/catalog.ts`) reads every registry and
describes each thing the same way: kind, id, name, one line of doc, who provides it,
how to call it. The CATALOG page, `catalog <kind> [words] [--json]` and
`ib.catalog.list()` are three views of it. A new kind of thing = a registry + one
`case` in `Catalog.of()`.

**Calling another part** — modules and the deck's own parts expose functions
(`src/plugins/services.ts`, `src/plugins/core-services.ts`, `src/plugins/frame-services.ts`):
`deck.use("tree").reveal(path)`, `deck.use("todo").add("…")` — in a module,
`ib.use(…)`. Add a function to the frame in `frame-services.ts` (one line: `doc`
+ `fn`, and `needs` if it touches the user's machine); it appears in `modules api`.

**Making the deck talk** — `deck.speak(topic, text)`: one place decides whether
the voice may say it (Settings → VOICE → say aloud). Add a topic to `VoiceTopic`
(`deck.ts`), its default in `voice.speak` (`core/settings.ts`), a toggle in
`apps/settings.ts`.

**A widget** — a `WidgetSpec` (`widgets/types.ts`): `size`, `min`, optional `max`,
`render`, and `popup` / `activate` / `open` for what Enter does. `clickActivates`
makes one click run `activate` (the shortcut squares, 1×2). A widget can be placed several
times (HOME and the side panel): each copy has a key (`"clock"`, `"clock#2"`) in
`ctx.key`; read a copy's own settings with `widgetConfig(deck, ctx.key, name,
fallback)` and change them with `setWidgetSetting` (`widgets/instances.ts`) —
the copy whose pop-up is open (or that's selected) is the one a command changes.
HOME places widgets exactly where they're put (no gravity); edit mode is the
workspace's (`ws.editing`), shared by HOME and the side panel.

**An overlay** (a dialog, a menu) — implement `Overlay` (`workspace/overlays.ts`)
and `deck.workspace.push(new MyOverlay(…))`. Set `done = true` to close.

**A shortcut** — a line in `core/shortcuts.ts` (it shows on the SHORTCUTS page).
With an `id`, `cmd` and `global: true`, the key works everywhere with no other
code, and the user can change it (`settings.keyOverrides[id]`, `keys set`, F2 on
the SHORTCUTS page, Settings → KEYS). Without a `cmd`, add its function to
`Workspace.keyActions`. Pick the letter that says what it does. `menuKey: "x"` (and
`short`, a short name) puts it on THE MENU too: x, then enter.

**A setting** — its default in `DEFAULT_SETTINGS`, a row in `apps/settings-rows.ts` (rows reach the page through `deck.prefs`; a module's come from `ib.settings.register`)
(`toggle`, `cycle`, `slide`, `text`, or a custom row with a `kind`: toggle ·
choice · text · action · slider · info), one sentence in `apps/settings-help.ts`
(English + French). Keep the value short: the page shows the value on the right
and its controls (‹ ›, ✎, ›, ↺) only on the row you're on; a changed row gets a
▎ on the left, del puts it back, the button bottom right resets the category.

**The docs in the vault** — \`src/vault/starthere.ts\` holds the notes every vault
gets: START HERE/ in English, and in French in \`src/vault/starthere-fr.ts\` (same
file names, so links and stamps hold). **Update them with every change the user can
see — in both languages.** They sync at every start and when the deck's language
changes: missing notes are written, untouched ones replaced by the new version (or the
other language's), ones the user edited kept (\`starthere --force\` rewrites them), ones
the user deleted stay deleted. The Welcome note follows the language the same way
(Welcome.md ⇄ Bienvenue.md, renamed only while untouched). FOR DEVELOPERS/ (English
only) isn't in a new vault: \`starthere dev\` writes it, then it syncs like the rest.
The notes are written with Mac keys and zsh; \`forThisOS\` rewrites them for Windows
and Linux (Ctrl+, the system's shell, one form when both were the same).

**A translation** — wrap UI text in `t("English")`, add the line to
`core/i18n-fr.ts`. Missing keys simply show in English.

**A theme / a module** — see [THEMES.md](THEMES.md) and [PLUGINS.md](PLUGINS.md);
no rebuild needed. How to make them well (names, file layout, exposing an API
others can build on, settings, data, a theme's contrast):
[GUIDELINES.md](GUIDELINES.md).

---

## 7. One thing, one piece of code

Before writing something, look for the piece that already does it, and give it
an option instead of a copy: one `FileBrowser` (vault folders, picking a file on
the computer), one `FilterBar` (search + colours for MODULES, NEXUS, the file
browser…), one `WheelSpin` (every ring), one `slider`, one `KeyCapture` (every
"press the keys" moment), one TRASH page, one SHORTCUTS page, `deck.speak` for
everything the voice says, `deck.use()` to call any part. Modules get the same
pieces through `ib.lib` (`FilterBar`, `WheelSpin`, `ListView`…).

## 8. Traps worth knowing

- `settings.set()` throws on keys missing from `DEFAULT_SETTINGS` (see §5).
- Modal overlays get raw keys, not Actions (see §4).
- Hits: last registered wins (see §4).
- **Import cycles** are forbidden (`tests/imports.test.ts` fails on one). Shared helpers go in small files that import nothing of theirs (`core/time.ts`, `ui/fileicon.ts`), lists of things are put together in an `index.ts` (`widgets/index.ts`). Watch
  apps ↔ widgets. Shared state goes in small dependency-free files
  (`widgets/clockstate.ts`, `core/time.ts`); apps don't import `widgets/popups`.
- The browser preview (`npm run dev`) has no native side: no system terminal, no
  Google, no file drop, no real login. `window.deck` is exposed there for testing:
  `await deck.act("panel show")`, `deck.errors.list`…
- Every UI action should be a shell command (`cmd` on hits, `deck.act()`): it's
  how the history, macros, key bindings and THE MENU can reuse it.

---

## 8 bis. Who is asking: the rule behind every safety check

Three things can ask the deck to do something, and they aren't trusted the same:

| who | how it's known | what it may do |
|---|---|---|
| **you** — typing in ibsh, clicking, a key, THE MENU | no origin | everything |
| **a module** — `ib.shell.run`, a click on one of its areas, a function it calls (`ib.modules.call`, `ib.use`) | an `Origin { source, grants }` that travels with the line for its whole run (`src/shell/origin.ts`) | never the privileged commands (`src/shell/privileged.ts`); a STORE / vault module reads, pipes and writes notes only with its permissions, never `.icebreaker/` |
| **a program in your real terminal** (the bridge, `term.rs`) | origin `"terminal"` | never the privileged commands; nothing at all on an encrypted vault |

What each may reach is named ([PERMISSIONS.md](PERMISSIONS.md), `src/plugins/permissions.ts`):
a module's `grants` are the permissions you approved minus the ones you took away, read at
every question (`Grants`), sometimes narrowed to a folder or a host; a high-risk one passes
through `origin.gate` the first time it's really used; every use goes to the access journal
(`origin.note`, `src/core/access.ts`). The AI has its own setting (`ai.reads`), your real
terminal too (`shell.bridge`).

Rules to keep when you add code:

- **A new command is classed** in `src/shell/classes.ts` (open, mixed, notify, ai, online,
  yours) — `tests/classes.test.ts` fails until it is; unclassed, it's refused to modules.
- **A new function exposed to modules says what it needs** (`needs: "shell"` when it drives
  the deck, `"notify"` when it shows or says something, `"vault:read"` when it tells what
  you're looking at) — and signs what it shows with the caller's name.
- **A new way out to the internet** on the native side starts with `config::online(&app, …)?`
  (stealth mode), and a new one for modules goes through `ib.net` (a named host).

- A command never calls `deck.act()` or `deck.shell.runLine()` blindly for someone else: it gets a
  `ctx.deck` that already keeps the origin, and `ctx.shell.run()`. A new command that plants
  something for later (a key, a button, a setting that holds a command) goes in `privileged.ts`.
- A function exposed to modules (`ib.modules.expose`, `frame-services.ts`, `core-services.ts`) that
  runs a command line uses `line(…)`: the line runs as its caller, and every argument is quoted.
  One that gives or changes your data says which permission it `needs`.
- The native side (`vault.rs` `guard`) compares names the way disks read them (`store::fold`):
  never `==` on a path that must not be one of the deck's own files.
- Anything a file brings (a vault from elsewhere, a settings file, a module's `plugin.json`) is
  checked as if someone else wrote it: `core/settings.ts` `limitSetting`, `account.rs`
  `plain_safe`, `plugins/host.ts` (id, permissions approved, code fingerprint).

`tests/origin.test.ts`, `tests/privileged.test.ts` and the Rust tests keep these; the three
modules in `tests/sandbox/` replay the attacks in the app ([SECURITY_AUDIT.md](SECURITY_AUDIT.md)).

## 9. The native side (`src-tauri/src`)

| File | What |
|---|---|
| `lib.rs` | the Tauri builder: plugins, every command registered; on macOS lifts WebKit's 60 fps preference (ProMotion) |
| `vault.rs` | the vault: list, read, write (text, or bytes: `vault_write_bytes`), rename, trash, import; the path guard; the same commands on an encrypted vault (through `store.rs`), unlock / lock, `vault encrypt` / `decrypt` / `export` |
| `store.rs` | an encrypted vault on disk: `.icebreaker-vault/` = key file, encrypted index, encrypted blobs; recovery after a crash; encrypt / decrypt / export with backup and checks |
| `term.rs` | the PTY (your shell) and the bridge that lets it run deck commands (`POST /run` streams the output, errors in red; `GET /status/<id>` gives the exit code back to `$?` and the prompt); shell hooks for zsh, bash, fish, PowerShell |
| `files.rs` | read-only access to the computer for the deck's file picker |
| `config.rs` | settings and secrets files |
| `crypto.rs` | vault encryption: vault key, Argon2id-wrapped `vault.key`, the `IBX1` file format (XChaCha20-Poly1305), atomic writes — see `docs/ENCRYPTION.md` |
| `recovery.rs` | the recovery key: 24 words (BIP39 list) ↔ 256 bits, forgiving to type back |
| `account.rs` | the accounts: Argon2id hashes, the unlocked one (session), each one's folder of settings; portable vaults (the vault's account card and settings copy, *open a vault*, recovery from another computer) |
| `voice.rs` | text to speech (sherpa-onnx / piper, system voices) |
| `appupdate.rs` | ICEBREAKER updating itself (tauri-plugin-updater): check, download, install — signed updates only (docs/UPDATES.md) |
| `dev.rs` | developer tools (`factory-reset`): only in builds with `--features dev-tools` — `dev_tools_available` tells the UI, which registers `factory-reset` only then (a release doesn't have the command at all) |
| `media.rs`, `audio.rs` | what's playing (Spotify…), local music |
| `google.rs` | Google OAuth (PKCE) and the Calendar API |
| `net.rs` | `net_get` for the STORE and modules (https, LAN http) |
| `system.rs` | CPU, memory, uptime for SYSMON |
| `claude_code.rs` | runs the Claude Code CLI for UPLINK |
| `dev.rs` | developer helpers |

---

## 10. AI

`ai/types.ts` defines a provider-neutral `ChatSession`. `ai/anthropic.ts` uses the
official Anthropic SDK (streaming, tool use, prompt caching); `ai/claudecode.ts`
drives the Claude Code CLI; `ai/ollama.ts` talks to a local Ollama.
`ai/tools.ts` gives the model `list_notes`, `search_notes`, `read_note` and
`write_note` (the last one always asks you first). Stealth mode refuses cloud providers.

---

## 11. Checking your work, releasing

`npm run check` = the types (`tsc`), the tests' types, then the unit tests
(`vitest`, in `tests/`: shortcuts, the shell parser, settings and their
migrations, the command registry, the scroll glide, the module audit, and **no
import cycles**). Add a test with each fix you can test without a screen.
`cd src-tauri && cargo test` checks the native side (the vault's walls).

```bash
npm run check          # types (also covers plugins/)
npm run dev            # the UI in a browser, demo vault, window.deck to poke at
npm run app            # the desktop app, hot reload
cargo check --manifest-path src-tauri/Cargo.toml
cargo test  --manifest-path src-tauri/Cargo.toml
npm run app:mac        # a signed .app for your own Mac, WITH the developer tools: testing only
npm run app:mac:release  # the macOS app to publish (no developer tools) — docs/UPDATES.md
```

A release: bump the version in `package.json`, `package-lock.json`,
`src-tauri/tauri.conf.json` and `src-tauri/Cargo.toml`; a section in
`CHANGELOG.md`; tag `vX.Y.Z` and push the tag — CI builds the Windows and Linux
installers and attaches them to the GitHub release (macOS builds on demand).
