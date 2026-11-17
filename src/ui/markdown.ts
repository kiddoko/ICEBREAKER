import { BOLD, DIM, ITALIC, STRIKE, UNDERLINE, type Style } from "../core/grid";
import type { Theme } from "../core/theme";

/**
 * Line-by-line Markdown highlighting for the editor and chat views.
 *
 * `highlightLine` returns one Style per UTF-16 code unit of the line. Rules are
 * applied in order and later rules win, which keeps each rule a simple regex.
 * The only state carried between lines is "inside a ``` fence" and "inside
 * the --- frontmatter ---".
 */

export interface MdState {
  fence: boolean;
  frontmatter: boolean;
  first: boolean;
}

export const initialMdState = (): MdState => ({ fence: false, frontmatter: false, first: true });

export function highlightLine(line: string, st: MdState, t: Theme): { styles: (Style | undefined)[]; next: MdState } {
  const s = t.syntax;
  const styles: (Style | undefined)[] = new Array(line.length);
  const paint = (from: number, to: number, style: Style) => {
    for (let i = from; i < to && i < line.length; i++) styles[i] = { ...styles[i], ...style };
  };
  const next: MdState = { ...st, first: false };

  // Frontmatter: only when the very first line is ---
  if (st.first && line.trim() === "---") {
    paint(0, line.length, { fg: s.frontmatter });
    return { styles, next: { ...next, frontmatter: true } };
  }
  if (st.frontmatter) {
    paint(0, line.length, { fg: s.frontmatter });
    const key = line.match(/^([\w-]+):/);
    if (key) paint(0, key[1].length, { fg: s.list });
    if (line.trim() === "---") next.frontmatter = false;
    return { styles, next };
  }

  // Code fences
  if (/^\s*(```|~~~)/.test(line)) {
    paint(0, line.length, { fg: s.code, attrs: DIM });
    next.fence = !st.fence;
    return { styles, next };
  }
  if (st.fence) {
    paint(0, line.length, { fg: s.code, bg: s.codeBg });
    return { styles, next };
  }

  // Block-level
  const heading = line.match(/^(#{1,6})\s/);
  if (heading) {
    const level = heading[1].length;
    const fg = level === 1 ? s.heading1 : level === 2 ? s.heading2 : s.heading3;
    paint(0, line.length, { fg, attrs: BOLD | (level === 1 ? UNDERLINE : 0) });
    paint(0, level, { fg, attrs: DIM | BOLD });
  } else if (/^\s*>/.test(line)) {
    paint(0, line.length, { fg: s.quote, attrs: ITALIC });
  } else if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
    paint(0, line.length, { fg: s.hr });
  }

  const task = line.match(/^(\s*)([-*+]) \[( |x|X)\]/);
  if (task) {
    const start = task[1].length;
    const done = task[3] !== " ";
    paint(start, start + 1, { fg: s.list, attrs: BOLD });
    paint(start + 2, start + 5, { fg: s.checkbox, attrs: BOLD });
    if (done) paint(start + 6, line.length, { fg: t.c.subtle, attrs: STRIKE });
  } else {
    const list = line.match(/^(\s*)([-*+]|\d+[.)])\s/);
    if (list) paint(list[1].length, list[1].length + list[2].length, { fg: s.list, attrs: BOLD });
  }

  // Inline (order matters: later wins)
  const each = (re: RegExp, style: Style, group = 0) => {
    for (const m of line.matchAll(re)) {
      const start = m.index! + (group ? m[0].indexOf(m[group]) : 0);
      paint(start, start + m[group].length, style);
    }
  };
  each(/\*\*[^*]+\*\*|__[^_]+__/g, { fg: s.bold, attrs: BOLD });
  // *italic* / _italic_ — the leading group stands in for a lookbehind,
  // which older WebKit (macOS < 13.3, some Linux distros) can't parse.
  each(/(?:^|[^*\w])(\*[^*\s][^*]*\*)(?!\*)/g, { fg: s.italic, attrs: ITALIC }, 1);
  each(/(?:^|[^_\w])(_[^_\s][^_]*_)(?![\w_])/g, { fg: s.italic, attrs: ITALIC }, 1);
  each(/~~[^~]+~~/g, { fg: t.c.subtle, attrs: STRIKE });
  each(/https?:\/\/[^\s)>\]]+/g, { fg: s.link, attrs: UNDERLINE });
  each(/\[[^\]]*\]\([^)]*\)/g, { fg: s.link, attrs: UNDERLINE });
  each(/\[\[[^\]]+\]\]/g, { fg: s.wikilink, attrs: BOLD });
  each(/(?:^|\s)(#[\p{L}\p{N}_\-/]+)/gu, { fg: s.tag }, 1);
  each(/`[^`]+`/g, { fg: s.code, bg: s.codeBg });

  return { styles, next };
}

/** Find a [[wikilink]] or [text](link) target at a column, if any. */
export function linkAt(line: string, col: number): string | null {
  for (const m of line.matchAll(/\[\[([^\]|#]+)(?:[#|][^\]]*)?\]\]|\[[^\]]*\]\(([^)]+)\)/g)) {
    if (col >= m.index! && col <= m.index! + m[0].length) return (m[1] ?? m[2]).trim();
  }
  return null;
}
