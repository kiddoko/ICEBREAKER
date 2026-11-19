import { Glide } from "../ui/glide";
import { mix } from "../core/color";
import { describe, ERRORS_DOC } from "../core/errors";
import { LOG_KINDS, type LogEntry, type LogKind } from "../core/eventlog";
import { BOLD, type Rect } from "../core/grid";
import { t } from "../core/i18n";
import type { Action, KeyInput } from "../core/input";
import { strWidth } from "../core/unicode";
import type { Deck } from "../deck";
import type { UI } from "../ui/ui";

/** One drawn line of the log. */
interface Line {
  text: string;
  fg: number;
  attrs?: number;
  cmd?: string;
  /** the time column (only on an entry's first line) */
  time?: string;
  glyph?: string;
  gfg?: number;
}

/**
 * The shell's LOG tab: everything the deck did (core/eventlog.ts), newest at
 * the bottom, with a row of filters on top — tick what you want to see
 * (nothing ticked = everything):
 *
 *   ❯ commands  ◂ clicks  ⚠ errors  ✉ messages  ⚙ debug          214 · clear
 *   18:06:20 ❯ ls notes
 *   18:06:24 ◂ theme e-ink
 *            theme: e-ink
 *   18:07:02 ⚠ E201  network unreachable
 *
 * Same filters by command: `log show errors debug`, `log show all`.
 */
export class LogPane {
  /** the kinds shown; empty = all */
  readonly show = new Set<LogKind>();
  /** lines up from the bottom (0 = following the newest) */
  private scroll = 0;
  /** the wheel's glide (ui/glide.ts) */
  private readonly glide = new Glide();

  constructor(private readonly deck: Deck) {}

  toggle(k: LogKind): void {
    if (this.show.has(k)) this.show.delete(k);
    else this.show.add(k);
    this.scroll = 0;
  }

  onAction(a: Action): boolean {
    if (a === "up" || a === "scroll-up") this.scroll += 1;
    else if (a === "down" || a === "scroll-down") this.scroll = Math.max(0, this.scroll - 1);
    else return false;
    return true;
  }

  onKey(k: KeyInput): boolean {
    if (k.combo === "pageup") return (this.scroll += 10), true;
    if (k.combo === "pagedown") return (this.scroll = Math.max(0, this.scroll - 10)), true;
    if (k.combo === "end") return (this.scroll = 0), true;
    // 1-5 tick a filter, 0 shows everything
    if (/^[0-5]$/.test(k.key)) {
      const n = Number(k.key);
      if (n === 0) this.show.clear();
      else this.toggle(LOG_KINDS[n - 1].kind);
      return true;
    }
    return false;
  }

  private lines(c: UI["c"], list: LogEntry[]): Line[] {
    const colour: Record<LogKind, number> = { cmd: c.accent, action: c.accentAlt, error: c.error, notify: c.warning, debug: c.subtle };
    const out: Line[] = [];
    for (const e of list) {
      const time = new Date(e.at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
      const glyph = LOG_KINDS.find((k) => k.kind === e.kind)?.glyph ?? "·";
      const head = e.kind === "debug" && e.source && e.source !== "deck" ? `[${e.source}] ${e.text}` : e.text;
      out.push({ time, glyph, gfg: colour[e.kind], text: head, fg: e.kind === "error" || e.failed ? c.error : e.kind === "debug" ? c.muted : c.fg, attrs: e.kind === "error" ? BOLD : 0, cmd: e.code ? `errors ${e.code}` : undefined });
      for (const l of (e.detail ?? "").replace(/\n+$/, "").split("\n")) if (l) out.push({ text: l, fg: c.muted });
      if (e.code) {
        out.push({ text: `→ ${t(describe(e.code).hint)}`, fg: c.subtle });
        out.push({ text: `${ERRORS_DOC}#${e.code.toLowerCase()}`, fg: c.faint });
      }
    }
    return out;
  }

  render(ui: UI, r: Rect): void {
    const c = ui.c;
    const log = this.deck.log;
    log.seen();
    this.deck.errors.unseen = 0;
    // ── the filters: one chip per kind, ticked or not, the count and clear at the right ──
    let x = r.x + 1;
    for (const [i, k] of LOG_KINDS.entries()) {
      const on = this.show.has(k.kind);
      const n = log.list.filter((e) => e.kind === k.kind).length;
      const label = ` ${on ? "■" : "□"} ${k.glyph} ${t(k.label)} `;
      const w = strWidth(label);
      if (x + w > r.x + r.w - 14) break;
      const rect = { x, y: r.y, w, h: 1 };
      const hot = ui.hovered(rect);
      ui.text(x, r.y, label, { fg: on ? c.panel : n ? c.fg : c.subtle, bg: on ? c.accent : hot ? c.highlight : mix(c.panel, c.fg, 0.08), attrs: on ? BOLD : 0 });
      ui.hit(rect, { onClick: () => this.toggle(k.kind), tip: `${n} · ${i + 1}\n${on ? t("click: hide these") : t("click: show only these (several at once)")}` });
      x += w + 1;
    }
    const list = this.show.size ? log.list.filter((e) => this.show.has(e.kind)) : log.list;
    const xr = r.x + r.w - 1;
    const clear = ` ${t("clear")} `;
    const cr = { x: xr - strWidth(clear), y: r.y, w: strWidth(clear), h: 1 };
    ui.text(cr.x, r.y, clear, { fg: ui.hovered(cr) ? c.panel : c.subtle, bg: ui.hovered(cr) ? c.error : undefined });
    ui.hit(cr, { onClick: () => (log.clear(this.show.size ? [...this.show] : undefined), (this.deck.errors.unseen = 0)), tip: t("empty what is shown · log clear") });
    ui.textRight(cr.x - 1, r.y, `${list.length}`, { fg: c.faint });

    // ── the lines, newest at the bottom ──
    const body = { x: r.x, y: r.y + 1, w: r.w, h: r.h - 1 };
    ui.hit(body, { onWheel: (d) => this.glide.push(-d) });
    if (!list.length) {
      ui.text(body.x + 1, body.y, log.list.length ? t("nothing of that kind yet · 0 shows everything") : t("what you type, what clicks run, errors, messages and debug lines appear here"), { fg: c.faint }, body.w - 2);
      return;
    }
    const lines = this.lines(c, list);
    this.scroll = this.glide.follow(ui, Math.min(this.scroll, Math.max(0, lines.length - body.h)), Math.max(0, lines.length - body.h));
    const start = Math.max(0, lines.length - body.h - this.scroll);
    const tx = body.x + 12; // after "hh:mm:ss ❯ "
    lines.slice(start, start + body.h).forEach((l, i) => {
      const y = body.y + i;
      if (l.time) {
        ui.text(body.x + 1, y, l.time, { fg: c.faint });
        ui.text(body.x + 10, y, l.glyph ?? "", { fg: l.gfg ?? c.fg, attrs: BOLD });
      }
      ui.text(tx, y, l.text, { fg: l.fg, attrs: l.attrs }, body.w - (tx - body.x) - 1);
      if (l.cmd) ui.hit({ x: body.x, y, w: body.w, h: 1 }, { cmd: l.cmd, tip: t("what this error means") });
    });
    if (this.scroll > 0) ui.textRight(r.x + r.w - 1, r.y + r.h - 1, ` ↓ ${this.scroll} · end `, { fg: c.panel, bg: c.accent });
  }
}
