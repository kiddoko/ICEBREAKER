# Themes

> Sounds: a theme picks a synthesized pack in `[sound]`; a pack made of your own
> audio files is described in [SOUND_PACKS.md](SOUND_PACKS.md).

> What makes a theme good (contrast, one accent, works without effects, what to
> test): [GUIDELINES.md](GUIDELINES.md#a-theme).

A theme is one TOML file. Built-in ones live in [`/themes`](../themes);
yours go in `<vault>/.icebreaker/themes/`.

```bash
theme new midnight          # copy the current theme into your vault and open it
# … edit, save …
theme reload && theme set midnight
```

Every key is optional except `[meta] name` — anything missing comes from
`nightshade`. So this is a valid theme:

```toml
[meta]
name = "toxic"

[ui]
accent = "#39ff14"
border_focus = "#39ff14"
title_focus = "#39ff14"
```

## Sections

| section    | what                                                                  |
|------------|-----------------------------------------------------------------------|
| `[meta]`   | `name`, `author`, `description`, `schema` (2), `extends` — and in schema 1, `border` / `widget_frame` |
| `[frame]`  | `style`: the frame round panels and pages (round / single / heavy / double) |
| `[widget_frame]` | `style`: HOME widgets' frame (those + dashed / corners / line) |
| `[logo]`   | `text`: a replacement for the boot logo (schema 1: `[ascii] logo`) |
| `[palette]`| named colors, referenced by the sections below                         |
| `[ui]`     | backgrounds, text, accent, borders, cursor, status colors…            |
| `[syntax]` | Markdown highlighting in the editor and chat                          |
| `[ansi]`   | the 16 terminal colors used by shell output (`colors` shows them)     |
| `[fx]`     | `bloom`, `scanlines`, `vignette` strengths (0–1; bloom: how much a bright thing's halo of light shows — only bright things bloom, backgrounds never), `flicker = false` (this theme never flickers), `monochrome = true` (everything in greys, shell output included), `paper` (0–1, a matte paper texture over the screen), `gradient` for logos |
| `[font]`   | `family`, `scale` (size correction), `weights = [normal, bold]`        |
| `[glyphs]` | `mark` (◆), `bullet` (›), `spinner` frames, `todo` / `done` boxes       |
| `[background]` | `effect` (fog · snow · rain · stars · embers · scan · grain · circuit · sonar · none), `density`, `speed`, `color`, `color2`, `glyphs` |
| `[sound]`  | `pack` (retro · crystal · soft · industrial · paper · neon · sonar), `pitch` — the user can still pick another pack for your theme (`sound pack`), yours shows as "(default)" |
| `[anim]`   | `select` (brackets · pulse · scan · none), `noise` (what widgets appear from), `page` (glitch · eink · wipe · fade · none: changing page), `type` (none · ink · glow: characters that just changed), `screensaver` (city · paper · terminal · sonar · warp: what the screensaver draws) |

`[meta] extends = "phosphor"` builds on another theme: write only what changes.

**Schema 2** (`[meta] schema = 2`, themes v2): the frames and the logo move into their own
tables — `[frame] style` (was `[meta] border`), `[widget_frame] style` (was `[meta]
widget_frame`), `[logo] text` (was `[ascii] logo`). Files without `schema` are schema 1 and keep
working forever: the deck converts them in memory (`upgrade1to2`, `src/core/skin/schema.ts`) and
never rewrites the file. A file made for a newer deck loads what this one understands, and `theme
ls` says so. `theme check [name]` shows what the deck made of a theme: its schema, what its file
got wrong, and the floor. `theme upgrade <name>` shows one of your files as schema 2, and
`theme upgrade <name> --write` writes it (the old file stays beside it as `<name>.toml.v1`;
TOML comments are not kept).

Bundled fonts (SIL OFL): JetBrains Mono (default), IBM Plex Mono, Fira Code,
Space Mono, VT323, Share Tech Mono. Any font installed on the system works too.
A theme without `[font]` uses JetBrains Mono and the user's weight setting.

## Components: `[keys]`, `[pad]`, `[frame]`, `[tabs]`, `[button]`…

Some parts of the interface are **components** a theme can restyle, field by field. Each is
declared once in `src/core/skin/components.ts` (its fields, their bounds, defaults and help —
the skin registry, docs/THEMES_V2_PLAN.md; the frames, tabs, controls, list, caret, tree, icons,
status bar and tip are in `src/core/skin/parts.ts`); the loader, `theme set`, its completion, the
table below and the tests all read that declaration. What a theme leaves out is the deck's own
look. The built-in themes don't set them yet (their signatures come later, theme by theme).

Most components have a **`style`**: a recipe, one of the deck's own looks by name (the first one
listed is today's). A theme picks one, then may still change any field over it:

```toml
[checkbox]
style = "ballot"    # brackets [■] · ballot ☑ · dots ●
on = "✔"            # …with its own tick

[frame]
style = "ascii"     # round · single · heavy · double · dashed · ascii
case = "upper"      # titles in capitals
focus = "both"      # a focused frame: its colour and heavier chars

[caret]
shape = "block"     # bar · block · underline · hollow
blink = false
```

The **floor** (what stays true whatever the theme says): a glyph is always exactly as wide as
the deck's (one cell, or `""` where that's allowed), so nothing moves and every click lands where
it did; two states can't look the same (a checkbox's on / off / some, a folder's open / closed, a
choice's two arrows, a slider's handle and track); a part that carries meaning can't be blank (a
choice's arrows, a slider's handle, a tab's ×). A field that breaks it keeps the deck's own value
and `theme check` says why; it also lists what a theme restyles. Colours stay the theme's
`[ui]` tokens: these tables change shapes only.

```toml
[keys]          # the key every shortcut sits on
radius = 0      # square keys
lip = 0         # flat, no darker bottom
face = "surface0"   # a [palette] name, a #hex, or auto
```

<!-- generated: components (src/core/skin/docs.ts) -->
| component | field | what | values | the deck's own |
|---|---|---|---|---|
| `[keys]` | `radius` | corners, as a share of the cell's height (0: square) | 0–0.5 | 0.17 |
|  | `border` | outline, in device pixels (0: none) | 0–4, whole | 1 |
|  | `lip` | depth: the darker bottom, as a share of the cell's height (0: flat) | 0–0.3 | 0.12 |
|  | `shine` | the lighter line along the top, in device pixels (0: none) | 0–3, whole | 1 |
|  | `reach` | how far a key reaches into the spaces beside it, as a share of a cell's width | 0–0.5 | 0.42 |
|  | `top` | room above the key, as a share of the cell's height | 0–0.3 | 0.1 |
|  | `bottom` | room below the key, as a share of the cell's height | 0–0.3 | 0.06 |
|  | `face` | the key's face: a #hex, a [palette] name, or auto (from the theme's colours) | #hex · palette name · auto | auto |
|  | `bold` | the key's text in bold | true / false | true |
| `[pad]` | `inkDark` | the letter on a light button | #hex · palette name | #101018 |
|  | `inkLight` | the letter on a dark button | #hex · palette name | #ffffff |
|  | `psBody` | a PlayStation button's body | #hex · palette name | #1d1c26 |
|  | `ring` | how strongly the ring round a PlayStation button shows | 0–1 | 0.5 |
|  | `weight` | the letters' weight | 100–900, whole | 800 |
|  | `size` | the icon's size, as a share of the cell's height | 0.5–1 | 0.86 |
| `[frame]` | `style` | the chars (schema 1: [meta] border) | round · single · heavy · double · dashed · ascii | round |
|  | `tl` | top-left corner ("": the style's) | 1 cell or "" | "" |
|  | `tr` | top-right corner ("": the style's) | 1 cell or "" | "" |
|  | `bl` | bottom-left corner ("": the style's) | 1 cell or "" | "" |
|  | `br` | bottom-right corner ("": the style's) | 1 cell or "" | "" |
|  | `h` | top and bottom edge ("": the style's) | 1 cell or "" | "" |
|  | `v` | left and right edge ("": the style's) | 1 cell or "" | "" |
|  | `case` | the title's letters | as-is · lower · upper | as-is |
|  | `align` | where the title sits on the top edge | left · center | left |
|  | `mark` | the [glyphs] mark before a focused frame's title | true / false | true |
|  | `info` | the small text on the right of the top edge | true / false | true |
|  | `focus` | how a focused frame shows it: its colour, or its colour and heavier chars | color · both | color |
| `[tabs]` | `style` | thick (a half-block bar under each tab) · thin · flat (colours only) | thick · thin · flat | thick |
|  | `lip` | the bar under a tab, on the frame's line | 1 cell | `▀` |
|  | `close` | a tab's close mark | 1 cell | `×` |
|  | `more` | the list of the tabs that don't fit | 1 cell | `▾` |
|  | `sep` | the line between the pages and the documents | 1 cell | `│` |
| `[button]` | `style` | pad (a filled pad) · bracket [ save ] · angle ⟨ save ⟩ · bare (no ground until hovered) | pad · bracket · angle · bare | pad |
|  | `left` | the cell before the label | 1 cell | " " |
|  | `right` | the cell after the label | 1 cell | " " |
|  | `fill` | the highlight ground behind an idle button | true / false | true |
| `[checkbox]` | `style` | brackets [■] · ballot ☑ · dots ● | brackets · ballot · dots | brackets |
|  | `left` | the cell before the tick | 1 cell | `[` |
|  | `right` | the cell after the tick | 1 cell | `]` |
|  | `on` | ticked | 1 cell | `■` |
|  | `off` | not ticked | 1 cell | " " |
|  | `some` | partly ticked (some of a group) | 1 cell | `▪` |
| `[choice]` | `style` | angle ‹ › · triangle ◂ ▸ · ascii < > | angle · triangle · ascii | angle |
|  | `left` | the back arrow | 1 cell | `‹` |
|  | `right` | the forward arrow | 1 cell | `›` |
| `[slider]` | `style` | line ━■─ · blocks ▓█░ · dots •●· | line · blocks · dots | line |
|  | `track` | the part after the value | 1 cell | `─` |
|  | `fill` | the part up to the value | 1 cell | `━` |
|  | `knob` | the handle | 1 cell | `■` |
| `[list]` | `style` | fill (the row lit) · bar ▌ · caret › | fill · bar · caret | fill |
|  | `marker` | a mark on the selected row's first cell ("": none) | 1 cell or "" | "" |
|  | `glide` | the selection fades from row to row | true / false | true |
| `[caret]` | `shape` | bar · block · underline · hollow | bar · block · underline · hollow | bar |
|  | `blink` | it breathes a few times after a key, then stays solid | true / false | true |
|  | `width` | the bar's or the line's thickness, in pixels | 1–4, whole | 2 |
| `[tree]` | `style` | lines ├─ · round ╰─ · ascii (plain signs) | lines · round · ascii | lines |
|  | `pipe` | an open branch above | 1 cell | `│` |
|  | `branch` | an item with more after it | 1 cell | `├` |
|  | `last` | the last item of its folder | 1 cell | `└` |
|  | `dash` | the stroke to the item | 1 cell | `─` |
|  | `open` | an open folder | 1 cell | `▾` |
|  | `closed` | a closed folder | 1 cell | `▸` |
| `[icons]` | `style` | deck (the deck's own) · ascii (plain letters and signs) | deck · ascii | deck |
|  | `file_folder` | icon file.folder | 1 cell | `▸` |
|  | `file_note` | icon file.note | 1 cell | `≡` |
|  | `file_python` | icon file.python | 1 cell | `∿` |
|  | `file_js` | icon file.js | 1 cell | `ʝ` |
|  | `file_script` | icon file.script | 1 cell | `❯` |
|  | `file_code` | icon file.code | 1 cell | `λ` |
|  | `file_config` | icon file.config | 1 cell | `⚙` |
|  | `file_table` | icon file.table | 1 cell | `▥` |
|  | `file_web` | icon file.web | 1 cell | `◇` |
|  | `file_text` | icon file.text | 1 cell | `≡` |
|  | `file_image` | icon file.image | 1 cell | `▣` |
|  | `file_pdf` | icon file.pdf | 1 cell | `▤` |
|  | `file_audio` | icon file.audio | 1 cell | `♪` |
|  | `file_video` | icon file.video | 1 cell | `▶` |
|  | `file_archive` | icon file.archive | 1 cell | `▦` |
|  | `file_canvas` | icon file.canvas | 1 cell | `◫` |
|  | `file_other` | icon file.other | 1 cell | `◦` |
| `[statusbar]` | `style` | line │ · dots · · blank | line · dots · blank | line |
|  | `sep` | between two items (and on the top row, before the clock) | 1 cell | `│` |
|  | `drop` | where a dragged item would land | 1 cell | `┃` |
| `[tip]` | `style` | deck (a thicker accent edge) · plain · round | deck · plain · round | deck |
|  | `cmd` | before the command a tip shows | 1 cell | `❯` |
|  | `edge` | the left edge's thickness, in pixels | 1–6, whole | 3 |
|  | `border` | the other edges' thickness, in pixels | 1–3, whole | 1 |
|  | `radius` | corners, in pixels | 0–12, whole | 2 |
|  | `dashed` | a dashed line between the text and the command (else solid) | true / false | true |
<!-- end of generated -->

This table and `themes/schema-2.json` (a JSON Schema for editors) are generated from the
registry: `UPDATE_THEME_DOCS=1 npx vitest run tests/skindocs.test.ts`.

A value out of bounds is clamped; a value that can't be read (a word where a number goes, an
unknown field) is left out — that field keeps the parent theme's or the deck's — and `theme ls`
says which and why. A theme never half-loads.

**The floor**: a shortcut's text must read on its key (4.5:1). A `face` the theme's text can't
be read on goes back to `auto`, and `theme ls` says so. The keys' text is always the theme's
font; the pad buttons' colours (A green, ✕ blue…) are the pad maker's.

In code, `Theme.keys` / `Theme.pad` hold what the theme set; `keycapLook()` and `setPadLook()`
give the complete, clamped look (`resolve()` in `src/core/skin/registry.ts`).

**Icons and colours by name.** The deck asks for file icons by id (`icon("file.python")`,
`src/core/skin/icons.ts`) and the widgets name the colours they used to write as hex
(`TOKENS.rain`, `src/core/skin/tokens.ts`). Same glyphs, same colours today; a theme will be able
to set them in a later step.

## Readable, whatever the colours

When a theme is loaded (built-in, yours, or tweaked), its secondary text (`muted`) is kept at
**4.5:1** contrast at least and its hints (`subtle`) at **4.5:1** too (they carry instructions), against the background, the
panels and the pop-ups (WCAG 2.1): a colour paler than that is moved towards the theme's text
colour just enough (`core/color.ts readable`). `faint` is for lines and grids only — the deck
never writes text in it (`tests/contrast.test.ts` checks every built-in theme).

## Built-in themes

| theme | look | motion |
|-------|------|--------|
| nightshade | violet ICE on the void (default, the reference file) | snow · glitch |
| e-ink | matte old cream paper, dark ink and greys, no CRT at all | paper grain · e-ink refresh flash · typing settles like ink · paper taps · an e-reader sleep screen |
| e-ink-night | e-ink's dark mode: cream ink on charcoal paper (never pure black or white) | the same, softer paper texture |
| neon-district | hot pink and cyan synthwave | circuit traces · wipe · glowing keystrokes · synth plucks |
| abyss | teal bioluminescence in black water | sonar rings · fade · deep pings |
| phosphor | 1983 green screen, pixel font (VT323) | dot grid · CRT sweep · retro blips |
| redline | black glass and warning red (Share Tech Mono) | rising embers · industrial clatter |
| ghost | ice white on blue-black (IBM Plex Mono) | a quiet starfield · soft ticks |
| amber | monochrome amber phosphor | its own frames and motion |
| neon-ronin | teal steel and hot pink neon | neon rain |
| graphite | monochrome greys (Fira Code) | no background: pure focus |

## Tweaking without writing a file

`theme studio` (or MODULES → Theme studio) shows every knob with a live
preview; ←→ change a value, enter types one, r resets it. A changed knob shows
**•** and, on the line you're on (or under the mouse), **↺**: a click puts the
theme's own value back, like Settings.

**Colours: the palette.** Enter on a colour (or a click on its swatch) opens the
colour picker (`src/workspace/colorpicker.ts`): 18 hues × 10 shades — light to the
very dark tones backgrounds and panels need — at the saturation you choose, a row
of greys, and the theme's own colours (its `[ui]` colours and the first ANSI ones,
to reuse one). Arrows walk the palette (the gamepad too), **tab** goes to the
saturation (←→, 5 by 5) and to the **#hex field** — still typable: type `#` or a
hex digit anywhere and it goes there. The new colour shows next to the one
before, as a block and on text. Enter or a double-click keeps it (a
`theme tweak` command), **↺ theme's value** (or del) removes the tweak, esc
leaves it as it was.

It's all commands (the shell's log shows them), so this works too —
`theme set <knob> <value>` (`theme tweak` is the same command, and stays):

```
theme set accent #ff2e88
theme set background snow
theme set density 0.3
theme set sounds crystal
theme set font "IBM Plex Mono"
theme set keys.radius 0         (every [keys] and [pad] field: theme set keys.<tab>)
theme tweak reset accent        (or: theme tweak reset — everything)
theme export my-night           (theme + tweaks → .icebreaker/themes/my-night.toml)
```

Tweaks are kept per theme in `settings.json` (`appearance.tweaks`); the theme
file itself never changes. Plugins can add background effects with
`ib.backgrounds.register(…)` (see src/plugins/api.ts).

Values are either `"#rrggbb"` or a name from `[palette]`.
[`nightshade.toml`](../themes/nightshade.toml) lists every key with a comment.

If a theme has an error, `theme ls` shows the file and the reason; the
rest of the app keeps working.

## Sharing

It's a single file: paste it in a gist, a forum post, a git repo. To install,
save it into `.icebreaker/themes/` and `theme reload`.
