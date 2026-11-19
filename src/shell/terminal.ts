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
    this.written += [...text.replace(/\r\n/g, "\n")].filter((c) => c !== "\r").length;
    const parts = text.replace(/\r\n/g, "\n").split(/(\n|\r)/);
    for (const part of parts) {
      if (part === "\n") this.lines.push([]);
      else if (part === "\r") this.lines[this.lines.length - 1] = [];
      else if (part) {
        const runs = parseAnsi(part, this.st);
        if (override) for (const r of runs) Object.assign(r, override);
        this.lines[this.lines.length - 1].push(...runs);
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
