import { copyToClipboard, readClipboard } from "../core/clipboard";
import { BOLD, type Rect } from "../core/grid";
import { t } from "../core/i18n";
import type { Action, ActionSource, KeyInput } from "../core/input";
import { padEnd } from "../core/unicode";
import { Field } from "../ui/field";
import type { UI } from "../ui/ui";
import type { Overlay } from "./overlays";
import { dialogButtons, OK } from "../ui/dialog";

/**
 * THE RECOVERY KEY, in a window (`vault encrypt --window`, `vault recovery
 * --window`: what Settings and the setup use; the shell alone prints it as
 * text). The 24 words, a button that copies them all (the clipboard is emptied
 * a minute later if they're still in it), and one word to type back — the
 * window doesn't close without it: that's the proof they're kept somewhere.
 */
export class RecoveryDialog implements Overlay {
  modal = true;
  done = false;
  private readonly list: string[];
  private readonly ask: number;
  private readonly field = new Field({ icon: "❯", onSubmit: (v) => this.check(v) });
  private error = "";
  private copiedAt = 0;
  /** the first click on "copy all" warns; the second (within 8 s) copies */
  private armedAt = -1e9;

  constructor(
    words: string,
    private readonly resolve: () => void,
  ) {
    this.list = words.trim().split(/\s+/);
    this.ask = Math.floor(Math.random() * this.list.length);
  }

  private check(v: string): void {
    const w = v.trim().toLowerCase();
    const want = this.list[this.ask];
    if (w && (w.length >= 4 ? want.startsWith(w) : w === want)) {
      this.done = true;
      this.resolve();
      return;
    }
    this.error = w ? t("that's not word {n} — look again", { n: this.ask + 1 }) : t("type word {n} first: it's the proof you kept them", { n: this.ask + 1 });
    this.field.clear();
  }

  private copy(): void {
    // a clipboard history (or a phone signed in to the same account) may keep them: say so first
    if (performance.now() - this.armedAt > 8000) {
      this.armedAt = performance.now();
      return;
    }
    this.armedAt = -1e9;
    const all = this.list.join(" ");
    copyToClipboard(all);
    this.copiedAt = performance.now();
    // a minute later, if they're still what the clipboard holds, it's emptied
    setTimeout(() => {
      void readClipboard().then((now) => {
        if (now.trim() === all) copyToClipboard(" ");
      });
    }, 60_000);
  }

  onKey(k: KeyInput): boolean {
    if (k.key === "esc") this.error = t("type word {n} first: it's the proof you kept them", { n: this.ask + 1 });
    else if (k.combo === "ctrl+c" || k.combo === "cmd+c") this.copy();
    else this.field.onKey(k);
    return true;
  }

  onText(s: string): boolean {
    this.field.onText(s);
    this.error = "";
    return true;
  }

  onAction(a: Action, source: ActionSource): boolean {
    if (source === "gamepad" && a === "confirm") this.check(this.field.text);
    return true;
  }

  render(ui: UI, screen: Rect): void {
    const c = ui.c;
    ui.tint(screen, c.subtle);
    ui.hit(screen, { onClick: () => {}, onWheel: () => {}, block: true });
    const w = Math.min(78, screen.w - 4), h = 19;
    const box = { x: screen.x + Math.floor((screen.w - w) / 2), y: screen.y + Math.max(1, Math.floor((screen.h - h) / 3)), w, h };
    const inner = ui.box(box, { title: t("RECOVERY KEY"), focused: true, bg: c.panelAlt });
    let y = inner.y;
    ui.text(inner.x + 1, y, t("Write these 24 words down, in order. Shown only now."), { fg: c.fg, attrs: BOLD }, inner.w - 2);
    y += 1;
    ui.text(inner.x + 1, y, t("They open your vault if you forget your password. ICEBREAKER keeps no copy."), { fg: c.muted }, inner.w - 2);
    y += 1;
    ui.text(inner.x + 1, y, t("whoever has them can open your vault: keep them safe"), { fg: c.faint }, inner.w - 2);
    y += 2;
    // 4 columns of 6, numbered top to bottom
    const colW = Math.floor((inner.w - 2) / 4);
    for (let i = 0; i < this.list.length; i++) {
      const col = Math.floor(i / 6), row = i % 6;
      const x = inner.x + 1 + col * colW;
      ui.text(x, y + row, String(i + 1).padStart(2), { fg: c.faint });
      ui.text(x + 3, y + row, padEnd(this.list[i], colW - 4), { fg: c.accent, attrs: BOLD }, colW - 4);
    }
    y += 7;
    const copied = performance.now() - this.copiedAt < 60_000;
    const armed = performance.now() - this.armedAt < 8000;
    if (copied || armed) ui.animate(500);
    const cx = inner.x + 1;
    const bw = ui.button(cx, y, copied ? t("copied · emptied in a minute") : armed ? t("copy anyway") : t("copy all"), () => this.copy(), { tip: "ctrl+C", accent: armed ? c.warning : undefined });
    if (armed) ui.text(cx + bw + 2, y, t("a clipboard history app (or your phone) may keep them"), { fg: c.warning }, inner.w - bw - 4);
    y += 2;
    ui.text(inner.x + 1, y, t("Type word {n} to close:", { n: this.ask + 1 }), { fg: c.fg, attrs: BOLD }, inner.w - 2);
    y += 1;
    this.field.render(ui, { x: inner.x + 1, y, w: inner.w - 2, h: 1 }, { focused: true, placeholder: t("from your paper (or where you saved them)") });
    if (this.error) ui.text(inner.x + 1, y + 1, `⚠ ${this.error}`, { fg: c.error }, inner.w - 2);
    // bottom right, like every dialog (ui/dialog.ts)
    dialogButtons(ui, inner, [{ label: OK(), run: () => this.check(this.field.text), selected: true }]);
  }
}
