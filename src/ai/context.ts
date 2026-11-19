import { fmt } from "../core/ansi";
import type { Deck } from "../deck";
import type { Command } from "../shell/types";

/**
 * UPLINK's context page: a hidden note (.icebreaker/context.md) the AI reads
 * before every conversation, so it knows who you are, how you want it to talk
 * and what your vault looks like — without you repeating it.
 *
 * Most of it is built by the deck itself, no AI involved, and rebuilt each time
 * UPLINK starts a conversation (the block between the two `auto` marks): your
 * profile, the vault's folders, the notes you touched lately, your pins, colour
 * tags, the modules that are on, today's date.
 *
 * The rest is yours (`context` opens it): how UPLINK should talk to you (filled
 * with sensible defaults), what you want it to know about you, and the lines
 * UPLINK itself adds when you tell it something lasting.
 */

export const CONTEXT_PATH = ".icebreaker/context.md";
const AUTO_START = "<!-- auto: rebuilt by ICEBREAKER before each conversation — edits here are replaced -->";
const AUTO_END = "<!-- /auto -->";

function defaults(deck: Deck): string {
  const fr = deck.settings.data.user.language === "fr";
  return `# UPLINK — context

What UPLINK reads before every conversation. Edit the sections above the
automatic block as you like; the automatic block is rebuilt by ICEBREAKER.

## How to talk to me
- ${fr ? "Reply in French, use « tu », casual but not sloppy." : "Reply in English, casual but clear."}
- Short and direct: the answer first, details after if they help.
- Markdown is fine (it's a terminal): short lists, no wide tables.
- Read my notes before quoting or summarizing them; never invent what they say.
- Only write or change a note when I ask, and say which file you wrote.
- A light cyberpunk touch is welcome; clarity always wins.

## About me (what I want you to know)
-

## Things UPLINK learned
<!-- UPLINK adds one short line here when you tell it something lasting about you or how you want it to behave. -->
`;
}

/** The automatic part: built from the deck's own state, no AI. */
function auto(deck: Deck): string {
  const s = deck.settings.data;
  const u = s.user;
  const v = deck.vault;
  const lines: string[] = [];
  lines.push("## Profile");
  lines.push(`- name: ${u.handle || "netrunner"}`);
  if (u.pronouns) lines.push(`- pronouns: ${u.pronouns}`);
  if (u.gender) lines.push(`- gender: ${u.gender === "other" ? u.genderOther || "other" : u.gender}`);
  lines.push(`- language: ${u.language === "fr" ? "French" : "English"}${u.locale ? ` (dates: ${u.locale})` : ""}`);
  if (u.location?.precision && u.location.precision !== "none" && u.location.name) lines.push(`- place: ${[u.location.name, u.location.country].filter(Boolean).join(", ")}`);
  lines.push("");
  lines.push("## Vault");
  const notes = v.markdown();
  lines.push(`- ${notes.length} notes · journal in "${v.journalFolder}/" (one file per day, YYYY-MM-DD.md)`);
  // the folders, two levels, with how many notes each holds
  const count = (dir: string) => notes.filter((e) => e.path.startsWith(`${dir}/`)).length;
  const dirs = v.entries.filter((e) => e.isDir && !e.path.startsWith(".") && e.path.split("/").length <= 2).map((e) => e.path).sort();
  if (dirs.length) {
    lines.push("- folders:");
    for (const d of dirs.slice(0, 16)) lines.push(`  ${"  ".repeat(d.split("/").length - 1)}- ${d.split("/").pop()}/ (${count(d)})`);
  }
  const recent = [...notes].filter((e) => !e.path.startsWith(".")).sort((a, b) => b.modified - a.modified).slice(0, 5);
  if (recent.length) lines.push(`- touched lately: ${recent.map((e) => e.path).join(", ")}`);
  const pins = s.favorites ?? [];
  if (pins.length) lines.push(`- pinned: ${pins.slice(0, 10).map((p) => p.label).join(", ")}`);
  const tags = Object.entries(deck.marks.tags);
  if (tags.length) {
    const byColour: Record<string, string[]> = {};
    for (const [path, colour] of tags) (byColour[colour] ??= []).push(path);
    lines.push(`- colour tags: ${Object.entries(byColour).map(([c, ps]) => `${c} (${ps.slice(0, 5).join(", ")}${ps.length > 5 ? "…" : ""})`).join(" · ")}`);
  }
  const mods = deck.plugins.active().map((p) => p.manifest.name);
  if (mods.length) lines.push(`- modules on: ${mods.join(", ")}`);
  lines.push("");
  lines.push("## Today");
  const now = new Date();
  lines.push(`- ${now.toLocaleDateString("en", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}`);
  return lines.join("\n");
}

/** Rebuild the automatic block (the rest is kept as you wrote it) and return the whole page. */
export async function refreshContext(deck: Deck): Promise<string> {
  const v = deck.vault;
  let text = (await v.exists(CONTEXT_PATH)) ? await v.read(CONTEXT_PATH).catch(() => "") : "";
  if (!text.trim()) text = defaults(deck);
  const block = `${AUTO_START}\n${auto(deck)}\n${AUTO_END}`;
  const a = text.indexOf(AUTO_START), b = text.indexOf(AUTO_END);
  const next = a >= 0 && b > a ? `${text.slice(0, a)}${block}${text.slice(b + AUTO_END.length)}` : `${text.replace(/\s*$/, "")}\n\n${block}\n`;
  if (next !== text) await deck.history.quietAsync(() => v.write(CONTEXT_PATH, next)).catch(() => {});
  return next;
}

/** `context`: open UPLINK's context page (rebuilt first). */
export const contextCommand: Command = {
  name: "context",
  summary: "UPLINK's context page: who you are, how it should talk, your vault",
  usage: "context          open it (the automatic part is rebuilt first)\ncontext show     print it here",
  man: "A hidden note (.icebreaker/context.md) UPLINK reads before every conversation. The part between the auto marks is rebuilt by the deck (no AI): your profile, the vault's folders, recent notes, pins, colour tags, modules, the date. Above it, yours to edit: how UPLINK talks to you, what you want it to know, and what it learned.",
  async run(ctx) {
    const text = await refreshContext(ctx.deck);
    if (ctx.args[0] === "show") return void ctx.out(`${text}\n`);
    await ctx.deck.openFile(CONTEXT_PATH);
    ctx.out(fmt.dim(`${CONTEXT_PATH}\n`));
  },
};
