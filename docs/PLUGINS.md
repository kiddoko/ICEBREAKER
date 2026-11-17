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
    launcher: true, // tile on the home screen
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

The full surface is typed and commented in
[`src/plugins/api.ts`](../src/plugins/api.ts). Highlights:

- `ib.ai.session({ system, tools })` → streaming chat; `ib.ai.vaultTools()` lets the model read notes.
- `ib.storage.get/set` → a private JSON file per plugin.
- `ib.ui.notify / confirm / prompt` → talk to the user.
- `ib.lib` → the same building blocks the core uses: `TextEditor`, `ListView`,
  `ChatView`, `bigText`, `fmt` (ANSI colors), color helpers, attribute flags.

Inside `render(ui, rect, focused)` you get the full drawing toolkit
([`src/ui/ui.ts`](../src/ui/ui.ts)): `text`, `box`, `fill`, `bar`, `chart`,
`button`, `hit`, `animate`… Call `ui.animate(ms)` to get another frame for animations.

The built-in [LINGO plugin](../plugins/lingo/main.ts) is a complete example
(app + command + AI session + storage + vault writes).

## Sharing

A plugin is a folder: zip it, put it in a git repo, send it. To install, drop
it into `.icebreaker/plugins/` and `plugin enable <id>`.
