# Writing plugins

> Before you start: [GUIDELINES.md](GUIDELINES.md), the house rules for a
> module (or a theme) that others can use, read, call and borrow from.

A plugin is a folder in your vault:

```
<vault>/.icebreaker/plugins/hello/
  plugin.json
  main.js
```

Fastest start: run `plugin new hello` in the shell — it writes both files and
opens `main.js`. Edit, save, `plugin reload`.

## Everything is a module

Only the frame is core: HOME, notes and the editor, the file tree, the command
engine (ibsh runs every command, even with no terminal on screen), settings, setup
and the STORE. **The terminal itself is a module** (TERMINAL: the shell panel, your
real terminals, `term`, `script`): switched off, there's no panel, and what a command
asks comes as a dialog. Everything else is a module — the ones that ship
with the deck too (`src/plugins/core-packages.ts` packages the features written in
the core; `/plugins` holds the bundled plugins). They all go through the same
host: `plugin enable / disable`, `store remove / install`. Your module can be
an app, a command, a widget, a theme background, or one small tweak: set
`"launcher": false` in `plugin.json` to keep a widget-only module out of the
MODULES hive, and `"icon"` to give it a glyph there.

**In the STORE**: every module that ships with the deck is listed in the official index
with `"builtin": true` — installing one puts the deck's own copy back (nothing is
downloaded; an older deck is told to update). The bundled ones' source is in the index's
`modules/<id>/`. After changing a bundled module or a core package, refresh the index:
`node scripts/pack-store.mjs <checkout of icebreaker-modules>`, then `node
scripts/check-index.mjs` there, commit, push.

## Where your module runs

A module from the STORE or a vault runs in a **sandbox** (a Worker): it reaches the deck
only through `ib`, call by call, checked against its permissions — no page, no native
side, no network functions of its own. You write it exactly the same way; the few calls
not there yet say so clearly (list: [SANDBOX.md](SANDBOX.md)). Draw with the deck's own
pieces (`ib.lib.Field`, `ib.lib.checkbox`, `ib.lib.ListView`, `ib.lib.Row`…:
[UI_KIT.md](UI_KIT.md)) and its spacing rules ([LAYOUT.md](LAYOUT.md)).

## plugin.json

```json
{
  "id": "hello",
  "name": "Hello",
  "version": "0.1.0",
  "description": "What it does, in one line",
  "author": "you",
  "permissions": ["vault:read", "vault:write", "ai"],
  "requires": { "todo": ">=0.1.0", "icebreaker": ">=0.4.0" }
}
```

**`requires`** — what your module needs: other modules by id with the lowest version that
works (`"*"`: any), and `icebreaker` for the deck itself. `store install` installs them
first (after asking), `plugin enable` switches them on first, they wake up before yours
(so `ib.modules.call` works in `activate`), and switching off or removing one of them
asks first and takes yours along. Not met: your module stays off, and `plugin ls` / `store
info <id>` say what's missing (src/plugins/deps.ts). The index entry can carry the same
`requires`, so the STORE says it before downloading.

**Updates**: a module installed from a repo remembers where (`source`); `store update`
compares versions there, Settings → UPDATES does it by itself (docs/UPDATES.md). Raise
`version` in plugin.json when you publish a new one.

| permission    | allows                                              |
|---------------|-----------------------------------------------------|
| `vault:read`  | `ib.vault.read / exists / notes`, `ib.ai.vaultTools()` |
| `vault:write` | `ib.vault.write / append / mkdir`                   |
| `ai`          | `ib.ai.ask / session` (uses the user's provider)    |
| `media`       | `ib.media.status / control` (the system player), `ib.media.player.*` (local files) |
| `google-calendar` | `ib.google.*`: the user's Google Calendar, through their own OAuth client |
| `stats:read` | `ib.stats.get/series/list` on *other* modules' stats (your own need no permission) |
| `terminal` | `ib.use("terminal").run / write`: type commands in the user's real shell |
| `audio` | `ib.audio.*`: play sound of its own through the speakers (a sampler the deck mixes) |

Plugins from the vault are **off** until the user runs `plugin enable <id>`,
which shows the permissions and asks for confirmation. Calling an API you
didn't declare throws an error.

> Honesty note: modules from the STORE and the vault run in a **sandbox** (a Worker: no page,
> no native access, no network of their own; every `ib` call checked against the permissions —
> [SANDBOX.md](SANDBOX.md)). Within their permissions they can still do damage (a module
> allowed to write notes can overwrite them). Read the code before enabling something (it's
> one `main.js`): the deck shows what it found in it first (`plugin audit <id>`). Modules not
> reviewed in the official STORE are marked **not verified** ([COMMUNITY.md](COMMUNITY.md)).

## main.js

```js
export function activate(ib) {
  // shell command
  ib.commands.register({
    name: "wordcount",
    summary: "words in every note",
    async run(ctx) {
      for (const path of ib.vault.notes()) {
        const words = (await ib.vault.read(path)).split(/\s+/).filter(Boolean).length;
        ctx.out(`${String(words).padStart(6)}  ${path}\n`);
      }
    },
  });

  // on THE MENU (⌘K): found when searching, and "!" + enter runs it
  ib.palette.register({ id: "hello.say", title: "Say hello", key: "!", run: () => ib.ui.notify("hello!") });

  // an app in a tab
  ib.apps.register({
    kind: "hello",
    title: "Hello",
    icon: "✦",
    launcher: true, // tile on the MODULES page
    create: () => ({
      kind: "hello",
      key: "hello",
      title: () => "hello",
      render(ui, rect, focused) {
        const inner = ui.box(rect, { title: "HELLO", focused });
        ui.gradientText(inner.x + 2, inner.y + 1, "jacked in.");
      },
      onAction(a) { if (a === "confirm") ib.ui.notify("A pressed"); return a === "confirm"; },
    }),
  });
}

export function deactivate() {}
```

### A widget on the HOME grid

```js
ib.widgets.register({
  id: "quote",                  // becomes "hello.quote"
  title: "quote",
  size: { w: 4, h: 3 },         // grid units: 12 columns wide, 1 row = 2 text lines
  min: { w: 3, h: 2 },
  render(ui, rect, { focused }) {
    ui.textCenter(rect, rect.y + 1, "the street finds its own uses", { fg: ui.c.muted });
  },
  open: "hello open",            // the module this widget belongs to
  popup: {                      // enter / double-click / pad A on HOME opens it
    title: "quote",
    size: { w: 50, h: 6 },
    hint: "space: another one",
    render(ui, rect, { close }) { ui.textCenter(rect, rect.y + 2, "…", { fg: ui.c.fg }); },
    onText(t) { if (t === " ") { ib.shell.run("hello quote"); return true; } return false; },
  },
});
```

**Enter, double-click and the gamepad's A** on a HOME widget follow one rule:
its `popup` if it has one (the widget, bigger and usable — add a city, quick-add
a task…), else its `activate()`, else its module (`open`). A pop-up always gets
an "open <module>" button (enter) and closes with esc / B. Give the pop-up keys
(`onText` / `onKey` / `onAction` — return true when you used it) and make every
button a command (`ui.button(x, y, label, () => {}, { cmd: "hello quote" })`).
`widget <id>`, `widget <id> open` and `widget <id> do` drive the same from the shell.

## Calling anything: `ib.use()`

Other modules **and the deck itself** are objects you call, one line each:

```js
await ib.use("todo").add("walk the dog");          // another module
await ib.use("tree").reveal("notes/ideas.md");     // the file tree
await ib.use("terminal").run("git status");        // the user's real shell (permission "terminal")
const { accent, bg } = await ib.use("theme").colors(); // the theme's colours, #rrggbb
await ib.use("home").link("deploy", "macro run deploy", "⚡"); // a shortcut square on HOME
await ib.use("deck").say("build finished", "modules");   // the voice, if the user lets modules speak
```

Every function returns a Promise. `modules api` in the shell lists them all with
one line of doc; `modules call tree reveal notes/ideas.md` runs one by hand.
Publish your own with `ib.modules.expose("name", { doc, fn, needs })` — then
anybody can `ib.use("<your id>").name(…)`.

| `ib.use(…)` | functions |
|---|---|
| `tree` | `reveal(path)` · `filter(colour \| null)` · `selected()` · `toggle()` |
| `terminal` | `run(cmd)` · `write(text)` (permission `terminal`) · `open()` · `new()` |
| `shell` | `run(line)` (any ICEBREAKER command) · `show()` · `hide()` |
| `theme` | `current()` · `list()` · `set(name)` · `colors()` · `mix(a, b, k)` |
| `home` | `add(widget)` · `remove(widget)` · `page(n)` · `edit(on)` · `link(label, cmd, icon)` |
| `panel` | `add(widget)` · `remove(widget)` · `show(on)` |
| `tabs` | `list()` · `go(n)` · `open(app)` |
| `notes` | `open(path)` · `current()` · `new(folder)` |
| `sound` | `play(name)` (move, open, confirm, back, success, error, notify, alert, tick, select…) |
| `menu` | `open()` · `items()` · `add(key, command)` (THE MENU) |
| `keys` | `list()` · `run(id)` · `bind(keys, command)` (every deck shortcut) |
| `deck` | `notify(text, kind)` · `alert(title, body)` · `say(text, topic)` · `setting(key)` |
| modules | `todo.list/add/done` · `calendar.events/today/add` · `reminders.list/add` · `habits.list/check` · `music.status/control` · `journal.today/append` · `uplink.ask/ready` · `sysmon.stats` · `weather.now` · `news.headlines` · `clocks.timer/stopwatch` · `focus.status/start/stop` · `voice.say` |

Inside the deck's own code it's the same: `deck.use("todo").add("…")` (with every permission).

The user adds it from HOME: `e` (edit layout) then `a`. Widgets render every
frame they're visible: keep `render` cheap, cache anything slow (network, AI)
in a variable, and call `ui.animate(ms)` only if something moves.

The full surface is typed and commented in
[`src/plugins/api.ts`](../src/plugins/api.ts). Highlights:

- `ib.ai.session({ system, tools })` → streaming chat; `ib.ai.vaultTools()` lets the model read notes.
- Widget specs can set `max` (the biggest size), `clickActivates` (one click runs `activate` instead of only selecting) and `frameless` (no frame or title: your `render` gets the whole rectangle — a tile). `onKey(k, ctx)` gets the keys while your widget is selected on HOME or the side panel (outside edit mode): the built-in lists use it for Delete / ⌘⌫ on the line under the mouse — remember which line `ui.hovered()` said during `render`. Prompts take `suggestions` (the ▾ list and Tab completion).
- The user can place your widget **several times** (HOME, the side panel): `render(ui, r, { deck, key })` tells you which copy (`"mywidget"`, `"mywidget#2"`). Keep each copy's settings apart with `ib.lib`'s `widgetConfig(deck, key, name, fallback)` / `setWidgetSetting(deck, id, name, value)` — or key your own state by `key`.
- `ib.storage.get/set` → a private JSON file per plugin (`.icebreaker/plugin-data/<id>.json`).
- `ib.settings.register([...])` → your section in Settings (◇ YOUR MODULE, after the normal ones). Row types: `toggle`, `choice` (`options`), `text`, `number`, and `action` — a row that does something when chosen: `cmd` (a shell command, shown under the row like every setting) or `run()` (a picker, a confirmation…), plus `value()` for the status on the right ("connected", a name…). Read with `ib.settings.get(key)`, react with `onChange`; shell: `modules set <id> <key> <value>`. Example: the CALENDAR module (`plugins/calendar/main.ts`).
- `ib.shell.run(line)` → run a command, shown in the shell's LOG tab (what your clicks should do).
  The line runs **as your module** (`src/shell/origin.ts`), with your permissions: it reads,
  pipes (`|`) and `<` notes only with `vault:read`, writes (`>`, `touch`, `mv`, `rm`, `note`…)
  only with `vault:write`, never touches `.icebreaker/`, and needs `ai` for `ask` / `chat`.
  Never allowed from a module (refused, aliases and `;` / `&&` chains included,
  `src/shell/privileged.ts`): `vault` beyond `status` and `rescan`, `account`, `lock`,
  `self-destruct`, `script`, `macro` (but show / hide), `bind` / `unbind`, `keys`, `menu add`,
  `pin`, `home link`, `plugin` and `store` beyond listing and searching, `update` beyond
  looking, `modules call` / `set`, `stealth off`, `theme install`, `voice install`, `exit`,
  `reboot`, and `config set` of the settings that hold commands or decide what runs
  (`keys`, `menu`, `shell`, `plugins`, `ai`, `privacy`, `updates`, `vault`, `home`, `favorites`…).
- The functions you call (`ib.modules.call`, `ib.use`) follow the same rule: one that runs a
  command (`shell.run`, `home.add`, `clocks.timer`…) runs it as your module; the built-in
  modules' functions ask for a permission (`todo.list`, `reminders.list`, `habits.list`:
  `vault:read`; `todo.add`, `journal.append`…: `vault:write`; `calendar.today / events`:
  `google-calendar`; `music.*`: `media`; `uplink.ask`: `ai`; `terminal.run`: `terminal`).
  `deck.setting(key)` gives a module the look and sound settings only.
- **Your id** is your folder's name: lowercase letters, digits and dashes, never a built-in
  module's. **Your permissions are the ones the person approved** when switching you on, for the
  code they approved: a later version asking for more stays off until they approve again
  (say why in your README). While you write a module, `plugin reload` approves your new code.
- **A page that plays the keyboard** (a piano, a game): `rawKeys: true` in `ib.apps.register({…})` (and on the
  page). While it's in front, letters, digits and space come to `onKey` as keys, never as text, with their
  **place** in `code` (`KeyZ` is Z on QWERTY, W on AZERTY) and `repeat` when held; every **alt** combination is
  the page's too (alt + arrows included, the deck's pane keys on Windows / Linux), and ⌘Z / ⌘⇧Z reach it (its own
  undo). ⌘ / ctrl shortcuts stay the deck's; **esc** leaves the page (the tree takes the keys back).
- `ib.apps.open(kind, args)`: your own pages take any `args`; the deck's pages only a note,
  a folder or a day.
- `ib.ui.confirm / prompt / choose / alert` are headed with your module's name; what your
  command asks in the shell (`ctx.read`) starts with `[your-id]`.
- A module **can't take the deck's own names**: `vault`, `account`, `lock`, `plugin`, `config`,
  `menu`, `keys`, `modules`, `store`, `update`… for its commands; and a module from the STORE
  or the vault can't replace any command, page or THE MENU action of the deck **or of another
  module** (built-in modules still can replace the deck's).
- `ib.vault` can't read or write ICEBREAKER's own files in the vault: `.icebreaker/account.json`,
  `settings.json`, `secrets.json` (the native side refuses them to everyone but itself); and
  `ib.vault.write / append / mkdir` never touch `.icebreaker/` at all (other modules' code,
  themes…): a module's own data goes through `ib.storage`.
- `ib.catalog.list(kind?, words?)` → everything the deck can do, as plain data: commands, actions, shortcuts, settings (with their value), functions (`ib.use`), widgets, apps, themes, modules — each with `name`, `doc`, `from` and `call` (how to call it). `get(kind, id)` for one. The BLOCKS page and `catalog … --json` show the same.
- `ib.ui.notify / confirm / prompt / choose` → talk to the user (`choose` = pick one option from a filtered list; `prompt(title, { suggestions })` adds a ▾ list, a grey completion and Tab to complete). `notify(text, "error")` also lands in the error log with a code — see [ERRORS.md](ERRORS.md).
- `ib.ui.alert(title, body)` → get the user's attention, the way they chose in Settings → NOTIFICATIONS (on screen, sound, the system's notification center — by default only when the deck isn't in front —, read aloud). See the REMINDERS module. The shell: `notify --alert "<title>" [body]`.
- `ib.ui.say(text, topic?)` → the voice says it, only if the user lets that topic speak (Settings → VOICE → say aloud: `calendar`, `reminders`, `timers`, `weather`, `system`; anything else is `modules`).
- `ib.stats` → numbers kept over time, shown by the STATS module and its widget. `define("left", { label: "budget left", unit: "€" })`, `set("left", 412.5)` for a level, `add("pages", 12)` for a counter (adds up per day), `series(id, 30)` → one point per day, `onChange(fn)`. Names without a dot are yours (`left` → `budget.left`); you write only your own, reading another module's stats needs `stats:read`. The deck itself keeps `deck.commands` and `deck.notes`. Stored in the vault (`.icebreaker/stats.json`); recording works even while STATS is switched off.
- `ib.modules` → modules talk to each other. `expose("add", { doc, fn, needs })` publishes a function under your id; `call("todo", "add", "walk the dog")` calls another module's (built-in or downloaded); `has(id, fn)`, `list()`, `installed()`. A function can require a permission from its callers (`needs: "vault:write"`), so calling it is no way around permissions. In the shell: `modules api` lists everything, `modules call <module> <fn> [args…]` calls it. Built-in today: `journal.today/append`, `uplink.ask/ready`, `sysmon.stats`, `weather.now`, `news.headlines`, `clocks.timer/stopwatch`, `focus.status/start/stop`, `voice.say`, `todo.list/add/done`, `reminders.list/add`, `calendar.events/today/add`, `music.status/control`.
- `ib.settings` → your module's settings, shown in Settings under MODULES with your name: `register([{ key, label, type: "toggle" | "choice" | "text" | "number", options, default, help }])`, `get(key)`, `set(key, value)`, `onChange(fn)`. Shell: `modules set <id> <key> <value>`.
- `ib.ai` is the UPLINK module's AI: when the user switches UPLINK off, there's no AI for anyone.
- `ib.vault.readBytes(path)` / `writeBytes(path, bytes)` → binary files (a song, a sample, an export), 256 MB at most, with `vault:read` / `vault:write` like the rest of `ib.vault`; `ib.vault.list(dir)` → a folder's files of every kind (`{ path, name, isDir, size, modified }`, `vault:read`; never inside `.icebreaker/`).
- `ib.audio` → **sound of your own** (permission `audio`), for a tracker, a drum machine, a game. Your module has no
  sound in its sandbox: the deck mixes for you (an AudioWorklet, `src/core/mixer.ts`). Load a mono sample once —
  `await ib.audio.sample("kick", data, { loopStart, loopLength })` (floats -1…1, `Int8Array` like an Amiga, `Int16Array`,
  or `Uint8Array` unsigned 8-bit) — then send **events dated on the audio clock**:
  `ib.audio.schedule([{ at: (await ib.audio.now()) + 0.1, voice: 0, play: "kick", rate: 8363, volume: 0.8, pan: -1 }])`.
  `rate` is how fast the sample is read, in its frames per second (its recording rate = its own pitch); `interp: "none"`
  plays it stepped, with the grit of the Amiga's Paula chip; `{ voice, stop: true }` silences a voice; an event without
  `at` happens now (a key played live). Compute a song ~100 ms ahead and it never stutters. `stop()` silences all your
  voices; `onStop(fn)` tells you when the **user** silences you (`audio stop`, the ♪ in the status bar) — stop your
  song there too, or the next notes start again; **`stream()`** gives you a line for sound **you compute yourself**
  (a whole mix: samples, synths, effects — any instrument): `const s = await ib.audio.stream(); s.onPull = (frames) =>
  s.write(left, right)` (two `Float32Array`s of `frames` frames at `s.rate`). The deck asks whenever fewer than ~16 ms
  wait, so a key played on your piano is heard ~30 ms later; a song is computed as it plays, an export the same code
  faster than real time. Example: `sbxaudio stream` in `tests/sandbox/sbx-audio/`; `drop(id?)` forgets samples, `decode(bytes)` turns an audio file (wav, aiff, mp3, m4a, ogg — what the system
  reads) into `{ rate, channels }`. Limits: 64 voices, 32 MB of samples, events 30 s ahead at most, 8192 per call.
  Everything stops when your module is switched off; the volume is the user's (Settings → SOUND → Modules) and the
  status bar shows ♪ your name while you play (a click silences you). Example: `tests/sandbox/sbx-audio/`.
- `ib.media.player` → play local audio files (permission `media`); `ib.google.*` → the user's Google Calendar (permission `google-calendar`; keep Google data in `ib.google.cache`, never in the vault).
- `ib.lib.t("English text")` → the user's language (English or French); add your own French with `ib.lib.addTranslations("fr", { "Add": "Ajouter" })`.
- `ib.lib` → the same building blocks the core uses: `TextEditor`, `ListView`, `FilterBar` (search + colours: `matches(text, tag)`, `onText/onKey/render`), `WheelSpin` (a ring's feel),
  `ChatView`, `bigText`, `fmt` (ANSI colors), color helpers, attribute flags,
  and `dates` — the deck's one way to read a day and a time: `dates.parseDay("tomorrow" | "fri" | "+3d" | "24/12")`,
  `dates.parseTime("18:00" | "9h" | "7pm" | "midi")` (minutes), `dates.parseDuration("+1h" | "30min" | "1h30")` (minutes),
  `dates.parseWhen("demain 9h" | "+1h" | "1h" | "19:00" | "fri 6pm" | "24/12 9:00" | "dans 1h" | "à 19h")` (a Date, or null
  when a word isn't a time), `dates.readWhen(words)` → `{ day, time, inMinutes, rest }` (rest: the words that say no
  time — a title), `dates.ymd(d)`, `addDays`, `startOfDay`, `WEEKDAYS` (English and French). "1h"…"6h" alone mean
  "in that long"; with a day, or from 7h on, a time of day. Use it instead of your own parser: "demain 9h" then
  means the same in every module.
- `ib.history.record({ label, undo, redo })` → ⌘Z: record how to take back what your module just changed for the
  user (a task added, an item ticked), so ⌘Z undoes the last thing done and not something older elsewhere. `undo` and
  `redo` run with recording paused. The bundled modules snapshot their data at each save (see `plugins/todo/main.ts`).
  Modules in the sandbox can't record yet.

Inside `render(ui, rect, focused)` you get the full drawing toolkit
([`src/ui/ui.ts`](../src/ui/ui.ts)): `text`, `box`, `fill`, `bar`, `chart`,
`button`, `hit`, `animate`… Call `ui.animate(ms)` to get another frame for animations.

### One feature, one module: the command is the source of truth

ICEBREAKER modules follow one rule: **everything the UI does is a shell
command.** Your app and widget don't change data themselves, they run your
command with `ib.shell.run("mymodule do-thing 3")`, which the shell's
LOG tab shows. Users learn the command line just by clicking around, and power users
get a scriptable module for free.

For plain clicks you don't even need a handler: `ui.hit(rect, { cmd: "todo done 3", tip: "space" })`
runs the command on click and shows it (plus the tip) in a hover tooltip.
Give it a right-click menu with `menu`:

```ts
ui.hit(rect, {
  cmd: `todo done ${id}`,
  menu: () => [
    { label: "done", cmd: `todo done ${id}` },
    { label: "colour", sub: [{ label: "red", cmd: `todo color ${id} red` }] },
    "-",
    { label: "delete", cmd: `todo rm ${id}`, danger: true },
  ],
});
```

A line has `label`, then `cmd` (a shell command) or `run` (a function), and
optionally `hint` (shown on the right), `danger`, `disabled`, `checked`,
`color` or `sub` (a sub-menu). `"-"` is a separator. An app can also have a
`menu()` method: right-click on an empty spot of its page, or the menu key.
`ib.lib.parseFlags` reads `--flags`, `ib.lib.q` quotes an argument safely.

Give your command `usage`, `examples` and `man`: `yourcmd -h` (and `man yourcmd`)
prints them as its help page, for free. Examples are a command line, or
`[command line, what it does]`.

Examples to copy from:

- [TODO](../plugins/todo/main.ts): the reference module. A `todo` command
  (add / done / prio / due / rm / restore…), an app, a HOME widget, data in
  `ib.storage`. No permission needed.
- [STATS](../plugins/stats/main.ts): app + command + widget + pop-up + `ib.stats`.
- [CALENDAR](../plugins/calendar/main.ts): data as Markdown files in the vault, an optional online service (Google) behind a mode, a settings page inside the app, a widget whose pop-up adds events.
- [MUSIC](../plugins/music/main.ts): a native player behind a permission, a library app, a widget with a pop-up.

### Offline first

Every module must work **offline, without an account and without AI**, or say
in its README what needs the network. Users can turn on **stealth mode**
(`stealth on`): then `fetch()` to the internet and the online native calls
(Google, news, installs) fail with a `stealth mode: …` error — catch it and
show your offline face instead of an error screen.

## Sharing

Put `plugin.json` + `main.js` in a public GitHub repo: anyone can then
`plugin install you/your-repo`. Publishing, the community index and review
rules are in [COMMUNITY.md](COMMUNITY.md).
