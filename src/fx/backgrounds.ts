import { mix, NONE, type RGB } from "../core/color";
import type { Rect } from "../core/grid";
import type { Theme } from "../core/theme";
import type { UI } from "../ui/ui";
import { drawAmbient } from "./ambient";

/**
 * Animated backgrounds: what moves behind the panels. A theme picks one in
 * [background] (effect, density, speed, color, color2, glyphs); plugins can
 * add their own with `ib.backgrounds.register(name, description, render)`.
 *
 * Everything is a pure function of time (no state), so it costs nothing when
 * nothing is visible, and the HOME and the desktop can share an effect.
 */

export interface BackgroundParams {
  density: number;
  speed: number;
  color: RGB;
  color2: RGB;
  glyphs: string;
  /** Seconds, already multiplied by speed. */
  t: number;
}

export interface BackgroundSpec {
  name: string;
  description: string;
  /** Frames per second it needs (it sleeps the rest of the time). */
  fps: number;
  render(ui: UI, r: Rect, p: BackgroundParams): void;
}

const REGISTRY = new Map<string, BackgroundSpec>();

export function registerBackground(spec: BackgroundSpec): void {
  REGISTRY.set(spec.name, spec);
}

export function backgrounds(): BackgroundSpec[] {
  return [...REGISTRY.values()];
}

/** Draw the theme's background in `r`. `intensity` < 1 for busy areas. */
export function drawBackground(ui: UI, r: Rect, theme: Theme, intensity = 1): void {
  const b = theme.background;
  const spec = REGISTRY.get(b.effect);
  if (!spec || b.effect === "none" || r.w <= 0 || r.h <= 0) return;
  spec.render(ui, r, {
    density: b.density * intensity,
    speed: b.speed,
    color: b.color ?? theme.c.ambient,
    color2: b.color2 ?? theme.c.accent,
    glyphs: b.glyphs,
    t: (ui.now / 1000) * b.speed,
  });
  ui.animate(1000 / spec.fps);
}

// ── helpers ────────────────────────────────────────────────────────────────

/** Stable pseudo-random 0..1 from integers. */
function rnd(a: number, b = 0): number {
  let h = (a * 374761393 + b * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

const BIT = [[0x1, 0x8], [0x2, 0x10], [0x4, 0x20], [0x40, 0x80]];
/** One braille dot at a sub-cell position: the finest "pixel" we have. */
function dot(fx: number, fy: number): string {
  const col = fx < 0.5 ? 0 : 1;
  const row = Math.max(0, Math.min(3, Math.floor(fy * 4)));
  return String.fromCodePoint(0x2800 + BIT[row][col]);
}

function put(ui: UI, x: number, y: number, ch: string, fg: RGB): void {
  ui.grid.set(x, y, ch.codePointAt(0)!, fg, NONE, 0);
}

const mod = (a: number, n: number) => ((a % n) + n) % n;

// ── the built-in effects ───────────────────────────────────────────────────

registerBackground({
  name: "none",
  description: "nothing, just the color",
  fps: 1,
  render() {},
});

registerBackground({
  name: "fog",
  description: "slow drifting data fog",
  fps: 12,
  render(ui, r, p) {
    drawAmbient(ui, r, 0.4 + p.density * 0.9, p.color, p.color2, p.t / Math.max(0.1, p.speed));
  },
});

registerBackground({
  name: "snow",
  description: "fine snow in three layers (far flakes are single braille dots)",
  fps: 20,
  render(ui, r, p) {
    const n = Math.round(r.w * r.h * 0.05 * p.density);
    const glyphs = [...(p.glyphs || "·∙*")];
    for (let i = 0; i < n; i++) {
      const layer = i % 3; // 0 far … 2 near
      const fall = (0.35 + layer * 0.45) * (0.8 + rnd(i, 1) * 0.4); // rows per second
      const y = mod(rnd(i, 2) * (r.h + 4) + p.t * fall * 2.2, r.h + 4) - 2;
      const sway = Math.sin(p.t * (0.5 + rnd(i, 3)) + rnd(i, 4) * 6.28) * (0.6 + layer * 0.7);
      const x = mod(rnd(i, 5) * r.w + sway + p.t * 0.25 * (layer + 1), r.w);
      const cx = Math.floor(x), cy = Math.floor(y);
      if (cy < 0 || cy >= r.h) continue;
      const fg = layer === 0 ? mix(p.color, ui.c.bg, 0.15) : layer === 1 ? mix(p.color, p.color2, 0.25) : mix(p.color, p.color2, 0.55);
      const ch = layer === 0 ? dot(x - cx, y - cy) : glyphs[Math.min(glyphs.length - 1, layer - 1 + (rnd(i, 6) > 0.85 ? 1 : 0))];
      put(ui, r.x + cx, r.y + cy, ch, fg);
    }
  },
});

registerBackground({
  name: "rain",
  description: "faint falling glyph streams",
  fps: 15,
  render(ui, r, p) {
    const glyphs = [...(p.glyphs || "ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄ01")];
    const step = Math.max(1, Math.round(4 / Math.max(0.1, p.density)));
    for (let col = 0; col < r.w; col += step) {
      const k = col + Math.floor(rnd(col, 9) * step);
      if (k >= r.w) continue;
      const speed = 3 + rnd(k, 1) * 6;
      const len = 4 + Math.floor(rnd(k, 2) * 10);
      const span = r.h + len + Math.floor(rnd(k, 3) * r.h);
      const head = mod(p.t * speed + rnd(k, 4) * span, span);
      for (let j = 0; j < len; j++) {
        const y = Math.floor(head) - j;
        if (y < 0 || y >= r.h) continue;
        const ch = glyphs[Math.floor(rnd(k * 31 + y, Math.floor(p.t * 4) + (j < 2 ? 0 : 7)) * glyphs.length)];
        const fade = 1 - j / len;
        put(ui, r.x + k, r.y + y, ch, j === 0 ? mix(p.color, p.color2, 0.6) : mix(ui.c.bg, p.color, 0.35 + fade * 0.6));
      }
    }
  },
});

registerBackground({
  name: "stars",
  description: "a quiet starfield that twinkles, with the odd shooting star",
  fps: 10,
  render(ui, r, p) {
    const n = Math.round(r.w * r.h * 0.03 * p.density);
    for (let i = 0; i < n; i++) {
      const x = mod(Math.floor(rnd(i, 1) * r.w + p.t * 0.15 * (1 + (i % 3))), r.w);
      const y = Math.floor(rnd(i, 2) * r.h);
      const tw = (Math.sin(p.t * (0.8 + rnd(i, 3) * 2) + rnd(i, 4) * 6.28) + 1) / 2;
      const big = rnd(i, 5) > 0.93;
      const ch = big ? (tw > 0.7 ? "✦" : "+") : tw > 0.6 ? "·" : dot(rnd(i, 6), rnd(i, 7));
      put(ui, r.x + x, r.y + y, ch, mix(ui.c.bg, big ? p.color2 : p.color, 0.35 + tw * 0.65));
    }
    // a shooting star every ~7 s
    const cycle = Math.floor(p.t / 7);
    const age = p.t - cycle * 7;
    if (age < 0.9) {
      const sx = rnd(cycle, 11) * r.w, sy = rnd(cycle, 12) * r.h * 0.5;
      for (let k = 0; k < 8; k++) {
        const x = Math.floor(sx + (age * 40 - k) * 1.6), y = Math.floor(sy + (age * 40 - k) * 0.5);
        if (x >= 0 && x < r.w && y >= 0 && y < r.h) put(ui, r.x + x, r.y + y, k === 0 ? "✦" : "·", mix(ui.c.bg, p.color2, 1 - k / 9));
      }
    }
  },
});

registerBackground({
  name: "embers",
  description: "sparks rising from below, flickering out",
  fps: 20,
  render(ui, r, p) {
    const n = Math.round(r.w * r.h * 0.025 * p.density);
    const glyphs = [...(p.glyphs || "·∙•")];
    for (let i = 0; i < n; i++) {
      const life = 3 + rnd(i, 1) * 5;
      const age = mod(p.t + rnd(i, 2) * life, life) / life; // 0 born → 1 gone
      const y = r.h - 1 - age * r.h * (0.5 + rnd(i, 3) * 0.6);
      const x = mod(rnd(i, 4) * r.w + Math.sin(p.t * 1.7 + i) * 1.2 + age * 3 * (rnd(i, 5) - 0.5), r.w);
      const cy = Math.floor(y), cx = Math.floor(x);
      if (cy < 0 || cy >= r.h) continue;
      const flick = rnd(i, Math.floor(p.t * 8)) > 0.2 ? 1 : 0.4;
      const heat = (1 - age) * flick;
      const ch = heat > 0.65 ? glyphs[glyphs.length - 1] : heat > 0.3 ? glyphs[Math.min(1, glyphs.length - 1)] : dot(x - cx, y - cy);
      put(ui, r.x + cx, r.y + cy, ch, mix(mix(p.color, p.color2, heat), ui.c.bg, 0.15 + (1 - heat) * 0.5));
    }
  },
});

registerBackground({
  name: "scan",
  description: "a faint dot grid with a slow CRT sweep",
  fps: 15,
  render(ui, r, p) {
    const gx = Math.max(3, Math.round(8 - p.density * 4)), gy = Math.max(2, Math.round(4 - p.density * 2));
    const sweep = mod(p.t * 2.5, r.h + 12) - 6;
    for (let y = 0; y < r.h; y++) {
      const d = Math.abs(y - sweep);
      const glow = d < 6 ? 1 - d / 6 : 0;
      for (let x = 0; x < r.w; x++) {
        const onGrid = x % gx === 0 && y % gy === 0;
        if (!onGrid && glow < 0.85) continue;
        const ch = onGrid ? (glow > 0.3 ? "+" : "·") : "─";
        if (!onGrid && (x + Math.floor(p.t * 6)) % 5 !== 0) continue;
        put(ui, r.x + x, r.y + y, ch, mix(mix(ui.c.bg, p.color, 0.7), p.color2, glow * 0.8));
      }
    }
  },
});

registerBackground({
  name: "grain",
  description: "still paper grain: a few faint specks that never move (e-ink)",
  fps: 1,
  render(ui, r, p) {
    const n = Math.round(r.w * r.h * 0.02 * p.density);
    const glyphs = [...(p.glyphs || "·.˙")];
    for (let i = 0; i < n; i++) {
      const x = Math.floor(rnd(i, 21) * r.w), y = Math.floor(rnd(i, 22) * r.h);
      put(ui, r.x + x, r.y + y, glyphs[i % glyphs.length], mix(ui.c.bg, p.color, 0.25 + rnd(i, 23) * 0.25));
    }
  },
});

registerBackground({
  name: "circuit",
  description: "circuit-board traces with data pulses running along them",
  fps: 15,
  render(ui, r, p) {
    // traces on a coarse grid: each one a horizontal run then a vertical one
    const n = Math.max(3, Math.round((r.w * r.h) / 260 * p.density));
    for (let i = 0; i < n; i++) {
      const x0 = Math.floor(rnd(i, 31) * r.w), y0 = Math.floor(rnd(i, 32) * r.h);
      const len = 6 + Math.floor(rnd(i, 33) * 18), drop = Math.floor((rnd(i, 34) - 0.5) * 10);
      const dir = rnd(i, 35) > 0.5 ? 1 : -1;
      const cells: [number, number, string][] = [];
      for (let k = 0; k < len; k++) cells.push([x0 + k * dir, y0, "─"]);
      const xc = x0 + len * dir;
      cells.push([xc, y0, drop === 0 ? "•" : drop > 0 ? (dir > 0 ? "┐" : "┌") : dir > 0 ? "┘" : "└"]);
      for (let k = 1; k <= Math.abs(drop); k++) cells.push([xc, y0 + k * Math.sign(drop), k === Math.abs(drop) ? "•" : "│"]);
      cells.unshift([x0 - dir, y0, "○"]);
      // the pulse: a bright spot running from one end to the other
      const period = 3 + rnd(i, 36) * 5;
      const head = mod(p.t + rnd(i, 37) * period, period) / period * (cells.length + 6) - 3;
      cells.forEach(([x, y, ch], k) => {
        if (x < 0 || y < 0 || x >= r.w || y >= r.h) return;
        const d = Math.abs(k - head);
        const glow = d < 3 ? 1 - d / 3 : 0;
        put(ui, r.x + x, r.y + y, ch, mix(mix(ui.c.bg, p.color, 0.55), p.color2, glow));
      });
    }
  },
});

registerBackground({
  name: "sonar",
  description: "slow sonar rings from the deep, fading as they spread",
  fps: 12,
  render(ui, r, p) {
    const pings = Math.max(1, Math.round(3 * p.density));
    for (let i = 0; i < pings; i++) {
      const period = 6 + i * 1.7;
      const cyc = Math.floor((p.t + i * 2.3) / period);
      const age = ((p.t + i * 2.3) % period) / period;
      const cx = rnd(cyc, 41 + i) * r.w, cy = rnd(cyc, 51 + i) * r.h;
      const R = age * Math.max(r.w, r.h) * 0.6;
      const steps = Math.max(24, Math.round(R * 4));
      const col = mix(mix(ui.c.bg, p.color, 0.8), p.color2, (1 - age) * 0.6);
      for (let k = 0; k < steps; k++) {
        if (rnd(k, cyc * 7 + i) > 0.55 + (1 - age) * 0.4) continue;
        const a = (k / steps) * Math.PI * 2;
        const x = Math.round(cx + Math.cos(a) * R * 2), y = Math.round(cy + Math.sin(a) * R);
        if (x >= 0 && y >= 0 && x < r.w && y < r.h) put(ui, r.x + x, r.y + y, age < 0.5 ? "∘" : "·", mix(col, ui.c.bg, age));
      }
    }
  },
});
