import { rgb, type RGB } from "./color";
import { BOLD, DIM, INVERSE, ITALIC, STRIKE, UNDERLINE } from "./grid";

/**
 * ANSI escape codes (SGR) → styled runs. Shell commands and plugins print
 * standard "\x1b[35m…\x1b[0m" sequences, exactly like in a real terminal.
 *
 * Colors 0–15 are stored as *references* to the theme's [ansi] table
 * (encoded as negative numbers, see `ansiRef`) so old output re-colors when
 * you switch themes.
 */

export interface Run {
  text: string;
  fg: number; // DEFAULT_FG, an ansiRef, or an RGB
  bg: number; // DEFAULT_BG, an ansiRef, or an RGB
  attrs: number;
}

export const DEFAULT_FG = -1;
export const DEFAULT_BG = -1;
export const ansiRef = (i: number) => -(i + 2);

/** Turn a stored color into a real RGB using the current theme. */
export function resolveColor(c: number, ansi: RGB[], fallback: RGB): RGB {
  if (c === -1) return fallback;
  if (c < -1) return ansi[-c - 2] ?? fallback;
  return c;
}

export interface AnsiState {
  fg: number;
  bg: number;
  attrs: number;
}

export const freshState = (): AnsiState => ({ fg: DEFAULT_FG, bg: DEFAULT_BG, attrs: 0 });

// eslint-disable-next-line no-control-regex
const ESC_RE = /\x1b\[([0-9;]*)([A-Za-z])/g;

export function stripAnsi(s: string): string {
  return s.replace(ESC_RE, "");
}

/** Split text with escape codes into runs. Mutates `st` so styles carry across writes. */
export function parseAnsi(text: string, st: AnsiState): Run[] {
  const runs: Run[] = [];
  let last = 0;
  const push = (t: string) => {
    if (t) runs.push({ text: t, fg: st.fg, bg: st.bg, attrs: st.attrs });
  };
  for (const m of text.matchAll(ESC_RE)) {
    push(text.slice(last, m.index));
    last = m.index! + m[0].length;
    if (m[2] !== "m") continue; // only SGR is supported; other sequences are dropped
    applySgr(m[1], st);
  }
  push(text.slice(last));
  return runs;
}

function applySgr(params: string, st: AnsiState): void {
  const codes = params === "" ? [0] : params.split(";").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < codes.length; i++) {
    const c = codes[i];
    if (c === 0) Object.assign(st, freshState());
    else if (c === 1) st.attrs |= BOLD;
    else if (c === 2) st.attrs |= DIM;
    else if (c === 3) st.attrs |= ITALIC;
    else if (c === 4) st.attrs |= UNDERLINE;
    else if (c === 7) st.attrs |= INVERSE;
    else if (c === 27) st.attrs &= ~INVERSE;
    else if (c === 9) st.attrs |= STRIKE;
    else if (c === 22) st.attrs &= ~(BOLD | DIM);
    else if (c === 23) st.attrs &= ~ITALIC;
    else if (c === 24) st.attrs &= ~UNDERLINE;
    else if (c === 29) st.attrs &= ~STRIKE;
    else if (c >= 30 && c <= 37) st.fg = ansiRef(c - 30);
    else if (c >= 90 && c <= 97) st.fg = ansiRef(c - 90 + 8);
    else if (c >= 40 && c <= 47) st.bg = ansiRef(c - 40);
    else if (c >= 100 && c <= 107) st.bg = ansiRef(c - 100 + 8);
    else if (c === 39) st.fg = DEFAULT_FG;
    else if (c === 49) st.bg = DEFAULT_BG;
    else if (c === 38 || c === 48) {
      let color: number | undefined;
      if (codes[i + 1] === 5) {
        color = xterm256(codes[i + 2] ?? 0);
        i += 2;
      } else if (codes[i + 1] === 2) {
        color = rgb(codes[i + 2] ?? 0, codes[i + 3] ?? 0, codes[i + 4] ?? 0);
        i += 4;
      }
      if (color !== undefined) {
        if (c === 38) st.fg = color;
        else st.bg = color;
      }
    }
  }
}

function xterm256(n: number): number {
  if (n < 16) return ansiRef(n);
  if (n >= 232) {
    const v = 8 + (n - 232) * 10;
    return rgb(v, v, v);
  }
  const i = n - 16;
  const level = (x: number) => (x === 0 ? 0 : 55 + x * 40);
  return rgb(level(Math.floor(i / 36)), level(Math.floor(i / 6) % 6), level(i % 6));
}

/** Tiny helpers for writing colored output: `fmt.magenta("hi")`. */
const wrap = (open: string, close = "\x1b[0m") => (s: string | number) => `\x1b[${open}m${s}${close}`;
export const fmt = {
  bold: wrap("1", "\x1b[22m"),
  dim: wrap("2", "\x1b[22m"),
  italic: wrap("3", "\x1b[23m"),
  underline: wrap("4", "\x1b[24m"),
  black: wrap("30", "\x1b[39m"),
  red: wrap("31", "\x1b[39m"),
  green: wrap("32", "\x1b[39m"),
  yellow: wrap("33", "\x1b[39m"),
  blue: wrap("34", "\x1b[39m"),
  magenta: wrap("35", "\x1b[39m"),
  cyan: wrap("36", "\x1b[39m"),
  white: wrap("37", "\x1b[39m"),
  gray: wrap("90", "\x1b[39m"),
  pink: wrap("95", "\x1b[39m"),
  sky: wrap("96", "\x1b[39m"),
};
