# Modules and safety

## Where we are

A module is an ES module that runs **inside the deck's own JavaScript**. It gets
the `ib` object (`src/plugins/api.ts`) and the permissions it declared, and the
API checks them: `ib.vault.write` throws without `vault:write`, `ib.use("terminal")`
without `terminal`…

What holds today:

- **The vault is closed.** The native side refuses any path outside it — `..`,
  absolute paths, and links (symlinks) that lead out (`src-tauri/src/vault.rs`,
  `resolve` and its tests). Only your terminal reaches the rest of your computer:
  it's your own shell, with your own rights.
- **The network is closed** by the Content-Security-Policy (`tauri.conf.json`):
  only the AI endpoints, the weather service, the module index and the local Ollama.
- **The API is frozen**: a module can't rewire what another module gets.
- **Modules are read before they run.** Before a module from the vault or the
  store is switched on, the deck looks through its code (`src/plugins/audit.ts`)
  and shows what a well-behaved module never needs: reaching the native side
  directly, building code at run time, loading code, going on the network itself,
  touching the page or the deck's storage, being minified. `plugin audit <id>`
  prints the same report.
- **Modules from the vault start switched off**, and switching one on shows its
  permissions and that report first.

What doesn't hold yet: because a module runs in the same JavaScript as the deck,
a module **written to cheat** could reach the native side around its permissions.
The audit makes that visible; it can't make it impossible.

## The plan: modules in a sandbox

1. **Logic in a Worker.** Each module from the vault or the store runs in its
   own Web Worker: no `window`, no page, no native bridge. `ib` becomes a thin
   proxy that sends messages to the deck, which checks the permissions and does
   the work. Commands, services (`ib.modules.expose`), storage, settings, stats,
   alerts — everything that isn't drawing — works this way unchanged for the
   module (it's already all promises).
2. **Drawing by messages.** Apps and widgets draw with `ui.text / box / fill /
   hit…`. In a Worker, `render` produces a list of those calls; the deck draws the
   last list it received (one frame late — invisible at 60 fps) and sends clicks,
   keys and the wheel back as events. Hit areas carry an id instead of a function.
3. **Built-in modules** (TODO, CALENDAR…) move to the Worker too, one by one,
   which proves the protocol on real modules before anyone else depends on it.
4. **Then** the native bridge can be locked: the deck's own code keeps the only
   handle to it, and the Content-Security-Policy forbids loading code from `blob:`
   in the page.

This is the next big piece of work, together with vault encryption: the agreed
order is in [ENCRYPTION.md](ENCRYPTION.md) (modules from the STORE first).

Until step 4 is done, the rule stays: **only switch on modules you trust, and
read the audit.**
