# Community plugins & themes

ICEBREAKER is meant to be built by its users. Everything beyond the core (apps,
widgets, shell commands, themes) can ship as a plugin or a theme, and installing
one is a single shell command.

**Talking**: [Issues](https://github.com/kiddoko/ICEBREAKER/issues) for bugs,
[Discussions](https://github.com/kiddoko/ICEBREAKER/discussions) for ideas, questions and what
you built — **in English or in French**. The docs and the code stay in English. Who decides
and how releases come: [CONTRIBUTING.md](../CONTRIBUTING.md).

## Installing

The easy way: the **STORE** (◆ icebreaker, top left → store, or `store`). It lists the
modules and themes of every index it knows, shows what each asks for, and
installs, enables, updates or removes them in a click — or a command:

```bash
store                                  # the STORE
store search pomodoro · store install pomodoro · store remove pomodoro
store sources add someone/their-modules            # another index, on GitHub
store sources add https://my-server.example/ib/index.json   # your own server
store sources add http://nas.local/icebreaker/index.json    # a box on your network
```

An index is a JSON list (see below). Host yours anywhere: a GitHub repo, a web
server, a NAS at home — https anywhere, plain http only on your local network.
Entries can point at GitHub (`user/repo`) or at any https folder holding
`plugin.json` + `main.js` (or a `.toml` for themes).

The same, by hand:

```bash
store search pomodoro                      # the STORE's indexes (= plugin search)
plugin install pomodoro                    # by id, from the index
plugin install someone/icebreaker-pomodoro # or straight from any GitHub repo
plugin install someone/repo/tree/main/plugins/x   # a sub-folder works too
plugin enable pomodoro                     # shows its permissions, asks you
plugin update pomodoro                     # fetch the latest version

theme install someone/icebreaker-themes/synthwave.toml
theme set synthwave
```

`install` only downloads the files into your vault
(`.icebreaker/plugins/<id>/`, `.icebreaker/themes/`). Nothing runs until you
`plugin enable` it, and you see what it asks for (vault read/write, AI) first.
It's one `main.js`: read it before enabling.

## Publishing a plugin

1. `plugin new my-thing` in the shell scaffolds `plugin.json` + `main.js` in your
   vault. Build it there with `plugin reload` until it works
   ([PLUGINS.md](PLUGINS.md) documents the whole API).
2. Put those files at the root of a public GitHub repo (or in a sub-folder):

   ```
   plugin.json      required — id, name, version, description, author, permissions
   main.js          required — ES module exporting activate(ib)
   README.md        optional — copied next to the plugin on install
   ```

   Ship plain JavaScript (an ES module). If you write TypeScript, bundle it to a
   single `main.js` first (esbuild / tsup / vite lib mode).
3. Anyone can now `plugin install you/your-repo`.
4. To be in the official STORE — and **verified** — see *Getting your module verified*
   below: the code goes into the STORE's repository through a reviewed pull request.

Tips:
- Ask only for the permissions you use, and the narrowest that do the job: a folder
  (`vault:write:songs/`) rather than the whole vault, `google-calendar:read` when you only
  read. Put `"api": 2` in your plugin.json (you get exactly what you list —
  [PERMISSIONS.md](PERMISSIONS.md)). Plugins that don't need `ai` or `vault:write` get
  enabled more often; a high-risk permission is asked again when you first use it, so say
  in your README why you need it.
- Bump `version` in `plugin.json` when you publish changes; users get them with
  `plugin update <id>`.
- Prefix the ids of your THE MENU actions (`ib.palette.register`) with your plugin id (`pomodoro.start`). Widget and
  app ids are namespaced for you.

## Publishing a theme

A theme is one `.toml` file ([THEMES.md](THEMES.md)). Put it in a repo (a repo can
hold many themes) and share `you/repo/name.toml`. A repo with a single
`theme.toml` at its root can be installed as just `you/repo`.

## The official STORE: verified modules

The official index is [kiddoko/icebreaker-modules](https://github.com/kiddoko/icebreaker-modules)
(`index.json`). **Only maintainers can change it**: every change is a pull request that a
maintainer reviews and approves (CODEOWNERS + branch protection) — nobody can add something
there by themselves. Maintainers are by invitation: the creator alone at first, who invites
people after several good contributions and keeps the last word
([CONTRIBUTING.md](../CONTRIBUTING.md)).

A module is **verified** (✓ in the STORE) when it's listed there **and its code lives in that
repository** (`modules/<id>/`): what was reviewed is exactly what people download, and every
update is a new pull request, reviewed again. The modules that ship with ICEBREAKER are
verified too.

**Not verified** (⚠ in the STORE, and a warning to accept before installing): a module listed
by another index, an entry of the official index pointing to someone's own repository, or
`plugin install user/repo`. Nobody from the project read its code; it can be fine, buggy or
written to harm. It still runs in the sandbox with only the permissions you give it.

### Getting your module verified

1. Build and test it in your vault (`plugin new <id>`, [PLUGINS.md](PLUGINS.md)).
2. Fork `kiddoko/icebreaker-modules`, add `modules/<id>/` (`plugin.json`, `main.js` — readable,
   not minified —, a `README.md` saying what it does, its commands, what it connects to) and
   one entry in `index.json` with `"repo": "kiddoko/icebreaker-modules/tree/main/modules/<id>"`.
3. Open a pull request. A maintainer reads every line, tries it, and checks:
   - it does what its README says, and nothing else; no hidden network calls, no obfuscation;
   - it asks only for the permissions it needs — a folder when a folder is enough, each
     host it reaches named (`net:<host>`), `"api": 2` — and says why;
   - it's legal (no piracy, no scraping against a site's terms, licenses respected) and
     follows the [code of conduct](../CODE_OF_CONDUCT.md);
   - `node scripts/check-index.mjs` passes.
4. Merged = verified. An update = the same, with `version` raised in `plugin.json`.

### Your own index

Anyone can run an index (a company, friends, you): a JSON list like the one below, anywhere
over https (or http on your local network). `store sources add <url | user/repo>`. Its modules
show as **not verified** in the STORE.

```json
[
  {
    "id": "pomodoro",
    "kind": "plugin",
    "name": "Pomodoro",
    "description": "25/5 focus timer: app, widget and status bar",
    "author": "someone",
    "repo": "someone/icebreaker-pomodoro",
    "version": "1.0.0",
    "permissions": ["vault:write"],
    "requires": { "icebreaker": ">=0.5.0" }
  },
  {
    "id": "synthwave",
    "kind": "theme",
    "name": "Synthwave",
    "description": "neon pink on deep purple",
    "author": "someone",
    "repo": "someone/icebreaker-themes/synthwave.toml"
  }
]
```

Themes are colours and settings only (a `.toml` file, no code): they install without the
module warning.

## Security, honestly

Modules from the STORE or the vault run in a **sandbox** (a Web Worker): no page, no native
access, no network of their own — only the `ib` calls their permissions allow, each one
checked by the deck ([SANDBOX.md](SANDBOX.md)). They can't run the vault's encryption,
accounts, scripts, shortcuts, the STORE or updates, rearrange your screen or touch your alarms
([../src/shell/privileged.ts](../src/shell/privileged.ts)).
Within their permissions they can still do damage (a module allowed to write notes can
overwrite them). So: prefer verified modules, read the code of the others, give the fewest
permissions, keep backups. See [../DISCLAIMER.md](../DISCLAIMER.md).
