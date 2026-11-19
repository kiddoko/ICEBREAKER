/** The pomodoro's state and clock — kept free of widget imports so apps can use it without import cycles. */
import type { Deck } from "../deck";

/** the pomodoro, shared by the widget, its pop-up and the `focus` command */
export const focus = { phase: "focus" as "focus" | "break", left: 25 * 60_000, running: false, last: 0, flashUntil: 0, work: 25, rest: 5,
  /** what you're focusing on (focus task …) */
  task: "",
  /** the sessions finished today: when and on what */
  log: [] as { at: number; task: string; min: number }[] };

let focusWatch: ReturnType<typeof setInterval> | null = null;
/**
 * Advance the pomodoro; switch phase (with a notification and the stats)
 * when time is up. Called by the widget, the FOCUS app and a 1 s watcher
 * while it runs, so it rings even when nothing shows it.
 */
export function tickFocus(deck: Deck): void {
  const now = Date.now();
  if (focus.running) {
    focus.left -= now - focus.last;
    focus.last = now;
    if (focus.left <= 0) {
      if (focus.phase === "focus") {
        void deck.stats.add("focus.sessions", 1, "focus", { label: "focus sessions", kind: "counter" }).catch(() => {});
        void deck.stats.add("focus.minutes", focus.work, "focus", { label: "minutes of focus", kind: "counter", unit: "min" }).catch(() => {});
        focus.log = [...focus.log.filter((l) => new Date(l.at).toDateString() === new Date().toDateString()), { at: now, task: focus.task, min: focus.work }];
      }
      focus.phase = focus.phase === "focus" ? "break" : "focus";
      focus.left = (focus.phase === "focus" ? focus.work : focus.rest) * 60_000;
      focus.flashUntil = performance.now() + 3000;
      deck.alert(focus.phase === "break" ? "◎ focus done — take a break" : "◎ break over — jack back in", focus.task, "timers");
    }
  }
  if (focus.running && !focusWatch) focusWatch = setInterval(() => tickFocus(deck), 1000);
  if (!focus.running && focusWatch) (clearInterval(focusWatch), (focusWatch = null));
}

