import { mix, type RGB } from "../core/color";
import type { Rect } from "../core/grid";
import { dots } from "./dots";
import type { UI } from "./ui";

/**
 * UPLINK's face: a dotted orbit around a breathing core, drawn in braille dots.
 * The same everywhere it shows — the UPLINK widget on HOME, the guided tour.
 *
 *   idle      a slow signal runs the orbit, the core breathes
 *   thinking  two signals, faster
 *   speaking  a voice wave across the core
 *   offline   a dim, still ring
 *   look      the core becomes an eye whose pupil looks that way (x, y in -1…1)
 *   blink     the eye closes for a moment
 */
export interface UplinkFace {
  mood: "idle" | "thinking" | "speaking" | "offline";
  /** an eye looking that way (null: the core) */
  look?: { x: number; y: number } | null;
  blink?: boolean;
  /** the main colour (default: the mood's) */
  color?: RGB;
}

export function drawUplinkCore(ui: UI, box: Rect, face: UplinkFace): void {
  const c = ui.c;
  const { mood } = face;
  const ok = mood !== "offline";
  const thinking = mood === "thinking";
  const speaking = mood === "speaking";
  const col = face.color ?? (!ok ? c.error : thinking ? c.accentAlt : speaking ? c.info : c.accent);
  const rows = box.h;
  const R = rows / 2 - 0.2, ox = (box.w * ui.cellAspect) / 2, oy = rows / 2;
  const head = (ui.now / (thinking ? 500 : 1600)) % 1; // fraction of a turn
  const breath = (Math.sin(ui.now / (thinking ? 160 : 700)) + 1) / 2;
  const look = face.look ? { x: face.look.x * R * 0.32, y: face.look.y * R * 0.32 } : null;
  dots(ui, box, [c.faint, mix(col, c.bg, 0.55), col, mix(col, 0xffffff, 0.45)], (x, y) => {
    const dx = x - ox, dy = y - oy, d = Math.hypot(dx, dy);
    if (look) {
      // an eye: the white of it, then the pupil where it looks (closed for a blink)
      if (face.blink) return Math.abs(dy) < 0.06 && Math.abs(dx) < R * 0.55 ? 4 : Math.abs(d - R) < 0.07 ? 1 : 0;
      if (Math.hypot(dx - look.x, dy - look.y) < R * 0.2) return 4;
      if (Math.abs(d - R * 0.55) < 0.06) return 3;
      if (Math.abs(d - R) < 0.07) return 1;
      return 0;
    }
    if (speaking && Math.abs(dx) < R * 0.75 && d < R * 0.85) {
      // a voice waveform across the core
      const amp = (Math.sin(dx * 3.1 + ui.now / 90) * 0.5 + Math.sin(dx * 7.3 - ui.now / 60) * 0.3) * R * 0.45 * (0.6 + breath * 0.4);
      return Math.abs(dy - amp) < 0.09 ? 4 : Math.abs(dy) < 0.04 ? 1 : 0;
    }
    if (d < R * (0.22 + breath * 0.08)) return ok ? 3 : 2; // core
    if (Math.abs(d - R) < 0.07) {
      if (!ok) return 1;
      const a = (Math.atan2(dy, dx) / (Math.PI * 2) + 1.25) % 1; // 0 at the top, clockwise
      const lag = (head - a + 1) % 1;
      const lag2 = (head + 0.5 - a + 1) % 1; // thinking: a second signal
      return lag < 0.03 || (thinking && lag2 < 0.03) ? 4 : lag < 0.25 || (thinking && lag2 < 0.25) ? 3 : 1;
    }
    // a faint inner ring, counter-rotating
    if (Math.abs(d - R * 0.6) < 0.05) {
      const a = (Math.atan2(dy, dx) / (Math.PI * 2) + 1 - head) % 1;
      return ok && (a * 12) % 1 < 0.5 ? 2 : 0;
    }
    return 0;
  });
}
