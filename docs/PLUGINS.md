# Writing plugins

A plugin is a folder in your vault:

```
<vault>/.icebreaker/plugins/hello/
  plugin.json
  main.js
```

Fastest start: run `plugin new hello` in the shell — it writes both files and
opens `main.js`. Edit, save, `plugin reload`.

## plugin.json

```json
{
  "id": "hello",
  "name": "Hello",
  "version": "0.1.0",
  "description": "What it does, in one line",
  "author": "you",
  "permissions": ["vault:read", "vault:write", "ai"]
}
```

| permission    | allows                                              |
|---------------|-----------------------------------------------------|
| `vault:read`  | `ib.vault.read / exists / notes`, `ib.ai.vaultTools()` |
| `vault:write` | `ib.vault.write / append / mkdir`                   |
| `ai`          | `ib.ai.ask / session` (uses the user's provider)    |
| `media`       | `ib.media.status / control` (the system player), `ib.media.player.*` (local files) |
| `google-calendar` | `ib.google.*`: the user's Google Calendar, through their own OAuth client |

Plugins from the vault are **off** until the user runs `plugin enable <id>`,
which shows the permissions and asks for confirmation. Calling an API you
didn't declare throws an error.

> Honesty note: plugins run in the app's JavaScript context. Permissions
> govern the API object, and the app's Content-Security-Policy blocks network
> access except to the AI endpoints — but a malicious plugin could still misbehave.
> Read the code before enabling something (it's one `main.js`). A Worker-based
> sandbox is on the roadmap.

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

  // palette entry (Ctrl+K)
  ib.palette.register({ id: "hello.say", title: "Say hello", run: () => ib.ui.notify("hello!") });

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
  activate() { ib.ui.notify("enter pressed on the widget"); },
});
```

The user adds it from HOME: `e` (edit layout) then `a`. Widgets render every
frame they're visible: keep `render` cheap, cache anything slow (network, AI)
in a variable, and call `ui.animate(ms)` only if something moves.

The full surface is typed and commented in
[`src/plugins/api.ts`](../src/plugins/api.ts). Highlights:

- `ib.ai.session({ system, tools })` → streaming chat; `ib.ai.vaultTools()` lets the model read notes.
- `ib.storage.get/set` → a private JSON file per plugin (`.icebreaker/plugin-data/<id>.json`).
- `ib.shell.run(line)` → run a command, echoed in the shell (what your clicks should do).
- `ib.ui.notify / confirm / prompt` → talk to the user.
- `ib.lib` → the same building blocks the core uses: `TextEditor`, `ListView`,
  `ChatView`, `bigText`, `fmt` (ANSI colors), color helpers, attribute flags.

Inside `render(ui, rect, focused)` you get the full drawing toolkit
([`src/ui/ui.ts`](../src/ui/ui.ts)): `text`, `box`, `fill`, `bar`, `chart`,
`button`, `hit`, `animate`… Call `ui.animate(ms)` to get another frame for animations.

### One feature, one module: the command is the source of truth

ICEBREAKER modules follow one rule: **everything the UI does is a shell
command.** Your app and widget don't change data themselves, they run your
command with `ib.shell.run("mymodule do-thing 3")`, which is echoed in the
shell. Users learn the command line just by clicking around, and power users
get a scriptable module for free.

For plain clicks you don't even need a handler: `ui.hit(rect, { cmd: "todo done 3", tip: "space" })`
runs the command on click and shows it (plus the tip) in a hover tooltip.
`ib.lib.parseFlags` reads `--flags`, `ib.lib.q` quotes an argument safely.

Give your command `usage`, `examples` and `man`: `yourcmd -h` (and `man yourcmd`)
prints them as its help page, for free. Examples are a command line, or
`[command line, what it does]`.

Examples to copy from:

- [TODO](../plugins/todo/main.ts): the reference module. A `todo` command
  (add / done / prio / due / rm / restore…), an app, a HOME widget, data in
  `ib.storage`. No permission needed.
- [LINGO](../plugins/lingo/main.ts): app + command + AI session + storage + vault writes.

## Sharing

Put `plugin.json` + `main.js` in a public GitHub repo: anyone can then
`plugin install you/your-repo`. Publishing, the community index and review
rules are in [COMMUNITY.md](COMMUNITY.md).
