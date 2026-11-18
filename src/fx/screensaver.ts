/**
 * The screensaver: a night city in ASCII — towers with flickering windows,
 * neon signs, rain, a searchlight sweeping the clouds, a drone crossing, the
 * time in big dot-matrix digits, and a ticker of netrunner chatter.
 * Everything is a function of the time: no state, any size.
 */
import { mix } from "../core/color";
import { BOLD, type Rect } from "../core/grid";
import { fitMatrix, matrixSize, matrixText } from "../ui/dots";
import type { UI } from "../ui/ui";

const rnd = (a: number, b: number) => {
  const h = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return h - Math.floor(h);
};
const TICKER = [
  "ICE DETECTED ON SUBNET 7 · ROUTING AROUND",
  "UPLINK STABLE · 0 PACKETS LOST",
  "NEON DISTRICT CURFEW LIFTED AT 05:00",
  "WEATHER: ACID DRIZZLE, VISIBILITY LOW",
  "DECK IDLE · ALL SYSTEMS NOMINAL",
  "SIGNAL FROM ORBIT · DECRYPTING…",
  "KEEP YOUR NOTES CLOSE AND YOUR KEYS CLOSER",
];
const SIGNS = ["ICE", "NOODLES", "ホテル", "BAR", "24H", "NEXUS", "シティ", "OPEN"];

export function drawScreensaver(ui: UI, r: Rect): void {
  const c = ui.c;
  const t = ui.now / 1000;
  ui.fill(r, { bg: c.bg });
  const ground = r.y + r.h - 3;

  // sky: a few stars, the searchlight sweeping
  for (let i = 0; i < r.w / 3; i++) if (Math.sin(t * 0.8 + i) > 0.6) ui.text(r.x + Math.floor(rnd(i, 1) * r.w), r.y + Math.floor(rnd(i, 2) * r.h * 0.35), "·", { fg: c.faint });
  const beamX = r.x + r.w * (0.5 + Math.sin(t * 0.25) * 0.4);
  for (let y = r.y; y < ground; y++) {
    const spread = (ground - y) * 0.35;
    const x = Math.round(beamX + (ground - y) * Math.sin(t * 0.25) * 0.6);
    for (let dx = -spread; dx <= spread; dx += 1) if (rnd(x + dx, y) > 0.82) ui.text(Math.round(x + dx), y, "░", { fg: mix(c.bg, c.accent, 0.12) });
  }

  // towers: far ones dim, near ones bright, windows flickering, neon signs
  for (const [layer, dim] of [[0, 0.75], [1, 0.4], [2, 0]] as const) {
    let x = r.x - Math.floor(rnd(layer, 9) * 6);
    let k = 0;
    while (x < r.x + r.w) {
      const w = 4 + Math.floor(rnd(k, layer + 3) * (6 + layer * 3));
      const h = Math.floor((0.25 + rnd(k, layer + 5) * (0.35 + layer * 0.12)) * (ground - r.y));
      const top = ground - h;
      const wall = mix(c.panel, c.bg, dim);
      ui.fill({ x, y: top, w, h }, { bg: wall });
      for (let yy = top + 1; yy < ground; yy += 2)
        for (let xx = x + 1; xx < x + w - 1; xx += 2) {
          const lit = rnd(xx * 3 + layer, yy) > 0.55 && Math.sin(t * 0.3 + rnd(xx, yy) * 40) > -0.85;
          if (lit) ui.text(xx, yy, "▪", { fg: mix(rnd(xx, yy * 2) > 0.7 ? c.accentAlt : c.warning, wall, 0.25 + dim * 0.6), bg: wall });
        }
      if (layer === 2 && rnd(k, 77) > 0.55 && w >= 6) {
        const sign = SIGNS[k % SIGNS.length];
        const on = Math.sin(t * 3 + k) > -0.7 || rnd(Math.floor(t * 8), k) > 0.3;
        ui.text(x + 1, top + 2, sign.slice(0, w - 2), { fg: on ? (k % 2 ? c.accent : c.accentAlt) : c.faint, attrs: BOLD, bg: wall });
      }
      x += w + (layer === 2 ? 1 : 0);
      k++;
    }
  }
  ui.hline(r.x, ground, r.w, { fg: mix(c.accent, c.bg, 0.5) }, "▀");

  // a drone crossing, blinking
  const dx = r.x + Math.floor(((t * 6) % (r.w + 20)) - 10), dy = r.y + Math.floor(r.h * 0.18 + Math.sin(t) * 2);
  ui.text(dx, dy, "-=◘=-", { fg: c.subtle });
  if (Math.floor(t * 2) % 2) ui.text(dx + 2, dy + 1, "•", { fg: c.error });

  // rain over everything
  const n = Math.floor(r.w * r.h * 0.03);
  for (let i = 0; i < n; i++) {
    const y = r.y + Math.floor((rnd(i, 3) * r.h + t * (14 + rnd(i, 4) * 8)) % r.h);
    const x = r.x + Math.floor((rnd(i, 5) * r.w + r.w - (y - r.y) * 0.25) % r.w);
    ui.text(x, y, "╱", { fg: mix(c.info, c.bg, 0.45 + rnd(i, 6) * 0.4) });
  }

  // the time, big, with a glitch now and then
  const now = new Date();
  const time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const kk = fitMatrix(time, Math.floor(r.w * 0.6), Math.floor(r.h * 0.3), 2) || fitMatrix(time, r.w - 4, r.h - 6, 1);
  if (kk) {
    const sz = matrixSize(time, kk);
    const glitch = rnd(Math.floor(t * 4), 3) > 0.94 ? (rnd(Math.floor(t * 20), 1) > 0.5 ? 1 : -1) : 0;
    const tx = r.x + Math.floor((r.w - sz.w) / 2) + glitch, ty = r.y + Math.floor(r.h * 0.12);
    const grad = ui.theme.gradient.length ? ui.theme.gradient : [c.accent, c.accentAlt];
    matrixText(ui, tx, ty, time, kk, (row, rows) => grad[Math.min(grad.length - 1, Math.floor((row / rows) * grad.length))]);
    ui.textCenter(r, ty + sz.h + 1, now.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" }).toUpperCase(), { fg: c.subtle });
  }

  // the ticker
  const msg = `   ◆ ${TICKER.join("   ◆ ")}`;
  const off = Math.floor(t * 8) % msg.length;
  const line = (msg.slice(off) + msg).slice(0, r.w);
  ui.fill({ x: r.x, y: r.y + r.h - 1, w: r.w, h: 1 }, { bg: c.panelAlt });
  ui.text(r.x, r.y + r.h - 1, line, { fg: c.accent, bg: c.panelAlt });
  ui.text(r.x + r.w - 22, r.y + r.h - 2, " any key to jack in ", { fg: c.faint });
  ui.animate(80);
}
