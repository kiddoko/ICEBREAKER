import { BOLD, type Rect } from "../core/grid";
import type { Action, KeyInput } from "../core/input";
import type { Deck } from "../deck";
import { ListView } from "../ui/list";
import type { UI } from "../ui/ui";
import type { Overlay } from "./overlays";

type FxKey = "ambient" | "glitch" | "bloom" | "scanlines" | "vignette" | "flicker";

interface Row {
  label: string;
  hint: string;
  /** a toggle (fx.<key>) or a preset */
  key?: FxKey;
  preset?: Preset;
  /** a strength that steps 0 → … → 100 → 0 */
  level?: "chroma" | "sharpness";
}
const LEVEL_STEPS = [0, 20, 40, 60, 100];

type Preset = "minimal" | "max" | "potato";

/** What each preset turns on (everything else off). */
export const FX_PRESETS: Record<Preset, FxKey[]> = {
  minimal: ["ambient", "glitch"],
  max: ["ambient", "glitch", "bloom", "scanlines", "vignette", "flicker"],
  potato: [],
};

/**
 * The little FX panel that pops up from the "✦ fx" button in the status bar
 * (or Ctrl+K → "Visual effects"). Toggle the CRT eye-candy without digging
 * through settings.
 */
export class FxPanel implements Overlay {
  modal = true;
  done = false;
  private list = new ListView<Row>();

  constructor(private readonly deck: Deck) {
    this.list.items = [
      { label: "background", hint: "the theme's animation", key: "ambient" },
      { label: "glitch", hint: "transitions", key: "glitch" },
      { label: "bloom", hint: "neon glow", key: "bloom" },
      { label: "scanlines", hint: "CRT lines", key: "scanlines" },
      { label: "vignette", hint: "dark corners", key: "vignette" },
      { label: "flicker", hint: "unstable tube", key: "flicker" },
      { label: "fringes", hint: "colour split", level: "chroma" },
      { label: "sharpness", hint: "CRT focus", level: "sharpness" },
      { label: "▸ minimal", hint: "default", preset: "minimal" },
      { label: "▸ max", hint: "everything on", preset: "max" },
      { label: "▸ potato", hint: "all off, 30fps", preset: "potato" },
    ];
    this.list.onActivate = (row) => this.activate(row);
  }

  private activate(row: Row): void {
    const s = this.deck.settings;
    if (row.level) {
      const steps = row.level === "sharpness" ? [100, 75, 50, 25, 0] : LEVEL_STEPS;
      const cur = s.data.fx.levels[row.level] ?? (row.level === "sharpness" ? 100 : 0);
      const next = steps[(steps.indexOf(cur) + 1) % steps.length] ?? steps[0];
      void this.deck.act(`fx ${row.level} ${next}`);
      return;
    }
    if (row.key) s.set(`fx.${row.key}`, !s.data.fx[row.key]);
    else if (row.preset) applyFxPreset(this.deck, row.preset);
    this.deck.applyFx();
  }

  onKey(k: KeyInput): boolean {
    const map: Record<string, Action> = { up: "up", down: "down", enter: "confirm", home: "home", end: "end" };
    if (k.key === "esc") this.done = true;
    else if (map[k.key]) this.list.onAction(map[k.key]);
    return true;
  }

  onText(t: string): boolean {
    if (t === " ") {
      const row = this.list.current;
      if (row) this.activate(row);
    }
    return true;
  }

  onAction(a: Action): boolean {
    if (a === "back") this.done = true;
    else this.list.onAction(a);
    return true;
  }

  render(ui: UI, screen: Rect): void {
    const c = ui.c;
    ui.hit(screen, { onClick: () => (this.done = true), onWheel: () => {}, block: true });
    const w = 40;
    const h = this.list.items.length + 3;
    const r = { x: screen.x + screen.w - w - 1, y: screen.y + screen.h - h - 1, w, h };
    const inner = ui.box(r, { title: "FX", focused: true, bg: c.panelAlt, info: "space toggle" });
    ui.hit(r, { onClick: () => {} }); // clicks inside don't close
    this.list.render(ui, { x: inner.x, y: inner.y, w: inner.w, h: inner.h - 1 }, true, (row, rr, selected) => {
      if (row.key) {
        const on = this.deck.settings.data.fx[row.key];
        ui.text(rr.x + 1, rr.y, on ? "■" : "□", { fg: on ? c.accent : c.subtle, attrs: BOLD });
        ui.text(rr.x + 3, rr.y, row.label, { fg: selected || on ? c.fg : c.muted });
      } else if (row.level) {
        const v = this.deck.settings.data.fx.levels[row.level] ?? (row.level === "sharpness" ? 100 : 0);
        const on = row.level === "sharpness" ? v < 100 : v > 0;
        ui.text(rr.x + 1, rr.y, on ? "■" : "□", { fg: on ? c.accent : c.subtle, attrs: BOLD });
        ui.text(rr.x + 3, rr.y, `${row.label} ${v}%`, { fg: selected || on ? c.fg : c.muted });
      } else {
        ui.text(rr.x + 1, rr.y, row.label, { fg: selected ? c.accentAlt : c.muted, attrs: BOLD });
      }
      ui.textRight(rr.x + rr.w - 2, rr.y, row.hint, { fg: c.faint });
      if (row.level) ui.hit(rr, { onClick: () => this.activate(row), tip: `fx ${row.level} <0-100>` });
      else ui.hit(rr, { cmd: row.key ? `fx ${row.key} ${this.deck.settings.data.fx[row.key] ? "off" : "on"}` : `fx ${row.preset}` });
    });
    ui.text(inner.x + 1, inner.y + inner.h - 1, "esc close · `fx` in the shell", { fg: c.faint });
  }
}

export function applyFxPreset(deck: Deck, preset: Preset): void {
  const on = FX_PRESETS[preset];
  for (const key of FX_PRESETS.max) deck.settings.set(`fx.${key}`, on.includes(key));
  deck.settings.set("appearance.maxFps", preset === "potato" ? 30 : 60);
  // full CRT: the colour fringes at max; potato: everything flat and sharp
  if (preset === "max") deck.settings.set("fx.levels.chroma", 100);
  if (preset === "potato") deck.settings.set("fx.levels.chroma", 0), deck.settings.set("fx.levels.sharpness", 100);
  deck.applyFx();
}
