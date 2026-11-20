import { BOLD, type Rect } from "../core/grid";
import type { Action, KeyInput } from "../core/input";
import type { Deck } from "../deck";
import { ListView } from "../ui/list";
import type { UI } from "../ui/ui";
import type { Overlay } from "./overlays";
import { accelerated, askNumber, slider } from "../ui/slider";
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

/** How much CRT: five steps, from nothing to the dance floor. */
export const FX_PRESET_NAMES = ["none", "light", "medium", "heavy", "party"] as const;
export type Preset = (typeof FX_PRESET_NAMES)[number];
/** the names of before (fx minimal / max / potato still work) */
export const FX_PRESET_ALIASES: Record<string, Preset> = { potato: "none", minimal: "light", max: "heavy" };

/** Each preset: the switches on (the rest off) and every effect's strength (0 = off, up to 200). */
export const FX_PRESETS: Record<Preset, { on: FxKey[]; levels: Record<FxLevel, number>; hint: string }> = {
  none: { on: [], levels: { bloom: 0, scanlines: 0, vignette: 0, chroma: 0, glow: 0, sharpness: 100 }, hint: "flat and sharp, nothing moves (old laptops)" },
  light: { on: ["ambient", "glitch"], levels: { bloom: 60, scanlines: 40, vignette: 50, chroma: 0, glow: 0, sharpness: 90 }, hint: "a hint of glow, crisp text (default)" },
  medium: { on: ["ambient", "glitch"], levels: { bloom: 100, scanlines: 100, vignette: 100, chroma: 30, glow: 30, sharpness: 80 }, hint: "a real CRT" },
  heavy: { on: ["ambient", "glitch", "flicker"], levels: { bloom: 150, scanlines: 150, vignette: 130, chroma: 100, glow: 80, sharpness: 70 }, hint: "glow, fringes, flicker" },
  party: { on: ["ambient", "glitch", "flicker"], levels: { bloom: 200, scanlines: 200, vignette: 200, chroma: 200, glow: 200, sharpness: 60 }, hint: "everything at the max. sunglasses on" },
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
      { label: "glow", hint: "bright things shine", level: "glow" },
      { label: "sharpness", hint: "CRT focus", level: "sharpness" },
      { label: "background", hint: "the theme's animation", key: "ambient" },
      { label: "glitch", hint: "transitions", key: "glitch" },
      { label: "flicker", hint: "unstable tube", key: "flicker" },
      ...FX_PRESET_NAMES.map((p) => ({ label: `▸ ${p}`, hint: FX_PRESETS[p].hint, preset: p })),
    ];
    this.list.onActivate = (row) => this.activate(row);
  }

  private activate(row: Row, dir: 1 | -1 = 1): void {
    const s = this.deck.settings;
    if (row.level) {
      // enter / space on a slider: off ⇄ 100 %; ←→ one at a time, faster when held
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
    setFx(this.deck, row.level, getFx(this.deck, row.level) + dir * accelerated(`fx:${row.level}`));
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
        }, {
          zeroIsOff: lv !== "sharpness",
          tip: `fx ${lv} <0-${fxMax(lv)}> · ${row.hint} · double-click the number to type it`,
          onEdit: () => void askNumber(this.deck, row.label, getFx(this.deck, lv), 0, fxMax(lv), lv !== "sharpness").then((v) => v !== null && setFx(this.deck, lv, v)),
        });
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

/** The preset the effects match right now, or "custom" when they were tuned by hand. */
export function currentFxPreset(deck: Deck): Preset | "custom" {
  const fx = deck.settings.data.fx;
  for (const name of FX_PRESET_NAMES) {
    const p = FX_PRESETS[name];
    const switches = (["ambient", "glitch", "flicker"] as const).every((k) => !!fx[k] === p.on.includes(k));
    const levels = (Object.entries(p.levels) as [FxLevel, number][]).every(([lv, v]) => getFx(deck, lv) === v);
    if (switches && levels) return name;
  }
  return "custom";
}

export function applyFxPreset(deck: Deck, name: Preset | string): void {
  const preset = (FX_PRESETS[name as Preset] ? name : FX_PRESET_ALIASES[name] ?? "light") as Preset;
  const p = FX_PRESETS[preset];
  for (const key of ["ambient", "glitch", "flicker"] as const) deck.settings.set(`fx.${key}`, p.on.includes(key));
  for (const [lv, v] of Object.entries(p.levels)) setFx(deck, lv as FxLevel, v);
  deck.applyFx();
}
