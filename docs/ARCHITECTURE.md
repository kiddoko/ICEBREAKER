# Architecture

ICEBREAKER is a [Tauri](https://tauri.app) app: a small Rust process hosts a
webview, and the whole UI is TypeScript drawing on a `<canvas>`. No UI
framework, no virtual DOM — a character grid and a few hundred lines that paint it.

## One frame

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
- **UI** (`ui/ui.ts`) — immediate-mode drawing: `text`, `box`, `fill`, `bar`, `chart`,
  `button`, `hit`. No widget tree to keep in sync: what you draw this frame *is* the UI.
- **Renderer** (`core/renderer.ts`) — compares the new grid with the previous one,
  repaints only dirty cells. Glyphs come from a cache (`core/atlas.ts`); box-drawing,
  blocks, braille and powerline separators are drawn as rectangles
  (`core/glyphs.ts`) so borders and graphs are seamless at any size.
- **FrameLoop** (`core/loop.ts`) — renders on demand. Idle = 0 frames.
  Typing, scrolling, animations run at the fps cap (60 by default).
- **Post-effects** — bloom, scanlines, vignette, flicker are CSS layers over the
  canvas (`style.css`), driven by the theme's `[fx]` values. GPU-composited, nearly free.

## Input

`core/input.ts` turns DOM events into `KeyInput`, text, `MouseInput`;
`core/gamepad.ts` turns the Gamepad API into `Action`s (`up`, `confirm`, `back`…).

Routing (`workspace/workspace.ts`):

1. a modal overlay (palette, dialog) gets everything;
2. global shortcuts (`Ctrl+K`, `Ctrl+J`, `Alt+arrows`…);
3. the focused pane's `onKey` / `onText`;
4. unused keys become Actions (`enter` → `confirm`, `esc` → `back`…) → `onAction`.

So an app that only implements `onAction` works with keyboard, gamepad and
on-screen keyboard. Mouse: during render, `ui.hit(rect, { onClick, onDrag, onWheel })`
registers areas; the last registered area under the pointer wins.

Text goes through a hidden `<textarea>` so IME (日本語), dead keys (ê, ü) and
paste work like in any native app.

## Data

- **Vault** (`vault/vault.ts`) — the notes folder. All file access goes through Rust
  (`src-tauri/src/vault.rs`), which refuses any path outside the vault. `rm` moves
  to `.trash/`; writes are atomic (temp file + rename).
- **Settings** (`core/settings.ts`) — `settings.json` / `secrets.json` in the OS
  config folder. Every key is reachable with `config set a.b value`.
- **Themes** (`core/theme.ts`) — TOML, merged over the default theme.

## AI

`ai/types.ts` defines a provider-neutral `ChatSession`. `ai/anthropic.ts` uses the
official Anthropic SDK (streaming, adaptive thinking, tool use loop, prompt
caching, server-side refusal fallback); `ai/ollama.ts` talks to a local Ollama.
`ai/tools.ts` gives the model `list_notes`, `search_notes`, `read_note` and
`write_note` (the last one always asks you first).

## Adding things

**A shell command** — add an object to a list in `shell/commands/*.ts`:

```ts
const hello: Command = {
  name: "hello",
  summary: "say hello",
  run(ctx) { ctx.out(fmt.magenta("hello ") + ctx.args.join(" ") + "\n"); },
};
```

**An app** — implement `App` (`apps/types.ts`: `title()` + `render()`), export an
`AppSpec`, register it in `Deck.registerCore()`. Or do both from a plugin.

**A theme / a plugin** — see THEMES.md and PLUGINS.md; no rebuild needed.
