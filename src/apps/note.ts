import type { Rect } from "../core/grid";
import type { Action, KeyInput } from "../core/input";
import type { Deck } from "../deck";
import { TextEditor } from "../ui/editor";
import { linkAt } from "../ui/markdown";
import type { UI } from "../ui/ui";
import { basename, dirname, join } from "../vault/paths";
import type { App, AppSpec } from "./types";

/**
 * Markdown note editor. Autosaves ~0.8s after you stop typing (like
 * Obsidian), Ctrl+S saves immediately, Ctrl+Enter / Ctrl+click follows links.
 */
export class NoteApp implements App {
  readonly kind = "note";
  readonly key: string;
  readonly editor: TextEditor;
  private saved = "";
  private saving = false;
  private loaded = false;
  private error = "";
  private saveTimer: ReturnType<typeof setTimeout> | undefined;
  private unsubscribe: () => void;

  constructor(
    private readonly deck: Deck,
    readonly path: string,
    /** Called once the file content is in the editor (e.g. to place the cursor). */
    private readonly onLoaded?: (editor: TextEditor) => void,
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
    this.unsubscribe = deck.vault.events.on("changed", ({ path: p }) => {
      if (p === this.path && !this.dirty() && !this.saving) void this.load(true);
    });
  }

  private async load(keepCursor = false): Promise<void> {
    try {
      const text = (await this.deck.vault.exists(this.path)) ? await this.deck.vault.read(this.path) : "";
      if (keepCursor && text === this.editor.text) return;
      const cursor = this.editor.cursor;
      this.editor.setText(text);
      if (keepCursor) this.editor.cursor = { line: Math.min(cursor.line, this.editor.lines.length - 1), col: 0 };
      if (!this.loaded) this.onLoaded?.(this.editor);
      // cosmetic changes made by onLoaded (an empty "- " line) don't count as edits
      this.saved = this.editor.text;
      this.loaded = true;
      this.deck.requestFrame();
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
    }
  }

  title(): string {
    return basename(this.path, ".md");
  }

  dirty(): boolean {
    return this.loaded && this.editor.text !== this.saved;
  }

  status(): string {
    const { line, col } = this.editor.cursor;
    const state = this.error ? `✖ ${this.error}` : this.saving ? "saving…" : this.dirty() ? "● modified" : "✓ saved";
    return `${this.path} · ln ${line + 1}, col ${col + 1} · ${this.editor.wordCount()} words · ${state}`;
  }

  private scheduleSave(): void {
    if (!this.deck.settings.data.editor.autosave) return;
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => void this.save(), 800);
  }

  async save(): Promise<void> {
    if (!this.dirty()) return;
    clearTimeout(this.saveTimer);
    this.saving = true;
    const text = this.editor.text;
    try {
      await this.deck.vault.write(this.path, text);
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

  async close(): Promise<boolean> {
    await this.save();
    this.unsubscribe();
    return true;
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

  onKey(k: KeyInput): boolean {
    if (k.combo === "ctrl+s") {
      void this.save().then(() => this.deck.notify(`saved ${this.path}`, "success"));
      return true;
    }
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

  render(ui: UI, r: Rect, focused: boolean): void {
    if (this.error && !this.loaded) {
      ui.textCenter(r, r.y + 2, `✖ ${this.error}`, { fg: ui.c.error });
      return;
    }
    this.editor.render(ui, { x: r.x + 1, y: r.y, w: r.w - 1, h: r.h }, focused);
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
      onWheel: (d) => this.editor.scroll(d),
    });
  }
}

export const noteSpec: AppSpec = {
  kind: "note",
  title: "Note",
  create: (deck, args) => new NoteApp(deck, String(args)),
};
