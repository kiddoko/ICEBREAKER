import { mix } from "../core/color";
import { BOLD, type Rect } from "../core/grid";
import { t } from "../core/i18n";
import type { KeyInput } from "../core/input";
import { truncate } from "../core/unicode";
import type { Deck } from "../deck";
import type { VaultEntry } from "../platform/types";
import { ListView } from "../ui/list";
import { q, type UI } from "../ui/ui";
import { basename, dirname, join } from "../vault/paths";
import type { Overlay } from "./overlays";
import { fileIcon } from "./sidebar";

/**
 * A folder shortcut's little browser: it opens under the square and lists the
 * folder. A folder inside replaces the list (‹ back, › forward, like a browser);
 * a file opens and the browser closes. Make a note or a folder right there,
 * send something to the trash, or open the folder in NEXUS.
 *
 *   ↑↓ choose · enter open · ← / ⌫ back · → forward · n note · d folder · del trash · esc
 */
export class FolderPopup implements Overlay {
  modal = true;
  done = false;
  private list = new ListView<VaultEntry>();
  /** where you've been (‹ ›), and where you are in it */
  private history: string[];
  private at = 0;

  constructor(
    private readonly deck: Deck,
    private readonly start: string,
    /** the shortcut square it opens under */
    private readonly anchor: Rect,
  ) {
    this.history = [start];
    this.list.onActivate = (e) => this.open(e);
    this.list.clickActivates = () => true;
    this.list.tipOf = (e) => (e.isDir ? t("click: go in") : t("click: open it"));
    this.list.menuOf = (e) => [
      { label: e.isDir ? t("go in") : t("open"), run: () => this.open(e), hint: "enter" },
      { label: t("show in the tree"), run: () => ((this.done = true), this.deck.workspace.sidebar.reveal(e.path)) },
      "-",
      { label: t("move to the trash"), run: () => void this.trash(e), danger: true, hint: "del" },
    ];
  }

  private get dir(): string {
    return this.history[this.at];
  }

  private entries(): VaultEntry[] {
    return this.deck.vault.entries
      .filter((e) => dirname(e.path) === this.dir && !e.name.startsWith("."))
      .sort((a, b) => Number(b.isDir) - Number(a.isDir) || a.name.localeCompare(b.name, undefined, { numeric: true }));
  }

  /** A folder: go in (the forward history is dropped, like a browser). A file: open it. */
  private open(e: VaultEntry): void {
    if (!e.isDir) {
      this.done = true;
      void this.deck.act(`open ${q(e.path)}`);
      return;
    }
    this.history = [...this.history.slice(0, this.at + 1), e.path];
    this.at++;
    this.list.select(0);
    this.deck.sound.play("tick");
  }

  private go(d: -1 | 1): void {
    const n = this.at + d;
    if (n < 0 || n >= this.history.length) return;
    this.at = n;
    this.list.select(0);
    this.deck.sound.play("tick");
  }

  private async newNote(): Promise<void> {
    const title = await this.deck.prompt(t("New note in /{dir}", { dir: this.dir }), { placeholder: t("its title") });
    if (!title?.trim()) return;
    const name = title.trim().replace(/[\\/:*?"<>|]/g, "-");
    const path = join(this.dir, `${name}.md`);
    if (await this.deck.vault.exists(path)) return this.deck.notify(t("there's already a {name} in /{dir}", { name: `${name}.md`, dir: this.dir }), "warning");
    await this.deck.vault.write(path, `# ${title.trim()}\n\n`);
    this.done = true;
    void this.deck.act(`open ${q(path)}`);
  }

  private async newFolder(): Promise<void> {
    const name = await this.deck.prompt(t("New folder in /{dir}", { dir: this.dir }), { placeholder: t("its name") });
    if (!name?.trim()) return;
    await this.deck.vault.mkdir(join(this.dir, name.trim().replace(/[\\/:*?"<>|]/g, "-")));
    this.deck.requestFrame();
  }

  private async trash(e: VaultEntry | undefined): Promise<void> {
    if (!e) return;
    if (!(await this.deck.confirm(t("Move to the trash?"), `/${e.path}\n${t("it goes to .trash, you can get it back")}`))) return;
    await this.deck.act(`rm ${e.isDir ? "-r " : ""}${q(`/${e.path}`)}`);
  }

  onKey(k: KeyInput): boolean {
    switch (k.combo) {
      case "esc": this.done = true; return true;
      case "left": case "backspace": this.go(-1); return true;
      case "right": this.go(1); return true;
      case "delete": void this.trash(this.list.current); return true;
      case "up": this.list.onAction("up"); return true;
      case "down": this.list.onAction("down"); return true;
      case "enter": this.list.onAction("confirm"); return true;
    }
    return true;
  }
  onText(s: string): boolean {
    if (s === "n") void this.newNote();
    else if (s === "d") void this.newFolder();
    return true;
  }

  render(ui: UI, screen: Rect): void {
    const c = ui.c;
    ui.hit(screen, { onClick: () => (this.done = true), onWheel: () => {}, block: true });
    const items = this.entries();
    this.list.items = items;
    const w = Math.min(40, screen.w - 2);
    const h = Math.min(Math.max(8, items.length + 6), 20, screen.h - 2);
    // under the square; above it if there's no room below; never off screen
    let y = this.anchor.y + this.anchor.h + 1;
    if (y + h > screen.y + screen.h) y = Math.max(screen.y, this.anchor.y - h - 1);
    const x = Math.max(screen.x + 1, Math.min(this.anchor.x, screen.x + screen.w - w - 1));
    const r = { x, y, w, h };
    const inner = ui.box(r, { title: `▣ ${basename(this.start) || t("vault")}`, focused: true, bg: c.panel, info: `${items.length}` });
    ui.hit(r, { onClick: () => {}, onWheel: (d) => this.list.onAction(d > 0 ? "down" : "up") });

    // ‹ › ⌂ and where you are
    let bx = inner.x;
    const nav = (label: string, ok: boolean, run: () => void, tip: string) => {
      const br = { x: bx, y: inner.y, w: 3, h: 1 };
      const hot = ok && ui.hovered(br);
      ui.text(bx, inner.y, ` ${label} `, { fg: !ok ? c.faint : hot ? c.bg : c.fg, bg: hot ? c.accent : c.highlight, attrs: BOLD });
      if (ok) ui.hit(br, { onClick: run, tip });
      bx += 4;
    };
    nav("‹", this.at > 0, () => this.go(-1), t("back · ← or ⌫"));
    nav("›", this.at < this.history.length - 1, () => this.go(1), t("forward · →"));
    nav("⌂", this.dir !== this.start, () => ((this.history = [...this.history.slice(0, this.at + 1), this.start]), this.at++), t("back to the shortcut's folder"));
    ui.text(bx, inner.y, truncate(`/${this.dir}`, inner.x + inner.w - bx), { fg: c.subtle, bg: c.panel });

    // the folder's contents
    const lr = { x: inner.x, y: inner.y + 2, w: inner.w, h: inner.h - 4 };
    if (!items.length) ui.textCenter(lr, lr.y + 1, t("empty folder"), { fg: c.muted, bg: c.panel });
    else
      this.list.render(ui, lr, true, (e, row, sel) => {
        const st = sel ? { bg: mix(c.accent, c.panel, 0.75) } : {};
        ui.text(row.x + 1, row.y, e.isDir ? "▸" : e.name.endsWith(".md") ? "≡" : fileIcon(e.name), { fg: e.isDir ? c.warning : c.accentAlt, ...st });
        ui.text(row.x + 3, row.y, e.isDir ? `${e.name}/` : e.name.replace(/\.md$/, ""), { fg: sel ? c.fg : c.muted, attrs: e.isDir ? BOLD : 0, ...st }, row.w - 4);
      });

    // what you can do here
    let fx = inner.x;
    const fy = inner.y + inner.h - 1;
    const btn = (label: string, run: () => void, tip: string, col?: number) => (fx += ui.button(fx, fy, label, run, { tip, accent: col }) + 1);
    btn(t("+ note"), () => void this.newNote(), "n");
    btn(t("+ folder"), () => void this.newFolder(), "d");
    btn("⌫", () => void this.trash(this.list.current), t("the selected one to the trash · del"), c.error);
    btn("⬡", () => ((this.done = true), void this.deck.act(`explore ${q(this.dir)}`)), t("open this folder in NEXUS"));
  }
}
