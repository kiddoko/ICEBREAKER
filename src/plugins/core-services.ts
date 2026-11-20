/**
 * What the built-in modules expose to every other module (`ib.modules.call`).
 * Each package's functions appear when the package is on and go when it's off.
 * Bundled plugins (todo, calendar, reminders, music…) expose theirs from
 * their own main.ts with `ib.modules.expose`.
 */
import type { Deck } from "../deck";
import { appendLog, ensureEntry } from "../vault/journal";
import { currentWeather } from "../widgets/builtin";
import { focus } from "../widgets/focusstate";
import { currentHeadlines } from "../widgets/news";
import { q } from "../ui/ui";
import type { Caller, ServiceSpec } from "./services";

export function coreServices(deck: Deck): Record<string, Record<string, ServiceSpec>> {
  const locale = () => deck.settings.data.user.locale || undefined;
  // a command line run for a caller: a module's runs as that module, never as you (frame-services.ts)
  const run = (c: Caller | undefined, l: string) => (!l ? 0 : c?.origin ? deck.shell.runUntrusted(l, c.origin) : deck.act(l));
  const line = (doc: string, make: (...a: any[]) => string): ServiceSpec => ({ // eslint-disable-line @typescript-eslint/no-explicit-any
    doc,
    fn: (...a) => run(undefined, make(...a)),
    by: (c: Caller) => (...a) => run(c, make(...a)),
  });
  return {
    journal: {
      today: { doc: "today() → the path of today's entry (created if missing)", needs: "vault:write", fn: () => ensureEntry(deck.vault, new Date(), locale() ?? "") },
      append: { doc: "append(text) → adds a timestamped line to today's entry", needs: "vault:write", fn: (text: string) => appendLog(deck.vault, new Date(), String(text), locale() ?? "") },
    },
    uplink: {
      ready: { doc: "ready() → true when the AI can answer", fn: () => deck.ai.ready },
      ask: { doc: "ask(prompt) → the AI's answer (text)", needs: "ai", fn: (prompt: string) => deck.ai.ask(String(prompt)) },
    },
    sysmon: {
      stats: { doc: "stats() → { cpu, memUsed, memTotal, uptime, host, os… }", fn: () => deck.platform.system.stats() },
    },
    weather: {
      now: { doc: "now() → the last forecast { temp, code, wind, days… } or null", fn: () => currentWeather() },
    },
    news: {
      headlines: { doc: "headlines() → [{ title, source, at, link, summary }]", fn: () => currentHeadlines() },
    },
    clocks: {
      timer: line('timer("5m") → starts a countdown (the clock pop-up shows it)', (spec: string) => `timer ${q(String(spec))}`),
      stopwatch: line('stopwatch("start" | "stop" | "toggle" | "reset")', (a: string) => `stopwatch ${q(String(a))}`),
    },
    focus: {
      status: { doc: "status() → { phase, running, left (ms), work, rest }", fn: () => ({ phase: focus.phase, running: focus.running, left: focus.left, work: focus.work, rest: focus.rest }) },
      start: line("start() → starts the pomodoro", () => (focus.running ? "focus" : "focus toggle")),
      stop: line("stop() → pauses it", () => (focus.running ? "focus toggle" : "")),
    },
    voice: {
      say: { doc: "say(text) → the deck speaks (if the voice is on)", fn: (text: string) => deck.voice.say(String(text)) },
    },
    quotes: {},
    moon: {},
  };
}
