/**
 * SCRIPTS — a few shell lines kept in the vault (.icebreaker/scripts/<name>.ibsh)
 * and run in one go: from the ≡ scripts menu on the shell panel, the palette,
 * or `script <name>`. One command per line; # comments; a line that fails
 * stops the script unless it ends with `|| true`. {name} in a line is asked for.
 *
 * Four examples are written the first time you open the menu: a morning
 * briefing, an end-of-day wrap-up, an inbox sweep, a quick note ({title} asked).
 */
import { fmt } from "../../core/ansi";
import type { Deck } from "../../deck";
import type { Command } from "../types";

const DIR = ".icebreaker/scripts";

const EXAMPLES: Record<string, string> = {
  morning: `# morning briefing: what's due, what rings, your habits, the headlines
echo "good morning — here's your day"
today
todo ls --today
remind ls
habit
news
`,
  "end-of-day": `# end of the day: the check-in, today's numbers, clear what's done
daily
stats
todo clear
echo "logged off. see you tomorrow."
`,
  "inbox-sweep": `# inbox sweep: the loose notes at the root of the vault go to notes/inbox
cd /
mkdir -p notes/inbox
mv *.md notes/inbox/ || true
ls notes/inbox
echo "swept. sort them from NEXUS: explore notes/inbox"
`,
  "quick-note": `# quick note: asks for a title, makes the note and opens it
note {title}
`,
};

export interface Script {
  name: string;
  path: string;
  /** the first comment line */
  about: string;
  lines: string[];
}

export async function listScripts(deck: Deck, seed = false): Promise<Script[]> {
  let files = await deck.vault.toolFiles("scripts", ".ibsh");
  if (!files.length && seed) {
    await deck.vault.mkdir(DIR).catch(() => {});
    for (const [name, body] of Object.entries(EXAMPLES)) await deck.vault.write(`${DIR}/${name}.ibsh`, body);
    files = await deck.vault.toolFiles("scripts", ".ibsh");
  }
  return files
    .map((f) => {
      const name = f.path.split("/").pop()!.replace(/\.ibsh$/, "");
      const lines = f.content.split("\n");
      const about = (lines.find((l) => l.trim().startsWith("#")) ?? "").replace(/^\s*#\s*/, "");
      return { name, path: f.path, about, lines };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** The menu (≡ scripts on the shell panel, or the palette): pick one, it runs. */
export async function scriptsMenu(deck: Deck): Promise<void> {
  const list = await listScripts(deck, true);
  const options = [...list.map((s) => ({ label: s.name, hint: s.about })), { label: "+ new script", hint: "a file in .icebreaker/scripts" }, { label: "✎ edit one…", hint: "open it in the editor" }];
  const i = await deck.choose("Scripts", options);
  if (i === null) return;
  if (i < list.length) return void deck.act(`script ${list[i].name}`);
  if (i === list.length) {
    const name = await deck.prompt("New script name", { placeholder: "backup-notes" });
    if (name?.trim()) void deck.act(`script new ${name.trim().replace(/\s+/g, "-")}`);
    return;
  }
  const j = await deck.choose("Edit which script?", list.map((s) => ({ label: s.name, hint: s.about })));
  if (j !== null) void deck.act(`script edit ${list[j].name}`);
}

export const scriptCommand: Command = {
  name: "script",
  aliases: ["scripts"],
  summary: "shell lines kept in the vault and run in one go (the ≡ scripts menu)",
  usage: "script                 list them (and the menu: ≡ scripts on the shell panel)\nscript <name>          run it\nscript new <name>      a new one, opened in the editor\nscript edit <name>     change it\nscript rm <name>       move it to the trash\nscript menu            the menu",
  man: "A script is a text file in .icebreaker/scripts/<name>.ibsh: one command per line, # for comments.\nA line that fails stops the script, unless it ends with `|| true`.\n{name} in a line is asked for when the script runs (like macros).\nctrl+c stops a running script.",
  examples: [
    ["script morning", "the morning briefing"],
    ["script new backup", "write your own"],
  ],
  async run(ctx) {
    const d = ctx.deck;
    const [sub, name] = ctx.args;
    const list = await listScripts(d, true);
    const find = (n: string | undefined) => list.find((s) => s.name === n) ?? list.find((s) => n && s.name.startsWith(n));
    if (!sub || sub === "ls" || sub === "list") {
      for (const s of list) ctx.out(`${fmt.bold(s.name.padEnd(16))} ${fmt.dim(s.about)}\n`);
      if (!list.length) ctx.out(fmt.dim("no scripts — script new <name>\n"));
      return 0;
    }
    if (sub === "menu") return void scriptsMenu(d), 0;
    if (sub === "new" || sub === "edit") {
      if (!name) return ctx.err(`usage: script ${sub} <name>\n`), 1;
      const path = `${DIR}/${name}.ibsh`;
      if (sub === "new" && !(await d.vault.exists(path))) await d.vault.write(path, `# ${name}: what it does\necho "hello from ${name}"\n`);
      if (sub === "edit" && !find(name)) return ctx.err(`script: no script "${name}"\n`), 1;
      await d.openFile(sub === "edit" ? find(name)!.path : path);
      return 0;
    }
    if (sub === "rm") {
      const s = find(name);
      if (!s) return ctx.err(`script: no script "${name ?? ""}"\n`), 1;
      await d.vault.trash(s.path);
      ctx.out(`${fmt.red("−")} ${s.name} ${fmt.dim("(in .trash)")}\n`);
      return 0;
    }
    const s = find(sub === "run" ? name : sub);
    if (!s) return ctx.err(`script: no script "${sub === "run" ? name ?? "" : sub}" (script ls)\n`), 1;
    ctx.out(fmt.dim(`▶ ${s.name}\n`));
    const asked = new Map<string, string>();
    for (const raw of s.lines) {
      let line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      if (ctx.signal.aborted) return ctx.out(fmt.dim("■ stopped\n")), 130;
      // {placeholders} are asked once per run
      for (const m of [...line.matchAll(/\{([\w -]+)\}/g)]) {
        if (!asked.has(m[1])) {
          const v = await ctx.read(`${m[1]}:`);
          if (v === null) return ctx.out(fmt.dim("■ cancelled\n")), 1;
          asked.set(m[1], v);
        }
        line = line.replace(m[0], asked.get(m[1]) ?? "");
      }
      const tolerant = /\|\|\s*true\s*$/.test(line);
      if (tolerant) line = line.replace(/\|\|\s*true\s*$/, "").trim();
      ctx.out(`${fmt.cyan("›")} ${line}\n`);
      const code = await ctx.shell.run(line);
      if (code && !tolerant) return ctx.err(`script ${s.name}: stopped at "${line}" (exit ${code})\n`), code;
    }
    ctx.out(fmt.dim(`■ ${s.name} done\n`));
    return 0;
  },
};
