import { mmss } from "../core/time";
/**
 * FOCUS — the module's own app: a big ring that empties as the minutes go,
 * what you're working on, presets (25/5, 50/10, 90/20), today's sessions, and
 * zen (z): the tree and the shell fold away while you work.
 *
 *   space start / pause · r reset · s skip · e what you're on · 1 2 3 presets · z zen
 */
import { mix } from "../core/color";
import { BOLD, type Rect } from "../core/grid";
import { t } from "../core/i18n";
import type { Action, KeyInput } from "../core/input";
import { dayKey } from "../core/stats";
import type { Deck } from "../deck";
import { fitMatrix, matrixSize, matrixText } from "../ui/dots";
import type { UI } from "../ui/ui";
import { focus, tickFocus } from "../widgets/focusstate";
import type { App, AppSpec } from "./types";

const PRESETS: [number, number][] = [[25, 5], [50, 10], [90, 20]];

class FocusApp implements App {
  readonly kind = "focus";
  readonly key = "focus";
  private zen: { sidebar: boolean; shell: boolean } | null = null;
  constructor(private readonly deck: Deck) {}
  title() {
    return "focus";
  }
  status() {
    return t("space start / pause · r reset · s skip · e what you're on · 1 2 3 presets · z zen");
  }
  private async task(): Promise<void> {
    const v = await this.deck.prompt(t("What are you focusing on?"), { initial: focus.task, placeholder: t("chapter 3 · the bug in the parser · taxes") });
    if (v !== null) void this.deck.act(`focus task ${v.trim()}`);
  }
  /** zen: fold the tree and the shell away (again: back as they were) */
  private toggleZen(): void {
    const ws = this.deck.workspace;
    if (this.zen) {
      if (this.zen.sidebar !== ws.sidebarVisible) ws.toggleSidebar();
      ws.shellVisible = this.zen.shell;
      this.zen = null;
    } else {
      this.zen = { sidebar: ws.sidebarVisible, shell: ws.shellVisible };
      if (ws.sidebarVisible) ws.toggleSidebar();
      ws.shellVisible = false;
      ws.focus = "main";
    }
  }
  close(): boolean {
    if (this.zen) this.toggleZen();
    return true;
  }
  onText(s: string): boolean {
    const act = (c: string) => void this.deck.act(c);
    if (s === " ") return act("focus toggle"), true;
    if (s === "r") return act("focus reset"), true;
    if (s === "s") return act("focus skip"), true;
    if (s === "e") return void this.task(), true;
    if (s === "z") return this.toggleZen(), true;
    const p = PRESETS[Number(s) - 1];
    if (p) return act(`focus set ${p[0]} ${p[1]}`), true;
    return false;
  }
  onKey(k: KeyInput): boolean {
    void k;
    return false;
  }
  onAction(a: Action): boolean {
    if (a === "confirm") return this.onText(" ");
    return false;
  }

  render(ui: UI, r: Rect, focused: boolean): void {
    const c = ui.c;
    void focused;
    tickFocus(this.deck);
    ui.animate(focus.running ? 200 : 1000);
    const col = focus.phase === "focus" ? c.accent : c.success;
    const total = (focus.phase === "focus" ? focus.work : focus.rest) * 60_000;
    const done = 1 - Math.max(0, focus.left) / total;

    // too small for the ring (a tiny window, a huge interface scale): just the time
    if (r.w < 14 || r.h < 8) {
      const secs = Math.ceil(Math.max(0, focus.left) / 1000);
      const time = `${String(Math.floor(secs / 60)).padStart(2, "0")}:${String(secs % 60).padStart(2, "0")}`;
      ui.textCenter(r, r.y + Math.floor((r.h - 1) / 2), `${focus.running ? "▶" : "❚❚"} ${time}`, { fg: col, attrs: BOLD });
      return;
    }
    // the ring: braille dots around, lit for the time left
    const rows = Math.max(6, Math.min(r.h - 12, 18));
    const asp = 2 * ui.cellAspect || 1;
    const R = Math.min(rows * 2, (r.w - 4) * asp) - 1;
    const wc = Math.min(r.w, Math.ceil((2 * R) / asp / 2) + 2);
    const ox = r.x + Math.floor((r.w - wc) / 2), oy = r.y + 1;
    const bits = new Uint8Array(wc * rows), lit = new Uint8Array(wc * rows);
    const set = (px: number, py: number, on: boolean) => {
      const x = Math.round(px), y = Math.round(py);
      if (x < 0 || y < 0 || x >= wc * 2 || y >= rows * 4) return;
      const i = (y >> 2) * wc + (x >> 1);
      const sy = y & 3, sx = x & 1;
      bits[i] |= 1 << (sy < 3 ? (sx ? 3 : 0) + sy : sx ? 7 : 6);
      if (on) lit[i] = 1;
    };
    const steps = 240;
    for (let k = 0; k < steps; k++) {
      const a = (k / steps) * Math.PI * 2;
      const on = k / steps >= done;
      for (const rr of [R, R - 1.2]) set(wc + (Math.sin(a) * rr) / asp, rows * 2 - Math.cos(a) * rr, on);
    }
    const pulse = focus.running ? (Math.sin(ui.now / 400) + 1) / 2 : 0;
    for (let i = 0; i < bits.length; i++)
      if (bits[i]) ui.text(ox + (i % wc), oy + Math.floor(i / wc), String.fromCodePoint(0x2800 + bits[i]), { fg: lit[i] ? mix(col, 0xffffff, pulse * 0.25) : c.faint });

    // inside the ring: the time, the phase, the task
    const time = mmss(focus.left);
    const midY = oy + Math.floor(rows / 2) - 2;
    const k = fitMatrix(time, Math.floor(wc * 0.6), 4, 1);
    if (k) {
      const sz = matrixSize(time, k);
      matrixText(ui, r.x + Math.floor((r.w - sz.w) / 2), midY, time, k, () => col);
    } else ui.textCenter(r, midY + 1, time, { fg: col, attrs: BOLD });
    ui.textCenter(r, midY + 3, `${focus.running ? "▶" : "❚❚"} ${t(focus.phase)}`, { fg: col, attrs: BOLD });
    if (focus.task) ui.textCenter(r, midY + 4, focus.task, { fg: c.fg });

    // the buttons
    let y = oy + rows + 1;
    const btns: [string, string, string][] = [
      [focus.running ? t("❚❚ pause") : t("▶ start"), "focus toggle", "space"],
      [t("↺ reset"), "focus reset", "r"],
      [t("» skip"), "focus skip", "s"],
    ];
    const labels = [...btns.map((b) => b[0]), t("✎ what I'm on"), this.zen ? t("◉ zen on") : t("○ zen"), ...PRESETS.map(([w, b]) => `${w}/${b}`)];
    let x = r.x + Math.floor((r.w - labels.reduce((n, l) => n + l.length + 3, 0)) / 2);
    for (const [label, cmd, tip] of btns) x += ui.button(x, y, label, () => {}, { cmd, tip }) + 1;
    x += ui.button(x, y, t("✎ what I'm on"), () => void this.task(), { tip: "e · focus task <what>" }) + 1;
    x += ui.button(x, y, this.zen ? t("◉ zen on") : t("○ zen"), () => this.toggleZen(), { selected: !!this.zen, tip: "z: the tree and the shell fold away" }) + 2;
    PRESETS.forEach(([w, b], i) => (x += ui.button(x, y, `${w}/${b}`, () => {}, { cmd: `focus set ${w} ${b}`, selected: focus.work === w && focus.rest === b, tip: String(i + 1) }) + 1));

    // today
    y += 2;
    const st = this.deck.stats.peek("focus.minutes");
    const sess = this.deck.stats.peek("focus.sessions");
    const today = dayKey();
    ui.textCenter(r, y++, t("today: {n} sessions · {m} min of focus", { n: sess?.days[today] ?? 0, m: st?.days[today] ?? 0 }), { fg: c.subtle });
    const log = focus.log.filter((l) => new Date(l.at).toDateString() === new Date().toDateString());
    for (const l of log.slice(-Math.max(0, r.y + r.h - y - 1)).reverse()) {
      const at = new Date(l.at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
      ui.textCenter(r, y++, `${at} · ${l.min} min${l.task ? ` · ${l.task}` : ""}`, { fg: c.muted });
    }
  }
}

export const focusSpec: AppSpec = {
  kind: "focus",
  title: "Focus",
  description: "a pomodoro with a ring, what you're on, today's sessions, zen",
  icon: "◎",
  launcher: true,
  create: (deck) => new FocusApp(deck),
};
