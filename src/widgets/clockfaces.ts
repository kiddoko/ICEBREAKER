/**
 * Clock faces for the clock widget (`clock style <name>`, `clock seconds on|off`):
 *
 *   dots      dot-matrix digits (the classic)
 *   segment   seven-segment digits drawn with box lines ┏━┓
 *   analog    a round dial in braille dots, with hands
 *   binary    BCD columns ●○ — hours, minutes, (seconds)
 *   minimal   just the time, big and quiet
 */
import { dateLocale } from "../core/i18n";
import { strWidth } from "../core/unicode";
import { bigText } from "../ui/bigtext";
import { setWidgetSetting, widgetConfig, widgetTarget } from "./instances";
import { BOLD, type Rect } from "../core/grid";
import type { Command } from "../shell/types";
import { fitMatrix, matrixSize, matrixText } from "../ui/dots";
import type { UI } from "../ui/ui";
import type { Deck } from "../deck";
import { Braille } from "../ui/braille";
import { ALARM_USAGE, alarmCommand } from "./alarmring";

export const CLOCK_STYLES = ["dots", "segment", "analog", "binary", "minimal"] as const;
export type ClockStyle = (typeof CLOCK_STYLES)[number];

const pad = (n: number) => String(n).padStart(2, "0");

/** the segment face's small size: 2 lines a digit */
const MINI: Record<string, string[]> = {
  "0": ["█▀█", "█▄█"], "1": [" ▀█", "  █"], "2": ["▀▀█", "█▄▄"], "3": ["▀▀█", "▄▄█"], "4": ["█ █", "▀▀█"],
  "5": ["█▀▀", "▄▄█"], "6": ["█▀▀", "█▄█"], "7": ["▀▀█", "  █"], "8": ["█▄█", "█▄█"], "9": ["█▀█", "▀▀█"],
  ":": ["∙", "∙"], " ": [" ", " "],
};

const SEG: Record<string, string[]> = {
  "0": ["┏━┓", "┃ ┃", "┗━┛"],
  "1": ["  ╻", "  ┃", "  ╹"],
  "2": ["╺━┓", "┏━┛", "┗━╸"],
  "3": ["╺━┓", " ━┫", "╺━┛"],
  "4": ["╻ ╻", "┗━┫", "  ╹"],
  "5": ["┏━╸", "┗━┓", "╺━┛"],
  "6": ["┏━╸", "┣━┓", "┗━┛"],
  "7": ["╺━┓", "  ┃", "  ╹"],
  "8": ["┏━┓", "┣━┫", "┗━┛"],
  "9": ["┏━┓", "┗━┫", "╺━┛"],
  ":": [" ", "∶", " "],
  " ": [" ", " ", " "],
};

/** `key`: which copy of the clock widget (each has its own face, widgets/instances.ts) */
export function drawClock(ui: UI, r: Rect, deck: Deck, now = new Date(), key?: string): void {
  const c = ui.c;
  const h = deck.settings.data.home;
  const want = widgetConfig(deck, key, "style", h.clockStyle);
  const style = (CLOCK_STYLES as readonly string[]).includes(want) ? (want as ClockStyle) : "segment";
  const secs = !!widgetConfig(deck, key, "seconds", h.clockSeconds);
  const locale = dateLocale();
  const date = now.toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long" });
  const grad = ui.theme.gradient.length ? ui.theme.gradient : [c.accent, c.accentAlt];
  const hh = pad(now.getHours()), mm = pad(now.getMinutes()), ss = pad(now.getSeconds());
  const blink = now.getSeconds() % 2 === 0 || secs ? ":" : " ";
  const text = secs ? `${hh}:${mm}:${ss}` : `${hh}${blink}${mm}`;
  const showDate = (y: number) => y < r.y + r.h && ui.textCenter(r, y, date, { fg: c.muted });
  ui.animate(secs || style === "analog" ? Math.min(200, 1000 - (Date.now() % 1000)) : Math.min(500, 1000 - (Date.now() % 1000)));

  if (style === "analog" && r.h < 3) {
    // tiny: a quarter-dial glyph that turns with the hour, then the time
    const q = ["◴", "◷", "◶", "◵"][Math.floor(((now.getHours() % 12) / 12) * 4)];
    const line = `${q} ${text.replace(" ", ":")}`;
    ui.textCenter(r, r.y + Math.floor((r.h - 1) / 2), line, { fg: c.accent, attrs: BOLD });
    if (r.h >= 2) showDate(r.y + 1);
    return;
  }

  if (style === "analog") {
    // the dial fills the height; dots are square when a cell is twice as tall as wide
    const rows = r.h - (r.h >= 6 ? 1 : 0);
    const dotAspect = 2 * ui.cellAspect || 1;
    // a dot is dotAspect times as wide as tall: the dial is 2R/dotAspect dots wide
    const R = Math.min(rows * 2, (r.w - 1) * dotAspect) - 1;
    const wCells = Math.min(r.w, Math.ceil((2 * R) / dotAspect / 2) + 2);
    const b = new Braille(wCells, rows);
    const cx = wCells, cy = rows * 2; // centre, in dots
    const px = (ang: number, len: number): [number, number] => [cx + (Math.sin(ang) * len) / dotAspect, cy - Math.cos(ang) * len];
    for (let i = 0; i < 60; i++) {
      const a = (i / 60) * Math.PI * 2;
      const [x, y] = px(a, R);
      b.set(x, y, 0);
      if (i % 5 === 0) {
        const [x2, y2] = px(a, R - (i % 15 === 0 ? 3 : 1.6));
        b.line(x, y, x2, y2, 0);
      }
    }
    const H = (now.getHours() % 12) + now.getMinutes() / 60, M = now.getMinutes() + now.getSeconds() / 60;
    b.line(cx, cy, ...px((H / 12) * Math.PI * 2, R * 0.5), 1);
    b.line(cx, cy, ...px((M / 60) * Math.PI * 2, R * 0.8), 1);
    if (secs) b.line(cx, cy, ...px((now.getSeconds() / 60) * Math.PI * 2, R * 0.9), 2);
    b.draw(ui, r.x + Math.floor((r.w - wCells) / 2), r.y, [c.subtle, c.accent, c.accentAlt]);
    if (r.h >= 6) showDate(r.y + rows);
    return;
  }

  if (style === "binary" && r.h < 5) {
    // small: each digit's 4 bits in one braille cell (top bit at the top), in a row
    const digits = (secs ? `${hh}${mm}${ss}` : `${hh}${mm}`).split("").map(Number);
    const rowMask = [0x01 | 0x08, 0x02 | 0x10, 0x04 | 0x20, 0x40 | 0x80];
    const cells = digits.map((d) => String.fromCodePoint(0x2800 + rowMask.reduce((m, mask, bit) => ((d >> (3 - bit)) & 1 ? m | mask : m), 0)));
    const line = cells.map((ch, i) => (i % 2 === 1 && i < cells.length - 1 ? `${ch} ` : ch)).join("");
    const y = r.y + Math.max(0, Math.floor((r.h - (r.h >= 2 ? 2 : 1)) / 2));
    const x = r.x + Math.floor((r.w - strWidth(line)) / 2);
    [...line].forEach((ch, i) => ui.text(x + i, y, ch, { fg: grad[Math.min(grad.length - 1, Math.floor((i / line.length) * grad.length))], attrs: BOLD }));
    if (r.h >= 2) ui.textCenter(r, y + 1, text.replace(" ", ":"), { fg: c.subtle });
    return;
  }

  if (style === "binary") {
    const cols = secs ? [hh, mm, ss] : [hh, mm];
    const digits = cols.join("").split("").map(Number);
    const colW = 3, gap = 2;
    const w = digits.length * colW + (cols.length - 1) * gap;
    const top = r.y + Math.max(0, Math.floor((r.h - 5 - (r.h >= 7 ? 1 : 0)) / 2));
    let x = r.x + Math.floor((r.w - w) / 2);
    digits.forEach((d, i) => {
      for (let bit = 0; bit < 4; bit++) {
        const on = (d >> (3 - bit)) & 1;
        ui.text(x + 1, top + bit, on ? "●" : "○", { fg: on ? grad[Math.min(grad.length - 1, Math.floor((bit / 4) * grad.length))] : c.faint, attrs: on ? BOLD : 0 });
      }
      ui.text(x + 1, top + 4, String(d), { fg: c.subtle });
      x += colW + (i % 2 === 1 ? gap : 0);
    });
    if (r.h >= 7) showDate(top + 6);
    return;
  }

  if (style === "segment") {
    const chars = text.split("");
    const w = chars.reduce((n, ch) => n + (SEG[ch]?.[0].length ?? 1) + 1, -1);
    if (w <= r.w && r.h >= 3) {
      const top = r.y + Math.max(0, Math.floor((r.h - 3 - (r.h >= 5 ? 2 : 0)) / 2));
      let x = r.x + Math.floor((r.w - w) / 2);
      for (const ch of chars) {
        const g = SEG[ch] ?? SEG[" "];
        g.forEach((row, i) => ui.text(x, top + i, row, { fg: grad[Math.min(grad.length - 1, i)], attrs: BOLD }));
        x += g[0].length + 1;
      }
      if (r.h >= 5) showDate(top + 4);
      return;
    }
    // smaller: the same digits in a 2-line font, then on one line
    const miniW = chars.reduce((n, ch) => n + (MINI[ch]?.[0].length ?? 1) + 1, -1);
    if (miniW <= r.w && r.h >= 2) {
      const top = r.y + Math.max(0, Math.floor((r.h - 2 - (r.h >= 3 ? 1 : 0)) / 2));
      let x = r.x + Math.floor((r.w - miniW) / 2);
      for (const ch of chars) {
        const g = MINI[ch] ?? MINI[" "];
        g.forEach((row, i) => ui.text(x, top + i, row, { fg: grad[Math.min(grad.length - 1, i)], attrs: BOLD }));
        x += g[0].length + 1;
      }
      if (r.h >= 3) showDate(top + 2);
      return;
    }
    ui.textCenter(r, r.y + Math.floor((r.h - 1) / 2), `▐${text.replace(" ", ":")}▌`, { fg: c.accent, attrs: BOLD });
    return;
  }

  if (style === "dots") {
    const extra = r.h >= 4 ? 2 : r.h >= 3 ? 1 : 0;
    const shown = text.replace(" ", ":");
    const k = fitMatrix(shown, r.w - 2, r.h - extra, r.h >= 12 && r.w >= 40 ? 2 : 1);
    if (k) {
      const d = matrixSize(shown, k);
      const top = r.y + Math.max(0, Math.round((r.h - d.h - extra) / 2));
      const x = r.x + Math.floor((r.w - d.w) / 2);
      matrixText(ui, x, top, text, k, (row, rows) => grad[Math.min(grad.length - 1, Math.floor((row / rows) * grad.length))]);
      let y = top + d.h;
      if (extra >= 1) {
        const s = now.getSeconds() + now.getMilliseconds() / 1000;
        const filled = Math.round((s / 60) * d.w);
        ui.text(x, y, "─".repeat(Math.max(0, filled)), { fg: c.accent });
        ui.text(x + filled, y, "─".repeat(Math.max(0, d.w - filled)), { fg: c.faint });
        y++;
      }
      if (extra >= 2) showDate(y);
      return;
    }
    // too small for the dot matrix: the digits in a row, dotted and in the theme's gradient
    const line = [...text.replace(" ", ":")].map((ch) => (ch === ":" ? "∙" : ch)).join(" ");
    const y = r.y + Math.max(0, Math.floor((r.h - (r.h >= 2 ? 2 : 1)) / 2));
    const x = r.x + Math.max(0, Math.floor((r.w - strWidth(line)) / 2));
    [...line].forEach((ch, i) => ui.text(x + i, y, ch, { fg: grad[Math.min(grad.length - 1, Math.floor((i / line.length) * grad.length))], attrs: BOLD }));
    if (r.h >= 2) showDate(y + 1);
    return;
  }

  // minimal, huge: the time in big letters when there's room
  if (style === "minimal") {
    const big = bigText(text.replace(" ", ":"));
    if (big.length && r.h >= big.length + 2 && r.w >= Math.max(...big.map((l) => strWidth(l))) + 2) {
      const top = r.y + Math.floor((r.h - big.length - 1) / 2);
      big.forEach((l, i) => ui.textCenter(r, top + i, l, { fg: grad[Math.min(grad.length - 1, Math.floor((i / big.length) * grad.length))], attrs: BOLD }));
      showDate(top + big.length);
      return;
    }
  }

  // minimal (and the fallback when a face doesn't fit)
  const mid = r.y + Math.max(0, Math.floor((r.h - (r.h >= 3 ? 2 : 1)) / 2));
  ui.textCenter(r, mid, text.replace(" ", ":"), { fg: c.accent, attrs: BOLD });
  if (r.h >= 3) showDate(mid + 1);
}

export const clockCommand: Command = {
  name: "clock",
  summary: "the clock widget's face (dots, segment, analog, binary, minimal), and wake-up alarms",
  usage: "clock                       what it shows now\nclock style <name>          dots · segment · analog · binary · minimal\nclock style next | prev     the next / the one before\nclock seconds on|off        show the seconds\nclock calendar              the mini calendar (a click on the top bar's date)\nclock open                  the CLOCKS page\n" + ALARM_USAGE,
  examples: [
    ["clock style analog", "a round dial"],
    ["clock seconds on", "with the seconds"],
    ["clock alarm 7:30 wake up --days mon-fri", "every weekday at 7:30"],
    ["clock alarm 6h45", "once, the next 6:45"],
    ["clock alarm", "the alarms"],
  ],
  complete: () => ["style", "seconds", "calendar", "alarm", ...CLOCK_STYLES, "on", "off", "next", "prev", "rm", "snooze", "stop", "test", "--days"],
  run(ctx) {
    const d = ctx.deck;
    const h = d.settings.data.home;
    const [sub, v] = ctx.args;
    if (sub === "alarm" || sub === "alarms") return alarmCommand(ctx, ctx.args.slice(1));
    if (sub === "calendar") return ctx.deck.workspace.openMiniCalendar(), 0;
    // `<cmd> open` is the page, everywhere (docs/GUIDELINES.md "Sub-commands")
    if (sub === "open") return void ctx.deck.openApp("clocks"), 0;
    // the copy whose pop-up is open (or that's selected) changes; else every clock without its own face
    const key = widgetTarget("clock") ?? undefined;
    const style = widgetConfig(d, key, "style", h.clockStyle);
    const seconds = widgetConfig(d, key, "seconds", h.clockSeconds);
    if (!sub) return ctx.out(`style ${style} · seconds ${seconds ? "on" : "off"}\n`), 0;
    if (sub === "style") {
      const cur = (CLOCK_STYLES as readonly string[]).indexOf(style);
      const n = CLOCK_STYLES.length;
      const next = v === "next" || !v ? CLOCK_STYLES[(cur + 1) % n] : v === "prev" ? CLOCK_STYLES[(cur - 1 + n) % n] : v;
      if (!(CLOCK_STYLES as readonly string[]).includes(next)) return ctx.err(`clock: styles are ${CLOCK_STYLES.join(", ")}\n`), 1;
      setWidgetSetting(d, "clock", "style", next, "home.clockStyle");
      ctx.out(`clock style ${next}\n`);
      return 0;
    }
    if (sub === "seconds") {
      const on = v === undefined ? !seconds : v === "on" || v === "true" || v === "1";
      setWidgetSetting(d, "clock", "seconds", on, "home.clockSeconds");
      ctx.out(`clock seconds ${on ? "on" : "off"}\n`);
      return 0;
    }
    return ctx.err("usage: clock style <name> | clock seconds on|off | clock alarm …\n"), 1;
  },
};
