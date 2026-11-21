import { pad2 } from "../core/time";
/** The clocks' shared state — no imports, so anything can use it without import cycles. */

/** Timers (several at once, named), the stopwatch and its laps — shared by the clock pop-up, the CLOCKS app and the commands. */
export interface ClockTimer {
  id: number;
  label: string;
  end: number;
  total: number;
}
export const clockState = { timers: [] as ClockTimer[], nextTimer: 1, swStart: 0, swAcc: 0, laps: [] as number[] };
/** the timer that rings next */
export const soonestTimer = (): ClockTimer | undefined => [...clockState.timers].sort((a, b) => a.end - b.end)[0];

export const dur = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(s / 3600);
  return `${h ? `${h}:` : ""}${pad2(Math.floor((s % 3600) / 60))}:${pad2(s % 60)}`;
};
export const swNow = () => clockState.swAcc + (clockState.swStart ? Date.now() - clockState.swStart : 0);

/**
 * A timer's length → ms (0 when it isn't one): "25" (minutes), "90s", "4m", "1h30",
 * "1m30" (1 min 30 s), "1h20m10s". Each number belongs to the unit after it — "15s" is
 * 15 seconds, never 1 min 5 s.
 */
export function parseTimer(a: string): number {
  const s = a.trim().toLowerCase();
  if (/^\d+$/.test(s)) return Number(s) * 60_000;
  const m = /^(?:(\d+)h(?:(\d+)(?!\d*[ms]))?)?(?:(\d+)m(?:in)?(?:(\d+)(?!\d*s))?)?(?:(\d+)s)?$/.exec(s);
  if (!m || !s) return 0;
  const [, h, hm, mi, ms, sec] = m.map((x) => Number(x ?? 0));
  return ((h * 60 + hm + mi) * 60 + ms + sec) * 1000;
}

/** "00:05.3" — with tenths (laps, where a second is too coarse) */
export const durTenths = (ms: number) => `${dur(Math.floor(ms / 1000) * 1000)}.${Math.floor((Math.max(0, ms) % 1000) / 100)}`;
