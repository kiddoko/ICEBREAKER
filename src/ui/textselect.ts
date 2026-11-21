import type { Rect } from "../core/grid";
import type { MouseInput } from "../core/input";
import type { UI } from "./ui";

/**
 * Mouse selection over lines of text, for the two shells: ibsh (src/shell/shell.ts) and the
 * real terminal (src/shell/systerm.ts). One engine for both:
 *   - press and drag: from where you pressed to where the mouse is;
 *   - double-click: the word under the mouse; triple-click: the whole line;
 *   - `text()` is what ⌘C / ctrl+C copies (wrapped lines joined back, trailing spaces trimmed).
 *
 * Lines are whatever the owner counts (xterm's buffer lines, ibsh's wrapped rows); a column is
 * a cell (a wide character takes two: the second is "").
 */
export interface TextPos {
  line: number;
  col: number;
}

/** What the selection reads. */
export interface SelectionSource {
  /** a line's cells, one string per cell ("" for the second half of a wide character) */
  cells(line: number): string[] | undefined;
  /** this line goes on from the one before it (a long line, wrapped): copied without a line break */
  wrapped?(line: number): boolean;
}

/** what a double-click takes as one word (paths and options too: ~/notes/a.md, --force) */
const isWordChar = (ch: string | undefined): boolean => !!ch && /[^\s"'`()[\]{}<>|;,]/.test(ch);

/** the used width of a line: its cells without the empty end */
export function usedCells(cells: string[]): number {
  let n = cells.length;
  while (n > 0 && (cells[n - 1] === " " || cells[n - 1] === "")) n--;
  return n;
}

export class TextSelection {
  private anchor: TextPos | null = null;
  private head: TextPos | null = null;
  /** what a drag extends by: characters, or whole words / lines after a double / triple click */
  private unit: 1 | 2 | 3 = 1;
  /** the word or line first picked: a drag after a double / triple click keeps it */
  private first: [TextPos, TextPos] | null = null;

  /** start/end, in reading order (null: nothing selected) */
  range(): [TextPos, TextPos] | null {
    const a = this.anchor, h = this.head;
    if (!a || !h || (a.line === h.line && a.col === h.col)) return null;
    return before(a, h) ? [a, h] : [h, a];
  }

  has(): boolean {
    return !!this.range();
  }

  clear(): void {
    this.anchor = this.head = this.first = null;
  }

  /**
   * The button went down at `p`: one click starts a selection there, two take the word,
   * three the line (`m.clicks`, the browser's own count).
   */
  press(p: TextPos, clicks: number, src: SelectionSource): void {
    this.unit = clicks >= 3 ? 3 : clicks === 2 ? 2 : 1;
    if (this.unit === 1) {
      this.anchor = { ...p };
      this.head = { ...p };
      this.first = null;
      return;
    }
    const span = this.unit === 3 ? lineSpan(p, src) : wordSpan(p, src);
    if (!span) return this.clear();
    this.first = span;
    [this.anchor, this.head] = [{ ...span[0] }, { ...span[1] }];
  }

  /** the mouse moved with the button held */
  drag(p: TextPos, src: SelectionSource): void {
    if (!this.anchor) return;
    if (this.unit === 1 || !this.first) return void (this.head = { ...p });
    const span = (this.unit === 3 ? lineSpan(p, src) : wordSpan(p, src)) ?? [p, p];
    // from the first word / line to the one under the mouse, whichever way
    if (before(p, this.first[0])) [this.anchor, this.head] = [{ ...this.first[1] }, { ...span[0] }];
    else [this.anchor, this.head] = [{ ...this.first[0] }, { ...span[1] }];
  }

  /** everything from the first line to the last */
  all(lastLine: number, cols: number): void {
    this.unit = 1;
    this.anchor = { line: 0, col: 0 };
    this.head = { line: lastLine, col: cols };
  }

  /** the selected text: lines joined with \n (a wrapped line goes on without one), trailing spaces trimmed */
  text(src: SelectionSource): string {
    const r = this.range();
    if (!r) return "";
    const out: string[] = [];
    for (let l = r[0].line; l <= r[1].line; l++) {
      const cells = src.cells(l);
      if (!cells) continue;
      const from = l === r[0].line ? r[0].col : 0;
      const to = l === r[1].line ? r[1].col : cells.length;
      // a row that goes on below keeps its spaces (the one between two words may be its last cell)
      const goesOn = l < r[1].line && !!src.wrapped?.(l + 1);
      const raw = cells.slice(from, to).join("");
      const text = goesOn ? raw : raw.replace(/\s+$/, "");
      if (out.length && src.wrapped?.(l)) out[out.length - 1] += text;
      else out.push(text);
    }
    return out.join("\n");
  }

  /**
   * Draw the selection over what's on screen: `r` shows the lines first…first + r.h - 1.
   * Only real text is tinted (and the spaces between words), never the empty end of a line.
   */
  paint(ui: UI, r: Rect, first: number, src: SelectionSource): void {
    const sr = this.range();
    if (!sr) return;
    const c = ui.c;
    for (let y = 0; y < r.h; y++) {
      const l = first + y;
      if (l < sr[0].line || l > sr[1].line) continue;
      const cells = src.cells(l);
      if (!cells) continue;
      const used = usedCells(cells);
      const from = l === sr[0].line ? sr[0].col : 0;
      const to = Math.min(l === sr[1].line ? sr[1].col : r.w, used, r.w);
      if (to > from) ui.tint({ x: r.x + from, y: r.y + y, w: to - from, h: 1 }, c.fg, c.selection);
    }
  }
}

/** The mouse handlers for an area that shows lines first…: press, drag, auto-scroll at the edges. */
export function selectionHit(o: {
  sel: TextSelection;
  src: SelectionSource;
  /** where a cell of the screen is, in lines and columns (and scroll when the mouse leaves the area) */
  at: (m: MouseInput) => TextPos;
  redraw: () => void;
}): { onClick: (m: MouseInput) => void; onDrag: (m: MouseInput) => void } {
  return {
    onClick: (m) => {
      o.sel.press(o.at(m), m.clicks ?? 1, o.src);
      o.redraw();
    },
    onDrag: (m) => {
      o.sel.drag(o.at(m), o.src);
      o.redraw();
    },
  };
}

function before(a: TextPos, b: TextPos): boolean {
  return a.line < b.line || (a.line === b.line && a.col <= b.col);
}

function wordSpan(p: TextPos, src: SelectionSource): [TextPos, TextPos] | null {
  const cells = src.cells(p.line);
  if (!cells) return null;
  // the second half of a wide character belongs to the first
  let col = Math.min(p.col, cells.length - 1);
  while (col > 0 && cells[col] === "") col--;
  if (!isWordChar(cells[col])) return null;
  let a = col, b = col;
  while (a > 0 && (isWordChar(cells[a - 1]) || cells[a - 1] === "")) a--;
  while (b < cells.length && (isWordChar(cells[b]) || cells[b] === "")) b++;
  return [{ line: p.line, col: a }, { line: p.line, col: b }];
}

function lineSpan(p: TextPos, src: SelectionSource): [TextPos, TextPos] | null {
  // a long line wrapped on several rows is one line
  let a = p.line, b = p.line;
  while (a > 0 && src.wrapped?.(a)) a--;
  while (src.wrapped?.(b + 1) && src.cells(b + 1)) b++;
  const end = src.cells(b);
  if (!end) return null;
  return [{ line: a, col: 0 }, { line: b, col: usedCells(end) }];
}
