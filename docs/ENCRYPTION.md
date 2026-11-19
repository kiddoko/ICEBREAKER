# Vault encryption and module sandbox — the plan

Status: **agreed (2026-11-20), not built yet.** The decisions are at the bottom.
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
.icebreaker/vault.key  =  salt + Argon2 params + DEK wrapped by the KEK
                          (+ DEK wrapped by the recovery key, if you keep one)
```

- The **vault key** is random and never changes: changing the password only
  re-wraps it (instant, nothing re-encrypted).
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

1. A full **backup** first: `~/Documents/Icebreaker-backup-<date>.zip` (plain, so it
   can always be opened — you delete it when you're sure).
2. Every file encrypted, then **read back and compared** before the plain one is
   removed. Any difference: stop, nothing deleted.
3. The opposite exists: `vault decrypt` (back to plain files) and `vault export
   <folder>` (a plain copy, the vault stays encrypted).

### What changes for you

| | today | encrypted |
|---|---|---|
| ICEBREAKER (tree, notes, search, UPLINK, modules) | ✓ | ✓ the same |
| **ibsh** (`cat`, `grep`, `ls`…) | ✓ | ✓ (it goes through the vault) |
| **your real terminal** (zsh, vim, git) on the vault's files | ✓ | ✗ sees noise — `vault export` for a plain copy |
| **Obsidian** on the ICEBREAKER vault | ✓ | ✗ — keep Obsidian on its own vault |
| sync (iCloud, Syncthing, git) | ✓ | ✓ (encrypted blobs; conflicts as today) |

## The module sandbox

Today a module runs inside the deck: it's checked before install (`plugins/audit.ts`)
and its `ib` object is frozen, but technically it can read anything in memory —
decrypted notes included. With encryption that matters.

The plan (`docs/SANDBOX.md`), in two steps:

1. **Modules from the STORE** (not the built-in ones) run in a **Worker**: their own
   JavaScript world with no access to the deck, the DOM, the network or the disk.
   They talk to the deck only through `ib` messages, and the deck checks each call
   against the module's declared permissions (`vault:read`, `vault:write`, `net`…).
   Their widgets and apps draw through a small drawing list sent each frame.
2. Later, the built-in modules too, once the drawing protocol is proven.

## The AI

When you ask UPLINK about your notes, the notes it reads are sent **decrypted** to
the provider you chose (Claude Code / the API), as today; a local model (Ollama)
keeps everything on the machine. Encryption protects the disk, not what you send.
This will be written plainly in the privacy page.

## Order of work

1. Rust: key derivation, wrap / unwrap, file format, tests (wrong password, damaged
   file, interrupted write).
2. Rust vault I/O through it; `vault encrypt` / `decrypt` / `export` with backup and
   verification; tests on a copy of a real vault.
3. Login: unlocking the account unlocks the vault key; lock wipes it.
4. Recovery key (shown once, `vault recovery` to make a new one).
5. Module sandbox step 1 (store modules in Workers).
6. Docs, privacy page, the in-vault docs, tests on Mac / PC / Linux.

## Decisions (taken 2026-11-20)

1. **Recovery key: yes.** 24 words shown once (and `vault recovery` to make a new one).
2. **File and folder names are encrypted too.** On disk the vault is only numbered
   blobs plus an encrypted index (the tree, the names, the folders); the tree reads
   the index, so it stays fast. Renames and moves only rewrite the index.
3. **The real terminal sees noise** in the vault — accepted. ibsh reads notes
   through the vault; `vault export <folder>` makes a plain copy.
4. **On by default**: the setup of a new account encrypts its vault (it says so,
   and shows the recovery key); an existing vault goes through `vault encrypt`
   (backup first).
