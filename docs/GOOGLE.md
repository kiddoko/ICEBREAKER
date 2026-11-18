# ICEBREAKER's Google OAuth client

The CALENDAR module signs in to Google with ICEBREAKER's own OAuth client, so
users only run `cal google connect` and click "Allow". This page is for the
maintainer: how the client gets into builds, and how to get it verified.

## 1. Put the client in your local builds

1. Google Cloud console → **Google Auth Platform → Clients** → ICEBREAKER
   (type *Desktop*) → copy the **client ID** and the **client secret**
   (no secret shown? *Add secret*, copy it right away).
2. Copy `src-tauri/google-client.example.json` to `src-tauri/google-client.json`
   and paste both values. That file is git-ignored: it never gets committed.
3. Build as usual (`npm run app:mac`). `build.rs` bakes the client into the
   binary; `cal google status` then says *OAuth client: ICEBREAKER's*.

For release builds, add the same two values as repository secrets
`GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` (GitHub → Settings → Secrets and
variables → Actions). The build workflow writes the file from them.

Is it OK that the secret ships inside the app? Yes: for installed apps Google
treats the client secret as non-confidential. What protects users is that each
one signs in with their own account, and PKCE (which ICEBREAKER uses).

## 2. Consent screen (Google Auth Platform)

| page | what to set |
|------|-------------|
| **Branding** | App name `ICEBREAKER` · support email · logo (120×120 PNG) · home page, privacy policy, terms (see §4) · authorized domain: the site's domain |
| **Audience** | User type **External** → **Publish app** (status *In production*). While in *Testing*, only listed test users can sign in and their sign-in expires after 7 days |
| **Data access** | Add the scopes `.../auth/calendar.readonly` and `.../auth/calendar.events` (both "sensitive", none "restricted": no paid security audit) |

Also check that **Google Calendar API** is enabled (APIs & Services → Library).

Until the app is verified: users see a "Google hasn't verified this app"
screen (*Advanced → Go to ICEBREAKER*), and at most 100 people can sign in.

## 3. Verification (removes the warning and the 100-user cap)

Google Auth Platform → **Verification center** → *Prepare for verification*.
Usually a few days to a few weeks. Have ready:

**Scope justifications** (paste as is):

- `calendar.readonly` — "ICEBREAKER is a desktop app. Its CALENDAR module lists the user's calendars and shows their upcoming events in the app (an agenda, a month view and a home-screen widget). Calendar data is only stored on the user's own computer, as a local cache, and is never sent to any server other than Google's."
- `calendar.events` — "Users add events from ICEBREAKER (e.g. `cal add \"dentist\" fri 14:30`), choosing which of their calendars receives the event, and can remove events they see in the app. ICEBREAKER only changes events when the user asks for it."

**Demo video** (unlisted YouTube link, 2–3 minutes, English UI):

1. Show the app, then run `cal google connect` in its terminal.
2. The browser opens Google's consent screen: show that the URL contains ICEBREAKER's client ID, the app name, and both scopes; click Allow.
3. Back in the app: `cal calendars` (reading the calendar list), the CALENDAR app and the "upcoming" widget (reading events).
4. Add an event with the app's `+ add` button, pick a calendar in the list, then show it in Google Calendar on the web (writing).
5. Remove it with `x` in the app, refresh Google Calendar (deleting).
6. `cal google disconnect` (revoking access).

**Pages:** home page and privacy policy on a domain you own, which must also
be verified in Google Search Console and listed as an authorized domain.

## 4. The web pages

They live in `site/` (home, privacy policy, terms of use) and are published by
the public repository **kiddoko/kiddoko.github.io** (GitHub Pages) — copy the
files there after changing them:

| consent screen field | value |
|---|---|
| Home page | `https://kiddoko.github.io/` |
| Privacy policy | `https://kiddoko.github.io/privacy.html` |
| Terms of use | `https://kiddoko.github.io/terms.html` |
| Authorized domain | `kiddoko.github.io` |

Domain ownership: Google Search Console → add the URL-prefix property
`https://kiddoko.github.io/` → *HTML file* method → put the `google….html` file
it gives you at the root of kiddoko.github.io.
