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

Values are either `"#rrggbb"` or a name from `[palette]`.
[`nightshade.toml`](../themes/nightshade.toml) lists every key with a comment.

If a theme has an error, `theme ls` shows the file and the reason; the
rest of the app keeps working.

## Sharing

It's a single file: paste it in a gist, a forum post, a git repo. To install,
save it into `.icebreaker/themes/` and `theme reload`.
