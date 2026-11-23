# The UI kit — one of each

Every piece of ICEBREAKER's interface that comes back more than once exists **once**,
in `src/ui/` (one entry point: `src/ui/kit.ts`). The deck's pages use it, and every
module gets the very same pieces as `ib.lib.*` (and the dialogs as `ib.ui.*`).
So a module's slider is the deck's slider, its search box is the deck's search box —
unless it really wants its own, it never draws one.

A test (`tests/kit.test.ts`) fails if a page or a module draws its own text field,
checkbox or word wrapping again.

**Every label is lowercase** — a button, a tab, a card's title, a menu entry, a module's
name — except ICEBREAKER, acronyms (AI, RGB…), key names (⌘K, F1), proper names and the
user's own content. `t()` lowers what it gives (`uiCase`), the right-click menu lowers each
label's first word; never `.toUpperCase()` a title. The rule: [GUIDELINES.md](GUIDELINES.md#case-the-interface-is-lowercase).

| what | the piece | for a module | looks like |
|---|---|---|---|
| a button | `ui.button(x, y, label, onClick, { cmd, tip, accent, selected, quiet, disabled })` | the same (`ui` in `render`) | ` install ` lit when hovered; `quiet`: muted until hovered; `disabled`: faint |
| a one-line text field | `Field` (`src/ui/field.ts`) | `new ib.lib.Field({…})` | `⌕ search…▌` — icon, placeholder, mask (passwords), `onSubmit`, `onChange`; ⇧⌫ (⌥⌫ on a Mac, ctrl+⌫ elsewhere) deletes the word before the caret, like the notes |
| text you select with the mouse (a shell's output) | `TextSelection` · `selectionHit` (`src/ui/textselect.ts`) | — | drag, double-click a word, triple-click a line; `text(src)` is what ⌘C copies. ibsh and the real terminal share it: give it a `SelectionSource` (a line's cells) |
| a colour | `ColorPicker` (`src/workspace/colorpicker.ts`) | — | the theme studio's palette: hues × shades, greys, the theme's colours, the #hex field |
| a multi-line editor | `TextEditor` | `ib.lib.TextEditor` | the notes' editor |
| a box you tick | `checkbox(ui, x, y, on, { label, hot, onClick })` | `ib.lib.checkbox` | `[■] remember me` · `[▪]` some · `[ ]` |
| in plain text (shell, a menu label) | `BOX_ON` / `BOX_OFF` | `ib.lib.BOX_ON` | `☑` / `☐` |
| one choice among several | `choice(ui, x, y, value, { arrows, onStep })` | `ib.lib.choice` | `‹ dots ›`: ←→, a click on its left / right half |
| tabs | `tabs(ui, x, y, list, current, onPick)` | `ib.lib.tabs` | ` modules  themes  installed ` |
| a number in a range | `slider(ui, rect, value, min, max, onSet, …)` · `askNumber` · `heldStep` | `ib.lib.slider` | `━━━━■── 80%` — drag the handle (it follows the pointer to the pixel); hold on the track, the wheel (one notch, one step; a trackpad's stream: a step every 10 px, never more than one an event) or ←→: **always 1 at a time** — held, the pace speeds up (`HoldClock`: 8 → 60 steps a second), never the step; ←→ go through `heldStep(id, dir, step)`; double-click the number to type it |
| a list | `ListView<T>` (`onNavKey(k)` for ↑↓ page keys under a field) | `new ib.lib.ListView<T>()` | selection, scrolling (with glide), mouse, keys, gamepad, right-click, drag |
| **the search bar** (any list you filter) | `FilterBar` · `colourSquares` | `ib.lib.FilterBar` | `⌕ type to search      ■ ■ □ □ ■ □ □ □` — options: `typeToSearch` (a letter starts it: MODULES, NEXUS), `always` (every key types: Settings, BLOCKS, SHORTCUTS, the STORE), `colours: false` (no squares: those four), `onChange` |
| a page's header line | `pageBar` | — | where you are · tools · its filter |
| choose a file / a folder | `FileBrowser` · `pickFile` · `pickFolder` | `ib.ui.pickFile` · `ib.ui.pickFolder` (you get the path the user chose) | the deck's browser: ‹ › ↑ ⌂, ⏏ drives, *choose this folder* |
| a dialog's buttons | `dialogButtons(ui, inner, [no, yes])` · `YES` `NO` `OK` `CANCEL` `CLOSE` | `ib.lib.dialogButtons` | always **bottom right**, the way out on the left, the way forward on the right: `[N]o  [Y]es` · `cancel  OK` · `close  open` — Yes never moves, whatever the text says (a test checks no dialog places its own) |
| yes / no · a value · one of a list · a message | `deck.confirm` · `deck.prompt` · `deck.choose` · `workspace.message` | `ib.ui.confirm` · `ib.ui.prompt` · `ib.ui.choose` · `ib.ui.alert` | the dialogs (a message: one *ok*, red for a problem — "Wrong password") |
| a setting that depends on another | `disabled: () => …` on the row (`needs(ok, row)` in settings-rows.ts) | — | **greyed and still** — never a sentence saying what to switch on |
| a notification | `deck.notify` | `ib.ui.notify` | a toast |
| a day, a time, days of the week | `deck.pickWhen` · `pickedText` (`workspace/whenpicker.ts`, `ui/calendar.ts`: `drawMonth`, `drawTime`, `drawDays`) | `ib.ui.pickWhen` | WHEN?: a month (‹ ›, the arrows, a click), quick picks (today, tomorrow…), `◷ 09 : 30`, the seven days as chips, and a field to type it instead ("tomorrow 9h"). Every place a day or a time is asked uses it |
| a hover tip | `tip` on `ui.hit` / `ui.button` (and `cmd`: shown as `❯ cmd`) | the same | drawn above the grid by `ui/tipview.ts`: crisp, at the pointer to the pixel, after a short rest; gone as soon as the pointer moves. Say what it does and its keys, in a sentence — the tip is where the explanation goes |
| text that fits | `wrapWords` · `truncate` · `strWidth` · `padEnd` | `ib.lib.*` | width-aware (emoji, Japanese, accents) |
| a sentence with a short version | `ui.textFit(x, y, [long, short, shorter], style, maxW)` | the same (`ui`) | the first that fits **whole**: "nothing to remember" in a wide widget, "nothing yet" in a small one — never "nothing to rem…" |
| things in a row | `Row` + `INSET` `GAP` `LABEL` `SECTION` | `ib.lib.Row` | see [LAYOUT.md](LAYOUT.md) |
| a row that drops the least important first | `Bar` (`priority`, `side`, `fit`) | `ib.lib.Bar` | a status bar, a page's header: never overlaps, never cuts |
| sections down a frame · cards that reflow | `stack` · `cards` | `ib.lib.stack` · `ib.lib.cards` | a header, a list, a help line that goes first · forecast days, 4 a row or 1 |
| how big a frame is | `sizeClass` (`xs` `s` `m` `l`) · `atLeast` | `ib.lib.sizeClass` | choose a layout from your frame, not the window |
| fine drawing: braille dots and rings | `Braille` · `ring(b, cx, cy, r, lit)` (`src/ui/braille.ts`) | — | CLOCKS' timer rings and stopwatch dial: 2×4 dots a cell, layers in two colours |
| a frame's tabs on its border (the deck's own frames) | `tabbedBox` · `soloTab` · `chipStyle` · `drawChip` (`src/workspace/tabstrip.ts`) | — | the tabs' names above the frame's line, a half-block bar under each; lit when the frame has the focus |

## How to use a field

```js
const search = new ib.lib.Field({ icon: "⌕", placeholder: "search…", onChange: (q) => filter(q) });
// in your app / widget:
onText(t)  { return search.onText(t); }
onKey(k)   { return search.onKey(k) || myOwnKeys(k); }   // the field leaves esc, ↑↓, tab (and enter without onSubmit) to you
render(ui, r, focused) { search.render(ui, { x: r.x, y: r.y, w: r.w, h: 1 }, { focused }); }
```

`keys: "basic"` makes a field that only takes typing, ⌫, ⌘V and ctrl+U — for a page you
search by just typing, whose ←→ belong to its list. `active: true` (in `render`) tints
it: "you're typing here" for fields you enter with a key (`a` in TODO).

**Searching a list is always `FilterBar`**, never a `Field` of its own (a test checks it):
the same look, the same keys everywhere. **Space** on a box or a ‹ choice › ticks it / goes
to the next value, on a slider it goes to 0 and back (mute / unmute; a range with no 0: its default and back) — on the row under
the mouse, else the one selected (once ↑↓ moved the selection, a mouse that stays still
doesn't count). Space never types into an empty search and never scrolls the page.

## Changing a piece

Change it in `src/ui/` and every page and module changes with it. A variant that's
really needed becomes an option of the piece (like `quiet` and `disabled` on the
button), not a copy.
