import { mix, NONE, type RGB } from "../core/color";
import type { Grid } from "../core/grid";
import type { Theme } from "../core/theme";

/**
 * Theme motion applied to the finished frame, after everything is drawn:
 *
 *  - page transitions ([anim] page): eink — a black then white refresh flash
 *    and the ink settling, like an e-paper screen; wipe — the new page rolls
 *    in under a bright line; fade — it comes up from the background.
 *    ("glitch" is fx/glitch.ts, the classic one.)
 *  - cell changes ([anim] type): characters that just changed — what you
 *    type, new output — ink: settle in from grey; glow: flash then cool down.
 */
export class Transitions {
  private kind = "";
  private start = 0;
  private dur = 0;

  run(kind: string, ms: number): void {
    this.kind = kind;
    this.start = performance.now();
    this.dur = ms;
  }

  /** True while it's animating (ask for the next frame). */
  apply(g: Grid, theme: Theme, now: number): boolean {
    const t = now - this.start;
    if (!this.kind || t >= this.dur) return false;
    const p = t / this.dur;
    const bg = theme.c.bg, ink = theme.c.fg;
    const n = g.cols * g.rows;
    if (this.kind === "eink") {
      // 0–18 %: black · 18–36 %: white · then the page, its ink still settling
      if (p < 0.36) {
        const fill = p < 0.18 ? ink : bg;
        g.ch.fill(32);
        g.bg.fill(fill);
        return true;
      }
      const k = 1 - (p - 0.36) / 0.64;
      for (let i = 0; i < n; i++) g.fg[i] = mix(g.fg[i] === NONE ? ink : g.fg[i], bg, k * 0.55);
      return true;
    }
    if (this.kind === "wipe") {
      // a bright line rolls down over the new page (already there: never a dark screen)
      const edge = Math.floor(p * (g.rows + 2));
      if (edge < g.rows) {
        const row = edge * g.cols;
        for (let x = 0; x < g.cols; x++) g.fg[row + x] = mix(g.fg[row + x] === NONE ? ink : g.fg[row + x], theme.c.accent, 0.8);
      }
      for (let y = Math.max(0, edge + 1); y < g.rows; y++) {
        const row = y * g.cols;
        for (let x = 0; x < g.cols; x++) g.fg[row + x] = mix(g.fg[row + x] === NONE ? ink : g.fg[row + x], bg, 0.3);
      }
      return true;
    }
    if (this.kind === "fade") {
      // from 40 % dimmed, not from black
      const k = (1 - p) * 0.4;
      for (let i = 0; i < n; i++) {
        g.fg[i] = mix(g.fg[i] === NONE ? ink : g.fg[i], bg, k);
        if (g.bg[i] !== NONE) g.bg[i] = mix(g.bg[i], bg, k);
      }
      return true;
    }
    return false;
  }
}

export class CellFx {
  private prev = new Uint32Array(0);
  private at = new Float64Array(0);

  /** True while some cells are still settling. */
  apply(g: Grid, theme: Theme, now: number): boolean {
    const mode = theme.anim.type;
    const n = g.cols * g.rows;
    if (this.prev.length !== n) {
      this.prev = new Uint32Array(g.ch);
      this.at = new Float64Array(n);
      return false;
    }
    if (mode !== "ink" && mode !== "glow") return false;
    const dur = mode === "ink" ? 260 : 420;
    // a whole new page is a page change, not typing: leave it to [anim] page
    let changed = 0;
    for (let i = 0; i < n; i++) if (g.ch[i] !== this.prev[i]) changed++;
    const pageChange = changed > n * 0.15;
    let busy = false;
    const bg = theme.c.bg, accent = theme.c.accent;
    for (let i = 0; i < n; i++) {
      if (g.ch[i] !== this.prev[i]) {
        this.prev[i] = g.ch[i];
        this.at[i] = pageChange || g.ch[i] === 32 ? 0 : now;
      }
      const age = now - this.at[i];
      if (age >= dur) continue;
      busy = true;
      const k = 1 - age / dur;
      const fg: RGB = g.fg[i] === NONE ? theme.c.fg : g.fg[i];
      const back: RGB = g.bg[i] === NONE ? bg : g.bg[i];
      g.fg[i] = mode === "ink" ? mix(fg, back, k * 0.7) : mix(fg, accent, k);
    }
    return busy;
  }
}
