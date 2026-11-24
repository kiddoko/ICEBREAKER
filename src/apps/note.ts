import { IS_MAC } from "../core/input";
import { strWidth } from "../core/unicode";
import { editMenu } from "../workspace/menus";
import type { Rect } from "../core/grid";
import type { Action, KeyInput } from "../core/input";
import type { Deck } from "../deck";
import { TextEditor } from "../ui/editor";
import { linkAt } from "../ui/markdown";
import type { MenuEntry, UI } from "../ui/ui";
import { copyToClipboard } from "../core/clipboard";
import { t } from "../core/i18n";
import { q } from "../ui/ui";
import { basename, dirname, join } from "../vault/paths";
import type { App, AppSpec } from "./types";
import { folders } from "../core/suggest";

/**
 * Markdown note editor. Autosaves ~0.8s after you stop typing (like
 * Obsidian), Ctrl+S saves immediately, Ctrl+Enter / Ctrl+click follows links.
 */
export class NoteApp implements App {
  readonly kind = "note";
  /** `note:<path>` — both follow the file when it's renamed or moved (moveTo) */
  key: string;
  readonly editor: TextEditor;
  /** what was last loaded or saved, with "\n" line ends (the editor's) */
  private saved = "";
  /** the file's own line ends: a note written on Windows keeps its "\r\n" when saved here */
  private eol: "\n" | "\r\n" = "\n";
  private saving = false;
  private loaded = false;
  private error = "";
  /** the file changed on disk (another app, a sync, the AI) while you had edits here: neither side is lost */
  private conflict = false;
  private saveTimer: ReturnType<typeof setTimeout> | undefined;
  private unsubscribe: () => void;

  constructor(
    private readonly deck: Deck,
    public path: string,
    /** Called once the file content is in the editor (e.g. to place the cursor). */
    private readonly onLoaded?: (editor: TextEditor) => void,
    /** a file that doesn't exist yet shows this (a journal day's template); it's written only once you type */
    private readonly draft?: string,
  ) {
    this.key = `note:${path}`;
    this.editor = new TextEditor("", {
      markdown: path.endsWith(".md"),
      lineNumbers: deck.settings.data.appearance.lineNumbers,
      tabSize: deck.settings.data.editor.tabSize,
      placeholder: "empty note — start typing",
    });
    this.editor.onChange = () => this.scheduleSave();
    void this.load();
    // Reload if something else (the AI, a command) rewrote this file and we have no local edits.
    const offChanged = deck.vault.events.on("changed", ({ path: p }) => {
      if (p === this.path && !this.dirty() && !this.saving) void this.load(true);
    });
    // Changed outside the deck (Obsidian, iCloud, an editor, git): the vault's watcher rescans.
    // No edits here → the note reloads; edits here → nothing is overwritten, you choose.
    const offRescan = deck.vault.events.on("rescanned", () => void this.checkDisk());
    this.unsubscribe = () => (offChanged(), offRescan());
  }

  /** What's on disk now, if it differs from what this note last loaded or saved (null: same, or gone). */
  private async diskChange(): Promise<string | null> {
    if (!this.loaded || this.saving) return null;
    const disk = (await this.deck.vault.exists(this.path)) ? await this.deck.vault.read(this.path).catch(() => null) : null;
    // compared as the editor holds it: a "\r\n" file is the same text, not a change on disk
    return disk !== null && toLf(disk) !== this.saved ? disk : null;
  }

  private async checkDisk(): Promise<void> {
    const disk = await this.diskChange();
    if (disk === null) return;
    if (!this.dirty()) return void this.load(true);
    if (!this.conflict) this.deck.notify(t("{0} changed on disk: your edits are kept, choose in its toolbar").replace("{0}", basename(this.path)), "warning");
    this.conflict = true;
    this.deck.requestFrame();
  }

  /** Take the version on disk (your edits here go; ⌘Z in the note brings them back). */
  private async takeDisk(): Promise<void> {
    this.conflict = false;
    clearTimeout(this.saveTimer);
    const raw = (await this.deck.vault.exists(this.path)) ? await this.deck.vault.read(this.path).catch(() => null) : null;
    if (raw !== null) this.eol = lineEnding(raw);
    const text = raw === null ? this.saved : toLf(raw);
    this.editor.replaceAll(text);
    this.saved = text;
    this.deck.requestFrame();
  }

  /** Keep yours: written over the version on disk. */
  private async keepMine(): Promise<void> {
    this.conflict = false;
    const raw = await this.deck.vault.read(this.path).catch(() => null);
    if (raw !== null) this.saved = toLf(raw);
    await this.save();
  }

  private async load(keepCursor = false): Promise<void> {
    try {
      const raw = (await this.deck.vault.exists(this.path)) ? await this.deck.vault.read(this.path) : (this.loaded ? "" : (this.draft ?? ""));
      this.eol = lineEnding(raw);
      const text = toLf(raw);
      if (keepCursor && text === this.editor.text) return void (this.saved = text);
      const cursor = this.editor.cursor;
      this.editor.setText(text);
      if (keepCursor) {
        const line = Math.min(cursor.line, this.editor.lines.length - 1);
        this.editor.cursor = { line, col: Math.min(cursor.col, this.editor.lines[line]?.length ?? 0) };
      }
      if (!this.loaded) this.onLoaded?.(this.editor);
      // cosmetic changes made by onLoaded (an empty "- " line) don't count as edits
      this.saved = this.editor.text;
      this.loaded = true;
      this.deck.requestFrame();
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
    }
  }

  /**
   * The file was renamed or moved (the tree, `mv`, ⌘Z of one): the tab follows it — its title,
   * and where the next save goes (never back to the old name, which would bring the file back).
   */
  moveTo(path: string): void {
    this.path = path;
    this.key = `note:${path}`;
    this.deck.requestFrame();
  }

  title(): string {
    return basename(this.path, ".md");
  }

  dirty(): boolean {
    return this.loaded && this.editor.text !== this.saved;
  }

  status(): string {
    const { line, col } = this.editor.cursor;
    const state = this.error ? `✖ ${this.error}` : t(this.conflict ? "⚠ changed on disk" : this.saving ? "saving…" : this.dirty() ? "● modified" : "✓ saved");
    return `${this.path} · ${t("ln {l}, col {c} · {n} words", { l: line + 1, c: col + 1, n: this.editor.wordCount() })} · ${state}`;
  }

  private scheduleSave(): void {
    if (!this.deck.settings.data.editor.autosave) return;
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => void this.save({ auto: true }), 800);
  }

  /**
   * Saves the note. `auto` (the timer while typing): a note that was emptied (select all, delete)
   * is not written — it was saved empty in under a second and the text was lost. It is written
   * by ⌘S, by closing the tab, or 30 s later, and the text it had goes to the trash first.
   */
  async save(opts: { auto?: boolean } = {}): Promise<void> {
    if (!this.dirty() || this.conflict) return;
    clearTimeout(this.saveTimer);
    // a day's template you emptied before it was ever written: nothing to write, nothing to keep
    if (this.draft !== undefined && this.editor.text.trim() === "" && !(await this.deck.vault.exists(this.path))) return void (this.saved = this.editor.text);
    if (emptiedNote(this.editor.text, this.saved)) {
      if (opts.auto) {
        this.saveTimer = setTimeout(() => void this.save(), NoteApp.EMPTY_SAVE_MS);
        return;
      }
      await this.keepBeforeEmptying();
    }
    // never write over a change made outside the deck since we read the file
    if ((await this.diskChange()) !== null) return void this.checkDisk();
    this.saving = true;
    const text = this.editor.text;
    try {
      await this.deck.vault.write(this.path, withEol(text, this.eol));
      this.saved = text;
      this.error = "";
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
      this.deck.notify(`save failed: ${this.error}`, "error");
    } finally {
      this.saving = false;
      this.deck.requestFrame();
    }
  }

  /** how long an emptied note waits before it is written empty */
  static EMPTY_SAVE_MS = 30_000;

  /** The text an emptied note had, into the trash (TRASH or ⌘Z bring it back). */
  private async keepBeforeEmptying(): Promise<void> {
    const dir = dirname(this.path);
    const copy = join(dir === "." ? "" : dir, `${basename(this.path, ".md")} (before emptying).md`);
    try {
      await this.deck.vault.write(copy, this.saved);
      await this.deck.vault.trash(copy);
      this.deck.notify(t("the text it had is in the trash"), "info");
    } catch {
      /* the copy is a safety net: the save goes on */
    }
  }

  async close(): Promise<boolean> {
    await this.save();
    // still not written (changed on disk, a failed save): the tab doesn't take your edits with it
    if (this.dirty()) {
      const lose = await this.deck.confirm(
        t("close {0} without saving?").replace("{0}", basename(this.path)),
        t(this.conflict ? "it changed on disk: « keep mine » writes yours, « take the disk's » takes the other" : "it could not be saved: your edits here would be lost"),
        false,
      );
      if (!lose) return false;
    }
    clearTimeout(this.saveTimer);
    this.unsubscribe();
    return true;
  }

  /**
   * The file went to the trash (`dest`): the tab goes without writing the note back
   * where it was. Edits not saved yet go into the trashed copy, so ⌘Z (or the TRASH
   * page) brings the note back with them.
   */
  async discard(dest: string): Promise<void> {
    clearTimeout(this.saveTimer);
    this.unsubscribe();
    // (a plain write: nothing to ⌘Z — and never history.quiet here, it would also swallow the
    // trash's own step being recorded at this very moment)
    if (this.dirty()) await this.deck.vault.write(dest, this.editor.text).catch(() => {});
  }

  /** Open the [[wikilink]] or [text](path) under the cursor. */
  private followLink(): boolean {
    const { line, col } = this.editor.cursor;
    const target = linkAt(this.editor.lines[line], col);
    if (!target || /^https?:/.test(target)) return false;
    let path = target.endsWith(".md") ? target : `${target}.md`;
    // [[name]] can refer to a note anywhere: prefer an exact path, else match by file name
    if (!this.deck.vault.find(path)) {
      const byName = this.deck.vault.markdown().find((e) => basename(e.path) === basename(path));
      path = byName ? byName.path : target.includes("/") ? path : join(dirname(this.path), path);
    }
    void this.deck.openFile(path);
    return true;
  }

  /** Right-click in the note: edit, links, the note itself. */
  menu(): MenuEntry[] {
    const d = this.deck;
    const ed = this.editor;
    const hasSel = !!ed.selection();
    const { line, col } = ed.cursor;
    const link = linkAt(ed.lines[line] ?? "", col);
    const pinned = (d.settings.data.favorites ?? []).some((f) => f.target === this.path);
    const m = editMenu(d.workspace);
    for (const e of m) if (e !== "-" && (e.label === t("copy") || e.label === t("cut"))) e.disabled = !hasSel;
    return [
      ...m,
      "-",
      { label: t("Undo"), run: () => ed.undo(), hint: "⌘Z" },
      { label: t("Redo"), run: () => ed.redo(), hint: "⇧⌘Z" },
      ...(link ? ["-" as const, { label: /^https?:/.test(link) ? t("Copy link") : t("Follow link"), run: () => (/^https?:/.test(link) ? copyToClipboard(link) : void this.followLink()), hint: "⌘⏎" }] : []),
      "-",
      { label: t("Save"), cmd: "save", hint: "⌘S", disabled: !this.dirty() },
      { label: pinned ? t("Unpin") : t("Pin"), cmd: `${pinned ? "unpin" : "pin"} ${q(this.path)}` },
      { label: t("Reveal in tree"), cmd: `tree reveal ${q(this.path)}` },
      { label: t("Copy path"), cmd: `copy path ${q(this.path)}` },
      ...(this.path.endsWith(".md") ? [{ label: t("Copy link"), tip: t("a [[link]] to paste in a note"), cmd: `copy link ${q(this.path)}` }] : []),
    ];
  }

  onKey(k: KeyInput): boolean {
    if (k.combo === "ctrl+s") {
      void this.save().then(() => this.deck.notify(`saved ${this.path}`, "success"));
      return true;
    }
    // ⌘⇧S: save as (File → Save As in the macOS menu bar says so)
    if (k.combo === "ctrl+shift+s") return void this.saveAs(), true;
    if (k.combo === "ctrl+enter") return this.followLink();
    return this.editor.onKey(k);
  }

  onText(t: string): boolean {
    return this.editor.onText(t);
  }

  onAction(a: Action): boolean {
    // gamepad: scroll the note
    if (a === "scroll-up") this.editor.scroll(-3);
    else if (a === "scroll-down") this.editor.scroll(3);
    else return false;
    return true;
  }

  /** Save under another name: the copy opens, this note stays as it was saved. */
  async saveAs(given?: string): Promise<string | null> {
    const to = given ?? (await this.deck.prompt(t("Save as"), { initial: this.path, placeholder: "notes/new name.md", suggestions: folders(this.deck).map((f) => `${f}/${basename(this.path)}`) }));
    if (!to?.trim() || to.trim() === this.path) return null;
    const path = to.trim().endsWith(".md") || /\.[a-z0-9]+$/i.test(to.trim()) ? to.trim() : `${to.trim()}.md`;
    if (await this.deck.vault.exists(path)) return void this.deck.notify(t("{path} already exists", { path }), "error"), null;
    await this.deck.vault.write(path, this.editor.text);
    this.deck.vault.recordCreated(path);
    await this.deck.openFile(path);
    return path;
  }

  /** the note's file (the `save`, `copy path` commands) */
  get file(): string {
    return this.path;
  }

  /** The note before / after this one in its folder (by name). */
  private sibling(dir: 1 | -1): void {
    const folder = dirname(this.path);
    const notes = this.deck.vault.markdown().map((e) => e.path).filter((p) => dirname(p) === folder).sort((a, b) => a.localeCompare(b));
    const i = notes.indexOf(this.path);
    if (notes.length < 2 || i < 0) return;
    void this.deck.openFile(notes[(i + dir + notes.length) % notes.length]);
  }

  /** The toolbar above the note: the basic tools, always in view. */
  /** The toolbar's row: a blank line above it (under the frame's title) and one below it (before your text). */
  private toolbar(ui: UI, frame: Rect): void {
    const c = ui.c;
    const r = { ...frame, x: frame.x + 1, y: frame.y + 1, w: frame.w - 2 };
    ui.fill({ x: r.x, y: r.y, w: r.w, h: 1 }, { bg: c.panelAlt });
    let x = r.x + 1;
    const dirty = this.dirty();
    if (this.conflict) {
      // changed on disk while you were editing: choose, nothing is saved until then
      // the two choices first, on the left: a toast (top right) never covers them
      x += ui.button(x, r.y, t("Keep mine"), () => void this.keepMine(), { tip: t("yours is written over the version on disk"), accent: c.error }) + 1;
      x += ui.button(x, r.y, t("Take the disk's"), () => void this.takeDisk(), { tip: t("the version on disk replaces yours here (⌘Z brings yours back)") }) + 1;
      ui.text(x, r.y, ` ${t("changed on disk")} `, { fg: c.panel, bg: c.warning, raw: true });
      return;
    }
    const tool = (label: string, run: () => void, tip: string, o: { accent?: number; off?: boolean } = {}) => {
      if (x + strWidth(label) + 2 > r.x + r.w) return;
      if (o.off) {
        x = ui.text(x, r.y, ` ${label} `, { fg: c.subtle, bg: c.panelAlt, raw: true }) + 1;
        return;
      }
      x += ui.button(x, r.y, label, run, { tip, accent: o.accent }) + 1;
    };
    const mod = IS_MAC ? "⌘" : "ctrl+";
    tool(dirty ? `● ${t("Save")}` : `✓ ${t("Saved")}`, () => void this.save().then(() => this.deck.notify(`saved ${this.path}`, "success")), `${mod}S`, { accent: dirty ? c.error : undefined, off: !dirty });
    tool(t("Save as…"), () => void this.saveAs(), t("a copy under another name"));
    tool(`+ ${t("New")}`, () => void this.deck.newNote(dirname(this.path) || "notes"), `${mod}N`);
    x += 1;
    tool("◂", () => this.sibling(-1), t("the note before, in this folder"));
    tool("▸", () => this.sibling(1), t("the note after, in this folder"));
    x += 1;
    tool("↶", () => this.editor.undo(), `${t("Undo")} · ${mod}Z`);
    tool("↷", () => this.editor.redo(), `${t("Redo")} · ${IS_MAC ? "⇧⌘Z" : "ctrl+shift+Z"}`);
  }

  render(ui: UI, r: Rect, focused: boolean): void {
    if (this.error && !this.loaded) {
      ui.textCenter(r, r.y + 2, `✖ ${this.error}`, { fg: ui.c.error });
      return;
    }
    this.toolbar(ui, r);
    r = { ...r, y: r.y + 3, h: r.h - 3 };
    this.editor.render(ui, { x: r.x + 2, y: r.y, w: r.w - 3, h: r.h }, focused);
    // ctrl+click follows links
    ui.hit(r, {
      onClick: (m) => {
        const p = this.editor.posAt(m.x, m.y);
        this.editor.cursor = p;
        this.editor.anchor = null;
        if (m.ctrl) this.followLink();
      },
      onDrag: (m) => {
        this.editor.anchor ??= { ...this.editor.cursor };
        this.editor.cursor = this.editor.posAt(m.x, m.y);
      },
      // shift + wheel: one line at a time (to read closely)
      onWheel: (d, m) => this.editor.scroll(m.shift ? Math.sign(d) : d),
      // right-click: the cursor goes there (unless it's inside the selection), then the menu
      menu: (m) => {
        if (m && !this.editor.selection()) {
          this.editor.cursor = this.editor.posAt(m.x, m.y);
          this.editor.anchor = null;
        }
        return this.menu();
      },
    });
  }
}

export const noteSpec: AppSpec = {
  kind: "note",
  title: "Note",
  create: (deck, args) => new NoteApp(deck, String(args)),
};

/** A note that had text and now has none (written only on purpose, never by the autosave). */
export function emptiedNote(text: string, saved: string): boolean {
  return text.trim() === "" && saved.trim() !== "";
}

/** "\r\n" when the file's lines end so (a note written on Windows), else "\n". */
export function lineEnding(raw: string): "\n" | "\r\n" {
  return raw.includes("\r\n") ? "\r\n" : "\n";
}

/** The text as the editor holds it: every line end is "\n". */
export function toLf(raw: string): string {
  return raw.replace(/\r\n?/g, "\n");
}

/** The editor's text with the file's line ends, to write it back. */
export function withEol(text: string, eol: "\n" | "\r\n"): string {
  return eol === "\n" ? text : text.replace(/\n/g, "\r\n");
}
