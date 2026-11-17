import { fmt } from "../../core/ansi";
import { padEnd } from "../../core/unicode";
import { ASK_SYSTEM_PROMPT } from "../../ai/prompts";
import { appendLog, ensureEntry } from "../../vault/journal";
import { join, slugify } from "../../vault/paths";
import { applyFxPreset } from "../../workspace/fxpanel";
import { parseFlags } from "../parser";
import type { Command } from "../types";

/** Commands specific to ICEBREAKER: notes, journal, AI, themes, plugins, settings. */

function parseDay(arg: string | undefined): Date | null {
  const d = new Date();
  if (!arg || arg === "today") return d;
  if (arg === "yesterday") {
    d.setDate(d.getDate() - 1);
    return d;
  }
  if (arg === "tomorrow") {
    d.setDate(d.getDate() + 1);
    return d;
  }
  if (/^-\d+$/.test(arg)) {
    d.setDate(d.getDate() + Number(arg));
    return d;
  }
  const m = arg.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}

const open: Command = {
  name: "open",
  aliases: ["edit", "vim", "nvim", "nano", "code"],
  summary: "open a note in the editor (created if missing)",
  usage: "open path",
  complete: "path",
  async run(ctx) {
    if (!ctx.args[0]) {
      ctx.err("usage: open path\n");
      return 1;
    }
    let p = ctx.resolve(ctx.args[0]);
    if (!/\.\w+$/.test(p)) p += ".md";
    if (ctx.deck.vault.isDir(p)) {
      ctx.err(`open: ${ctx.args[0]} is a directory\n`);
      return 1;
    }
    await ctx.deck.openFile(p);
  },
};

const journal: Command = {
  name: "journal",
  aliases: ["j"],
  summary: "today's journal (or another day), add log lines, list entries",
  usage: "journal [today|yesterday|-N|YYYY-MM-DD]\njournal add <text>      (or: echo text | journal add)\njournal ls [-n N]",
  man: `Entries live in <vault>/${"journal"}/YYYY-MM-DD.md (folder: config journal.folder).
"journal add" appends a timestamped line to the "## log" section of today's entry,
without opening anything — handy from scripts: \`date | journal add\`.
Custom template: create .icebreaker/templates/journal.md ({{date}} {{title}} {{weekday}} {{time}}).`,
  async run(ctx) {
    const [sub, ...rest] = ctx.args;
    const locale = ctx.deck.settings.data.user.locale;
    if (sub === "add") {
      const text = rest.join(" ") || ctx.stdin.trim();
      if (!text) {
        ctx.err("journal add: nothing to add\n");
        return 1;
      }
      const path = await appendLog(ctx.deck.vault, new Date(), text.replace(/\n+/g, " "), locale);
      ctx.out(`${ctx.isTTY ? fmt.green("✓") : "ok"} logged to ${path}\n`);
      return;
    }
    if (sub === "ls" || sub === "list") {
      const { flags } = parseFlags(rest, ["n"]);
      const dates = [...ctx.deck.vault.journalDates()].sort().reverse().slice(0, Number(flags.n ?? 15));
      for (const d of dates) ctx.out(`${ctx.isTTY ? fmt.magenta(d) : d}  ${new Date(d + "T12:00").toLocaleDateString(locale || undefined, { weekday: "long" })}\n`);
      return;
    }
    const day = parseDay(sub);
    if (!day) {
      ctx.err(`journal: can't understand date "${sub}" (use YYYY-MM-DD, yesterday, -3…)\n`);
      return 1;
    }
    await ctx.deck.openJournal(day);
  },
};

const note: Command = {
  name: "note",
  summary: "create a note from a title and open it",
  usage: "note <title…>   (creates notes/<slug>.md)",
  async run(ctx) {
    const title = ctx.args.join(" ").trim();
    if (!title) {
      ctx.err("usage: note <title>\n");
      return 1;
    }
    const path = join("notes", `${slugify(title)}.md`);
    if (!(await ctx.deck.vault.exists(path))) await ctx.deck.vault.write(path, `# ${title}\n\n${ctx.stdin}`);
    await ctx.deck.openFile(path);
  },
};

const todo: Command = {
  name: "todo",
  aliases: ["tasks"],
  summary: "list open checkboxes (- [ ]) across the vault",
  usage: "todo [-a]   (-a includes done tasks)",
  async run(ctx) {
    const all = ctx.args.includes("-a");
    const files = ctx.deck.vault.markdown().map((e) => e.path);
    const contents = await ctx.deck.vault.readMany(files);
    let n = 0;
    files.forEach((path, i) => {
      (contents[i] ?? "").split("\n").forEach((line, ln) => {
        const m = line.match(/^\s*[-*+] \[( |x|X)\] (.*)$/);
        if (!m || (!all && m[1] !== " ")) return;
        n++;
        const box = m[1] === " " ? "☐" : "☑";
        ctx.out(ctx.isTTY ? `${fmt.green(box)} ${m[2]}  ${fmt.gray(`${path}:${ln + 1}`)}\n` : `${box} ${m[2]}  ${path}:${ln + 1}\n`);
      });
    });
    if (!n) ctx.out("nothing to do. go outside.\n");
  },
};

const ask: Command = {
  name: "ask",
  aliases: ["claude", "ai"],
  summary: "ask the AI from the shell — pipe anything into it",
  usage: 'ask "question"\ncat notes/x.md | ask "summarize"\njournal ls | ask "which days did I skip?" > notes/report.md',
  man: "Streams the answer to the terminal. Piped input is sent along as context.\nUses the provider in `config get ai.provider` (Claude or a local model via Ollama).",
  async run(ctx) {
    const question = ctx.args.join(" ").trim();
    if (!question && !ctx.stdin) {
      ctx.err('usage: ask "question"   (or pipe text into it)\n');
      return 1;
    }
    const problem = ctx.deck.ai.problem;
    if (problem) {
      ctx.err(`ask: ${problem}\n`);
      return 1;
    }
    const prompt = ctx.stdin ? `<stdin>\n${ctx.stdin}\n</stdin>\n\n${question || "Process the input above."}` : question;
    await ctx.deck.ai.ask(prompt, { system: ASK_SYSTEM_PROMPT, onText: (d) => ctx.out(d), signal: ctx.signal });
    ctx.out("\n");
  },
};

const link: Command = {
  name: "link",
  aliases: ["chat"],
  summary: "open the AI chat (LINK)",
  run(ctx) {
    ctx.deck.openApp("link");
  },
};

const sysmon: Command = {
  name: "sysmon",
  aliases: ["top", "htop", "btop"],
  summary: "system monitor",
  run(ctx) {
    ctx.deck.openApp("sysmon");
  },
};

const theme: Command = {
  name: "theme",
  summary: "list, switch, create and reload themes",
  usage: "theme [ls]\ntheme set <name>\ntheme new <name>     (copies the current theme into your vault and opens it)\ntheme reload         (re-read .icebreaker/themes/*.toml)",
  complete: () => ["ls", "set", "new", "reload", ...[]],
  async run(ctx) {
    const [sub, name] = ctx.args;
    const d = ctx.deck;
    if (!sub || sub === "ls" || sub === "list") {
      for (const t of d.themes.list()) {
        const cur = t.name === d.theme.name;
        const swatch = [t.c.accent, t.c.accentAlt, ...t.gradient].slice(0, 4).map((c) => `\x1b[38;2;${(c >> 16) & 255};${(c >> 8) & 255};${c & 255}m██\x1b[0m`).join("");
        ctx.out(`${cur ? fmt.magenta("●") : " "} ${ctx.isTTY ? swatch : ""} ${padEnd(t.name, 14)} ${fmt.dim(`${t.source} · ${t.description}`)}\n`);
      }
      for (const e of d.themes.errors) ctx.err(`✖ ${e.file}: ${e.error}\n`);
      return;
    }
    if (sub === "set" || sub === "use") {
      if (!name || !d.setTheme(name)) {
        ctx.err(`theme: unknown theme "${name ?? ""}" — try \`theme ls\`\n`);
        return 1;
      }
      ctx.out(`theme → ${name}\n`);
      return;
    }
    if (sub === "reload") {
      await d.reloadUserThemes();
      ctx.out(`${d.themes.list().length} themes loaded\n`);
      for (const e of d.themes.errors) ctx.err(`✖ ${e.file}: ${e.error}\n`);
      return;
    }
    if (sub === "new") {
      if (!name) {
        ctx.err("usage: theme new <name>\n");
        return 1;
      }
      const path = `.icebreaker/themes/${slugify(name)}.toml`;
      const base = await fetchBuiltinThemeSource(d.theme.name);
      await d.vault.write(path, base.replace(/name\s*=\s*".*"/, `name = "${slugify(name)}"`).replace(/author\s*=\s*".*"/, `author = "${d.settings.data.user.handle}"`));
      ctx.out(`created ${path} — edit it, save, then: theme reload && theme set ${slugify(name)}\n`);
      await d.openFile(path);
      return;
    }
    ctx.err(`theme: unknown subcommand ${sub}\n`);
    return 1;
  },
};

// The built-in theme sources, to copy from with `theme new`.
const THEME_SOURCES = import.meta.glob("../../../themes/*.toml", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
async function fetchBuiltinThemeSource(name: string): Promise<string> {
  const hit = Object.entries(THEME_SOURCES).find(([p]) => p.endsWith(`/${name}.toml`));
  return hit ? hit[1] : Object.entries(THEME_SOURCES).find(([p]) => p.endsWith("/nightshade.toml"))![1];
}

const fx: Command = {
  name: "fx",
  summary: "toggle visual effects (bloom, scanlines, ambient…)",
  usage: "fx                      show current state\nfx <effect> on|off      bloom scanlines vignette ambient flicker glitch\nfx minimal              default: ambient fog + glitch only\nfx max                  everything on\nfx potato               everything off, 30fps (weak laptops)\nfx panel                open the FX panel (also: ✦ fx in the status bar)",
  run(ctx) {
    const d = ctx.deck;
    const effects = ["bloom", "scanlines", "vignette", "ambient", "flicker", "glitch"] as const;
    const [what, state] = ctx.args;
    if (!what) {
      for (const e of effects) ctx.out(`${padEnd(e, 10)} ${d.settings.data.fx[e] ? fmt.green("on") : fmt.gray("off")}\n`);
      ctx.out(`${padEnd("fps cap", 10)} ${d.settings.data.appearance.maxFps || "unlimited"}\n`);
      return;
    }
    if (what === "potato" || what === "max" || what === "minimal") {
      applyFxPreset(d, what);
      ctx.out(
        { potato: "potato mode: all effects off, 30fps cap\n", max: "all effects on. welcome to the future.\n", minimal: "back to minimal: ambient fog + glitch\n" }[what],
      );
      return;
    }
    if (what === "panel") {
      d.workspace.fxPanel();
      return;
    }
    if (!(effects as readonly string[]).includes(what)) {
      ctx.err(`fx: unknown effect ${what}\n`);
      return 1;
    }
    const value = state === undefined ? !d.settings.data.fx[what as (typeof effects)[number]] : /^(on|true|1)$/.test(state);
    d.settings.set(`fx.${what}`, value);
    d.applyFx();
    ctx.out(`${what} ${value ? "on" : "off"}\n`);
  },
};

const config: Command = {
  name: "config",
  aliases: ["set"],
  summary: "read and change settings",
  usage: "config [list]\nconfig get <key>\nconfig set <key> <value>\nconfig key              set the Anthropic API key (hidden input)\nconfig path",
  man: "Keys look like fx.bloom, ai.model, user.handle — `config list` shows them all.\nSettings are stored in the OS config folder (settings.json); the API key in secrets.json.",
  async run(ctx) {
    const s = ctx.deck.settings;
    const [sub, key, ...rest] = ctx.args;
    if (!sub || sub === "list" || sub === "ls") {
      for (const [k, v] of s.flatten()) ctx.out(`${ctx.isTTY ? fmt.magenta(padEnd(k, 28)) : padEnd(k, 28)} ${JSON.stringify(v)}\n`);
      ctx.out(`${ctx.isTTY ? fmt.magenta(padEnd("secrets.anthropicApiKey", 28)) : "secrets.anthropicApiKey"} ${s.secrets.anthropicApiKey ? '"sk-…' + s.secrets.anthropicApiKey.slice(-4) + '"' : ctx.deck.ai.envKey ? "(from ANTHROPIC_API_KEY)" : "(not set)"}\n`);
      return;
    }
    if (sub === "get") {
      ctx.out(JSON.stringify(s.get(key ?? "")) + "\n");
      return;
    }
    if (sub === "set") {
      if (!key || rest.length === 0) {
        ctx.err("usage: config set <key> <value>\n");
        return 1;
      }
      s.set(key, rest.join(" "));
      ctx.deck.applySettings(key);
      ctx.out(`${key} = ${JSON.stringify(s.get(key))}\n`);
      return;
    }
    if (sub === "key") {
      const k = await ctx.deck.prompt("Anthropic API key", { mask: true, placeholder: "sk-ant-…  (get one at console.anthropic.com)" });
      if (k === null) return 1;
      await s.setSecret("anthropicApiKey", k.trim());
      ctx.deck.ai.refresh();
      ctx.out(k.trim() ? "key saved to secrets.json\n" : "key removed\n");
      return;
    }
    if (sub === "path") {
      ctx.out(ctx.deck.platform.kind === "desktop" ? "settings.json / secrets.json live in the OS app-config folder (org.icebreaker.deck)\n" : "browser mode: settings in localStorage\n");
      return;
    }
    ctx.err(`config: unknown subcommand ${sub}\n`);
    return 1;
  },
};

const vaultCmd: Command = {
  name: "vault",
  summary: "show or switch the vault folder",
  usage: "vault                 show path and stats\nvault mount <abs path>  use another folder (e.g. your Obsidian vault)\nvault rescan",
  async run(ctx) {
    const v = ctx.deck.vault;
    const [sub, ...rest] = ctx.args;
    if (sub === "rescan") {
      await v.rescan();
      ctx.out(`${v.entries.length} entries indexed\n`);
      return;
    }
    if (sub === "mount" || sub === "open") {
      const path = rest.join(" ");
      if (!path) {
        ctx.err("usage: vault mount <absolute path>\n");
        return 1;
      }
      await ctx.deck.mountVault(path);
      ctx.out(`mounted ${v.root}\n`);
      ctx.shell.cd("");
      return;
    }
    ctx.out(`${fmt.bold("path")}     ${v.root}\n${fmt.bold("notes")}    ${v.markdown().length}\n${fmt.bold("files")}    ${v.files().length}\n${fmt.bold("journal")}  ${v.journalDates().size} days\n`);
  },
};

const plugin: Command = {
  name: "plugin",
  aliases: ["plugins"],
  summary: "list, enable, disable, scaffold plugins",
  usage: "plugin [ls]\nplugin enable <id>\nplugin disable <id>\nplugin reload\nplugin new <id>     (scaffold a plugin in .icebreaker/plugins/<id>)",
  man: "Plugins live in <vault>/.icebreaker/plugins/<id>/ with a plugin.json and a main.js.\nVault plugins are disabled until you enable them; you'll see the permissions they ask for first.\nSee docs/PLUGINS.md.",
  async run(ctx) {
    const host = ctx.deck.plugins;
    const [sub, id] = ctx.args;
    if (!sub || sub === "ls" || sub === "list") {
      for (const p of host.list()) {
        const state = p.error ? fmt.red("error") : p.active ? fmt.green("on ") : fmt.gray("off");
        ctx.out(`${state} ${padEnd(p.manifest.id, 16)} ${fmt.dim(`${p.source} · v${p.manifest.version}`)}  ${p.manifest.description ?? ""}\n`);
        if (p.error) ctx.err(`    ${p.error}\n`);
      }
      return;
    }
    if (sub === "enable" || sub === "disable") {
      if (!id) {
        ctx.err(`usage: plugin ${sub} <id>\n`);
        return 1;
      }
      const ok = sub === "enable" ? await host.enable(id) : await host.disable(id);
      ctx.out(ok ? `${id}: ${sub}d\n` : `${id}: unchanged\n`);
      return;
    }
    if (sub === "reload") {
      await host.reload();
      ctx.out(`${host.active().length} plugins active\n`);
      return;
    }
    if (sub === "new") {
      if (!id) {
        ctx.err("usage: plugin new <id>\n");
        return 1;
      }
      const path = await host.scaffold(slugify(id));
      ctx.out(`created ${path}. Edit it, then: plugin enable ${slugify(id)}\n`);
      await ctx.deck.openFile(path);
      return;
    }
    ctx.err(`plugin: unknown subcommand ${sub}\n`);
    return 1;
  },
};

const today: Command = {
  name: "today",
  summary: "print today's journal entry",
  async run(ctx) {
    const path = await ensureEntry(ctx.deck.vault, new Date(), ctx.deck.settings.data.user.locale);
    ctx.out(await ctx.deck.vault.read(path));
  },
};

export const deckCommands: Command[] = [open, journal, note, todo, ask, link, sysmon, theme, fx, config, vaultCmd, plugin, today];
