/**
 * The screensaver: a night city in ASCII — towers with flickering windows,
 * neon signs, rain, a searchlight sweeping the clouds, a drone crossing, the
 * time in big dot-matrix digits, and a ticker of netrunner chatter.
 * Everything is a function of the time: no state, any size.
 */
import { dateLocale } from "../core/i18n";
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

/** The theme picks its screensaver ([anim] screensaver). */
export function drawScreensaver(ui: UI, r: Rect): void {
  const kind = ui.theme.anim.screensaver;
  if (kind === "paper") return drawPaper(ui, r);
  if (kind === "terminal") return drawTerminal(ui, r);
  if (kind === "sonar") return drawSonar(ui, r);
  if (kind === "warp") return drawWarp(ui, r);
  drawCity(ui, r);
}

const time2 = () => {
  const n = new Date();
  return `${String(n.getHours()).padStart(2, "0")}:${String(n.getMinutes()).padStart(2, "0")}`;
};

/** the time in big dot-matrix digits, centred on (cx, cy) */
function bigTime(ui: UI, r: Rect, cx: number, cy: number, color: (row: number, rows: number) => number, maxW = r.w * 0.5): number {
  const time = time2();
  const k = fitMatrix(time, Math.floor(maxW), Math.floor(r.h * 0.3), 2) || fitMatrix(time, r.w - 4, r.h - 6, 1);
  if (!k) return cy;
  const sz = matrixSize(time, k);
  matrixText(ui, Math.round(cx - sz.w / 2), Math.round(cy - sz.h / 2), time, k, color);
  return Math.round(cy + sz.h / 2);
}

const LOG = [
  "MEM CHECK ........ OK", "VAULT INDEX ...... SYNCED", "UPLINK ........... STANDBY", "ICE SCAN ......... NOTHING NEW",
  "CRON  0 7 * * *   daily", "TAPE 2 REWIND .... DONE", "PUNCH CARD 0451 READ", "CORE TEMP 41C", "PRINTER OFFLINE",
  "SLEEP MODE: ANY KEY TO WAKE", "LOGIN: netrunner", "NOTES PENDING .... 0", "BACKUP ........... TONIGHT",
];

/**
 * A mainframe console from the 80s, for the phosphor themes: a log types itself
 * line by line, hex dumps scroll by, the time in big digits, a blinking block.
 */
function drawTerminal(ui: UI, r: Rect): void {
  const c = ui.c;
  const t = ui.now / 1000;
  ui.fill(r, { bg: c.bg });
  const lineEvery = 0.9; // seconds per line
  const rows = r.h - 2;
  const n = Math.floor(t / lineEvery) + rows; // the screen is full from the start
  for (let i = 0; i < rows; i++) {
    const k = n - (rows - 1 - i);
    if (k < 0) continue;
    const hex = Array.from({ length: 6 }, (_, j) => Math.floor(rnd(k, j) * 65536).toString(16).padStart(4, "0").toUpperCase()).join(" ");
    let line = rnd(k, 9) > 0.45 ? `${String(k * 16).padStart(6, "0")}  ${hex}` : `> ${LOG[Math.floor(rnd(k, 3) * LOG.length)]}`;
    // the newest line types itself
    if (i === rows - 1) line = line.slice(0, Math.floor(((t % lineEvery) / lineEvery) * line.length * 1.4));
    ui.text(r.x + 2, r.y + 1 + i, line, { fg: i === rows - 1 ? c.fg : mix(c.bg, c.fg, 0.25 + (i / rows) * 0.5) }, Math.floor(r.w * 0.55));
    if (i === rows - 1 && Math.floor(t * 2) % 2 === 0) ui.text(r.x + 2 + line.length, r.y + 1 + i, "█", { fg: c.accent });
  }
  // the time, right side, in a frame
  const bx = r.x + Math.floor(r.w * 0.62), bw = r.w - (bx - r.x) - 2;
  if (bw > 14) {
    const box = { x: bx, y: r.y + 2, w: bw, h: Math.min(r.h - 4, 12) };
    ui.box(box, { border: "double", fill: true, bg: c.bg, title: "SYSTEM CLOCK" });
    const bottom = bigTime(ui, box, box.x + box.w / 2, box.y + box.h / 2 - 1, () => c.accent, box.w - 4);
    ui.textCenter(box, Math.min(box.y + box.h - 2, bottom + 1), new Date().toLocaleDateString(dateLocale(), { weekday: "short", day: "numeric", month: "short" }).toUpperCase(), { fg: c.subtle });
  }
  ui.textRight(r.x + r.w - 2, r.y + r.h - 1, "READY. ANY KEY", { fg: c.subtle });
  ui.animate(60);
}

/**
 * Deep-sea sonar for abyss: rings spreading from the middle, a sweep turning,
 * echoes lighting up when it passes, the time in the centre.
 */
function drawSonar(ui: UI, r: Rect): void {
  const c = ui.c;
  const t = ui.now / 1000;
  ui.fill(r, { bg: c.bg });
  const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
  const maxR = Math.min(r.h / 2 - 1, (r.w / 2 - 1) * ui.cellAspect);
  const sweep = (t * 0.9) % (Math.PI * 2);
  for (let y = r.y; y < r.y + r.h; y++) {
    for (let x = r.x; x < r.x + r.w; x++) {
      const dx = (x - cx) * ui.cellAspect, dy = y - cy;
      const d = Math.hypot(dx, dy);
      if (d > maxR) continue;
      const a = (Math.atan2(dy, dx) + Math.PI * 2) % (Math.PI * 2);
      const behind = (sweep - a + Math.PI * 2) % (Math.PI * 2); // 0 = the sweep is on it
      // range rings (every quarter), the outer rim, a pulse spreading out, the sweep's thin fading trail
      const ringStep = maxR / 4;
      const ring = Math.abs(d - Math.round(d / ringStep) * ringStep) < 0.45 && d > 0.5;
      const rim = d > maxR - 0.6;
      const pulse = Math.abs(d - ((t * maxR * 0.35) % maxR)) < 0.45;
      const trail = behind < 0.7 ? 1 - behind / 0.7 : 0;
      // echoes: fixed points that light up when the sweep passes
      const echo = rnd(Math.round(x / 3), Math.round(y / 2)) > 0.992 && d > maxR * 0.2;
      let ch = "", k = 0;
      if (echo) (ch = "◆"), (k = 0.3 + trail * 0.7);
      else if (behind < 0.06) (ch = "•"), (k = 0.9); // the sweep line itself
      else if (trail > 0.05 && rnd(x, y) > 0.7) (ch = "·"), (k = trail * 0.7);
      else if (rim) (ch = "·"), (k = 0.45);
      else if (pulse) (ch = "∘"), (k = 0.4);
      else if (ring) (ch = "·"), (k = 0.3);
      if (ch) ui.text(x, y, ch, { fg: mix(c.bg, echo ? c.accentAlt : c.accent, k) });
    }
  }
  const bottom = bigTime(ui, r, cx, cy, () => c.fg, maxR / ui.cellAspect);
  ui.textCenter(r, Math.min(r.y + r.h - 2, bottom + 1), "· · · depth 4 000 m · · ·", { fg: c.subtle });
  ui.animate(70);
}

/** Hyperspace for ghost / nightshade: stars rushing out from the centre, the time holding still. */
function drawWarp(ui: UI, r: Rect): void {
  const c = ui.c;
  const t = ui.now / 1000;
  ui.fill(r, { bg: c.bg });
  const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
  for (let i = 0; i < 320; i++) {
    const ang = rnd(i, 1) * Math.PI * 2;
    const speed = 0.4 + rnd(i, 2) * 0.8;
    const z = (rnd(i, 3) + t * speed * 0.35) % 1; // 0 far → 1 here
    const dist = z * z * Math.max(r.w, r.h) * 0.75;
    const x = Math.round(cx + Math.cos(ang) * dist / ui.cellAspect * 0.5), y = Math.round(cy + Math.sin(ang) * dist * 0.5);
    if (x < r.x || x >= r.x + r.w || y < r.y || y >= r.y + r.h) continue;
    const ch = z > 0.75 ? (Math.abs(Math.cos(ang)) > 0.75 ? "━" : Math.abs(Math.sin(ang)) > 0.75 ? "┃" : "✦") : z > 0.4 ? "•" : "·";
    ui.text(x, y, ch, { fg: mix(c.bg, z > 0.6 ? c.fg : c.accent, 0.45 + z * 0.55), attrs: z > 0.75 ? BOLD : 0 });
  }
  const bottom = bigTime(ui, r, cx, cy - 1, (row, rows) => (ui.theme.gradient[Math.min(ui.theme.gradient.length - 1, Math.floor((row / rows) * ui.theme.gradient.length))] ?? c.accent));
  ui.textCenter(r, Math.min(r.y + r.h - 2, bottom + 1), new Date().toLocaleDateString(dateLocale(), { weekday: "long", day: "numeric", month: "long" }), { fg: c.subtle });
  ui.animate(40);
}

const PAPER_LINES = [
  "the page waits for you",
  "rest your eyes · the ink keeps your words",
  "nothing is lost while the deck sleeps",
  "a quiet screen is a full battery",
  "come back when the kettle sings",
];

/**
 * e-ink's sleep screen, like an e-reader: an engraving of a moon over hills in
 * shades of ink, the time and the date, a line of text. It changes once a
 * minute (with the theme's page flash), never in between: e-paper holds still.
 */
function drawPaper(ui: UI, r: Rect): void {
  const c = ui.c;
  const now = new Date();
  ui.fill(r, { bg: c.bg });
  // a thin double frame, like a book plate
  const m = Math.max(1, Math.floor(Math.min(r.w, r.h) * 0.06));
  const f = { x: r.x + m * 2, y: r.y + m, w: r.w - m * 4, h: r.h - m * 2 };
  if (f.w > 20 && f.h > 10) {
    ui.box(f, { border: "single", bg: c.bg, fill: false });
    ui.box({ x: f.x + 1, y: f.y + 1, w: f.w - 2, h: f.h - 2 }, { border: "single", bg: c.bg, fill: false });
  }
  const art = { x: f.x + 3, y: f.y + 2, w: f.w - 6, h: Math.floor((f.h - 4) * 0.48) };
  // light shades only: an engraving, not a wall of blocks
  const shade = ["", "·", "∙", "░", "▒", "▓"];
  const ink = (k: number) => mix(c.bg, c.fg, 0.18 + k * 0.62);
  const seed = now.getHours() * 60 + now.getMinutes();
  // the moon: a crescent (the lit disc minus a shifted shadow disc), somewhere new each minute
  const mx = art.x + art.w * (0.22 + rnd(seed, 1) * 0.56), my = art.y + art.h * 0.3;
  const rad = Math.max(2, Math.min(art.h * 0.24, art.w * 0.1));
  const ridge = (fx: number, base: number, amp: number, f1: number, f2: number, ph: number) =>
    art.y + art.h * (base + amp * Math.sin(fx * f1 + ph) + amp * 0.45 * Math.sin(fx * f2 + ph * 1.7));
  for (let y = art.y; y < art.y + art.h; y++) {
    for (let x = art.x; x < art.x + art.w; x++) {
      const fx = (x - art.x) / art.w;
      const n = rnd(x, y);
      // three hills, far → near: lighter and sparser far away, denser in front
      const far = ridge(fx, 0.5, 0.16, 3, 8, seed * 0.13);
      const mid = ridge(fx, 0.68, 0.12, 5, 12, 2 + seed * 0.07);
      const near = ridge(fx, 0.84, 0.08, 7, 17, 4.1);
      let k = 0;
      if (y >= near) k = n > 0.2 ? 3 : 2;
      else if (y >= mid) k = n > 0.5 ? 2 : 1;
      else if (y >= far) k = n > 0.55 ? 1 : 0;
      else {
        const dx = (x - mx) * ui.cellAspect, dy = y - my; // columns → rows: a round moon
        const lit = Math.hypot(dx, dy) < rad;
        const shadow = Math.hypot(dx - rad * 0.55, dy - rad * 0.15) < rad * 0.95;
        if (lit && !shadow) k = 4;
        else if (lit) k = n > 0.55 ? 1 : 0; // the dark part, barely there
        else if (Math.hypot(dx, dy) < rad * 1.7 && n > 0.93) k = 1; // halo
        else if (rnd(x * 3, y * 7) > 0.988) k = 2; // a star
      }
      if (k > 0) ui.text(x, y, shade[k], { fg: ink(k / 5) });
    }
  }
  ui.hline(art.x, art.y + art.h, art.w, { fg: ink(0.6) }, "─");
  // the time, big, and the date
  const time = now.toLocaleTimeString(dateLocale(), { hour: "2-digit", minute: "2-digit" });
  const below = art.y + art.h + 1;
  const kk = fitMatrix(time, Math.floor(f.w * 0.6), Math.max(3, f.y + f.h - below - 6), 3);
  let ty = below;
  if (kk) {
    const sz = matrixSize(time, kk);
    matrixText(ui, r.x + Math.floor((r.w - sz.w) / 2), ty, time, kk, () => c.fg);
    ty += sz.h + 1;
  } else ui.textCenter(r, ty++, time, { fg: c.fg, attrs: BOLD });
  ui.textCenter(r, ty, now.toLocaleDateString(dateLocale(), { weekday: "long", day: "numeric", month: "long" }), { fg: c.muted });
  ui.textCenter(r, ty + 2, `— ${PAPER_LINES[seed % PAPER_LINES.length]} —`, { fg: c.subtle });
  ui.textCenter(r, f.y + f.h - 2, "ICEBREAKER · asleep · any key", { fg: c.subtle });
  // next change: the next minute
  ui.animate(60_000 - (now.getSeconds() * 1000 + now.getMilliseconds()) + 30);
}

function drawCity(ui: UI, r: Rect): void {
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
    ui.textCenter(r, ty + sz.h + 1, now.toLocaleDateString(dateLocale(), { weekday: "long", day: "numeric", month: "long" }).toUpperCase(), { fg: c.subtle });
  }

  // the ticker
  const msg = `   ◆ ${TICKER.join("   ◆ ")}`;
  const off = Math.floor(t * 8) % msg.length;
  const line = (msg.slice(off) + msg).slice(0, r.w);
  ui.fill({ x: r.x, y: r.y + r.h - 1, w: r.w, h: 1 }, { bg: c.panelAlt });
  ui.text(r.x, r.y + r.h - 1, line, { fg: c.accent, bg: c.panelAlt });
  ui.text(r.x + r.w - 22, r.y + r.h - 2, " any key to jack in ", { fg: c.subtle });
  ui.animate(80);
}
