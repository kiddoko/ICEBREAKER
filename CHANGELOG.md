# Changelog

## 0.7.1 — 2026-11-23

First steps, one name per thing, safety nets — from Fable's exploration of 0.7.0 (web and the
Windows bench), the 12 answers to its questions, and the Review 0.7.

**The three blockers**
- **A note emptied by mistake is never lost**: select all + delete was saved empty in under a
  second. The autosave doesn't write an emptied note any more; ⌘S, closing its tab or 30 s later
  do, and its text goes to the trash first (« … (before emptying).md »).
- **The setup no longer races**: ten enters in a row (a key held, a bouncing key) answered ten
  questions. A question takes an answer only once it has shown for 250 ms; a held enter never does.
- **The guide's first command works**: `note new "ideas"` made notes/new-ideas.md; it is read as
  `note "ideas"`, and `note new` alone is an untitled note like ⌘N.

**Your answers**
- The pages of the ◆ menu — settings, NEXUS, STORE, MODULES, the trash — are **real tabs**
  (they lived left of HOME, one at a time, and vanished when you went elsewhere).
- **Esc opens the ◆ menu only on HOME** (in a note it came over the text); **F10** opens it anywhere.
- **`exit` hides the shell**, like ctrl+\`; `quit` quits (typed by habit, `exit` closed the deck).
- **One zoom**: the « font size » slider is gone from APPEARANCE (it did the same with other
  bounds); zoom goes 25–200 %, its command `scale`.
- **Shift+backspace is a plain backspace** (a word typed in capitals lost all of it).
- **The fps counter is off by default**; **the clock's face is « segment »** (the most readable).
- **The F1 manual in French**, and up to date: The screen, Modules and the STORE, Offline: stealth.
- **The ◆ menu keeps what the menu bar doesn't have**: what's new, updates, the setup, the tour,
  log out, quit.
- **Every command answers in French** on a French deck: what a command prints goes through
  `tOutput` on its way to the screen — never in a pipe, a file, or your data (`cat`, `grep`, `ls`…);
  `usage:` and `-h` stay in English, like man pages. Modules add their French with
  `addTranslations` (`{parts}` for what changes).
- **The login page speaks the last account's language**.
- **A folder already full of things as the vault** (all of Documents…) offers an « Icebreaker »
  folder inside; a drive that isn't there is said at once (setup and `vault mount`).

**First steps**
- The login page: its links (new account, open a vault, forgot password) are in the tab order;
  enter on an empty name says what's missing; the error sits right under the card, in sight in a
  small window.
- The setup: left unfinished, stealth and the language go back to what they were (and it says
  so); esc on the first question of a setup run again leaves it; « apply » instead of « jack in »
  when you're logged in; French chapters, effects and theme descriptions.
- The boot's « press any key » breathes instead of blinking; a click beside the tour's bubble no
  longer skips a step.

**Every action has its command**
- New: `save`, `save as <path>`, `copy path | link [note]` (and `<cmd> | copy`), `tree reveal`,
  `tab close others | right | all`, `tab ungroup all`, `modules on | off | ls | open`, `setup`,
  `settings <category>`, `clock open`, `journal open`, `todo list`, `habit list`, `cal ls`,
  `log width`, `statusbar join | alone`, `fx off`.
- The note's, the tab's and the tree's menus run these commands (the log shows each click);
  settings rows show theirs (API key, updates).

**Safety nets**
- ⌘Z under an open menu, or in HOME's edit mode, never undoes something out of sight (it brought
  back files trashed minutes before, a reminder, a task's priority).
- A reminder stays on screen until it's clicked or esc'd (it went at the next key), is always
  written in the log, and reaches the system's notifications when the window is minimized.
- One deck at a time: starting it again shows the window already open
  (`tauri-plugin-single-instance`; two decks wrote the same settings).
- A picture, a sound or a PDF isn't opened as text (« stream did not contain valid UTF-8 »).
- Your real terminal asks before pasting several lines, scrolls back with shift+PgUp/PgDn, jumps
  words with ctrl+← →, keeps 10 000 lines; the shell starts ~10 lines high.
- Quitting with the page alone (▣) brings the frames back first.

**Your Review 0.7**
- Shift + wheel in a note: one line at a time.
- The status bar in **groups** like tabs; **◧ ▾ ◨ ▣ are four items** that each move.
- **NEXUS**: folders stay boxes, files are sheets with a little ASCII drawing of their kind.
- A widget's pop-up has **⚙ settings** (its module's settings).
- HOME's **✎ edit** shows only near it (or while editing).
- The log beside the shell: **›** folds it into a tab, its line drags its width; ‹ beside the
  shell puts it back.
- `cal import` refuses hidden folders, reads a CSV cell written on several lines (Outlook) as one,
  and never doubles what's already imported.

**Smaller**
- THE MENU lists each thing once (a page, not also its command and its action), lowercase,
  `[dev]` commands only with debug.
- `hlep` → « did you mean help? » (a swap counts once); a module that is off says so; `uname -a`
  gives the version; `date` in the deck's language; `pwd` says ~.
- Tabs and the status bar name pages in the deck's language; the shell's and the editor's status
  lines, NEXUS, TODO, MUSIC, LINK in French; SYSMON's « cœurs ».
- What's new shows the newest versions' chips and always the one you read.
- F6 / shift+F6 walk the parts of the screen; ctrl+shift+S is only « save as »; a middle click
  closes a tab; tips go when the pointer leaves the window; new accounts follow the system's
  « reduce motion »; `<html lang>` follows the language.
- Docs: PLUGINS.md lists every `ib.lib` export and `ib.ui` call (a test keeps it so); GUIDELINES:
  one name per thing, the same sub-commands everywhere, menus run commands.

## 0.7.0 — 2026-11-23

The UX pass: everything discoverable, nothing stretched, the deck explains itself.

- **Hover tips, redone.** They are drawn above the grid now, not in its cells: crisp (the CRT
  bend, bloom and scanlines don't blur them), placed to the pixel next to the pointer instead of
  jumping cell by cell, fading in after a short rest — and gone the moment the pointer moves, a
  key is pressed or the wheel turns (`ui/tipview.ts`).
- **Settings explain the row you're on, beside it**: on a wide enough page the whole text sits
  to the right of the hovered (or chosen) row, joined to it by a thin line, with its command and
  its default — not cut at the bottom any more. A narrow page keeps it under the list.
- **The ◆ ICEBREAKER menu looks like a menu**: a tinted button with its ▾, and a menu bar after
  it — modules · store · nexus · settings · help — like a desktop app's (a tester didn't know
  the menu was there).
- **The trash is the tree's last line**, with a bin of its own (drawn, it fits a cell) and how
  many things it holds; right-click empties it. The ⌫ above the tree is gone.
- **Terminal tabs are named after their shell** — zsh, bash, powershell, then "zsh 2" — instead
  of "icbrkr_trm" (yours once renamed).
- **The log sits on the shell's right** when the shell is wide: always in view, its filters as
  glyphs, long lines wrapped. A narrow shell keeps it as a tab; Settings → shell or
  `log side off` puts it back in a tab.
- **Proportions hold, whatever the theme.** A dragged border is kept as a share of the screen,
  not a number of cells: a theme whose font is wider or narrower no longer stretches the frames.
  HOME's rows follow its columns' width, so widgets keep their shape (they stretched to fill the
  page); what doesn't fit scrolls.
- **A widget with no room goes below the others** on the same HOME page, which scrolls to it —
  not to a new page nobody looks at.
- **Widget pop-ups take about two thirds of the screen**, and the moon behind one stays a moon,
  dimmed (it went flat grey).
- **The frames' switches side by side in the status bar**: ◧ tree · ▾ shell · ◨ panel ·
  ▣ the page alone (everything else folded away, again: back as it was — `frame solo`).
- **The status bar is yours to arrange**: drag an item sideways, right-click to move or hide
  it, `statusbar move help 1`, `statusbar hide screensaver`, `statusbar reset`.
- **WHEN? — a little calendar and clock wherever a day, a time or days are chosen**: a todo's
  due date (with *none*), a reminder, a new event (with *all day*), an alarm (its time and its
  days), a habit's or a repeating todo's days. Arrows, a click, quick picks (today, tomorrow,
  next monday, in a week) — or type it as before ("demain 9h", "+3d"). Modules get it:
  `ib.ui.pickWhen`.
- **A mini calendar under the top bar's date and time** (a click, `clock calendar`): the month,
  today, a dot on the days with events (a click opens that day in CALENDAR), the week number.
- **The setup, clearer**: *‹ back esc* and *skip tab* are buttons at the bottom of every
  question (going back with esc was said nowhere a tester looked); the vault's folder has a
  *browse…* button (⌘O) beside its field, its suggestion is where the vault is now, and tab
  completes the folder's name; the second language question is now **DATE FORMAT**, each choice
  showing today's date written that way; in a small window the choices and the buttons come
  first — the question is cut with … and long lists scroll (they ran over the buttons), and the
  chapters at the top shrink to the one you're in.
- **SYSMON shows the graphics card**: its name everywhere (WebGL), and its use, video memory and
  temperature where the system tells them without special rights (Linux's sysfs for AMD / Intel,
  `nvidia-smi` for NVIDIA) — a third tile on a wide page. The processes say how they're sorted
  ("sorted by cpu ▾", a click or s for memory) instead of a cryptic "· s".
- **NEXUS tells folders from files**: each node says what it is (folder, note, or its file kind:
  pdf, png…) in its colour, folders wear a tab, and resting the pointer on a node unfolds a small
  window above it — what a folder holds (how many folders, notes, other files, the first names),
  a note's first lines.
- **HABITS, easier to read**: the columns are named (today, the last days' initials, ▲ the
  streak), each habit says when it's due (2× a day · mon wed fri), and under the list this week
  day by day and the best streak.
- **CALENDAR imports events** from a CSV (Google's or Outlook's export, any sheet with a title
  and a date, commas or semicolons, english or french headers) or an .ics: *⇣ import*, or
  `cal import [file]`. Modules get `ib.ui.pickFileText`: the file the user chooses, read for them.
- **UPLINK's personality** (its pop-up's last line, `uplink eye|quips|blinks`): its eye looks at
  the pointer when hovered, follows it across the whole screen, or stays closed; it talks and
  blinks now and then, if you like.
- **neofetch, as a HUD**: the system, the cpu and the memory with their gauges, the graphics
  card, the vault (encrypted or plain), the uplink, the modules, the theme and its palette — and
  the right version (it said 0.1.0).
- **French, everywhere**: tips and pages' status lines written without a translation are
  translated where they're drawn (whole, by line, or by " · " part — a path or a command keeps its
  case), 90 more strings; **every date is written in the deck's date format** (Settings → you →
  date format) — empty, it never mixes languages (a French deck on an English Mac wrote its months
  in English); `ib.lib.dateLocale()` for modules.
- **Menus say what they do**: *move to the trash* (not "delete"), *remove* for a macro (it said
  it went to the trash: it never did), *empty the trash…* asks first; HOME's page squares and the
  log out row no longer cut or shout (⏻ came out halved: "to the login page").
- **Readable in every theme** (WCAG 2.1 contrast): secondary text and hints at 4.5:1 at least
  (WCAG AA), on the background, the panels and the pop-ups — five of the eleven themes had hints
  around 2:1. 82 texts written in `faint` (meant for lines) now use `subtle`: the weather's hours,
  the log's times, empty pages' help, the setup's hints…
- **For modules (BreakerMED's needs)**: `ib.ui.pickFileBytes` (a sound or a picture the user
  chooses — a tracker's sample), `ib.ui.fullWindow` (its page alone: the tree, the panel and the
  shell fold away while it's in front, and come back when it leaves), `ui.art` documented for
  scenery (no fade-in on a scrolling pattern), a sandboxed page that plays the keyboard gets F1–F8,
  ⌘ ← →, Tab and ⇧Tab (tested), and an autosave in a `.recovery/` folder of a granted folder never
  asks. Native side: the file picker reads CSV and .ics (the calendar import was refused) and sounds
  and pictures (`fs_read_bytes`).
- **A permission question that pops up while you type no longer takes your keys**: they're
  swallowed until you stop for a moment (each key pushes the wait) — on Windows, "n" answered No,
  then the next keys switched BreakerMED's autosave off and started playback. A click answers at once.
- **HOME's edit mode shows what can be dragged**: ✥ on each widget's frame ("✥ drag" under the
  pointer), a grabbing hand while it moves, the resize corner's own pointer.
- **The setup's voice, theme and sound questions are French again** (their English had changed,
  not their translation); a test now keeps every setup text translated.
- **Widgets have a small version**: at their smallest size they show the one thing that
  matters instead of a cut sentence — the calendar and the week show today and its events (they
  showed "november 2026" or letters piled up), UPLINK says who and how (its ring was cut in half),
  pulse drops its labels for the values, and every "nothing to rem…" became a short sentence that
  fits whole (`ui.textFit`, for modules too).
- **Found in the Windows and Mac passes and in Fable's review** (fixed before the release):
  - a question (yes / no, or a permission) never takes the keys you were typing: each key pushes
    its wait back, and a click in its first moment doesn't answer it (it was meant for the page);
  - the setup run again on a French deck chooses Français, not English; in a short window it keeps
    its buttons (back and skip, short when needed) and a one-line header; enter on the vault's grey
    suggestion keeps it; WHEN?: a time typed alone ("14") goes with the day you clicked;
  - small calendar widgets by the sizes HOME really gives (today's week, else today); HOME's widgets
    stop above the pages line and the "↓ more" tab has its own line; HOME follows a widget grown
    with shift+↓; NEXUS in a short page becomes a list (its nodes ran over the bar);
  - French: no English left on HOME (weather in stealth, uplink, news, the question's title, the
    week "S"), ⌘K's titles and descriptions, the setup's hints, "vue d'ensemble" / "mises à jour"
    in lowercase, the log stays « log » (the vault has the journal), Settings search finds French
    words; the article "a" no longer drawn as a key;
  - files: the picker hides the places the deck never reads (AppData, Library, /usr…), puts an
    exact name first and opens where the last pick was; reading a chosen file follows its link and
    checks again, reads a regular file only, capped, off the window's thread (text and bytes); the
    graphics card is read off the window's thread too;
  - the status bar names a page as its tab does (nexus), `statusbar move` skips what isn't drawn;
    the tip goes when the window resizes; a new terminal takes the smallest free number (zsh, not
    zsh 2 alone); hints at 4.5:1 contrast like any text (WCAG AA).
- **Ctrl + wheel changes the interface scale on every system**, one step a notch (Linux and
  Windows mice send lines: it took ~14 notches). **⇧ + wheel goes to what's under the
  pointer**, like the wheel — it walks the tree only over the tree (Settings scrolled the tree).

## 0.6.3 — 2026-11-23

The serious bugs: a layout that comes back, a setup that holds, Linux.

- **Quit and relaunch: everything comes back as you left it.** The tree and the shell shown or
  hidden, the shell's height, its tab and its terminals, the open page (SETTINGS, STORE…), the
  focus, terminal and ibsh tabs, and the window's size and place join the tabs, groups and
  frames already saved. Quitting (⌘Q, the close button, the Dock) now goes through the deck,
  which writes all that before the app closes — before, the last moments' changes were lost.
  A page that doesn't answer never keeps the app open: close it again within 4 s and it quits.
  With a page open over the tabs (SETTINGS…), the tab under it comes back under it.
- **The setup survives going back and forth.** Leaving EYE CANDY for THEME kept the preset
  tried on, and the next theme saved it as its own: a half-finished setup left heavy effects
  (the WebGL curvature) on, and on Linux every login crashed. Previews now wait for the cursor
  to rest, are undone when you leave without keeping one, and the curved glass keeps one WebGL
  context for the whole run.
- **A start that crashed makes the next one safe**: effects off for that run only (your
  settings stay as they are; touching ✦ fx brings them back), said once the desktop is there.
- **Stealth mode in the setup** applies as soon as it's chosen; the AI question, the location
  and Google are skipped; skipping the question leaves stealth as it was (it switched it off).
- **The vault goes where you said.** Tab on the folder question skipped it and dropped what was
  typed (a Linux reflex): tab now completes the folder name; a relative path is refused at once;
  a folder that can't be used is said instead of silently keeping the default one. The default
  folder a new account was given first (Icebreaker-<name>) goes once the vault is elsewhere — only
  if it holds nothing but the deck's own notes (`vault_discard_seed`).
- **The setup speaks your system**: Windows paths and PowerShell on Windows (a Mac path was the
  example everywhere); a long list (the themes) scrolls with the cursor instead of running out
  of its box.
- **Encrypting in the setup: a wrong password asks again**, and says so in the question (it gave up and started the tour);
  cancelled, the deck asks whether to try again. The same check guards `vault rekey` and
  `vault recovery`.
- **A new account's approver is checked as soon as it's typed**, not after the whole new
  account (`account_check` checks a password without unlocking anything).
- **Linux**: the AppImage leaves GLib out and uses the system's (Arch-like systems died at
  launch: `undefined symbol: g_once_init_leave_pointer`); it carries the GStreamer plugins
  WebKitGTK plays sound with (`bundleMediaFramework`), the `.deb` depends on them. README:
  Linux install, and the GStreamer packages if there's no sound.
- **Keys**: AltGr characters (# { [ | on AZERTY) type on Linux — AltGr+" went to tab 3;
  ⇧Tab is recognised by its key (Linux); File → Save / Save As (⌘S / ⌘⇧S) in the macOS menu bar,
  and ⌘⇧S in a note is *save as* (elsewhere it still shows the shell).
- **A page that plays the keyboard keeps** Tab / ⇧Tab, F1–F8 and ⌘ / ctrl + ← → besides ⌘Z
  and ⌘S (BreakerMED's tracks, octave and positions); esc gives the keys back, and F1 is the
  manual everywhere else (core/input.ts `rawPageKey`).

## 0.6.2 — 2026-11-22

Fixes from the 0.6 and 0.6.1 reviews.

- **Permissions**: taking *Play sound* away from a module stops it at once — a sandboxed
  module's audio stream (BreakerMED) was checked against its plugin.json, not against what
  you allow now. Opening the stream is written in the access journal (◈ access).
- **A module's page can keep its tab open**: its `close()` is awaited (a "save?" can answer
  cancel), and quitting stops when a page says no (docs/PLUGINS.md).
- **Like a browser**: double-click (or enter) on a note in the tree opens it in the tab you're
  on; a middle click or shift+click, in a new tab. The mouse's back / forward buttons (a
  two-finger swipe on a Mac) walk the notes the tab showed; with shift, the tabs.
- **♪ on a module's tab** while it plays: a click mutes just that tab (⊘), it keeps playing.
- **Esc** with nothing to close or leave opens the ◆ ICEBREAKER menu; the menu's labels
  start at its left edge (the page you're on shows ✓ in place of its mark).
- **Alt+F4 quits from anywhere** on Windows / Linux (a page that plays the keyboard, your real
  terminal, a pop-up or the login screen kept it).
- **Frame borders**: the system pointer shows ↔ / ↕ over them; the shell's top border lights
  with a handle too.
- **Settings**: a line of air under each setting; the *Keyboard sounds* switch is gone, the
  mixer's Keyboard fader decides (0 = silent, the default).
- **UPLINK's Japanese voice** reads the answer as it comes when the AI writes no `<say>` line.
- `theme <name>` switches to it; a settings.json saved with a byte-order mark (Notepad,
  PowerShell 5.1) is read; `cmatrix` says it shows the theme's screensaver; the top bar and
  CALENDAR's keys line no longer draw over themselves (`debug layout pages`: 329 → 51).

## 0.6.1 — 2026-11-21

- **The chat widget**: one click and you type. Its field is on its top line; a click (or a
  letter) scrolls HOME or the side panel to the widget's top. A click never opens the pop-up
  (double-click, or enter on an empty field, does).
- **Smoothness** (Settings → APPEARANCE → Motion): with V-Sync, 60 or 120 frames a second at
  most; *auto* (the default) is 60 on battery and 120 on the mains, following the plug.
- **`say` speaks at once**, in Japanese mode too (it waited on an AI translation); `say -t`
  translates first. Translations already made are reused.
- **Alt+F4 closes ICEBREAKER** on Windows and Linux.
- **The ◆ menu's lines line up.**
- **⌘S / ⌘⇧S reach a module's page that plays the keyboard** (like ⌘Z): BreakerMED's save and
  save as.
- **Lighter**: the bloom keeps its own small copy of the screen instead of reading the whole
  screen 20 times a second (WebKit kept a full copy each time: hundreds of MB); the CRT
  curvature composes at most 30 times a second.

## 0.6.0 — 2026-11-21

The UI overhaul ("Refonte UI"): the screen is made of frames you arrange, every frame has its
tabs, and six modules are redrawn.

- **Easier to handle** — a ghost under the pointer when you drag anything, the place it
  lands lit; tabs dragged between groups and out of them; *Move to ▸* in every tab's and
  frame's right-click menu, ↔ / ↕ handles on hover. HOME's edit mode has a **✎ edit**
  button and ⌘E / ctrl+E. The chat widget is a real field (click, type, enter). The tree
  closes like the panel (**◧ tree** in the status bar, the panel is now ◨). The TODO widget
  scrolls. RGB split leaves the bars and pictures alone; bloom shows at 100 %. A row of air
  under the top bar; world clock strips line up. **macOS: a real menu bar** — ICEBREAKER
  (settings, updates, log out), File (new note, journal, close tab…), Edit, View (zoom,
  tree, panel, shell, effects, fullscreen), Window, Help.

- **Permissions in plain words** ([docs/PERMISSIONS.md](docs/PERMISSIONS.md)) — no surprise:
  everything that can reach your notes, your AI, your terminal or the internet has a name
  you can read, a level, a moment when you're asked and a switch to take it away.
  - Thirteen permissions in four levels (low, medium, high, total): *Read your notes* and
    *Change your notes* (the whole vault or **one folder**: `vault:write:songs/`), *Use your
    AI*, *Play sound*, *Drive your music player* and *Read your audio files outside the
    vault* (`media` was both, without saying), *Your Google Calendar* (or only reading it),
    *Read the other modules' counters*, *See the computer's details*, *Notify you and talk
    to you*, *Run the deck's commands*, *Go online* (**one named host at a time**, through
    the deck's native side: `ib.net.get`), *Type in your real terminal*.
  - **A new dialog** when you switch a module on: who it is, where it comes from, each
    permission with its level, what it can do without asking, what it never can. The answer
    starts on No as soon as one line is high-risk.
  - **High-risk permissions are asked again the first time they're really used** (no · this
    time · always); **every command for your real terminal is shown first**.
  - **Settings → PERMISSIONS**: ICEBREAKER itself (stealth mode, what the AI may read, your
    real terminal, the access journal), then every module — the deck's own too — with each
    permission, its level and its last use; one click takes it away or gives it back, at
    once, the module keeps running. `plugin perms`, `plugin revoke`, `plugin grant`.
  - **The access journal**: who used which permission, when, on what — names only, 30 days,
    on this computer only. The LOG's new `◈ access` filter.
  - **What the AI may read** (`ai.reads`): nothing · what you give it (a note you name, pipe
    or have in front) · your whole vault. The top bar says "the AI reads …". A new account
    starts on "what I give it"; yours keeps the whole vault.
  - **Your real terminal** (`shell.bridge`): no deck command · your notes only · notes,
    timers and alarms.
  - **An update that asks for more is held**: the dialog shows only what's new; say no and
    the version you have keeps running. A module you remove loses its approval.
  - **Closed on the way**: a module with no permission could send words online through
    `weather` and `news show`, open your browser, log you out (`keys.run("lock")`) and show
    unsigned notifications; modules now run only the commands classed for them (an
    allow-list, guarded by a test); stealth mode is checked by the native side too.
  - **The STORE says what it can do**: a module put in the vault by hand has no source to
    update from — the button is "reinstall from the STORE" (it was "update", and did nothing);
    an update's answer shows where you clicked, not only in the LOG. At start, a module that's
    off says why in a few words ("its code changed since you approved it") and what to do,
    again once the desktop is there (it was "needs you — see the LOG").
  - Nothing is asked again of an account made before: what you approved is translated once.
    Module authors: `"api": 2` in plugin.json (docs/PLUGINS.md).

- **Frames** (docs/FRAMES.md): the screen is a layout tree (`src/workspace/layout/`) solved
  into one rect per frame — the tree, the page, the side panel, the shell. Nothing saved =
  the classic screen, so every account keeps its screen. `layout preset classic | shell-right
  | panel-left | tree-bottom`, `frame move <tree|panel|shell> <side>`, `layout reset`; drag any
  border between two frames to resize it; `frame fold` folds a frame into a one-cell strip
  with its name (a click opens it again); ⌘Z undoes each change.
- **Tabs on every frame's border**: the top bar is one row — **◆ ICEBREAKER ▾**, the deck's
  menu (MODULES, STORE, NEXUS, settings, manual, what's new, updates, log out; their keys
  unchanged), UPLINK ■ and the clock. Each frame's tabs sit above its line, a half-block bar
  under each; the one shown is lit when its frame has the focus. The shell's frame has your
  terminals, ibsh and the log; VAULT and PANEL a tab each. A page without a tab (STORE,
  settings…) shows first, × or esc closes it.
- **Thicker, readable tabs**: an icon and the name, no number (the numbers show while ⌘ /
  ctrl is held), 15–24 cells, the rest in "▾ +N". Drag a tab to move it; drop it onto another
  and they become a **group** (`▣ name 3`: hover lists them; right-click: rename, take out,
  ungroup). Groups are saved with the session.
- **A tab in any frame**: drag a tab onto another frame (it's outlined), `tab move <n>
  tree|panel|shell|main`, or right-click → Move to. The frame shows it instead of its own
  content; a click on the frame's own tab brings that back. Keys and the status bar follow
  the page the focused frame shows; where each tab lives is saved with the session.
- **HOME is pinned**: always the first tab, ⌂, no × — ⌘W, `tab close` and "close others"
  leave it. It can still move to another frame.
- **WEATHER redrawn**: an animated sky (rain, snow, storm flashes, fog, sun, the moon at
  night) that sets the mood of the page, the next 24 hours and the week; the page reflows at
  any size; HOME's widget and its pop-up on the same sky (one line under 5 rows).
- **CLOCKS redrawn**: timers as braille rings that empty, a stopwatch with a sweeping dial and
  laps (best green, worst red), the day's course from midnight to midnight, world clocks
  with their day strip. **Wake-up alarms**: `clock alarm 7:30 [label] [--days mon-fri]`,
  list / rm / on / off / snooze; a ringing screen (snooze, stop — keys, mouse, gamepad),
  sound and a system notification, respecting mute and stealth. They ring while ICEBREAKER
  runs. `timer 15s` is 15 seconds (it was read as 1:05).
- **STATS redrawn**: tiles that say what they mean (the value, ▲▼ against the period before,
  a sparkline, a line in words), a real chart with its average, facts (per day, best, days in
  a row…), a pie of activity by module and the weekdays; 7 d · 30 d · 90 d · 1 year.
- **NEWS** — each widget answers one question, *what do I show?*: your area, your
  country's top stories, the categories it ticks, or your own words. Its header always says
  it; a click on it changes it. The new **NEWS page** (`news page`) has the same four as
  tabs, "à la une" big and the article read on the right. Old settings carry over (a widget's
  categories, else the old topic, else your area). Categories show this week's news.
- **MOON** — its own page: the moon drawn in half blocks and lit from the sun's side, its seas
  and earthshine, the next four phases, the month as a calendar of moons (←→ a day, ↑↓ a
  week, t today). The phase comes from the sun's and the moon's positions (Meeus): to the
  hour — **it was five days off before**. Light themes draw the moon in its own night.
- **SYSMON redrawn**: CPU and memory in big digits with their graphs, the cores as bars, the
  busiest processes (by cpu or memory), the disks, the network's rates, the load average.
  `system.rs` reads them with sysinfo's disk and network features (no new crate); nothing
  leaves the computer.
- **WHAT'S NEW** for a minor version gets louder: sparks, a drifting starfield, the version
  decrypting in, its headline typing itself out (standing still with reduce motion).
- **Security** (docs/SECURITY_AUDIT.md #60–62): rearranging the screen (`layout` beyond
  looking, `frame`, `tab move / group / ungroup / groupname`) and your alarms beyond listing them
  are refused to modules and to your real terminal (which may still set an alarm) — type them in
  ibsh; `sysmon.stats` gives a module the vitals only; an alarm set by a line with an origin
  rings (one clock per deck). A tab shown in the shell's frame gives way to the shell whenever
  the shell is asked for, so nothing typed for the shell lands in a page.
- Fixes: a second copy of a widget was refused ("already on the grid") while HOME still had
  its default layout; TODO's "↓ N more" badge was drawn over a task; the tree drew a row
  under its frame in a tiny window; `layout reset` puts the shell's height back; a half
  block dimmed behind a pop-up is dimmed in both halves (no stripes).
  A module switched off or removed closes its pages' tabs; a tab whose frame isn't on screen
  (hidden, or dropped by a narrow window) is in the page's tabs meanwhile; ⌘W / Ctrl+W closes
  the tab you're looking at; `launch nexus` (a module's name) opens its page; `news open`
  opens the NEWS page; the confirm dialog wraps long lines (a module's permissions were cut);
  the boot's plugins line is short, the reasons in the LOG; the STORE offers "update" only
  when there's a newer version.

## 0.5.5 — 2026-11-21

- **CRT curvature really bends the picture** (`fx curve`, Settings → Effects): the screen bulges
  like the glass of a tube — lines of text bend towards the edges, the corners pull in. One
  WebGL canvas (`src/core/crt.ts`) composes the screen, its glow, bloom, colour fringes and
  the CRT lines through a barrel warp; the mouse goes through the same warp and the caret
  through its inverse, so a click lands on the letter you see. Only while the curve is above
  0 (the rim and reflection overlay stays); no WebGL: the flat picture with the overlay.
- **The chat widget takes your typing** (HOME and the side panel): with it chosen, the letters
  you type open its conversation with them already in the field (they used to fire the
  page's shortcuts); a click on its "› type here…" line opens it too. Core widgets can take letters
  (`WidgetSpec.onText`).
- **The encoder pack** (`encoders install | remove`) and `ib.audio.encode`: modules export
  MP3, M4A, OGG and Opus (docs/PLUGINS.md, SECURITY_AUDIT.md).

## 0.5.4 — 2026-11-21

- **Modules can play sound** (for a tracker, a drum machine, a game): a new permission
  **`audio`** and `ib.audio` — a sampler the deck mixes on the exact frame (an AudioWorklet:
  `src/core/mixer.ts`). A module loads samples and sends events dated on the audio clock;
  `interp: "none"` gives the Amiga's stepped grit; `decode` reads wav, mp3, m4a…. 64 voices
  and 32 MB per module, silenced when it's switched off. Settings → SOUND → mixer gets a
  **Modules** fader, the status bar shows **♪ the module** while it plays (a click, or the new
  `audio stop`, silences it — and tells the module, `ib.audio.onStop`, so its song stops too).
  A module can also compute its own sound and stream it (`ib.audio.stream()`: one line to an
  audio node of its own, ~30 ms from a key to the sound) — synths, effects, any instrument.
  docs/PLUGINS.md, SANDBOX.md, SECURITY_AUDIT.md (O21).
- **Binary files for modules**: `ib.vault.readBytes / writeBytes` (256 MB — a song's export —, the same permissions
  and walls as notes); natively `vault_write_bytes`. `ib.vault.list(dir)`: a folder's files of
  every kind (`vault:read`). Tested from the sandbox (`tests/sandbox/sbx-audio`, and the escape
  tests try the new doors: closed).
- **Pages that play the keyboard** (`rawKeys`: a piano, a tracker, a game): letters, digits and
  space come as keys with their place (`code`), not as text — a piano works on AZERTY; every alt
  combination is the page's on every system (alt + arrows too), ⌘Z / ⌘⇧Z reach it, esc gives the
  keys back to the deck (the tree takes them). SHORTCUTS page, F1 manual.
- **What's new**: after an update, a short WHAT'S NEW page opens once (once per version and
  per computer; never on a fresh install or during the setup): the version big, what's new,
  what's fixed, in English or French. Again with `changelog` (`whatsnew`), Settings →
  UPDATES → *What's new*, or THE MENU; ←→ or the version chips go through the older ones.
  A minor version (0.6.0…) gets a bigger "release" page. The notes ship with the app
  (`src/whatsnew/notes.ts`), not in your vault.
- **Dialogs: the answers always bottom right** — the way out (No, close) on the left, the
  way forward (Yes, open) on the right, in every dialog, widget pop-up and THEME STUDIO's palette; ← → point at them.
  A question whose safe answer is no (delete for good) still starts on No.
- **Top bar: UPLINK ■** instead of the AI's name and model: the square is green when your AI
  is there, amber while it thinks, red when it's off (the theme's colours); its tip says which
  AI, a click opens it. Narrow, the square alone.
- **Nothing overlaps or gets cut in a small window**: the status bar and the page headers drop
  the least useful things first. Pages fixed at small sizes: MODULES, NEXUS, BLOCKS,
  SHORTCUTS, STORE, CLOCKS (titles shrink, buttons go), FOCUS (the buttons wrap), WEATHER (the
  numbers and the 24 h curve stay above the week), SYSMON (as many facts as fit), TRASH (the
  count never covers the title; a very narrow page shows its buttons' keys alone), THEME STUDIO (a value gets at most half its row), JOURNAL
  (under 48 cells the page alone), the tab bar.
- **Gamepad buttons in pixel art**, and which kind of pad is plugged in (Xbox, PlayStation,
  Nintendo): `debug pad` shows them.
- **For developers**: `debug layout` draws the screen at 14 sizes and lists what is cut or
  drawn over another text (`debug layout pages`: every page, `debug layout show`: live
  marks); `ui/layout.ts` has `Bar`, `stack`, `cards`, `sizeClass` (modules: `ib.lib`); a test
  refuses new hand-made spacing (docs/LAYOUT.md).
- **NEWS**: the featured article says "à la une" and its category first; a summary's line
  breaks become spaces ("CULTURE Dakar", not "CULTUREDakar") and a cut summary ends with …;
  in list mode only the headline under the mouse scrolls.
- **FX panel**: a preset's description never covers its name (cut with … when the row is
  short).
- **ibsh: `/dev/null`** works like in any shell: `> /dev/null` throws the output away (it
  made a file `dev/null` in the vault), `< /dev/null` reads nothing.
- **Tabs**: never narrower than 12 cells, so a bit of each name stays readable ("3:journ…";
  with many tabs only the numbers were left); the others go in "▾ +N".
- **Releases**: the CI's release only becomes "latest" once the update file (latest.json) is
  attached — installed apps never see a release they can't install.

## 0.5.3 — 2026-11-21

- **Select and copy text in ibsh**: drag over what a command printed, double-click a word,
  triple-click a line, then ⌘C (Ctrl+C on Windows / Linux). Ctrl+C with nothing selected still
  stops the command. Right-click → Copy / Select all too. ibsh and the real terminal use the same
  selection now (the terminal gets the triple-click).
- **⇧⌫ deletes the whole previous word** in notes and every text field (⌥⌫ on a Mac and Ctrl+⌫
  on Windows / Linux still do), and in ibsh's command line.
- **The tree: ⇧↑ / ⇧↓** walk file by file with the preview tab, like ⇧ + wheel.
- **Settings and the trackpad**: the wheel or a two-finger swipe moves the row you're on (over
  the categories: the category) — it did nothing when the category fit on the screen. Over a
  slider a trackpad steps it 1 at a time, a step every 10 px (a swipe and its momentum used to run
  it far away); a mouse notch is still one step.
- **Suggestion lists show when the field already has text** (Settings → YOU → Date format, a
  model, a city…): ↓ or ▾ opens every choice with the current one picked; typing shows what
  fits. Fixed once in the shared prompt.
- **`say` speaks with the voice and language chosen in Settings → VOICE**, like UPLINK: in your
  real terminal too (it was macOS's own `say`, with the system's voice — `command say` still is);
  a voice chosen for another language is no longer used for this one; in Japanese a text that
  isn't Japanese is translated first by your AI, like UPLINK's answers.
- **TRASH: delete permanently**: a button and `del` on the TRASH page, *✕ empty the trash*, and
  `trash purge <n>` / `trash empty` in ibsh. It asks first and says it can't be undone (no ⌘Z, no
  copy). It is the only way the deck erases anything, only inside .trash (the native side refuses
  anything else), and only yours: a module or your real terminal can't.
- **Effects**:
  - the **RGB split** only splits what's drawn — text, frames, glyphs — never a background (it
    tinted every panel red and blue). It's drawn from a layer of its own: about 3× cheaper
    (8.5 → 2.7 ms a pass in the browser);
  - **bloom** now comes from bright things only (it used to blur the whole screen, backgrounds
    too: a grey haze) and its slider sets how far the halo spreads as well as how strong it is
    (50 % ≈ 3 px, 100 % 5 px, 200 % 8.5 px); its help says what it does in one sentence. No copy
    of the screen is made for a theme without bloom;
  - **CRT flicker speed** (Settings → APPEARANCE → Effects, `fx flicker 150`);
  - **CRT curvature** (`fx curve 0-100`, off by default; heavy 40, party 100): rounded screen
    corners, a darker rim and a soft reflection — a still overlay, no cost per frame.
- **NEWS headlines no longer stay scrambled** ("RK=WD P[1I*U…"): their "decrypt" reveal waited
  for frames that never came when animations are off (frames per second at 0) — now the text shows
  at once then, and the same for every reveal that stays on screen (MODULES, NEXUS, widgets).
- **Frames per second at 0** (no animations): the boot logo and the login page still play (the
  logo froze mid-scramble until a key).
- **WEATHER**: when open-meteo answers without a forecast (an error, the network not up yet at
  start), the widget says so and tries again a minute later — no more "Cannot read properties of
  undefined"; the pop-up's "no forecast yet" is wrapped instead of cut at both ends.
- **TRASH**: the restore button cuts a long path in the middle (its start and the file name kept)
  instead of running off the page; in a narrow window the buttons take short labels (↩, to…,
  open, ✕ delete) so "delete permanently" never falls off the edge.
- **THEME STUDIO**: a colour **palette** (18 hues × 10 shades at the saturation you choose,
  greys, the theme's own colours; arrows, mouse, gamepad; the #hex field still typable), and
  **↺** on every changed knob to put the theme's value back. A click on a value makes that row
  the one you're on (a colour opens the palette); ↑↓ skip the section titles and stop at the ends
  (a click changed the accent while enter still pointed at the theme row).

## 0.5.2 — 2026-11-21

- **`exit` quits ICEBREAKER** (typed in ibsh), like ⌘Q / Alt+F4: open pages save, the vault
  locks, an update waiting to be installed "by itself" installs. `quit` does the same. In a
  script, `exit` only ends the script; in your real terminal, `exit` is still that shell's own.
  Hiding the shell is ctrl+` (it used to be `exit`).
- **One `journal` command**: `journal` opens today's page, `journal "text"` adds a line to it
  without opening it (`date | journal` too); one word that names a day (`journal yesterday`,
  `journal 2026-11-05`) opens that day. `today` is the same command. Ctrl+J still opens the
  journal; THE MENU has *Journal: add a line*.
- **TODO reads your notes**: every open `- [ ]` written in a note shows in the TODO page and
  widget, under your tasks, with the note's name. Ticking it there writes `- [x]` on that very
  line of the note — and refuses if the line changed since; ⌘Z unticks it. In the shell,
  `todo` lists them (`notes/x.md:12`) and `todo done notes/x.md:12` ticks one. Each note is
  read once, then again only when it changes (fast on a big vault, encrypted or not). HABITS
  stays its own list. Modules get `ib.vault.modified()` for the same.
- **`self-destruct` is gone**: the command, its setting (DANGER ZONE) and its native side.
  Nothing in the deck deletes your vault for good; to get rid of one, delete its folder.
- **The real terminal on Windows**: `exit` in PowerShell now ends that tab properly ("process
  exited — press enter to start a new shell"); it used to stay dead.
- **What you type right after a terminal (re)starts** isn't lost any more: it waits for the shell.
- **Quotes**: “typographic” double quotes work like "…" in ibsh; a quote left open says so
  (`a " isn't closed`) instead of doing nothing; `note` says which note it created or opened.
- **Settings on Windows / Linux**: key hints read Ctrl+K, never "⌘K (ctrl+K)". A widget
  pop-up's hint no longer ends cut in the middle of a word.
- **⌘A / Ctrl+A** selects the text of the search fields of Settings, SHORTCUTS, BLOCKS and the
  STORE (what you type next replaces it).
- **`plugin reload`**: a module's page that was open switches to the new code (a sandboxed
  module's tab no longer stays frozen on its last frame until reopened); its widget's pop-up too.
- **Releases**: the installers' signatures (`.sig`) are attached to the release too; the CI's
  actions are pinned to a commit. Docs: issues and Discussions in English or French;
  maintainers by invitation; a patch version when a batch of fixes is tested on Mac and
  Windows, a minor version at the end of each big step (0.6 = the interface overhaul).

## 0.5.1 — 2026-11-21 (fixes from the first tests on Mac and Windows)

- **Sliders move 1 by 1**: dragging follows the pointer to the pixel, holding speeds up
  smoothly (always one step), every wheel notch is one step (Mac mouse, trackpad,
  Windows); sound previews are throttled, not the value.
- **Space in Settings** acts on the row you're on: a box ticks, a choice cycles, a
  slider goes to 0 and back (no 0 in its range: its default and back); it never scrolls the page.
- The **STORE's search bar** is the same as everywhere else. **Chromatic aberration**
  eased in (100 % is the old 40 %).
- **Shell**: ctrl+C (⌘X on a Mac) stops the running command or its question; Tab quotes
  names with spaces; **Ctrl+J opens the journal**; `login` says who you are; new
  **`say <text>`**.
- **The real terminal**: errors from `ib …` come back in red with their exit code;
  PowerShell starts much faster and keeps the deck's output; key hints show ctrl / alt
  on Windows and Linux.
- **`factory-reset` doesn't exist at all in a release** (only in dev-tools builds).
- **Dates**: one reader for every form, English and French (`+1h`, `1h`, `19:00`, `19h30`,
  `demain 9h`, `ven 18h`, `fri 6pm`, `24/12 9:00`, `ce soir`…) for REMINDERS, `todo
  --due` and `cal add`; an empty time means in 1 hour, without an error.
- **⌘Z**: adding in TODO, REMINDERS, HABITS and the calendar can be undone; uninstalling
  a module is one step, undoable only right after.
- **Voice**: silent until the session is ready, then the greeting; notifications are read
  for their content, never "ICEBREAKER".
- **Google Calendar on Windows** connects (the sign-in no longer waits on one call); the
  setup's calendar choice is kept.
- A note sent to the trash closes its tabs and leaves its pins (one ⌘Z brings it all back).
- `remind "test" 19:00` is a reminder called "test": a word is a sub-command only when
  what follows fits it.
- **shift + wheel walks the tree from anywhere** (not only over it; a slider keeps its wheel).
- Small things: NEWS is labelled with the right country when the language has no region
  ("fr" → FR, not US); no "settings save failed" in the console before login; the login
  card's line saying what a step is for wraps instead of being cut.

## 0.5.0 — 2026-11-20 (first public release)

- **Test software, said everywhere**: a big warning at the top of the README and in
  DISCLAIMER.md (store nothing sensitive, back up your vault, no warranty, how to help:
  Issues, Discussions, modules and themes); the same on the **login page**, at **start-up**,
  on a **READ THIS FIRST screen of the setup nobody can skip**, in the Welcome note, START
  HERE, the F1 manual and the site. The docs were checked again against the code (no broken
  link, no command or file named that doesn't exist; what was tested where is said plainly:
  macOS only for the encryption, the sandbox and the security fixes).
- **From a tour of the interface**: the F1 manual is a page to read (no Markdown symbols);
  a page opened from ibsh no longer takes the keyboard away from the shell; `open START
  HERE/README` works without quotes; the start-up shows the real version; hints that were
  too pale or cut are readable; the question a plain vault's newer settings ask answers
  "no" on enter; UPLINK says plainly that Claude Code can't read an encrypted vault.

- **A full security review, and what it fixed** (docs/SECURITY_AUDIT.md #32–52). The sandbox
  had ways round: `ib.modules.call("shell", "run", …)` ran any command as you, pipes and `>`
  in the shell ignored the `vault:read` / `vault:write` permissions, `.ICEBREAKER/` in
  capitals reached the protected files on a Mac or on Windows. Now **what a module has the
  deck do runs as that module** for its whole run (`src/shell/origin.ts`), the refused list
  is "what's allowed" (`src/shell/privileged.ts`), names are compared the way disks read
  them, a module never runs with more permissions than you approved (an update asking for
  more stays off), says who it is when it asks you something, and can't take a built-in
  module's id or another module's commands. **A plain vault can no longer change your
  password or your keys**: from a vault that isn't encrypted, never a password, never the
  settings that hold commands, the rest only after a yes; "open a vault" can't take an
  account over. Claude Code loads only your own settings (no hook from the vault) and can't
  write its own set-up. `voice install` checks each download's SHA-256. `vault export` and
  self-destruct check your password natively. Settings stay in their ranges (a text size
  of 0 no longer leaves a deck nobody can use); new file names can't hold control
  characters; a big note no longer slows every frame. `npm run app:mac:release` builds the
  macOS release without the developer tools. A module's approval is for its code too
  (a fingerprint): changed without you, it stays off. Tested for real in the macOS app:
  both escape modules, a forged plain vault, a planted Claude Code hook, 2 000 notes.
  New tests: `tests/origin.test.ts`,
  `tests/sandbox/sbx-bare/` (a module with no permission at all).

- **Modules from the STORE and the vault run in a sandbox** (a Worker, `src/plugins/sandbox/`):
  no page, no native bridge, no network of their own; every `ib` call is a message checked
  with their permissions; their pages and widgets are drawn in the Worker with the same kit
  and copied by the deck. A module written to escape found every door closed
  (`tests/sandbox/`, docs/SANDBOX.md).
- **One UI kit** (`src/ui/kit.ts`, docs/UI_KIT.md): one text field (`Field`) for every search,
  prompt, password and "add…" line — 16 hand-made ones replaced; one checkbox, one ‹ choice ›,
  one row of tabs, one button (now with `quiet` / `disabled`), the file browser for modules
  too (`ib.ui.pickFolder / pickFile`); word wrapping through `wrapWords` everywhere. A test
  keeps it that way. Modules get it all as `ib.lib.*`.
- **Getting ready to be public**: [DISCLAIMER.md](DISCLAIMER.md) (English and French: a hobby
  project, vibe-coded by someone who isn't a developer, never audited, no warranty), the same
  warning in the README, the setup, START HERE and the F1 manual; SECURITY.md, CONTRIBUTING.md
  (how a change gets in, who decides), CODEOWNERS, templates, docs/CREDITS.md (licenses),
  docs/REVIEWING.md (how to review the project). The STORE says **✓ verified** (reviewed in the
  official STORE, its code there) or **⚠ not verified** — with a warning to accept before
  installing — and `plugin install user/repo` warns too. Updates now come from this
  repository's releases. Fixed (SECURITY_AUDIT #26–31): a module's `main` could write anywhere
  in the vault; text read aloud and a Claude Code model name could pass as options; developer
  tools only in `--features dev-tools` builds; the dev server out of the published CSP; the
  Google agenda cache written `0600` from the start. WEATHER credits Open-Meteo.
- **Updates in the app** (docs/UPDATES.md): Settings → UPDATES and `update` — look every day /
  at start / never, download by itself, install by itself (modules at once, ICEBREAKER when
  you quit) or ask first; `update install`, `update download`, `store update [id | --all]`.
  ICEBREAKER's updates are signed (tauri-plugin-updater, the key in `~/.tauri/`): an
  unsigned one is refused. `scripts/release-update.mjs` signs and writes `latest.json`;
  CI signs Windows / Linux when the secret is there. Stealth mode looks for nothing.
- **Modules can need other modules** (`requires` in plugin.json, src/plugins/deps.ts):
  installed first, switched on first, woken first; switching off / removing one others need
  asks and takes them along; a need not met keeps a module off and says what's missing.
- **The STORE in the shell**: `store info <id>`, `store update`, install / remove / enable ask
  in the shell (with `--window`: in dialogs, what the buttons use); `plugin search` = `store
  search`; `store`, `update` and `config set updates.*` are refused to modules.
- **Settings read better**: small headings inside each category (APPEARANCE: Screen, Motion,
  Text, Performance, Effects, Screensaver and start…) with a line of air above each.
- **The TERMINAL is a module** (`core-packages.ts`): the shell panel, your real terminals,
  `term`, `script` and the terminal tab. Off: no panel at all, commands still run from THE
  MENU / BLOCKS / macros and what they ask comes as dialogs; the shell settings grey out.
- **Every built-in module is in the STORE** (official index, `"builtin": true`): the six
  bundled ones with their source in `modules/<id>/`, the 13 core packages as entries.
  Installing one puts the deck's own copy back (nothing downloaded). `scripts/pack-store.mjs`
  writes those entries; the STORE shows a removed built-in once.
- **From your tests (20 nov.)**: sliders go **1 at a time** (drag the handle, hold on the
  track, the wheel, ←→) and faster the longer you hold; **space** ticks a box / turns a
  ‹ choice › (under the mouse or selected); a setting that depends on another is **greyed**
  (voice, sounds, the AI's provider, Vault key / Recovery key on a plain vault…) instead of a
  sentence; MODULES and NEXUS: **typing searches** at once (no letter shortcuts there: space,
  del, enter, the menu); **one search bar** everywhere (Settings, BLOCKS, SHORTCUTS and the
  STORE now use `FilterBar`); the prompt's ▾ suggestions are the kit's list.
  Vault commands **typed** stay in the shell (y/N there); with `--window` (Settings, THE
  MENU, the setup) everything is a dialog — and the result too: where the plain backup went,
  "Wrong password" in a window. The setup encrypts **during** the setup (the tour waits).
  `vault move` into a folder that holds things puts the vault **inside it** (under its name).
  Fixed: MUSIC → f opened on "~/Music: No such file" (the browser starts at home when the
  folder isn't there); installing a module said "it asks for nothing special" then listed
  its permissions (one dialog now, the module's own list); adding a reminder / habit / event /
  stat from a pop-up closed it. THE MENU gains: open checkboxes, find a file, shell history,
  redo. Performance: `debug perf [s]` measures frames (building, painting, cells, new glyphs,
  stutters); depth tints in MODULES and NEXUS come in 12 steps and the glyph cache keeps
  colours to 5 bits a channel (8 pages): moving scenes stop redrawing letters every frame.
- **Security pass** (docs/SECURITY_AUDIT.md, #14–24): programs in your real terminal no
  longer get the deck's powers through the bridge (an encrypted vault refuses them all, a
  plain one treats them as untrusted, like a module); `secrets.json`, `config.json`,
  `accounts.json` and the key files are written `0600` from the start; dictation's sound and
  text no longer go through `/tmp`; `net_get` refuses non-web schemes and redirects away from
  https; the native file reader only reads text and script files outside system folders;
  `factory-reset` asks the account's password; the password hash costs 64 MiB (old ones are
  redone at the next login); the slow-down after wrong passwords survives a restart; lines
  that look like a key (or start with a space) aren't kept in the shell history; the
  recovery window warns before "copy all".
- **`vault rekey`** (Settings → PRIVACY → Vault key): a new vault key — every file encrypted
  again and checked, a new recovery key; the old key file, password and words open nothing.
  An interrupted rekey leaves the vault as it was.
- **Spacing rules** (docs/LAYOUT.md, `src/ui/layout.ts`): `INSET`, `GAP`, `LABEL`, `SECTION`
  and `Row`, which lays things out and drops what doesn't fit instead of overlapping.
- **Security pass, first round** (docs/SECURITY_AUDIT.md, #1–13): modules can't run scripts in your
  terminal, factory-reset, plant shortcuts / macros / key settings, take the deck's names,
  read the account's files, or write into `.icebreaker/`; the boot error screen is text.
- **Fixed**: HABITS and REMINDERS lists didn't scroll (past the window, items were cut and
  the selection vanished); REMINDERS pop-up: ✓ only selected the row; the shortcuts page put
  Enter into its search; text measured by characters instead of width in 6 places and in
  two word wrappings (emoji, Japanese); the music folder asked for a typed path (now the
  file browser); the store's own word wrapping and list scrolling (now the kit's).
- **Removed** (dead or from before 0.4.0): the CHECKBOXES widget and its pop-up (the
  `checkboxes` command stays), migrations of settings and accounts from before 0.4.0
  (update through 0.4.x first), the text-speed "85 → 50" fix-up that reset a speed you chose,
  unused helpers, `void x;` tricks that hid unused code.

- **Vault encryption** (`docs/ENCRYPTION.md`): `vault encrypt` turns the vault into one
  `.icebreaker-vault/` folder of encrypted files — notes, names, folders, the deck's own
  files — after a plain backup zip next to the vault and a check of every file; `vault
  decrypt` gives plain files back, `vault export <folder>` a plain copy, `vault status`
  says which. Your account's password opens it at login; lock, logout and quit wipe its
  key from memory; a new password re-wraps it. A random vault key wrapped by Argon2id
  (64 MiB) from the password, XChaCha20-Poly1305 per file; writes are whole-or-nothing
  and a crash never loses a note (unknown files come back in `.trash/recovered-…`).
  Claude Code gets no file access to an encrypted vault. Not yet: encryption by
  default for new accounts. Plain writes are now flushed to disk too.
- **The recovery key in a window** from the menus (Settings, THE MENU, the setup): the 24
  words, *copy all* (the clipboard is emptied a minute later), one word typed back to close;
  `vault encrypt --window` / `vault recovery --window` in the shell.
- **Choose folders instead of typing them**: the login page (open a vault, forgot its
  password), *Move vault*, *Vault folder*: the deck's file browser, *choose this folder*, ⏏ drives.
- **`vault move [folder]`** (Settings → VAULT → *Move vault*): the whole vault elsewhere,
  every file copied and checked, then used; the old folder goes only if you say so.
- **Modules can't touch the encryption**: `ib.shell.run` refuses the vault's encryption and
  place, accounts, self-destruct, installing modules; no module can take the names `vault`,
  `account`…; a STORE / vault module can't replace the deck's commands, pages or actions;
  the account's files in the vault are refused to everything but the native side; Claude
  Code can't read `.icebreaker/`.
- **THE MENU**: *Vault: encrypt / decrypt / a new recovery key / encrypted or plain? / a plain
  copy / move it*, *Guided tour*, *UPLINK's context page*, *Mute everything* (they had no
  button before).
- **Fixed**: after `vault mount` typed in the shell, the keys went to HOME instead of the shell;
  a module with `vault:write` could rewrite another module's code in `.icebreaker/plugins/`
  (now `.icebreaker/` is closed to `ib.vault` writes, and to the AI's `write_note`); the login
  page's caret showed through the file browser; *Vault folder* asked for a typed path.
- **Encryption is an option**: the setup asks (plain first), Settings → PRIVACY has *Vault
  encryption* and *Recovery key*; encrypt ↔ decrypt as often as you like.
- **Portable vaults**: the vault carries its account (`.icebreaker/account.json`: uid,
  name, password hash) and its settings (secrets only when encrypted). Login page → *open a
  vault*: a folder (USB key, another computer), the name and password — or *forgot its
  password?* with the 24 words; a new account there is approved like *+ new account*.
  Settings changed on another computer come back at mount.
- **Every system, every version**: names in one Unicode form (NFC) inside an encrypted
  vault; names Windows can't hold are said before decrypt / export writes anything; a vault
  from a newer ICEBREAKER is refused, never repaired; settings keep what a newer version
  wrote and survive a changed kind; `vault adopt` takes in plain files an older version
  wrote next to an encrypted vault. Found while testing: a Mac file name with separate
  accents stopped `vault encrypt` (safely: nothing was deleted) — fixed.
- **Recovery key**: 24 words (BIP39 list, with a checksum) made by `vault encrypt`,
  shown once, one of them asked back (no way around it), then the screen is cleared. Forgot the password:
  login page → *forgot password?* (name + the 24 words + a new password, for the
  account and its vault). `vault recovery` makes a new one (the old one stops working);
  `vault unlock` also takes the words.
- **Full screen**: leaving it no longer leaves the notch band behind (a second
  "ICEBREAKER" over the top bar): the band goes at once and is measured again once
  the window has settled; it has no text any more (the theme's background), and it
  exists only in the deck's own full screen (F11), checked by the window covering
  the top of the screen.
- **‹ value ›**: a click on the left half of the value goes back, the right half
  forward (settings, the clock face in its pop-up: `clock style prev`).
- **Reminders**: no time = in one hour (the command and the "when?" prompt, where
  an empty answer used to add nothing); words the prompt doesn't understand as a
  time make it ask again instead of landing in the title.
- **The caret, smoother**: the glide lasts longer the farther it goes (75–240 ms,
  an ease-out), a jump waits a breath, a faint trail follows it, a key makes it
  flare; letters fade in on a gentler S-curve (220 ms).

- **The tree: one click selects, a double-click opens** (one click still folds a
  folder): F2, Delete / ⌘⌫ and p act on the selected note, the focus stays in the tree.
- **Notes changed outside the deck reload** (the vault watcher's rescan): without
  unsaved edits the note follows the disk; with edits, nothing is written over —
  the toolbar shows *changed on disk* with **Take the disk's** (undoable) / **Keep
  mine**, and a save checks the disk first.
- **The sound comes back** after a long time in the background: the audio context
  (sounds and voice) is resumed on focus / the first click or key, and made anew
  when the system closed or "interrupted" it (WebKit).
- **Text that scrolls when it doesn't fit** works in the world clock, the shortcut
  squares, the tabs, THE MENU's cells and the file browser's path, and in the widget
  chosen with the keyboard (not only under the mouse).
- **Pins at the top of the tree show their colour tag** (icon and square).
- **Full screen covers the whole display on a Mac** (simple full screen, no Space):
  the rows behind a MacBook's notch become a thin band (the name, the time), the deck
  starts under it (`src-tauri/src/screen.rs`).
- **Lists in prompts**: Claude Code / API / Ollama models (Ollama's own list is read
  from it), the journal folder, news topics, cities, time zones, durations, commands
  (`core/suggest.ts`).
- **TODO, REMINDERS, HABITS widgets**: Delete / ⌘⌫ on the line under the mouse,
  right-click → Edit…; in their pop-ups e edits and Delete removes. New commands:
  `remind edit <n> "title" [time]`, `habit edit <n> "name" [--times] [--days]`.
  Widgets get keys while selected (`WidgetSpec.onKey`).
- **A widget to another HOME page**: right-click → Move to page, `[` `]` in edit mode,
  or drag it onto a page number.
- **The notes toolbar** has room: a blank line above and below it, wider margins.
- **The caret glides**: a thin bar that slides from letter to letter and breathes
  (an overlay, no cell repainted); letters fade in a bit slower (160 ms).
- **Emoji are two cells wide** (⏰ ⚡ ✅ 🚀… were squeezed into one); the deck's own
  emoji became text symbols (◷ for reminders, ϟ, ◐, ♪).

- **Docs checked against the code, everywhere** (2026-11-20): the README's features
  grouped by theme without repeats; the shell's LOG tab named everywhere (the old
  errors / history tabs were still mentioned); PRIVACY says what UPLINK sends (its
  context page, the text to translate for the Japanese voice) and that accounts are
  local and don't encrypt notes yet; one list of built-in themes; START HERE fixed
  (the shell's buttons, `theme set`, `theme tweak accent`, menu labels, the shortcut
  square's size); the F1 manual and the welcome note point to the LOG tab and START HERE.

- **The voice follows UPLINK's answer as it's written**: each finished sentence is
  said at once (`voice.stream`), the first piece kept short so it starts right away;
  Japanese full stops (。！？) now cut sentences (a Japanese text went to the
  synthesizer in one block). In Japanese, UPLINK starts its answer with a hidden
  `<say>` line of spoken Japanese, read immediately — no second call to translate
  (the old translation stays as a fallback). Sentences arriving while one plays are played.
- The context page sent to UPLINK is shorter (4000 characters at most).

- **MODULES rebuilt on NEXUS's scene** (the same ring, sky, floor, WheelSpin):
  shards in each module's colour with pins, a cut corner, a status light, facts;
  they power up one after the other; the data panel under the ring.
- **Notes**: a toolbar (save, save as, new, previous / next in the folder, undo,
  redo); a red dot on the tab while unsaved; Save in the tab's right-click menu.
- **UPLINK**: who wrote what (a header line per message, your messages on a tinted
  band); a context page (`.icebreaker/context.md`, `context`) read before every
  conversation — profile, vault folders, recent notes, pins, tags, modules, built
  without AI; how to talk + what it learned, editable. Japanese reading translated
  in small pieces, three at a time (the voice starts at once); a click on the VOICE
  box stops it.
- Settings: Effects preset cycles the presets (‹ ›) instead of opening the fx panel;
  shortcut rows draw every combination as keys, aligned.
- Shortcut squares too low for a real square become a readable chip.
- The store's repository (icebreaker-modules) is public.
- The shell's typewriter counts visible characters only (colour codes no longer slow it).

- **Pins and shortcut squares are one list** (settings.favorites): a pin can be
  a note, folder, module, page, macro or command; it shows in the tree, the pinned
  widget, and on HOME as a square (`link.<pin id>`). Old squares (home.links)
  become pins once. Unpinning removes its squares.
- **One date reader for every module**: `core/dates.ts` (`ib.lib.dates`:
  parseDay, parseTime, ymd…) used by calendar, reminders, todo, habits and the
  journal command — "demain 9h" means the same everywhere.
- MODULES: every card the same size while the ring turns; only the one coming
  to the centre grows.
- `docs/ENCRYPTION.md`: the plan for vault encryption and the module sandbox (not built).

## 0.4.0 — 2026-11-19

- **Accounts**: each one is its own deck (settings, theme, sounds, vault, Google),
  with a mandatory password (Argon2id). The login page is the way in, and the
  only place to create an account (an existing one approves it). The profile
  icon shows only once the name *and* the password are right. ⏻ log out, bigger.
- **THE MENU** (⌘K or shift twice): search everything, or a key + enter.
- **BLOCKS**: everything the deck is made of, browsable; settings rebuilt from one
  registry (`core/prefs.ts`), simpler sheet, notifications as boxes.
- **⌘Z undoes anything**, anywhere: settings, themes, widgets moved or resized,
  trash, renames, new notes and folders (`undo`, `undo list`, `redo`).
- **Guided tour** after the setup (`tour`): UPLINK lights each part of the screen
  and explains it; skipping asks first.
- **UPLINK**: conversations in tabs (ctrl+T, ctrl+[ ], right-click to close).
- **Setup**: the EYE CANDY presets show live on the whole deck, like themes.
- **HOME and the side panel**: one edit mode with a band across both; widgets stay
  where you put them (gaps allowed, nothing rises); the corner ◢ resizes; the
  panel scrolls when taller than the window; status-bar buttons click on their
  whole cell.
- **The same widget several times**, each copy with its own settings.
- **Clocks**: every style has tiny → huge versions (no more fallback clock).
- **News**: categories per widget (science, AI, nature, economy…) and a
  *featured* mode (one story, big, with its summary).
- Effects presets: none · light · medium · heavy · party. Sound 0-100, starts at 50.
- Glide scrolling everywhere; long text scrolls by itself on hover.
- Themes: an automatic contrast check (tests/themes.test.ts); PHOSPHOR's status
  bar and REDLINE's hints are easier to read.
- **Shortcuts on keycaps**: every key written in the interface (⌘⇧P, ctrl+K,
  F2, esc, hint letters) is drawn on a little key (ui/keycaps.ts).
- **Text that types itself out** with a Game Boy RPG blip (the tour, notifications,
  dialogs, the setup, UPLINK's lines): Settings → APPEARANCE → text speed
  (100 = instant). New sounds `blip` and `key` (your keys, off by default) per pack.
- **Sound mixer**: one fader per channel (moving around, notifications, text,
  your keys, start-up) under the main volume.
- **Guided tour**: texts checked against the app; UPLINK big, with an animated
  face (an eye that looks at what it shows, voice bars while it talks).
- **Sliders**: one look and one set of rules everywhere (visible track, a square
  handle drawn centred, the number in its own column); text size, screensaver
  and voice speed are sliders too.
- ⌘Z works with a widget's pop-up open; ⌘⇧Z redoes trash and new notes too;
  a widget moved between HOME and the panel is one undo step (`history.groupAsync`);
  undo messages name the thing ("the HOME layout"), not the setting key.
- Right-click menus: their shortcuts are keycaps too (`Style.key`); usual short
  names (Open, Rename…, Duplicate, Delete…), what a line does in a strip under the
  menu (`MenuItem.tip`); THE MENU / shortcuts / settings no longer repeated in
  every menu.
- The tour's UPLINK is the HOME widget's face (`ui/uplinkcore.ts`, shared), in its
  own card: a voice wave while it talks, an eye on what it shows.
- Typing: the letter coming in fades up, frames as fast as the screen; text speed
  50 by default (was 85: too fast to see), a gentler curve (15-240 characters/s).
- Sounds: a louder blip; `erase` for backspace/delete; the typing click plays on
  key down with an "interactive" audio context (in sync with your finger).
- Dropping on the side panel inserts between widgets (the ones below move down).
- Edit mode ends when you go to another page. Dropping a widget on the side
  panel shows a line where it lands. Shortcut squares are truly square.
- ⌘⌫ is Delete on a Mac. Right-click on a macro → *add to the menu…* shows again.
- **Smooth text everywhere**: letters fade in as they appear (core/renderer.ts
  `fadeMs`; not when many cells appear at once — motion, a new page); the
  typewriter also runs in UPLINK's chat and the shell's output, growing text
  carrying on, never more than 1 s behind (`ui/typewriter.ts` `revealed`).
- **Settings**: short usual names (Zoom, Font size, V-Sync, Reduce motion,
  Chromatic aberration, Mixer…), the details only in the help under the list;
  SHELL gets its own category; *Smooth text* setting.
- MODULES: the cards' descriptions wrap at a fixed width and show once the ring
  stops (re-wrapping text on cards that change size every frame looked choppy).
- One word-wrap (`wrapWords`), one easing (`easeOut`), one `pad2`/`mmss` instead
  of copies in the tour, setup, chat widget, news, popups, clocks, focus.
- Security: modules are audited before install, the vault refuses symlinks that
  lead out of it (docs/SANDBOX.md). README: a warning — not for sensitive
  documents (vault encryption is next).

## 0.3.1 — 2026-11-19

- MODULES and NEXUS glide: the ring moves on a spring (no jump when you spam the
  keys or the wheel) and the cards grow and shrink continuously with depth.
- macOS ProMotion: WebKit's 60 fps cap is lifted — with vertical sync the deck
  follows the screen (120 Hz at full speed, less in Low Power mode).
- One filter bar for MODULES, NEXUS and the file browser: type to search ("/"),
  tick several colours at once. The tree filters several colours too
  (`tag view red blue`, `tag view +red`).
- The tree: the wheel scrolls, shift + wheel walks file by file.
- Settings scroll with the wheel.
- Less of the same thing: one file browser (folder shortcuts and picking a file on
  the computer), one filter bar, one trash page, one shortcuts page.

## 0.3.0 — 2026-11-19

- MODULES and NEXUS share one wheel feel: a trackpad steps every few lines (no
  more racing), the ring glides and slows down little by little; MODULES sits in
  the middle when the shell is hidden. Each step clicks like a notched wheel
  (a `tick` sound per theme pack), choosing plays a `select`.
- MODULES: every module is a shard now — the chips netrunners slot in: gold
  contacts, a chamfered corner, a glowing stripe in its colour (its own accent,
  or the colour you give it: right-click → colour, `modules tag todo cyan`), a
  serial; enter plugs it UP into its socket. A colour filter (squares top right,
  `modules view cyan`). NEXUS follows the tree's colour filter.
- Sound packs per theme: Settings → SOUND → sound pack (this theme), `sound pack`;
  the theme's own shows as "(default)".
- Tree: drag & drop notes and folders onto folders (below the rows = the root);
  drop files from the Finder / Explorer to copy them into the vault (never
  overwrites). The wheel over the tree walks file by file and shows each one at
  once in a preview tab (Settings → VAULT to turn it off).
- TRASH page (⌫ above the tree, `trash open`): what's in .trash, where it lived,
  restore / restore elsewhere / open.
- Settings → ◇ CALENDAR: first day of the week (weeks can start on Sunday), where
  your calendar lives, Google account, sync, your own Google client, default
  calendar; `cal settings`. docs/GOOGLE.md explains connecting on Windows. Module
  settings get an `action` row type.
- Terminal: tabs drawn as chips (your terminals │ the deck's panes), the panel's
  buttons on the right; macros can be hidden (▴, `macro hide`) and bound to keys
  (right-click → shortcut…: press the keys, see conflicts, several actions in a
  row; `bind --pick`, `macro run`).
- Windows PowerShell: the ICEBREAKER prompt no longer shows garbled characters
  (UTF-8 console, script saved with a BOM).
- Login: the account isn't filled in unless "remember me" is ticked.
- Shortcut squares: 1×1 HOME widgets that open anything in one click (module,
  note, folder, page, macro, command): `home link new`, right-click → square on HOME.
- Side panel on the right (◧ in the status bar, `panel`): widgets always in view.
- Profile icon: pixel-art faces and glyphs in your colour (Settings → YOU, `avatar`),
  on the login screen and in `whoami`.
- Gamepad: hold RB for the action wheel (8 slots a page, point a stick, let go);
  a tap on RB still turns the tab. `wheel` opens it with the mouse; right-click →
  add to the wheel.
- Swipes and mouse side buttons switch tabs with an even shorter transition.
- Login: a centred card, labels above the fields; your icon shows only when the
  account is remembered. `logout` logs out of ICEBREAKER (also in the system terminal).
- Settings: ‹ › on every choice (click either side), sliders follow the pointer to
  the pixel (1 % steps), double-click a slider's number to type it (digits only).
- HOME: right-click → edit mode / stop edit mode; a widget with no room on the
  page goes to the next page with room (never off screen). The side panel takes
  HOME widgets dragged onto it in edit mode, and has its own edit controls
  (▲ ▼ ×, drag to reorder or back to HOME); ◧ is the last thing on the status bar.
- Tree: dragged things show a ghost under the pointer; the wheel wraps around.
- New default keys: ⌘⇧B side panel, ⌘⇧U macros, ⌘⇧E NEXUS, ⌘⇧A action wheel,
  ⌘⇧⌫ trash (Ctrl on Windows / Linux).
- Tabs like a browser's: wide when few, narrower as more open, `▾ +N` for the rest; × away from the edge.
- Voice: choose what it says aloud (errors, reminders, timers & focus, events 30 min before, weather changes, the time every half hour, CPU/memory overload, modules) — one `Deck.speak`, `ib.ui.say` for modules.
- PULSE widget (instead of the module launcher): the next event, tasks due, the next reminder, habits left, the music, focus, weather, errors.
- Everything callable: `ib.use("tree" | "terminal" | "shell" | "theme" | "home" | "panel" | "tabs" | "notes" | "sound" | "deck" | any module)`, `deck.use(…)` in the core; new `terminal` permission.
- Side panel: a focusable pane; `a` opens HOME's widget picker and adds at the end.
- Tree: a gap opens where the dragged thing will land. Sliders: smooth while dragging.
  Calendar month: events on tinted strips, two lines when there's room. UPLINK widget:
  an eye that follows the pointer. One-row widgets (shortcut squares) are drawn as flat
  chips instead of vanishing. Login: your icon shows while the account field holds your name.
- Graphics settings: vertical sync on/off (off: an fps slider 0-240, 0 = no animations),
  brightness 50-150 %, reduce animations (slower machines). Animations follow the
  screen's refresh rate (smoother at 120 Hz); backgrounds up to 20 fps; slider handles
  move by eighths of a cell. Smaller tabs before they gather in ▾ +N.
- Shortcut squares are square tiles with their kind on a coloured band; a folder
  square opens a little browser under it (back / forward, new note / folder, trash, NEXUS).
- Keys: the letter says what it does (⌘⇧E explore, ⌘⇧U uplink, ⌘⇧T tree, ⌘⇧P panel,
  ⌘⇧S shell, ⌘⇧K macros, ⌘⇧F effects, ⌘⇧A action wheel); every deck shortcut can be
  changed (SHORTCUTS → F2, Settings → KEYS, `keys set`) and put back to its default,
  one by one or all at once (asks first).
- Settings: ↺ next to every setting you changed, and a button per category to put
  everything back (asks first); `config reset <key>`.
- For developers: docs/ARCHITECTURE.md is a full map of the code now; small cleanups
  (one `ago()`, one `ring()`, the side panel in its own file).

## 0.2.1 — 2026-11-19

- Effects are per theme: each theme keeps the effects you last set on it
  (bloom, scanlines, vignette, RGB split, glow, sharpness, background, glitch, flicker).
- Bloom lowered or off no longer dims the screen: the picture gets that light back.
- Snappier: theme switch, page transitions (fade 100 ms, wipe 120 ms, e-ink 200 ms),
  HOME widgets coming in (220 ms, light stagger) and the NEXUS dive are all shorter.
- Reminders: ✓ on every line of the HOME widget (and right-click), no pop-up needed.
- Two-finger swipes go the right way (fingers to the right = the next tab).

## 0.2.0 — 2026-11-19

- MODULES is a ring of floppy disks, like NEXUS: an endless ring (5 in front),
  each module a disk with its metal shutter, label and status light; ←→ ↑↓ and the
  wheel turn it.
- Smoother: page transitions never go dark any more (fade starts at 40 %, wipe rolls
  a line over the new page, all shorter); sideways swipes don't bounce the page;
  swipes chain while macOS's momentum still runs (no click needed to swipe again).
- Glow is gentle at low levels (proportional); the RGB split bites early (a curve);
  scanlines are softer with a slow roll; names line up in the tree whatever the icon;
  the ICEBREAKER prompt re-asserts itself before every prompt (p10k can't come back).

- Real sliders everywhere (settings, the ✦ fx panel): drag or click on the track
  (1 % steps), the wheel and ←→ step by 5. One setting per effect: 0 = off, up to
  200 % (bloom, scanlines, vignette, RGB split, glow; sharpness 0-100). `fx glow 120`.
- RGB split (colour fringes) is a real chromatic aberration now, much stronger.
- Glow: bright, saturated things (accents, titles, lit buttons, neon) give off
  their own light; plain text stays crisp. Not a global bloom.
- Trash: ⌫ above the tree and `trash` show what's in .trash and put things back
  where they lived (`trash restore 3`).
- Every notification also reaches the system's notification centre when the deck
  isn't in front (Mac, Windows, Linux), following the notifications setting.
- Gestures: the mouse's back / forward buttons and a two-finger sideways swipe
  switch tabs (one per swipe); a pinch or ctrl+wheel zooms the interface.
- NEXUS: the wheel turns the ring anywhere on the page, a dive animation when you
  enter a folder, a quieter background.
- Top bar: when the tabs don't fit they scroll around the one shown (‹ ›); the
  logo and the right side shrink in a narrow window.

- Fixed: your own shortcuts (`bind`), module settings and theme tweaks were lost at
  every restart (settings records were dropped when loading). Now kept.
- The deck reopens as you left it: the tabs (and which one was shown), and the
  tree's open folders.
- Tree: one click opens or folds a folder. Colour tags are small squares at the right
  edge (they used to touch the name); icons always have a space before the name.
- Reminders: ✓ done and ✕ remove on every line (and right-click), and "When?" asks
  again with an example when it doesn't understand the time (it failed silently).
- Music widget: nothing playing still shows the whole widget with its buttons.
- Terminal: selection covers real text only; the ICEBREAKER prompt holds (p10k is
  taken out of the deck's terminals when you use it); `reboot` is the deck's.
- Settings never lose their lines at a big interface scale; FOCUS no longer crashes
  in a tiny window; `launch note` without a file opens a new note.
- CI builds on demand or for release tags, not on every push (Actions minutes).

- Error system: every error gets a code (E101 vault … E901 unexpected) with what to
  do. The shell panel grows an "errors" tab that blinks red with an error sound
  while some are unread; `errors`, `errors E102`, `errors codes`, `errors clear`.
  Uncaught errors and crashing widgets land there too. docs/ERRORS.md explains
  every code (the tab links straight to it).

- A screensaver per theme: terminal (an 80s mainframe typing its log, a framed
  clock) for phosphor, amber and graphite; sonar (range rings, a sweep, echoes)
  for abyss; warp (stars rushing past) for ghost and nightshade; the neon city
  for neon-district, neon-ronin and redline; the paper sleep screen for e-ink.

- NEXUS shows 5 lockers of the ring once there are 5 things or more, 3 for 3-4, 1 below.
- NEXUS is an endless ring: past the last thing comes the first, the disc keeps
  turning the same way (no jump back); a few things spread round the whole disc.

- e-ink: matte old-cream paper, darker ink (never pure black), more contrast;
  colour tags written as words (greys can't show colours); its own screensaver,
  an e-reader sleep screen (an engraved moon and hills, the time, redrawn once a
  minute). Themes pick their screensaver with `[anim] screensaver = "city" | "paper"`.
- New theme e-ink-night: e-ink's dark mode with its own greys (cream ink on
  charcoal), not just e-ink inverted.
- HOME drag & drop: the widget follows the mouse as a ghost, the spot it would
  land on shows dashed ("no room here" otherwise), and it moves only when you let
  go (no more hopping around while you drag). Hits can have `onUp`.
- HOME edit mode can't be missed: a pulsing band across the top with the keys and
  a ✓ done button. FOCUS has a compact 2×2 look.
- SHORTCUTS (⌘/) is a cheat sheet in columns (2-4 depending on the width), still
  searchable; Settings → KEYS opens it.
- Input boxes can suggest: a ▾ list (↓ or a click), the rest of the best match in
  grey, Tab completes it. Used for the date language, the weather city, custom
  pronouns, custom icons; modules get it with `ib.ui.prompt(title, { suggestions })`.
- Add a widget: grouped by module, each group folds (→ ←, enter, a click); a
  search still shows every match. START HERE is written with your keyboard's
  keys (Ctrl+, Shift+, Alt+ on Windows and Linux; ⌘ ⇧ ⌥ on a Mac).
- WEATHER: your own city is the first saved place from the start. HABITS: tick
  from the HOME widget (click; right-click unticks). The Welcome note opens
  right after the setup.
- HOME rows stretch to fill the page (each theme's font size used to leave it
  half empty or overflowing); a widget too small to draw anything shows its name.
- Windows: PowerShell no longer stays blank (the terminal now answers ConPTY's
  start-up cursor query); the boot sound plays without a click first (WebView2
  autoplay); Japanese voice: a clear message when Windows has no Japanese voice.

- Tabs: ⇧Esc (or ⌘W) closes a tab and shows the one before it; a stray Esc never
  closes one any more. 1…9 switch tabs when you're not typing. NEXUS, STORE,
  MODULES and settings open without a tab (their button lights up; Esc closes them).
- Settings: percentages step by 5 % and stop at the ends (sharpness no longer runs
  backwards); custom pronouns; the effect presets moved from SOUND to APPEARANCE;
  DANGER ZONE alone at the very bottom; a blinking caret in the search field.
- Defaults: robot voice 100 %, voice volume 50 %, speed ×1.1, sharpness 80 % with a
  gentler curve.
- `mute` and a ♪ button bottom-right silence everything (ui sounds, voice, alerts);
  ☾ starts the screensaver (`screensaver`).
- System terminal: drag to select text, double-click selects a word, ⌘C (Ctrl+C
  when something is selected, Ctrl+Shift+C) copies; right-click → copy / select all.
  A maximized shell has a ⤓ dock button.
- zsh + powerlevel10k: instant prompt off in the deck's terminals (the prompt_cr errors).
- macOS speed: the colour fringes measure their own cost and refresh less often when
  the webview is slow at them (they made tab switches and the login animation lag).
- e-ink is grey again (a filter on single layers let the glow's colour through).
- Shift+Tab always moves to the next part of the screen (it opened the shell's
  completion); the wheel walks the MODULES hive; HOME no longer scrolls by one row
  when nothing overflows; NEXUS stays centred on a tall page; scripts show their
  full file name; choice lists never cut the label for its hint; the colour dots
  have a row of their own above the tree.

- Right-click everywhere: a menu for the thing under the mouse — tree entries
  (open, new note/folder here, rename, duplicate, pin, copy path / [[link]],
  colour, icon, trash), tabs (close, close the others / the ones on the right,
  show in the tree), terminal tabs (rename, restart, close), the shell (paste,
  clear, new terminal, maximize, hide), the note editor (copy, cut, paste,
  select all, undo, redo, follow the link, save), HOME widgets (pop-up, module,
  move, remove), MODULES cards (launch, switch on/off, pin, remove). Keyboard:
  the menu key or shift+F10; sub-menus open on the right. Paste reads the
  clipboard natively (no permission bubble).
- Colour tags like Ableton (red, orange, yellow, green, cyan, blue, purple,
  pink) on files and folders, on the icon only; dots above the tree show one
  colour at a time. `tag <path> <colour>`, `tag ls <colour>`, `tag view <colour>`.
- Custom icons per file or folder (`icon <path> ★`). Tags and icons are in the
  vault (.icebreaker/tags.json, icons.json) and follow renames.
- Tree: F2 renames, Delete moves to the trash (after asking).

- File tree: an icon per file type (∿ Python, ʝ JS/TS, ❯ scripts, λ code, ⚙ config,
  ▣ images, ♪ audio, ▶ video, ▤ PDF, ▥ tables…).
- MODULES hive: card descriptions wrap instead of being cut.
- The docs folders: START HERE/ and FOR DEVELOPERS/ side by side at the vault root.
- Screensaver: a night city in ASCII — towers with flickering windows, neon
  signs, rain, a searchlight, a drone, the time in big digits, a ticker.
- Voice subtitles: while the voice speaks, its words type into a small sci-fi
  box bottom-right (Settings → voice → subtitles).
- The neural voice gets plain text (no dashes, fancy quotes or symbols) and,
  if it still fails, the system voice takes over quietly (no toast).
- Sharpness works on every webview (a soft halo where canvas blur is missing).
- Settings: two big groups, GENERAL and MODULES; the effects are part of
  APPEARANCE; the natural-voice row says "installed ✓" or downloads with the
  progress in the shell.
- ⤢ maximize: the shell becomes a big tab after the others (the page you were
  on stays a tab) and the panel folds away; `term dock` puts it back.
- zsh with powerlevel10k: no more "prompt_cr must be unset" error (p10k finalize, and
  prompt_cr kept off right before p10k's own prompt hook — a resize at start
  made p10k draw a second prompt while its instant prompt was still on).
- START HERE: the docs as notes in your vault — a README with the tour, one
  note per part (modules, ui, shell, keys, privacy) and `for developers/`
  (themes, the module API, tweaking). Written into every new vault; `starthere`
  adds them to an existing one.
- Terminals get ICEBREAKER's own prompt (◆ ~/path ❯, the same for everyone,
  zsh / bash / fish / PowerShell); Settings → terminal prompt → mine keeps
  your own theme (oh-my-zsh, starship, oh-my-posh…).
- Scripts: import from anywhere on the computer with the deck's own file
  browser (≡ scripts → import, or `script import "<path>" [folder]`), into
  subfolders of scripts/. Any language: .ibsh runs in the deck; .sh .py .js
  .ps1 .zsh .fish .rb… run in your terminal with their interpreter.
- Settings: every setting has a real description (under the list, for the
  row you're on or under the mouse); a section per module after the normal
  ones (WEATHER, NEWS, FOCUS, CLOCKS, and modules' own via `ib.settings`,
  `modules set <id> <key> <value>`); KEYS lists the shortcuts directly; no
  ◂ ▸ on rows that are actions; pronouns; a clearer natural-voice row.
- Softness is now SHARPNESS (100 = sharp, `fx sharpness 60`) and much more
  visible. The setup's Full CRT preset puts the colour fringes at max.
- The clock face is chosen from the clock widget (f in its pop-up), not Settings.
- One calendar widget in the picker (the duplicate is gone); an even, centred
  month grid.
- Terminals are named icbrkr_trm, icbrkr_trm2…; rename with a right-click on
  the tab or `term rename <name>`. A ▴/▾ shell button in the status bar brings
  the folded shell back.
- Fix: long hints no longer spill out of the command palette.
- FOCUS app: a big ring that empties with the minutes, what you're on
  (`focus task …`), presets 25/5 · 50/10 · 90/20, today's sessions, and zen
  (z: the tree and the shell fold away). The pomodoro now rings even when its
  widget isn't on screen.
- CLOCKS app: the time in your clock face, several named timers at once
  (`timer 4m tea`, `timer stop 2`), a stopwatch with laps (`stopwatch lap`),
  the world with day/night. Timers ring through notifications.
- WEATHER app: any place (s to search, saved places with ←→), the sky as an
  ASCII animation (sun rays, drifting clouds, rain, snow, storm flashes, fog,
  a moon at night), the next 24 h as a curve with the rain chances, the week.
  `weather Tokyo`, `weather open`, `weather save Lausanne`.
- NEWS interests: categories (tech, AI, science, space, politics, world,
  business, people, culture, art, music, cinema, gaming, sports, health,
  environment, security) and your own words, woven in with your area's news,
  each headline tagged. `news add tech`, `news add "formula 1"`, or i in the
  news pop-up.
- Pinned: notes, folders and modules at the top of the file tree, in a
  "pinned" HOME widget, and on a key if you want (`pin notes/ideas.md`,
  `pin projects`, `pin todo --key ctrl+shift+t`; p in the tree or the hive).
- Shell: several system terminals as tabs (+ adds one, × closes it, `term new`,
  `term 2`), a terminal in a main-window tab (`term open`), ▾ to fold the
  panel away (`term hide`, ctrl+` brings it back).
- Scripts: shell lines kept in the vault (.icebreaker/scripts/*.ibsh) and run in
  one go from the ≡ scripts menu, the palette or `script <name>`; {blanks} are
  asked; four examples (morning, end-of-day, inbox-sweep, quick-note).
- `mv a.md b.md folder/` moves several notes at once.
- Settings redesigned: categories on the left, their settings on the right,
  a search over every setting (just type), and under the list the shell
  command that does the same (`config set …`). New: KEYS, MODULES, DANGER ZONE,
  clock face, energy. The top bar's buttons shrink to icons in a narrow window.
- UPLINK chatbox widget: a running conversation with your AI right on HOME;
  enter opens it bigger to type, ctrl+l starts a new one, ctrl+s reads the
  answer aloud. (`home add chat`)
- TODO: recurring tasks — every day, several times a day (`--times 3`),
  every other day, chosen weekdays (`--every mon,wed,sat`), every (other)
  week, every month; for 10 / 100 times, a year, or forever (`--cycles`).
  Done → it comes back on its next date. `todo repeat <n> …`, or r in the app.
- HABITS module (takes CHECKBOXES' place): daily boxes that reset every day,
  several times a day (●●○○), chosen weekdays, streaks ▲, a 2-week strip, a
  widget and its pop-up, the numbers in STATS. `habit add "read" --days mon,wed`.
  `checkboxes` stays as a shell command.
- Modules talk to each other: `ib.modules.expose / call / has / list` — every
  built-in module publishes functions (todo.add, journal.append, calendar.events,
  uplink.ask, sysmon.stats…) that downloaded modules can call, permissions
  checked. Shell: `modules api`, `modules call todo add "walk the dog"`.
- STATS gets the modules' numbers: tasks open / added / done, reminders
  pending / rung, events this week, tracks played, focus sessions and minutes,
  timers, journal pages, messages to the AI. A setup page (s in STATS, or
  `stats setup`) lists each module with its stats to show or hide;
  `stats hide|unhide <id|module>`.
- `self-destruct`: deletes the whole vault for good, behind a dialog, the
  folder's name, DESTROY in capitals, your password (if the deck has a login)
  and a 10-second countdown that ctrl+c stops. Copies elsewhere aren't touched.
- New app icon: "IB" in ASCII block letters on black glass, with a glow and
  scanlines (scripts/make-icon.swift draws it).
- CRT: colour fringes (chromatic aberration, `fx chroma 30`) and softness
  (glyphs a touch out of focus, `fx softness 40`) — in the FX panel and
  Settings too. Softness is baked into the glyph cache: free at run time.
- Clock widget faces: dots, segment, analog (a braille dial with hands),
  binary, minimal — and the seconds if you want them (`clock style analog`,
  `clock seconds on`, or f / s in its pop-up).
- File tree: [+ note] and [+ dir] buttons (in the selected folder), tree
  guides ├─ └─ │, item counts, a marker on the open note; dot-files hidden.
- SHORTCUTS page (`ctrl+/`, or `shortcuts`): every shortcut by category,
  with a search field. Your own shortcuts: `bind ctrl+shift+1 "open notes/x.md"`
  (or F2 on the page), `unbind`. New: `ctrl+shift+h` HOME, `ctrl+shift+m`
  MODULES, `ctrl+shift+n` new folder, `ctrl+shift+l` lock.
- Tab = the next thing on the screen (widget, card, line); Shift+Tab = the
  next part of the screen (tree → deck → shell).
- Energy: no frames at all while the window is hidden or minimized; 12 fps
  animations in the background or after 90 s idle; the bloom is blurred in a
  small canvas instead of a full-window filter; a leaner glyph cache.
- HOME: widgets sit at the top and close the holes (same in and out of edit
  mode); the calendar widget fills its box.
- MODULES hive: loops forward (after the last row, the first one again), more
  depth, a lighter floor. Widget-only modules (voice, checkboxes, moon,
  matrix, quotes) leave the hive. Slower scan sweeps.
- Tab titles in lowercase. LINGO removed (it'll come back, rebuilt).
- Notifications: sound and on screen, sound only, on screen only, or nothing
  — a new setup step, and Settings → sound → notifications.
- STATS module: numbers over time from modules and from you — `stats`,
  graphs (7 / 30 / 90 / 365 days), a widget with sparklines, pins. Modules
  record theirs with `ib.stats` (permission `stats:read` to read others').

- REMINDERS module: local reminders, a system notification 15 min before and
  on time (macOS, Windows, Linux), with a retro "tu-dut"; `remind`.
- Notifications for modules: `ib.ui.alert(title, body)` — system
  notification, alert sound, toast, and the voice when it's on.
- No AI while the UPLINK module is off. Effect levels in Settings; softer
  vignette, stronger scanlines with a CRT rim. Setup previews themes live.
- Lists and the MODULES hive wrap around at the ends.

- Everything is a module: NEXUS, UPLINK, JOURNAL, SYSMON, THEME STUDIO, VOICE,
  NEWS, WEATHER, CLOCKS, FOCUS, CHECKBOXES, MOON, MATRIX, QUOTES join the
  bundled CALENDAR, MUSIC, TODO, LINGO — switch off, remove, reinstall.
- MODULES is a pseudo-3D hive of every module.
- Windows: PowerShell 7 or Windows PowerShell in the shell panel with your
  profile (oh-my-posh…) and ICEBREAKER's commands; the system media controls
  for the music widget. fish gets the bridge too. Linux CI builds with ALSA.
- Pop-ups block clicks behind them; a failing neural voice falls back.

- STORE: modules and themes from GitHub and your own sources (https, or http
  on your local network); install, enable, update, remove; `store`.
- NEXUS: new note / folder, search the vault, rename, trash, sort, actions menu.
- Top bar: nexus, store and modules buttons.
- Voice: female neural voices (Jenny, Amy, Siwis), Japanese (system voice,
  AI answers translated), the accent follows the text, a gentler robot filter.
- Music pop-up redesigned: spectrum, progress knob, controls, volume, up next.
- Smoother: animations ride the display's vsync; lists glide and scroll softly.

- English or French: setup asks the deck's language and the voice's; Settings too.
- The AI is your UPLINK (no more "neural link"); its widget shows idle,
  processing, speaking and offline, and its pop-up takes a quick question.
- Every widget has a pop-up: clock (timer, stopwatch), system, modules,
  matrix, checkboxes, uplink, calendar. New commands timer, stopwatch, matrix.
- CALENDAR widgets month and this week, linked to the module.
- Neural voices now run on sherpa-onnx (piper's macOS builds were broken).
- e-ink: dim cream paper, paper texture, everything monochrome.

- Voice: local text-to-speech (piper or the system voice) through a robot
  filter; greets you, can read LINK's answers. `voice`.
- Stealth mode: 100 % local, no internet; AI only through a local model. `stealth`.
- Setup: connected or stealth, optional gender, vault location (network drive),
  voice, theme.
- Themes e-ink, neon-district, abyss; new theme keys `[anim] page`, `[anim] type`,
  `[fx] flicker`, `[meta] widget_frame`; backgrounds grain, circuit, sonar;
  sound packs paper, neon, sonar.
- Widget pop-ups (enter / double-click / pad A) with a button to their module;
  `widget <id> [open | do]`, `focus`, `moon`, `worldclock`, `quote`.
- Calendar: a real grid, a settings page (show/hide calendars, default, mode),
  events in date order.

- CALENDAR module: `cal` command, app, "upcoming" HOME widget; a local calendar
  stored as Markdown in the vault (`calendar/YYYY-MM.md`), and optional Google
  Calendar (choose the calendar for each new event).
- MUSIC plays a local folder (mp3, m4a, flac, wav, ogg, aiff): a text-only
  library app with queue, shuffle and repeat. No cover art, ever.
- Live boot sequence: each line is a real start-up step with its duration.
- Module commands win over same-named system programs in your terminal (`cal`).
- Smoother scrolling (trackpads), centred HOME, lower macro bar.
- Setup asks how you want your calendar: vault only, Google, or later.

## 0.1.0

- First version: vault, journal, notes, HOME widgets, shell (system terminal +
  ibsh), LINK (AI), themes, NEXUS, TODO and MUSIC modules, login.
