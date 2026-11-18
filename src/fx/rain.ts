import { mix, NONE } from "../core/color";
import { BOLD, type Rect } from "../core/grid";
import type { UI } from "../ui/ui";

/**
 * Falling-glyph rain (screensaver, `rain` command, boot background).
 * Each column has a drop with its own speed and trail length.
 */
const GLYPHS = "ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ0123456789:.=*+-<>¦|ｦ";
const CHARS = [...GLYPHS];

interface Drop {
  y: number;
  speed: number; // cells per second
  len: number;
  seed: number;
}

export class Rain {
  private drops: Drop[] = [];
  private last = 0;

  /** speed multiplier and the characters it rains (the matrix widget's pop-up changes them) */
  speed = 1;
  chars: string[] | null = null;

  constructor(private density = 1) {}

  render(ui: UI, r: Rect): void {
    if (this.drops.length !== r.w) this.drops = Array.from({ length: r.w }, () => this.newDrop(r.h, true));
    const dt = this.last ? Math.min(0.1, (ui.now - this.last) / 1000) : 0;
    this.last = ui.now;
    const head = mix(ui.c.fg, 0xffffff, 0.5);

    this.drops.forEach((d, x) => {
      d.y += d.speed * dt * this.speed;
      if (d.y - d.len > r.h) Object.assign(d, this.newDrop(r.h, false));
      const tick = Math.floor(ui.now / 90);
      for (let k = 0; k < d.len; k++) {
        const y = Math.floor(d.y) - k;
        if (y < 0 || y >= r.h) continue;
        const set = this.chars ?? CHARS;
        const ch = set[(d.seed + y * 7 + (k < 3 ? tick : Math.floor(tick / 4))) % set.length];
        const fade = 1 - k / d.len;
        const color = k === 0 ? head : mix(ui.c.bg, k < 3 ? ui.c.accentAlt : ui.c.accent, fade);
        ui.grid.set(r.x + x, r.y + y, ch.codePointAt(0)!, color, NONE, k === 0 ? BOLD : 0);
      }
    });
    ui.animate(33);
  }

  private newDrop(h: number, scatter: boolean): Drop {
    const active = Math.random() < 0.55 * this.density;
    return {
      y: scatter ? Math.random() * h * 1.5 - h * 0.5 : active ? -Math.random() * h * 0.5 : -h * (1 + Math.random() * 2),
      speed: 6 + Math.random() * 22,
      len: 4 + Math.floor(Math.random() * 18),
      seed: Math.floor(Math.random() * 1000),
    };
  }
}
