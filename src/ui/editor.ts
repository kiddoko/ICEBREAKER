import { copyToClipboard } from "../core/clipboard";
import { BOLD, DIM, type Rect, type Style } from "../core/grid";
import { IS_MAC, type KeyInput } from "../core/input";
import { charWidth, strWidth } from "../core/unicode";
import { highlightLine, initialMdState, type MdState } from "./markdown";
import type { UI } from "./ui";

/**
 * Multi-line text editor widget, used for notes, the journal, chat input,
 * prompts and settings fields.
 *
 *  - soft wrap (long lines flow onto several screen rows)
 *  - selection with shift+arrows or mouse drag, copy/cut/paste, undo/redo
 *  - Markdown highlighting, list continuation on Enter
 *
 * Positions are { line, col } where col is an index into the JS string
 * (UTF-16), always kept on a code-point boundary.
 */

export interface EditorOptions {
  markdown?: boolean;
  wrap?: boolean;
  lineNumbers?: boolean;
  /** One line only; Enter calls onSubmit. */
  singleLine?: boolean;
  /** Multi-line, but Enter submits (Shift+Enter inserts a newline). Chat style. */
  submitOnEnter?: boolean;
  readOnly?: boolean;
  placeholder?: string;
  /** Show • instead of characters (API keys). */
  mask?: boolean;
  tabSize?: number;
}

export interface Pos {
  line: number;
  col: number;
}

interface Seg {
  start: number;
  end: number;
}

interface Snapshot {
  lines: string[];
  cursor: Pos;
}

const cmp = (a: Pos, b: Pos) => a.line - b.line || a.col - b.col;
const isWordChar = (ch: string) => /[\p{L}\p{N}_]/u.test(ch);

export class TextEditor {
  lines: string[] = [""];
  cursor: Pos = { line: 0, col: 0 };
  /** Other end of the selection, or null when nothing is selected. */
  anchor: Pos | null = null;
  /** Bumped on every content change (cheap "did it change?" check). */
  version = 0;
  /** Last time the user typed/moved — keeps the cursor solid while active. */
  lastInputAt = 0;
  onChange?: () => void;
  onSubmit?: (text: string) => void;
  opts: Required<EditorOptions>;

  private goalX: number | null = null;
  private top = { line: 0, seg: 0 };
  private wrapCache: (Seg[] | undefined)[] = [];
  private wrapWidth = -1;
  private md: MdState[] = [];
  private mdVersion = -1;
  private undoStack: Snapshot[] = [];
  private redoStack: Snapshot[] = [];
  private lastEdit = { kind: "", at: 0 };
  private wantScroll = true;
  private viewH = 1;
  private rowMap: { line: number; seg: number }[] = [];
  private textX = 0;
  private textY = 0;

  constructor(text = "", opts: EditorOptions = {}) {
    this.opts = {
      markdown: false, wrap: true, lineNumbers: false, singleLine: false, submitOnEnter: false,
      readOnly: false, placeholder: "", mask: false, tabSize: 2, ...opts,
    };
    this.setText(text);
  }

  // ── content ──────────────────────────────────────────────────────────────

  /** the whole text and its word count, kept until the next change: the status bar and the
   *  "unsaved" dot ask for them every frame — on a 3 MB note that was 400 ms a frame */
  private textAt = -1;
  private textIs = "";
  private wordsAt = -1;
  private wordsAre = 0;

  get text(): string {
    if (this.textAt !== this.version) {
      this.textIs = this.lines.join("\n");
      this.textAt = this.version;
    }
    return this.textIs;
  }

  /** Replace everything (resets undo history). */
  setText(text: string, cursorAtEnd = false): void {
    this.lines = text.replace(/\r\n?/g, "\n").split("\n");
    if (this.opts.singleLine) this.lines = [this.lines.join(" ")];
    this.wrapCache = [];
    this.undoStack = [];
    this.redoStack = [];
    this.anchor = null;
    this.cursor = cursorAtEnd ? { line: this.lines.length - 1, col: this.lines[this.lines.length - 1].length } : { line: 0, col: 0 };
    this.top = { line: 0, seg: 0 };
    this.version++;
    this.wantScroll = true;
  }

  /** Replace everything as one edit you can undo (the cursor stays about where it was). */
  replaceAll(text: string): void {
    this.checkpoint("paste");
    const at = this.cursor;
    this.lines = text.replace(/\r\n?/g, "\n").split("\n");
    const line = Math.min(at.line, this.lines.length - 1);
    this.cursor = { line, col: Math.min(at.col, this.lines[line].length) };
    this.anchor = null;
    this.changed(0, false);
  }

  get isEmpty(): boolean {
    return this.lines.length === 1 && this.lines[0] === "";
  }

  wordCount(): number {
    if (this.wordsAt !== this.version) {
      this.wordsAre = (this.text.match(/[\p{L}\p{N}][\p{L}\p{N}'’_-]*/gu) ?? []).length;
      this.wordsAt = this.version;
    }
    return this.wordsAre;
  }

  selection(): [Pos, Pos] | null {
    if (!this.anchor || cmp(this.anchor, this.cursor) === 0) return null;
    return cmp(this.anchor, this.cursor) < 0 ? [this.anchor, this.cursor] : [this.cursor, this.anchor];
  }

  selectedText(): string {
    const sel = this.selection();
    if (!sel) return "";
    const [a, b] = sel;
    if (a.line === b.line) return this.lines[a.line].slice(a.col, b.col);
    return [this.lines[a.line].slice(a.col), ...this.lines.slice(a.line + 1, b.line), this.lines[b.line].slice(0, b.col)].join("\n");
  }

  /** Insert text at the cursor (replacing the selection). */
  insert(text: string): void {
    if (this.opts.readOnly) return;
    if (this.opts.singleLine) text = text.replace(/\n/g, " ");
    this.checkpoint(text.includes("\n") || text.length > 1 ? "paste" : "type");
    this.deleteSelection();
    const { line, col } = this.cursor;
    const cur = this.lines[line];
    const parts = text.split("\n");
    const before = cur.slice(0, col);
    const after = cur.slice(col);
    if (parts.length === 1) {
      this.lines[line] = before + text + after;
      this.cursor = { line, col: col + text.length };
    } else {
      const middle = parts.slice(1, -1);
      const last = parts[parts.length - 1];
      this.lines.splice(line, 1, before + parts[0], ...middle, last + after);
      this.cursor = { line: line + parts.length - 1, col: last.length };
    }
    this.changed(line);
  }

  // ── undo ─────────────────────────────────────────────────────────────────

  /** Save state before an edit; consecutive edits of the same kind merge into one undo step. */
  private checkpoint(kind: string): void {
    const now = performance.now();
    if (kind !== this.lastEdit.kind || now - this.lastEdit.at > 1200 || kind === "paste") {
      this.undoStack.push({ lines: [...this.lines], cursor: { ...this.cursor } });
      if (this.undoStack.length > 300) this.undoStack.shift();
      this.redoStack = [];
    }
    this.lastEdit = { kind, at: now };
  }

  undo(): void {
    const s = this.undoStack.pop();
    if (!s) return;
    this.redoStack.push({ lines: [...this.lines], cursor: { ...this.cursor } });
    this.restore(s);
  }

  redo(): void {
    const s = this.redoStack.pop();
    if (!s) return;
    this.undoStack.push({ lines: [...this.lines], cursor: { ...this.cursor } });
    this.restore(s);
  }

  private restore(s: Snapshot): void {
    this.lines = [...s.lines];
    this.cursor = { ...s.cursor };
    this.anchor = null;
    this.lastEdit = { kind: "", at: 0 };
    this.wrapCache = [];
    this.changed(0, false);
  }

  private changed(fromLine: number, invalidateOnlyFrom = true): void {
    if (invalidateOnlyFrom) this.wrapCache.splice(fromLine);
    else this.wrapCache = [];
    this.version++;
    this.goalX = null;
    this.wantScroll = true;
    this.lastInputAt = performance.now();
    this.onChange?.();
  }

  // ── editing primitives ──────────────────────────────────────────────────

  private deleteSelection(): boolean {
    const sel = this.selection();
    this.anchor = null;
    if (!sel) return false;
    const [a, b] = sel;
    this.lines.splice(a.line, b.line - a.line + 1, this.lines[a.line].slice(0, a.col) + this.lines[b.line].slice(b.col));
    this.cursor = { ...a };
    this.changed(a.line);
    return true;
  }

  private deleteRange(a: Pos, b: Pos): void {
    this.anchor = a;
    this.cursor = b;
    this.deleteSelection();
  }

  private prevPos(p: Pos, word: boolean): Pos {
    if (p.col === 0) return p.line > 0 ? { line: p.line - 1, col: this.lines[p.line - 1].length } : p;
    const s = this.lines[p.line];
    let col = stepBack(s, p.col);
    if (word) {
      while (col > 0 && !isWordChar(s[col])) col = stepBack(s, col);
      while (col > 0 && isWordChar(s[stepBack(s, col)])) col = stepBack(s, col);
    }
    return { line: p.line, col };
  }

  private nextPos(p: Pos, word: boolean): Pos {
    const s = this.lines[p.line];
    if (p.col >= s.length) return p.line < this.lines.length - 1 ? { line: p.line + 1, col: 0 } : p;
    let col = stepFwd(s, p.col);
    if (word) {
      while (col < s.length && !isWordChar(s[col])) col = stepFwd(s, col);
      while (col < s.length && isWordChar(s[col])) col = stepFwd(s, col);
    }
    return { line: p.line, col };
  }

  private moveTo(p: Pos, select: boolean, keepGoal = false): void {
    if (select) this.anchor ??= { ...this.cursor };
    else this.anchor = null;
    this.cursor = p;
    if (!keepGoal) this.goalX = null;
    this.wantScroll = true;
    this.lastInputAt = performance.now();
  }

  /** Enter: newline that continues lists ("- ", "1. ", "- [ ] "), or ends an empty item. */
  private newline(): void {
    const line = this.lines[this.cursor.line];
    const m = line.match(/^(\s*)([-*+] \[[ xX]\] |[-*+] |(\d+)([.)]) |> )/);
    if (m && this.cursor.col >= m[0].length) {
      if (line.trim() === m[0].trim()) {
        // empty list item: remove the marker instead of continuing
        this.checkpoint("newline");
        this.lines[this.cursor.line] = "";
        this.cursor = { line: this.cursor.line, col: 0 };
        this.changed(this.cursor.line);
        return;
      }
      let marker = m[2];
      if (m[3]) marker = `${Number(m[3]) + 1}${m[4]} `;
      marker = marker.replace(/\[[xX]\]/, "[ ]");
      this.checkpoint("newline");
      this.insert("\n" + m[1] + marker);
      return;
    }
    const indent = line.match(/^\s*/)![0];
    this.checkpoint("newline");
    this.insert("\n" + indent.slice(0, this.cursor.col));
  }

  // ── wrapping & visual rows ──────────────────────────────────────────────

  private segs(line: number): Seg[] {
    let s = this.wrapCache[line];
    if (!s) {
      s = wrapLine(this.lines[line], this.opts.wrap ? this.wrapWidth : Infinity);
      this.wrapCache[line] = s;
    }
    return s;
  }

  private segIndex(p: Pos): number {
    const segs = this.segs(p.line);
    for (let i = 0; i < segs.length; i++) if (p.col < segs[i].end || i === segs.length - 1) return i;
    return 0;
  }

  /** Visual x of a position inside its segment. */
  private xOf(p: Pos): number {
    const seg = this.segs(p.line)[this.segIndex(p)];
    return strWidth(this.lines[p.line].slice(seg.start, p.col));
  }

  private colAtX(line: number, segI: number, x: number): number {
    const seg = this.segs(line)[segI];
    const s = this.lines[line];
    let w = 0;
    let i = seg.start;
    const isLast = segI === this.segs(line).length - 1;
    while (i < seg.end) {
      const cw = charWidth(s.codePointAt(i)!);
      if (w + cw > x) break; // this character covers column x
      w += cw;
      i = stepFwd(s, i);
    }
    // never park the cursor *after* the last char of a wrapped (non-final) row
    if (!isLast && i >= seg.end) i = stepBack(s, seg.end);
    return i;
  }

  private nextRow(r: { line: number; seg: number }, dir: 1 | -1): { line: number; seg: number } | null {
    if (dir === 1) {
      if (r.seg + 1 < this.segs(r.line).length) return { line: r.line, seg: r.seg + 1 };
      return r.line + 1 < this.lines.length ? { line: r.line + 1, seg: 0 } : null;
    }
    if (r.seg > 0) return { line: r.line, seg: r.seg - 1 };
    return r.line > 0 ? { line: r.line - 1, seg: this.segs(r.line - 1).length - 1 } : null;
  }

  private moveVertical(rows: number, select: boolean): void {
    this.goalX ??= this.xOf(this.cursor);
    let r = { line: this.cursor.line, seg: this.segIndex(this.cursor) };
    const dir = rows > 0 ? 1 : -1;
    for (let i = 0; i < Math.abs(rows); i++) {
      const n = this.nextRow(r, dir);
      if (!n) {
        // past the edge: go to start/end of the document like most editors
        if (i === 0) this.moveTo(dir > 0 ? this.endPos() : { line: 0, col: 0 }, select);
        else break;
        return;
      }
      r = n;
    }
    this.moveTo({ line: r.line, col: this.colAtX(r.line, r.seg, this.goalX) }, select, true);
  }

  private endPos(): Pos {
    const line = this.lines.length - 1;
    return { line, col: this.lines[line].length };
  }

  scroll(rows: number): void {
    for (let i = 0; i < Math.abs(rows); i++) {
      const n = this.nextRow(this.top, rows > 0 ? 1 : -1);
      if (!n) break;
      this.top = n;
    }
  }

  private ensureCursorVisible(): void {
    const cur = { line: this.cursor.line, seg: this.segIndex(this.cursor) };
    const before = cur.line < this.top.line || (cur.line === this.top.line && cur.seg < this.top.seg);
    if (before) {
      this.top = cur;
      return;
    }
    let r = { ...this.top };
    let rows = 0;
    while (r.line !== cur.line || r.seg !== cur.seg) {
      const n = this.nextRow(r, 1);
      if (!n) break;
      r = n;
      if (++rows >= this.viewH) break;
    }
    if (rows >= this.viewH) {
      let t = cur;
      for (let i = 0; i < this.viewH - 1; i++) t = this.nextRow(t, -1) ?? t;
      this.top = t;
    }
  }

  // ── input ────────────────────────────────────────────────────────────────

  onText(t: string): boolean {
    if (this.opts.readOnly) return false;
    this.insert(t);
    return true;
  }

  onKey(k: KeyInput): boolean {
    // macOS conventions: ⌘←/→ = line start/end, ⌘↑/↓ = document start/end, ⌥ = word jumps.
    if (IS_MAC && k.ctrl && !k.alt && ["left", "right", "up", "down"].includes(k.key)) {
      const key = k.key === "left" ? "home" : k.key === "right" ? "end" : k.key;
      const docJump = k.key === "up" || k.key === "down";
      return this.onKey({ ...k, key: docJump ? (k.key === "up" ? "home" : "end") : key, ctrl: docJump, combo: key });
    }
    const sel = k.shift;
    const word = IS_MAC ? k.alt : k.ctrl || k.alt;
    switch (k.key) {
      case "left":
        if (!sel && this.selection()) this.moveTo(this.selection()![0], false);
        else this.moveTo(this.prevPos(this.cursor, word), sel);
        return true;
      case "right":
        if (!sel && this.selection()) this.moveTo(this.selection()![1], false);
        else this.moveTo(this.nextPos(this.cursor, word), sel);
        return true;
      case "up":
        if (this.opts.singleLine) return false;
        if (k.ctrl) this.scroll(-1);
        else this.moveVertical(-1, sel);
        return true;
      case "down":
        if (this.opts.singleLine) return false;
        if (k.ctrl) this.scroll(1);
        else this.moveVertical(1, sel);
        return true;
      case "home":
        this.moveTo(k.ctrl ? { line: 0, col: 0 } : { line: this.cursor.line, col: this.homeCol() }, sel);
        return true;
      case "end":
        this.moveTo(k.ctrl ? this.endPos() : { line: this.cursor.line, col: this.lines[this.cursor.line].length }, sel);
        return true;
      case "pageup":
        if (this.opts.singleLine) return false;
        this.moveVertical(-Math.max(1, this.viewH - 2), sel);
        return true;
      case "pagedown":
        if (this.opts.singleLine) return false;
        this.moveVertical(Math.max(1, this.viewH - 2), sel);
        return true;
      case "esc":
        if (this.selection()) {
          this.anchor = null;
          return true;
        }
        return false;
    }

    if (k.ctrl && !k.alt) {
      switch (k.key) {
        case "a":
          this.anchor = { line: 0, col: 0 };
          this.cursor = this.endPos();
          return true;
        case "c":
          if (this.selection()) copyToClipboard(this.selectedText());
          else if (!this.opts.singleLine) copyToClipboard(this.lines[this.cursor.line] + "\n");
          return true;
        case "x":
          if (this.opts.readOnly) return true;
          if (this.selection()) {
            copyToClipboard(this.selectedText());
            this.checkpoint("cut");
            this.deleteSelection();
          }
          return true;
        case "z":
          if (k.shift) this.redo();
          else this.undo();
          return true;
        case "y":
          this.redo();
          return true;
      }
    }

    if (this.opts.readOnly) return false;
    switch (k.key) {
      case "backspace":
        this.checkpoint("delete");
        if (!this.deleteSelection()) this.deleteRange(this.prevPos(this.cursor, word), this.cursor);
        return true;
      case "delete":
        this.checkpoint("delete");
        if (!this.deleteSelection()) this.deleteRange(this.cursor, this.nextPos(this.cursor, word));
        return true;
      case "enter":
        if (this.opts.singleLine || (this.opts.submitOnEnter && !k.shift && !k.ctrl)) {
          this.onSubmit?.(this.text);
          return true;
        }
        if (k.ctrl) return false; // ctrl+enter is for the app (follow link…)
        this.newline();
        return true;
      case "tab":
        if (this.opts.singleLine) return false;
        if (k.shift) {
          // nothing to unindent: let shift+tab move to the next pane
          const s = this.lines[this.cursor.line];
          if (s.length === s.trimStart().length) return false;
          this.outdent();
        } else this.insert(" ".repeat(this.opts.tabSize));
        return true;
    }
    return false;
  }

  /** Home goes to the first non-space character, then to column 0. */
  private homeCol(): number {
    const s = this.lines[this.cursor.line];
    const first = s.length - s.trimStart().length;
    return this.cursor.col === first ? 0 : first;
  }

  private outdent(): void {
    const s = this.lines[this.cursor.line];
    const n = Math.min(this.opts.tabSize, s.length - s.trimStart().length);
    if (!n) return;
    this.checkpoint("outdent");
    this.lines[this.cursor.line] = s.slice(n);
    this.cursor = { line: this.cursor.line, col: Math.max(0, this.cursor.col - n) };
    this.changed(this.cursor.line);
  }

  /** Mouse: screen cell → document position. */
  posAt(x: number, y: number): Pos {
    const row = Math.max(0, Math.min(this.rowMap.length - 1, y - this.textY));
    const r = this.rowMap[row];
    if (!r) return this.endPos();
    return { line: r.line, col: this.colAtX(r.line, r.seg, Math.max(0, x - this.textX)) };
  }

  private selectWordAt(p: Pos): void {
    const s = this.lines[p.line];
    let a = p.col;
    let b = p.col;
    while (a > 0 && isWordChar(s[a - 1])) a--;
    while (b < s.length && isWordChar(s[b])) b++;
    this.anchor = { line: p.line, col: a };
    this.cursor = { line: p.line, col: b };
  }

  // ── drawing ──────────────────────────────────────────────────────────────

  render(ui: UI, r: Rect, focused: boolean): void {
    if (r.w <= 0 || r.h <= 0) return;
    const t = ui.theme;
    const gutter = this.opts.lineNumbers ? Math.max(3, String(this.lines.length).length) + 2 : 0;
    const textW = Math.max(1, r.w - gutter - 1);
    if (textW !== this.wrapWidth) {
      this.wrapWidth = textW;
      this.wrapCache = [];
    }
    this.viewH = r.h;
    this.textX = r.x + gutter;
    this.textY = r.y;
    if (this.wantScroll) {
      this.ensureCursorVisible();
      this.wantScroll = false;
    }
    if (this.top.line >= this.lines.length) this.top = { line: this.lines.length - 1, seg: 0 };
    if (this.top.seg >= this.segs(this.top.line).length) this.top.seg = 0;

    if (this.opts.markdown && this.mdVersion !== this.version) {
      this.md = [];
      let st = initialMdState();
      for (const line of this.lines) {
        this.md.push(st);
        st = highlightLine(line, st, t).next;
      }
      this.mdVersion = this.version;
    }

    const sel = this.selection();
    this.rowMap = [];
    let row: { line: number; seg: number } | null = { ...this.top };
    let lastLine = -1;
    let hl: (Style | undefined)[] = [];

    for (let y = r.y; y < r.y + r.h; y++) {
      if (!row) {
        if (this.opts.lineNumbers) ui.text(r.x + gutter - 2, y, "~", { fg: t.c.faint });
        continue;
      }
      this.rowMap.push(row);
      const s = this.lines[row.line];
      const seg = this.segs(row.line)[row.seg];
      const isCursorLine = row.line === this.cursor.line;
      if (focused && isCursorLine && !sel && !this.opts.singleLine && !this.opts.readOnly) {
        ui.fill({ x: r.x, y, w: r.w - 1, h: 1 }, { bg: t.c.highlight });
      }
      if (this.opts.lineNumbers && row.seg === 0) {
        const num = String(row.line + 1).padStart(gutter - 2);
        ui.text(r.x, y, num, isCursorLine ? { fg: t.c.accent, attrs: BOLD } : { fg: t.c.faint });
      } else if (this.opts.lineNumbers) {
        ui.text(r.x + gutter - 2, y, "↪", { fg: t.c.faint, attrs: DIM });
      }

      if (this.opts.markdown && row.line !== lastLine) {
        hl = highlightLine(s, this.md[row.line] ?? initialMdState(), t).styles;
        lastLine = row.line;
      }

      let x = this.textX;
      for (let i = seg.start; i < seg.end; ) {
        const cp = s.codePointAt(i)!;
        const len = cp > 0xffff ? 2 : 1;
        const st = this.opts.markdown ? hl[i] : undefined;
        const selected = sel && cmp(sel[0], { line: row.line, col: i }) <= 0 && cmp({ line: row.line, col: i }, sel[1]) < 0;
        const ch = this.opts.mask ? "•" : cp === 9 ? " " : String.fromCodePoint(cp);
        x = ui.text(x, y, ch, { fg: st?.fg ?? t.c.fg, bg: selected ? t.c.selection : st?.bg, attrs: st?.attrs ?? 0 });
        i += len;
      }
      // selection that spans the line break
      if (sel && cmp(sel[0], { line: row.line, col: seg.end }) <= 0 && cmp({ line: row.line, col: seg.end }, sel[1]) < 0 && row.seg === this.segs(row.line).length - 1) {
        ui.text(x, y, " ", { bg: t.c.selection });
      }

      if (focused && isCursorLine && this.segIndex(this.cursor) === row.seg && !this.opts.readOnly) {
        const cx = this.textX + strWidth((this.opts.mask ? "•".repeat(this.cursor.col - seg.start) : s.slice(seg.start, this.cursor.col)));
        ui.cursor(Math.min(cx, r.x + r.w - 2), y, this.lastInputAt);
      }
      row = this.nextRow(row, 1);
    }

    if (this.isEmpty && this.opts.placeholder) {
      ui.text(this.textX + (focused ? 1 : 0), r.y, this.opts.placeholder, { fg: t.c.subtle, attrs: DIM }, textW - 1);
    }

    // scrollbar (only when the document is taller than the view)
    if (this.lines.length > r.h && !this.opts.singleLine) {
      const ratio = this.top.line / Math.max(1, this.lines.length - 1);
      const thumbH = Math.max(1, Math.round((r.h * r.h) / this.lines.length));
      const thumbY = r.y + Math.round(ratio * (r.h - thumbH));
      ui.vline(r.x + r.w - 1, r.y, r.h, { fg: t.c.faint }, "│");
      ui.vline(r.x + r.w - 1, thumbY, thumbH, { fg: focused ? t.c.accent : t.c.subtle }, "┃");
    }

    ui.hit(r, {
      onClick: (m) => {
        const p = this.posAt(m.x, m.y);
        if (m.shift) this.anchor ??= { ...this.cursor };
        else this.anchor = null;
        this.cursor = p;
        this.goalX = null;
        this.lastInputAt = performance.now();
      },
      onDrag: (m) => {
        this.anchor ??= { ...this.cursor };
        this.cursor = this.posAt(m.x, m.y);
        this.wantScroll = true;
      },
      onDouble: (m) => this.selectWordAt(this.posAt(m.x, m.y)),
      onWheel: (d) => this.scroll(d),
    });
  }
}

// ── helpers ──────────────────────────────────────────────────────────────

function stepFwd(s: string, i: number): number {
  const c = s.charCodeAt(i);
  return c >= 0xd800 && c <= 0xdbff ? i + 2 : i + 1;
}

function stepBack(s: string, i: number): number {
  if (i <= 0) return 0;
  const c = s.charCodeAt(i - 1);
  return c >= 0xdc00 && c <= 0xdfff && i >= 2 ? i - 2 : i - 1;
}

/** Split one logical line into screen rows of at most `width` cells, breaking after spaces when possible. */
export function wrapLine(s: string, width: number): Seg[] {
  if (!Number.isFinite(width) || strWidth(s) <= width) return [{ start: 0, end: s.length }];
  const segs: Seg[] = [];
  let start = 0;
  let w = 0;
  let lastSpace = -1;
  let i = 0;
  while (i < s.length) {
    const cw = charWidth(s.codePointAt(i)!);
    if (w + cw > width && i > start) {
      const brk = lastSpace >= start ? lastSpace + 1 : i;
      segs.push({ start, end: brk });
      start = brk;
      w = strWidth(s.slice(start, i));
      lastSpace = s.lastIndexOf(" ", i - 1);
      if (lastSpace < start) lastSpace = -1;
      continue;
    }
    if (s[i] === " ") lastSpace = i;
    w += cw;
    i = stepFwd(s, i);
  }
  segs.push({ start, end: s.length });
  return segs;
}

export { copyToClipboard };
