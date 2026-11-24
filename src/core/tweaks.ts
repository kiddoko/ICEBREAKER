import { FONTS } from "./fonts";
import { SOUND_PACKS } from "./sound";
import { backgrounds } from "../fx/backgrounds";
import { COMPONENTS } from "./skin/components";
import type { Field } from "./skin/fields";

/**
 * The knobs you can turn on any theme without writing a file
 * (`theme tweak <knob> <value>`, or the Theme studio). Each maps to a key of
 * the theme format, so an exported theme is a plain .toml anyone can read.
 */
export interface Knob {
  /** What you type: `theme tweak accent #ff2e88`. */
  name: string;
  /** "section.key" in the .toml. */
  key: string;
  label: string;
  group: "colors" | "type" | "shape" | "background" | "sound" | "motion";
  kind: "color" | "number" | "choice" | "text";
  /** Values to cycle through (choices, or suggested numbers). */
  options?: () => (string | number)[];
  min?: number;
  max?: number;
}

/** Colors to cycle through in the studio (any #hex works from the shell). */
export const COLOR_SWATCHES = [
  "#cba6f7", "#f5c2e7", "#ff2e88", "#ff4d6d", "#ff8a3d", "#ffd166", "#f9e2af", "#a6e3a1",
  "#33ff66", "#00e5c7", "#3ee8ff", "#89b4fa", "#7f8cff", "#b4befe", "#e8f0ff", "#ffffff",
  "#0b0b12", "#070b10", "#06080d", "#080506", "#020a04", "#0a0a0a", "#11111b", "#1e1e2e",
];

export const KNOBS: Knob[] = [
  { name: "accent", key: "ui.accent", label: "accent", group: "colors", kind: "color" },
  { name: "accent2", key: "ui.accent_alt", label: "second accent", group: "colors", kind: "color" },
  { name: "text", key: "ui.fg", label: "text", group: "colors", kind: "color" },
  { name: "bg", key: "ui.bg", label: "background", group: "colors", kind: "color" },
  { name: "panel", key: "ui.panel", label: "panels", group: "colors", kind: "color" },
  { name: "border", key: "ui.border", label: "borders", group: "colors", kind: "color" },
  { name: "font", key: "font.family", label: "font", group: "type", kind: "choice", options: () => FONTS },
  { name: "font-size", key: "font.scale", label: "font size correction", group: "type", kind: "number", options: () => [0.8, 0.9, 1, 1.1, 1.2, 1.3, 1.4], min: 0.5, max: 2 },
  { name: "frame", key: "meta.border", label: "frame style", group: "shape", kind: "choice", options: () => ["round", "single", "heavy", "double"] },
  { name: "mark", key: "glyphs.mark", label: "title mark", group: "shape", kind: "choice", options: () => ["◆", "▸", "►", "■", "▪", "◢", "●", "★", "✦", "»"] },
  { name: "bullet", key: "glyphs.bullet", label: "list bullet", group: "shape", kind: "choice", options: () => ["›", "·", "–", ">", "▸", "•", "→"] },
  { name: "background", key: "background.effect", label: "effect", group: "background", kind: "choice", options: () => backgrounds().map((b) => b.name) },
  { name: "density", key: "background.density", label: "density", group: "background", kind: "number", options: () => [0.15, 0.3, 0.45, 0.6, 0.75, 0.9, 1], min: 0, max: 1 },
  { name: "speed", key: "background.speed", label: "speed", group: "background", kind: "number", options: () => [0.25, 0.5, 0.75, 1, 1.5, 2, 3], min: 0.1, max: 4 },
  { name: "bg-color", key: "background.color", label: "effect color", group: "background", kind: "color" },
  { name: "bg-color2", key: "background.color2", label: "effect highlight", group: "background", kind: "color" },
  { name: "sounds", key: "sound.pack", label: "sound pack", group: "sound", kind: "choice", options: () => Object.keys(SOUND_PACKS) },
  { name: "pitch", key: "sound.pitch", label: "pitch", group: "sound", kind: "number", options: () => [0.5, 0.75, 1, 1.25, 1.5, 2], min: 0.25, max: 4 },
  { name: "select", key: "anim.select", label: "selection animation", group: "motion", kind: "choice", options: () => ["brackets", "pulse", "scan", "none"] },
  { name: "noise", key: "anim.noise", label: "appear-from glyphs", group: "motion", kind: "choice", options: () => ["ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿ0123456789", "01", "0123456789ABCDEF", "·:∙*+", "░▒▓", "╱╲╳"] },
];

/**
 * The knobs of the skin's components (core/skin), generated from their declarations: one per
 * field, named by its key (`theme set keys.radius 0.3`). Not in the studio yet (milestone 4).
 */
export const SKIN_KNOBS: (Knob & { field: Field })[] = COMPONENTS.flatMap((comp) =>
  (Object.entries(comp.fields) as [string, Field][]).map(([k, f]) => {
    const key = `${comp.id}.${k}`;
    const base = { name: key, key, label: `${comp.label}: ${f.doc}`, group: comp.group, field: f };
    if (f.kind === "number") return { ...base, kind: "number" as const, min: f.min, max: f.max, options: () => f.suggest() };
    if (f.kind === "color") return { ...base, kind: "color" as const };
    return { ...base, kind: "choice" as const, options: () => f.suggest() };
  }),
);

export function knob(name: string): Knob | undefined {
  return KNOBS.find((k) => k.name === name || k.key === name) ?? SKIN_KNOBS.find((k) => k.key === name);
}

/** what `theme set <tab>` offers: the short knobs, then every component field (keys.radius…) */
export function knobNames(): string[] {
  return [...KNOBS.map((k) => k.name), ...SKIN_KNOBS.map((k) => k.key)];
}

/** what `theme set <knob> <tab>` offers: the knob's choices or a few numbers in its bounds */
export function knobSuggestions(name: string): string[] {
  const k = knob(name);
  return k?.options?.().map(String) ?? [];
}

/** Check and normalize a value for a knob. Returns [value] or an error message. */
export function parseKnobValue(k: Knob, raw: string): { value: string | number } | { error: string } {
  const v = raw.trim();
  if (k.kind === "color") {
    if (/^#[0-9a-f]{6}$/i.test(v)) return { value: v.toLowerCase() };
    if (/^#[0-9a-f]{3}$/i.test(v)) return { value: `#${[...v.slice(1)].map((c) => c + c).join("")}`.toLowerCase() };
    if (/^[\w-]+$/.test(v)) return { value: v }; // a [palette] name, checked when the theme is rebuilt
    return { error: `${k.name}: expected a color like #ff2e88 (or a palette name)` };
  }
  const field = (k as { field?: Field }).field;
  if (field) {
    // a component's field: its own reading (bounds, on/off, auto…); a palette name is checked on rebuild
    if (field.kind === "color" && /^[\w-]+$/.test(v) && v !== "auto") return { value: v };
    const r = field.read(v, { palette: {} });
    if ("error" in r) return { error: `${k.name}: ${r.error}` };
    if (field.kind === "color") return { value: v.toLowerCase() };
    return { value: typeof r.value === "boolean" ? (r.value ? "on" : "off") : (r.value as string | number) };
  }
  if (k.kind === "number") {
    const n = Number(v.replace("%", ""));
    if (!Number.isFinite(n)) return { error: `${k.name}: expected a number` };
    return { value: Math.max(k.min ?? -Infinity, Math.min(k.max ?? Infinity, n)) };
  }
  if (k.kind === "choice" && k.name !== "mark" && k.name !== "bullet" && k.name !== "noise") {
    const opts = (k.options?.() ?? []).map(String);
    const hit = opts.find((o) => o.toLowerCase() === v.toLowerCase());
    if (!hit && k.name !== "font") return { error: `${k.name}: one of ${opts.join(", ")}` };
    return { value: hit ?? v };
  }
  return v ? { value: v } : { error: `${k.name}: empty value` };
}
