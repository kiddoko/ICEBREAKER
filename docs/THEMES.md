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
| `[meta]`   | `name`, `author`, `description`, `border` (round / single / heavy / double), `widget_frame` for HOME widgets (those + dashed / corners / line), `extends` |
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

Bundled fonts (SIL OFL): JetBrains Mono (default), IBM Plex Mono, Fira Code,
Space Mono, VT323, Share Tech Mono. Any font installed on the system works too.
A theme without `[font]` uses JetBrains Mono and the user's weight setting.

## Components: `[keys]` and `[pad]`

Some parts of the interface are **components** a theme can restyle, field by field. Each is
declared once in `src/core/skin/components.ts` (its fields, their bounds, defaults and help —
the skin registry, docs/THEMES_V2_PLAN.md); the loader, `theme set`, its completion and the tests
all read that declaration. What a theme leaves out is the deck's own look. The built-in themes
don't set them yet (themes v2, milestone 1: nothing changes on screen).

```toml
[keys]          # the key every shortcut sits on
radius = 0      # square keys
lip = 0         # flat, no darker bottom
face = "surface0"   # a [palette] name, a #hex, or auto
```

| component | field | what | bounds | the deck's own |
|---|---|---|---|---|
| `[keys]` | `radius` | corners, share of the cell's height (0: square) | 0–0.5 | 0.17 |
| | `border` | outline, device pixels (0: none) | 0–4, whole | 1 |
| | `lip` | depth: the darker bottom, share of the height (0: flat) | 0–0.3 | 0.12 |
| | `shine` | the lighter line along the top, device pixels | 0–3, whole | 1 |
| | `reach` | how far a key reaches into the spaces beside it, share of a cell | 0–0.5 | 0.42 |
| | `top` / `bottom` | room above / below the key, share of the height | 0–0.3 | 0.1 / 0.06 |
| | `face` | the key's colour: `#hex`, a `[palette]` name or `auto` | — | auto (the panel, raised) |
| | `bold` | its text in bold | true / false | true |
| `[pad]` | `inkDark` / `inkLight` | the letter on a light / dark gamepad button | colour | `#101018` / `#ffffff` |
| | `psBody` | a PlayStation button's body | colour | `#1d1c26` |
| | `ring` | how strongly the ring round a PlayStation button shows | 0–1 | 0.5 |
| | `weight` | the letters' weight | 100–900 | 800 |
| | `size` | the icon's size, share of the cell's height | 0.5–1 | 0.86 |

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
