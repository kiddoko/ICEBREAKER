# Security

**Please read [DISCLAIMER.md](DISCLAIMER.md) first**: ICEBREAKER is a hobby project made by
one person who isn't a professional developer, with an AI writing most of the code. It has
**never been audited by security professionals**. Security problems are taken seriously and
fixed as fast as we can — but that's a promise of good will, not of results: there's no
team, no bounty, no guarantee.

## Reporting a vulnerability

Please **don't open a public issue** (people could be harmed before it's fixed). Use
GitHub's private reporting: this repository → **Security** → **Report a vulnerability**
(or [this link](https://github.com/kiddoko/ICEBREAKER/security/advisories/new)).

Say what you found, how to reproduce it, and what it lets someone do. You'll get an answer
as soon as possible (usually within a week). Once it's fixed and released, the report is
published with credit to you, if you want.

## What matters most

- **Your notes leaving your computer, or being read when they shouldn't**: the vault's
  sandbox (`src-tauri/src/vault.rs`), the encryption (`crypto.rs`, `store.rs`,
  [docs/ENCRYPTION.md](docs/ENCRYPTION.md)), the accounts (`account.rs`).
- **A module doing more than its permissions**: the sandbox (`src/plugins/sandbox/`), the
  commands refused to modules (`src/shell/privileged.ts`), [docs/SANDBOX.md](docs/SANDBOX.md).
- **Code from outside running as you**: the shell bridge (`term.rs`), the STORE and
  `plugin install` (`src/plugins/install.ts`), updates (`appupdate.rs`,
  [docs/UPDATES.md](docs/UPDATES.md) — every update must be signed).
- **Secrets**: the API key, the Google sign-in (`google.rs`), the config files.

## What's known

Everything we found ourselves, fixed or still open, is in
[docs/SECURITY_AUDIT.md](docs/SECURITY_AUDIT.md) — read the *Open* part before trusting
ICEBREAKER with anything. In short, today:

- modules from the STORE and the vault run in a sandboxed Worker; the built-in modules
  still run in the deck (they ship with it);
- the vault can be encrypted; the encryption is home-made on well-known libraries
  (XChaCha20-Poly1305, Argon2id) and **not reviewed by cryptographers**;
- the macOS app isn't notarized and the Windows installer isn't signed with a paid
  certificate (your system warns you the first time);
- modules marked **not verified** in the STORE haven't been read by anyone from the
  project;
- the encryption, the sandbox and the security fixes of November 2026 were tried **on
  macOS only**: Windows and Linux builds exist but haven't been through the same tests;
- the code was reviewed once, in full, by an AI (findings #32–58 of the audit) — not by a
  person whose job it is.
