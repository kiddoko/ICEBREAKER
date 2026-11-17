import { isoDate } from "./paths";
import type { Vault } from "./vault";

/**
 * Journal conventions: one Markdown file per day in `<journal folder>/YYYY-MM-DD.md`
 * (Obsidian "Daily notes" compatible). New entries come from
 * `.icebreaker/templates/journal.md` if you create it, else the default below.
 *
 * Template placeholders: {{date}} {{title}} {{weekday}} {{time}}
 */
const DEFAULT_TEMPLATE = `---
date: {{date}}
tags: [journal]
mood:
---
# {{title}}

## log

## thoughts
`;

export function titleFor(date: Date, locale: string): string {
  const s = date.toLocaleDateString(locale || undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

async function template(vault: Vault): Promise<string> {
  const custom = ".icebreaker/templates/journal.md";
  try {
    if (await vault.exists(custom)) return await vault.read(custom);
  } catch {
    /* fall back to default */
  }
  return DEFAULT_TEMPLATE;
}

/** Make sure the entry for `date` exists; returns its path. */
export async function ensureEntry(vault: Vault, date: Date, locale: string): Promise<string> {
  const path = vault.journalPath(date);
  if (await vault.exists(path)) return path;
  const tpl = await template(vault);
  const content = tpl
    .replaceAll("{{date}}", isoDate(date))
    .replaceAll("{{title}}", titleFor(date, locale))
    .replaceAll("{{weekday}}", date.toLocaleDateString(locale || undefined, { weekday: "long" }))
    .replaceAll("{{time}}", new Date().toLocaleTimeString(locale || undefined, { hour: "2-digit", minute: "2-digit" }));
  await vault.write(path, content);
  return path;
}

/**
 * Add "- HH:MM text" to the "## log" section of the day's entry
 * (or at the end if there's no such section). Used by `journal add`.
 */
export async function appendLog(vault: Vault, date: Date, text: string, locale: string): Promise<string> {
  const path = await ensureEntry(vault, date, locale);
  const lines = (await vault.read(path)).split("\n");
  const time = new Date().toLocaleTimeString(locale || undefined, { hour: "2-digit", minute: "2-digit" });
  const entry = `- ${time} ${text.trim()}`;

  const logIdx = lines.findIndex((l) => /^##\s+log\b/i.test(l));
  if (logIdx === -1) {
    lines.push(entry);
  } else {
    // insert after the last non-empty line of the section
    let end = logIdx + 1;
    while (end < lines.length && !/^#{1,6}\s/.test(lines[end])) end++;
    let insertAt = end;
    while (insertAt > logIdx + 1 && lines[insertAt - 1].trim() === "") insertAt--;
    if (lines[insertAt - 1]?.trim() === "-") lines.splice(insertAt - 1, 1, entry);
    else lines.splice(insertAt, 0, entry);
  }
  await vault.write(path, lines.join("\n"));
  return path;
}

/** Consecutive days with an entry, ending today (or yesterday). */
export function streak(dates: Set<string>): number {
  let n = 0;
  const d = new Date();
  if (!dates.has(isoDate(d))) d.setDate(d.getDate() - 1);
  while (dates.has(isoDate(d))) {
    n++;
    d.setDate(d.getDate() - 1);
  }
  return n;
}
