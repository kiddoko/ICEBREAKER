# Permissions — who may reach what

No surprise: everything that can reach your notes, your AI, your terminal or the internet
has a name you can read, a level, a moment when you're asked, and a switch to take it away.
This page is the whole of it — for you first, for module authors after.

Where it lives in the code: `src/plugins/permissions.ts` (the names and their rules, pure),
`src/plugins/host.ts` (checked on every call), `src/shell/origin.ts` + `src/shell/classes.ts`
(the shell), `src/core/access.ts` (the journal), `src/workspace/permdialog.ts` (the dialog).

## The permissions

| | Permission | Level | plugin.json |
|---|---|---|---|
| ▤ | **Read your notes** — all of them, or only a folder | medium | `vault:read` · `vault:read:songs/` |
| ✎ | **Change your notes** — all of them, or only a folder | **high** | `vault:write` · `vault:write:songs/` |
| ◉ | **Use your AI** — your plan or your key | medium | `ai` |
| ♪ | **Play sound** | low | `audio` |
| ▶ | **Drive your music player** — what's playing; play, pause, skip | low | `media:control` |
| ♫ | **Read your audio files outside the vault** — any folder of this computer | medium | `media:files` |
| ▦ | **Your Google Calendar** — or only reading it | medium | `google-calendar` · `google-calendar:read` |
| ▁ | **Read the other modules' counters** | low | `stats:read` |
| ▤ | **See the computer's details** — the busiest programs, the disks, the network | medium | `system` |
| ◆ | **Notify you and talk to you** — toasts, alerts, the voice, signed with its name | low | `notify` |
| ❯ | **Run the deck's commands** — open a page, change the theme, start a timer | medium | `shell` |
| ⇅ | **Go online** — to the hosts named, one by one | **high** | `net:api.example.com` |
| ⚠ | **Type in your real terminal** — any command, with all your rights | **total** | `terminal` |

**Without any permission** a module can: show its page and its widgets, keep its own data
and settings, keep its own counters, ask you a question in a window signed with its name,
read the computer's vitals (CPU, memory, uptime).

**Never, whatever it holds**: go online by itself, touch your accounts or the vault's
encryption, install or switch other modules, update the deck, change your shortcuts, macros
or THE MENU's keys, rearrange your screen, touch your alarms, change your privacy settings,
read or write the deck's own folder (`.icebreaker/`).

## The four levels

| Level | When you switch the module on | When it's used |
|---|---|---|
| low | listed | nothing more |
| medium | listed, with a line that says what it means | nothing more — it's in the journal |
| **high** | listed in the warning colour; the answer starts on **No** | **asked again the first time it's really used**: no · this time · always |
| **total** | listed in red | **every command is shown to you first**, unless you answered "always for this module" |

"This time" is for what the question showed: that file (or that site), again in the next ten
seconds — another file is asked about on its own. A **new folder** it makes is asked as « make
the folder and write in it »: "this time" then covers the files it writes in that folder in the
next ten seconds (an export's stems: one question), never the folder's neighbours. Two questions at once come one after the
other, never one over the other. A command for your real terminal is shown whole, its hidden
characters made visible (`^M`, `⏎`, `<U+202E>`); one too long for the screen says so first.

## Seeing them, taking one away

- **Settings → PERMISSIONS**: ICEBREAKER itself first (stealth mode, what the AI may read,
  your real terminal, the access journal), then every module with each permission — on or
  taken away, its level, when it was last used. Enter (or a click) takes one away or gives
  it back.
- In the shell (only you can type these — a module can't):
  `plugin perms` · `plugin perms <id>` (with its last uses) · `plugin revoke <id> <permission>`
  · `plugin grant <id> <permission>`.
- A module you take a permission from **keeps running**: what needed it gets a clear error
  ("you took “Change your notes” away from it"), at once, without a restart.
- The modules that ship with the deck are in the list too, already allowed, and you can
  take their permissions away the same way.
- `plugin grant` only gives back what you took away. More than what you approved is
  approved by switching the module on again (`plugin enable <id>`).

## The access journal

Who used which permission, when, on what — a module, the AI, your real terminal. **Names
only**: a note's path, a host, a command's first word; never what a note says. Kept
**30 days**, on **this computer only** (`access.json` in the app's configuration folder —
it never goes into the vault, so it doesn't travel or sync).

Read it in the shell's **LOG** tab (the `◈ access` filter, `log show access`), or
`plugin perms <id>`.

## Updates

A module runs with what you approved, for the code you approved. An update that asks for
**more** is **held**: a dialog shows only what's new; say no and nothing is written — the
version you have keeps running. An update that asks for the same or less just installs.
Removing a module removes its approval: installed again, it asks again.

## What isn't a module

| Who | What it may do | Where it's set |
|---|---|---|
| **You** (ibsh, clicks, your shortcuts, your scripts) | everything | — |
| **A module's line** (`ib.shell.run`, a click on one of its areas) | what its permissions allow, and only the commands modules may run: `src/shell/classes.ts` is an allow-list — a command that isn't classed is refused | its permissions |
| **Your real terminal** (a program you run there isn't you typing) | plain vault: nothing · your notes only · notes, timers and alarms. Encrypted vault: nothing, always. What only you may do is typed in ibsh | Settings → PERMISSIONS → *Your real terminal* (`shell.bridge`) |
| **The AI** (UPLINK, `ask`, `chat`) | reads nothing · what you give it (a note you name in your message, pipe to it or have in front) · your whole vault. Writing a note always asks, showing the change. It never runs a command | Settings → PERMISSIONS → *What the AI may read* (`ai.reads`) |

While the AI reads, the clock (top right) says **◈ notes/ideas.md**, and the journal
keeps it. A new account starts on "what I give it"; an account made before 0.6 keeps the
whole vault, as it had.

**Stealth mode** is checked twice: in the page, and by the native side itself before any
of its commands goes online (the news, the STORE, a voice or the encoder pack to download,
updates, Google, Claude Code) — read from your account's own settings file.

## For module authors

```json
{
  "id": "my-module",
  "name": "My module",
  "version": "1.0.0",
  "api": 2,
  "permissions": ["vault:read:songs/", "vault:write:songs/", "audio", "notify", "net:api.example.com"]
}
```

- **`"api": 2`** says the module was written for these permissions: it gets exactly what it
  lists. Without it the module is read the old way — `media` is both halves, and it may
  notify and run the deck's commands as every module could before 0.6 (the dialog says so).
- **Ask for a folder, not the vault**, when a folder is enough: `vault:write:songs/` is the
  request people say yes to. `ib.vault.notes()` and `list()` then show only that folder;
  anything else is refused with a clear error. `ib.ai.vaultTools()` needs the whole vault.
- **`ib.net.get(url)`** — a GET over https to a host you named, text back (4 MB at most),
  through the deck's native side. No other method, no other host, nothing in stealth mode.
  `net:*.example.com` covers the sub-domains.
- **High-risk calls can be refused**: `ib.vault.write`, `ib.net.get` and
  `ib.use("terminal").run` reject when the person says no. Catch it and say what you
  couldn't do.
- **`notify`** covers `ib.ui.notify / alert / say` and the deck's `deck.notify / alert / say`
  and `sound.play`. **`shell`** covers `ib.shell.run` and the deck's functions that drive it
  (`tabs.go`, `theme.set`, `notes.open`, `keys.run`…). Your own commands on your own click
  areas need nothing.
- **`system`** adds `top`, `disks`, `netRx`, `netTx` and `load` to `sysmon.stats()`.
- The official STORE asks for `"api": 2` and the narrowest permissions that do the job
  ([COMMUNITY.md](COMMUNITY.md)).

## Accounts made before 0.6

Nothing is asked again. What each module was approved for is translated once at start
(`migratePermissions`, `src/core/settings.ts`): the old names become today's, what every
module could do without asking is written down, and the high-risk permissions it already
had are marked "always".
