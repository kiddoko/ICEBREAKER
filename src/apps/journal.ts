import { dateLocale } from "../core/i18n";
import { BOLD, DIM, type Rect } from "../core/grid";
import type { Action, KeyInput } from "../core/input";
import type { Deck } from "../deck";
import type { UI } from "../ui/ui";
import { ensureEntry, streak, titleFor } from "../vault/journal";
import { isoDate } from "../vault/paths";
import type { TextEditor } from "../ui/editor";
import { NoteApp } from "./note";
import type { App, AppSpec } from "./types";
import { INSET } from "../ui/layout";

/**
 * Journal: a month calendar on the left (days with an entry are lit), the
 * day's entry on the right. Arrow keys / d-pad move between days when the
 * calendar has focus; Enter (or A) jumps into the text, Esc (or B) back out.
 */
export class JournalApp implements App {
  readonly kind = "journal";
  readonly key = "journal";
  private day: Date;
  private note: NoteApp | null = null;
  private focus: "calendar" | "editor" = "editor";
  private opening = 0;

  constructor(
    private readonly deck: Deck,
    date: Date = new Date(),
  ) {
    this.day = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    void this.openDay(this.day);
  }

  title(): string {
    return `journal`;
  }

  dirty(): boolean {
    return this.note?.dirty() ?? false;
  }

  status(): string {
    return this.focus === "calendar"
      ? "←↑↓→ pick a day · enter write · [ ] months"
      : `${this.note?.status() ?? ""} · esc → calendar`;
  }

  async openDay(d: Date): Promise<void> {
    const ticket = ++this.opening;
    await this.note?.save();
    this.note?.close();
    this.day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const isPastEmpty = !this.deck.vault.journalDates().has(isoDate(this.day)) && this.day < startOfToday();
    // Past days without an entry are shown empty; the file is only created when you type.
    const path = isPastEmpty ? this.deck.vault.journalPath(this.day) : await ensureEntry(this.deck.vault, this.day, this.deck.settings.data.user.locale);
    if (ticket !== this.opening) return;
    this.note = new NoteApp(this.deck, path, placeCursorInLog);
    this.deck.requestFrame();
  }

  goto(d: Date): void {
    void this.openDay(d);
  }

  async close(): Promise<boolean> {
    return (await this.note?.close()) ?? true;
  }

  private shift(days: number): void {
    const d = new Date(this.day);
    d.setDate(d.getDate() + days);
    void this.openDay(d);
  }

  private shiftMonth(n: number): void {
    const d = new Date(this.day.getFullYear(), this.day.getMonth() + n, 1);
    void this.openDay(d);
  }

  onKey(k: KeyInput): boolean {
    if (k.combo === "alt+left" || k.combo === "ctrl+pageup") return this.shift(-1), true;
    if (k.combo === "alt+right" || k.combo === "ctrl+pagedown") return this.shift(1), true;
    if (this.focus === "editor") {
      if (k.key === "esc" && !this.note?.editor.selection()) {
        this.focus = "calendar";
        return true;
      }
      return this.note?.onKey(k) ?? false;
    }
    if (k.key === "[") return this.shiftMonth(-1), true;
    if (k.key === "]") return this.shiftMonth(1), true;
    if (k.key === "t") return void this.openDay(new Date()), true;
    return false;
  }

  onText(t: string): boolean {
    if (this.focus === "calendar") {
      if (t === "[" || t === "]") return this.shiftMonth(t === "[" ? -1 : 1), true;
      if (t === "t") return void this.openDay(new Date()), true;
      this.focus = "editor";
    }
    return this.note?.onText(t) ?? false;
  }

  onAction(a: Action): boolean {
    if (this.focus === "editor") {
      if (a === "back") {
        this.focus = "calendar";
        return true;
      }
      return this.note?.onAction(a) ?? false;
    }
    switch (a) {
      case "left": this.shift(-1); return true;
      case "right": this.shift(1); return true;
      case "up": this.shift(-7); return true;
      case "down": this.shift(7); return true;
      case "page-up": this.shiftMonth(-1); return true;
      case "page-down": this.shiftMonth(1); return true;
      case "confirm": this.focus = "editor"; return true;
      default: return false;
    }
  }

  render(ui: UI, r: Rect, focused: boolean): void {
    // the calendar needs 24 cells and the page beside it as many: narrower, the page alone
    // (`journal <day>` still opens another day)
    const withCal = r.w >= 48;
    if (!withCal && this.focus === "calendar") this.focus = "editor";
    const calW = withCal ? Math.min(30, Math.max(24, Math.floor(r.w * 0.3))) : 0;
    const body = { x: r.x + calW, y: r.y, w: r.w - calW, h: r.h };
    if (withCal) {
      this.drawCalendar(ui, { x: r.x, y: r.y, w: calW, h: r.h }, focused && this.focus === "calendar");
      ui.vline(body.x, body.y, body.h, { fg: ui.c.faint });
    }
    const title = titleFor(this.day, this.deck.settings.data.user.locale);
    ui.text(body.x + 2, body.y, title, { fg: ui.c.accent, attrs: BOLD }, body.w - 4);
    if (this.note) {
      const area = { x: body.x + 1, y: body.y + 2, w: body.w - 1, h: body.h - 2 };
      this.note.render(ui, area, focused && this.focus === "editor");
      ui.hit(area, {
        onClick: (m) => {
          this.focus = "editor";
          if (this.note) {
            this.note.editor.cursor = this.note.editor.posAt(m.x, m.y);
            this.note.editor.anchor = null;
          }
        },
        onDrag: (m) => {
          if (!this.note) return;
          this.note.editor.anchor ??= { ...this.note.editor.cursor };
          this.note.editor.cursor = this.note.editor.posAt(m.x, m.y);
        },
        onWheel: (d) => this.note?.editor.scroll(d),
      });
    }
  }

  private drawCalendar(ui: UI, r: Rect, focused: boolean): void {
    const c = ui.c;
    const locale = dateLocale();
    const y0 = r.y + 1; // one row of air under the pane title
    const month = new Date(this.day.getFullYear(), this.day.getMonth(), 1);
    const label = month.toLocaleDateString(locale, { month: "long", year: "numeric" });
    const gridX = r.x + Math.max(1, Math.floor((r.w - 21) / 2));
    // registered first so the day cells (registered later) sit on top of it
    ui.hit(r, { onClick: () => (this.focus = "calendar") });

    // ◂ month ▸ — narrower than the calendar's 21 cells: the month shrinks (…) between its arrows
    const head = Math.min(21, r.w - INSET * 2);
    const hx = head < 21 ? r.x + INSET : gridX;
    ui.button(hx, y0, "◂", () => this.shiftMonth(-1));
    ui.textCenter({ x: hx + 3, y: y0, w: Math.max(0, head - 6), h: 1 }, y0, label, { fg: focused ? c.accent : c.fg, attrs: BOLD });
    ui.button(hx + head - 3, y0, "▸", () => this.shiftMonth(1));

    const names = [...Array(7)].map((_, i) => new Date(2024, 0, 1 + i).toLocaleDateString(locale, { weekday: "short" }).slice(0, 2));
    names.forEach((n, i) => ui.text(gridX + i * 3, y0 + 2, n, { fg: i >= 5 ? c.accentAlt : c.subtle }));

    const entries = this.deck.vault.journalDates();
    const today = isoDate(new Date());
    const offset = (month.getDay() + 6) % 7;
    const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    for (let d = 1; d <= days; d++) {
      const cell = offset + d - 1;
      const x = gridX + (cell % 7) * 3;
      const y = y0 + 3 + Math.floor(cell / 7);
      const date = new Date(month.getFullYear(), month.getMonth(), d);
      const iso = isoDate(date);
      const selected = d === this.day.getDate();
      const has = entries.has(iso);
      let style: { fg: number; bg?: number; attrs?: number } = { fg: has ? c.accent : c.muted, attrs: has ? BOLD : 0 };
      if (iso === today) style = { fg: c.accentAlt, attrs: BOLD };
      if (selected) style = { fg: c.panel, bg: focused ? c.accent : c.subtle, attrs: BOLD };
      const rect = { x, y, w: 2, h: 1 };
      if (!selected && ui.hovered(rect)) style.bg = c.highlight;
      ui.text(x, y, String(d).padStart(2), style);
      if (has && !selected) ui.text(x + 2, y, "·", { fg: c.accent, attrs: DIM });
      ui.hit(rect, { cmd: `journal ${iso}` });
    }

    // stats
    const sy = y0 + 10;
    const s = streak(entries);
    const thisMonth = [...entries].filter((e) => e.startsWith(isoDate(month).slice(0, 7))).length;
    const stats: [string, string][] = [
      ["streak", `${s} day${s === 1 ? "" : "s"} ${s >= 7 ? "▲▲" : s ? "▲" : ""}`],
      ["this month", `${thisMonth}/${days}`],
      ["entries", String(entries.size)],
      ["words", String(this.note?.editor.wordCount() ?? 0)],
    ];
    stats.forEach(([k, v], i) => {
      if (sy + i >= r.y + r.h) return;
      ui.text(r.x + 2, sy + i, k, { fg: c.subtle });
      ui.textRight(r.x + r.w - 2, sy + i, v, { fg: c.fg });
    });
    // month activity bar
    if (sy + 5 < r.y + r.h) ui.bar(r.x + 2, sy + 5, r.w - 4, thisMonth / days, c.accent, c.faint);

    const by = sy + 7;
    if (by < r.y + r.h - 1) {
      let x = r.x + 2;
      x += ui.button(x, by, "today", () => {}, { cmd: "journal today", tip: "ctrl+j from anywhere" }) + 1;
      ui.button(x, by, "ask ◆", () => this.deck.openApp("link", { prompt: `Read my journal entries from the last 7 days and give me a short recap: themes, mood, open tasks.` }), { tip: "LINK recaps your last 7 days\nin the shell: journal ls -n 7 | ask \"recap\"" });
    }
    if (focused) ui.text(r.x + 2, r.y + r.h - 1, "←↑↓→ day · [ ] month · enter", { fg: c.subtle });
  }
}

/** Put the cursor at the end of the "## log" section, on a fresh "- " line, ready to type. */
function placeCursorInLog(ed: TextEditor): void {
  const lines = ed.lines;
  const head = lines.findIndex((l) => /^##\s+log\b/i.test(l));
  if (head === -1) {
    ed.cursor = { line: lines.length - 1, col: lines[lines.length - 1].length };
    return;
  }
  let last = head;
  for (let i = head + 1; i < lines.length && !/^#{1,6}\s/.test(lines[i]); i++) if (lines[i].trim()) last = i;
  if (last === head || lines[last].trim() !== "-") {
    // open a new list item right after the last entry, without touching the undo history
    lines.splice(last + 1, 0, "- ");
    if (lines[last + 2]?.trim() && !/^#{1,6}\s/.test(lines[last + 2])) lines.splice(last + 2, 0, "");
    ed.setText(lines.join("\n"));
    ed.cursor = { line: last + 1, col: 2 };
  } else ed.cursor = { line: last, col: lines[last].length };
}

function startOfToday(): Date {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export const journalSpec: AppSpec = {
  kind: "journal",
  title: "Journal",
  description: "daily entries, calendar, streaks",
  icon: "✎",
  launcher: true,
  create: (deck, args) => new JournalApp(deck, args instanceof Date ? args : new Date()),
};
