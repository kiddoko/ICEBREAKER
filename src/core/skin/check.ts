import { contrast } from "../color";
import type { Theme } from "../theme";
import { KEYS } from "./components";
import { applyFloor } from "./registry";
import { SKIN_SCHEMA } from "./schema";

/**
 * `theme check`: what the loader made of a theme, as lines for the shell — its schema, what its
 * file set wrong in the components, and the floor (readable text, readable keys). `ok` is false
 * when anything was refused or put back.
 */
export function checkTheme(t: Theme): { ok: boolean; lines: string[] } {
  const lines: string[] = [];
  const schema = t.schema ?? 1;
  lines.push(`${t.name} · ${t.source} · schema ${schema}${schema < SKIN_SCHEMA ? " (read as " + SKIN_SCHEMA + ", the file stays as it is)" : ""}`);
  const problems = [...(t.skinProblems ?? [])];
  // the floor, again on the final colours: what a key and the text read at
  for (const p of applyFloor(KEYS, t.keys ?? {}, t.c).problems) if (!problems.some((q) => q.key === p.key)) problems.push(p);
  const text = Math.min(contrast(t.c.fg, t.c.bg), contrast(t.c.muted, t.c.bg), contrast(t.c.subtle, t.c.bg));
  lines.push(`text on the background: ${text.toFixed(1)}:1 at least${text < 4.5 ? " — under 4.5:1" : ""}`);
  for (const p of problems) lines.push(`⚠ ${p.key} — ${p.reason}`);
  const ok = !problems.length && text >= 4.5;
  lines.push(ok ? "✓ nothing to fix" : `${problems.length + (text < 4.5 ? 1 : 0)} thing(s) to look at`);
  return { ok, lines };
}
