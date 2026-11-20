import { mix, type RGB } from "../core/color";
import { BOLD, type Rect } from "../core/grid";
import type { KeyInput } from "../core/input";
import { TextEditor } from "./editor";
import type { UI } from "./ui";

/**
 * THE one-line text field — every search box, prompt, password, "add a task"
 * line of the deck and of modules is this (docs/UI_KIT.md). It edits like the
 * notes do (←→ ⌥/ctrl word jumps, home/end, select, ⌘C ⌘X ⌘V, ⌘Z), plus ctrl+U
 * clears it; long text shows its end; a password shows •.
 *
 *   const search = new Field({ icon: "⌕", placeholder: t("search…"), onChange: (q) => filter(q) });
 *   onText(t)  → search.onText(t)          onKey(k) → search.onKey(k) || myKeys(k)
 *   render     → search.render(ui, { x, y, w, h: 1 }, { focused })
 *
 * What it leaves to you: esc, ↑↓ (lists), tab, and enter unless `onSubmit` is set.
 * `keys: "basic"` (a page you search by just typing, whose ←→ move in its list):
 * only typing, ⌫, ⌘V and ctrl+U.
 */
export interface FieldOptions {
  placeholder?: string;
  /** a password: drawn as • */
  mask?: boolean;
  /** one glyph before the text: "⌕" search, "❯" a command / an answer, "+" add */
  icon?: string;
  /** enter: called with the text (without it, enter is yours) */
  onSubmit?: (text: string) => void;
  /** after each change */
  onChange?: (text: string) => void;
  /** the text it starts with */
  initial?: string;
  /** "basic": only typing, ⌫, ctrl+U (←→ home end stay the page's) */
  keys?: "full" | "basic";
}

export interface FieldDraw {
  /** the caret shows (keys go here) */
  focused: boolean;
  /** "you're typing in it" look (a tinted background), for fields you enter with a key (/, a…) */
  active?: boolean;
  /** the background when not active (default: the theme's highlight) */
  bg?: RGB;
  /** what shows when it's empty (default: the one given when made) — translated text goes here */
  placeholder?: string;
}

export class Field {
  readonly editor: TextEditor;

  constructor(private readonly o: FieldOptions = {}) {
    // (the placeholder is drawn here, the same in every field)
    this.editor = new TextEditor(o.initial ?? "", { singleLine: true, mask: o.mask });
    this.editor.setText(o.initial ?? "", true);
    this.editor.onSubmit = (v) => o.onSubmit?.(v);
  }

  get text(): string {
    return this.editor.text;
  }

  set text(v: string) {
    if (v === this.editor.text) return;
    this.editor.setText(v, true);
    this.o.onChange?.(v);
  }

  get empty(): boolean {
    return this.editor.text === "";
  }

  clear(): void {
    this.text = "";
  }

  /** Typed text (a paste on several lines becomes one line). */
  onText(t: string): boolean {
    if (/^[\r\n]+$/.test(t)) return false; // enter: the page's (or onKey's onSubmit)
    const before = this.editor.text;
    this.editor.onText(t.replace(/[\r\n]+/g, " "));
    if (this.editor.text !== before) this.o.onChange?.(this.editor.text);
    return true;
  }

  /** The keys a field uses; false = not for it (esc, ↑↓, tab, enter without onSubmit…). */
  onKey(k: KeyInput): boolean {
    const mod = k.ctrl || k.meta;
    if (mod && k.key === "u") return this.clear(), true;
    // ⌘C / ⌘X with nothing selected aren't the field's (a page may copy something else)
    if (mod && (k.key === "c" || k.key === "x") && !this.editor.selection()) return false;
    if (k.key === "tab" || k.key === "up" || k.key === "down" || k.key === "pageup" || k.key === "pagedown") return false;
    if (k.key === "enter" && !this.o.onSubmit) return false;
    if (this.o.keys === "basic" && k.key !== "backspace" && k.key !== "enter" && !(mod && k.key === "v")) return false;
    const before = this.editor.text;
    const used = this.editor.onKey(k);
    if (this.editor.text !== before) this.o.onChange?.(this.editor.text);
    return used;
  }

  /** Draw it in `r` (one row): background, icon, the text or its placeholder, the caret. */
  render(ui: UI, r: Rect, d: FieldDraw): void {
    const c = ui.c;
    const bg = d.active ? mix(c.accent, c.bg, 0.84) : (d.bg ?? c.highlight);
    ui.fill({ x: r.x, y: r.y, w: r.w, h: 1 }, { bg });
    let x = r.x + 1;
    if (this.o.icon) {
      ui.text(x, r.y, this.o.icon, { fg: c.accent, bg, attrs: BOLD });
      x += 2;
    }
    const w = Math.max(1, r.x + r.w - x);
    const ph = d.placeholder ?? this.o.placeholder;
    if (this.empty && ph) ui.text(x, r.y, ph, { fg: c.muted, bg }, w - 1);
    this.editor.render(ui, { x, y: r.y, w, h: 1 }, d.focused);
  }
}
