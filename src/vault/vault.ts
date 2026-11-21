import type { UndoHistory } from "../core/undo";
import { writeStartHere } from "./starthere";
import { Emitter } from "../core/events";
import { WELCOME_NOTE } from "../platform/demo-vault";
import type { VaultBackend, VaultEntry } from "../platform/types";
import { basename, dirname, isoDate, join, newNameProblem, normalize } from "./paths";

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
  readonly events = new Emitter<{ changed: { path: string }; rescanned: void; renamed: { from: string; to: string }; trashed: { path: string; dest: string } }>();

  constructor(private readonly backend: VaultBackend) {}

  /** START HERE notes you changed, which a newer version of the deck would have updated (`starthere --force`) */
  docsYours: string[] = [];

  async mount(absPath: string): Promise<void> {
    this.root = await this.backend.mount(absPath || (await this.backend.defaultPath()));
    await this.rescan();
    if (this.entries.length === 0) {
      // Brand-new vault: leave a note explaining where you are.
      await this.write("Welcome.md", WELCOME_NOTE);
    }
    // the docs, as notes (START HERE/, FOR DEVELOPERS/): written into a new vault, and
    // brought up to date in an old one at every start — the notes you edited stay yours
    if ((await writeStartHere(this).catch(() => 0)) > 0) await this.rescan();
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

  /** The deck's undo history (core/undo.ts): trash and renames go in it. */
  history?: UndoHistory;

  /** A new file or folder you made (a note, `touch`, `mkdir`): ⌘Z sends it to the trash. */
  recordCreated(path: string): void {
    const p = normalize(path);
    let inTrash = "";
    this.history?.record({
      label: `new ${p}`,
      undo: async () => { if (await this.exists(p)) inTrash = await this.trash(p); },
      redo: async () => { if (inTrash) await this.restore(inTrash, p); },
    });
  }

  /** A new name must be one every screen and every system shows as it is (paths.ts newNameProblem). */
  private checkNewName(p: string): void {
    const why = newNameProblem(p);
    if (why) throw new Error(`${p.replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069\u2028\u2029]/g, "�")}: ${why}`);
  }

  async write(path: string, content: string): Promise<void> {
    const p = normalize(path);
    if (newNameProblem(p) && !this.find(p) && !(await this.backend.exists(p).catch(() => false))) this.checkNewName(p);
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
    this.checkNewName(p);
    await this.backend.mkdir(p);
    for (let d = p; d; d = dirname(d)) this.upsertDir(d);
    this.events.emit("changed", { path: p });
  }

  /**
   * Moves to .trash (recoverable). Returns where it went. Whatever showed it (its
   * tabs, its pins) lets go of it ("trashed"): one ⌘Z brings the file and its pins back.
   */
  async trash(path: string): Promise<string> {
    const p = normalize(path);
    const run = async () => {
      const dest = await this.backend.trash(p);
      this.entries = this.entries.filter((e) => e.path !== p && !e.path.startsWith(p + "/"));
      // where it came from, so `trash restore` can put it back in its folder
      await this.noteTrashed(dest, p).catch(() => {});
      this.events.emit("trashed", { path: p, dest });
      this.events.emit("changed", { path: p });
      // ⌘Z puts it back; ⌘⇧Z sends it again (each time to a new place in .trash)
      let inTrash = dest;
      this.history?.record({
        label: `trash ${p}`,
        undo: async () => void (await this.restore(inTrash)),
        redo: async () => void (inTrash = await this.trash(p)),
      });
      return dest;
    };
    return this.history ? this.history.groupAsync(`trash ${p}`, run) : run();
  }

  /**
   * Delete for good something in .trash (TRASH → delete permanently, `trash purge`, `trash
   * empty`). Irreversible: it is not in the undo history, and nothing outside .trash can be
   * deleted this way (the native side refuses it too). The caller asks first.
   */
  async purge(dest: string): Promise<void> {
    const p = normalize(dest);
    if (!p.startsWith(".trash/")) throw new Error(`${p}: only what's in the trash can be deleted for good`);
    await this.backend.purge(p);
    const log = await this.trashLog();
    const left = log.filter((l) => l.dest !== p && !l.dest.startsWith(p + "/"));
    if (left.length !== log.length) await this.backend.write(Vault.TRASH_LOG, JSON.stringify(left, null, 1)).catch(() => {});
    this.events.emit("changed", { path: p });
  }

  static readonly TRASH_LOG = ".icebreaker/trash.json";

  /** The trash ledger: what's in .trash and where each thing lived. */
  async trashLog(): Promise<{ dest: string; from: string; at: number }[]> {
    try {
      if (!(await this.exists(Vault.TRASH_LOG))) return [];
      return JSON.parse(await this.read(Vault.TRASH_LOG)) as { dest: string; from: string; at: number }[];
    } catch {
      return [];
    }
  }

  private async noteTrashed(dest: string, from: string): Promise<void> {
    const log = await this.trashLog();
    log.push({ dest: normalize(dest), from, at: Date.now() });
    await this.backend.write(Vault.TRASH_LOG, JSON.stringify(log.slice(-500), null, 1));
  }

  /** Put something from the trash back where it was (or in `to`). Returns where it went. */
  async restore(dest: string, to?: string): Promise<string> {
    const log = await this.trashLog();
    const item = log.find((l) => l.dest === normalize(dest));
    let target = normalize(to ?? item?.from ?? dest.replace(/^\.trash\/\d+-/, ""));
    // already something there: "name (restored)"
    if (await this.exists(target)) target = target.replace(/(\.[^./]+)?$/, (ext) => ` (restored)${ext}`);
    const dir = target.includes("/") ? target.slice(0, target.lastIndexOf("/")) : "";
    if (dir && !(await this.exists(dir))) await this.mkdir(dir);
    await this.rename(dest, target);
    await this.backend.write(Vault.TRASH_LOG, JSON.stringify(log.filter((l) => l !== item), null, 1));
    return target;
  }

  async rename(from: string, to: string): Promise<void> {
    // into the trash and back: the name it had; anywhere else: a name every screen shows as it is
    if (!normalize(to).startsWith(".trash/") && !normalize(from).startsWith(".trash/")) this.checkNewName(to);
    await this.backend.rename(normalize(from), normalize(to));
    // a restore from the trash records itself (as the trash's undo), not as a rename
    if (!normalize(from).startsWith(".trash/"))
      this.history?.record({ label: `rename ${normalize(from)}`, undo: () => this.rename(to, from), redo: () => this.rename(from, to) });
    this.events.emit("renamed", { from: normalize(from), to: normalize(to) });
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
