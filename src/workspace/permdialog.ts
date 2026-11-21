import { BOLD, type Rect } from "../core/grid";
import { t } from "../core/i18n";
import type { Action, KeyInput } from "../core/input";
import { strWidth, truncate, wrapWords } from "../core/unicode";
import type { Level } from "../plugins/permissions";
import { dialogButtons } from "../ui/dialog";
import { GAP, INSET, SECTION } from "../ui/layout";
import type { UI } from "../ui/ui";
import type { Overlay } from "./overlays";

/**
 * THE PERMISSION DIALOG (docs/PERMISSIONS.md) — one look for every question about what a
 * module may do: switching it on, a high-risk permission used for the first time, a command
 * for your real terminal, an update that asks for more.
 *
 *   ╭─ ◆ SWITCH A MODULE ON ─────────────────────────────────────────╮
 *   │ BreakerMED (beta) · v0.10.1 · by icebreaker                    │
 *   │ ✔ verified in the official STORE                               │
 *   │                                                                │
 *   │ This module asks for:                                          │
 *   │  ♪ Play sound                                          low     │
 *   │  ✎ Change your notes → songs/                          HIGH    │
 *   │     asked again the first time it writes                       │
 *   │                                                                │
 *   │ Without asking, it can: …                                      │
 *   │                                    [N]o      [Y]es, switch on  │
 *   ╰────────────────────────────────────────────────────────────────╯
 *
 * The way out is always the first button (esc gives it); the one lit is what enter does.
 */
export interface PermLine {
  icon: string;
  label: string;
  /** a folder, a host */
  scope?: string;
  level: Level;
  /** a line under it, dimmer ("asked again the first time it writes") */
  note?: string;
  /** new since what you approved (an update): marked */
  fresh?: boolean;
}

export interface PermButton {
  label: string;
  value: string;
  /** a letter that answers it ("y") — the letter its label shows in brackets comes first (translations) */
  key?: string;
  tone?: "error" | "warning";
}

export interface PermDialogSpec {
  /** the frame's title */
  frame: string;
  /** who: "BreakerMED (beta) · v0.10.1 · by icebreaker" */
  heading: string;
  /** short facts under it ("✔ verified…"); a line starting with ⚠ is in the warning colour */
  facts?: string[];
  /** above the list: "This module asks for:" */
  intro?: string;
  lines?: PermLine[];
  /** a command, shown as it will be typed (the real terminal) */
  command?: string;
  /** paragraphs under the list */
  body?: string[];
  /** in reading order: the way out first */
  buttons: PermButton[];
  /** which one enter gives (its place in `buttons`) */
  selected: number;
}

const LEVEL_WORD: Record<Level, string> = { low: "low", medium: "medium", high: "HIGH", total: "TOTAL" };

export class PermissionDialog implements Overlay {
  modal = true;
  done = false;
  private sel: number;

  constructor(
    private readonly spec: PermDialogSpec,
    private readonly resolve: (value: string) => void,
  ) {
    this.sel = Math.max(0, Math.min(spec.buttons.length - 1, spec.selected));
  }

  private finish(i: number): void {
    if (this.done) return;
    this.done = true;
    this.resolve(this.spec.buttons[i]?.value ?? this.spec.buttons[0].value);
  }

  /** the letter that answers a button: the one its label shows in brackets ("[T]oujours" → t), in any language */
  private letter(b: PermButton): string | undefined {
    return (/\[(\p{L})\]/u.exec(b.label)?.[1] ?? b.key)?.toLowerCase();
  }

  private byKey(s: string): boolean {
    const k = s.toLowerCase();
    const shown = this.spec.buttons.map((b) => this.letter(b));
    let i = shown.indexOf(k);
    // the English letter too, when no button shows it for something else ("y" where the label says "[O]ui")
    if (i < 0) i = this.spec.buttons.findIndex((b) => b.key === k);
    if (i < 0) return false;
    this.finish(i);
    return true;
  }

  onKey(k: KeyInput): boolean {
    const n = this.spec.buttons.length;
    if (k.key === "esc") this.finish(0);
    else if (k.key === "enter") this.finish(this.sel);
    else if (k.key === "left") this.sel = Math.max(0, this.sel - 1);
    else if (k.key === "right") this.sel = Math.min(n - 1, this.sel + 1);
    else if (k.key === "tab") this.sel = (this.sel + (k.shift ? n - 1 : 1)) % n;
    else if (k.key.length === 1 && !k.ctrl && !k.meta) this.byKey(k.key);
    return true;
  }

  onText(s: string): boolean {
    this.byKey(s);
    return true;
  }

  onAction(a: Action): boolean {
    const n = this.spec.buttons.length;
    if (a === "back") this.finish(0);
    else if (a === "confirm") this.finish(this.sel);
    else if (a === "left") this.sel = Math.max(0, this.sel - 1);
    else if (a === "right") this.sel = Math.min(n - 1, this.sel + 1);
    return true;
  }

  render(ui: UI, screen: Rect): void {
    const c = ui.c;
    const s = this.spec;
    ui.dim(screen, c.subtle);
    ui.hit(screen, { onClick: () => {}, onWheel: () => {}, block: true });
    const W = Math.max(30, Math.min(72, screen.w - GAP * 2));
    const textW = W - 2 - INSET * 2;
    const levelW = 7;
    const colour: Record<Level, number> = { low: c.muted, medium: c.fg, high: c.warning, total: c.error };

    // what goes in the frame, line by line (wrapped to its width)
    type Row = (y: number, x: number) => void;
    const rows: Row[] = [];
    const blank = () => rows.push(() => {});
    const para = (text: string, fg: number, attrs = 0) => {
      for (const l of text ? wrapWords(text, textW) : [""]) rows.push((y, x) => void ui.text(x, y, l, { fg, bg: c.panelAlt, attrs }, textW));
    };
    para(s.heading, c.fg, BOLD);
    for (const f of s.facts ?? []) para(f, f.startsWith("⚠") ? c.warning : f.startsWith("✔") || f.startsWith("✓") ? c.success : c.muted);
    if (s.command !== undefined) {
      blank();
      for (const l of wrapWords(s.command, textW - GAP * 2).slice(0, 6)) rows.push((y, x) => {
        ui.fill({ x, y, w: textW, h: 1 }, { bg: c.highlight });
        ui.text(x + GAP, y, l, { fg: c.fg, bg: c.highlight, attrs: BOLD }, textW - GAP * 2);
      });
    }
    if (s.lines?.length) {
      blank();
      if (s.intro) para(s.intro, c.muted);
      for (const p of s.lines) {
        const fg = colour[p.level];
        const name = `${p.icon} ${p.label}${p.scope ? ` → ${p.scope}` : ""}${p.fresh ? `  ${t("(new)")}` : ""}`;
        const lw = Math.max(4, textW - GAP - levelW - GAP);
        const wrapped = wrapWords(name, lw);
        wrapped.forEach((l, i) =>
          rows.push((y, x) => {
            ui.text(x + GAP, y, l, { fg: p.level === "low" ? c.fg : fg, bg: c.panelAlt, attrs: p.level === "high" || p.level === "total" || p.fresh ? BOLD : 0 }, lw);
            if (i === 0) ui.textRight(x + textW, y, t(LEVEL_WORD[p.level]), { fg, bg: c.panelAlt, attrs: p.level === "total" ? BOLD : 0 });
          }),
        );
        if (p.note) for (const l of wrapWords(p.note, lw - GAP)) rows.push((y, x) => void ui.text(x + GAP * 2 + 1, y, l, { fg: c.subtle, bg: c.panelAlt }, lw - GAP));
      }
    }
    for (const b of s.body ?? []) {
      blank();
      para(b, c.muted);
    }

    const room = Math.max(3, screen.h - 2 - 2 - SECTION - 1);
    const shown = rows.slice(0, room);
    const H = shown.length + 2 + SECTION + 1;
    const box: Rect = { x: screen.x + Math.floor((screen.w - W) / 2), y: screen.y + Math.max(1, Math.floor((screen.h - H) / 3)), w: W, h: Math.min(H, screen.h - 2) };
    const inner = ui.box(box, { title: truncate(s.frame, W - 8), focused: true, bg: c.panelAlt });
    ui.hit(box, { onClick: () => {}, block: true });
    shown.forEach((draw, i) => draw(inner.y + i, inner.x + INSET));
    if (rows.length > shown.length) ui.textRight(inner.x + inner.w - INSET, inner.y + shown.length - 1, "…", { fg: c.subtle, bg: c.panelAlt });
    dialogButtons(
      ui,
      inner,
      s.buttons.map((b, i) => ({ label: b.label, run: () => this.finish(i), selected: i === this.sel, accent: b.tone === "error" ? c.error : b.tone === "warning" ? c.warning : undefined })),
    );
    // esc is always the way out
    const first = s.buttons[0];
    const hintW = inner.w - INSET * 2 - s.buttons.reduce((n, b) => n + strWidth(b.label) + 2 + GAP, 0);
    if (first && hintW > 12) ui.text(inner.x + INSET, inner.y + inner.h - 1, t("esc: {a}", { a: first.label.replace(/[[\]]/g, "") }), { fg: c.subtle, bg: c.panelAlt }, hintW);
  }
}
