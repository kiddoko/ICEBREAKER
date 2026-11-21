import { BOLD, type Rect } from "../core/grid";
import { t } from "../core/i18n";
import type { Action, KeyInput } from "../core/input";
import type { Deck } from "../deck";
import { realDeck } from "../shell/origin";
import { dialogButtons } from "../ui/dialog";
import { fitMatrix, matrixSize, matrixText } from "../ui/dots";
import { INSET, SECTION } from "../ui/layout";
import type { UI } from "../ui/ui";
import type { Overlay } from "../workspace/overlays";
import { type Alarm, ALARMS_FILE, byTime, daysText, inText, nextRing, parseDays, readAlarms, SNOOZE_MIN, timeText, writeAlarms } from "./alarms";
import { parseTime } from "../core/dates";
import type { ShellContext } from "../shell/types";
import { fmt } from "../core/ansi";

/**
 * The alarms while the deck runs: they're read from the vault, watched every second,
 * and ring — a sound every 2 s (silent when muted: deck.sound already knows), one
 * notification (Settings → NOTIFICATIONS decides: screen, system, voice), and a
 * screen on top of everything with SNOOZE and STOP (keys, mouse, gamepad).
 * Nothing here goes online, so stealth changes nothing.
 */

/** an alarm due longer ago than this (the computer was asleep) doesn't ring late */
const LATE_MS = 30 * 60_000;
/** nobody answered: it gives up after this */
const RING_MS = 10 * 60_000;

export class AlarmClock {
  alarms: Alarm[] = [];
  /** when each one rings next (epoch ms); a snoozed one, when snooze ends */
  private due = new Map<number, number>();
  private snoozed = new Set<number>();
  /** ringing now, and the ones that came due while it rang */
  ringing: Alarm | null = null;
  private queue: Alarm[] = [];
  private ringStart = 0;
  private overlay: RingScreen | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private unlisten: (() => void) | null = null;
  private loadedFor = "";

  constructor(private readonly deck: Deck) {}

  /** CLOCKS switched on (or the deck started with it on). */
  start(): void {
    if (this.timer) return;
    this.unlisten = this.deck.vault.events.on("rescanned", () => void this.load());
    void this.load();
    this.timer = setInterval(() => this.tick(), 1000);
  }

  /** CLOCKS switched off: nothing rings. */
  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.unlisten?.();
    this.unlisten = null;
    this.finishRinging();
    this.queue = [];
  }

  async load(force = false): Promise<void> {
    const v = this.deck.vault;
    if (!v.root || (!force && this.loadedFor === v.root)) return;
    this.loadedFor = v.root;
    this.alarms = (await v.exists(ALARMS_FILE).catch(() => false)) ? readAlarms(await v.read(ALARMS_FILE).catch(() => "")) : [];
    this.due.clear();
    this.snoozed.clear();
    for (const a of this.alarms) this.schedule(a);
    this.deck.requestFrame();
  }

  private async save(): Promise<void> {
    this.deck.requestFrame();
    if (this.deck.vault.root) await this.deck.vault.write(ALARMS_FILE, writeAlarms(this.alarms));
  }

  private schedule(a: Alarm, from = new Date()): void {
    this.snoozed.delete(a.id);
    const at = nextRing(a, from);
    if (at) this.due.set(a.id, at.getTime());
    else this.due.delete(a.id);
  }

  /** When it rings next (snooze included), or null. */
  nextOf(a: Alarm): Date | null {
    const at = this.due.get(a.id);
    return at ? new Date(at) : null;
  }

  isSnoozed(a: Alarm): boolean {
    return this.snoozed.has(a.id);
  }

  /** the one that rings first */
  soonest(): { alarm: Alarm; at: Date } | null {
    let best: { alarm: Alarm; at: Date } | null = null;
    for (const a of this.alarms) {
      const at = this.nextOf(a);
      if (at && (!best || at < best.at)) best = { alarm: a, at };
    }
    return best;
  }

  /** listed by time of day; `n` in commands is the place in this list (1…) */
  list(): Alarm[] {
    return byTime(this.alarms);
  }

  async add(time: number, label: string, days: number[]): Promise<Alarm> {
    const a: Alarm = { id: Math.max(0, ...this.alarms.map((x) => x.id)) + 1, time, label, days, on: true };
    this.alarms.push(a);
    this.schedule(a);
    await this.save();
    return a;
  }

  async remove(a: Alarm | "all"): Promise<void> {
    this.alarms = a === "all" ? [] : this.alarms.filter((x) => x !== a);
    for (const id of [...this.due.keys()]) if (!this.alarms.some((x) => x.id === id)) this.due.delete(id);
    await this.save();
  }

  async setOn(a: Alarm, on: boolean): Promise<void> {
    a.on = on;
    this.schedule(a);
    await this.save();
  }

  /** The ringing one again in `min` minutes. */
  snooze(min = SNOOZE_MIN): Alarm | null {
    const a = this.ringing;
    if (!a) return null;
    if (a.id < 0) return this.finishRinging(), a; // the test ring
    this.due.set(a.id, Date.now() + min * 60_000);
    this.snoozed.add(a.id);
    this.finishRinging();
    return a;
  }

  /** Stop the ringing one (a one-time alarm switches off; a repeating one waits for its next day). */
  stopRinging(): Alarm | null {
    const a = this.ringing;
    if (!a) return null;
    this.finishRinging();
    if (a.id < 0) return a; // the test ring
    if (!a.days.length) {
      a.on = false;
      void this.save();
    }
    this.schedule(a);
    return a;
  }

  /** a test ring (`clock alarm test`): the screen and the sound, nothing changes */
  test(): void {
    this.ring({ id: -1, time: new Date().getHours() * 60 + new Date().getMinutes(), label: t("test"), days: [], on: true });
  }

  private finishRinging(): void {
    if (this.overlay) this.overlay.done = true;
    this.overlay = null;
    this.ringing = null;
    this.deck.requestFrame();
    const next = this.queue.shift();
    if (next) this.ring(next);
  }

  private tick(): void {
    // logged out (the login page): the last account's alarms don't ring there, with their labels
    if (this.deck.locked) {
      if (this.ringing) this.finishRinging();
      return;
    }
    const now = Date.now();
    if (this.ringing) {
      if (now - this.ringStart >= RING_MS) {
        // nobody there: a repeating one waits for its next day, a one-time one stays on
        const a = this.ringing;
        this.deck.log.add("notify", `${t("alarm")} ${timeText(a.time)} ${a.label} — ${t("nobody stopped it")}`, { source: "warning" });
        this.finishRinging();
        if (a.id >= 0) this.schedule(a);
      } else if (Math.floor((now - this.ringStart) / 1000) % 2 === 0) this.deck.sound.play("alert");
    }
    for (const a of this.alarms) {
      const at = this.due.get(a.id);
      if (at === undefined || now < at) continue;
      this.due.delete(a.id);
      // asleep past it: no late ring, wait for the next one
      if (now - at > LATE_MS) {
        this.schedule(a, new Date(now));
        continue;
      }
      if (this.ringing) this.queue.push(a);
      else this.ring(a);
    }
  }

  private ring(a: Alarm): void {
    this.ringing = a;
    this.ringStart = Date.now();
    this.overlay = new RingScreen(this, a);
    this.deck.workspace.push(this.overlay);
    this.deck.alert(`⏰ ${timeText(a.time)}${a.label ? ` · ${a.label}` : ""}`, t("alarm"), "timers");
    this.deck.requestFrame();
  }
}

const clocks = new WeakMap<Deck, AlarmClock>();
/** The deck's alarm clock (one per deck). */
export function alarmClock(deck: Deck): AlarmClock {
  // keyed on the REAL deck: a line with an origin gets a guarded Proxy of it, and a second
  // clock made for that Proxy never ran — its alarm never rang, and was written away later
  const real = realDeck(deck);
  let c = clocks.get(real);
  if (!c) clocks.set(real, (c = new AlarmClock(real)));
  return c;
}

/**
 * The ringing screen: the time big, the label, SNOOZE (left) and STOP (right, lit).
 * s / z / space snooze · enter / x / esc stop · ← → choose · gamepad: A = the lit one, B = snooze.
 */
class RingScreen implements Overlay {
  modal = true;
  done = false;
  /** true: STOP is lit (what enter / A does) */
  private stopLit = true;

  constructor(
    private readonly clock: AlarmClock,
    private readonly alarm: Alarm,
  ) {}

  private snooze = () => void this.clock.snooze();
  private stop = () => void this.clock.stopRinging();

  onKey(k: KeyInput): boolean {
    if (k.key === "enter") (this.stopLit ? this.stop : this.snooze)();
    else if (k.key === "esc" || k.key === "x") this.stop();
    else if (k.key === "space" || k.key === "s" || k.key === "z") this.snooze();
    else if (k.key === "left") this.stopLit = false;
    else if (k.key === "right") this.stopLit = true;
    else if (k.key === "tab") this.stopLit = !this.stopLit;
    return true;
  }

  onText(s: string): boolean {
    if (/^[szSZ ]$/.test(s)) this.snooze();
    else if (/^[xX]$/.test(s)) this.stop();
    return true;
  }

  onAction(a: Action): boolean {
    if (a === "confirm") (this.stopLit ? this.stop : this.snooze)();
    else if (a === "back") this.snooze();
    else if (a === "left") this.stopLit = false;
    else if (a === "right") this.stopLit = true;
    return true;
  }

  render(ui: UI, screen: Rect): void {
    const c = ui.c;
    ui.animate(250);
    const flash = Math.floor(Date.now() / 500) % 2 === 0;
    ui.tint(screen, c.subtle);
    ui.hit(screen, { onClick: () => {}, onWheel: () => {}, block: true });
    const now = new Date();
    const clock = timeText(now.getHours() * 60 + now.getMinutes());
    const W = Math.min(screen.w - INSET * 4, 64), H = Math.min(screen.h - 2, 16);
    const box: Rect = { x: screen.x + Math.floor((screen.w - W) / 2), y: screen.y + Math.floor((screen.h - H) / 3), w: W, h: H };
    const inner = ui.box(box, { title: `⏰ ${t("ALARM")}`, focused: flash, bg: c.panelAlt });
    // the time, as big as fits above the label and the buttons
    const room = Math.max(0, inner.h - 5);
    const k = fitMatrix(clock, inner.w - INSET * 2, room, 3);
    let y = inner.y + SECTION;
    if (k) {
      const size = matrixSize(clock, k);
      matrixText(ui, inner.x + Math.floor((inner.w - size.w) / 2), y, clock, k, () => (flash ? c.accent : c.warning));
      y += size.h + SECTION;
    } else {
      ui.textCenter(inner, y, clock, { fg: flash ? c.accent : c.warning, attrs: BOLD });
      y += 2;
    }
    if (y < inner.y + inner.h - 2) ui.textCenter(inner, y, this.alarm.label || t("wake up"), { fg: c.fg, attrs: BOLD });
    if (y + 1 < inner.y + inner.h - 2) ui.textCenter(inner, y + 1, daysText(this.alarm.days, t), { fg: c.muted });
    // bottom right: snooze (the way out) left, stop right (ui/dialog.ts)
    const hintX = dialogButtons(ui, inner, [
      { label: `${t("[S]nooze")} ${SNOOZE_MIN} min`, run: this.snooze, selected: !this.stopLit, accent: c.warning },
      { label: t("■ stop  ⏎"), run: this.stop, selected: this.stopLit },
    ]);
    if (hintX - inner.x > 14) ui.text(inner.x + INSET, inner.y + inner.h - 1, t("B snooze · A stop"), { fg: c.muted }, hintX - inner.x - INSET * 2);
  }
}

/* ─────────── clock alarm … (the `clock` command hands these over) ─────────── */

export const ALARM_USAGE =
  "clock alarm                         the alarms, by time\n" +
  "clock alarm <7:30 | 7h30 | 7am> [label] [--days mon-fri | weekend | daily | mon,wed]   a new one (no --days: once)\n" +
  "clock alarm rm <n | all>            remove one (n = its place in the list)\n" +
  "clock alarm on | off <n>            switch one on / off\n" +
  "clock alarm snooze [min] · stop     the one ringing\n" +
  "clock alarm test                    ring now, to hear it\n" +
  "Alarms ring only while ICEBREAKER runs. Set them in ibsh (your real terminal can set one,\n" +
  "nothing else; a module can only list them).\n";

export async function alarmCommand(ctx: ShellContext, args: string[]): Promise<number> {
  const clock = alarmClock(ctx.deck);
  await clock.load();
  const [a, ...rest] = args;
  const pick = (n: string | undefined): Alarm | null => clock.list()[Number(n) - 1] ?? null;
  if (!a || a === "list" || a === "ls") {
    const list = clock.list();
    if (!list.length) return ctx.out(`${t("no alarm")} — clock alarm 7:30 ${t("wake up")} --days mon-fri\n`), 0;
    list.forEach((al, i) => {
      const at = clock.nextOf(al);
      const when = at ? `${clock.isSnoozed(al) ? "zz " : ""}${t("in")} ${inText(at)}` : t("off");
      ctx.out(`${String(i + 1).padStart(2)}  ${al.on ? fmt.green("●") : fmt.dim("○")} ${timeText(al.time)}  ${daysText(al.days, t).padEnd(14)} ${fmt.dim(when.padEnd(12))} ${al.label}\n`);
    });
    return 0;
  }
  if (a === "rm" || a === "remove" || a === "del") {
    const al = rest[0] === "all" ? "all" : pick(rest[0]);
    if (!al) return ctx.err("usage: clock alarm rm <n | all>  (n: its place in clock alarm)\n"), 1;
    await clock.remove(al);
    return ctx.out(al === "all" ? "alarms removed\n" : `alarm ${timeText(al.time)} removed\n`), 0;
  }
  if (a === "on" || a === "off") {
    const al = pick(rest[0]);
    if (!al) return ctx.err(`usage: clock alarm ${a} <n>\n`), 1;
    await clock.setOn(al, a === "on");
    return ctx.out(`alarm ${timeText(al.time)} ${a}\n`), 0;
  }
  if (a === "snooze") {
    const min = rest[0] ? Number(rest[0]) : SNOOZE_MIN;
    if (!(min > 0 && min <= 120)) return ctx.err("usage: clock alarm snooze [1…120 minutes]\n"), 1;
    const al = clock.snooze(min);
    return al ? (ctx.out(`snoozed ${min} min\n`), 0) : (ctx.err("no alarm is ringing\n"), 1);
  }
  if (a === "stop") return clock.stopRinging() ? (ctx.out("alarm stopped\n"), 0) : (ctx.err("no alarm is ringing\n"), 1);
  if (a === "test") return clock.test(), 0;
  // a new one: the time first, then the label; --days anywhere
  // a bare hour is a time here ("clock alarm 7" = 07:00); the rest is core/dates.ts
  const time = /^\d{1,2}$/.test(a) && Number(a) < 24 ? Number(a) * 60 : parseTime(a);
  if (time === null) return ctx.err(`clock alarm: "${a}" isn't a time (7, 7:30, 7h30, 7am) — clock -h\n`), 1;
  let days: number[] = [];
  const words: string[] = [];
  for (let i = 0; i < rest.length; i++) {
    const w = rest[i];
    const m = /^--?d(?:ays)?(?:=(.*))?$/.exec(w);
    if (!m) {
      words.push(w);
      continue;
    }
    const v = m[1] ?? rest[++i] ?? "";
    const parsed = parseDays(v);
    if (!parsed) return ctx.err(`clock alarm: "${v}" isn't days (mon-fri, weekend, daily, mon,wed,fri)\n`), 1;
    days = parsed;
  }
  const al = await clock.add(time, words.join(" "), days);
  const at = clock.nextOf(al);
  ctx.out(`⏰ ${timeText(time)} ${daysText(days, t)}${al.label ? ` · ${al.label}` : ""}${at ? fmt.dim(` — ${t("in")} ${inText(at)}`) : ""}\n`);
  void ctx.deck.stats.add("clocks.alarms", 1, "clocks", { label: "alarms set", kind: "counter" }).catch(() => {});
  return 0;
}
