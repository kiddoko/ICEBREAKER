# Privacy policy

*ICEBREAKER desktop app · last updated 20 November 2026*

ICEBREAKER runs on your computer. Its authors run **no server** and **no online
accounts** (the deck's accounts live on your computer only), and the app sends
**no telemetry**. We do not collect, receive, sell or
share any of your data.

## What stays on your computer

Everything you create: notes, journal, tasks, calendar events of the local
calendar, settings, your music library index. They are plain files in your vault
or in the app's configuration folder.

**Accounts** are local: a name, a profile icon and a password. The password is
never stored — only an Argon2id hash of it, in the app's configuration folder.
**Modules** (the STORE's, yours) can't run the vault's encryption or accounts,
can't read your account's card, settings or secrets in the vault, and
can't pose as the deck's own commands or pages. They run in a **sandbox** (a Worker):
no page, no native side, no network of their own — only what their permissions allow
(docs/SANDBOX.md).

Your **vault carries your account** so you can open it on another computer: a card
(`.icebreaker/account.json`: your name and an Argon2id hash of your password — never
the password) and your settings. In a plain vault anyone who can read the folder can
read them (and try passwords against the hash offline, slowly); in an encrypted vault
they're encrypted. Your API key goes into the vault only when it's encrypted; the Google
sign-in never does (it stays in the app's configuration folder). A plain vault opened on
another computer never changes that computer's password, keys, macros or module list, and
its other settings only after you say yes.

An account locks the app. Its vault can also be **encrypted** (an option: the setup,
Settings → PRIVACY, `vault encrypt`,
[ENCRYPTION.md](ENCRYPTION.md)): then the folder on your disk holds only noise —
no note, no name, no folder in clear — and your account's password opens it at
login. Not encrypted (the default for now), anyone who can open the vault folder
on your disk can read your notes. Encryption protects the disk, not what you send:
the notes the AI reads go to the provider you chose decrypted, as before; with
Ollama they stay on the machine. Forget the password of an encrypted vault
and its **recovery key** (24 words shown once, to write on paper) gives it back: login
page → *forgot password?*. ICEBREAKER keeps no copy of those words; whoever has the
paper can open the vault. If an old copy of the vault may be in someone's hands,
**`vault rekey`** (Settings → PRIVACY → *Vault key*) encrypts everything again with a new
key: the old copy's password and words open nothing new.

**On your computer, other people's eyes**: the files with your secrets (API key, Google
sign-in, accounts, the vault's key) are readable only by your user. Dictation's sound
and text stay in the app's private folder, deleted once read. The shell's history doesn't
keep lines that look like a key or start with a space. Programs you run in your own
terminal don't get the deck's powers over an encrypted vault. Copying the 24 recovery
words warns you first: a clipboard history app may keep them.

## When the app uses the network

Only when you use a feature that needs it, and only to the service that feature
names:

| feature | goes to | sends |
|---------|---------|-------|
| AI (UPLINK, AI-powered modules) | the provider *you* choose: Claude (Anthropic) via Claude Code or an API key, or a local model (Ollama, nothing leaves your machine) | your messages, the notes you or the AI pick, and UPLINK's context page (below); with the Japanese voice, the answers to translate |
| Weather widget | open-meteo.com | the location you entered (city or coordinates) |
| News widget | Google News / Bing News RSS | your search terms, language, country |
| Google Calendar (optional) | googleapis.com | see below |
| STORE: installing modules / themes | GitHub, or the sources you add yourself | the name of what you install |
| `encoders install` (once) | GitHub (ICEBREAKER's `encoders-v1` release) | nothing but the download request; the encoding itself happens on your computer |
| `voice install` (once) | GitHub (the sherpa-onnx engine and a piper voice) | nothing but the download request |
| Updates (Settings → UPDATES; every day by default, never in stealth mode) | GitHub (ICEBREAKER's public releases; each module's own repo) | nothing but the download requests (your version and system are in the address of the file asked) |

The voice itself is synthesized on your computer: what it reads never leaves it.

**UPLINK's context page** (`.icebreaker/context.md`, `context` opens it) goes to
the AI provider at the start of every conversation: your handle and profile, the
place you gave at setup, the names of your folders, of the last notes you touched
and of your pins, your colour tags, the modules that are on, the date — plus what
you wrote in it yourself. Read it and change your part whenever you like (the
automatic part is rebuilt before each conversation). With
a local model (Ollama) none of it leaves your machine.

Each of these can be left off. **Stealth mode** (`stealth on`, or "Stealth" in
the setup) turns all of them off at once and blocks any connection outside this
computer and your local network.

## Google user data

If you choose to connect Google (CALENDAR module, `cal google connect`),
ICEBREAKER asks for two permissions:

- **See your calendars and events** (`calendar.readonly`): to list your
  calendars and show your events in the app.
- **View and edit events on your calendars** (`calendar.events`): to add an
  event to the calendar you pick, and to remove an event — only when you ask.

How this data is handled:

- ICEBREAKER talks directly from your computer to Google's servers. The data
  never goes through a server of ours: there is none.
- Events from about the last month and the next six months are kept in a cache
  on your computer, in the app's configuration folder — **not in your vault** —
  so that no AI assistant or file-sync tool working on your vault can read it.
- The access token is stored only on your computer, readable by your user
  account only.
- Google user data is not used for advertising, not sold, not shared, not used
  to train AI models, and not sent to the AI assistant. It is used only to show
  and change your calendar inside ICEBREAKER, at your request.

ICEBREAKER's use and transfer of information received from Google APIs adheres
to the [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy),
including the Limited Use requirements.

**Removing access:** `cal google disconnect` revokes access at Google and deletes
the token and the cache from your computer. You can also remove ICEBREAKER at
[myaccount.google.com/permissions](https://myaccount.google.com/permissions).

## Third-party modules

Modules you install from others run in the sandbox with the permissions they declare
(shown before you enable them; never more later without your yes). They have **no network
of their own**; with the `ai` permission what they send goes to your AI provider, and with
`terminal` they can type commands in your real terminal — which can do anything, network
included. Read their README and code before enabling them.

## Contact

Open an issue on the project's repository.

## Deleting the vault

There is no command for it: the deck never deletes your notes for good (`rm` sends to the
trash, `.trash/`). `self-destruct`, which emptied the vault folder, was removed in 0.5.2.
To get rid of a vault, delete its folder yourself (Finder, Explorer…) — and its copies
elsewhere: iCloud / Dropbox / Syncthing copies on other devices, git remotes, Time Machine
and other backups.
