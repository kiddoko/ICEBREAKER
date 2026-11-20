# Credits and licenses

ICEBREAKER itself is under the [MIT license](../LICENSE). It stands on other people's work;
here is what it uses, and under which terms. If something is missing or wrong, please open
an issue.

## Inside the app

| what | where from | license |
|---|---|---|
| Typefaces: JetBrains Mono, IBM Plex Mono, Fira Code, Share Tech Mono, Space Mono, VT323 | [Fontsource](https://fontsource.org) (`@fontsource/*`) | SIL Open Font License 1.1 |
| The desktop shell | [Tauri](https://tauri.app) | MIT / Apache-2.0 |
| Rust libraries (encryption, zip, HTTP server for the Google sign-in…) | crates.io — the list is in `src-tauri/Cargo.lock` | mostly MIT / Apache-2.0 (each crate's own) |
| JavaScript libraries | npm — the list is in `package-lock.json` | each package's own (MIT for most) |
| Nightshade's palette | inspired by [Catppuccin](https://catppuccin.com) | MIT |
| The quotes widget | old philosophers (public domain) and our own lines | — |

## breakerMED (the tracker module, `modules/breakermed/`)

Our own code. What it reads is public: the `.mod` format (ProTracker's, documented everywhere) and
OctaMED's MMD0 / MMD1 as Teijo Kinnunen described them in MED-FORM.TXT. For MMD2 / MMD3, the command
pages, the tempo modes and the octave folding of the Amiga's voices, we checked our reader against
[libopenmpt](https://lib.openmpt.org)'s (`soundlib/Load_med.cpp`, BSD-3-Clause, © OpenMPT
Devs): read for reference, not copied. OctaMED's name, code, look and samples aren't used: breakerMED
works *like* it and reads its files (interoperability), nothing more.

## Downloaded when you ask for them

| what | when | from | terms |
|---|---|---|---|
| The natural voice engine (sherpa-onnx) | `voice install` | [k2-fsa/sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx) releases | Apache-2.0 |
| The voices (piper models: jenny_dioco, amy, siwis…) | `voice install` | sherpa-onnx's `tts-models` releases | **each voice has its own license**, written in the files it downloads (MODEL_CARD). Some are only for personal / non-commercial use: check before using what they say for anything commercial |

## Services the app talks to (only if you use them)

| service | for | terms |
|---|---|---|
| [Open-Meteo](https://open-meteo.com) | WEATHER | free for non-commercial use; data under CC BY 4.0 (credited in the WEATHER page) |
| Google News / Bing News RSS feeds | NEWS | headlines and the summary the feed gives, with a link to the article — the articles stay on their sites |
| Google Calendar | CALENDAR (optional) | [Google's terms](https://policies.google.com/terms); you sign in with your own account |
| Anthropic (Claude API, Claude Code) | UPLINK (optional) | [Anthropic's terms](https://www.anthropic.com/legal); your own key or subscription |
| Ollama | UPLINK, local (optional) | runs on your machine; each model has its own license |
| GitHub | the STORE, updates | [GitHub's terms](https://docs.github.com/site-policy) |

What each one receives is in [PRIVACY.md](PRIVACY.md).
