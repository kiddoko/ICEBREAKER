import { BOLD, type Rect } from "../core/grid";
import type { Action, KeyInput } from "../core/input";
import type { Deck } from "../deck";
import type { VaultEntry } from "../platform/types";
import { ListView } from "../ui/list";
import type { UI } from "../ui/ui";
import { dirname } from "../vault/paths";

interface Row {
  entry: VaultEntry;
  depth: number;
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
  }

  private rebuild(): void {
    const all = this.deck.vault.entries;
    const rows: Row[] = [];
    const walk = (dir: string, depth: number) => {
      const kids = all
        .filter((e) => dirname(e.path) === dir)
        .sort((a, b) => Number(b.isDir) - Number(a.isDir) || a.name.localeCompare(b.name, undefined, { numeric: true }));
      for (const e of kids) {
        rows.push({ entry: e, depth });
        if (e.isDir && this.open.has(e.path)) walk(e.path, depth + 1);
      }
    };
    walk("", 0);
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

  render(ui: UI, r: Rect, focused: boolean): void {
    if (this.builtFrom !== this.version) this.rebuild();
    const c = ui.c;
    const activeKey = this.deck.workspace.activeApp?.key ?? "";
    this.list.render(ui, r, focused, ({ entry, depth }, row, selected) => {
      const indent = "  ".repeat(depth);
      const icon = entry.isDir ? (this.open.has(entry.path) ? "▾ " : "▸ ") : entry.name.endsWith(".md") ? "· " : "◦ ";
      const isOpen = activeKey === `note:${entry.path}`;
      const name = entry.isDir ? entry.name : entry.name.replace(/\.md$/, "");
      let x = ui.text(row.x + 1, row.y, indent + icon, { fg: entry.isDir ? c.accent : c.subtle });
      x = ui.text(x, row.y, name, {
        fg: isOpen ? c.accentAlt : entry.isDir ? c.fg : selected ? c.fg : c.muted,
        attrs: entry.isDir || isOpen ? BOLD : 0,
      }, row.w - (x - row.x) - 1);
    });
    if (this.list.items.length === 0) ui.text(r.x + 2, r.y + 1, "empty vault", { fg: c.subtle });
  }
}
