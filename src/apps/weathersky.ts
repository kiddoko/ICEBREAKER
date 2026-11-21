/**
 * THE SKY — WEATHER's animation (Refonte UI: "nicer, more varied weather animations").
 *
 * A pure drawing: a scene (what the sky does, day or night, the wind, how hard it rains,
 * the moon's phase) and the time → the cells of a rect. No deck, no data fetching, so it
 * can move into the module sandbox as it is, and the HOME widget can use it too.
 *
 * Layers, back to front:
 *   the air (a faint gradient) · stars that twinkle, a shooting star now and then ·
 *   the sun (a disc of braille dots, rays turning) or the moon in its real phase ·
 *   clouds made of soft round puffs, two or three layers drifting with the wind ·
 *   rain slanted by the wind, splashing · snow swirling and settling · lightning that
 *   branches and lights the sky · fog banks sliding · a city skyline at the bottom,
 *   windows lit at night, a beacon blinking.
 *
 * Shapes use braille (2 × 4 dots a cell: square dots, round shapes at any size).
 */
import { mix, type RGB } from "../core/color";
import type { Rect } from "../core/grid";
import type { UI } from "../ui/ui";

export type SkyKind = "sun" | "partly" | "cloud" | "fog" | "rain" | "snow" | "storm";

export interface SkyScene {
  kind: SkyKind;
  isDay: boolean;
  /** km/h */
  wind: number;
  /** degrees, where it comes from (0 = north) */
  windDir: number;
  /** how hard it rains / snows, 0…1 */
  intensity: number;
  /** the moon's phase, 0 = new, 0.5 = full, 1 = new again */
  moon: number;
}

/** Stable pseudo-random 0…1 for (a, b). */
export const rnd = (a: number, b: number): number => {
  const h = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return h - Math.floor(h);
};

/** The moon's phase for a date (0 new … 0.5 full … 1), from a known new moon. */
export function moonPhase(date: Date): number {
  const synodic = 29.530588853;
  const days = (date.getTime() - Date.UTC(2000, 0, 6, 18, 14)) / 86_400_000;
  return (((days / synodic) % 1) + 1) % 1;
}

/** The scene for an open-meteo weather code (+ what's known of the hour). */
export function sceneFor(code: number, o: { isDay: boolean; wind: number; windDir: number; rain?: number; date?: Date }): SkyScene {
  const kind: SkyKind = code <= 1 ? "sun" : code === 2 ? "partly" : code === 3 ? "cloud" : code === 45 || code === 48 ? "fog" : code >= 95 ? "storm" : (code >= 71 && code <= 77) || code === 85 || code === 86 ? "snow" : "rain";
  // light, moderate, heavy, from the code's last digit family (51/61/71: light … 55/65/75: heavy)
  const heavy = [55, 57, 65, 67, 75, 82, 86, 99].includes(code) ? 1 : [53, 63, 73, 81, 96].includes(code) ? 0.65 : 0.35;
  const intensity = kind === "rain" || kind === "snow" || kind === "storm" ? Math.max(heavy, Math.min(1, (o.rain ?? 0) / 100)) : 0;
  return { kind, isDay: o.isDay, wind: o.wind, windDir: o.windDir, intensity, moon: moonPhase(o.date ?? new Date()) };
}

// ── braille dots ──────────────────────────────────────────────────────────────

/** A layer of braille dots over `cols × rows` cells (2 × 4 dots each). */
class Dots {
  readonly bits: Uint8Array;
  readonly W: number;
  readonly H: number;
  constructor(
    readonly cols: number,
    readonly rows: number,
  ) {
    this.bits = new Uint8Array(Math.max(0, cols * rows));
    this.W = cols * 2;
    this.H = rows * 4;
  }
  set(px: number, py: number): void {
    const x = Math.floor(px), y = Math.floor(py);
    if (x < 0 || y < 0 || x >= this.W || y >= this.H) return;
    const r = y & 3, c = x & 1;
    this.bits[(y >> 2) * this.cols + (x >> 1)] |= r === 3 ? (c ? 0x80 : 0x40) : 1 << (c * 3 + r);
  }
  /** a filled disc (dot units) */
  disc(cx: number, cy: number, rad: number, inside: (dx: number, dy: number) => boolean = () => true): void {
    for (let y = Math.floor(cy - rad); y <= cy + rad; y++)
      for (let x = Math.floor(cx - rad); x <= cx + rad; x++) {
        const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
        if (dx * dx + dy * dy <= rad * rad && inside(dx, dy)) this.set(x, y);
      }
  }
  draw(ui: UI, x0: number, y0: number, fg: RGB | ((cx: number, cy: number) => RGB), bg?: RGB): void {
    for (let i = 0; i < this.bits.length; i++) {
      if (!this.bits[i]) continue;
      const cx = i % this.cols, cy = Math.floor(i / this.cols);
      ui.text(x0 + cx, y0 + cy, String.fromCodePoint(0x2800 + this.bits[i]), { fg: typeof fg === "function" ? fg(cx, cy) : fg, bg });
    }
  }
}

// ── the sky ───────────────────────────────────────────────────────────────────

/** Draw `scene` in `r` at time `sec` (seconds). Asks for the next frame itself. */
export function drawSky(ui: UI, r: Rect, s: SkyScene, sec: number): void {
  if (r.w < 4 || r.h < 3) return;
  const c = ui.c;
  const put = (x: number, y: number, ch: string, fg: RGB, bg?: RGB) => {
    if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) ui.text(x, y, ch, { fg, bg });
  };
  const night = !s.isDay;
  const dark = s.kind === "storm" || s.kind === "rain" || s.kind === "cloud";
  // the air: a faint gradient from the top
  const top = night ? mix(c.bg, 0x0a1a3a, 0.5) : dark ? mix(c.bg, 0x5a6470, 0.18) : mix(c.bg, 0x3a7bd5, 0.16);
  for (let y = 0; y < r.h; y++) ui.fill({ x: r.x, y: r.y + y, w: r.w, h: 1 }, { bg: mix(top, c.bg, y / r.h) });
  const skyBg = (y: number) => mix(top, c.bg, (y - r.y) / r.h);

  const groundH = r.h >= 8 ? 3 : r.h >= 5 ? 2 : 1;
  const airH = r.h - groundH;
  // wind: clouds drift, rain and snow lean (positive: to the right)
  const toward = Math.sin(((s.windDir + 180) * Math.PI) / 180); // where it blows to, east > 0
  const drift = (0.5 + s.wind / 12) * (toward >= 0 ? 1 : -1);
  const lean = Math.max(-1.2, Math.min(1.2, (s.wind / 30) * toward));

  // stars: clear or partly cloudy nights
  if (night && (s.kind === "sun" || s.kind === "partly")) {
    const n = Math.floor(r.w * airH * 0.07);
    for (let i = 0; i < n; i++) {
      const x = r.x + Math.floor(rnd(i, 1) * r.w), y = r.y + Math.floor(rnd(i, 2) * airH * 0.8);
      const tw = Math.sin(sec * (1 + rnd(i, 3) * 2) + i * 1.7);
      const ch = tw > 0.85 ? "✦" : tw > 0.4 ? "·" : tw > -0.3 ? "∙" : "";
      if (ch) put(x, y, ch, mix(0xffffff, c.bg, 0.15 + (1 - tw) * 0.35), skyBg(y));
    }
    // a shooting star every 11 s or so, across the upper sky
    const k = Math.floor(sec / 11), p = (sec % 11) / 0.9;
    if (p < 1) {
      const sx = r.x + Math.floor(rnd(k, 7) * r.w * 0.6) + Math.floor(p * r.w * 0.35), sy = r.y + Math.floor(rnd(k, 8) * airH * 0.3) + Math.floor(p * 3);
      put(sx, sy, "✧", 0xffffff, skyBg(sy));
      put(sx - 1, sy, "─", mix(0xffffff, c.bg, 0.4), skyBg(sy));
      put(sx - 2, sy, "╌", mix(0xffffff, c.bg, 0.7), skyBg(sy));
    }
  }

  // the sun or the moon, upper left third
  const showOrb = s.kind === "sun" || s.kind === "partly" || (s.kind === "cloud" && !night) || s.kind === "fog";
  if (showOrb) {
    const rows = Math.max(2, Math.min(6, Math.floor(airH * 0.6)));
    const cols = rows * 2;
    const ox = r.x + Math.max(1, Math.floor(r.w * 0.22) - Math.floor(cols / 2)), oy = r.y + Math.max(0, Math.floor(airH * 0.12));
    const d = new Dots(cols, rows);
    const R = Math.min(d.W, d.H) / 2 - 0.5;
    const cx = d.W / 2, cy = d.H / 2;
    if (!night) {
      d.disc(cx, cy, R * (0.92 + 0.08 * Math.sin(sec * 1.3)));
      // a warm sun whatever the theme's warning colour (pale behind fog and clouds)
      const sunCol = s.kind === "fog" || s.kind === "cloud" ? mix(0xffcf5a, c.bg, 0.55) : 0xffcf5a;
      d.draw(ui, ox, oy, sunCol);
      // rays turning around it
      if (s.kind === "sun" || s.kind === "partly") {
        const rays = ["─", "╲", "│", "╱"];
        const n = 12;
        for (let k = 0; k < n; k++) {
          const a = (k / n) * Math.PI * 2 + sec * 0.35;
          const len = rows * 0.75 + 1.5 + (Math.sin(sec * 2.2 + k * 1.3) > 0.2 ? 1 : 0);
          const x = Math.round(ox + cols / 2 + Math.cos(a) * len * 2), y = Math.round(oy + rows / 2 + Math.sin(a) * len);
          // the stroke that points along its angle (y grows downwards: 45° is ╲)
          const ri = ((Math.round(a / (Math.PI / 4)) % 4) + 4) % 4;
          put(x, y, rays[ri], mix(0xffcf5a, c.bg, 0.25 + 0.35 * Math.abs(Math.sin(sec + k))), skyBg(y));
        }
      }
    } else {
      // the moon: lit where the phase says (waxing: the right side first)
      const ph = s.moon;
      const lit = (dx: number) => {
        const t = Math.cos(ph * 2 * Math.PI); // 1 new … -1 full
        const edge = (dx / R) * (ph < 0.5 ? 1 : -1);
        return ph < 0.5 ? edge > t : -edge > t;
      };
      const full = new Dots(cols, rows);
      full.disc(cx, cy, R);
      full.draw(ui, ox, oy, mix(0xe8e4d8, c.bg, 0.82)); // the dark side, faintly
      d.disc(cx, cy, R, (dx) => lit(dx));
      d.draw(ui, ox, oy, mix(0xf2eedd, c.bg, 0.05));
    }
  }

  // clouds: soft puffs (overlapping discs), layers drifting at their own speed
  const layers = s.kind === "sun" ? 0 : s.kind === "partly" ? 1 : s.kind === "fog" ? 1 : s.kind === "cloud" ? 3 : 3;
  const perLayer = s.kind === "partly" ? 2 : s.kind === "fog" ? 2 : 3;
  for (let L = layers - 1; L >= 0; L--) {
    const rows = Math.max(1, Math.min(airH, Math.round(airH * (s.kind === "partly" ? 0.4 : 0.5))));
    const d = new Dots(r.w, rows);
    const speed = drift * (0.6 + L * 0.5);
    for (let k = 0; k < perLayer; k++) {
      const span = d.W + 40;
      const base = rnd(L * 7 + k, 11) * span + sec * speed * 2;
      const x = (((base % span) + span) % span) - 20;
      const y = d.H * (0.35 + rnd(L, k + 3) * 0.35);
      const size = (s.kind === "partly" ? 4 : 5) + rnd(k, L + 5) * 4 + (s.kind === "storm" ? 2 : 0);
      // a cloud: a big middle puff, smaller ones on each side, a flat bottom
      for (const [dx, dy, f] of [[0, 0, 1], [-size * 0.9, size * 0.25, 0.7], [size * 0.9, size * 0.2, 0.75], [-size * 1.6, size * 0.45, 0.45], [size * 1.7, size * 0.45, 0.5], [size * 0.3, -size * 0.35, 0.65]] as const)
        d.disc(x + dx, y + dy, size * f, (_, ddy) => y + dy + ddy < y + size * 0.55);
    }
    const shade = s.kind === "storm" ? mix(0x4a4f5a, c.bg, 0.15 + L * 0.2) : night ? mix(0xb8c2d8, c.bg, 0.45 + L * 0.15) : mix(0xffffff, c.bg, (s.kind === "cloud" || s.kind === "rain" ? 0.3 : 0.12) + L * 0.18);
    const y0 = r.y + Math.floor(L * Math.max(0, airH - rows) * 0.3);
    d.draw(ui, r.x, y0, shade);
  }

  // rain: streaks leaning with the wind, splashes on the ground
  if (s.kind === "rain" || s.kind === "storm") {
    const n = Math.floor(r.w * airH * (0.03 + s.intensity * 0.08));
    const ch = lean > 0.35 ? "╲" : lean < -0.35 ? "╱" : "│";
    const fall = 9 + s.intensity * 6;
    for (let i = 0; i < n; i++) {
      const sp = fall * (0.75 + rnd(i, 9) * 0.5);
      const yy = (rnd(i, 3) * airH + sec * sp) % airH;
      const y = r.y + Math.floor(yy);
      const x = r.x + Math.floor((((rnd(i, 4) * r.w + yy * lean) % r.w) + r.w) % r.w);
      put(x, y, rnd(i, 6) > 0.35 ? ch : "'", mix(0x7fb4ea, c.bg, 0.15 + rnd(i, 7) * 0.45), skyBg(y));
    }
    // splashes on the ground line
    const gy = r.y + airH;
    const m = Math.floor(r.w * (0.05 + s.intensity * 0.12));
    for (let i = 0; i < m; i++) {
      const life = (sec * 3 + rnd(i, 12)) % 1;
      const x = r.x + Math.floor(rnd(i + Math.floor(sec * 3), 13) * r.w);
      put(x, gy, life < 0.33 ? "˙" : life < 0.66 ? "·" : "∘", mix(0x7fb4ea, c.bg, 0.3 + life * 0.4));
    }
  }

  // snow: flakes of three sizes swirling down, settling on the ground
  if (s.kind === "snow") {
    const n = Math.floor(r.w * airH * (0.025 + s.intensity * 0.06));
    for (let i = 0; i < n; i++) {
      const big = rnd(i, 8);
      const sp = 1 + big * 1.6;
      const yy = (rnd(i, 3) * airH + sec * sp) % airH;
      const y = r.y + Math.floor(yy);
      const x = r.x + Math.floor((((rnd(i, 4) * r.w + Math.sin(sec * (0.6 + big) + i) * 2 + yy * lean * 0.6) % r.w) + r.w) % r.w);
      put(x, y, big > 0.85 ? "❄" : big > 0.55 ? "∗" : "·", mix(0xffffff, c.bg, 0.05 + (1 - big) * 0.4), skyBg(y));
    }
  }

  // fog: banks sliding across the lower sky
  if (s.kind === "fog") {
    for (let i = 0; i < airH; i++) {
      const y = r.y + airH - 1 - i;
      const dens = 1 - i / airH;
      const off = sec * (0.7 + (i % 3) * 0.35) * (i % 2 ? 1 : -1);
      for (let x = 0; x < r.w; x++) {
        const v = Math.sin((x + off) * 0.25 + i * 1.3) + Math.sin((x - off * 0.6) * 0.11 + i);
        if (v > 1.1 - dens * 1.4) put(r.x + x, y, v > 1.6 - dens ? "▒" : "░", mix(0xc8ccd4, c.bg, 0.45 + (1 - dens) * 0.35), skyBg(y));
      }
    }
  }

  // lightning: a branching bolt, the sky lit for a blink
  if (s.kind === "storm") {
    const period = 4.2 + rnd(Math.floor(sec / 4.2), 2) * 2.5;
    const k = Math.floor(sec / period), ph = sec % period;
    if (ph < 0.22) {
      ui.tint({ x: r.x, y: r.y, w: r.w, h: airH }, undefined, mix(c.bg, 0xffffff, ph < 0.08 ? 0.22 : 0.1));
      let x = r.x + Math.floor(r.w * (0.2 + rnd(k, 5) * 0.6));
      for (let y = r.y + 1; y < r.y + airH; y++) {
        const step = rnd(k * 31 + y, 6) > 0.5 ? 1 : -1;
        put(x, y, step > 0 ? "╲" : "╱", 0xfff2a8);
        // a branch, now and then
        if (rnd(k, y) > 0.82) for (let j = 1; j < 3; j++) put(x - step * j, y + j, step > 0 ? "╱" : "╲", mix(0xfff2a8, c.bg, 0.4));
        x += step;
      }
    }
  }

  // the city: a skyline along the bottom, lit windows at night, a beacon on the tallest
  const gy0 = r.y + airH;
  const bodyCol = night ? mix(0x0d1020, c.bg, 0.3) : mix(0x2a2f3a, c.bg, 0.35);
  let tallest = { x: r.x, h: 0 };
  for (let x = 0; x < r.w; ) {
    const w = 2 + Math.floor(rnd(x, 21) * 4);
    const h = Math.max(1, Math.round(rnd(x, 22) * groundH * 1.4));
    const top = Math.min(groundH, h);
    for (let dx = 0; dx < w && x + dx < r.w; dx++)
      for (let dy = 0; dy < groundH; dy++) {
        const y = gy0 + groundH - 1 - dy;
        if (dy < top - 1) {
          // windows, lit at night (some), dark by day
          const winLit = night && rnd(x + dx, dy * 7 + Math.floor(sec / 6)) > 0.62;
          put(r.x + x + dx, y, winLit ? "▪" : " ", winLit ? mix(0xffd37a, c.bg, 0.15) : bodyCol, bodyCol);
        } else if (dy === top - 1) put(r.x + x + dx, y, "▄", bodyCol);
        else if (s.kind === "snow" && dy === top) put(r.x + x + dx, y, "▁", mix(0xffffff, c.bg, 0.2));
      }
    if (top > tallest.h) tallest = { x: r.x + x + Math.floor(w / 2), h: top };
    x += w;
  }
  if (tallest.h && Math.floor(sec * 1.2) % 2 === 0) put(tallest.x, gy0 + groundH - tallest.h - 1, "•", c.error, skyBg(gy0 + groundH - tallest.h - 1));
  ui.animate(s.kind === "storm" || s.kind === "rain" ? 60 : s.kind === "snow" ? 90 : 120);
}

/** A two-row picture of a sky for a small card (5 cells wide): the forecast's days. */
export function skyIcon(kind: SkyKind, isDay = true): [string, string] {
  switch (kind) {
    case "sun": return isDay ? [" \\ / ", "─ ◯ ─"] : ["  ☾  ", " ✦ · "];
    case "partly": return isDay ? [" \\_  ", "(  ◯)"] : [" ☾_  ", "(   )"];
    case "cloud": return [" .-. ", "(___)"];
    case "fog": return ["~~~~~", "═════"];
    case "rain": return ["(___)", " ╱╱╱ "];
    case "snow": return ["(___)", " ∗ ∗ "];
    case "storm": return ["(___)", " ╲ϟ╱ "];
  }
}
