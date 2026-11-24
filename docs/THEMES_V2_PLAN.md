# Themes v2 — the skin layer (design plan)

> **Plan only.** No feature code. Based on `ui-0.8` (PR #19: `Theme.keys`, `Theme.pad`).
> Roadmap step 7. Written 2026-11-24 while the user was away: every decision below was
> taken by the planning session; the few that are really the user's are in
> [§ 11 Open questions](#11-open-questions-for-the-user), each with a recommendation.

## En bref (pour toi, en français)

- **Le but** : un thème peut changer *tout* ce qui se voit — les touches, les boutons de
  manette, les cadres, les onglets, les boutons, les cases, les curseurs, les icônes, les
  sons, la police — **sans bidouille**, et sans noyer les gens : la souris (studio), des
  commandes (`theme set keys.radius 0.3`), ou un **paquet** (dossier avec images, polices,
  sons, et plus tard un peu de code de dessin, enfermé).
- **Comment** : chaque élément de l'interface devient un **composant** déclaré une seule
  fois dans le code (ses réglages, leurs bornes, sa valeur par défaut). De cette déclaration
  sortent automatiquement : la validation du fichier thème, les lignes du studio, la
  complétion de `theme set`, la doc, les tests. Trois couches : **jetons** (couleurs,
  police, mouvement) → **composants** (`[keys]`, `[frame]`, `[tabs]`…) → **dessin** optionnel
  (images découpées, puis code dans un Worker isolé, **jamais à chaque image** : dessiné une
  fois, mis en cache).
- **Les règles de base** (le « plancher ») restent toujours vraies : contraste lisible,
  zones cliquables assez grandes, la grille de caractères, chaque raccourci visible sur sa
  touche, pas de clignotement dangereux. **Jamais habillables** : demandes de permission,
  connexion, récupération, avertissements « non vérifié », erreurs. Un module peut ignorer
  le *look* dans son propre panneau, jamais le plancher.
- **Réglages propres au thème** : le créateur déclare `[options.glow]` (interrupteur, choix,
  nombre, couleur) ; le studio et Réglages → Apparence les montrent **seulement pour le thème
  actif**. Une option ne fait que changer d'autres clés du thème (déclaratif, sans code).
- **Les 11 thèmes intégrés** passent au format 2 par un convertisseur, d'abord **au pixel
  près identiques** (test), puis chacun reçoit une signature (touches plates pour e-ink,
  carrées pour phosphor…) dans une PR que tu valides.
- **STORE** : thèmes vérifiés / non vérifiés comme les modules ; un thème avec du code
  demande une permission.
- **7 étapes** (S/M/L), la première ne change rien à l'écran. **4 questions pour toi** à la
  fin, avec ma recommandation à chaque fois.

---

## Contents

1. [Inventory: every UI element today](#1-inventory-every-ui-element-today)
2. [The skin layer](#2-the-skin-layer)
3. [The floor: base rules, protected surfaces, module bypass](#3-the-floor)
4. [Three levels: studio, commands, packages](#4-three-levels)
5. [Per-theme options](#5-per-theme-options)
6. [Safety and performance](#6-safety-and-performance)
7. [Migrating the 11 built-in themes](#7-migrating-the-11-built-in-themes)
8. [Themes in the STORE](#8-themes-in-the-store)
9. [Milestones](#9-milestones)
10. [What we borrow, and from whom](#10-what-we-borrow)
11. [Open questions for the user](#11-open-questions-for-the-user)

---

## 1. Inventory: every UI element today

How the deck draws (see `docs/ARCHITECTURE.md`): every part of the UI writes characters into
one `Grid` (`src/core/grid.ts`: code point, fg, bg, attrs, plus `cap`/`capEdge` for keys);
`Renderer` (`src/core/renderer.ts`) stamps glyphs from the atlas (`src/core/atlas.ts`) and
draws the only **pixel-level** parts itself (keycaps, pad sprites, caret); post-effects
(bloom, scanlines, vignette, fringes) are separate canvases, composited through WebGL when
the CRT curve is on (`src/core/crt.ts`). Motion on the finished frame is `src/fx/transition.ts`
and `src/fx/glitch.ts`; scenery is `src/fx/backgrounds.ts`.

The theme today is `Theme` (`src/core/theme.ts`), parsed from TOML; tweaks are
`section.key → value` overrides kept per theme in `settings.json` (`src/core/tweaks.ts`
`KNOBS`, `src/apps/studio.ts`).

Legend — **T**: themeable from a theme file · **H**: code hook only (not read from files) ·
**—**: fixed in code.

| # | element | drawn by | how | today |
|---|---|---|---|---|
| 1 | colours of everything (23 `[ui]` roles) | all, via `ui.c` | grid fg/bg | **T** `[ui]`, `[palette]` |
| 2 | Markdown highlighting | `ui/markdown.ts`, `ui/editor.ts` | grid | **T** `[syntax]` |
| 3 | shell output colours | `core/ansi.ts` | grid | **T** `[ansi]` |
| 4 | font family / size / weights | `core/fonts.ts`, renderer | atlas | **T** `[font]` |
| 5 | panel frames (`ui.box`) | `ui/ui.ts` `BORDERS` | box-drawing chars | **T** `[meta] border` (4 styles) |
| 6 | HOME widget frames | `widgets/*` | box chars | **T** `[meta] widget_frame` (7 styles) |
| 7 | focused title mark, bullets, todo boxes, spinner | `ui/ui.ts`, lists | chars | **T** `[glyphs]` |
| 8 | **keycaps** (every shortcut) | `ui/keycaps.ts` finds them, `core/keycap.ts` `drawCapSlice` | **pixels** behind the text | **H** `Theme.keys` (`KeycapLook`: radius, border, lip, shine, reach, top, bottom, face, bold) |
| 9 | **gamepad glyphs** | `ui/keyicons.ts`, `core/padglyphs.ts` | **pixels** (sprites) | **H** `Theme.pad` (`PadLook`: inkDark, inkLight, psBody, ring, weight, size) |
| 10 | buttons (`ui.button`) | `ui/ui.ts` | grid, highlight bg | colours only |
| 11 | checkbox, choice, tabs control, slider | `ui/controls.ts`, `ui/slider.ts` | chars `[■] ‹ › ▌▐` | colours only; glyphs **—** |
| 12 | list selection + glide | `ui/list.ts`, `ui/glide.ts` | grid bg + fade | colours (`selection`, `highlight`) |
| 13 | progress bar, chart | `ui.bar`, `ui.chart` | block chars | colours only |
| 14 | tab strip (two rows, `▀` lip) | `workspace/tabstrip.ts` | chars | colours; shape **—** |
| 15 | tab / app icons (⌂ ✎ ☂ ▦) | `workspace/tabstrip.ts`, apps | chars | **—** |
| 16 | file-type icons | `ui/fileicon.ts` | chars | **—** |
| 17 | status bar items and separators | `workspace/chrome.ts`, `statusbar.ts` | chars | colours (`status_bg/fg`); glyphs **—** |
| 18 | top row / page bar | `workspace/layout/toprow.ts`, `ui/pagebar.ts` | chars | colours only |
| 19 | sidebar tree lines (├─ └─) | `workspace/sidebar.ts` | chars | **—** |
| 20 | menus, quick menu, context menu | `workspace/menus.ts`, `quickmenu.ts`, `contextmenu.ts` | box + list | via frames + colours |
| 21 | dialogs (generic) | `ui/dialog.ts` | box + buttons | via frames + colours |
| 22 | tips / tooltips | `ui/tipview.ts` | box | via frames + colours |
| 23 | text cursor (caret) | renderer `setCaret` | pixels | colour (`cursor`); shape **—** |
| 24 | boot logo, big text, gradient | `workspace/boot.ts`, `ui/bigtext.ts` | chars | **T** `[ascii] logo`, `[fx] gradient` |
| 25 | animated background | `fx/backgrounds.ts` (+ plugins) | chars, scenery | **T** `[background]` |
| 26 | page / typing / select motion, screensaver | `fx/transition.ts`, `fx/glitch.ts`, `fx/screensaver.ts` | frame post-pass | **T** `[anim]` |
| 27 | CRT post-effects | renderer, `core/crt.ts` | canvases / WebGL | **T** `[fx]` (bloom, scanlines, vignette, flicker, monochrome, paper) |
| 28 | UI sounds | `core/sound.ts` | Web Audio | **T** `[sound]` pack + pitch (+ file packs, `SOUND_PACKS.md`) |
| 29 | weather sky, moon, clock faces | `apps/weathersky.ts`, `widgets/moondraw.ts`, `widgets/clockfaces.ts` | chars + some fixed hex | partly **—** (hard-coded colours) |
| 30 | **permission dialog** | `workspace/permdialog.ts` | box + buttons | frames + colours — *to be protected* |
| 31 | **login / lock** | `workspace/lock.ts` | own page | colours — *to be protected* |
| 32 | **recovery dialog** | `workspace/recoverydialog.ts` | box | colours — *to be protected* |
| 33 | **"not verified" warnings** (STORE) | `apps/store.ts` | text in `warning` | colours — *to be protected* |
| 34 | module panes (sandboxed) | `plugins/sandbox/*` (Frames of plain cells) | grid | modules use `ui.c` by guideline |

What the inventory says:

- **Colours are already fully themeable** and readable by construction (`readable()` keeps
  `muted`/`subtle` at 4.5:1). That part stays as is: it becomes the token layer.
- **Shapes are the gap.** Frames have 4 + 7 fixed styles; controls, tabs, icons, the caret,
  tree lines and status-bar glyphs are hard-wired.
- **Only two parts are drawn in pixels** (keys, pad glyphs), and both already have a look
  object with clamps — the pattern v2 generalises.
- A handful of widgets use hex colours directly (`grep 0x[0-9a-f]{6}` in `apps/`, `widgets/`):
  each needs a token (step 1).

---

## 2. The skin layer

### 2.1 Three layers

```
 tokens            components                       draw (optional)
 ───────────       ─────────────────────────        ──────────────────────────────
 [palette]         [keys]   radius, lip, face…       style = "bevelled" | "flat" | …   (built-in recipes)
 [ui] [syntax]  →  [frame]  chars, title, info…   →  sprite = "art/key.png" (nine-slice)
 [ansi] [font]     [tabs] [button] [checkbox]…       draw  = "draw.js#key"  (sandboxed, cached)
 [motion]          [icons] [caret] [statusbar]…
```

- **Tokens**: colours (today's `[palette]`, `[ui]`, `[syntax]`, `[ansi]`), type (`[font]`),
  motion (`[anim]`, `[fx]`). Unchanged keys, unchanged meaning.
- **Components**: one TOML table per element, typed fields with bounds. A field's value can be
  a literal or a **token reference** (`face = "panel_alt"`, `fg = "accent"`) — the same rule as
  colours today (palette name or `#hex`).
- **Draw**: what a component's *shape* is made of, in order of power — a **recipe** (one of the
  deck's own looks, chosen by name), a **sprite** (an image from the package, nine-sliced or
  per-state), or a **draw function** (code in a sandbox, § 6). Most themes never go past
  recipes.

### 2.2 One declaration per component (the source of truth)

Today a knob lives in four places (the `Theme` type, `parseTheme`, `KNOBS`, `THEMES.md`).
v2 has **one registry** in code, `src/core/skin/` (new):

```ts
// src/core/skin/components/keys.ts
export const keys = defineComponent({
  id: "keys",
  since: 2,
  label: "keys", group: "shape",
  doc: "the key every shortcut sits on",
  states: ["normal", "pressed", "disabled"],
  fields: {
    style:  choice(["bevelled", "flat", "outline", "pill", "underline"], "bevelled"),
    radius: num(0, 0.5, 0.17, "corners, share of the cell's height"),
    border: int(0, 4, 1, "outline, device pixels"),
    lip:    num(0, 0.3, 0.12, "the darker bottom, share of the height"),
    shine:  int(0, 3, 1), reach: num(0, 0.5, 0.42),
    top:    num(0, 0.3, 0.1), bottom: num(0, 0.3, 0.06),
    face:   color("auto"),            // "auto" = ui/ui.ts keyFace(), a token name, or #hex
    text:   color("auto"), bold: bool(true),
    sprite: asset("image", null),     // optional: art/key.png, nine-slice
    draw:   hook(null),               // optional: draw.js#key
  },
  floor: [contrast("text", "face", 4.5)],   // § 3: always re-checked after a theme sets it
});
```

From that one object the deck derives:

| derived | where |
|---|---|
| the resolved, clamped look the drawing code reads (`skin.keys`) | `core/skin/resolve.ts` |
| validation messages for `theme ls` (file, key, reason) | `core/skin/validate.ts` |
| studio rows (group, label, control by field type) | `apps/studio.ts` (generated) |
| `theme set` completion and `theme doc <key>` | `shell/commands/theme*.ts` |
| the reference table in `THEMES.md` (generated section) | `scripts/gen-theme-docs` |
| a JSON Schema for editors (`themes/schema-2.json`) | same script |
| a test per field: bounds, fallback, token refs | `tests/skin.test.ts` (generated cases) |

`KeycapLook` / `PadLook` become the first two components; their clamps (`keycapLook`,
`setPadLook`) move into the field definitions.

### 2.3 Component list (v2.0)

| component | fields (sketch) | recipes |
|---|---|---|
| `keys` | above | bevelled (today) · flat · outline · pill · underline · none (text only, still coloured) |
| `pad` | today's `PadLook` + `style` | maker colours (today) · mono (theme ink) |
| `frame` | `chars` (8 corners/edges, or a style name), `title` (mark, case, align), `info`, `focus` (colour / chars / both), `gap` | round · single · heavy · double · dashed · corners · line · ascii · none |
| `widget_frame` | same as `frame` | same |
| `tabs` | `lip` char, `active`/`idle` fg/bg, `close` glyph, `overflow` glyph | thick (today) · flat · brackets |
| `button` | `left`/`right` caps (` `, `[ ]`, `⟨ ⟩`, `▐ ▌`), `fill`, `hover`, `pressed` | pad (today) · bracket · underline · key (drawn like a key) |
| `checkbox` | `off`, `on`, `some` glyphs | `[■]` (today) · `☐☑` · `○●` |
| `choice` | `left`/`right` arrows | `‹ ›` (today) · `◀ ▶` · `< >` |
| `slider` | `track`, `fill`, `knob` glyphs | today's · blocks · dots |
| `list` | `selection` (fill / bar / brackets / caret), `glide` on/off | fill (today) |
| `scrollbar` | `track`, `thumb` | today's |
| `bar` / `chart` | glyph ramps (`▏▎▍▌▋▊▉█`, `⣀⣤⣶⣿`) | blocks · braille · ascii |
| `caret` | `shape` (bar / block / underline / hollow), `blink` | bar (today) |
| `tree` | `branch`, `last`, `pipe`, `folder_open/closed` | lines (today) · ascii · dots |
| `icons` | a map `icon id → glyph` (`app.home`, `app.note`, `file.code`, `status.stealth`…) | deck (today) · ascii · nerd (if the font has them) |
| `statusbar` | `sep`, `group` brackets, `bg`/`fg` | today's |
| `tip` | `frame` override, `arrow` | today's |
| `glyphs` | today's `[glyphs]` (mark, bullet, spinner, todo, done) | — |
| `logo` | today's `[ascii] logo` + `font` (bigtext style) + `gradient` | — |
| `sound` | today's `[sound]` + per-event file overrides from the package | packs |
| `background`, `anim`, `fx` | today's | today's |

Every icon gets a **stable id** in a registry (`core/skin/icons.ts`), the same idea as
VS Code's product icon ids: the deck and modules ask `icon("app.weather")`, never write `☂`.

### 2.4 Resolution order and fallbacks

For each field, first value found wins:

1. the user's tweak for this theme (`appearance.tweaks.<theme>`, as today);
2. the active **option** values of this theme (§ 5);
3. the theme file (and its package);
4. its `[meta] extends` parent, recursively (cycle → error, stop);
5. the component's **default** (the deck's own look, i.e. nightshade's).

Then: clamp to the field's bounds → resolve token references → **apply the floor** (§ 3) →
freeze. A field that fails (bad type, missing asset, hook error) falls back to step 5 *for
that field only*, and `theme ls` / the studio show why. A theme never "half-loads": the
result is always a complete, valid skin.

### 2.5 Versioning

- `[meta] schema = 2`. A file without it is schema 1 and goes through `upgrade1to2()` in
  memory — **today's files keep working, forever**. The file on disk is never rewritten
  unless the user runs `theme upgrade <name>`.
- Each component and field has `since`. A theme declaring `schema = 3` on a deck that knows 2
  loads what it understands, ignores the rest with a notice ("made for a newer ICEBREAKER").
- Renames go through an alias table (`old key → new key`), never a silent break.

---

## 3. The floor

The floor is what stays true **whatever the theme, the tweaks, the options or a module do**.
It is enforced after resolution (§ 2.4), not trusted from the theme.

### 3.1 Base rules

| rule | value | how it's enforced | borrowed from |
|---|---|---|---|
| text contrast | body text ≥ 7:1 target, never below 4.5:1; `muted`/`subtle` ≥ 4.5:1 (today) | `readable()` moves the colour towards `fg` just enough | WCAG 2.1 1.4.3, today's `core/color.ts` |
| key text on its face | ≥ 4.5:1 | component `floor` rule, re-checked per theme | today's `tests/contrast.test.ts` |
| non-text contrast (focus border, checkbox, slider knob, caret) | ≥ 3:1 against what's around | same mechanism, on the colour of the part | WCAG 2.1 1.4.11 |
| focus is always visible | focused frame / selected row differs from unfocused by colour **or** chars | validator: `frame.focus` can't equal unfocused | — |
| hit sizes | ≥ 1 cell high, ≥ 2 cells wide for anything clickable; keys never shrink below their text | geometry fields are bounded; hits come from layout, not skin | — |
| the grid | one monospace cell grid; skins draw *in* cells, never move layout | components only change what a cell shows; no width/height fields | the deck's design |
| shortcuts | every shortcut stays on a key that reads as a key (style `none` still colours it) | `keys` has no "invisible" option | 0.8 |
| motion | page flashes ≤ 3/s; flicker and glitch off when the user asks for less motion | `[anim]` clamps; the user's reduce-motion setting wins over the theme | WCAG 2.3.1 |
| font | size correction 0.5–2; a font that lacks box/key glyphs falls back per glyph | today's clamps + atlas fallback | — |
| sounds | volume capped by the user's setting; no sound longer than 2 s for UI events | pack loader | — |

### 3.2 Protected surfaces (never skinned)

These are where a look could be used to **trick** someone:

- the permission dialog (`workspace/permdialog.ts`) and every question it asks;
- the login / lock page and new-account flow (`workspace/lock.ts`);
- the recovery dialog (`workspace/recoverydialog.ts`), password and encryption fields;
- "not verified" warnings and install confirmations (`apps/store.ts`);
- update prompts and error / crash pages (`docs/ERRORS.md`).

They are drawn with the **trusted skin**: the deck's default components (no sprites, no draw
hooks, no theme glyphs), coloured from the active theme's tokens pushed through **stricter**
clamps (text 7:1, `warning`/`error` forced distinct from `accent`), plus one fixed signature
the theme can't produce: the double frame with a fixed `⛨` mark in the title. While one is up,
everything behind it is dimmed (as today) and **no theme or module draw runs on top**.
Technically: `ui.trusted(() => …)` switches the skin for that subtree; components refuse
sprites/hooks inside it; the sandbox bridge never lets a module open a trusted surface.

*(Open question Q3: fixed deck look vs theme colours clamped — recommendation above.)*

### 3.3 What modules may bypass

A module owns its pane (it already draws there through the sandbox, plain cells). Inside it:

- **May bypass the look**: draw its own frames, glyphs, colours (e.g. BreakerMED's tracker
  grid), opt out of component skins (`kit.raw()` / `skin: false` on a control). It may *read*
  the skin (`ib.use("theme").skin()`) and the theme's options (§ 5) to fit in.
- **May not bypass the floor** where it touches function or security: shortcuts it shows go
  through `ui.text` (so they get keys); its clickable areas follow hit sizes; it cannot draw
  outside its pane, over the chrome or over a trusted surface (already true: clip + overlays);
  it cannot call `ui.trusted`; text it writes in `muted`/`subtle` is still re-checked.
- A module *can* ship its own component recipes for its own controls (e.g. a "tracker" button
  look) through `ib.skin.register(…)`, which then becomes skinnable by themes that know it
  (namespaced: `[bmed.pattern]`). Themes that don't know it get the module's default.

---

## 4. Three levels

The same keys at every level; each level is a view on the registry. Nobody is overwhelmed:
the studio shows groups collapsed, with "common" fields first; the rest is reachable but not
in the way.

### 4.1 Theme studio (mouse) — for everyone

- Today's studio, its rows **generated** from the registry: groups (COLOURS, TYPE, SHAPE →
  per component, BACKGROUND, SOUND, MOTION), and at the top **THIS THEME** (its options, § 5).
- Each component row opens a **sub-page** with a live preview of just that part (a key in its
  three states, a frame focused / unfocused, a checkbox on/off/some), drawn by the real
  component code — so what you see is what the deck draws.
- `simple / all` toggle: *simple* shows only fields marked `common: true` (≈ 20 in total);
  *all* shows every field.
- Every change is still a command (`theme set …`) echoed in the shell log, as today.

### 4.2 Commands — for people who like the shell

```
theme set keys.radius 0.3          # a tweak on the active theme (= today's `theme tweak`)
theme set keys.style flat
theme set icons.app.weather ☔
theme get keys                     # the resolved values and where each comes from
theme doc keys.lip                 # the field's help, bounds, default
theme reset keys.radius            # or: theme reset keys · theme reset (everything)
theme option glow off              # a theme option (§ 5)
theme export my-night              # theme + tweaks + options → a file / package
theme check my-night               # validate + floor report, without switching
theme upgrade my-night             # rewrite a schema-1 file as schema 2 (asks first)
```

`theme set <name>` (one argument) keeps switching theme, as today; two arguments is a tweak.
Completion comes from the registry: `theme set k<tab>` → `keys.`, `keys.<tab>` → fields,
values → the field's choices or bounds. (Q1 is about this naming.)

Like kitty's remote control (`kitty @ set-colors`), these also work from scripts and from
modules with the "change appearance" permission.

### 4.3 Code packages — for theme creators

A theme can stay one TOML file. A **package** is a folder (or a zip in the STORE):

```
neon-ronin/
  theme.toml          # [meta] schema = 2, name, version, author, licence
  art/                # PNG / WebP only: key.png, frame.png (nine-slice), icons.png (atlas)
  fonts/              # .woff2 / .ttf / .otf, each with its licence
  sounds/             # a sound pack (docs/SOUND_PACKS.md layout)
  draw.js             # optional: draw functions (§ 6), sandboxed
  preview.png         # for the STORE
  LICENSES.md         # one line per asset: file, author, licence
```

**The charter** (what a package must respect to be accepted, checked by `theme check`):

1. Declarative first: anything a recipe or a sprite can do is done without code.
2. Respects the floor; never touches protected surfaces (it can't, but it must not try:
   a theme whose art imitates a permission dialog is rejected from the STORE).
3. Works with **effects off**, at **interface scale 200 %**, and in **reduce motion**.
4. Every asset has a licence that allows redistribution (OFL for fonts is the default ask);
   human-made or properly licensed sounds (see the sound design notes).
5. Size: ≤ 10 MB total, images ≤ 2048 px a side, ≤ 8 fonts, sounds ≤ 2 s each.
6. No network, no file access, no timers outside the draw contract; `draw.js` is plain ES
   module, no imports.
7. Declares `[meta] version` (semver) and `schema`.
8. UI text in lowercase, like the deck (the user's house style), unless the theme's identity
   needs otherwise (`[frame] title.case`).

---

## 5. Per-theme options

The creator declares settings; the user sees them **only while that theme is active**, in the
studio (THIS THEME, first group) and in Settings → Appearance.

```toml
[options.glow]
type    = "toggle"            # toggle · choice · number · color
label   = "neon glow"
label_fr = "lueur néon"
default = true
on  = { "fx.bloom" = 0.8, "keys.style" = "pill" }
off = { "fx.bloom" = 0.1, "keys.style" = "flat" }

[options.district]
type    = "choice"
label   = "district"
choices = ["kabuki", "harbor", "rooftop"]
default = "kabuki"
kabuki  = { "ui.accent" = "#ff2e88" }
harbor  = { "ui.accent" = "#22d3ee", "background.effect" = "rain" }
rooftop = { "ui.accent" = "#facc15", "background.effect" = "stars" }

[options.rain]
type    = "number"
label   = "rain"
min = 0
max = 1
step = 0.1
default = 0.5
set     = "background.density"   # a number option drives one field directly
```

Rules:

- An option **only sets other keys of the theme** (any component field, any token). No code,
  no new behaviour: it's a named group of tweaks the creator curated. Draw functions receive
  the option values too, so a code theme can use them.
- Values are validated like everything else; an option can't reach a protected surface or
  lower the floor (the floor runs after).
- Stored per theme in `settings.json` → `appearance.options.<theme>.<id>`; exported with
  `theme export`. Switching theme keeps them (coming back finds them as they were).
- At most 12 options per theme (beyond that the studio isn't "easy" any more).
- Precedence (§ 2.4): user tweak > option > theme file. So "glow on" + a tweak on
  `fx.bloom` = the tweak, and the studio shows the option as "changed by a tweak".

This is Obsidian's **Style Settings** idea (a theme declares its settings; a menu shows them),
made declarative and typed.

---

## 6. Safety and performance

### 6.1 Three tiers of trust

| tier | what | runs where | risk | verdict |
|---|---|---|---|---|
| A — declarative | TOML: tokens, components, recipes, options | parsed in the deck, validated | none beyond looks (floor covers it) | always allowed |
| B — assets | PNG/WebP, fonts, sound files | decoded by the webview (`createImageBitmap`, `FontFace`, `decodeAudioData`) | decoder bugs, size bombs | allowed with limits; **no SVG** (scripts, external refs), no HTML, no CSS |
| C — draw code | `draw.js` | **the module sandbox Worker** (`src/plugins/sandbox/`), no permissions | infinite loops, fingerprinting, deceptive art | allowed later (milestone 6), behind a permission prompt when unverified |

Tier C design:

- Same Worker sandbox as modules (`docs/SANDBOX.md`): no DOM, no network, no vault, no
  `ib` services except `skin` (tokens, options, cell size, device pixel ratio).
- The contract is **bake, not draw**: the deck calls `draw.key({ w, h, dpr, state, tokens,
  options })` and gets back an `ImageBitmap` (OffscreenCanvas). Results are **cached** by
  `(component, state, w, h, dpr, theme hash)`. The renderer only blits cached bitmaps — the
  same way it stamps glyphs from the atlas today.
- Bakes happen on theme load, option change, resize, font change. Never in the frame loop.
- Animation is a declared **strip** (`frames = 8, fps = 12`), baked once, played by the deck.
- Each call has a 50 ms timeout and the whole bake 300 ms; over budget → that component
  falls back to its recipe, and `theme ls` says so. Three failures → the hook is off for the
  session.
- Deception guard: bitmaps are never used on protected surfaces (§ 3.2), and a key's text is
  always the deck's own text on top (a hook draws the key, never the label).

### 6.2 Performance budget

Starting numbers, to measure with `debug perf` and tune in milestone 2:

| | budget |
|---|---|
| skin cost in the frame loop | ≤ 0.5 ms per frame at 4K on a mid laptop (it's lookups + blits) |
| resolve + validate a theme (tiers A + B) | ≤ 20 ms |
| first bake on theme switch (tier C) | ≤ 300 ms total, shown as the page transition |
| baked bitmaps in memory | ≤ 32 MB, LRU |
| atlas misses after a theme switch | back to ~0 within 1 s (`takeAtlasMisses`) |

A test renders a reference screen for every built-in theme and fails if the frame time
regresses more than 10 % against `master`.

**Baseline (milestone 2, 2026-11-24, Apple M5 Pro, Node under vitest, schema-2 built-ins):**
loading all 11 built-in themes (parse + resolve + floor) **0.34 ms**; `keycapLook()` (resolve a
key look through the registry) **0.3 µs**; drawing the golden screen of `tests/skin-golden.ts`
(48 × 8 grid: frame, text, keys, a button) **0.06 ms** per theme. Far under budget; to compare
against once components (milestone 3) and sprites / hooks (5–6) land. The frame-time regression
test is still to write (milestone 3).

---

## 7. Migrating the 11 built-in themes

1. **Converter** `upgrade1to2()` (the same one the loader uses for vault themes) turns each
   `themes/*.toml` into schema 2: `[meta] border` → `[frame] style`, `[meta] widget_frame` →
   `[widget_frame] style`, `[glyphs]` stays, `[ascii] logo` → `[logo]`.
2. **Golden test**: for each built-in theme, the resolved skin from the v1 file and from the
   v2 file must be **identical**, and a rendered reference screen must match pixel for pixel
   (a few screens: home, a note, settings, the studio, a menu). This PR changes nothing on
   screen.
3. **Signatures** (a separate PR, for the user to look at, theme by theme):

| theme | signature proposal |
|---|---|
| nightshade | stays the reference: bevelled keys, round frames |
| e-ink / e-ink-night | flat keys with a 1 px outline, no shine; `☐☑` checkboxes; block caret; no glide |
| neon-district | pill keys with glow; `⟨ ⟩` buttons; option *glow* |
| abyss | outline keys, dashed widget frames; option *depth* (sonar density) |
| phosphor | square flat keys (radius 0), ascii tree, block caret, `[ ]` buttons |
| redline | heavy frames, underline keys, `◀ ▶` choices; option *alarm* (warning pulse) |
| ghost | thin single frames, `○●` checkboxes, hollow caret |
| amber | ascii frames option (*terminal* / *clean*), square keys |
| neon-ronin | pill keys, rain option (number → density) |
| graphite | flat keys, single frames, no motion — the "quiet" one |

4. `THEMES.md` gets its generated reference section; `nightshade.toml` stays the annotated
   reference file, now listing every component.

---

## 8. Themes in the STORE

The STORE already lists themes (`kind: "theme"` in `plugins/install.ts`, single `.toml`).

- **Packages** install from a git repo or a zip, into `.icebreaker/themes/<name>/`.
- **Verified** (✓, like modules): reviewed by ICEBREAKER — `theme check` passes, the floor
  report is clean on all reference screens, assets' licences are checked, any `draw.js` is
  read by a person, the preview matches. Pinned by content hash in the index.
- **Unverified** (⚠): installable. Tier A/B only → the usual "not verified" warning. With
  `draw.js` → the **permission dialog** ("this theme runs drawing code in a sandbox: no
  files, no network"), and the hooks stay off until accepted.
- The index carries `preview.png`, `schema`, `version`, `tiers` ("declarative", "assets",
  "code"), so the STORE can show what a theme is made of before installing.
- Updates: like modules (`docs/UPDATES.md`); an update that adds code asks again.

---

## 9. Milestones

Each one is a branch + PR to `master`, merged only on the user's yes; Windows bench run on
each (fonts and image decoding differ there).

| # | milestone | size | what ships | tests |
|---|---|---|---|---|
| 1 | **Registry + tokens cleanup** | M | `core/skin/` registry; `keys` and `pad` move in; hex colours in widgets become tokens; icon ids registry (glyphs unchanged) | registry field tests (bounds, fallbacks, refs); `contrast.test.ts` extended to every component floor; nothing changes on screen (golden screens) |
| 2 | **Schema 2 + migration** | M | `[meta] schema`, `upgrade1to2`, 11 built-ins converted, `theme check`, `theme upgrade`, generated docs + JSON Schema | golden: v1 == v2 resolved skin per built-in; validator messages; perf baseline recorded |
| 3 | **Components v2.0** | L | `frame`, `tabs`, `button`, `checkbox`, `choice`, `slider`, `list`, `caret`, `tree`, `icons`, `statusbar`, `tip` read from the skin, with their recipes | per component: each recipe drawn in each state (snapshot); floor (3:1 / 4.5:1) per recipe × built-in theme; hit sizes unchanged |
| 4 | **Trusted surfaces + commands + studio** | M | `ui.trusted`, protected surfaces switched; `theme set/get/doc/reset`; studio generated, sub-pages with previews, simple/all | a test theme that tries every field cannot change a protected surface (snapshot identical); command parsing + completion; studio rows == registry |
| 5 | **Options + packages (tiers A, B)** | M | `[options.*]`, settings storage, studio THIS THEME; package folders, sprites (nine-slice), fonts, sounds; charter checks in `theme check`; then the **signatures PR** for the built-ins | option precedence; asset limits (oversize, wrong type, SVG refused); packages load on Windows (paths `\` → `/`) |
| 6 | **Draw hooks (tier C)** | L | `draw.js` in the sandbox Worker, bake + cache, strips, timeouts, fallbacks | a hook that loops / throws / is slow falls back; cache hit rate; frame-time regression test; no bitmap on trusted surfaces |
| 7 | **STORE for theme packages** | M | package install/update, tiers shown, verified review checklist in `docs/REVIEWING.md` | install from git/zip fixture; unverified + code → permission dialog; hash pinning |

Order rationale: 1–2 are invisible and make everything after them cheap; 3 is the visible
win; 4 must land **before** anything third-party can draw more (5–6); 6 is the only risky
one and can slip without blocking the rest.

Docs touched along the way: `THEMES.md` (rewritten around components, keeps "a theme can be
three lines"), `GUIDELINES.md` (a theme / a module: the floor, `icon()` instead of glyphs),
`PLUGINS.md` (`ib.skin`), `SANDBOX.md` (draw contract), `REVIEWING.md` (theme review),
`src/vault/starthere.ts` (the vault docs, as for every visible change), CHANGELOG / WHAT'S NEW.

---

## 10. What we borrow

| from | what | where it lands |
|---|---|---|
| **VS Code** — [theme colour reference](https://code.visualstudio.com/api/references/theme-color), [`contributes.colors`](https://code.visualstudio.com/api/references/contribution-points#contributes.colors) | colours are registered ids with defaults; extensions contribute their own ids that themes can then set | the registry (§ 2.2); modules registering components (§ 3.3) |
| VS Code — [`workbench.colorCustomizations`](https://code.visualstudio.com/api/extension-guides/color-theme) with `"[Theme Name]"` scopes | per-theme user overrides without editing the theme | already our tweaks; kept as layer 1 (§ 2.4) |
| VS Code — [product icon themes](https://code.visualstudio.com/api/extension-guides/product-icon-theme) | icons are stable ids; a theme maps ids → glyphs | `icons` component (§ 2.3) |
| VS Code — JSON Schema for theme files | validation + completion in any editor | `themes/schema-2.json` (§ 2.2) |
| **Obsidian** — [themes as CSS variables](https://docs.obsidian.md/Themes/App+themes/Build+a+theme), and the community [Style Settings](https://github.com/mgmeyers/obsidian-style-settings) plugin | a theme declares settings in its own file; a menu renders them for that theme | per-theme options (§ 5), made typed and declarative |
| Obsidian — CSS snippets beside themes | small personal overrides on top of any theme | `theme set` tweaks |
| **WezTerm** — [colour schemes as TOML + Lua config](https://wezterm.org/config/appearance.html) | data file for looks, code only for what data can't say | tiers A vs C (§ 6.1) |
| **kitty** — [`kitty +kitten themes`](https://sw.kovidgoyal.net/kitty/kittens/themes/), [`kitty @ set-colors`](https://sw.kovidgoyal.net/kitty/remote-control/) | browse/preview themes from the terminal; change the look live by command | `theme set …` from shell and scripts (§ 4.2) |
| **Windows Terminal** — [settings UI with "open JSON file"](https://learn.microsoft.com/windows/terminal/customize-settings/color-schemes) | the same settings through a GUI and a file, neither hiding the other | the three levels on one registry (§ 4) |
| WCAG 2.1 — 1.4.3, 1.4.11, 2.3.1 | contrast and flashing thresholds | the floor (§ 3.1) |

---

## 11. Open questions for the user

> **Answered by the user (2026-11-24, 01:10)** — all four recommendations taken:
> - **Q1**: `theme set <key> <value>` is the documented form (one argument = switch theme, two =
>   tweak); `theme tweak` stays as an alias forever. *(Done in milestone 1.)*
> - **Q2**: draw-hook code in themes: yes, but last (milestone 6), sandboxed and baked.
> - **Q3**: protected surfaces: theme colours clamped harder (7:1, warning ≠ accent) + the deck's
>   own components + a fixed `⛨` double frame.
> - **Q4**: built-in themes migrated identical first; signatures in a later PR.

**Q1. `theme set <key> <value>` or keep `theme tweak`?**
`theme set <name>` already switches theme. *Recommendation:* make `theme set` the documented
form (one argument = switch, two = tweak) and keep `theme tweak` as an alias forever, so
nothing breaks and the shell reads naturally.

**Q2. Code in themes (draw hooks) — in v2, or later?**
*Recommendation:* yes, but last (milestone 6), sandboxed and baked as described; recipes +
sprites cover nearly every look first. If you'd rather never run theme code, milestones 1–5
and 7 stand on their own.

**Q3. Protected surfaces: the deck's fixed look, or the theme's colours made stricter?**
*Recommendation:* theme colours clamped harder (7:1, warning ≠ accent) + the deck's own
components and a fixed `⛨` double frame — it still feels like your theme, but can't be faked
or made unreadable.

**Q4. Built-in themes: identical first, signatures after?**
*Recommendation:* yes — the migration PR changes nothing on screen (tested to the pixel);
then one "signatures" PR with screenshots of all 11 for you to accept theme by theme (§ 7).
