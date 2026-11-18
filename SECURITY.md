# Security

## Reporting a vulnerability

Please **don't open a public issue**. Use GitHub's private reporting:
repository → *Security* → *Report a vulnerability*. Include what you found, how
to reproduce it, and what it lets an attacker do. You'll get an answer within a
week.

## What's in scope

- the native side (`src-tauri/`): vault sandboxing, the shell bridge, config
  files, the Google sign-in and token storage;
- the plugin host and its permission checks (`src/plugins/`);
- anything that leaks vault content, tokens or Google data.

## Good to know

- Modules run in the app's JavaScript context: permissions shape the API they
  get, but a malicious module could still misbehave. Read a module's code before
  enabling it. A sandboxed Worker is on the roadmap.
- The optional login locks the app; it does not encrypt your notes.
