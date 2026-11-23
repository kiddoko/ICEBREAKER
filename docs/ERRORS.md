# Error codes

Every error in ICEBREAKER gets a code. You see it in the shell panel's **log** (on its right, or a tab when it's narrow)
(it blinks red while errors are unread, with a short error sound; tick *errors* to see
only those), and with the `errors` command:

```
errors            the list, newest first
errors E102       what a code means and what to do
errors codes      every code
errors clear      empty the list
```

Code families: **1xx** vault and files · **2xx** network · **3xx** voice and sound · **4xx** AI ·
**5xx** modules and widgets · **6xx** terminal · **7xx** settings · **9xx** anything else.

For module authors: `ib.ui.notify(text, "error")` lands in the log too (the deck guesses
the code from the message), and anything your module throws is caught and logged.

## E101

**a file couldn't be read.** The deck asked for a file that is not there any more (deleted or moved by another app, a sync tool, the Finder). Run `rescan` (or r in the tree) so the deck forgets it.

## E102

**a note couldn't be saved.** Saving a note failed. Common causes: the disk is full, the folder became read-only, or a sync service (iCloud, Dropbox, OneDrive) locks the file. Nothing is lost while the note stays open: fix the cause and press ⌘S / Ctrl+S.

## E103

**the vault couldn't be opened.** The vault folder could not be mounted. Check the path (Settings → VAULT → mount another folder) and, on macOS, that ICEBREAKER is allowed to read it (System Settings → Privacy & Security → Files and Folders).

## E201

**the network didn't answer.** A request to the internet failed: weather, news, the STORE, Google Calendar, the AI. Check the connection; the deck tries again on its own later.

## E202

**blocked by stealth mode.** Stealth mode is on, so the deck refuses to go online. That is what it is for. `stealth off` (or the ◉ in the status bar) lets it go online again.

## E301

**the voice failed.** Speech failed. `voice` in the shell shows the last problem. The deck falls back to the system voice when the natural (neural) one fails. `voice install en` / `fr` downloads the natural voice again.

## E302

**no voice for this language.** There is no installed voice for the language you picked (often Japanese on Windows). Windows: Settings → Time & language → Speech → Add voices. macOS: System Settings → Accessibility → Spoken Content → System voice → Manage voices. Restart ICEBREAKER afterwards.

## E401

**the AI didn't answer.** UPLINK (the AI) could not answer: it is switched off, there is no account or key, or the provider is down. Settings → UPLINK (AI) shows the state; `ask hello` tests it.

## E501

**a module failed.** A module threw an error. If it keeps happening, `plugin disable <id>` switches it off (MODULES → space does the same). For a module from the STORE, tell its author with the message shown.

## E502

**a widget couldn't draw.** A HOME widget crashed while drawing. It shows ⚠ and the message in its box. `home rm <widget>` takes it off HOME; the error is logged once per widget.

## E601

**the terminal couldn't start.** The system terminal could not start your shell. `term restart` tries again; Settings → shell can switch the panel to ibsh (`term mode ibsh`). On Windows, PowerShell needs to be installed (it is, by default).

## E701

**a setting couldn't be saved.** A setting could not be written to the config folder. It stays active until you quit. Check the disk and the permissions of the config folder.

## E702

**no such setting.** A command or a click asked for a setting this version of the deck doesn't know (a typo in `config set`, or a setting from another version). Nothing was changed, nothing is wrong with the disk. `config list` shows every setting.

## E901

**something went wrong.** Anything the deck did not expect. The detail line is the real message: open an issue on GitHub with it (and what you were doing), it helps a lot.

