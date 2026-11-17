# Themes

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
| `[meta]`   | `name`, `author`, `description`, `border` (round / single / heavy / double) |
| `[palette]`| named colors, referenced by the sections below                         |
| `[ui]`     | backgrounds, text, accent, borders, cursor, status colors…            |
| `[syntax]` | Markdown highlighting in the editor and chat                          |
| `[ansi]`   | the 16 terminal colors used by shell output (`colors` shows them)     |
| `[fx]`     | `bloom`, `scanlines`, `vignette` strengths (0–1), `gradient` for logos |
| `[font]`   | `family`, `scale` (size correction), `weights = [normal, bold]`        |
| `[glyphs]` | `mark` (◆), `bullet` (›), `spinner` frames, `todo` / `done` boxes       |
| `[background]` | `effect` (fog · snow · rain · stars · embers · scan · none), `density`, `speed`, `color`, `color2`, `glyphs` |
| `[sound]`  | `pack` (retro · crystal · soft · industrial), `pitch`                    |
| `[anim]`   | `select` (brackets · pulse · scan · none), `noise` (what widgets appear from) |

`[meta] extends = "phosphor"` builds on another theme: write only what changes.

Bundled fonts (SIL OFL): JetBrains Mono (default), IBM Plex Mono, Fira Code,
Space Mono, VT323, Share Tech Mono. Any font installed on the system works too.
A theme without `[font]` uses JetBrains Mono and the user's weight setting.

## Tweaking without writing a file

`theme studio` (or MODULES → Theme studio) shows every knob with a live
preview; ←→ change a value, enter types one (`#ff2e88`), r resets it. It's all
commands, echoed in the shell, so this works too:

```
theme tweak accent #ff2e88
theme tweak background snow
theme tweak density 0.3
theme tweak sounds crystal
theme tweak font "IBM Plex Mono"
theme tweak reset accent        (or: theme tweak reset — everything)
theme export my-night           (theme + tweaks → .icebreaker/themes/my-night.toml)
```

Tweaks are kept per theme in `settings.json` (`appearance.tweaks`); the theme
file itself never changes. Plugins can add background effects with
`ib.backgrounds.register(…)` (see src/plugins/api.ts).

Built-in themes to start from — the first four are the flagships, each with
its own background, sounds and motion:

- `nightshade` — violet ICE, fine snow, glassy chimes, corner brackets
- `phosphor` — 1983 green screen (VT323), dot grid + CRT sweep, retro blips, scanning selection
- `redline` — black glass and warning red (Share Tech Mono), rising embers, industrial clatter
- `ghost` — ice white (IBM Plex Mono), a quiet starfield, soft ticks
- `amber`, `neon-ronin` (neon rain), `graphite` (monochrome, no background)

Values are either `"#rrggbb"` or a name from `[palette]`.
[`nightshade.toml`](../themes/nightshade.toml) lists every key with a comment.

If a theme has an error, `theme ls` shows the file and the reason; the
rest of the app keeps working.

## Sharing

It's a single file: paste it in a gist, a forum post, a git repo. To install,
save it into `.icebreaker/themes/` and `theme reload`.
