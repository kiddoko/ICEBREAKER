import { BOLD, DIM, type Rect } from "../core/grid";
import type { Action, ActionSource, KeyInput } from "../core/input";
import { fuzzyFilter } from "../core/fuzzy";
import { strWidth, truncate } from "../core/unicode";
import type { PaletteAction } from "../apps/types";
import type { ChoiceOption } from "../plugins/api";
import { hex, mix } from "../core/color";
import { TextEditor } from "../ui/editor";
import { ListView } from "../ui/list";
import type { UI } from "../ui/ui";

/**
 * Things drawn on top of everything: command palette, dialogs, on-screen
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
  ui.tint(screen, ui.c.subtle);
  ui.hit(screen, { onClick: () => onOutside?.(), onWheel: () => {}, block: true });
}

// ── Command palette ────────────────────────────────────────────────────────

export class Palette implements Overlay {
  modal = true;
  done = false;
  private input = new TextEditor("", { singleLine: true, placeholder: "type a command, a note, a theme…" });
  private list = new ListView<PaletteAction>();
  private lastQuery = "\0";

  constructor(private readonly source: () => PaletteAction[]) {
    this.input.onSubmit = () => this.run();
    this.list.onActivate = () => this.run();
  }

  private run(): void {
    const a = this.list.current;
    this.done = true;
    if (a) void Promise.resolve(a.run()).catch((e) => console.error(e));
  }

  onKey(k: KeyInput): boolean {
    if (k.key === "esc") return (this.done = true);
    if (["up", "down", "pageup", "pagedown"].includes(k.key)) {
      this.list.onAction(k.key === "up" ? "up" : k.key === "down" ? "down" : k.key === "pageup" ? "page-up" : "page-down");
      return true;
    }
    if (k.combo === "ctrl+k" || k.combo === "ctrl+p") return (this.done = true);
    this.input.onKey(k);
    return true;
  }

  onText(t: string): boolean {
    this.input.onText(t);
    return true;
  }

  onAction(a: Action): boolean {
    if (a === "back" || a === "palette") this.done = true;
    else if (a === "confirm") this.run();
    else this.list.onAction(a);
    return true;
  }

  render(ui: UI, screen: Rect): void {
    const c = ui.c;
    if (this.input.text !== this.lastQuery) {
      this.lastQuery = this.input.text;
      this.list.items = fuzzyFilter(this.input.text, this.source(), (a) => `${a.group ?? ""} ${a.title}`, 300);
      this.list.select(0);
      this.list.scrollTop = 0;
    }
    backdrop(ui, screen, () => (this.done = true));
    const box = centered(screen, 72, 22, screen.y + Math.max(1, Math.floor(screen.h * 0.12)));
    const inner = ui.box(box, { title: "COMMAND", focused: true, bg: c.panelAlt, info: `${this.list.items.length} results` });
    ui.text(inner.x + 1, inner.y, "❯", { fg: c.accent, attrs: BOLD });
    this.input.render(ui, { x: inner.x + 3, y: inner.y, w: inner.w - 4, h: 1 }, true);
    ui.hline(inner.x, inner.y + 1, inner.w, { fg: c.border });
    const listRect = { x: inner.x, y: inner.y + 2, w: inner.w, h: inner.h - 2 };
    this.list.render(ui, listRect, true, (a, row, selected) => {
      const gx = ui.text(row.x + 1, row.y, a.group ? `${a.group} ` : "", { fg: selected ? c.accentAlt : c.subtle });
      // the hint keeps to the right third and never leaves the box
      const hintW = a.hint ? Math.min(strWidth(a.hint), Math.floor(row.w / 3)) : 0;
      const tx = ui.text(gx, row.y, a.title, { fg: selected ? c.fg : c.muted, attrs: selected ? BOLD : 0 }, row.w - (gx - row.x) - hintW - 3);
      if (a.hint && row.x + row.w - 2 - hintW > tx) ui.textRight(row.x + row.w - 2, row.y, truncate(a.hint, hintW), { fg: c.faint });
    });
    if (this.list.items.length === 0) ui.textCenter(listRect, listRect.y + 1, "no match", { fg: c.subtle });
  }
}

// ── Confirm / prompt dialogs ───────────────────────────────────────────────

export class ConfirmDialog implements Overlay {
  modal = true;
  done = false;
  private choice = true;

  constructor(
    private readonly title: string,
    private readonly detail: string,
    private readonly resolve: (ok: boolean) => void,
  ) {}

  private finish(ok: boolean): void {
    if (this.done) return;
    this.done = true;
    this.resolve(ok);
  }

  onKey(k: KeyInput): boolean {
    if (k.key === "esc" || k.key === "n") this.finish(false);
    else if (k.key === "y") this.finish(true);
    else if (k.key === "enter") this.finish(this.choice);
    else if (k.key === "left" || k.key === "right" || k.key === "tab") this.choice = !this.choice;
    return true;
  }

  onText(t: string): boolean {
    if (/^[yYoO]$/.test(t)) this.finish(true);
    else if (/^[nN]$/.test(t)) this.finish(false);
    return true;
  }

  onAction(a: Action): boolean {
    if (a === "back") this.finish(false);
    else if (a === "confirm") this.finish(this.choice);
    else if (a === "left" || a === "right") this.choice = !this.choice;
    return true;
  }

  render(ui: UI, screen: Rect): void {
    const c = ui.c;
    backdrop(ui, screen);
    const lines = this.detail ? this.detail.split("\n") : [];
    const w = Math.max(44, strWidth(this.title) + 8, ...lines.map((l) => Math.min(90, strWidth(l) + 6)));
    const box = centered(screen, w, lines.length + 6);
    const inner = ui.box(box, { title: "CONFIRM", focused: true, bg: c.panelAlt });
    ui.text(inner.x + 1, inner.y, this.title, { fg: c.fg, attrs: BOLD }, inner.w - 2);
    lines.forEach((l, i) => {
      if (inner.y + 2 + i < inner.y + inner.h - 2) ui.text(inner.x + 1, inner.y + 2 + i, l, { fg: c.muted }, inner.w - 2);
    });
    const by = inner.y + inner.h - 1;
    let x = inner.x + inner.w - 22;
    x += ui.button(x, by, "[Y]es", () => this.finish(true), { selected: this.choice }) + 2;
    ui.button(x, by, "[N]o", () => this.finish(false), { selected: !this.choice, accent: c.error });
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
  private editor: TextEditor;
  private readonly suggestions: string[];
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
    this.suggestions = opts.suggestions ?? [];
    this.editor = new TextEditor(opts.initial ?? "", { singleLine: true, placeholder: opts.placeholder, mask: opts.mask });
    this.editor.setText(opts.initial ?? "", true);
    this.editor.onSubmit = (v) => (this.open && this.pick >= 0 ? this.accept(this.matches()[this.pick]) : this.finish(v));
  }

  /** what fits what's typed: starts-with first, then contains (all of them when empty or the list is open) */
  private matches(): string[] {
    const q = this.editor.text.trim().toLowerCase();
    if (!q) return this.suggestions.slice(0, 50);
    const starts = this.suggestions.filter((s) => s.toLowerCase().startsWith(q) && s.toLowerCase() !== q);
    const has = this.suggestions.filter((s) => !s.toLowerCase().startsWith(q) && s.toLowerCase().includes(q));
    return [...starts, ...has].slice(0, 50);
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
      else ((this.open = true), (this.pick = 0));
    } else if ((k.key === "down" || k.key === "up") && n) {
      if (!this.open) ((this.open = true), (this.pick = 0));
      else this.pick = (this.pick + (k.key === "down" ? 1 : -1) + n) % n;
    } else this.editor.onKey(k);
    return true;
  }

  onText(t: string): boolean {
    if (this.digits) t = t.replace(/[^0-9]/g, "");
    if (!t) return true;
    this.editor.onText(t);
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
    ui.fill({ x: inner.x + 1, y: inner.y + 2, w: fw, h: 1 }, { bg: c.highlight });
    this.editor.render(ui, { x: inner.x + 2, y: inner.y + 2, w: fw - 2, h: 1 }, true);
    if (sugg) {
      // what Tab would complete, in grey after what you typed
      const g = this.ghost();
      const gx = inner.x + 2 + strWidth(this.editor.text);
      if (g && gx < inner.x + fw) ui.text(gx, inner.y + 2, g, { fg: c.faint, bg: c.highlight }, inner.x + fw - gx);
      // ▾ opens the list of suggestions
      const ar = { x: inner.x + 1 + fw + 1, y: inner.y + 2, w: 1, h: 1 };
      ui.text(ar.x, ar.y, this.open ? "▴" : "▾", { fg: ui.hovered(ar) || this.open ? c.accent : c.muted, attrs: BOLD });
      ui.hit({ x: ar.x - 1, y: ar.y, w: 3, h: 1 }, { onClick: () => ((this.open = !this.open), (this.pick = this.open ? 0 : -1)), tip: "↓ · tab completes" });
      list.slice(0, shown).forEach((s, i) => {
        const row = { x: inner.x + 1, y: inner.y + 3 + i, w: fw, h: 1 };
        const on = i === this.pick;
        if (on || ui.hovered(row)) ui.fill(row, { bg: on ? mixBg(c) : c.highlight });
        ui.text(row.x + 1, row.y, s, { fg: on ? c.fg : c.muted, attrs: on ? BOLD : 0 }, row.w - 2);
        ui.hit(row, { onClick: () => this.accept(s) });
      });
    }
    const by = inner.y + 3 + (shown ? shown + 1 : 0);
    let x = inner.x + inner.w - 20;
    x += ui.button(x, by, "ok ⏎", () => this.finish(this.editor.text)) + 2;
    ui.button(x, by, "cancel", () => this.finish(null), { accent: c.subtle });
  }
}

/** Pick one option from a list (type to filter). */
export class ChooseDialog implements Overlay {
  modal = true;
  done = false;
  private input = new TextEditor("", { singleLine: true, placeholder: "type to filter" });
  private list = new ListView<{ o: ChoiceOption; i: number }>();
  private lastQuery = "\0";

  constructor(
    private readonly title: string,
    private readonly options: ChoiceOption[],
    private readonly selected: number,
    private readonly resolve: (i: number | null) => void,
  ) {
    this.input.onSubmit = () => this.finish(this.list.current?.i ?? null);
    this.list.onActivate = () => this.finish(this.list.current?.i ?? null);
  }

  private finish(i: number | null): void {
    if (this.done) return;
    this.done = true;
    this.resolve(i);
  }

  onKey(k: KeyInput): boolean {
    if (k.key === "esc") this.finish(null);
    else if (["up", "down", "pageup", "pagedown"].includes(k.key)) this.list.onAction(k.key === "up" ? "up" : k.key === "down" ? "down" : k.key === "pageup" ? "page-up" : "page-down");
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
    ui.text(inner.x + 1, inner.y + 1, "❯", { fg: c.accent, attrs: BOLD });
    this.input.render(ui, { x: inner.x + 3, y: inner.y + 1, w: inner.w - 4, h: 1 }, true);
    const listRect = { x: inner.x, y: inner.y + 2, w: inner.w, h: inner.h - 2 };
    this.list.render(ui, listRect, true, (x, row, sel) => {
      let lx = row.x + 1;
      if (x.o.color) lx = ui.text(lx, row.y, "● ", { fg: hex(x.o.color) });
      // the label first (never cut for the hint); the hint gets what's left
      const end = ui.text(lx, row.y, x.o.label, { fg: sel ? c.fg : c.muted, attrs: sel ? BOLD : 0 }, row.w - (lx - row.x) - 2);
      const room = row.x + row.w - 2 - end - 3;
      if (x.o.hint && room > 4) {
        const h = truncate(x.o.hint, room);
        ui.textRight(row.x + row.w - 2, row.y, h, { fg: c.faint });
      }
    });
    if (!this.list.items.length) ui.textCenter(listRect, listRect.y, "no match", { fg: c.subtle });
  }
}

// ── Notifications ──────────────────────────────────────────────────────────

export type ToastKind = "info" | "success" | "warning" | "error";

export class Toasts implements Overlay {
  modal = false;
  private items: { text: string; kind: ToastKind; until: number }[] = [];

  push(text: string, kind: ToastKind = "info"): void {
    this.items.push({ text, kind, until: performance.now() + 3500 + text.length * 25 });
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
      ui.text(inner.x + 1, inner.y, `${icon} ${t.text}`, { fg: color }, inner.w - 1);
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

/** the highlighted line of a list inside a dialog */
function mixBg(c: UI["c"]): number {
  return mix(c.panelAlt, c.accent, 0.25);
}
