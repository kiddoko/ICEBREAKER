import { parse as parseToml, stringify as stringifyToml } from "smol-toml";
import type { KeycapLook } from "./keycap";
import type { PadLook } from "./padglyphs";
import { hex, type RGB, readable } from "./color";

/**
 * Themes are TOML files (see /themes/nightshade.toml for the annotated reference).
 *
 *   [palette]  named raw colors        mauve = "#cba6f7"
 *   [ui]       what each part uses     accent = "mauve"   (a palette name or a #hex)
 *   [syntax]   markdown highlighting
 *   [ansi]     the 16 terminal colors used by shell output
 *   [fx]       post-effect strengths
 *
 * Any missing key falls back to the default theme, so a theme can be as
 * small as three lines.
 */

export type BorderStyle = "round" | "single" | "heavy" | "double";

/** Small symbols a theme can swap (all optional in the .toml, under [glyphs]). */
export interface ThemeGlyphs {
  /** Before focused titles and the logo: ◆ ▸ ◢ ■ … */
  mark: string;
  /** List bullets (news, tasks…). */
  bullet: string;
  /** Spinner frames, one character each. */
  spinner: string;
  /** Unchecked / checked task box. */
  todo: string;
  done: string;
}

/** The animated layer behind the panels ([background]). */
export interface ThemeBackground {
  /** fog · snow · rain · stars · embers · scan · grain · circuit · sonar · none (plugins can add more). */
  effect: string;
  /** 0–1: how much of it. */
  density: number;
  /** 0.25–3: how fast. */
  speed: number;
  /** Main / second color (null = from [ui]: ambient and accent). */
  color: RGB | null;
  color2: RGB | null;
  /** Characters the effect may use (effect-specific, empty = its own). */
  glyphs: string;
}

/** UI sounds ([sound]): a synth pack and a pitch. Files in .icebreaker/sounds still win. */
export interface ThemeSound {
  /** retro · crystal · soft · industrial · paper · neon · sonar */
  pack: string;
  pitch: number;
}

/** Motion ([anim]). */
export interface ThemeAnim {
  /** How a selected HOME widget shows it: brackets · pulse · scan · none. */
  select: string;
  /** Characters widgets dissolve from when they appear. */
  noise: string;
  /** Changing page or tab: glitch · eink (a black/white refresh flash) · wipe · fade · none. */
  page: string;
  /** Characters that just changed (typing, new output): none · ink (they settle in, like e-ink) · glow (they flash). */
  type: string;
  /** The screensaver: city (neon night) · paper (an e-reader's sleep screen) · terminal (an 80s mainframe) · sonar (the deep) · warp (hyperspace). */
  screensaver: string;
}

/**
 * Typeface. `family` must be one of the bundled fonts (see FONTS in
 * core/fonts.ts) or installed on the system. `scale` corrects fonts that look
 * smaller or bigger than JetBrains Mono at the same pixel size; `weights` pins
 * [normal, bold] for fonts that only ship one weight (empty = user setting).
 */
export interface ThemeFont {
  family: string;
  scale: number;
  weights: [number, number] | null;
}

export interface UiColors {
  bg: RGB; panel: RGB; panelAlt: RGB; highlight: RGB; selection: RGB;
  fg: RGB; muted: RGB; subtle: RGB; faint: RGB;
  accent: RGB; accentAlt: RGB; border: RGB; borderFocus: RGB; title: RGB; titleFocus: RGB;
  cursor: RGB; success: RGB; warning: RGB; error: RGB; info: RGB;
  ambient: RGB; statusBg: RGB; statusFg: RGB;
}

export interface SyntaxColors {
  heading1: RGB; heading2: RGB; heading3: RGB; bold: RGB; italic: RGB;
  code: RGB; codeBg: RGB; link: RGB; wikilink: RGB; tag: RGB; quote: RGB;
  list: RGB; checkbox: RGB; hr: RGB; frontmatter: RGB;
}

export interface Theme {
  name: string;
  author: string;
  description: string;
  border: BorderStyle;
  palette: Record<string, RGB>;
  c: UiColors;
  syntax: SyntaxColors;
  /** black red green yellow blue magenta cyan white, then the 8 bright variants */
  ansi: RGB[];
  /** Two or more colors used for logos and big headings. */
  gradient: RGB[];
  /**
   * flicker: false = this theme never flickers · monochrome: everything drawn in
   * greys (even colourful shell output) · paper: 0–1, a matte paper texture over the screen
   */
  fx: { bloom: number; scanlines: number; vignette: number; flicker: boolean; monochrome: boolean; paper: number };
  /** How HOME widgets are framed: round · single · heavy · double · dashed · corners · line. */
  widgetFrame: string;
  /** Optional replacement for the boot logo. */
  logo?: string;
  glyphs: ThemeGlyphs;
  font: ThemeFont;
  background: ThemeBackground;
  sound: ThemeSound;
  anim: ThemeAnim;
  /**
   * THEME HOOKS for the keys and the pad's buttons (docs/THEMES.md): how they look, any part of
   * it — the rest is the deck's bevelled key (core/keycap.ts BEVELLED) and its pad buttons
   * (core/padglyphs.ts PAD_LOOK). Not read from theme files yet: the theme overhaul will.
   */
  keys?: Partial<KeycapLook>;
  pad?: Partial<PadLook>;
  /** The theme it was built on (meta.extends), if any. */
  extends?: string;
  source: "builtin" | "vault";
}

const UI_KEYS: Record<keyof UiColors, string> = {
  bg: "bg", panel: "panel", panelAlt: "panel_alt", highlight: "highlight", selection: "selection",
  fg: "fg", muted: "muted", subtle: "subtle", faint: "faint",
  accent: "accent", accentAlt: "accent_alt", border: "border", borderFocus: "border_focus",
  title: "title", titleFocus: "title_focus", cursor: "cursor", success: "success",
  warning: "warning", error: "error", info: "info", ambient: "ambient",
  statusBg: "status_bg", statusFg: "status_fg",
};

const SYNTAX_KEYS: Record<keyof SyntaxColors, string> = {
  heading1: "heading1", heading2: "heading2", heading3: "heading3", bold: "bold", italic: "italic",
  code: "code", codeBg: "code_bg", link: "link", wikilink: "wikilink", tag: "tag", quote: "quote",
  list: "list", checkbox: "checkbox", hr: "hr", frontmatter: "frontmatter",
};

const ANSI_NAMES = [
  "black", "red", "green", "yellow", "blue", "magenta", "cyan", "white",
  "bright_black", "bright_red", "bright_green", "bright_yellow", "bright_blue", "bright_magenta", "bright_cyan", "bright_white",
];

type Table = Record<string, unknown>;

/** Parse a theme file. `base` provides every value the file doesn't set. */
export function parseTheme(source: string, base: Theme | null, origin: Theme["source"]): Theme {
  const doc = parseToml(source) as Table;
  const meta = (doc.meta ?? {}) as Table;
  const paletteRaw = (doc.palette ?? {}) as Table;
  const palette: Record<string, RGB> = { ...(base?.palette ?? {}) };
  for (const [k, v] of Object.entries(paletteRaw)) palette[k] = hex(String(v));

  const color = (section: string, key: string, fallback: RGB | undefined): RGB => {
    const raw = ((doc[section] ?? {}) as Table)[key];
    if (raw === undefined) {
      if (fallback === undefined) throw new Error(`theme is missing [${section}] ${key}`);
      return fallback;
    }
    const s = String(raw);
    if (s.startsWith("#")) return hex(s);
    if (s in palette) return palette[s];
    throw new Error(`[${section}] ${key} = "${s}": not a #hex color nor a [palette] name`);
  };

  const c = {} as UiColors;
  for (const [field, key] of Object.entries(UI_KEYS) as [keyof UiColors, string][]) c[field] = color("ui", key, base?.c[field]);
  // readable in every theme (WCAG 2.1): secondary text and hints 4.5:1 on the background,
  // the panels and the pop-ups — a theme that goes paler gets just enough of its own text colour
  const grounds = [c.bg, c.panel, c.panelAlt];
  c.muted = readable(c.muted, grounds, 4.5, c.fg);
  c.subtle = readable(c.subtle, grounds, 4.5, c.fg);
  const syntax = {} as SyntaxColors;
  for (const [field, key] of Object.entries(SYNTAX_KEYS) as [keyof SyntaxColors, string][]) syntax[field] = color("syntax", key, base?.syntax[field]);
  const ansi = ANSI_NAMES.map((n, i) => color("ansi", n, base?.ansi[i]));

  const fxRaw = (doc.fx ?? {}) as Table;
  const num = (k: string, d: number) => (typeof fxRaw[k] === "number" ? (fxRaw[k] as number) : d);
  const gradientRaw = fxRaw.gradient;
  const gradient = Array.isArray(gradientRaw)
    ? gradientRaw.map((g) => (String(g).startsWith("#") ? hex(String(g)) : palette[String(g)] ?? c.accent))
    : base?.gradient ?? [c.accent, c.accentAlt];

  const border = String(meta.border ?? base?.border ?? "round") as BorderStyle;
  return {
    name: String(meta.name ?? "unnamed"),
    author: String(meta.author ?? "anonymous"),
    description: String(meta.description ?? ""),
    border: ["round", "single", "heavy", "double"].includes(border) ? border : "round",
    palette,
    c,
    syntax,
    ansi,
    gradient,
    fx: {
      bloom: num("bloom", base?.fx.bloom ?? 0.4),
      scanlines: num("scanlines", base?.fx.scanlines ?? 0.1),
      vignette: num("vignette", base?.fx.vignette ?? 0.5),
      // false: this theme never flickers, whatever the user's CRT setting (e-ink…)
      flicker: typeof fxRaw.flicker === "boolean" ? fxRaw.flicker : base?.fx.flicker ?? true,
      monochrome: typeof fxRaw.monochrome === "boolean" ? fxRaw.monochrome : base?.fx.monochrome ?? false,
      paper: num("paper", base?.fx.paper ?? 0),
    },
    widgetFrame: typeof meta.widget_frame === "string" ? String(meta.widget_frame) : base?.widgetFrame ?? "round",
    logo: typeof (doc.ascii as Table | undefined)?.logo === "string" ? String((doc.ascii as Table).logo) : base?.logo,
    glyphs: parseGlyphs((doc.glyphs ?? {}) as Table, base?.glyphs),
    font: parseFont((doc.font ?? {}) as Table, base?.font ?? null),
    background: parseBackground((doc.background ?? {}) as Table, base?.background, (k) => {
      const raw = ((doc.background ?? {}) as Table)[k];
      if (raw === undefined) return undefined;
      const v = String(raw);
      if (v === "" || v === "auto") return null;
      if (v.startsWith("#")) return hex(v);
      if (v in palette) return palette[v];
      throw new Error(`[background] ${k} = "${v}": not a #hex color nor a [palette] name`);
    }),
    sound: {
      pack: typeof ((doc.sound ?? {}) as Table).pack === "string" ? String(((doc.sound ?? {}) as Table).pack) : base?.sound.pack ?? "retro",
      pitch: clampNum(((doc.sound ?? {}) as Table).pitch, base?.sound.pitch ?? 1, 0.25, 4),
    },
    anim: {
      select: typeof ((doc.anim ?? {}) as Table).select === "string" ? String(((doc.anim ?? {}) as Table).select) : base?.anim.select ?? "brackets",
      noise: typeof ((doc.anim ?? {}) as Table).noise === "string" && ((doc.anim ?? {}) as Table).noise ? String(((doc.anim ?? {}) as Table).noise) : base?.anim.noise ?? DEFAULT_NOISE,
      page: typeof ((doc.anim ?? {}) as Table).page === "string" ? String(((doc.anim ?? {}) as Table).page) : base?.anim.page ?? "glitch",
      type: typeof ((doc.anim ?? {}) as Table).type === "string" ? String(((doc.anim ?? {}) as Table).type) : base?.anim.type ?? "none",
      screensaver: typeof ((doc.anim ?? {}) as Table).screensaver === "string" ? String(((doc.anim ?? {}) as Table).screensaver) : base?.anim.screensaver ?? "city",
    },
    extends: typeof meta.extends === "string" ? meta.extends : undefined,
    source: origin,
  };
}

export const DEFAULT_GLYPHS: ThemeGlyphs = { mark: "◆", bullet: "›", spinner: "⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏", todo: "□", done: "■" };
export const DEFAULT_FONT: ThemeFont = { family: "JetBrains Mono", scale: 1, weights: null };

function parseGlyphs(t: Table, base: ThemeGlyphs | undefined): ThemeGlyphs {
  const g = { ...(base ?? DEFAULT_GLYPHS) };
  for (const k of Object.keys(DEFAULT_GLYPHS) as (keyof ThemeGlyphs)[]) if (typeof t[k] === "string" && t[k]) g[k] = String(t[k]);
  return g;
}

/** Font settings are inherited from the base theme, key by key. */
function parseFont(t: Table, base: ThemeFont | null): ThemeFont {
  const b = base ?? DEFAULT_FONT;
  const w = Array.isArray(t.weights) && t.weights.length === 2 ? (t.weights.map(Number) as [number, number]) : t.family !== undefined && t.weights === undefined ? null : b.weights;
  const family = typeof t.family === "string" && t.family ? t.family : b.family;
  // a different font starts from its own size, not the previous font's correction
  const scale = clampNum(t.scale, family !== b.family ? 1 : b.scale, 0.5, 2);
  return { family, scale, weights: w };
}

const DEFAULT_NOISE = "ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄ0123456789:=*+<>";
const DEFAULT_BACKGROUND: ThemeBackground = { effect: "fog", density: 0.6, speed: 1, color: null, color2: null, glyphs: "" };

function clampNum(v: unknown, fallback: number, lo: number, hi: number): number {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : fallback;
}

function parseBackground(t: Table, base: ThemeBackground | undefined, color: (k: string) => RGB | null | undefined): ThemeBackground {
  const b = base ?? DEFAULT_BACKGROUND;
  const c1 = color("color"), c2 = color("color2");
  return {
    effect: typeof t.effect === "string" && t.effect ? t.effect : b.effect,
    density: clampNum(t.density, b.density, 0, 1),
    speed: clampNum(t.speed, b.speed, 0.1, 4),
    color: c1 === undefined ? b.color : c1,
    color2: c2 === undefined ? b.color2 : c2,
    glyphs: typeof t.glyphs === "string" ? t.glyphs : b.glyphs,
  };
}

/**
 * Personal tweaks on top of a theme, as "section.key" → value
 * ({ "ui.accent": "#ff2e88", "background.effect": "snow" }). They're kept in
 * settings.json (appearance.tweaks.<theme>), so the theme file stays intact.
 */
export type Tweaks = Record<string, string | number>;

export function tweaksToToml(name: string, tweaks: Tweaks, extendsName?: string): string {
  const doc: Record<string, Record<string, unknown>> = { meta: { name, ...(extendsName ? { extends: extendsName } : {}) } };
  for (const [k, v] of Object.entries(tweaks)) {
    const dot = k.indexOf(".");
    if (dot < 1) continue;
    const sec = k.slice(0, dot), key = k.slice(dot + 1);
    (doc[sec] ??= {})[key] = sec === "font" && key === "weights" && typeof v === "string" ? v.split(/[ ,]+/).map(Number) : v;
  }
  return stringifyToml(doc);
}

/** The theme with its tweaks applied (throws if a tweak is invalid). */
export function applyTweaks(theme: Theme, tweaks: Tweaks | undefined): Theme {
  if (!tweaks || !Object.keys(tweaks).length) return theme;
  const t = parseTheme(tweaksToToml(theme.name, tweaks), theme, theme.source);
  return { ...t, author: theme.author, description: theme.description, extends: theme.extends };
}

// Built-in themes are the .toml files in /themes, bundled at build time.
const BUILTIN_SOURCES = import.meta.glob("../../themes/*.toml", { query: "?raw", import: "default", eager: true }) as Record<string, string>;

export class ThemeManager {
  private themes = new Map<string, Theme>();
  current: Theme;
  /** Theme files from the vault (.icebreaker/themes) that failed to parse, with the reason. */
  errors: { file: string; error: string }[] = [];

  constructor() {
    const sources = Object.entries(BUILTIN_SOURCES).map(([path, src]) => ({ name: path.split("/").pop()!.replace(".toml", ""), src }));
    const def = sources.find((s) => s.name === "nightshade") ?? sources[0];
    const base = parseTheme(def.src, null, "builtin");
    this.themes.set(base.name, base);
    for (const s of sources) {
      if (s === def) continue;
      try {
        const t = parseTheme(s.src, base, "builtin");
        this.themes.set(t.name, t);
      } catch (e) {
        console.error(`built-in theme ${s.name} is broken`, e);
      }
    }
    this.current = base;
  }

  get default(): Theme {
    return this.themes.get("nightshade") ?? [...this.themes.values()][0];
  }

  list(): Theme[] {
    return [...this.themes.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  get(name: string): Theme | undefined {
    return this.themes.get(name);
  }

  /** Register themes found in the vault. Broken files are reported, not fatal. */
  loadUserThemes(files: { path: string; content: string }[]): void {
    for (const [name, t] of this.themes) if (t.source === "vault") this.themes.delete(name);
    this.errors = [];
    // themes can build on another one: [meta] extends = "phosphor"
    for (const f of files) {
      try {
        const ext = /^\s*extends\s*=\s*"([^"]+)"/m.exec(f.content)?.[1];
        const t = parseTheme(f.content, (ext && this.themes.get(ext)) || this.default, "vault");
        this.themes.set(t.name, t);
      } catch (e) {
        this.errors.push({ file: f.path, error: e instanceof Error ? e.message : String(e) });
      }
    }
  }
}
