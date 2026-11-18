import { q } from "../ui/ui";
import { BOLD, type Rect } from "../core/grid";
import { mix } from "../core/color";
import { favCommand, favIcon, favorites } from "./favorites";
import type { Action, KeyInput } from "../core/input";
import type { Deck } from "../deck";
import type { VaultEntry } from "../platform/types";
import { ListView } from "../ui/list";
import type { UI } from "../ui/ui";
import { dirname } from "../vault/paths";

interface Row {
  entry: VaultEntry;
  depth: number;
  /** last child of its folder (└─ instead of ├─) */
  last: boolean;
  /** for each ancestor level: does a line (│) continue below it? */
  rails: boolean[];
  /** folders: how many things inside */
  count?: number;
}

/** The file tree. Enter/click opens a note or folds a folder; `n` new note, `r` rescan. */
export class Sidebar {
  private list = new ListView<Row>();
  private open = new Set<string>(["journal", "notes"]);
  private builtFrom = -1;
  private version = 0;

  constructor(private readonly deck: Deck) {
    deck.vault.events.on("changed", () => this.version++);
    deck.vault.events.on("rescanned", () => this.version++);
    this.list.onActivate = (row) => this.activate(row);
    this.list.cmdOf = (row) => (row.entry.isDir ? undefined : `open ${q(row.entry.path)}`);
    this.list.tipOf = (row) => (row.entry.isDir ? "click: select · double-click: fold" : "n new note here · p pin · r rescan")
  }

  private rebuild(): void {
    const all = this.deck.vault.entries;
    const rows: Row[] = [];
    const kidsOf = (dir: string) =>
      all
        .filter((e) => dirname(e.path) === dir && !e.name.startsWith("."))
        .sort((a, b) => Number(b.isDir) - Number(a.isDir) || a.name.localeCompare(b.name, undefined, { numeric: true }));
    const walk = (dir: string, depth: number, rails: boolean[]) => {
      const kids = kidsOf(dir);
      kids.forEach((e, i) => {
        const last = i === kids.length - 1;
        rows.push({ entry: e, depth, last, rails, count: e.isDir ? kidsOf(e.path).length : undefined });
        if (e.isDir && this.open.has(e.path)) walk(e.path, depth + 1, [...rails, !last]);
      });
    };
    walk("", 0, []);
    const current = this.list.current?.entry.path;
    this.list.items = rows;
    const idx = rows.findIndex((r) => r.entry.path === current);
    if (idx >= 0) this.list.selected = idx;
    this.builtFrom = this.version;
  }

  private activate(row: Row): void {
    if (row.entry.isDir) {
      if (this.open.has(row.entry.path)) this.open.delete(row.entry.path);
      else this.open.add(row.entry.path);
      this.version++;
    } else void this.deck.openFile(row.entry.path);
  }

  /** Highlight the file shown in the main area. */
  reveal(path: string): void {
    for (let d = dirname(path); d; d = dirname(d)) this.open.add(d);
    this.version++;
    this.rebuild();
    const idx = this.list.items.findIndex((r) => r.entry.path === path);
    if (idx >= 0) this.list.select(idx);
  }

  onKey(k: KeyInput): boolean {
    const row = this.list.current;
    if (k.key === "right" && row?.entry.isDir && !this.open.has(row.entry.path)) return this.activate(row), true;
    if (k.key === "left" && row) {
      if (row.entry.isDir && this.open.has(row.entry.path)) return this.activate(row), true;
      const parent = dirname(row.entry.path);
      const idx = this.list.items.findIndex((r) => r.entry.path === parent);
      if (idx >= 0) this.list.select(idx);
      return true;
    }
    return false;
  }

  onText(t: string): boolean {
    if (t === "p" && this.list.current) {
      const e = this.list.current.entry;
      const pinned = favorites(this.deck).some((f) => f.target === e.path);
      void this.deck.act(`${pinned ? "unpin" : "pin"} ${q(e.path)}`);
      return true;
    }
    if (t === "n") void this.deck.newNote(this.list.current ? (this.list.current.entry.isDir ? this.list.current.entry.path : dirname(this.list.current.entry.path)) : "notes");
    else if (t === "r") void this.deck.vault.rescan();
    else return false;
    return true;
  }

  onAction(a: Action): boolean {
    const row = this.list.current;
    if (a === "right" && row?.entry.isDir) return this.activate(row), true;
    return this.list.onAction(a);
  }

  /** The folder new things go in: the selected folder, or the selected file's folder. */
  private here(): string {
    const cur = this.list.current?.entry;
    return cur ? (cur.isDir ? cur.path : dirname(cur.path)) : "";
  }

  render(ui: UI, r: Rect, focused: boolean): void {
    if (this.builtFrom !== this.version) this.rebuild();
    const c = ui.c;
    const activeKey = this.deck.workspace.activeApp?.key ?? "";

    // the toolbar: [+ note] [+ dir], like an old file manager
    const here = this.here();
    let bx = r.x + 1;
    bx += ui.button(bx, r.y, "+ note", () => void this.deck.newNote(here || "notes"), { tip: `new note in /${here || "notes"}\nctrl+n · n` }) + 1;
    ui.button(bx, r.y, "+ dir", () => void this.deck.newFolder(here), { tip: `new folder in /${here}\nctrl+shift+n` });
    ui.hline(r.x, r.y + 1, r.w, { fg: c.faint }, "┄");
    // ★ pinned: notes, folders, modules (p pins the selected entry)
    const favs = favorites(this.deck);
    let top = r.y + 2;
    if (favs.length) {
      const shown = favs.slice(0, Math.max(1, Math.min(8, Math.floor(r.h / 3))));
      for (const f of shown) {
        const line = { x: r.x, y: top, w: r.w, h: 1 };
        const hot = ui.hovered(line);
        if (hot) ui.fill(line, { bg: c.highlight });
        const st = hot ? { bg: c.highlight } : {};
        ui.text(r.x + 1, top, "★", { fg: c.warning, ...st });
        ui.text(r.x + 3, top, favIcon(f), { fg: c.accent, ...st });
        ui.text(r.x + 5, top, f.label, { fg: hot ? c.fg : c.subtle, ...st }, r.w - 6);
        ui.hit(line, { cmd: favCommand(this.deck, f), tip: `${favCommand(this.deck, f)}\nunpin ${f.target}` });
        top++;
      }
      ui.hline(r.x, top, r.w, { fg: c.faint }, "┄");
      top++;
    }
    const list = { x: r.x, y: top, w: r.w, h: Math.max(0, r.y + r.h - top) };

    const guide = { fg: mix(c.subtle, c.bg, 0.35) };
    this.list.render(ui, list, focused, ({ entry, depth, last, rails, count }, row, selected) => {
      const isOpen = activeKey === `note:${entry.path}`;
      let x = row.x + 1;
      // tree guides: │ for open branches above, then ├─ or └─
      // (top-level items have no connector: their rail is rails[0], not drawn)
      for (let i = 1; i < depth; i++) x = ui.text(x, row.y, rails[i] ? "│ " : "  ", guide);
      if (depth > 0) x = ui.text(x, row.y, last ? "└" : "├", guide);
      if (entry.isDir) {
        const opened = this.open.has(entry.path);
        x = ui.text(x, row.y, depth > 0 ? "─" : "", guide);
        x = ui.text(x, row.y, opened ? "▾" : "▸", { fg: c.accent });
        x = ui.text(x, row.y, ` ${entry.name}/`, { fg: c.fg, attrs: BOLD }, row.w - (x - row.x) - 5);
        if (count !== undefined && row.w - (x - row.x) > 4) ui.textRight(row.x + row.w - 1, row.y, String(count), { fg: selected ? c.subtle : c.faint });
      } else {
        const md = entry.name.endsWith(".md");
        x = ui.text(x, row.y, depth > 0 ? "─" : "", guide);
        x = ui.text(x, row.y, md ? " " : "◦", { fg: c.subtle });
        ui.text(x, row.y, md ? entry.name.replace(/\.md$/, "") : entry.name, {
          fg: isOpen ? c.accentAlt : selected ? c.fg : c.muted,
          attrs: isOpen ? BOLD : 0,
        }, row.w - (x - row.x) - 1);
        if (isOpen) ui.text(row.x, row.y, "▌", { fg: c.accentAlt });
      }
    });
    if (this.list.items.length === 0) ui.text(list.x + 2, list.y + 1, "empty vault", { fg: c.subtle });
  }
}
