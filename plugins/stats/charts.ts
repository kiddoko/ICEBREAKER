/**
 * STATS' numbers and drawings, kept pure (no deck, no UI): the facts a page says
 * about a series (total, average, best day, streak, change), and the braille
 * pictures (a line with its area, a pie). The page (main.ts) colours and places them.
 */

export interface Point {
  day: string;
  value: number;
}

export interface Facts {
  /** counters: the period's total; values: the last value */
  total: number;
  avg: number;
  min: number;
  max: number;
  /** the day with the highest value */
  best: Point | null;
  /** counters: days in a row (up to today) above 0 */
  streak: number;
  /** days with something (counters: > 0) */
  active: number;
  /** compared with the period before: counters total vs total, values last vs last; null when there's nothing to compare */
  change: number | null;
  /** the same change as a share of before (0.12 = +12 %); null when before was 0 */
  changePct: number | null;
}

/**
 * `points` covers two periods, oldest first: the `days` before, then the `days` shown.
 * What's said about the shown part, and how it moved since the one before.
 */
export function facts(points: Point[], days: number, counter: boolean): Facts {
  const now = points.slice(-days);
  const before = points.slice(-2 * days, -days);
  const v = now.map((p) => p.value);
  const sum = v.reduce((a, b) => a + b, 0);
  const last = v.length ? v[v.length - 1] : 0;
  let best: Point | null = null;
  for (const p of now) if (!best || p.value > best.value) best = p;
  let streak = 0;
  if (counter) for (let i = v.length - 1; i >= 0 && v[i] > 0; i--) streak++;
  const was = counter ? before.reduce((a, b) => a + b.value, 0) : before.length ? before[before.length - 1].value : NaN;
  const is = counter ? sum : last;
  const change = before.length && Number.isFinite(was) ? is - was : null;
  return {
    total: counter ? sum : last,
    avg: v.length ? sum / v.length : 0,
    min: v.length ? Math.min(...v) : 0,
    max: v.length ? Math.max(...v) : 0,
    best: best && best.value > 0 ? best : null,
    streak,
    active: v.filter((x) => (counter ? x > 0 : true)).length,
    change,
    changePct: change !== null && was ? change / Math.abs(was) : null,
  };
}

/** Totals per weekday (0 = sunday … 6), from day keys "YYYY-MM-DD". */
export function byWeekday(points: Point[]): number[] {
  const out = [0, 0, 0, 0, 0, 0, 0];
  for (const p of points) {
    const [y, m, d] = p.day.split("-").map(Number);
    out[new Date(y, m - 1, d).getDay()] += p.value;
  }
  return out;
}

/** "+12 %", "−3 %", "=" — a change as words a reader gets at once. */
export function pctText(p: number | null): string {
  if (p === null || !Number.isFinite(p)) return "";
  const n = Math.round(p * 100);
  if (n === 0) return "=";
  return `${n > 0 ? "+" : "−"}${Math.abs(n)} %`;
}

/* ── braille: a cell is 2 dots wide and 4 high ── */

const BIT = [
  [0x01, 0x08],
  [0x02, 0x10],
  [0x04, 0x20],
  [0x40, 0x80],
];

/** A grid of braille cells, each with its dots and the layer that colours it (highest wins). */
export class Dots {
  readonly bits: Uint8Array;
  readonly layer: Int8Array;
  constructor(readonly w: number, readonly h: number) {
    this.bits = new Uint8Array(w * h);
    this.layer = new Int8Array(w * h).fill(-1);
  }
  set(x: number, y: number, layer = 0): void {
    const X = Math.floor(x), Y = Math.floor(y);
    if (X < 0 || Y < 0 || X >= this.w * 2 || Y >= this.h * 4) return;
    const i = Math.floor(Y / 4) * this.w + Math.floor(X / 2);
    this.bits[i] |= BIT[Y % 4][X % 2];
    if (layer > this.layer[i]) this.layer[i] = layer;
  }
  /** each row as text runs of one layer: [x, text, layer] */
  rows(): [number, string, number][][] {
    const out: [number, string, number][][] = [];
    for (let y = 0; y < this.h; y++) {
      const runs: [number, string, number][] = [];
      for (let x = 0; x < this.w; x++) {
        const i = y * this.w + x;
        if (!this.bits[i]) continue;
        const ch = String.fromCharCode(0x2800 + this.bits[i]);
        const last = runs[runs.length - 1];
        if (last && last[2] === this.layer[i] && last[0] + last[1].length === x) last[1] += ch;
        else runs.push([x, ch, this.layer[i]]);
      }
      out.push(runs);
    }
    return out;
  }
}

/**
 * A line over `w`×`h` cells: the values stretched across the width, scaled between
 * lo and hi. Layer 1 = the line, layer 0 = the area under it (every other dot row).
 * Returns the dot row of each value too (for the markers).
 */
export function lineChart(values: number[], w: number, h: number, lo: number, hi: number): Dots {
  const d = new Dots(w, h);
  if (!values.length || w <= 0 || h <= 0) return d;
  const cols = w * 2, rows = h * 4;
  const span = hi - lo || 1;
  const yOf = (v: number) => Math.round((rows - 1) * (1 - (v - lo) / span));
  let prev = -1;
  for (let x = 0; x < cols; x++) {
    // where this dot column falls in the series (linear between two days)
    const t = values.length === 1 ? 0 : (x / (cols - 1)) * (values.length - 1);
    const i = Math.floor(t), f = t - i;
    const v = values[i] + ((values[Math.min(values.length - 1, i + 1)] ?? values[i]) - values[i]) * f;
    const y = Math.max(0, Math.min(rows - 1, yOf(v)));
    // the line, joined to the column before so steep days stay connected
    const from = prev < 0 ? y : prev;
    for (let k = Math.min(from, y); k <= Math.max(from, y); k++) d.set(x, k, 1);
    for (let k = y + 1; k < rows; k++) if ((k + x) % 2 === 0) d.set(x, k, 0);
    prev = y;
  }
  return d;
}

/**
 * A pie (a donut when `hole` > 0) of `parts`, `w`×`h` cells. A cell takes the layer of
 * the slice under its centre (a cell has one colour). `aspect` = cell width / height.
 */
export function pieChart(parts: number[], w: number, h: number, aspect = 0.5, hole = 0.45): Dots {
  const d = new Dots(w, h);
  const total = parts.reduce((a, b) => a + Math.max(0, b), 0);
  if (!total) return d;
  // dot sizes in the same unit: a dot is (aspect / 2) wide and (1 / 4) high, in cell heights
  const dw = aspect / 2, dh = 1 / 4;
  const cx = (w * 2 * dw) / 2, cy = (h * 4 * dh) / 2;
  const R = Math.min(cx, cy) - 0.05;
  const ends: number[] = [];
  let acc = 0;
  for (const p of parts) ends.push((acc += Math.max(0, p)) / total);
  const sliceAt = (px: number, py: number) => {
    const a = (Math.atan2(px - cx, cy - py) / (2 * Math.PI) + 1) % 1; // clockwise from the top
    return ends.findIndex((e) => a < e);
  };
  for (let y = 0; y < h * 4; y++)
    for (let x = 0; x < w * 2; x++) {
      const px = (x + 0.5) * dw, py = (y + 0.5) * dh;
      const r = Math.hypot(px - cx, py - cy);
      if (r > R || r < R * hole) continue;
      // the colour of the cell: the slice at the cell's centre
      const ccx = (Math.floor(x / 2) + 0.5) * 2 * dw, ccy = (Math.floor(y / 4) + 0.5) * 4 * dh;
      d.set(x, y, Math.max(0, sliceAt(ccx, ccy)));
    }
  return d;
}
