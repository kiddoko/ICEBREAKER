import { BOLD, type Rect } from "../core/grid";
import type { Deck } from "../deck";
import type { SystemStats } from "../platform/types";
import { formatUptime } from "../shell/commands/system";
import type { UI } from "../ui/ui";
import type { App, AppSpec } from "./types";
import { Bar, INSET } from "../ui/layout";

/** SYSMON — live CPU / memory with braille graphs. Polls once per second while open. */
export class SysmonApp implements App {
  readonly kind = "sysmon";
  readonly key = "sysmon";
  private stats: SystemStats | null = null;
  private cpuHist: number[] = [];
  private memHist: number[] = [];
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
      this.cpuHist.push(s.cpu / 100);
      this.memHist.push(s.memUsed / Math.max(1, s.memTotal));
      if (this.cpuHist.length > 400) this.cpuHist.shift();
      if (this.memHist.length > 400) this.memHist.shift();
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
    return this.stats ? `${this.stats.host} · ${this.stats.processes} procs · up ${formatUptime(this.stats.uptime)}` : "sampling…";
  }

  close(): boolean {
    clearInterval(this.timer);
    return true;
  }

  render(ui: UI, r: Rect, focused: boolean): void {
    const s = this.stats;
    const c = ui.c;
    if (!s) {
      ui.textCenter(r, r.y + 2, this.error ? `✖ ${this.error}` : `${ui.spinner()} sampling vitals…`, { fg: this.error ? c.error : c.accent });
      return;
    }
    const gb = (n: number) => `${(n / 1024 ** 3).toFixed(1)}G`;
    const half = Math.floor(r.w / 2);

    // header
    // the cpu on the left, the system on the right: both shrink (…) rather than overlap
    new Bar(ui, r.x + INSET, r.y, r.x + r.w - INSET)
      .text(s.cpuBrand || "cpu", { fg: c.muted }, { priority: 9, fit: 8 })
      .text(`${s.os} · ${s.arch}`, { fg: c.subtle }, { side: "right", priority: 5, fit: 6 })
      .draw();

    // CPU graph
    const graphH = Math.max(3, Math.floor((r.h - 8) / 2));
    const cpuBox = ui.box({ x: r.x, y: r.y + 1, w: r.w, h: graphH + 2 }, { title: `CPU ${s.cpu.toFixed(1)}%`, focused, info: `${s.cores.length} cores` });
    ui.chart(cpuBox, this.cpuHist, c.accent);

    // memory graph
    const memRatio = s.memUsed / Math.max(1, s.memTotal);
    const memBox = ui.box({ x: r.x, y: r.y + 3 + graphH, w: half, h: graphH + 2 }, { title: `MEM ${gb(s.memUsed)} / ${gb(s.memTotal)}`, info: `${(memRatio * 100).toFixed(0)}%` });
    ui.chart(memBox, this.memHist, c.accentAlt);

    // cores
    const coreBox = ui.box({ x: r.x + half, y: r.y + 3 + graphH, w: r.w - half, h: graphH + 2 }, { title: "CORES" });
    const cols = Math.max(1, Math.floor(coreBox.w / 18));
    s.cores.forEach((u, i) => {
      const x = coreBox.x + (i % cols) * 18;
      const y = coreBox.y + Math.floor(i / cols);
      if (y >= coreBox.y + coreBox.h) return;
      ui.text(x, y, String(i).padStart(2), { fg: c.subtle });
      ui.bar(x + 3, y, 10, u / 100, u > 80 ? c.error : u > 50 ? c.warning : c.accent);
      ui.text(x + 14, y, `${Math.round(u)}`.padStart(3), { fg: c.muted });
    });

    // footer
    const fy = r.y + 5 + graphH * 2;
    if (fy < r.y + r.h) {
      const parts = [
        ["host", s.host],
        ["uptime", formatUptime(s.uptime)],
        ["procs", String(s.processes)],
        ["swap", s.swapTotal ? `${gb(s.swapUsed)}/${gb(s.swapTotal)}` : "none"],
        ["vault", `${this.deck.vault.markdown().length} notes`],
        ["fps", `${this.deck.loop.fps} · ${this.deck.loop.frameMs.toFixed(1)}ms`],
      ];
      let x = r.x + 1;
      for (const [k, v] of parts) {
        x = ui.text(x, fy, `${k} `, { fg: c.subtle });
        x = ui.text(x, fy, v, { fg: c.fg, attrs: BOLD }) + 3;
      }
    }
  }
}

export const sysmonSpec: AppSpec = {
  kind: "sysmon",
  title: "Sysmon",
  description: "cpu, memory, cores",
  icon: "▤",
  launcher: true,
  create: (deck) => new SysmonApp(deck),
};
