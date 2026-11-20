/**
 * THE LAYOUT PROBE — finds what is cut or drawn over something else (docs/LAYOUT.md).
 *
 * While a probe is set on the UI (`ui.probe`), every `ui.text` reports:
 *   cut       a text that is partly visible: some of its letters fall outside its
 *             frame (the clip) or off the screen — it should have had a `maxW`, or
 *             a `Row` that leaves it out;
 *   overlap   a text written over the letters of another text, in the same frame,
 *             with no fill in between (a fill means "I'm redrawing this area").
 *
 * Only `debug layout` and `debug layout show` set one: it costs nothing otherwise.
 * Drawings that overlap on purpose (an animated background, a pseudo-3D scene, art
 * over a frame) go inside `ui.art(() => …)`: the probe doesn't look there.
 * Each issue says which function drew it (from the call stack), so a long
 * list folds into a few places to fix.
 */
import type { Rect } from "../core/grid";

export type IssueKind = "cut" | "overlap";

export interface LayoutIssue {
  kind: IssueKind;
  /** the first cell concerned */
  x: number;
  y: number;
  /** the text (shortened) */
  text: string;
  /** the code that drew it ("chrome.ts › renderStatusBar"), or "?" */
  where: string;
  /** overlap: the text that was there before */
  under?: string;
}

/** at most this many issues a frame (a broken page can make thousands) */
const MAX_ISSUES = 400;

/** frames of the stack that are drawing helpers, not the page that called them */
const HELPERS = /\/ui\/(ui|layout|probe|controls|keycaps)\.ts|\/core\/(grid|unicode)\.ts|\/node_modules\//;

export class LayoutProbe {
  readonly issues: LayoutIssue[] = [];
  /** per cell: which text call wrote the letter there (0: none, or a fill since) */
  private owner: Int32Array;
  private texts: string[] = [""];
  private readonly cols: number;
  private readonly rows: number;

  constructor(cols: number, rows: number) {
    this.cols = cols;
    this.rows = rows;
    this.owner = new Int32Array(cols * rows);
  }

  /** A new text call: its id (pass it to `letter`). */
  begin(s: string): number {
    this.texts.push(s);
    return this.texts.length - 1;
  }

  /**
   * Text `id` puts letter `cp` at (x, y). `shown`: inside the clip and the screen.
   * `before`: the letter that was in that cell.
   */
  letter(id: number, x: number, y: number, cp: number, shown: boolean, before: number): void {
    if (!shown || x < 0 || y < 0 || x >= this.cols || y >= this.rows) return;
    const i = y * this.cols + x;
    const prev = this.owner[i];
    // a letter over another text's letter — the same letter again is a redraw (a hover, a selection)
    if (prev && prev !== id && cp !== 32 && before !== 32 && before !== 0 && cp !== before) {
      const key = `overlap ${prev} ${id}`;
      if (!this.seen.has(key)) {
        this.seen.add(key);
        this.add({ kind: "overlap", x, y, text: short(this.texts[id]), under: short(this.texts[prev]), where: caller() });
      }
    }
    if (cp !== 32) this.owner[i] = id;
  }

  /** text `id` had letters outside its room (and some inside) */
  cut(id: number, x: number, y: number): void {
    this.add({ kind: "cut", x, y, text: short(this.texts[id]), where: caller() });
  }

  /** An area was filled: what was written there is meant to be covered. */
  cleared(r: Rect): void {
    const x0 = Math.max(0, r.x), y0 = Math.max(0, r.y);
    const x1 = Math.min(this.cols, r.x + r.w), y1 = Math.min(this.rows, r.y + r.h);
    for (let y = y0; y < y1; y++) this.owner.fill(0, y * this.cols + x0, y * this.cols + Math.max(x0, x1));
  }

  private readonly seen = new Set<string>();

  private add(issue: LayoutIssue): void {
    if (this.issues.length < MAX_ISSUES) this.issues.push(issue);
  }
}

/** a text in a report: one line, 40 cells at most */
function short(s: string | undefined): string {
  const one = (s ?? "").replace(/\s+/g, " ").trim();
  return one.length > 40 ? `${one.slice(0, 39)}…` : one;
}

/**
 * "chrome.ts › renderStatusBar": the file and the function of the first frame of the
 * stack that isn't a drawing helper. (Not the line: in the app the code is compiled,
 * so its line numbers aren't the source's.)
 */
export function caller(stack = new Error().stack ?? ""): string {
  for (const raw of stack.split("\n").slice(1)) {
    const line = raw.replace(/\?[^:)\s]*/, "");
    // only the source's own files tell where: a built app (one bundle, index-….js) doesn't
    if (HELPERS.test(line) || !/\.ts:\d+:\d+\)?\s*$/.test(line)) continue;
    // Chrome / WebView2: "    at Workspace.render (http://localhost:1420/src/workspace/chrome.ts:374:9)"
    const v8 = /^\s*at (?:async )?([^\s(]+) \(.*?([^/]+\/[^/]+\.(?:ts|js)):\d+:\d+\)\s*$/.exec(line);
    if (v8) return `${file(v8[2])} › ${v8[1].replace(/^Object\./, "")}`;
    // WebKit / Safari: "render@http://localhost:1420/src/workspace/chrome.ts:374:9"
    const wk = /^([^@\s]*)@.*?([^/]+\/[^/]+\.(?:ts|js)):\d+:\d+\s*$/.exec(line);
    if (wk) return wk[1] ? `${file(wk[2])} › ${wk[1]}` : file(wk[2]);
    // a frame without a name: "    at http://…/apps/home.ts:12:3"
    const anon = /([^/]+\/[^/]+\.(?:ts|js)):\d+:\d+\)?\s*$/.exec(line);
    if (anon) return file(anon[1]);
  }
  return "?";
}

/** "workspace/chrome.ts" → "chrome.ts"; a module's "calendar/main.ts" keeps its folder (they're all main.ts) */
function file(dirAndName: string): string {
  const [dir, name] = dirAndName.split("/");
  return /^(main|index)\.(ts|js)$/.test(name) ? `${dir}/${name}` : name;
}

/** One sweep: the issues at one size, grouped by where they come from. */
export interface SizeReport {
  cols: number;
  rows: number;
  label: string;
  issues: LayoutIssue[];
}

/**
 * The sizes `debug layout` tries, in cells (a cell is about twice as tall as wide,
 * so 16:9 pixels ≈ 3.5 columns per row). From a small window with a big interface
 * scale to a big screen with a small one, and the odd shapes.
 */
export const PROBE_SIZES: { label: string; cols: number; rows: number }[] = [
  { label: "tiny", cols: 40, rows: 12 },
  { label: "small", cols: 64, rows: 20 },
  { label: "80×24", cols: 80, rows: 24 },
  { label: "4:3", cols: 100, rows: 36 },
  { label: "laptop", cols: 120, rows: 34 },
  { label: "16:10", cols: 150, rows: 46 },
  { label: "16:9", cols: 180, rows: 50 },
  { label: "1440p", cols: 240, rows: 68 },
  { label: "4K", cols: 340, rows: 96 },
  { label: "21:9", cols: 260, rows: 52 },
  { label: "32:9", cols: 380, rows: 52 },
  { label: "portrait", cols: 60, rows: 64 },
  { label: "half screen", cols: 90, rows: 50 },
  { label: "short", cols: 200, rows: 16 },
];

/** "120x34" or "120×34" → a size (20–600 × 8–300), or null */
export function parseSize(s: string): { label: string; cols: number; rows: number } | null {
  const m = /^(\d{2,3})[x×](\d{1,3})$/i.exec(s.trim());
  if (!m) return null;
  const cols = Number(m[1]), rows = Number(m[2]);
  if (cols < 20 || cols > 600 || rows < 8 || rows > 300) return null;
  return { label: `${cols}×${rows}`, cols, rows };
}

/**
 * The same problem seen at many sizes is one line: where · kind · the sizes · a sample text.
 * Sorted by how many sizes show it (the worst first).
 */
export function groupIssues(reports: SizeReport[]): { where: string; kind: IssueKind; sizes: string[]; sample: string; under?: string; count: number }[] {
  const groups = new Map<string, { where: string; kind: IssueKind; sizes: string[]; sample: string; under?: string; count: number }>();
  for (const r of reports)
    for (const i of r.issues) {
      // no code name (a built app): the same text is the same place
      const key = i.where === "?" ? `${i.kind} ? ${i.text}` : `${i.kind} ${i.where}`;
      let g = groups.get(key);
      if (!g) groups.set(key, (g = { where: i.where, kind: i.kind, sizes: [], sample: i.text, under: i.under, count: 0 }));
      g.count++;
      if (!g.sizes.includes(r.label)) g.sizes.push(r.label);
    }
  return [...groups.values()].sort((a, b) => b.sizes.length - a.sizes.length || b.count - a.count);
}
