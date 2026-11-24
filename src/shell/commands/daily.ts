import { fmt } from "../../core/ansi";
import { dateLocale } from "../../core/i18n";
import { ASK_SYSTEM_PROMPT } from "../../ai/prompts";
import { ensureEntry } from "../../vault/journal";
import { isoDate } from "../../vault/paths";
import type { Command, ShellContext } from "../types";
import { q } from "../../ui/ui";
import { dayLong } from "../../core/dates";

/**
 * `daily`: the end-of-day check-in, asked right in the shell.
 * Quick answers are numbered (press 1-5, click, or arrows + enter); text
 * answers can be skipped with enter. Everything lands in today's journal
 * entry under "## daily log", with Obsidian/Dataview-style fields
 * (`mood:: 4`) so you can chart them later (`daily trend`).
 * Tomorrow's tasks go to the TODO module (due tomorrow) when it's on,
 * else they're written as `- [ ]` checkboxes.
 */

const SCALES = {
  mood: ["awful", "bad", "meh", "good", "great"],
  energy: ["drained", "low", "ok", "high", "wired"],
  output: ["nothing", "a bit", "decent", "a lot", "crushed it"],
  sleep: ["<5h", "5-6h", "7-8h", "9h+"],
};

const SECTION = /^##\s+daily log\b/i;

async function checkIn(ctx: ShellContext): Promise<number> {
  const { deck } = ctx;
  const locale = deck.settings.data.user.locale;
  const now = new Date();
  const path = await ensureEntry(deck.vault, now, locale);
  let text = await deck.vault.read(path);
  const has = text.split("\n").some((l) => SECTION.test(l));

  const day = dayLong(now, locale || dateLocale());
  ctx.out(`\n${fmt.magenta(fmt.bold(`── DAILY LOG · ${day} `))}${fmt.dim("─".repeat(20))}\n`);
  ctx.out(fmt.dim("quick answers: 1-5 · text: enter skips · esc stops (nothing is saved)\n\n"));

  if (has) {
    const what = await ctx.read("already logged today", { choices: ["replace it", "cancel"] });
    if (what !== "replace it") return what === null ? 130 : 0;
  }

  const pick = async (key: keyof typeof SCALES, q: string) => {
    ctx.out(`${fmt.cyan("?")} ${q}\n`);
    const v = await ctx.read(key, { choices: SCALES[key] });
    if (v === null) throw new Stop();
    return v;
  };
  const ask = async (key: string, q: string, placeholder?: string) => {
    ctx.out(`${fmt.cyan("?")} ${q}\n`);
    const v = await ctx.read(key, { placeholder });
    if (v === null) throw new Stop();
    return v.trim();
  };

  try {
    const mood = await pick("mood", "How was the day overall?");
    const energy = await pick("energy", "Energy level?");
    const sleep = await pick("sleep", "How much did you sleep last night?");
    const output = await pick("output", "How much did you get done?");
    const win = await ask("win", "Best moment or thing you're proud of?");
    const friction = await ask("friction", "What went wrong or drained you?");
    const improve = await ask("improve", "One thing to do better tomorrow?");
    const grateful = await ask("grateful", "Something you're grateful for?");
    ctx.out(`${fmt.cyan("?")} Top tasks for tomorrow ${fmt.dim("(one per line, enter on empty to finish)")}\n`);
    const tasks: string[] = [];
    for (let i = 1; i <= 5; i++) {
      const t = await ctx.read(`task ${i}`, { placeholder: i === 1 ? "e.g. finish the report" : "enter = done" });
      if (t === null) throw new Stop();
      if (!t.trim()) break;
      tasks.push(t.trim());
    }
    const note = await ask("note", "Anything else?");

    const n = (k: keyof typeof SCALES, v: string) => SCALES[k].indexOf(v) + 1;
    const lines = [
      "## daily log",
      "",
      `mood:: ${n("mood", mood)} · energy:: ${n("energy", energy)} · sleep:: ${sleep} · output:: ${n("output", output)}`,
      `*${mood}, ${energy} energy, ${output}*`,
    ];
    const items = [win && `- **win** ${win}`, friction && `- **friction** ${friction}`, improve && `- **improve** ${improve}`, grateful && `- **grateful** ${grateful}`, note && `- **note** ${note}`].filter(Boolean) as string[];
    if (items.length) lines.push("", ...items);
    // tomorrow's tasks: into the TODO module if it's there, else checkboxes in the entry
    const toModule = tasks.length > 0 && !!deck.commands.get("todo");
    if (toModule) for (const t of tasks) await ctx.shell.run(`todo add ${q(t)} --due tomorrow`);
    if (tasks.length) lines.push("", "### tomorrow", ...tasks.map((t) => (toModule ? `- ${t}` : `- [ ] ${t}`)));
    const block = lines.join("\n");

    text = await deck.vault.read(path); // may have changed while answering
    text = removeSection(text);
    // fill an empty `mood:` frontmatter field (the default template has one; « humeur: » in French)
    text = text.replace(/^(---\n[\s\S]*?\n(?:mood|humeur):)[ \t]*(\n)/, `$1 ${n("mood", mood)}$2`);
    await deck.vault.write(path, `${text.replace(/\s*$/, "")}\n\n${block}\n`);
    ctx.out(`\n${fmt.green("✓")} logged to ${fmt.bold(path)}${tasks.length ? fmt.dim(` · ${tasks.length} task${tasks.length > 1 ? "s" : ""} for tomorrow`) : ""}\n`);
    deck.notify("daily log saved", "success");
    return 0;
  } catch (e) {
    if (e instanceof Stop) {
      ctx.out(fmt.dim("\nstopped — nothing saved\n"));
      return 130;
    }
    throw e;
  }
}

class Stop extends Error {}

/** Drop an existing "## daily log" section (up to the next ## heading). */
function removeSection(text: string): string {
  const lines = text.split("\n");
  const i = lines.findIndex((l) => SECTION.test(l));
  if (i < 0) return text;
  let j = i + 1;
  while (j < lines.length && !/^##\s/.test(lines[j])) j++;
  lines.splice(i, j - i);
  return lines.join("\n");
}

/** Mood / energy over the last N days, as a little chart. */
async function trend(ctx: ShellContext, days: number): Promise<number> {
  const { deck } = ctx;
  const dates: string[] = [];
  for (let i = days - 1; i >= 0; i--) dates.push(isoDate(new Date(Date.now() - i * 86400_000)));
  const paths = dates.map((d) => deck.vault.journalPath(new Date(`${d}T12:00`)));
  const texts = await deck.vault.readMany(paths);
  const field = (t: string | null, k: string) => Number(t?.match(new RegExp(`${k}::\\s*(\\d)`))?.[1] ?? 0);
  const bars = " ▁▂▃▄▅▆▇█";
  const row = (k: string) => texts.map((t) => (field(t, k) ? bars[field(t, k) * 2 - 1] : fmt.dim("·"))).join("");
  const logged = texts.filter((t) => t && /mood::/.test(t)).length;
  ctx.out(`${fmt.dim(`last ${days} days · ${logged} logged`)}\n`);
  ctx.out(`${fmt.magenta("mood  ")} ${row("mood")}\n`);
  ctx.out(`${fmt.cyan("energy")} ${row("energy")}\n`);
  ctx.out(`${fmt.yellow("output")} ${row("output")}\n`);
  return 0;
}

export const daily: Command = {
  name: "daily",
  interactive: true,
  examples: [
    ["daily", "the end-of-day questions (1-5 to answer fast)"],
    ["daily trend 30", "mood / energy / output over 30 days"],
  ],
  aliases: ["dlog", "eod"],
  summary: "end-of-day check-in: mood, wins, friction, tomorrow's tasks",
  usage: "daily            answer the questions (1-5 for quick answers)\ndaily trend [n]  mood / energy / output over the last n days (14)",
  man: "Writes a '## daily log' section in today's journal entry, with fields like `mood:: 4` that Obsidian Dataview can read.\nTomorrow's tasks are added to your to-do list (todo, due tomorrow).",
  complete: () => ["trend"],
  async run(ctx) {
    if (ctx.args[0] === "trend") return trend(ctx, Math.max(3, Math.min(60, Number(ctx.args[1]) || 14)));
    if (!ctx.isTTY) {
      ctx.err("daily: needs the terminal (it asks questions)\n");
      return 1;
    }
    return checkIn(ctx);
  },
};

/** `chat`: talk to the AI right in the shell, the conversation keeps going until esc / exit. */
export const chat: Command = {
  name: "chat",
  interactive: true,
  examples: [
    ["chat", "start talking; esc or exit to leave"],
    ["chat \"fais-moi une note avec la liste de courses pour une tarte aux \u00e9pinards\"", "the AI writes notes/\u2026 in your vault"],
  ],
  aliases: ["cc"],
  summary: "talk to the AI in the shell (a conversation, esc to leave)",
  usage: "chat\nchat \"first message\"",
  man: "Like `ask`, but keeps the conversation going: every line you type is sent, with the previous ones as context.\nType exit (or press esc) to come back to the shell. The AI can read your vault, never write to it.",
  async run(ctx) {
    const { deck } = ctx;
    const problem = deck.ai.problem;
    if (problem) {
      ctx.err(`chat: ${problem}\n`);
      return 1;
    }
    const session = deck.ai.session({ system: ASK_SYSTEM_PROMPT });
    ctx.out(fmt.dim(`uplink · ${deck.ai.provider.label} · esc or "exit" to leave\n`));
    let msg = ctx.args.join(" ").trim();
    for (;;) {
      if (!msg) {
        const v = await ctx.read("you", { placeholder: "ask anything about your notes…" });
        if (v === null || /^(exit|quit|bye|:q)$/i.test(v.trim())) break;
        msg = v.trim();
        if (!msg) continue;
      }
      ctx.out(fmt.magenta("◆ "));
      try {
        await session.send(msg, {
          onText: (d) => ctx.out(d),
          onToolCall: (name, input) => ctx.out(fmt.dim(`\n  · ${name.toLowerCase()} ${String((input as Record<string, unknown>).file_path ?? (input as Record<string, unknown>).pattern ?? "")}\n`)),
        }, ctx.signal);
      } catch (e) {
        if (ctx.signal.aborted) break;
        ctx.err(`\n${e instanceof Error ? e.message : String(e)}\n`);
      }
      if (ctx.signal.aborted) break;
      ctx.out("\n\n");
      msg = "";
    }
    ctx.out(fmt.dim("link closed\n"));
  },
};
