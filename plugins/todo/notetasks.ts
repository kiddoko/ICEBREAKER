/**
 * The `- [ ]` written in your notes, as TODO sees them.
 *
 * TODO shows its own tasks and, under them, every open checkbox found in the
 * vault's notes (with the note's name). Ticking one there writes `- [x]` on that
 * very line of the note — and refuses when the line isn't what TODO last read
 * (the note changed since: nothing is written over).
 *
 * A vault can hold thousands of notes: each one is read once, then again only
 * when its modification time changes (`ib.vault.modified()`). Everything goes
 * through the vault API (an encrypted vault is never read from the disk).
 */

/** One open checkbox in a note. */
export interface NoteTask {
  /** the note, vault-relative: "notes/courses.md" */
  path: string;
  /** 0-based line in the note */
  line: number;
  /** the line exactly as read ("  - [ ] milk\r" included): what must still be there to tick it */
  raw: string;
  /** what the checkbox says: "milk" */
  text: string;
}

/** What NoteTasks needs from the vault (ib.vault: read, write, modified). */
export interface NoteIO {
  /** every note's last change (ms), by path */
  modified(): Promise<Record<string, number>>;
  read(path: string): Promise<string>;
  write(path: string, content: string): Promise<void>;
}

/** "- [ ] x", "* [x] x", "+ [X] x" (indented or not) */
const BOX = /^(\s*[-*+] \[)( |x|X)(\] )(.*?)(\r?)$/;

/** a note's address in the shell: "notes/x.md:12" (1-based line, like `checkboxes` and grep) */
export const refOf = (t: Pick<NoteTask, "path" | "line">): string => `${t.path}:${t.line + 1}`;

/** "notes/x.md:12" → the note and its 0-based line (null: not a note's line) */
export function parseRef(s: string): { path: string; line: number } | null {
  const m = /^(.+\.md):(\d+)$/i.exec(s.trim());
  if (!m || Number(m[2]) < 1) return null;
  return { path: m[1], line: Number(m[2]) - 1 };
}

/** The note's name, as TODO shows it: "courses" for "notes/courses.md". */
export const noteName = (path: string): string => path.replace(/^.*\//, "").replace(/\.md$/i, "");

/** The open checkboxes of one note (not those inside ``` code blocks). */
export function openBoxes(path: string, content: string): NoteTask[] {
  const out: NoteTask[] = [];
  let fence = false;
  content.split("\n").forEach((raw, line) => {
    if (/^\s*(```|~~~)/.test(raw)) fence = !fence;
    if (fence) return;
    const m = BOX.exec(raw);
    if (m && m[2] === " " && m[4].trim()) out.push({ path, line, raw, text: m[4].trim() });
  });
  return out;
}

/** The same line, ticked (`done`) or not. null: it isn't a checkbox. */
export function setBox(raw: string, done: boolean): string | null {
  const m = BOX.exec(raw);
  if (!m) return null;
  return `${m[1]}${done ? "x" : " "}${m[3]}${m[4]}${m[5]}`;
}

/** folders that aren't notes: the trash, the deck's own, any hidden one */
const hidden = (path: string) => path.split("/").some((p) => p.startsWith("."));

export class NoteTasks {
  private readonly files = new Map<string, { at: number; tasks: NoteTask[] }>();
  private running: Promise<boolean> | null = null;
  /** when the notes were last looked at (ms) */
  checked = 0;
  /** read at least once */
  loaded = false;

  constructor(private readonly io: NoteIO) {}

  /** Every open checkbox, note by note (by path), in the note's order. */
  list(): NoteTask[] {
    return [...this.files.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .flatMap(([, f]) => f.tasks);
  }

  find(path: string, line: number): NoteTask | undefined {
    return this.files.get(path)?.tasks.find((t) => t.line === line);
  }

  /**
   * Look again: only the notes whose modification time changed are read (a few at a
   * time). true if what TODO shows changed. Calls while one runs share it.
   */
  refresh(): Promise<boolean> {
    this.running ??= this.scan().finally(() => {
      this.running = null;
      this.checked = Date.now();
      this.loaded = true;
    });
    return this.running;
  }

  private async scan(): Promise<boolean> {
    const times = await this.io.modified();
    let changed = false;
    for (const path of [...this.files.keys()]) {
      if (!(path in times) || hidden(path)) (this.files.delete(path), (changed = true));
    }
    const todo = Object.entries(times).filter(([path, at]) => !hidden(path) && this.files.get(path)?.at !== at);
    // a few reads at once: fast on a big vault, without flooding the native side
    let next = 0;
    const worker = async () => {
      while (next < todo.length) {
        const [path, at] = todo[next++];
        try {
          const before = this.files.get(path)?.tasks ?? [];
          const tasks = openBoxes(path, await this.io.read(path));
          this.files.set(path, { at, tasks });
          if (tasks.length || before.length) changed = true;
        } catch {
          // unreadable right now (moved, locked): looked at again next time
          this.files.delete(path);
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(8, todo.length) }, worker));
    return changed;
  }

  /**
   * Tick (or untick) the checkbox on that line of the note. `expect`: the line as it must
   * still be (what was shown); without it, the line must be a checkbox in the other state.
   * Returns the line before and after; throws (and writes nothing) when the line changed.
   */
  async tick(path: string, line: number, done: boolean, expect?: string): Promise<{ before: string; after: string }> {
    const content = await this.io.read(path);
    const lines = content.split("\n");
    const now = lines[line];
    const where = `${refOf({ path, line })}`;
    const changed = (why: string) => {
      void this.reread(path, content);
      return new Error(`${where}: ${why} — the note changed since, nothing was written (open it: open ${path})`);
    };
    if (now === undefined) throw changed("there's no such line any more");
    if (expect !== undefined && now !== expect) throw changed(`the line isn't “${(setBox(expect, false) ?? expect).trim()}” any more`);
    const after = setBox(now, done);
    if (after === null) throw changed("that line isn't a checkbox");
    if (after === now) throw new Error(`${where}: already ${done ? "ticked" : "open"}`);
    lines[line] = after;
    const text = lines.join("\n");
    await this.io.write(path, text);
    await this.reread(path, text);
    return { before: now, after };
  }

  /** what TODO knows of one note, from its content just read or written */
  private async reread(path: string, content: string): Promise<void> {
    const at = (await this.io.modified().catch(() => ({}) as Record<string, number>))[path] ?? Date.now();
    this.files.set(path, { at, tasks: openBoxes(path, content) });
  }
}
