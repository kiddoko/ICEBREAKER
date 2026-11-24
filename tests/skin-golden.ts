import { capGeometry, keycapLook } from "../src/core/keycap";
import { Grid } from "../src/core/grid";
import { ThemeManager } from "../src/core/theme";
import { UI } from "../src/ui/ui";

/**
 * THE GOLDEN SCREEN of every built-in theme (themes v2, milestone 1): a frame, a title, text,
 * shortcuts on their keys and a button drawn into a grid, plus each key's geometry. Hashed, so
 * tests/skin-golden.json (written from master before the skin registry) proves nothing moved.
 */
function hash(parts: ArrayLike<number>[]): string {
  let h = 2166136261 >>> 0;
  for (const a of parts) for (let i = 0; i < a.length; i++) {
    h ^= a[i] >>> 0;
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

export function goldenScreens(): Record<string, { grid: string; caps: string; geometry: string }> {
  const out: Record<string, { grid: string; caps: string; geometry: string }> = {};
  for (const th of new ThemeManager().list()) {
    const g = new Grid(48, 8);
    const ui = new UI();
    ui.begin(g, th, 0, { x: -1, y: -1 });
    ui.box({ x: 0, y: 0, w: 48, h: 8 }, { title: "golden" });
    ui.text(2, 2, "esc close · ctrl+K menu · ⌘⇧P palette", {});
    ui.text(2, 3, "plain text, no keys", { fg: th.c.muted });
    ui.button(2, 5, "save", () => {}, { cmd: "ctrl+S" });
    const geo = [8, 14, 20].flatMap((cw) => Object.values(capGeometry(cw, cw * 2.2 | 0, keycapLook(th.keys))));
    out[th.name] = { grid: hash([g.ch, g.fg, g.bg, g.attr]), caps: hash([g.cap, g.capEdge]), geometry: hash([geo.map((v) => Math.round(v * 1000))]) };
  }
  return out;
}
