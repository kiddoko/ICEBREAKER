# Vault encryption and module sandbox — the plan

Status: **built** (2026-11-20): encryption, the recovery key, `vault rekey`, portable vaults
(an account and its settings travel with the vault, to any computer and any system) and the
module sandbox ([SANDBOX.md](SANDBOX.md)). Encryption is an **option** (the setup, Settings →
PRIVACY, `vault encrypt`), reversible as often as you like. Home-made on well-known libraries,
never reviewed by experts ([../DISCLAIMER.md](../DISCLAIMER.md)). The decisions are at the bottom.
A mistake here can lose notes: every step comes with tests on a copy of a vault.

## What we want

- A vault that is **unreadable outside ICEBREAKER**: copied to a USB key, synced
  to iCloud, stolen with the laptop — only noise without the account password.
- **Nothing in clear on the disk** inside the vault: notes, journal, trash, chats,
  module data, the deck's own files in `.icebreaker/`.
- **No module can read more than it should**, even once notes are decrypted in memory.
- **No way to lose everything** by forgetting a password, and a backup before any
  change to an existing vault.

## How it would work

### Keys

```
account password ──Argon2id (salt, 64 MB, 3 passes)──► key-encryption key (KEK)
                                                            │ wraps
random 256-bit vault key (DEK) ◄─────────────────────────────┘
        │ encrypts every file (XChaCha20-Poly1305, a new random nonce per write)
        ▼
.icebreaker-vault/vault.key  =  salt + Argon2 params + DEK wrapped by the KEK
                                (+ DEK wrapped by the recovery key, if you keep one)
```

**In plain words — three things, one lock:**

| | what it is | you see it? | when it changes |
|---|---|---|---|
| **the vault key** | the one key that encrypts every file (random, 256 bits) | never — it stays in the key file, locked | only with `vault rekey` (Settings → *Vault key*): every file encrypted again |
| **your password** | opens the key file, so the vault key | you type it at login | `account passwd`: the key file is re-locked, nothing else |
| **the recovery key** | 24 words that **also** open the key file | once, to write on paper | `vault recovery` (Settings → *Recovery key*): new words, the old ones stop working |

So the password and the 24 words are two doors to the same vault key. *Recovery key*:
you lost the password. *Vault key*: you fear someone kept an **old copy** of the vault
and an old password or old words — a new vault key makes that copy useless for today's files.

- The **vault key** is random and doesn't change by itself: changing the password only
  re-wraps it (instant, nothing re-encrypted); `vault rekey` makes a new one.
- A **recovery key** (24 words, shown once at the start, to write on paper) also
  unwraps the vault key: the only way back if the password is forgotten.
- Keys live **only in the Rust side's memory**, wiped (`zeroize`) on lock, logout
  and quit. The interface (TypeScript) never sees them.

### Files

- Each file on disk: `IBX1` (magic) · nonce (24 bytes) · ciphertext · tag (16 bytes).
  The tag means a changed or damaged file is refused, never shown half-wrong.
- The vault's reading and writing (`src-tauri/src/vault.rs`) decrypts and encrypts
  on the way: the rest of the deck (tree, editor, search, modules through `ib`)
  works as today.
- Writes go to a temporary file then are renamed over the old one (no half-written
  note if the power goes).

### Turning it on: `vault encrypt`

1. A full **backup** first, next to the vault: `<vault>-backup-<date>.zip` (e.g.
   `~/Documents/Icebreaker-backup-2026-11-20-1432.zip`; plain, so it can always be
   opened — you delete it when you're sure).
2. Every file encrypted, then **read back and compared** before the plain one is
   removed. Any difference: stop, nothing deleted.
3. The opposite exists: `vault decrypt` (back to plain files) and `vault export
   <folder>` (a plain copy, the vault stays encrypted).

### What changes for you

| | today | encrypted |
|---|---|---|
| ICEBREAKER (tree, notes, search, modules) | ✓ | ✓ the same |
| UPLINK with an API key or a local model (Ollama) | ✓ | ✓ (it reads notes through the deck) |
| UPLINK with **Claude Code** | ✓ reads the vault's files | ✗ it gets no file at all — only what you type (`cat note.md \| ask "…"` gives it one) |
| **ibsh** (`cat`, `grep`, `ls`…) | ✓ | ✓ (it goes through the vault) |
| **your real terminal** (zsh, vim, git) on the vault's files | ✓ | ✗ sees noise — `vault export` for a plain copy |
| **Obsidian** on the ICEBREAKER vault | ✓ | ✗ — keep Obsidian on its own vault |
| sync (iCloud, Syncthing, git) | ✓ | ✓ (encrypted blobs; conflicts as today) |

### What step 1 built (`src-tauri/src/crypto.rs`)

- `VaultKey`: 32 random bytes on the heap, never copied, not printable, wiped on drop.
- `seal` / `open`: the `IBX1` format above. The magic is authenticated, and each
  file can be bound to a name (its blob number): a file swapped with another one
  is refused like a damaged one.
- `KeyFile` (`vault.key`, JSON, readable by your user only): `password` and
  `recovery` slots, each = random salt + Argon2id cost + the wrapped vault key.
  A forged cost (4 GiB of memory…) is refused before anything runs.
  `change_password` re-wraps, `set_recovery` replaces the old recovery key.
- `write_atomic`: temp file in the same folder → flushed → renamed → folder flushed;
  `sweep_temp_files` removes what a crash left.
- Tests in `crypto.rs`: round trips, every damaged byte, every cut, wrong key, wrong
  name, wrong password, new password, recovery key, damaged / forged key file,
  interrupted write, the sweep, the key wiped.

### What step 2 built (`src-tauri/src/store.rs`, `vault.rs`)

On disk an encrypted vault is **one folder** and nothing else:

```
<vault>/.icebreaker-vault/
    vault.key, vault.key.copy   the wrapped vault key (two copies)
    index.ibx                   encrypted: every path (names, folders) → its blob, sizes, dates
    blobs/3f/3fa1….ibx          one encrypted blob per file, random names
```

- Every vault command (`vault.rs`) works the same on a plain and an encrypted vault:
  the deck, ibsh and the modules don't know which one they talk to.
- **A write** makes a new blob, then writes the index (atomically), then removes the
  old blob: a crash leaves the old note or the new one. Each blob also holds the path
  it was written at, so a blob the index doesn't know comes back in
  `.trash/recovered-<time>/…`, and a lost or damaged index is rebuilt from the blobs
  (the damaged one is kept). Nothing is ever deleted because it looks unknown.
- **Renames and moves** only rewrite the index.
- **The login** hands the password to the vault (in Rust memory, wiped once used);
  **lock, logout and quit** drop the unlocked vault: key and index wiped. A new account
  password re-wraps the vault key (put back if the account can't be saved).
- `vault encrypt` **refuses before touching anything**: a `.git` folder (your notes'
  history, in plain), links, a file over 512 MB. It builds the encrypted copy in
  `.icebreaker-vault.partial/` (an interrupted run leaves the plain vault as it was),
  opens it again **with the password** and compares every file before a plain one is
  removed. Finder's `.DS_Store` files are removed, not encrypted.
- `vault decrypt` never overwrites a file; on any problem it removes what it wrote
  and the vault stays encrypted. `vault export <folder>` asks the password again (checked
  by the native side, like self-destruct) and wants a new or empty folder outside the vault.
- The **plain backup zip** `vault encrypt` makes first stays next to the vault until YOU
  delete it (readable by your user only): it's your notes in plain. Deleted plain files
  aren't shredded: on an SSD nothing can promise that.
- **Claude Code** gets no access to the disk of an encrypted vault (an empty folder,
  no file tools): it would only read noise, and must never write plain files into it.
- Tests in `store.rs` (round trips, nothing readable on disk, moves, a crash
  between blob and index, a damaged index, a damaged blob, another key, encrypt →
  decrypt gives back the same vault, a failure at each stage changes nothing, a note
  changed meanwhile stops it, what's refused, decrypt never overwrites, export), plus
  `real_vault_copy` (run by hand on a copy of a real vault).

### What step 4 built: the recovery key (`src-tauri/src/recovery.rs`)

- **24 words** from the standard BIP39 English list = 256 random bits + a checksum
  (a typo or a swapped word is caught, and the error names the word). Typing them
  back is forgiving: any case, numbers in front, the first 4 letters of each word.
- Made by `vault encrypt` (the vault never exists without one) and by `vault
  recovery` (a new one; the old one stops working). It wraps the same vault key as
  the password (the key file's `recovery` slot, Argon2id like the password).
- **Shown once** in the shell (3 rows of 8), then **one word is asked back — no way
  around it** (esc or a wrong word shows them again), then the screen is cleared: the words are kept nowhere (not in the
  shell history, not in the scrollback, not on disk).
- **Password forgotten**: login page → *forgot password?* → the account's name, the 24
  words, a new password. The vault key is re-wrapped by the new password and the
  account's password replaced; the recovery key keeps working. (The vault is the one
  the account's settings name.) In the shell, `vault unlock` also takes the 24 words
  (then your account's password opens that vault from now on).
- Tests: 4 in `recovery.rs` (round trip, forgiving input, mistakes named, the known
  all-zero vector) and `the_recovery_key_brings_a_forgotten_password_back` in `store.rs`.

### Portable vaults: any computer, any system, any version

**What the vault carries** (`src-tauri/src/account.rs`, "portable vaults"):

- `.icebreaker/account.json` — the account's card: a random uid (the same on every
  computer), its name, its password's Argon2id hash.
- `.icebreaker/settings.json` — its settings, without where the vault is on this computer;
  `.icebreaker/secrets.json` (your API key) **only inside an encrypted vault**. The Google
  sign-in never goes into a vault: it stays in the app's configuration folder
  (`google.json`), so it doesn't travel — you sign in again on another computer.
- They're written each time the settings are saved, and when the vault is mounted. Inside
  an encrypted vault they're encrypted like everything else.

**On another computer** — login page → *open a vault*: the vault's folder (a USB key:
`/Volumes/KEY/Icebreaker`, `E:\Icebreaker`), the account's name and password.

- Encrypted: the key file proves the password. Plain: the card's hash does.
- The account is made on that computer with the same uid, the settings come from the
  vault, and the login opens it as usual from then on.
- Making it needs an account of that deck to approve (like *+ new account*: whoever gets
  in gets a terminal); the first account of a fresh install doesn't.
- An account with the same name but another uid is refused (rename one).
- Forgot the password there: *open a vault* → *forgot its password?* → the folder, the
  name, the 24 words, a new password.

**Back and forth**: when the vault's settings are newer than this computer's (changed on
the other one), they replace them at mount (where the vault is here is kept); otherwise this
computer's go into the vault. Another account's vault (another uid) is never touched.

- From an **encrypted** vault everything comes, a new name or password too: only its
  password writes in it.
- A **plain** vault is a folder anyone with access can write in (a sync, a shared USB key,
  another program). So from a plain vault: **never a password or a name**, never the
  settings that hold commands or decide what runs (your keys, THE MENU, macros, pins, the
  module list, the AI, privacy, updates) — and the rest only after you say yes. Changed
  your password on one computer? Change it on the other too, or encrypt the vault.
- A vault whose card names an account of this deck is that account's only if the password
  already is its password, or it's the vault that account uses; else an account of the deck
  approves it, as for a new one (a vault made by someone else can't take an account over).

**Every system**: inside an encrypted vault every name is in one Unicode form (NFC: an
"é" typed on a Mac, often e + accent, is the same name on Linux and Windows; two names that
would be one stop `vault encrypt` before anything). Blobs have hex names, the key file and
the index are JSON — nothing depends on the system. `vault decrypt` / `export` say first
which names this computer can't hold (Windows: `:` `?` `*` `CON`…, a trailing dot) and
write nothing. Line endings and file contents are never changed.

**Every version**:

- The key file and the index carry a version; one written by a **newer** ICEBREAKER is
  refused with "update ICEBREAKER" — never "repaired" — and nothing is changed.
- Settings: values of a kind this version doesn't expect keep the default (no crash);
  keys it doesn't know are written back as they were (going back and forth between
  versions loses nothing).
- An older ICEBREAKER (before encryption) shown an encrypted vault sees an empty folder
  and may write plain files next to `.icebreaker-vault/` (START HERE, its history…):
  `vault status` says so, and `vault adopt` puts them inside (checked, then the plain
  ones removed; a name already taken keeps the encrypted note, the other goes to
  `.trash/from-plain-…`).

Tests: 55 in Rust (`cargo test`), among them: encrypt ↔ decrypt three times over, a Mac name
with separate accents, two names that are one, Windows names, an index from a newer
version, plain files adopted; and the settings test (a newer version's keys kept, a
changed kind survived). Tried in the app with copies of a vault: open an encrypted vault
by its name and password, forgot its password with the 24 words, a plain vault never
seen opening as a new (approved) account, the setup's ENCRYPTION step, Settings → PRIVACY.

### Closed to modules, menus and windows (2026-11-20)

- **Modules never touch the encryption**: what a module has the deck do runs as that module
  (`src/shell/origin.ts`), and the vault's encryption and place, accounts, self-destruct and
  installing modules are refused to it (`src/shell/privileged.ts`); a module can't register a
  command named `vault`, `account`… nor (from the STORE / the vault) replace any command, page
  or action of the deck or of another module; the account's card, settings and secrets in the
  vault are refused by the native side to the UI, modules, ibsh and the AI — however the name
  is written (`vault.rs` `guard`); Claude Code can't read `.icebreaker/`. Modules from the
  STORE and the vault run in the Worker sandbox ([SANDBOX.md](SANDBOX.md)).
- **Typed in the shell, it stays in the shell** (the questions are y/N lines, the words are
  text, then cleared). **With `--window`** — what Settings, THE MENU and the setup use — every
  step is a window: the confirmation, the password, the recovery key, then the result (where
  the plain backup went; "Wrong password" in red when it is). The setup encrypts before the
  tour starts.
- **From the menus** (Settings → PRIVACY, THE MENU's *Vault: …* actions, the setup) the
  password is asked in a dialog and the recovery key shows in its **window**: the 24 words
  in 4 columns, *copy all* (the clipboard is emptied a minute later if they're still in it),
  one word to type back to close. In the shell: `vault encrypt --window`, `vault recovery
  --window`; without it, the words are text in the shell (then cleared).
- **Moving the vault**: `vault move [folder]` (Settings → VAULT → *Move vault*, THE MENU) — a
  folder that already holds things (Documents, a USB key) gets the vault **inside it**, under
  its own name; an empty or new one becomes the vault:
  every file copied (encrypted or not, dot-files included), each one read back and
  compared, then ICEBREAKER uses the new place (an unlocked vault stays unlocked); the old
  folder is removed only if you say so — only that one, never a home folder or a disk root.
  Links in the vault stop it before anything. `vault mount` (Settings → *Vault folder*) still
  means "use another folder", nothing copied.
- **Choosing folders**: the login page's vault folder (open a vault, forgot its password),
  *Move vault*, *Vault folder* and THE MENU's plain copy open the deck's own file browser
  (`browse`, ctrl+O): *choose this folder*, ⏏ for the drives (a USB key).

### A new vault key: `vault rekey` (2026-11-20, the security pass)

A new password re-wraps the **same** vault key: someone who kept an old copy of
`vault.key` and knows the old password could still open today's files. `vault rekey`
(Settings → PRIVACY → *Vault key*, THE MENU *Vault: a new key*, the account's password
first) makes a **new** vault key: every file is decrypted and encrypted again into
`.icebreaker-vault.partial/` with a new key file and a new recovery key, each file is read
back with the new key and compared, then the folders are swapped (`.icebreaker-vault.old/`
for an instant, removed after). A crash in the middle leaves either the old vault or the
new one, whole — never a mix (`store::finish_interrupted`, run when the vault is mounted). The new
24 words show in the recovery window; the old ones, the old key file and the old password
open nothing. Tests: `rekey_gives_a_new_key_and_the_old_one_opens_nothing`,
`an_interrupted_rekey_leaves_the_vault_as_it_was`.

Also from the security pass: the key files are written `0600` from their creation, and
the first *copy all* in the recovery window warns that a clipboard history may keep the
words (the second click copies). See docs/SECURITY_AUDIT.md.

**Known limits, for now:** changes made to the encrypted folder from outside (a sync
bringing another computer's edits) are not followed live — reopen the vault. Two
computers editing at once through a sync conflict on the one index: no note is lost
(unknown blobs come back in `.trash/recovered-…`), but you may have to put them back.

## The module sandbox

**Built (step 5, 2026-11-20)**: modules from the STORE and the vault run in a **Worker**
(`src/plugins/sandbox/`): no page, no deck, no native bridge, no network functions;
every `ib` call is a message the deck checks with the module's permissions; their
pages and widgets are drawn in the Worker and copied by the deck. Tested with a module
written to escape (fetch, XHR, WebSocket, a nested Worker, the Tauri bridge, the page,
importing code from the network, factory-reset, scripts, the account's files, another
module's code, taking the `vault` command): every door closed. Details: docs/SANDBOX.md.
The built-in modules (TODO, CALENDAR…) still run in the deck: they ship with it.

## The AI

When you ask UPLINK about your notes, the notes it reads are sent **decrypted** to
the provider you chose (Claude Code / the API), as today; a local model (Ollama)
keeps everything on the machine. Encryption protects the disk, not what you send.
It's written plainly in the privacy page ([PRIVACY.md](PRIVACY.md)). With **Claude Code**
and an encrypted vault, UPLINK reads no note at all (the table above): it only gets what
you type.

## Order of work

1. ✓ Rust: key derivation, wrap / unwrap, file format, tests (wrong password, damaged
   file, interrupted write) — `src-tauri/src/crypto.rs`, `cargo test crypto`.
2. ✓ Rust vault I/O through it; `vault encrypt` / `decrypt` / `export` with backup and
   verification; tests on a copy of a real vault — `src-tauri/src/store.rs`, `vault.rs`.
3. ✓ Login: unlocking the account unlocks the vault key; lock wipes it; a new password
   re-wraps the vault key. Encryption is offered by the setup and Settings (not the default).
4. ✓ Recovery key (shown once, `vault recovery` to make a new one) — `src-tauri/src/recovery.rs`.
5. ✓ Module sandbox step 1 (store modules in Workers). Then `vault rekey` (a new vault key).
6. ✓ Docs, privacy page, the in-vault docs. Tested on macOS only: **Windows and Linux are
   still to be tried.**

## Decisions (taken 2026-11-20)

1. **Recovery key: yes.** 24 words shown once (and `vault recovery` to make a new one).
2. **File and folder names are encrypted too.** On disk the vault is only numbered
   blobs plus an encrypted index (the tree, the names, the folders); the tree reads
   the index, so it stays fast. Renames and moves only rewrite the index.
3. **The real terminal sees noise** in the vault — accepted. ibsh reads notes
   through the vault; `vault export <folder>` makes a plain copy.
4. ~~On by default~~ — **changed the same day: an option**, never the default. The setup
   asks (plain is the first choice), Settings → PRIVACY switches it either way, as often
   as you like; `vault encrypt` makes a backup first.
5. **Portable vaults** (2026-11-20): a vault opens on any computer — plain or encrypted,
   on a USB key — with its account's name and password (or its 24 words); its settings
   come with it; Mac ↔ Windows ↔ Linux, older ↔ newer ICEBREAKER without breaking.
6. **The recovery key is checked**: one of the 24 words is asked back, no way around it.
