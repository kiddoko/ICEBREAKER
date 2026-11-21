/**
 * SYSMON — the computer's vitals, live (one sample a second while the page is open):
 *
 *   ┌ CPU ──────────┐ ┌ MEMORY ───────┐   the big number, its last minutes as a graph
 *   CORES ▇▅▃▂▇▆▅▄▃▂▁▂                     one bar per core
 *   ┌ PROCESSES ────┐ ┌ DISKS ┐ ┌ NETWORK ┐ the busiest, the space left, the traffic
 *   load · procs · vault · fps
 *
 * Read on this computer by the desktop app (src-tauri/src/system.rs); nothing goes out.
 * s: sort the processes by cpu or by memory.
 */
import { mix, type RGB } from "../core/color";
import { BOLD, type Rect } from "../core/grid";
import { t } from "../core/i18n";
import type { Deck } from "../deck";
import type { SystemStats } from "../platform/types";
import { formatUptime } from "../shell/commands/system";
import type { UI } from "../ui/ui";
import type { App, AppSpec } from "./types";
import { Bar, GAP, INSET, Row, SECTION, stack } from "../ui/layout";
import { fitMatrix, matrixSize, matrixText } from "../ui/dots";
import { strWidth, truncate } from "../core/unicode";

/** "9.1 G", "420 M", "12 k" (bytes) */
export function bytes(n: number): string {
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(n >= 100 * 1024 ** 3 ? 0 : 1)} G`;
  if (n >= 1024 ** 2) return `${Math.round(n / 1024 ** 2)} M`;
  if (n >= 1024) return `${Math.round(n / 1024)} k`;
  return `${Math.round(n)} B`;
}

/** a rate: "1.2 MB/s", "340 kB/s" */
export function rate(bps: number): string {
  if (bps >= 1024 ** 2) return `${(bps / 1024 ** 2).toFixed(1)} MB/s`;
  if (bps >= 1024) return `${Math.round(bps / 1024)} kB/s`;
  return `${Math.round(bps)} B/s`;
}

/** SYSMON — live CPU / memory with braille graphs. Polls once per second while open. */
export class SysmonApp implements App {
  readonly kind = "sysmon";
  readonly key = "sysmon";
  private stats: SystemStats | null = null;
  private cpuHist: number[] = [];
  private memHist: number[] = [];
  private rxHist: number[] = [];
  private txHist: number[] = [];
  /** the last byte counters and when, for the network's rate */
  private lastNet: { rx: number; tx: number; at: number } | null = null;
  private rx = 0;
  private tx = 0;
  private byMem = false;
  private timer: ReturnType<typeof setInterval>;
  private error = "";

  constructor(private readonly deck: Deck) {
    void this.poll();
    this.timer = setInterval(() => void this.poll(), 1000);
  }

  private async poll(): Promise<void> {
    try {
      const s = await this.deck.platform.system.stats();
      this.stats = s;
      const keep = (h: number[], v: number) => (h.push(v), h.length > 400 && h.shift());
      keep(this.cpuHist, s.cpu / 100);
      keep(this.memHist, s.memUsed / Math.max(1, s.memTotal));
      if (s.netRx !== undefined && s.netTx !== undefined) {
        const now = performance.now();
        if (this.lastNet) {
          const dt = Math.max(0.2, (now - this.lastNet.at) / 1000);
          this.rx = Math.max(0, (s.netRx - this.lastNet.rx) / dt);
          this.tx = Math.max(0, (s.netTx - this.lastNet.tx) / dt);
          keep(this.rxHist, this.rx);
          keep(this.txHist, this.tx);
        }
        this.lastNet = { rx: s.netRx, tx: s.netTx, at: now };
      }
      this.error = "";
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
    }
    this.deck.requestFrame();
  }

  title(): string {
    return "sysmon";
  }

  status(): string {
    return this.stats ? `${this.stats.host} · ${this.stats.processes} ${t("procs")} · up ${formatUptime(this.stats.uptime)} · s ${t("sort")}` : t("sampling…");
  }

  onText(s: string): boolean {
    if (s === "s") return (this.byMem = !this.byMem), this.deck.requestFrame(), true;
    return false;
  }

  close(): boolean {
    clearInterval(this.timer);
    return true;
  }

  render(ui: UI, r: Rect, focused: boolean): void {
    const s = this.stats;
    const c = ui.c;
    if (!s) {
      ui.textCenter(r, r.y + 2, this.error ? `✖ ${this.error}` : `${ui.spinner()} ${t("sampling vitals…")}`, { fg: this.error ? c.error : c.accent });
      return;
    }
    const body = { x: r.x + INSET, y: r.y, w: r.w - INSET * 2, h: r.h };
    const hasMore = !!s.top || !!s.disks || s.netRx !== undefined;
    const [head, tiles, cores, more, foot] = stack(body, [
      { h: 1, priority: 9 },
      { min: 4, h: 8, max: 12, fill: 1, priority: 8 },
      { min: 3, h: 4, max: 5, priority: 4 },
      { min: 5, h: 8, fill: 2, priority: hasMore ? 6 : 0 },
      { h: 1, priority: 3 },
    ], 0);

    // the cpu on the left, the system on the right: both shrink (…) rather than overlap
    if (head) {
      new Bar(ui, head.x, head.y, head.x + head.w)
        .text(s.cpuBrand || "cpu", { fg: c.muted }, { priority: 9, fit: 8 })
        .text(`${s.cores.length} ${t("cores")}`, { fg: c.subtle }, { priority: 4 })
        .text(`${s.os} · ${s.arch} · up ${formatUptime(s.uptime)}`, { fg: c.subtle }, { side: "right", priority: 5, fit: 6 })
        .draw();
    }

    // CPU and MEMORY: the big number, the last minutes as a graph (side by side, or stacked)
    if (tiles) {
      const memRatio = s.memUsed / Math.max(1, s.memTotal);
      const two = tiles.w >= 60;
      const w1 = two ? Math.floor((tiles.w - GAP) / 2) : tiles.w;
      const h1 = two ? tiles.h : Math.floor(tiles.h / 2);
      const cpuR = { x: tiles.x, y: tiles.y, w: w1, h: h1 };
      const memR = two ? { x: tiles.x + w1 + GAP, y: tiles.y, w: tiles.w - w1 - GAP, h: tiles.h } : { x: tiles.x, y: tiles.y + h1, w: tiles.w, h: tiles.h - h1 };
      this.tile(ui, cpuR, "CPU", `${Math.round(s.cpu)}`, `${s.cores.length} ${t("cores")}`, this.cpuHist, heat(ui, s.cpu / 100), focused);
      const swap = s.swapTotal ? ` · swap ${bytes(s.swapUsed)}` : "";
      this.tile(ui, memR, t("MEMORY"), `${Math.round(memRatio * 100)}`, `${bytes(s.memUsed)} / ${bytes(s.memTotal)}${swap}`, this.memHist, mix(c.accentAlt, c.warning, Math.max(0, memRatio - 0.7) / 0.3), false);
    }

    // one bar per core, its height its use
    if (cores) {
      const inner = ui.box(cores, { title: t("CORES") });
      const n = s.cores.length;
      // each bar 1–4 cells, a cell between two
      const w = Math.max(1, Math.min(4, Math.floor((inner.w + INSET) / Math.max(1, n)) - INSET));
      const levels = " ▁▂▃▄▅▆▇█";
      s.cores.forEach((u, i) => {
        const x = inner.x + i * (w + 1);
        if (x + w > inner.x + inner.w) return;
        const fill = (u / 100) * inner.h;
        for (let row = 0; row < inner.h; row++) {
          const part = Math.max(0, Math.min(1, fill - (inner.h - 1 - row)));
          const ch = levels[Math.round(part * 8)];
          if (ch !== " ") ui.text(x, inner.y + row, ch.repeat(w), { fg: heat(ui, u / 100) });
          else ui.text(x, inner.y + row, "·".repeat(w), { fg: c.faint });
        }
        ui.hit({ x, y: inner.y, w, h: inner.h }, { tip: `${t("core")} ${i} · ${Math.round(u)}%` });
      });
    }

    // the busiest processes · the disks · the network
    if (more) this.drawMore(ui, more, s);

    // the rest, in a line
    if (foot) {
      const parts: [string, string][] = [
        ...(s.load && s.load[0] > 0 ? ([[t("load"), s.load.map((l) => l.toFixed(2)).join(" ")]] as [string, string][]) : []),
        [t("procs"), String(s.processes)],
        ["host", s.host],
        ["vault", `${this.deck.vault.markdown().length} notes`],
        ["fps", `${this.deck.loop.fps} · ${this.deck.loop.frameMs.toFixed(1)}ms`],
      ];
      // as many as fit, in this order (the last ones go first)
      const row = new Row(ui, foot.x, foot.y, foot.x + foot.w);
      for (const [k, v] of parts) {
        if (row.room < strWidth(`${k} ${v}`) + GAP) break;
        row.label(k);
        row.text(v, { fg: c.fg, attrs: BOLD });
      }
    }
  }

  /** a framed percentage with its graph: CPU 23 %, MEMORY 57 % (the digits big, "%" beside them) */
  private tile(ui: UI, r: Rect, title: string, big: string, info: string, hist: number[], color: RGB, focused: boolean): void {
    const c = ui.c;
    const inner = ui.box(r, { title, info, focused });
    if (inner.h < 1) return;
    // the number in big digits on the left when it fits, the graph on the right
    const k = inner.h >= 3 ? fitMatrix(big, Math.floor(inner.w * 0.4) - GAP, inner.h, 2) : 0;
    let gx = inner.x;
    if (k) {
      const d = matrixSize(big, k);
      const y = inner.y + Math.floor((inner.h - d.h) / 2);
      matrixText(ui, inner.x, y, big, k, () => color);
      // the big digits have no "%": a small one at their foot
      ui.text(inner.x + d.w + INSET, y + d.h - 1, "%", { fg: color, attrs: BOLD });
      gx = inner.x + d.w + INSET + GAP;
    } else {
      ui.text(inner.x, inner.y, `${big}%`, { fg: color, attrs: BOLD });
      gx = inner.x + strWidth(big) + INSET + GAP;
    }
    const graph = { x: gx, y: inner.y, w: inner.x + inner.w - gx, h: inner.h };
    if (graph.w >= 4) {
      // a faint floor line, then the graph over it
      ui.text(graph.x, graph.y + graph.h - 1, "⣀".repeat(graph.w), { fg: mix(c.faint, c.bg, 0.4) });
      ui.chart(graph, hist, color);
    }
  }

  /** the busiest processes, the disks, the network: three boxes that share the width */
  private drawMore(ui: UI, r: Rect, s: SystemStats): void {
    const boxes: ((b: Rect) => void)[] = [];
    if (s.top?.length) boxes.push((b) => this.drawProcs(ui, b, s));
    if (s.disks?.length) boxes.push((b) => this.drawDisks(ui, b, s));
    if (s.netRx !== undefined) boxes.push((b) => this.drawNet(ui, b));
    if (!boxes.length) return;
    // wide: side by side (the processes wider); narrow: as many as fit, the processes first
    const fit = Math.max(1, Math.min(boxes.length, Math.floor((r.w + GAP) / (28 + GAP))));
    const shown = boxes.slice(0, fit);
    const weights = shown.map((_, i) => (i === 0 && s.top?.length ? 1.4 : 1));
    const total = weights.reduce((a, b) => a + b, 0);
    let x = r.x;
    shown.forEach((draw, i) => {
      const w = i === shown.length - 1 ? r.x + r.w - x : Math.floor(((r.w - GAP * (shown.length - 1)) * weights[i]) / total);
      draw({ x, y: r.y, w, h: r.h });
      x += w + GAP;
    });
  }

  private drawProcs(ui: UI, r: Rect, s: SystemStats): void {
    const c = ui.c;
    const inner = ui.box(r, { title: t("PROCESSES"), info: this.byMem ? t("by memory · s") : t("by cpu · s") });
    ui.hit(inner, { onClick: () => ((this.byMem = !this.byMem), this.deck.requestFrame()), tip: t("click / s: sort by cpu or by memory") });
    const list = [...(s.top ?? [])].sort((a, b) => (this.byMem ? b.mem - a.mem : b.cpu - a.cpu || b.mem - a.mem));
    // cpu in % of one core: the bar's full length is one core, or the busiest if it's more
    const most = Math.max(100, ...list.map((p) => p.cpu));
    list.slice(0, inner.h).forEach((p, i) => {
      const y = inner.y + i;
      const cpu = `${p.cpu >= 10 ? Math.round(p.cpu) : p.cpu.toFixed(1)}%`;
      const mem = bytes(p.mem);
      const barW = inner.w >= 40 ? 8 : 0;
      const right = `${cpu.padStart(6)} ${mem.padStart(6)}`;
      const nameW = inner.w - strWidth(right) - (barW ? barW + GAP : 0) - INSET;
      ui.text(inner.x, y, truncate(p.name, nameW), { fg: i === 0 ? c.fg : c.muted }, nameW);
      if (barW) ui.bar(inner.x + nameW + INSET, y, barW, this.byMem ? p.mem / Math.max(1, s.memTotal) : p.cpu / most, this.byMem ? c.accentAlt : heat(ui, p.cpu / 100), c.faint);
      ui.textRight(inner.x + inner.w, y, right, { fg: c.subtle });
    });
  }

  private drawDisks(ui: UI, r: Rect, s: SystemStats): void {
    const c = ui.c;
    const inner = ui.box(r, { title: t("DISKS") });
    let y = inner.y;
    for (const d of s.disks ?? []) {
      if (y + 1 >= inner.y + inner.h + 1) break;
      const used = 1 - d.available / Math.max(1, d.total);
      new Bar(ui, inner.x, y, inner.x + inner.w)
        .text(`${d.removable ? "⏏ " : ""}${d.mount}`, { fg: c.fg }, { priority: 9, fit: 4 })
        .text(`${bytes(d.total - d.available)} / ${bytes(d.total)}`, { fg: c.subtle }, { side: "right", priority: 6 })
        .draw();
      if (y + 1 < inner.y + inner.h) ui.bar(inner.x, y + 1, inner.w, used, used > 0.9 ? c.error : used > 0.75 ? c.warning : c.accent, c.faint);
      y += 2 + (inner.h >= 6 ? SECTION : 0);
    }
  }

  private drawNet(ui: UI, r: Rect): void {
    const c = ui.c;
    const inner = ui.box(r, { title: t("NETWORK") });
    if (inner.h < 2) return;
    // ↓ received, ↑ sent: each its graph (scaled to the busiest moment shown)
    const half = Math.max(1, Math.floor(inner.h / 2));
    const rows: [string, number, number[], RGB, Rect][] = [
      ["↓", this.rx, this.rxHist, c.accent, { x: inner.x, y: inner.y, w: inner.w, h: half }],
      ["↑", this.tx, this.txHist, c.accentAlt, { x: inner.x, y: inner.y + half, w: inner.w, h: inner.h - half }],
    ];
    for (const [arrow, now, hist, col, b] of rows) {
      const label = `${arrow} ${rate(now)}`;
      ui.text(b.x, b.y, label, { fg: col, attrs: BOLD, raw: true });
      const gx = b.x + strWidth(label) + GAP;
      const g = { x: gx, y: b.y, w: b.x + b.w - gx, h: b.h };
      if (g.w < 4) continue;
      const shown = hist.slice(-g.w * 2);
      const top = Math.max(1, ...shown);
      ui.chart(g, shown.map((v) => v / top), col);
    }
  }
}

/** calm → busy: the accent, then amber, then red */
function heat(ui: UI, x: number): RGB {
  const c = ui.c;
  return x > 0.85 ? c.error : x > 0.6 ? mix(c.warning, c.error, (x - 0.6) / 0.25) : mix(c.accent, c.warning, Math.max(0, x - 0.35) / 0.25);
}

export const sysmonSpec: AppSpec = {
  kind: "sysmon",
  title: "Sysmon",
  description: "cpu, memory, cores, the busiest processes, disks, network",
  icon: "▤",
  launcher: true,
  create: (deck) => new SysmonApp(deck),
};
