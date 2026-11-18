/**
 * What the built-in modules expose to every other module (`ib.modules.call`).
 * Each package's functions appear when the package is on and go when it's off.
 * Bundled plugins (todo, calendar, reminders, music…) expose theirs from
 * their own main.ts with `ib.modules.expose`.
 */
import type { Deck } from "../deck";
import { appendLog, ensureEntry } from "../vault/journal";
import { currentWeather } from "../widgets/builtin";
import { focus } from "../widgets/extra";
import { currentHeadlines } from "../widgets/news";
import type { ServiceSpec } from "./services";

export function coreServices(deck: Deck): Record<string, Record<string, ServiceSpec>> {
  const locale = () => deck.settings.data.user.locale || undefined;
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
      timer: { doc: 'timer("5m") → starts a countdown (the clock pop-up shows it)', fn: (spec: string) => deck.act(`timer ${spec}`) },
      stopwatch: { doc: 'stopwatch("start" | "stop" | "toggle" | "reset")', fn: (a: string) => deck.act(`stopwatch ${a}`) },
    },
    focus: {
      status: { doc: "status() → { phase, running, left (ms), work, rest }", fn: () => ({ phase: focus.phase, running: focus.running, left: focus.left, work: focus.work, rest: focus.rest }) },
      start: { doc: "start() → starts the pomodoro", fn: () => deck.act(focus.running ? "focus" : "focus toggle") },
      stop: { doc: "stop() → pauses it", fn: () => (focus.running ? deck.act("focus toggle") : undefined) },
    },
    voice: {
      say: { doc: "say(text) → the deck speaks (if the voice is on)", fn: (text: string) => deck.voice.say(String(text)) },
    },
    quotes: {},
    moon: {},
  };
}
