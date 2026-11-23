/**
 * The error log: every error gets a code (E101…), a title, what happened, and
 * a link to docs/ERRORS.md where that code is explained. The shell panel shows
 * them in its "errors" tab (it blinks red while there are unread ones), and
 * `errors` lists them in the shell.
 *
 * Code families: 1xx vault/files · 2xx network · 3xx voice/sound · 4xx AI ·
 * 5xx modules · 6xx terminal · 7xx settings/config · 9xx anything else.
 */

export interface ErrorCode {
  code: string;
  title: string;
  /** what usually causes it and what to do (the short version; ERRORS.md has more) */
  hint: string;
}

export const ERROR_CODES: ErrorCode[] = [
  { code: "E101", title: "a file couldn't be read", hint: "Moved, renamed or deleted outside the deck? `rescan` reads the vault again." },
  { code: "E102", title: "a note couldn't be saved", hint: "The disk may be full or the folder read-only (iCloud / Dropbox still syncing?). Your text is still in the editor: try ⌘S again." },
  { code: "E103", title: "the vault couldn't be opened", hint: "Check the path in Settings → VAULT, and that the deck may read that folder (macOS asks once)." },
  { code: "E201", title: "the network didn't answer", hint: "Offline, a firewall, or the service is down. Things that need the internet wait and try again later." },
  { code: "E202", title: "blocked by stealth mode", hint: "Stealth mode keeps the deck 100 % local. `stealth off` if you want this to go online." },
  { code: "E301", title: "the voice failed", hint: "`voice` in the shell shows the last problem; `voice install <lang>` gets the natural voice again." },
  { code: "E302", title: "no voice for this language", hint: "Install a system voice for it (Windows: Settings → Time & language → Speech; macOS: Accessibility → Spoken Content)." },
  { code: "E401", title: "the AI didn't answer", hint: "UPLINK off, no key, or the provider is down. Settings → UPLINK (AI) checks the connection." },
  { code: "E501", title: "a module failed", hint: "A module threw an error. `plugin disable <id>` switches it off; tell its author with the details below." },
  { code: "E502", title: "a widget couldn't draw", hint: "The widget has a bug or is missing data. `home rm <widget>` takes it off HOME." },
  { code: "E601", title: "the terminal couldn't start", hint: "Your shell couldn't be launched. `term restart`; Settings → shell picks another one." },
  { code: "E701", title: "a setting couldn't be saved", hint: "The config folder may be read-only. Settings stay in memory until you quit." },
  { code: "E702", title: "no such setting", hint: "This version of the deck has no setting by that name (a typo, or one from another version): nothing was changed. `config list` shows them all." },
  { code: "E901", title: "something went wrong", hint: "An unexpected error. The details below help: open an issue on GitHub with them." },
];

export const ERRORS_DOC = "https://github.com/kiddoko/ICEBREAKER/blob/master/docs/ERRORS.md";

export interface LoggedError {
  code: string;
  title: string;
  detail: string;
  at: number;
}

/** Guess a code from an error message (for errors raised without one). */
export function codeFor(text: string): string {
  const s = text.toLowerCase();
  if (/save failed|couldn't save|cannot write|write failed/.test(s)) return "E102";
  if (/no japanese voice|no voice for|no .* voice on this/.test(s)) return "E302";
  if (/^voice:|neural|piper|sherpa/.test(s)) return "E301";
  if (/stealth/.test(s)) return "E202";
  if (/vault|mount/.test(s) && /fail|cannot|can't|denied/.test(s)) return "E103";
  if (/enoent|not found|no such file|couldn't read|read failed/.test(s)) return "E101";
  if (/fetch|network|offline|timed? ?out|http \d|dns|connection/.test(s)) return "E201";
  if (/\bai\b|uplink|anthropic|claude|openai|api key/.test(s)) return "E401";
  if (/terminal|pty|shell .*start/.test(s)) return "E601";
  if (/widget/.test(s)) return "E502";
  if (/plugin|module/.test(s)) return "E501";
  // a name the deck doesn't know is not a disk problem (it said "the folder may be read-only")
  if (/unknown setting|no default for/.test(s)) return "E702";
  if (/setting|config/.test(s)) return "E701";
  return "E901";
}

export const describe = (code: string): ErrorCode => ERROR_CODES.find((e) => e.code === code) ?? ERROR_CODES[ERROR_CODES.length - 1];

export class ErrorLog {
  readonly list: LoggedError[] = [];
  /** errors nobody has looked at yet (the tab blinks while > 0) */
  unseen = 0;
  /** called after each new error (the deck plays the sound, redraws) */
  onAdd: (e: LoggedError) => void = () => {};

  add(detail: string, code = codeFor(detail)): LoggedError {
    const e = { code, title: describe(code).title, detail, at: Date.now() };
    // the same error again within a few seconds: just once
    const last = this.list[this.list.length - 1];
    if (last && last.detail === detail && e.at - last.at < 4000) return last;
    this.list.push(e);
    if (this.list.length > 200) this.list.shift();
    this.unseen++;
    this.onAdd(e);
    return e;
  }

  clear(): void {
    this.list.length = 0;
    this.unseen = 0;
  }
}
