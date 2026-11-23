import { t } from "../core/i18n";
import { BOLD, DIM, type Rect } from "../core/grid";
import { Field } from "../ui/field";
import type { Action, ActionSource, KeyInput } from "../core/input";
import { fuzzyFilter } from "../core/fuzzy";
import { strWidth, truncate, wrapWords } from "../core/unicode";
import { GAP } from "../ui/layout";
import type { ChoiceOption } from "../plugins/api";
import { hex } from "../core/color";
import { TextEditor } from "../ui/editor";
import { ListView } from "../ui/list";
import { typed } from "../ui/typewriter";
import { CANCEL, dialogButtons, NO, OK, YES } from "../ui/dialog";
import type { UI } from "../ui/ui";

/**
 * Things drawn on top of everything: THE MENU, dialogs, on-screen
 * keyboard, notifications. Modal overlays take all input; the others only
 * what they use.
 */
export interface Overlay {
  modal: boolean;
  render(ui: UI, screen: Rect): void;
  onKey?(k: KeyInput): boolean;
  onText?(t: string): boolean;
  onAction?(a: Action, source: ActionSource): boolean;
  /** Set to true to be removed. */
  done?: boolean;
}

function centered(screen: Rect, w: number, h: number, top?: number): Rect {
  const W = Math.min(w, screen.w - 4);
  const H = Math.min(h, screen.h - 2);
  return { x: screen.x + Math.floor((screen.w - W) / 2), y: top ?? screen.y + Math.floor((screen.h - H) / 3), w: W, h: H };
}

/** Swallow clicks outside a modal (and optionally close it). */
function backdrop(ui: UI, screen: Rect, onOutside?: () => void): void {
  ui.dim(screen, ui.c.subtle);
  ui.hit(screen, { onClick: () => onOutside?.(), onWheel: () => {}, block: true });
}

// ── Confirm / prompt dialogs ───────────────────────────────────────────────

let typewriterIds = 0;

/** A message instead of a question: one "ok" button (wrong password, where the backup went…). */
export interface MessageOptions {
  /** the frame's title (default MESSAGE) */
  frame?: string;
  tone?: "info" | "error" | "success";
}

export class ConfirmDialog implements Overlay {
  modal = true;
  done = false;
  private choice = true;
  /** its text's name for the typewriter */
  private readonly tw = `confirm:${++typewriterIds}`;

  constructor(
    private readonly title: string,
    private readonly detail: string,
    private readonly resolve: (ok: boolean) => void,
    /** set: a message (one ok button), not a question */
    private readonly message?: MessageOptions,
    /** the answer enter gives when nothing was chosen (a question whose safe answer is no: false) */
    preselected = true,
  ) {
    this.choice = preselected;
  }

  private finish(ok: boolean): void {
    if (this.done) return;
    this.done = true;
    this.resolve(ok);
  }

  onKey(k: KeyInput): boolean {
    if (this.message) {
      if (k.key === "enter" || k.key === "esc" || k.key === "space") this.finish(true);
      return true;
    }
    if (k.key === "esc" || k.key === "n") this.finish(false);
    else if (k.key === "y") this.finish(true);
    else if (k.key === "enter") this.finish(this.choice);
    // No is on the left, Yes on the right (ui/dialog.ts): the arrows point at them
    else if (k.key === "left") this.choice = false;
    else if (k.key === "right") this.choice = true;
    else if (k.key === "tab") this.choice = !this.choice;
    return true;
  }

  onText(t: string): boolean {
    if (this.message) return true;
    if (/^[yYoO]$/.test(t)) this.finish(true);
    else if (/^[nN]$/.test(t)) this.finish(false);
    return true;
  }

  onAction(a: Action): boolean {
    if (this.message) {
      if (a === "back" || a === "confirm") this.finish(true);
      return true;
    }
    if (a === "back") this.finish(false);
    else if (a === "confirm") this.finish(this.choice);
    else if (a === "left") this.choice = false;
    else if (a === "right") this.choice = true;
    return true;
  }

  render(ui: UI, screen: Rect): void {
    const c = ui.c;
    backdrop(ui, screen);
    const raw = this.detail ? this.detail.split("\n") : [];
    const want = Math.max(44, strWidth(this.title) + 8, ...raw.map((l) => Math.min(90, strWidth(l) + 6)));
    // long lines wrap (they were cut with …: a module's permissions read "8 to …", "vau…")
    const w = Math.min(want, screen.w - GAP * 2);
    const lines = raw.flatMap((l) => (l ? wrapWords(l, Math.max(10, w - 4)) : [""]));
    const box = centered(screen, w, lines.length + 6);
    const tone = this.message?.tone === "error" ? c.error : this.message?.tone === "success" ? c.success : undefined;
    const inner = ui.box(box, { title: this.message ? t(this.message.frame ?? "MESSAGE") : "CONFIRM", focused: true, bg: c.panelAlt });
    // the question types itself out (ui/typewriter.ts), then the details
    const all = [this.title, ...lines].join("\n");
    let left = typed(ui, this.tw, all);
    const shown = (s: string) => {
      const chars = [...s];
      const part = chars.slice(0, Math.max(0, left)).join("");
      left -= chars.length + 1;
      return part;
    };
    ui.text(inner.x + 1, inner.y, shown(this.title), { fg: tone ?? c.fg, attrs: BOLD }, inner.w - 2);
    lines.forEach((l, i) => {
      const part = shown(l);
      if (inner.y + 2 + i < inner.y + inner.h - 2) ui.text(inner.x + 1, inner.y + 2 + i, part, { fg: c.muted }, inner.w - 2);
    });
    // bottom right, the way out on the left, Yes always in the same place (ui/dialog.ts)
    if (this.message) return void dialogButtons(ui, inner, [{ label: OK(), run: () => this.finish(true), selected: true, accent: tone }]);
    dialogButtons(ui, inner, [
      { label: NO(), run: () => this.finish(false), selected: !this.choice, accent: c.error },
      { label: YES(), run: () => this.finish(true), selected: this.choice },
    ]);
  }
}

export interface PromptOptions {
  initial?: string;
  placeholder?: string;
  mask?: boolean;
  suggestions?: string[];
  /** accept digits only */
  digits?: boolean;
}

export class PromptDialog implements Overlay {
  modal = true;
  done = false;
  /** THE field (ui/field.ts); its editor for the completion */
  private readonly field: Field;
  private get editor(): TextEditor {
    return this.field.editor;
  }
  private readonly suggestions: string[];
  /** the text it opened with */
  private readonly initial: string;
  /** the ▾ list (ui/list.ts) */
  private readonly drop = new ListView<string>();
  /** the ▾ list is open; `pick` = the highlighted suggestion */
  private open = false;
  private pick = -1;
  /** only digits get through (a number for a slider: no letters, no surprises) */
  private readonly digits: boolean;

  constructor(
    private readonly title: string,
    opts: PromptOptions,
    private readonly resolve: (value: string | null) => void,
  ) {
    this.digits = !!opts.digits;
    this.drop.clickActivates = () => true;
    this.drop.onActivate = (s) => this.accept(s);
    this.suggestions = opts.suggestions ?? [];
    this.initial = opts.initial ?? "";
    this.field = new Field({ initial: opts.initial, placeholder: opts.placeholder, mask: opts.mask, onSubmit: (v) => (this.open && this.pick >= 0 ? this.accept(this.matches()[this.pick]) : this.finish(v)) });
  }

  /**
   * What the ▾ list shows (every prompt with suggestions: one place, so it's fixed once):
   *  - nothing typed: every choice;
   *  - the text is still the value it opened with and it is one of the choices (Settings →
   *    "Date format" = fr-FR): every choice, that one picked — you came to change it;
   *  - else what fits the text: the same, then starts-with, then contains.
   * (it used to leave the text itself out: a field opened on a choice showed an empty list)
   */
  private matches(): string[] {
    const q = this.editor.text.trim().toLowerCase();
    if (!q) return this.suggestions.slice(0, 50);
    const same = this.suggestions.filter((s) => s.toLowerCase() === q);
    if (same.length && this.editor.text === this.initial) return this.suggestions.slice(0, 50);
    const starts = this.suggestions.filter((s) => s.toLowerCase().startsWith(q) && s.toLowerCase() !== q);
    const has = this.suggestions.filter((s) => !s.toLowerCase().startsWith(q) && s.toLowerCase().includes(q));
    return [...same, ...starts, ...has].slice(0, 50);
  }

  /** open the ▾ list on the choice the text is (else the first) */
  private openList(): void {
    this.open = true;
    const q = this.editor.text.trim().toLowerCase();
    this.pick = Math.max(0, this.matches().findIndex((s) => s.toLowerCase() === q));
  }

  /** the grey completion after the cursor: Tab takes it */
  private ghost(): string {
    const q = this.editor.text;
    if (!q || this.editor.cursor.col < q.length) return "";
    const m = this.suggestions.find((s) => s.toLowerCase().startsWith(q.toLowerCase()) && s.length > q.length);
    return m ? m.slice(q.length) : "";
  }

  private accept(s: string | undefined): void {
    if (s === undefined) return;
    this.editor.setText(s, true);
    this.open = false;
    this.pick = -1;
  }

  private finish(v: string | null): void {
    if (this.done) return;
    this.done = true;
    this.resolve(v);
  }

  onKey(k: KeyInput): boolean {
    const n = this.suggestions.length ? this.matches().length : 0;
    if (k.key === "esc") {
      if (this.open) this.open = false;
      else this.finish(null);
    } else if (k.combo === "tab" && n) {
      const g = this.ghost();
      if (this.open && this.pick >= 0) this.accept(this.matches()[this.pick]);
      else if (g) this.editor.setText(this.editor.text + g, true);
      else this.openList();
    } else if ((k.key === "down" || k.key === "up") && n) {
      if (!this.open) this.openList();
      else this.pick = (this.pick + (k.key === "down" ? 1 : -1) + n) % n;
    } else this.field.onKey(k);
    return true;
  }

  onText(t: string): boolean {
    if (this.digits) t = t.replace(/[^0-9]/g, "");
    if (!t) return true;
    this.field.onText(t);
    if (this.suggestions.length) this.pick = this.open ? 0 : -1;
    return true;
  }

  onAction(a: Action, source: ActionSource): boolean {
    if (source !== "gamepad") return true;
    if (a === "back") this.finish(null);
    else if (a === "confirm") this.finish(this.editor.text);
    return true;
  }

  render(ui: UI, screen: Rect): void {
    const c = ui.c;
    backdrop(ui, screen);
    const sugg = this.suggestions.length > 0;
    const list = sugg && this.open ? this.matches() : [];
    const shown = Math.min(8, list.length);
    const box = centered(screen, 64, 6 + (shown ? shown + 1 : 0));
    const inner = ui.box(box, { title: "INPUT", focused: true, bg: c.panelAlt });
    ui.text(inner.x + 1, inner.y, this.title, { fg: c.fg, attrs: BOLD }, inner.w - 2);
    const fw = inner.w - 2 - (sugg ? 3 : 0);
    this.field.render(ui, { x: inner.x + 1, y: inner.y + 2, w: fw, h: 1 }, { focused: true });
    if (sugg) {
      // what Tab would complete, in grey after what you typed
      const g = this.ghost();
      const gx = inner.x + 2 + strWidth(this.editor.text);
      if (g && gx < inner.x + fw) ui.text(gx, inner.y + 2, g, { fg: c.faint, bg: c.highlight }, inner.x + fw - gx);
      // ▾ opens the list of suggestions
      const ar = { x: inner.x + 1 + fw + 1, y: inner.y + 2, w: 1, h: 1 };
      ui.text(ar.x, ar.y, this.open ? "▴" : "▾", { fg: ui.hovered(ar) || this.open ? c.accent : c.muted, attrs: BOLD });
      ui.hit({ x: ar.x - 1, y: ar.y, w: 3, h: 1 }, { onClick: () => (this.open ? ((this.open = false), (this.pick = -1)) : this.openList()), tip: "↓ · tab completes" });
      // the suggestions: THE list of the kit (ui/list.ts) — a click takes one
      if (shown) {
        this.drop.items = list;
        if (this.pick >= 0 && this.drop.selected !== this.pick) this.drop.select(this.pick);
        this.drop.render(ui, { x: inner.x + 1, y: inner.y + 3, w: fw, h: shown }, true, (s, row, on) => void ui.text(row.x + 1, row.y, s, { fg: on ? c.fg : c.muted, attrs: on ? BOLD : 0 }, row.w - 2));
      }
    }
    dialogButtons(ui, inner, [
      { label: CANCEL(), run: () => this.finish(null), accent: c.subtle },
      { label: OK(), run: () => this.finish(this.editor.text), selected: true },
    ], inner.y + 3 + (shown ? shown + 1 : 0));
  }
}

/** Pick one option from a list (type to filter). */
export class ChooseDialog implements Overlay {
  modal = true;
  done = false;
  private readonly input = new Field({ icon: "❯", onSubmit: () => this.finish(this.list.current?.i ?? null) });
  private list = new ListView<{ o: ChoiceOption; i: number }>();
  private lastQuery = "\0";

  constructor(
    private readonly title: string,
    private readonly options: ChoiceOption[],
    private readonly selected: number,
    private readonly resolve: (i: number | null) => void,
  ) {
    this.list.onActivate = () => this.finish(this.list.current?.i ?? null);
  }

  private finish(i: number | null): void {
    if (this.done) return;
    this.done = true;
    this.resolve(i);
  }

  onKey(k: KeyInput): boolean {
    if (k.key === "esc") this.finish(null);
    else if (this.list.onNavKey(k)) return true;
    else this.input.onKey(k);
    return true;
  }

  onText(t: string): boolean {
    this.input.onText(t);
    return true;
  }

  onAction(a: Action): boolean {
    if (a === "back") this.finish(null);
    else if (a === "confirm") this.finish(this.list.current?.i ?? null);
    else this.list.onAction(a);
    return true;
  }

  render(ui: UI, screen: Rect): void {
    const c = ui.c;
    if (this.input.text !== this.lastQuery) {
      const first = this.lastQuery === "\0";
      this.lastQuery = this.input.text;
      const all = this.options.map((o, i) => ({ o, i }));
      this.list.items = this.input.text ? fuzzyFilter(this.input.text, all, (x) => `${x.o.label} ${x.o.hint ?? ""}`, 200) : all;
      this.list.select(first ? Math.max(0, Math.min(this.selected, all.length - 1)) : 0);
      if (!first) this.list.scrollTop = 0;
    }
    backdrop(ui, screen, () => this.finish(null));
    const w = Math.max(48, strWidth(this.title) + 8, ...this.options.map((o) => strWidth(o.label) + strWidth(o.hint ?? "") + 10));
    const box = centered(screen, Math.min(80, w), Math.min(this.options.length, 14) + 5);
    const inner = ui.box(box, { title: "CHOOSE", focused: true, bg: c.panelAlt, info: `${this.list.items.length}` });
    ui.text(inner.x + 1, inner.y, this.title, { fg: c.fg, attrs: BOLD }, inner.w - 2);
    this.input.render(ui, { x: inner.x, y: inner.y + 1, w: inner.w, h: 1 }, { focused: true, placeholder: t("type to filter") });
    const listRect = { x: inner.x, y: inner.y + 2, w: inner.w, h: inner.h - 2 };
    this.list.render(ui, listRect, true, (x, row, sel) => {
      let lx = row.x + 1;
      if (x.o.color) lx = ui.text(lx, row.y, "● ", { fg: hex(x.o.color) });
      // the label first (never cut for the hint); the hint gets what's left
      const end = ui.text(lx, row.y, x.o.label, { fg: sel ? c.fg : c.muted, attrs: sel ? BOLD : 0 }, row.w - (lx - row.x) - 2);
      const room = row.x + row.w - 2 - end - 3;
      if (x.o.hint && room > 4) {
        const h = truncate(x.o.hint, room);
        ui.textRight(row.x + row.w - 2, row.y, h, { fg: c.subtle });
      }
    });
    if (!this.list.items.length) ui.textCenter(listRect, listRect.y, "no match", { fg: c.subtle });
  }
}

// ── Notifications ──────────────────────────────────────────────────────────

export type ToastKind = "info" | "success" | "warning" | "error";

export class Toasts implements Overlay {
  modal = false;
  private items: { text: string; kind: ToastKind; until: number; id: string }[] = [];

  /** how many are shown */
  get count(): number {
    return this.items.length;
  }

  push(text: string, kind: ToastKind = "info"): void {
    // the same message still on screen: it stays longer, not twice (a double click gave two)
    const same = this.items.find((t) => t.text === text && t.kind === kind && t.until > performance.now());
    if (same) return void (same.until = performance.now() + 3500 + text.length * 25);
    this.items.push({ text, kind, until: performance.now() + 3500 + text.length * 25, id: `toast:${++typewriterIds}` });
    if (this.items.length > 4) this.items.shift();
  }

  render(ui: UI, screen: Rect): void {
    const now = performance.now();
    this.items = this.items.filter((t) => t.until > now);
    let y = screen.y + 1;
    for (const t of this.items) {
      const color = { info: ui.c.info, success: ui.c.success, warning: ui.c.warning, error: ui.c.error }[t.kind];
      const icon = { info: "ℹ", success: "✓", warning: "▲", error: "✖" }[t.kind];
      const w = Math.min(screen.w - 4, strWidth(t.text) + 6);
      const r = { x: screen.x + screen.w - w - 2, y, w, h: 3 };
      const inner = ui.box(r, { bg: ui.c.panelAlt, border: "round" });
      ui.vline(r.x, r.y, 3, { fg: color }, "▌");
      // it types itself out, with its blips (ui/typewriter.ts)
      const n = typed(ui, t.id, t.text);
      ui.text(inner.x + 1, inner.y, `${icon} ${[...t.text].slice(0, n).join("")}`, { fg: color }, inner.w - 1);
      ui.hit(r, { onClick: () => (t.until = 0) });
      y += 3;
    }
    if (this.items.length) ui.animate(250);
  }
}

// ── On-screen keyboard (gamepad / mouse-only typing) ───────────────────────

const OSK_ROWS = [
  ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "-", "="],
  ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p", "[", "]"],
  ["a", "s", "d", "f", "g", "h", "j", "k", "l", ";", "'", "⏎"],
  ["⇧", "z", "x", "c", "v", "b", "n", "m", ",", ".", "/", "⌫"],
  ["é", "è", "à", "ç", "ê", "␣", "#", "@", "←", "→", "?", "✕"],
];
const SHIFTED: Record<string, string> = { "1": "!", "2": '"', "3": "£", "4": "$", "5": "%", "6": "^", "7": "&", "8": "*", "9": "(", "0": ")", "-": "_", "=": "+", "[": "{", "]": "}", ";": ":", "'": "~", ",": "<", ".": ">", "/": "\\", "é": "É", "è": "È", "à": "À", "ç": "Ç", "ê": "Ê" };

export class Osk implements Overlay {
  modal = false;
  done = false;
  private row = 1;
  private col = 0;
  private shift = false;

  constructor(
    private readonly sendText: (t: string) => void,
    private readonly sendKey: (key: string) => void,
  ) {}

  private press(label: string): void {
    switch (label) {
      case "⏎": return this.sendKey("enter");
      case "⌫": return this.sendKey("backspace");
      case "⇧": this.shift = !this.shift; return;
      case "␣": return this.sendText(" ");
      case "←": return this.sendKey("left");
      case "→": return this.sendKey("right");
      case "✕": this.done = true; return;
      default: {
        const ch = this.shift ? (SHIFTED[label] ?? label.toUpperCase()) : label;
        this.sendText(ch);
        if (this.shift && /[a-z]/.test(label)) this.shift = false;
      }
    }
  }

  onAction(a: Action, source: ActionSource): boolean {
    if (source !== "gamepad") return false;
    switch (a) {
      case "up": this.row = (this.row + OSK_ROWS.length - 1) % OSK_ROWS.length; return true;
      case "down": this.row = (this.row + 1) % OSK_ROWS.length; return true;
      case "left": this.col = (this.col + 11) % 12; return true;
      case "right": this.col = (this.col + 1) % 12; return true;
      case "confirm": this.press(OSK_ROWS[this.row][this.col]); return true;
      case "back": this.sendKey("backspace"); return true;
      case "palette": this.sendText(" "); return true; // Y = space
      case "menu": this.sendKey("enter"); return true;
      case "tab-prev": this.sendKey("left"); return true;
      case "tab-next": this.sendKey("right"); return true;
      case "osk": this.done = true; return true;
      default: return false;
    }
  }

  render(ui: UI, screen: Rect): void {
    const c = ui.c;
    const keyW = 5;
    const w = 12 * keyW + 4;
    const h = OSK_ROWS.length + 3;
    const r = { x: screen.x + Math.floor((screen.w - w) / 2), y: screen.y + screen.h - h - 1, w, h };
    const inner = ui.box(r, { title: "KEYBOARD", focused: true, bg: c.panelAlt, info: "A type · B ⌫ · Y ␣ · X close" });
    OSK_ROWS.forEach((keys, ri) => {
      keys.forEach((k, ci) => {
        const label = this.shift ? (SHIFTED[k] ?? (k.length === 1 ? k.toUpperCase() : k)) : k;
        const kr = { x: inner.x + 1 + ci * keyW, y: inner.y + ri, w: keyW - 1, h: 1 };
        const sel = ri === this.row && ci === this.col;
        const hot = sel || ui.hovered(kr);
        const isMod = k === "⇧" && this.shift;
        ui.fill(kr, { bg: hot ? c.accent : isMod ? c.selection : c.highlight });
        ui.textCenter(kr, kr.y, label, { fg: hot ? c.panel : c.fg, attrs: hot ? BOLD : 0 });
        ui.hit(kr, {
          onClick: () => {
            this.row = ri;
            this.col = ci;
            this.press(k);
          },
        });
      });
    });
    ui.text(inner.x + 1, inner.y + inner.h - 1, "typing into the focused pane", { fg: c.subtle, attrs: DIM });
  }
}
