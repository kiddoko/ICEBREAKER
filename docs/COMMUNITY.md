# Community plugins & themes

ICEBREAKER is meant to be built by its users. Everything beyond the core (apps,
widgets, shell commands, themes) can ship as a plugin or a theme, and installing
one is a single shell command.

## Installing

The easy way: the **STORE** (top bar → ⇣ store, or `store`). It lists the
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
plugin search pomodoro                     # browse the community index
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
4. To be listed in `plugin search`, open a pull request on the community index
   adding one entry (see below).

Tips:
- Ask only for the permissions you use. Plugins that don't need `ai` or
  `vault:write` get enabled more often.
- Bump `version` in `plugin.json` when you publish changes; users get them with
  `plugin update <id>`.
- Prefix palette action ids with your plugin id (`pomodoro.start`). Widget and
  app ids are namespaced for you.

## Publishing a theme

A theme is one `.toml` file ([THEMES.md](THEMES.md)). Put it in a repo (a repo can
hold many themes) and share `you/repo/name.toml`. A repo with a single
`theme.toml` at its root can be installed as just `you/repo`.

## The community index

The official index is [kiddoko/icebreaker-modules](https://github.com/kiddoko/icebreaker-modules)
(`index.json`, modules and themes). Themes made by the community also have a
home: [kiddoko/icebreaker-themes](https://github.com/kiddoko/icebreaker-themes).

`plugin search` and install-by-id read a JSON list from the URL in
`plugins.registry` (`config set plugins.registry <url>` to use another one —
a company or a friend group can run their own):

```json
[
  {
    "id": "pomodoro",
    "kind": "plugin",
    "name": "Pomodoro",
    "description": "25/5 focus timer: app, widget and status bar",
    "author": "someone",
    "repo": "someone/icebreaker-pomodoro"
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

Index rules (for reviewers):
- the repo is public and its `plugin.json` id matches the entry's `id`;
- no obfuscated or minified-beyond-reading code, no network calls hidden from
  the README;
- one entry per plugin; updates happen in the plugin's own repo.

## Security, honestly

Plugins run in the app's JavaScript context. Permissions gate the `ib` API and
the Content-Security-Policy blocks most network access, but a malicious
plugin could still misbehave. Install from people you trust, read `main.js`,
and keep an eye on `plugin ls`. A Worker-based sandbox is on the roadmap.
