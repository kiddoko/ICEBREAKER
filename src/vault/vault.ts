import { Emitter } from "../core/events";
import { WELCOME_NOTE } from "../platform/demo-vault";
import type { VaultBackend, VaultEntry } from "../platform/types";
import { basename, dirname, isoDate, join, normalize } from "./paths";

/**
 * The vault as the rest of the app sees it: the backend (disk or browser)
 * plus an in-memory index of every file, used by the file tree, the command
 * palette, tab-completion and search. Every write goes through here so the
 * index stays fresh and listeners (file tree, open editors) get notified.
 */
export class Vault {
  /** Absolute path of the mounted folder (for display). */
  root = "";
  entries: VaultEntry[] = [];
  readonly events = new Emitter<{ changed: { path: string } ; rescanned: void }>();

  constructor(private readonly backend: VaultBackend) {}

  /** Can this platform self-destruct the vault? (desktop) */
  get canDestroy(): boolean {
    return !!this.backend.destroy;
  }

  /** SELF-DESTRUCT — see the `self-destruct` command. Empties the folder for good. */
  async destroy(confirm: string): Promise<number> {
    if (!this.backend.destroy) throw new Error("self-destruct needs the desktop app");
    const n = await this.backend.destroy(confirm);
    await this.rescan();
    return n;
  }

  async mount(absPath: string): Promise<void> {
    this.root = await this.backend.mount(absPath || (await this.backend.defaultPath()));
    await this.rescan();
    if (this.entries.length === 0) {
      // Brand-new vault: leave a note explaining where you are.
      await this.write("Welcome.md", WELCOME_NOTE);
    }
  }

  async defaultPath(): Promise<string> {
    return this.backend.defaultPath();
  }

  async rescan(): Promise<void> {
    this.entries = await this.backend.walk();
    this.entries.sort((a, b) => a.path.localeCompare(b.path));
    this.events.emit("rescanned", undefined);
  }

  files(): VaultEntry[] {
    return this.entries.filter((e) => !e.isDir);
  }

  markdown(): VaultEntry[] {
    return this.entries.filter((e) => !e.isDir && e.path.endsWith(".md"));
  }

  find(path: string): VaultEntry | undefined {
    const p = normalize(path);
    return this.entries.find((e) => e.path === p);
  }

  isDir(path: string): boolean {
    const p = normalize(path);
    return p === "" || !!this.entries.find((e) => e.path === p && e.isDir);
  }

  read(path: string): Promise<string> {
    return this.backend.read(normalize(path));
  }

  readMany(paths: string[]): Promise<(string | null)[]> {
    return this.backend.readMany(paths.map(normalize));
  }

  exists(path: string): Promise<boolean> {
    return this.backend.exists(normalize(path));
  }

  list(dir: string): Promise<VaultEntry[]> {
    return this.backend.list(normalize(dir));
  }

  async write(path: string, content: string): Promise<void> {
    const p = normalize(path);
    await this.backend.write(p, content);
    this.upsert(p, content.length);
    this.events.emit("changed", { path: p });
  }

  async append(path: string, text: string): Promise<void> {
    const p = normalize(path);
    const current = (await this.backend.exists(p)) ? await this.backend.read(p) : "";
    const sep = current && !current.endsWith("\n") ? "\n" : "";
    await this.write(p, current + sep + text);
  }

  async mkdir(path: string): Promise<void> {
    const p = normalize(path);
    await this.backend.mkdir(p);
    for (let d = p; d; d = dirname(d)) this.upsertDir(d);
    this.events.emit("changed", { path: p });
  }

  /** Moves to .trash (recoverable). Returns where it went. */
  async trash(path: string): Promise<string> {
    const p = normalize(path);
    const dest = await this.backend.trash(p);
    this.entries = this.entries.filter((e) => e.path !== p && !e.path.startsWith(p + "/"));
    this.events.emit("changed", { path: p });
    return dest;
  }

  async rename(from: string, to: string): Promise<void> {
    await this.backend.rename(normalize(from), normalize(to));
    await this.rescan();
    this.events.emit("changed", { path: normalize(to) });
  }

  // ── conventions ───────────────────────────────────────────────────────────

  journalFolder = "journal";

  journalPath(date: Date): string {
    return join(this.journalFolder, `${isoDate(date)}.md`);
  }

  /** Dates (YYYY-MM-DD) that have a journal entry. */
  journalDates(): Set<string> {
    const out = new Set<string>();
    const prefix = this.journalFolder + "/";
    for (const e of this.entries) {
      if (e.isDir || !e.path.startsWith(prefix)) continue;
      const m = basename(e.path).match(/^(\d{4}-\d{2}-\d{2})\.md$/);
      if (m) out.add(m[1]);
    }
    return out;
  }

  /** Files of the tool folder (.icebreaker/…), which `walk` skips on purpose. */
  async toolFiles(sub: string, ext: string): Promise<{ path: string; content: string }[]> {
    const dir = `.icebreaker/${sub}`;
    if (!(await this.backend.exists(dir))) return [];
    const items = (await this.backend.list(dir)).filter((e) => !e.isDir && e.name.endsWith(ext));
    const contents = await this.backend.readMany(items.map((i) => i.path));
    return items.map((i, k) => ({ path: i.path, content: contents[k] ?? "" }));
  }

  private upsert(path: string, size: number): void {
    const existing = this.entries.find((e) => e.path === path);
    if (existing) {
      existing.size = size;
      existing.modified = Date.now();
    } else if (!path.split("/").some((part) => part.startsWith("."))) {
      this.entries.push({ path, name: basename(path), isDir: false, size, modified: Date.now() });
      for (let d = dirname(path); d; d = dirname(d)) this.upsertDir(d);
      this.entries.sort((a, b) => a.path.localeCompare(b.path));
    }
  }

  private upsertDir(path: string): void {
    if (path.split("/").some((part) => part.startsWith("."))) return;
    if (!this.entries.find((e) => e.path === path)) {
      this.entries.push({ path, name: basename(path), isDir: true, size: 0, modified: Date.now() });
    }
  }
}
