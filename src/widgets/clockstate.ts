/** The clocks' shared state — no imports, so anything can use it without import cycles. */
const pad2 = (n: number) => String(n).padStart(2, "0");

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
