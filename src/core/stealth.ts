import type { Deck } from "../deck";

/**
 * STEALTH MODE (`privacy.stealth`): 100 % local. Nothing goes to the internet —
 * no cloud AI, weather, news, Google, module installs, voice downloads. Only
 * this machine and your local network are reachable: a local model (Ollama on
 * this computer or a box at home), a vault on your own server.
 *
 * It's enforced in one place, here: every fetch() from the UI and every native
 * call that goes online is checked against the setting.
 */
export const stealth = { on: false };

/** localhost, private ranges (10/8, 172.16/12, 192.168/16, fc00::/7), *.local, *.lan, *.home.arpa */
export function isLocalHost(host: string): boolean {
  const h = host.replace(/^\[|\]$/g, "").toLowerCase();
  if (h === "localhost" || h === "::1" || h.endsWith(".local") || h.endsWith(".lan") || h.endsWith(".home.arpa") || h.endsWith(".localhost")) return true;
  const m = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(h);
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    return a === 127 || a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254);
  }
  return /^f[cd][0-9a-f]{2}:/.test(h) || h.startsWith("fe80:");
}

export function isLocalUrl(url: string): boolean {
  try {
    const u = new URL(url, location.href);
    return u.protocol === "blob:" || u.protocol === "data:" || u.origin === location.origin || isLocalHost(u.hostname);
  } catch {
    return false;
  }
}

export class StealthError extends Error {
  constructor(what: string) {
    super(`stealth mode: ${what} needs the internet (turn it off: config set privacy.stealth false)`);
  }
}

/** Wire the guard into fetch() and the native calls that go online. Call once, at start. */
export function installStealth(deck: Deck): void {
  stealth.on = deck.settings.data.privacy.stealth;
  deck.settings.onChange((path) => {
    if (path.startsWith("privacy")) {
      stealth.on = deck.settings.data.privacy.stealth;
      deck.ai.refresh();
    }
  });

  const realFetch = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (stealth.on && !isLocalUrl(url)) return Promise.reject(new StealthError(new URL(url, location.href).hostname));
    return realFetch(input, init);
  };

  const p = deck.platform;
  const guard = <A extends unknown[], R>(what: string, f: ((...a: A) => Promise<R>) | undefined) =>
    f ? (...a: A): Promise<R> => (stealth.on ? Promise.reject(new StealthError(what)) : f(...a)) : undefined;
  if (p.newsRss) p.newsRss = guard("news", p.newsRss.bind(p));
  if (p.netGet) {
    const get = p.netGet.bind(p);
    p.netGet = (url: string) => (stealth.on && !isLocalUrl(url) ? Promise.reject(new StealthError(new URL(url).hostname)) : get(url));
  }
  if (p.google) {
    const g = p.google;
    g.connect = guard("Google", g.connect.bind(g))!;
    g.calendar = guard("Google Calendar", g.calendar.bind(g))!;
  }
  if (p.voice) p.voice.install = guard("downloading a voice", p.voice.install.bind(p.voice))!;
  if (p.claudeCode) p.claudeCode.run = guard("Claude Code (cloud AI)", p.claudeCode.run.bind(p.claudeCode))!;
}
