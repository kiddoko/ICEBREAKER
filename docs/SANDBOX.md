# Modules and safety

## Where we are

**Modules from the STORE and from the vault run in a sandbox** (built 2026-11-20,
`src/plugins/sandbox/`). The built-in modules (TODO, CALENDAR, MUSIC…) ship with
the deck and still run inside it.

### The sandbox

- Each module runs in **its own Web Worker** (`sandbox/worker.ts`), made from a blob
  so the page's Content-Security-Policy applies to it too. Before its code loads,
  the Worker loses everything that talks to the outside or starts more code: `fetch`,
  `XMLHttpRequest`, `WebSocket`, `WebSocketStream`, `EventSource`, `WebTransport`,
  WebRTC, nested `Worker`s, `indexedDB`, `caches`, `BroadcastChannel`, `Notification`,
  `FontFace`, `WebAssembly`. It has no page (`window`, `document`) and no native
  bridge (`__TAURI_INTERNALS__`).
- Its `ib` looks the same as before, but **every call is a message** to the deck
  (`sandbox/bridge.ts`), which runs it on the very same `ib` the module would have
  had in the deck — so every check applies unchanged: its permissions, the names it
  may not take, the vault's own files it may not touch. Only a fixed list of calls
  crosses (`CALLS` in bridge.ts): data in, data out, no function, no handle.
- **What a module has the deck do runs as that module** (`src/shell/origin.ts`): a line
  it runs (`ib.shell.run`, a click on one of its areas, a function it calls that runs a
  command) carries its origin for its whole run — every command of the line and every
  line those run in turn. What only you may do is refused (`src/shell/privileged.ts`:
  the vault's encryption and place, accounts, scripts, macros, shortcuts, THE MENU's
  keys, pins, the STORE, updates, `modules call`…); the line reads, pipes and `<` only
  with `vault:read`, writes only with `vault:write`, never reads or writes
  `.icebreaker/`, and can't `ask` without `ai`. The functions other modules expose ask
  for a permission too (`todo.list`: `vault:read`, `calendar.today`: `google-calendar`…).
- **Never more than you approved, never other code**: the permissions you read when you
  switch a module on are kept (`plugins.granted`), with the fingerprint of its code
  (`plugins.pinned`). If its `plugin.json` asks for more later, or its code changed without
  you (another program or a sync wrote in the vault, another vault holds a module of the
  same name), it stays off until you switch it on again. `plugin reload` (you type it:
  modules can't) and an update you accept approve the new code. Its id is its folder's
  name and never a built-in module's; it can't take another module's commands or pages.
- **It says who it is**: a window it opens is headed "<module> (module) — …", a
  question it asks in the shell starts with `[module]`.
- **Drawing**: the module draws with a real `UI` and the whole kit (docs/UI_KIT.md)
  into a grid of its own; the cells it touched and its click areas go to the deck,
  which copies them into its place (one frame later — invisible). Clicks, keys, the
  wheel and right-click menus come back as messages; a command on one of its click
  areas runs as the module (untrusted), never as you. The deck keeps its own keys
  (shortcuts, esc, tab, F-keys).
- What's there today: `commands` (with `ctx.out / err / read`, `ctx.shell.run`),
  `apps` (pages), `widgets` (and their pop-ups), `palette`, `vault` (read, exists,
  notes, write, append, mkdir — by permission), `shell.run`, `ui` (notify, alert,
  say, confirm, prompt, choose, pickFolder, pickFile, theme, redraw), `storage`,
  `settings.get / set`, `stats` (not `onChange`), `modules.call`, `ai.ask`, `media`,
  `google`, `vault.readBytes / writeBytes`, `audio` (by permission), and all of `lib`.
- **Sound**: a Worker has none. A module with the `audio` permission loads samples and sends
  dated events; the deck plays them (`src/core/mixer.ts`, an AudioWorklet of the deck's own):
  its samples and voices are its own, within limits, silenced when it's switched off. Bytes
  and sound cross as typed arrays (copied), never as handles.
- What isn't yet (a clear error says so): `settings.register`, `settings.onChange`,
  `stats.onChange`, `modules.expose / has / list / installed`, `catalog`,
  `ai.session` / `vaultTools` / `ready` / `problem`, `backgrounds`,
  `media.available`, `google.available / setup`, a widget's `open` command. They need
  a callback across the wall; they come when a module needs them.

### Tested

Two modules written to escape — one with `vault:read` / `vault:write`, one with no
permission at all (`tests/sandbox/sbx-evil`, `sbx-bare`; `sbx-audio` uses sound and binary files normally; how to run them:
[SECURITY_AUDIT.md](SECURITY_AUDIT.md)) — found every door closed, the ones a later review
found open included (`modules.call("shell", "run", …)`, pipes and `>` in the shell,
`.ICEBREAKER/` in capitals, `menu add`, an update asking for more…). The first test, before
that review, had found closed: `fetch`, `XMLHttpRequest`, `WebSocket`, a nested Worker, the Tauri bridge,
`window`, importing code from the network, `factory-reset`, `script` (a program in
your real terminal), reading `.icebreaker/secrets.json` and `account.json`, writing
another module's code, registering a fake `vault` command, calling what isn't on the
list. A module written to work (a command that asks a question and reads a note, a
page with a field, a button, a checkbox and a list, a widget, a THE MENU action)
worked unchanged.

### Still true, for every module

- **The vault is closed**: the native side refuses any path outside it (`..`,
  absolute paths, links that lead out — `src-tauri/src/vault.rs`).
- **The network is closed** by the Content-Security-Policy (`tauri.conf.json`): only
  the AI endpoints, the weather service, the module index and the local Ollama.
- **Within its permissions a module can still do harm**: one allowed to write notes can
  overwrite them; one with `terminal` can type any command in your real terminal (the
  dialog says so).
- **Modules are read before they run** (`src/plugins/audit.ts`, `plugin audit <id>`)
  and **start switched off**; switching one on shows its permissions and that report.

## Next

1. **The built-in modules move into the Worker too**, one by one — it proves the
   missing calls (`settings.register`, `onChange`, `expose`…) on real modules.
2. **Then the native bridge is locked**: the deck's own code keeps the only handle to
   it, and the Content-Security-Policy no longer allows code from `blob:` in the page.
