import { mix } from "../core/color";
import { BOLD, type Rect } from "../core/grid";
import { t } from "../core/i18n";
import type { KeyInput } from "../core/input";
import { truncate } from "../core/unicode";
import type { Deck } from "../deck";
import { FilterBar } from "../ui/filterbar";
import { ListView } from "../ui/list";
import { q, type UI } from "../ui/ui";
import { basename, dirname, join } from "../vault/paths";
import type { Overlay } from "./overlays";
import { fileIcon } from "./sidebar";

/**
 * THE little file browser — one window for every "go through folders" need:
 *
 *  - `source: "vault"`  — a folder of the vault (a folder shortcut square opens it
 *    under itself): enter goes in, a file opens; + note, + folder, trash, NEXUS.
 *  - `source: "computer"` with `pick` — the whole computer, read-only, to choose
 *    a file (importing a script): enter on a file picks it.
 *
 * The same everywhere: ‹ › history (like a browser), ↑ the folder above, ⌂ where
 * it started, "/" filters (the shared FilterBar), esc closes.
 *   ↑↓ choose · enter open · ← / ⌫ back · → forward · n note · d folder · del trash
 */
interface Entry {
  name: string;
  path: string;
  isDir: boolean;
  size: number;
}

export interface FileBrowserOptions {
  source: "vault" | "computer";
  /** the folder it opens on (vault: "" = the root; computer: an absolute path, default your home) */
  start?: string;
  title: string;
  /** open it under this rectangle (a shortcut square); else centred */
  anchor?: Rect;
  /** choosing a file hands its path here (and closes) instead of opening it */
  pick?: (path: string | null) => void;
  /** extensions to highlight (".sh", ".py"…) */
  exts?: string[];
}

export class FileBrowser implements Overlay {
  modal = true;
  done = false;
  private list = new ListView<Entry>();
  private filter = new FilterBar();
  private history: string[] = [];
  private at = 0;
  /** the computer's folders, as read (vault: always fresh from the vault's index) */
  private cache = new Map<string, Entry[]>();
  private error = "";
  private readonly vault: boolean;

  constructor(
    private readonly deck: Deck,
    private readonly o: FileBrowserOptions,
  ) {
    this.vault = o.source === "vault";
    this.list.clickActivates = () => true;
    this.list.onActivate = (e) => this.open(e);
    this.list.tipOf = (e) => (e.isDir ? t("click: go in") : this.o.pick ? t("click: choose it") : t("click: open it"));
    if (this.vault)
      this.list.menuOf = (e) => [
        { label: e.isDir ? t("go in") : t("open"), run: () => this.open(e), hint: "enter" },
        { label: t("show in the tree"), run: () => ((this.done = true), this.deck.workspace.sidebar.reveal(e.path)) },
        "-",
        { label: t("move to the trash"), run: () => void this.trash(e), danger: true, hint: "del" },
      ];
    void this.start();
  }

  private async start(): Promise<void> {
    const s = this.o.start ?? (this.vault ? "" : await this.deck.platform.files!.home());
    this.history = [s];
    this.load(s);
  }

  private get dir(): string {
    return this.history[this.at] ?? "";
  }

  /** The computer's folders are read once (async); the vault's are always at hand. */
  private load(dir: string): void {
    if (this.vault || this.cache.has(dir)) return;
    this.error = "";
    void this.deck.platform.files!.list(dir)
      .then((es) => this.cache.set(dir, es))
      .catch((e) => (this.error = e instanceof Error ? e.message : String(e)))
      .finally(() => this.deck.requestFrame());
  }

  private entries(): Entry[] {
    const raw = this.vault
      ? this.deck.vault.entries.filter((e) => dirname(e.path) === this.dir && !e.name.startsWith("."))
      : (this.cache.get(this.dir) ?? []);
    return raw
      .filter((e) => this.filter.matches(e.name, this.vault ? this.deck.marks.tagOf(e.path) ?? null : null))
      .sort((a, b) => Number(b.isDir) - Number(a.isDir) || a.name.localeCompare(b.name, undefined, { numeric: true }));
  }

  private goTo(dir: string): void {
    this.history = [...this.history.slice(0, this.at + 1), dir];
    this.at++;
    this.filter.clear();
    this.list.select(0);
    this.load(dir);
    this.deck.sound.play("tick");
  }

  /** A folder: go in. A file: pick it, or open it in the deck. */
  private open(e: Entry): void {
    if (e.isDir) return this.goTo(e.path);
    this.done = true;
    if (this.o.pick) this.o.pick(e.path);
    else void this.deck.act(`open ${q(e.path)}`);
  }

  private go(d: -1 | 1): void {
    const n = this.at + d;
    if (n < 0 || n >= this.history.length) return;
    this.at = n;
    this.list.select(0);
    this.deck.sound.play("tick");
  }

  private parent(): string | null {
    if (this.vault) return this.dir ? dirname(this.dir) : null;
    const p = this.dir.replace(/[\\/]+$/, "");
    const up = p.slice(0, Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\")));
    return up && up !== p ? up : p.includes("/") ? "/" : null;
  }

  private close(): void {
    this.done = true;
    this.o.pick?.(null);
  }

  private async newNote(): Promise<void> {
    const title = await this.deck.prompt(t("New note in /{dir}", { dir: this.dir }), { placeholder: t("its title") });
    if (!title?.trim()) return;
    const path = join(this.dir, `${title.trim().replace(/[\\/:*?"<>|]/g, "-")}.md`);
    if (await this.deck.vault.exists(path)) return this.deck.notify(t("there's already a {name} in /{dir}", { name: basename(path), dir: this.dir }), "warning");
    await this.deck.vault.write(path, `# ${title.trim()}\n\n`);
    this.done = true;
    void this.deck.act(`open ${q(path)}`);
  }

  private async newFolder(): Promise<void> {
    const name = await this.deck.prompt(t("New folder in /{dir}", { dir: this.dir }), { placeholder: t("its name") });
    if (name?.trim()) await this.deck.vault.mkdir(join(this.dir, name.trim().replace(/[\\/:*?"<>|]/g, "-")));
  }

  private async trash(e: Entry | undefined): Promise<void> {
    if (!e || !(await this.deck.confirm(t("Move to the trash?"), `/${e.path}\n${t("it goes to .trash, you can get it back")}`))) return;
    await this.deck.act(`rm ${e.isDir ? "-r " : ""}${q(`/${e.path}`)}`);
  }

  onKey(k: KeyInput): boolean {
    if (this.filter.onKey(k)) return this.list.select(0), true;
    switch (k.combo) {
      case "esc": this.close(); return true;
      case "left": case "backspace": this.at > 0 ? this.go(-1) : this.parent() !== null && this.goTo(this.parent()!); return true;
      case "right": this.go(1); return true;
      case "delete": if (this.vault) void this.trash(this.list.current); return true;
      case "up": this.list.onAction("up"); return true;
      case "down": this.list.onAction("down"); return true;
      case "enter": this.list.onAction("confirm"); return true;
    }
    return true;
  }
  onText(s: string): boolean {
    if (this.filter.onText(s)) return this.list.select(0), true;
    if (this.vault && s === "n") void this.newNote();
    else if (this.vault && s === "d") void this.newFolder();
    else if (!this.vault && s === "~") void this.deck.platform.files!.home().then((h) => this.goTo(h));
    return true;
  }

  render(ui: UI, screen: Rect): void {
    const c = ui.c;
    ui.hit(screen, { onClick: () => this.close(), onWheel: () => {}, block: true });
    if (!this.o.anchor) ui.tint(screen, c.subtle);
    const items = this.entries();
    this.list.items = items;
    const w = Math.min(this.o.anchor ? 42 : 72, screen.w - 2);
    const h = Math.min(Math.max(9, items.length + 7), this.o.anchor ? 20 : 30, screen.h - 2);
    // under its square (above when there's no room below), else in the middle; never off screen
    let x: number, y: number;
    if (this.o.anchor) {
      y = this.o.anchor.y + this.o.anchor.h + 1;
      if (y + h > screen.y + screen.h) y = Math.max(screen.y, this.o.anchor.y - h - 1);
      x = Math.max(screen.x + 1, Math.min(this.o.anchor.x, screen.x + screen.w - w - 1));
    } else (x = screen.x + Math.floor((screen.w - w) / 2)), (y = screen.y + Math.floor((screen.h - h) / 3));
    const r = { x, y, w, h };
    const inner = ui.box(r, { title: this.o.title, focused: true, bg: c.panel, info: `${items.length}` });
    ui.hit(r, { onClick: () => {}, onWheel: (d) => this.list.onAction(d > 0 ? "down" : "up") });

    // ‹ › ↑ ⌂ and where you are
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
    nav("↑", this.parent() !== null, () => this.goTo(this.parent()!), t("the folder above"));
    nav("⌂", this.dir !== this.history[0], () => this.goTo(this.history[0]), t("back to where it started"));
    ui.text(bx, inner.y, truncate(this.vault ? `/${this.dir}` : this.dir, inner.x + inner.w - bx), { fg: c.subtle, bg: c.panel });
    // the shared filter bar
    this.filter.render(ui, { x: inner.x, y: inner.y + 1, w: inner.w, h: 1 });

    // the folder's contents
    const lr = { x: inner.x, y: inner.y + 3, w: inner.w, h: inner.h - 5 };
    if (this.error) ui.text(lr.x + 1, lr.y, `⚠ ${this.error}`, { fg: c.error, bg: c.panel }, lr.w - 2);
    else if (!items.length) ui.textCenter(lr, lr.y + 1, this.filter.active ? t("nothing matches") : t("empty folder"), { fg: c.muted, bg: c.panel });
    else
      this.list.render(ui, lr, true, (e, row, sel) => {
        const st = sel ? { bg: mix(c.accent, c.panel, 0.75) } : {};
        const wanted = !e.isDir && (this.o.exts ?? []).some((x) => e.name.toLowerCase().endsWith(x));
        ui.text(row.x + 1, row.y, e.isDir ? "▸" : e.name.endsWith(".md") ? "≡" : fileIcon(e.name), { fg: e.isDir ? c.warning : c.accentAlt, ...st });
        ui.text(row.x + 3, row.y, e.isDir ? `${e.name}/` : this.vault ? e.name.replace(/\.md$/, "") : e.name, { fg: sel || wanted ? c.fg : c.muted, attrs: e.isDir || wanted ? BOLD : 0, ...st }, row.w - 12);
        if (!e.isDir && !this.vault) ui.textRight(row.x + row.w - 1, row.y, e.size < 1024 ? `${e.size} B` : `${Math.round(e.size / 1024)} KB`, { fg: c.faint, ...st });
      });

    // what you can do here
    let fx = inner.x;
    const fy = inner.y + inner.h - 1;
    const btn = (label: string, run: () => void, tip: string, col?: number) => (fx += ui.button(fx, fy, label, run, { tip, accent: col }) + 1);
    if (this.vault) {
      btn(t("+ note"), () => void this.newNote(), "n");
      btn(t("+ folder"), () => void this.newFolder(), "d");
      btn("⌫", () => void this.trash(this.list.current), t("the selected one to the trash · del"), c.error);
      btn("⬡", () => ((this.done = true), void this.deck.act(`explore ${q(this.dir)}`)), t("open this folder in NEXUS"));
    } else {
      btn("~", () => void this.deck.platform.files!.home().then((hm) => this.goTo(hm)), t("your home folder · ~"));
      ui.text(fx + 1, fy, t("enter on a file chooses it"), { fg: c.faint, bg: c.panel }, inner.x + inner.w - fx - 1);
    }
  }
}

/** Pick a file anywhere on the computer (the deck's own picker). Resolves with its path, or null. */
export function pickFile(deck: Deck, title: string, exts: string[] = [], start?: string): Promise<string | null> {
  if (!deck.platform.files) return deck.notify(t("picking files needs the desktop app"), "warning"), Promise.resolve(null);
  return new Promise((resolve) => deck.workspace.push(new FileBrowser(deck, { source: "computer", title, exts, start, pick: resolve })));
}
