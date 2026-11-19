import { BOLD, type Rect } from "../core/grid";
import type { Action, KeyInput } from "../core/input";
import type { Deck } from "../deck";
import { ListView } from "../ui/list";
import type { UI } from "../ui/ui";
import type { Overlay } from "./overlays";
import { slider } from "../ui/slider";
import { fxMax, getFx, setFx, type FxLevel } from "../core/fxlevels";

type FxKey = "ambient" | "glitch" | "bloom" | "scanlines" | "vignette" | "flicker";

interface Row {
  label: string;
  hint: string;
  /** a switch (fx.<key>) or a preset */
  key?: FxKey;
  preset?: Preset;
  /** a slider: 0 = off, up to 200 % (sharpness 0-100) */
  level?: FxLevel;
}

type Preset = "minimal" | "max" | "potato";

/** What each preset turns on (everything else off). */
export const FX_PRESETS: Record<Preset, FxKey[]> = {
  minimal: ["ambient", "glitch"],
  max: ["ambient", "glitch", "bloom", "scanlines", "vignette", "flicker"],
  potato: [],
};

/**
 * The little FX panel that pops up from the "✦ fx" button in the status bar
 * (or Ctrl+K → "Visual effects"): a real slider per effect (0 = off), switches
 * for the rest, the presets.
 */
export class FxPanel implements Overlay {
  modal = true;
  done = false;
  private list = new ListView<Row>();

  constructor(private readonly deck: Deck) {
    this.list.items = [
      { label: "bloom", hint: "neon glow", level: "bloom" },
      { label: "scanlines", hint: "CRT lines", level: "scanlines" },
      { label: "vignette", hint: "dark corners", level: "vignette" },
      { label: "RGB split", hint: "colour fringes", level: "chroma" },
      { label: "sharpness", hint: "CRT focus", level: "sharpness" },
      { label: "background", hint: "the theme's animation", key: "ambient" },
      { label: "glitch", hint: "transitions", key: "glitch" },
      { label: "flicker", hint: "unstable tube", key: "flicker" },
      { label: "▸ minimal", hint: "default", preset: "minimal" },
      { label: "▸ max", hint: "everything on", preset: "max" },
      { label: "▸ potato", hint: "all off, 30fps", preset: "potato" },
    ];
    this.list.onActivate = (row) => this.activate(row);
  }

  private activate(row: Row, dir: 1 | -1 = 1): void {
    const s = this.deck.settings;
    if (row.level) {
      // enter / space on a slider: off ⇄ 100 %; ←→ step by 5
      const cur = getFx(this.deck, row.level);
      setFx(this.deck, row.level, dir === 1 && cur === 0 ? 100 : dir === 1 ? 0 : cur);
      return;
    }
    if (row.key) s.set(`fx.${row.key}`, !s.data.fx[row.key]);
    else if (row.preset) applyFxPreset(this.deck, row.preset);
    this.deck.applyFx();
  }

  private nudge(dir: 1 | -1): void {
    const row = this.list.current;
    if (!row?.level) return;
    setFx(this.deck, row.level, Math.round(getFx(this.deck, row.level) / 5) * 5 + dir * 5);
  }

  onKey(k: KeyInput): boolean {
    const map: Record<string, Action> = { up: "up", down: "down", enter: "confirm", home: "home", end: "end" };
    if (k.key === "esc") this.done = true;
    else if (k.key === "left" || k.key === "right") this.nudge(k.key === "right" ? 1 : -1);
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
    else if (a === "left" || a === "right") this.nudge(a === "right" ? 1 : -1);
    else this.list.onAction(a);
    return true;
  }

  render(ui: UI, screen: Rect): void {
    const c = ui.c;
    ui.hit(screen, { onClick: () => (this.done = true), onWheel: () => {}, block: true });
    const w = Math.min(screen.w - 2, 48);
    const h = this.list.items.length + 3;
    const r = { x: screen.x + screen.w - w - 1, y: screen.y + screen.h - h - 1, w, h };
    const inner = ui.box(r, { title: "FX", focused: true, bg: c.panelAlt, info: "←→ · space" });
    ui.hit(r, { onClick: () => {} }); // clicks inside don't close
    this.list.render(ui, { x: inner.x, y: inner.y, w: inner.w, h: inner.h - 1 }, true, (row, rr, selected) => {
      if (row.level) {
        const lv = row.level;
        ui.text(rr.x + 1, rr.y, row.label, { fg: selected ? c.fg : c.muted }, 12);
        slider(ui, { x: rr.x + 14, y: rr.y, w: rr.w - 15, h: 1 }, getFx(this.deck, lv), 0, fxMax(lv), (v) => {
          this.list.select(this.list.items.indexOf(row));
          setFx(this.deck, lv, v);
        }, { zeroIsOff: lv !== "sharpness", tip: `fx ${lv} <0-${fxMax(lv)}> · ${row.hint}` });
        return;
      }
      if (row.key) {
        const on = this.deck.settings.data.fx[row.key];
        ui.text(rr.x + 1, rr.y, on ? "■" : "□", { fg: on ? c.accent : c.subtle, attrs: BOLD });
        ui.text(rr.x + 3, rr.y, row.label, { fg: selected || on ? c.fg : c.muted });
      } else {
        ui.text(rr.x + 1, rr.y, row.label, { fg: selected ? c.accentAlt : c.muted, attrs: BOLD });
      }
      ui.textRight(rr.x + rr.w - 2, rr.y, row.hint, { fg: c.faint });
      ui.hit(rr, { cmd: row.key ? `fx ${row.key} ${this.deck.settings.data.fx[row.key] ? "off" : "on"}` : `fx ${row.preset}` });
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
