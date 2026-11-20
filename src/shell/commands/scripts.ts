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
import { pickFile } from "../../workspace/filebrowser";
import { q } from "../../ui/ui";

/** Scripts that aren't ibsh run in your system terminal with their interpreter. */
const RUNNERS: Record<string, string> = { ".sh": "bash", ".bash": "bash", ".zsh": "zsh", ".fish": "fish", ".py": "python3", ".js": "node", ".mjs": "node", ".rb": "ruby", ".pl": "perl", ".ps1": "pwsh -File", ".lua": "lua" };
const SCRIPT_EXTS = [".ibsh", ...Object.keys(RUNNERS)];
const extOf = (p: string) => (/\.[a-z0-9]+$/i.exec(p)?.[0] ?? "").toLowerCase();

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
  /** "morning", "work/backup.py" — the folder under scripts/ included; ibsh scripts without their .ibsh */
  name: string;
  /** the interpreter for non-ibsh scripts ("" = ibsh, run by the deck) */
  runner: string;
  path: string;
  /** the first comment line */
  about: string;
  lines: string[];
}

export async function listScripts(deck: Deck, seed = false): Promise<Script[]> {
  const v = deck.vault;
  const walk = async (dir: string): Promise<string[]> => {
    if (!(await v.exists(dir))) return [];
    const out: string[] = [];
    for (const e of await v.list(dir)) {
      if (e.isDir) out.push(...(await walk(e.path)));
      else if (SCRIPT_EXTS.includes(extOf(e.name))) out.push(e.path);
    }
    return out;
  };
  let paths = await walk(DIR);
  if (!paths.length && seed) {
    await v.mkdir(DIR).catch(() => {});
    for (const [name, body] of Object.entries(EXAMPLES)) await v.write(`${DIR}/${name}.ibsh`, body);
    paths = await walk(DIR);
  }
  const out: Script[] = [];
  for (const path of paths) {
    const ext = extOf(path);
    const rel = path.slice(DIR.length + 1);
    const content = await v.read(path).catch(() => "");
    const lines = content.split("\n");
    const about = (lines.find((l) => /^\s*(#|\/\/)(?!!)/.test(l)) ?? "").replace(/^\s*(#|\/\/)\s*/, "");
    out.push({ name: ext === ".ibsh" ? rel.slice(0, -5) : rel, runner: RUNNERS[ext] ?? "", path, about, lines });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** Import a file from anywhere on the computer into the vault's scripts (optionally a subfolder). */
export async function importScript(deck: Deck, from: string, folder = ""): Promise<string> {
  if (!deck.platform.files) throw new Error("importing needs the desktop app");
  const body = await deck.platform.files.readText(from);
  const name = from.split(/[\\/]/).pop()!;
  const dir = folder ? `${DIR}/${folder.replace(/^\/+|\/+$/g, "")}` : DIR;
  await deck.vault.mkdir(dir).catch(() => {});
  const to = `${dir}/${name}`;
  await deck.vault.write(to, body);
  return to;
}

/** Pick a file with the deck's file browser, choose where it goes, import it. */
export async function importFlow(deck: Deck): Promise<void> {
  const from = await pickFile(deck, "IMPORT A SCRIPT", SCRIPT_EXTS);
  if (!from) return;
  const folders = [...new Set((await listScripts(deck)).map((s) => s.name.split("/").slice(0, -1).join("/")).filter(Boolean))];
  const opts = [{ label: "scripts/", hint: "the top" }, ...folders.map((f) => ({ label: `scripts/${f}/`, hint: "" })), { label: "+ a new folder…", hint: "" }];
  const i = await deck.choose("Put it in…", opts);
  if (i === null) return;
  let folder = i === 0 ? "" : i <= folders.length ? folders[i - 1] : (await deck.prompt("Folder name", { placeholder: "work, backup, fun…" }))?.trim() ?? "";
  if (i === opts.length - 1 && !folder) return;
  folder = folder.replace(/\s+/g, "-");
  void deck.act(`script import ${q(from)}${folder ? ` ${q(folder)}` : ""}`);
}

/** The menu (≡ scripts on the shell panel, or the palette): pick one, it runs. */
export async function scriptsMenu(deck: Deck): Promise<void> {
  const list = await listScripts(deck, true);
  // the whole file name, extension included (backup.py, morning.ibsh)
  const options = [...list.map((s) => ({ label: s.path.slice(DIR.length + 1), hint: s.runner ? `${s.runner} · ${s.about}` : s.about })), { label: "+ new script", hint: "a file in .icebreaker/scripts" }, { label: "✎ edit one…", hint: "open it in the editor" }, { label: "⇣ import a script…", hint: "from anywhere on this computer" }];
  const i = await deck.choose("Scripts", options);
  if (i === null) return;
  if (i === options.length - 1) return void importFlow(deck);
  if (i < list.length) return void deck.act(`script ${list[i].name}`);
  if (i === list.length) {
    const name = await deck.prompt("New script name", { placeholder: "backup-notes" });
    if (name?.trim()) void deck.act(`script new ${name.trim().replace(/\s+/g, "-")}`);
    return;
  }
  const j = await deck.choose("Edit which script?", list.map((s) => ({ label: s.path.slice(DIR.length + 1), hint: s.about })));
  if (j !== null) void deck.act(`script edit ${list[j].name}`);
}

export const scriptCommand: Command = {
  name: "script",
  aliases: ["scripts"],
  summary: "shell lines kept in the vault and run in one go (the ≡ scripts menu)",
  usage: "script                 list them (and the menu: ≡ scripts on the shell panel)\nscript <name>          run it\nscript new <name>      a new one, opened in the editor\nscript edit <name>     change it\nscript rm <name>       move it to the trash\nscript import [\"<path>\"] [folder]   bring a script from anywhere (no path: the file browser)\nscript menu            the menu\n\n.ibsh scripts run in the deck; .sh .py .js .ps1 .zsh .fish .rb… run in your system terminal.",
  man: "A script is a text file in .icebreaker/scripts/<name>.ibsh: one command per line, # for comments.\nA line that fails stops the script, unless it ends with `|| true`.\n{name} in a line is asked for when the script runs (like macros).\nctrl+c stops a running script.",
  examples: [
    ["script morning", "the morning briefing"],
    ["script new backup", "write your own"],
  ],
  async run(ctx) {
    const d = ctx.deck;
    const [sub, name] = ctx.args;
    const list = await listScripts(d, true);
    const base = (s: Script) => s.name.split("/").pop()!.replace(/\.[a-z0-9]+$/i, "");
    const find = (n: string | undefined) => (n ? list.find((s) => s.name === n) ?? list.find((s) => base(s) === n) ?? list.find((s) => s.name.startsWith(n) || base(s).startsWith(n)) : undefined);
    if (!sub || sub === "ls" || sub === "list") {
      for (const s of list) ctx.out(`${fmt.bold(s.name.padEnd(16))} ${fmt.dim(s.about)}\n`);
      if (!list.length) ctx.out(fmt.dim("no scripts — script new <name>\n"));
      return 0;
    }
    if (sub === "menu") return void scriptsMenu(d), 0;
    if (sub === "import") {
      // script import "<path>" [folder]   (no path: the file browser)
      if (!name) return void importFlow(d), 0;
      try {
        const to = await importScript(d, name, ctx.args[2]);
        ctx.out(`${fmt.green("⇣")} ${to}\n`);
        return 0;
      } catch (e) {
        return ctx.err(`script: ${e instanceof Error ? e.message : e}\n`), 1;
      }
    }
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
    if (s.runner) {
      if (!d.workspace.termAvailable) return ctx.err(`script: ${s.name} needs your system terminal (${s.runner}) — term mode system, desktop app\n`), 1;
      const abs = `${d.vault.root}/${s.path}`.replace(/\\/g, "/");
      ctx.out(fmt.dim(`▶ ${s.runner} ${s.name} (in your terminal)\n`));
      void d.workspace.runMacro({ label: s.name, cmd: `${s.runner} ${q(abs)}` });
      return 0;
    }
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
      // like a real shell: `exit` in a script ends the script (never the app)
      const end = /^exit(?:\s+(\d+))?$/.exec(line);
      if (end) return ctx.out(fmt.dim(`■ ${s.name} done\n`)), Number(end[1] ?? 0);
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
