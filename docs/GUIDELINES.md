# Guidelines: building a module or a theme the ICEBREAKER way

How to write something other people can **use, read, call and borrow from**.
[PLUGINS.md](PLUGINS.md) says *what* the API offers and [THEMES.md](THEMES.md)
the theme format; this page says *how* to use them well. Follow it and your
module feels like part of the deck, and other modules (and the user's own
keys, macros and scripts) can build on it.

---

## The seven rules

1. **Everything is a command.** Whatever your UI does, a shell command does it
   too, and the UI runs that command (`ui.hit(rect, { cmd })`, `ib.shell.run`).
   Then the user can bind it to a key, put it on THE MENU, use it in a macro, a
   script or a HOME square, and it shows up in the LOG.
2. **Everything is callable.** Expose your module's useful functions
   (`ib.modules.expose`) so others can `ib.use("<your id>").fn()`. Do the same
   for what your module knows: if you can read it, others should be able to.
3. **Everything is readable.** Each command has a `summary`, a `usage` and, if
   it helps, `examples`. Each exposed function has a one-line `doc`, and each
   setting a `help` sentence. `modules api`, `man`, `help` and Settings show
   them, so nobody has to read your code to use it.
4. **One thing, one place.** Before writing a piece, look for the one that
   already exists (`ib.lib`: `ListView`, `FilterBar`, `WheelSpin`, `TextEditor`,
   `slider`…) and use it. If it almost fits, ask for an option instead of
   copying it.
5. **The theme decides the look.** Colours come from `ui.c` (`accent`, `fg`,
   `muted`, `subtle`, `faint`, `panel`, `success`, `warning`, `error`…). Never
   write a hex colour in a module: the user's theme (and e-ink, and the
   high-contrast themes) must still work.
6. **Offline, private, polite.** It works without internet, account or AI (or
   says clearly what needs them). Ask only for the permissions you use, and
   keep data in the user's vault in a format a human can read.
7. **The user is in charge.** Your quick keys, shortcuts and settings can all
   be changed. Never steal a key the deck or the user already uses, and always
   give a way back to the default.

---

## A module, file by file

A small module fits in one `main.js`. As it grows, split it so each file does
one thing. The same names in every module make it easier to find your way
around somebody else's code:

```
plugins/mymodule/
  plugin.json     id, name, version, description, permissions, icon
  main.ts         activate(ib): only wiring, it calls the files below
  store.ts        your data: load / save (ib.storage or Markdown in the vault)
  commands.ts     the `mymodule …` command (the source of truth)
  api.ts          what you expose: ib.modules.expose(…)
  app.ts          the page (an App)
  widget.ts       the HOME / side-panel widget
  settings.ts     ib.settings.register([...])
  README.md       what it does, what it needs (network? an account?)
```

The data flows one way: **UI → command → store → UI redraws**. The app and the
widget never change the data themselves, they run the command.

### Names

- **Ids** are short, lowercase and stable: `todo`, `weather`. Never rename a
  published id: people's keys and scripts use it.
- **Commands** start with your id: `todo add`, `todo done 3`. Verbs are plain
  English: `add`, `rm`, `list`, `open`, `set`.
- **Exposed functions** are verbs that return plain data (JSON: strings,
  numbers, arrays, objects). No class instances or UI objects: a caller may be
  a script.
- **Palette / menu entries**: `id: "mymodule.thing"`, a title that reads like
  an action ("todo: add…").

### Case: the interface is lowercase

Everything the interface writes is **lowercase**: titles, tabs, buttons, menus, hints,
card headings, dialog text, **module names** (`todo`, `nexus`, `uplink`, not TODO,
NEXUS, UPLINK). Kept as they are:

- **ICEBREAKER**, the logo;
- **acronyms**: AI, API, CPU, RGB, URL, USB, OK…;
- **key names** as the OS writes them: ⌘K, F1, Ctrl+K;
- **proper names**: Claude, Google Calendar, Obsidian, a city…;
- **the user's content**: a note's name, a folder, what they typed, an event's title.

What goes through `t()` is lowered for you (`core/i18n.ts uiCase`, before `{vars}` are filled
in, so a name in a variable keeps its case), and a right-click menu lowers each label's first
word. Write your strings lowercase anyway: a string drawn without `t()` is drawn as written.
Never `.toUpperCase()` a title for style. A new acronym or proper name the lowering would
break goes in `KEEP_CAPS` / `PROPER` (`core/i18n.ts`).

### Your API is a promise

Once you publish a function, keep it working. Add new functions instead of
changing old ones. If you really must change one, keep the old name working
for a version and say so in its `doc`. A function that touches the user's
machine or data declares `needs` (a permission), so calling it is never a way
around permissions.

```ts
ib.modules.expose("add", {
  doc: 'add(text, due?) → the new item\'s id ("tomorrow", "2026-12-01"…)',
  needs: "vault:write",
  fn: (text: string, due?: string) => store.add(String(text), due),
});
```

### Settings

Register them with `ib.settings.register` and give each one a `default` and a
`help`, so a "back to default" button can bring it back. Pick the right type:
`toggle` (a box to tick), `choice` (a few values: `options`), `text`, `number`,
or `action` (a row that opens or does something: `cmd` or `run`, and `value()`
for a short status like "connected"). Keep the values short: Settings shows
one word or two, never a sentence.

### On THE MENU

`ib.palette.register({ id, title, run, key })` puts your action in the search,
and with `key` gives it a menu key (⌘K, that key, enter). Only ask for a
quick key for something people do several times a day. If the key is taken,
yours simply doesn't appear, so tell the user in your README how to add it
themselves (`menu add <key> "<command>"`).

### Drawing

- Implement `onAction` first (`up`, `down`, `confirm`, `back`…): keyboard,
  gamepad and on-screen keyboard then work at once.
- `render` runs every frame you're visible. Keep it cheap, cache anything slow,
  and call `ui.animate(ms)` only while something moves. Respect
  `appearance.reduceMotion`.
- Mouse areas: **the last `ui.hit` registered wins**. Register a row first,
  then the buttons on it.
- Show less. The value, not its explanation: the explanation goes in a `tip`
  (on hover) or in `help`. Controls (arrows, ✎, ×) only appear on the row
  you're on.
- Text goes through `ib.lib.t("English")`, and you add your translations with
  `ib.lib.addTranslations("fr", {...})`.

### Data

| what | where |
|---|---|
| the user's own writing (notes, events, lists they'd want to read) | the vault, as Markdown (`ib.vault`) |
| your module's state (cache, positions, ids) | `ib.storage` (one JSON file per module) |
| settings | `ib.settings` |
| numbers over time | `ib.stats` |
| secrets, tokens, other people's data (Google…) | never in the vault (the native side keeps them) |

---

## Borrowing from other modules

- **Call, don't copy.** `await ib.use("todo").add("…")` instead of writing
  your own todo list. The BLOCKS page (`blocks`), `catalog function` and
  `ib.catalog.list("function")` list everything callable, with how to call it.
- **The deck's own parts** are callable the same way: `tree`, `terminal`,
  `shell`, `theme`, `home`, `panel`, `tabs`, `notes`, `sound`, `menu`, `keys`,
  `deck` (see the table in [PLUGINS.md](PLUGINS.md#calling-anything-ibuse)).
- **Share building blocks.** If you wrote a piece that others could use (a
  chart, a parser), expose it or propose it for `ib.lib`.
- **Check before calling.** `ib.modules.has("music", "status")`: the user may
  have switched that module off.

---

## A theme

A theme is one TOML file ([THEMES.md](THEMES.md)). A good theme:

- **Is readable first.** `fg` on `bg` and on `panel` must be easy to read for a
  whole evening; `muted` is still readable, `subtle` is for hints and `faint`
  only for lines and grids. Check a long note, the settings and the shell.
- **Has one accent.** `accent` says "this is the thing you're on / can act
  on". `accentAlt` is for the occasional second level. `success` / `warning` /
  `error` keep their meaning, whatever the palette.
- **Works without its effects.** Try it with bloom, scanlines and glow at 0:
  the look must still hold. Effects are seasoning.
- **Gets the details right.** A `sound` pack that fits, a `background` that
  isn't tiring after an hour, a name and a one-line `description`.
- **Is tested** on HOME, a note, the settings, MODULES, NEXUS, the shell and a
  dialog, at 100 % and at a big interface scale.

A sound pack of your own (files, not synthesized): [SOUND_PACKS.md](SOUND_PACKS.md).

---

## Before you publish

- [ ] Every action has a command, and the UI runs it.
- [ ] `yourcmd -h` explains it, with examples.
- [ ] The useful functions are exposed, with a `doc` line and `needs` where it matters.
- [ ] Settings have a `default` and a `help`.
- [ ] No hex colours, no hardcoded keys, no text outside `t()`.
- [ ] Works offline / in stealth mode, or the README says what needs the network.
- [ ] Only the permissions you use are in `plugin.json`.
- [ ] Tried with a light theme, e-ink and a big interface scale.
- [ ] README: what it does, its commands, what it exposes, what it needs.
