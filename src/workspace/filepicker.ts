/**
 * The deck's own file picker: the whole computer, read-only, in the deck's
 * look. ↑↓ choose · enter open a folder / pick the file · ← or backspace the
 * folder above · type to filter · ~ home · esc cancel.
 */
import { mix } from "../core/color";
import { BOLD, type Rect } from "../core/grid";
import type { Action, KeyInput } from "../core/input";
import type { Deck } from "../deck";
import type { UI } from "../ui/ui";
import type { Overlay } from "./overlays";

type Entry = { name: string; path: string; isDir: boolean; size: number };

export class FilePicker implements Overlay {
  modal = true;
  done = false;
  private dir = "";
  private entries: Entry[] = [];
  private sel = 0;
  private scroll = 0;
  private filter = "";
  private error = "";

  constructor(
    private readonly deck: Deck,
    private readonly title: string,
    private readonly resolve: (path: string | null) => void,
    /** highlighted extensions (".sh", ".py"…); every file can still be picked */
    private readonly exts: string[] = [],
    start?: string,
  ) {
    void (async () => this.open(start ?? (await deck.platform.files!.home())))();
  }

  private async open(dir: string): Promise<void> {
    try {
      this.entries = await this.deck.platform.files!.list(dir);
      this.dir = dir;
      this.sel = this.scroll = 0;
      this.filter = "";
      this.error = "";
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
    }
    this.deck.requestFrame();
  }
  private up(): void {
    const sep = this.dir.includes("\\") ? "\\" : "/";
    const parts = this.dir.split(sep).filter(Boolean);
    if (!parts.length) return;
    parts.pop();
    void this.open(sep === "/" ? `/${parts.join("/")}` : parts.join("\\") + (parts.length === 1 ? "\\" : ""));
  }
  private shown(): Entry[] {
    const q = this.filter.toLowerCase();
    return q ? this.entries.filter((e) => e.name.toLowerCase().includes(q)) : this.entries;
  }
  private pick(e: Entry | undefined): void {
    if (!e) return;
    if (e.isDir) return void this.open(e.path);
    this.done = true;
    this.resolve(e.path);
  }
  private cancel(): void {
    this.done = true;
    this.resolve(null);
  }

  onKey(k: KeyInput): boolean {
    if (k.combo === "esc") return this.filter ? ((this.filter = ""), true) : (this.cancel(), true);
    if (k.combo === "backspace") return this.filter ? ((this.filter = this.filter.slice(0, -1)), true) : (this.up(), true);
    if (k.combo === "left") return this.up(), true;
    if (k.combo === "right") {
      const e = this.shown()[this.sel];
      if (e?.isDir) void this.open(e.path);
      return true;
    }
    return false;
  }
  onText(t: string): boolean {
    if (t === "~" && !this.filter) return void this.deck.platform.files!.home().then((h) => this.open(h)), true;
    if (t === "\n") return this.pick(this.shown()[this.sel]), true;
    this.filter += t;
    this.sel = 0;
    return true;
  }
  onAction(a: Action): boolean {
    const n = this.shown().length;
    if (a === "up") this.sel = n ? (this.sel - 1 + n) % n : 0;
    else if (a === "down") this.sel = n ? (this.sel + 1) % n : 0;
    else if (a === "page-down") this.sel = Math.min(n - 1, this.sel + 10);
    else if (a === "page-up") this.sel = Math.max(0, this.sel - 10);
    else if (a === "confirm") this.pick(this.shown()[this.sel]);
    else if (a === "back") this.cancel();
    return true;
  }

  render(ui: UI, screen: Rect): void {
    const c = ui.c;
    ui.hit(screen, { onClick: () => {}, onWheel: (d) => (this.sel = Math.max(0, Math.min(this.shown().length - 1, this.sel + d))), block: true });
    const w = Math.min(screen.w - 6, 90), h = Math.min(screen.h - 4, 28);
    const r = { x: screen.x + Math.floor((screen.w - w) / 2), y: screen.y + Math.floor((screen.h - h) / 2), w, h };
    const inner = ui.box(r, { title: this.title, focused: true, bg: c.panelAlt, info: "← up · ~ home · type to filter · esc" });
    // where we are, and the filter
    ui.text(inner.x + 1, inner.y, "⌂", { fg: c.accent, bg: c.panelAlt });
    ui.text(inner.x + 3, inner.y, this.dir || "…", { fg: c.fg, attrs: BOLD, bg: c.panelAlt }, inner.w - 20);
    if (this.filter) ui.textRight(inner.x + inner.w - 1, inner.y, `⌕ ${this.filter}`, { fg: c.accent, bg: c.panelAlt });
    ui.hline(inner.x, inner.y + 1, inner.w, { fg: c.faint, bg: c.panelAlt }, "┄");
    if (this.error) ui.text(inner.x + 1, inner.y + 2, `⚠ ${this.error}`, { fg: c.error, bg: c.panelAlt }, inner.w - 2);
    const list = this.shown();
    const room = inner.h - 3;
    this.sel = Math.min(this.sel, Math.max(0, list.length - 1));
    if (this.sel < this.scroll) this.scroll = this.sel;
    if (this.sel >= this.scroll + room) this.scroll = this.sel - room + 1;
    // the folder above
    const upRow = { x: inner.x, y: inner.y + 2, w: inner.w, h: 1 };
    ui.text(inner.x + 1, upRow.y, "▴ ..", { fg: ui.hovered(upRow) ? c.accent : c.subtle, bg: c.panelAlt });
    ui.hit(upRow, { onClick: () => this.up(), tip: "the folder above (←)" });
    list.slice(this.scroll, this.scroll + room - 1).forEach((e, k) => {
      const i = this.scroll + k;
      const y = inner.y + 3 + k;
      const row = { x: inner.x, y, w: inner.w, h: 1 };
      const sel = i === this.sel;
      const bg = sel ? mix(c.accent, c.panelAlt, 0.75) : ui.hovered(row) ? c.highlight : c.panelAlt;
      ui.fill(row, { bg });
      const wanted = !e.isDir && this.exts.some((x) => e.name.toLowerCase().endsWith(x));
      ui.text(inner.x + 1, y, e.isDir ? "▸" : wanted ? "◆" : "·", { fg: e.isDir ? c.accent : wanted ? c.accentAlt : c.faint, bg });
      ui.text(inner.x + 3, y, e.isDir ? `${e.name}/` : e.name, { fg: e.isDir ? c.fg : wanted ? c.fg : c.muted, attrs: e.isDir || sel ? BOLD : 0, bg }, inner.w - 14);
      if (!e.isDir) ui.textRight(inner.x + inner.w - 1, y, e.size < 1024 ? `${e.size} B` : `${Math.round(e.size / 1024)} KB`, { fg: c.faint, bg });
      ui.hit(row, { onClick: () => (this.sel = i), onDouble: () => this.pick(e) });
    });
  }
}

/** Open the picker; resolves with the chosen file's path, or null. */
export function pickFile(deck: Deck, title: string, exts: string[] = [], start?: string): Promise<string | null> {
  if (!deck.platform.files) {
    deck.notify("picking files needs the desktop app", "warning");
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    deck.workspace.push(new FilePicker(deck, title, resolve, exts, start));
    deck.requestFrame();
  });
}
