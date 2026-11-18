# Privacy policy

*ICEBREAKER desktop app · last updated 18 November 2026*

ICEBREAKER runs on your computer. Its authors run **no server** and **no account
system**, and the app sends **no telemetry**. We do not collect, receive, sell or
share any of your data.

## What stays on your computer

Everything you create: notes, journal, tasks, calendar events of the local
calendar, settings, your music library index. They are plain files in your vault
or in the app's configuration folder.

## When the app uses the network

Only when you use a feature that needs it, and only to the service that feature
names:

| feature | goes to | sends |
|---------|---------|-------|
| AI (LINK, AI-powered modules) | the provider *you* choose: Claude (Anthropic) via Claude Code or an API key, or a local model (Ollama, nothing leaves your machine) | your messages and the notes you or the AI pick |
| Weather widget | open-meteo.com | the location you entered (city or coordinates) |
| News widget | Google News / Bing News RSS | your search terms, language, country |
| Google Calendar (optional) | googleapis.com | see below |
| Installing modules / themes | GitHub | the name of what you install |

Each of these can be left off. With no AI, no location and a local calendar, the
deck makes no connection at all.

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

Modules you install from others run inside the app with the permissions they
declare (shown before you enable them). Their network use is their own: read
their README and code before enabling them.

## Contact

Open an issue on the project's repository.
