import { freshState, parseAnsi, resolveColor, type Run } from "../core/ansi";
import { INVERSE, type Rect } from "../core/grid";
import { charWidth } from "../core/unicode";
import { revealed } from "../ui/typewriter";
import type { UI } from "../ui/ui";

/**
 * Scrollback buffer of the shell: lines of styled runs, fed with text that
 * may contain ANSI escape codes. `\r` rewinds the current line (progress bars),
 * `\n` starts a new one.
 */
let buffers = 0;

export class TerminalBuffer {
  lines: Run[][] = [[]];
  version = 0;
  private st = freshState();
  private static readonly MAX_LINES = 5000;
  /**
   * Output types itself out (ui/typewriter.ts, never more than a second behind):
   * every character written counts, a line break too; what's not revealed yet
   * isn't drawn. `typing: false` for buffers that show things at once.
   */
  private written = 0;
  private readonly tw = `term:${++buffers}`;
  typing = true;

  write(text: string, override?: { fg?: number; attrs?: number }): void {
    const parts = text.replace(/\r\n/g, "\n").split(/(\n|\r)/);
    for (const part of parts) {
      if (part === "\n") (this.lines.push([]), this.written++);
      else if (part === "\r") this.lines[this.lines.length - 1] = [];
      else if (part) {
        const runs = parseAnsi(part, this.st);
        if (override) for (const r of runs) Object.assign(r, override);
        this.lines[this.lines.length - 1].push(...runs);
        // what shows, not the colour codes: those aren't typed out
        for (const r of runs) this.written += [...r.text].length;
      }
    }
    if (this.lines.length > TerminalBuffer.MAX_LINES) this.lines.splice(0, this.lines.length - TerminalBuffer.MAX_LINES);
    this.version++;
  }

  /** Make sure the next write starts on a fresh line. */
  ensureNewline(): void {
    if (this.lines[this.lines.length - 1].length) this.write("\n");
  }

  clear(): void {
    this.lines = [[]];
    this.st = freshState();
    this.version++;
  }

  /** Lines worth showing (the trailing empty line is where the prompt goes). */
  private get visible(): Run[][] {
    const last = this.lines[this.lines.length - 1];
    return last.length ? this.lines : this.lines.slice(0, -1);
  }

  /** Number of screen rows needed at a given width. */
  rowCount(width: number): number {
    let n = 0;
    for (const l of this.visible) n += Math.max(1, Math.ceil(lineWidth(l) / width));
    return n;
  }

  /** where each screen row starts (line, cell), at one width: kept until the text or the width changes */
  private rowMap: { version: number; width: number; rows: { li: number; start: number }[] } | null = null;

  private rows(width: number): { li: number; start: number }[] {
    const m = this.rowMap;
    if (m && m.version === this.version && m.width === width) return m.rows;
    const rows: { li: number; start: number }[] = [];
    this.visible.forEach((l, li) => {
      const n = Math.max(1, Math.ceil(lineWidth(l) / width));
      for (let k = 0; k < n; k++) rows.push({ li, start: k * width });
    });
    this.rowMap = { version: this.version, width, rows };
    return rows;
  }

  /**
   * A screen row's cells at this width (text selection, ui/textselect.ts): one string per
   * cell, "" for the second half of a wide character, the row padded with spaces.
   */
  rowCells(row: number, width: number): string[] | undefined {
    const at = this.rows(width)[row];
    if (!at) return undefined;
    const out: string[] = [];
    let cell = 0;
    for (const run of this.visible[at.li]) {
      for (const ch of run.text) {
        const w = charWidth(ch.codePointAt(0)!);
        if (cell >= at.start && cell < at.start + width) {
          out.push(ch);
          if (w === 2) out.push("");
        }
        cell += w;
        if (cell >= at.start + width) break;
      }
      if (cell >= at.start + width) break;
    }
    while (out.length < width) out.push(" ");
    return out.slice(0, width);
  }

  /** this row goes on from the one above (a long line, wrapped) */
  rowWrapped(row: number, width: number): boolean {
    const r = this.rows(width);
    return row > 0 && !!r[row] && r[row].li === r[row - 1]?.li;
  }

  /**
   * Draw the rows [first, first + r.h) of the wrapped buffer into r.
   * Rows are computed lazily from the end, so huge scrollbacks stay cheap.
   */
  render(ui: UI, r: Rect, first: number): void {
    const lines = this.visible;
    const total = this.rowCount(r.w);
    const rows: { line: Run[]; li: number; start: number }[] = [];
    let row = total;
    for (let li = lines.length - 1; li >= 0 && row > first; li--) {
      const n = Math.max(1, Math.ceil(lineWidth(lines[li]) / r.w));
      for (let k = n - 1; k >= 0; k--) {
        row--;
        if (row >= first && row < first + r.h) rows.push({ line: lines[li], li, start: k * r.w });
      }
    }
    rows.reverse();
    // what hasn't typed itself out yet: the last `hidden` characters (counted from the end)
    let hidden = this.typing ? this.written - revealed(ui, this.tw, this.written) : 0;
    let cutLine = lines.length, cutChar = 0;
    for (let li = this.lines.length - 1; li >= 0 && hidden > 0; li--) {
      const n = lineChars(this.lines[li]);
      if (hidden <= n) {
        cutLine = li;
        cutChar = n - hidden;
        hidden = 0;
      } else hidden -= n + 1; // its line break
      if (hidden > 0) cutLine = li, cutChar = 0;
    }
    const t = ui.theme;
    rows.forEach((rw, i) => {
      if (rw.li > cutLine) return;
      let cell = 0;
      let idx = 0;
      let x = r.x;
      for (const run of rw.line) {
        let fg = resolveColor(run.fg, t.ansi, t.c.fg);
        let bg = run.bg === -1 ? undefined : resolveColor(run.bg, t.ansi, t.c.panel);
        if (run.attrs & INVERSE) [fg, bg] = [bg ?? t.c.panel, fg];
        for (const ch of run.text) {
          if (rw.li === cutLine && idx >= cutChar) return;
          const w = charWidth(ch.codePointAt(0)!);
          if (cell >= rw.start && cell < rw.start + r.w) x = ui.text(x, r.y + i, ch, { fg, bg, attrs: run.attrs });
          cell += w;
          idx++;
        }
        if (cell >= rw.start + r.w) break;
      }
    });
  }
}

function lineChars(l: Run[]): number {
  let n = 0;
  for (const r of l) n += [...r.text].length;
  return n;
}

function lineWidth(l: Run[]): number {
  let w = 0;
  for (const r of l) for (const ch of r.text) w += charWidth(ch.codePointAt(0)!);
  return w;
}

export { resolveColor };
