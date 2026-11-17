import { parse as parseToml } from "smol-toml";
import { hex, type RGB } from "./color";

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
  fx: { bloom: number; scanlines: number; vignette: number };
  /** Optional replacement for the boot logo. */
  logo?: string;
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
    },
    logo: typeof (doc.ascii as Table | undefined)?.logo === "string" ? String((doc.ascii as Table).logo) : base?.logo,
    source: origin,
  };
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
    for (const f of files) {
      try {
        const t = parseTheme(f.content, this.default, "vault");
        this.themes.set(t.name, t);
      } catch (e) {
        this.errors.push({ file: f.path, error: e instanceof Error ? e.message : String(e) });
      }
    }
  }
}
