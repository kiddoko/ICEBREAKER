import { stealthCommand, voiceCommand } from "./voice";
import { fmt } from "../../core/ansi";
import { padEnd } from "../../core/unicode";
import { ASK_SYSTEM_PROMPT } from "../../ai/prompts";
import { appendLog, ensureEntry } from "../../vault/journal";
import { join, slugify } from "../../vault/paths";
import { applyFxPreset } from "../../workspace/fxpanel";
import { fetchIndex, installPlugin, installTheme } from "../../plugins/install";
import { parseFlags } from "../parser";
import type { Command } from "../types";
import { applyTweaks, tweaksToToml, type Theme } from "../../core/theme";
import { knob, KNOBS, parseKnobValue } from "../../core/tweaks";
import { account, lock, selfDestruct } from "./account";
import { chat, daily } from "./daily";
import { mute, sound } from "./sound";
import { uiCommands } from "./ui";
import { devCommands } from "./dev"; // DEV ONLY
import { newsCommand } from "../../widgets/news";

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
  examples: [
    ["open notes/idees.md", "open (or create) a note"],
  ],
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
  examples: [
    ["journal", "today's entry"],
    "journal yesterday",
    ["journal 2026-11-05", "a given day"],
    ["journal add \"caf\u00e9 avec L\u00e9a\"", "a timestamped line in today's log"],
    ["journal ls -n 7", "the last 7 entries"],
  ],
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
  examples: [
    ["note \"id\u00e9es de cadeaux\"", "creates notes/idees-de-cadeaux.md and opens it"],
    ["echo \"- pain\" | note courses", "a note from piped text"],
  ],
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

/** Checkboxes written in notes. (The to-do list itself is the TODO module: `todo`.) */
const checkboxes: Command = {
  name: "checkboxes",
  aliases: ["tasks"],
  summary: "list open checkboxes (- [ ]) written in your notes",
  usage: "checkboxes [-a]   (-a includes done ones)",
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
  examples: [
    "ask \"explique la diff\u00e9rence entre TCP et UDP\"",
    ["cat notes/rapport.md | ask \"r\u00e9sume en 5 points\"", "pipe a note in"],
    ["ask \"cr\u00e9e une note avec une liste de courses pour une tarte aux \u00e9pinards\"", "the AI writes the note in your vault"],
  ],
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
  examples: [
    ["theme", "list themes"],
    ["theme set phosphor", "green screen"],
    ["theme tweak", "every knob, and what you changed"],
    ["theme tweak accent #ff2e88", "a pink accent on the current theme"],
    ["theme tweak background snow", "snow behind the panels (fog, rain, stars, embers, scan, none)"],
    ["theme tweak density 0.3", "less of it"],
    ["theme tweak sounds crystal", "glassy sounds (retro, soft, industrial)"],
    ["theme tweak font \"IBM Plex Mono\"", ""],
    ["theme tweak reset accent", "back to the theme's own accent (reset alone: everything)"],
    ["theme export my-night", "save theme + tweaks as .icebreaker/themes/my-night.toml"],
    ["theme studio", "all of it with arrows and clicks"],
    ["theme new mytheme", "copy the current theme file to edit by hand"],
  ],
  summary: "list, switch, tweak, export and create themes",
  usage: "theme [ls]\ntheme set <name>\ntheme tweak [<knob> <value> | reset [knob]]   (your changes on top of the theme)\ntheme export <name>  (theme + tweaks → a new theme file)\ntheme studio         (the visual editor)\ntheme new <name>     (copies the current theme into your vault and opens it)\ntheme reload         (re-read .icebreaker/themes/*.toml)\ntheme install <user/repo/file.toml | id>   (download a community theme)",
  man: "Tweaks are kept per theme in settings.json (appearance.tweaks) — the theme file is never changed.\nKnobs: colors (accent accent2 text bg panel border), font font-size, frame mark bullet,\nbackground density speed bg-color bg-color2, sounds pitch, select noise. Raw keys work too: theme tweak ui.cursor #fff.\nThe full format is in themes/nightshade.toml and docs/THEMES.md.",
  complete: () => ["ls", "set", "tweak", "export", "studio", "new", "reload", "install"],
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
    if (sub === "install") {
      if (!name) return ctx.err("usage: theme install <user/repo/file.toml | id>\n"), 1;
      try {
        const path = await installTheme(d, name);
        await d.reloadUserThemes();
        ctx.out(`${fmt.green("✓")} ${path} — try it: ${fmt.magenta(`theme set ${path.split("/").pop()!.replace(/\.toml$/, "")}`)}\n`);
      } catch (e) {
        ctx.err(`theme install: ${e instanceof Error ? e.message : e}\n`);
        return 1;
      }
      return;
    }
    if (sub === "studio") {
      d.openApp("studio");
      return;
    }
    if (sub === "tweak" || sub === "untweak") {
      const all = { ...d.settings.data.appearance.tweaks };
      const mine: Record<string, string | number> = { ...(all[d.themes.current.name] ?? {}) };
      const save = () => {
        all[d.themes.current.name] = mine;
        d.settings.set("appearance.tweaks", all);
        d.applySettings("appearance.tweaks");
      };
      const [, k, ...rest] = ctx.args;
      if (!k) {
        ctx.out(`${fmt.bold(d.theme.name)} ${fmt.dim("— theme tweak <knob> <value>")}\n`);
        let group = "";
        for (const kn of KNOBS) {
          if (kn.group !== group) ctx.out(`${fmt.magenta(kn.group)}\n`);
          group = kn.group;
          const v = mine[kn.key];
          ctx.out(`  ${padEnd(kn.name, 11)} ${v !== undefined ? fmt.yellow(String(v)) : fmt.dim(knobValue(d.theme, kn.key))}${v !== undefined ? fmt.dim("  (tweaked)") : ""}\n`);
        }
        return 0;
      }
      if (k === "reset" || sub === "untweak") {
        const target = sub === "untweak" ? k : rest[0];
        if (!target) for (const key of Object.keys(mine)) delete mine[key];
        else delete mine[knob(target)?.key ?? target];
        save();
        ctx.out(`${target ? `${target} back to ${d.theme.name}'s own` : `${d.theme.name}: all tweaks removed`}\n`);
        return 0;
      }
      const kn = knob(k) ?? (/^[a-z_]+\.[a-z_0-9]+$/.test(k) ? { name: k, key: k, label: k, group: "colors" as const, kind: "text" as const } : undefined);
      if (!kn) return ctx.err(`theme tweak: no knob "${k}" (theme tweak lists them)\n`), 1;
      const raw = rest.join(" ");
      if (!raw) return ctx.err(`usage: theme tweak ${k} <value>\n`), 1;
      const parsed = parseKnobValue(kn, raw);
      if ("error" in parsed) return ctx.err(`theme tweak: ${parsed.error}\n`), 1;
      const before = mine[kn.key];
      mine[kn.key] = parsed.value;
      try {
        applyTweaks(d.themes.get(d.settings.data.appearance.theme) ?? d.themes.default, mine);
      } catch (e) {
        if (before === undefined) delete mine[kn.key];
        else mine[kn.key] = before;
        return ctx.err(`theme tweak: ${e instanceof Error ? e.message : e}\n`), 1;
      }
      save();
      ctx.out(`${d.theme.name} · ${kn.name} → ${parsed.value}\n`);
      return 0;
    }
    if (sub === "export") {
      if (!name) return ctx.err("usage: theme export <new-name>\n"), 1;
      const slug = slugify(name);
      const cur = d.themes.current;
      const baseName = d.settings.data.appearance.theme;
      const tw = d.settings.data.appearance.tweaks[baseName] ?? {};
      const header = `# ${slug} — made in ICEBREAKER from "${baseName}" (+ your tweaks).\n# Edit freely; every key is documented in themes/nightshade.toml.\n\n`;
      const toml = tweaksToToml(slug, tw, baseName).replace(/\[meta\]\n/, `[meta]\nauthor = "${d.settings.data.user.handle}"\ndescription = "${cur.description.replace(/"/g, "'")} (remix)"\n`);
      const path = `.icebreaker/themes/${slug}.toml`;
      await d.vault.mkdir(".icebreaker/themes");
      await d.vault.write(path, header + toml);
      await d.reloadUserThemes();
      if (!d.themes.get(slug)) return ctx.err(`theme export: ${d.themes.errors.find((e) => e.file.endsWith(`${slug}.toml`))?.error ?? "couldn't load it back"}\n`), 1;
      d.setTheme(slug);
      ctx.out(`${fmt.green("✓")} ${path} — now active. Share that file, or tweak it further.\n`);
      return 0;
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
  examples: [
    "fx bloom on",
    ["fx potato", "everything off, for old laptops"],
  ],
  summary: "toggle visual effects (bloom, scanlines, ambient…)",
  usage: "fx                      show current state\nfx <effect> on|off      bloom scanlines vignette ambient flicker glitch\nfx minimal              default: ambient fog + glitch only\nfx max                  everything on\nfx potato               everything off, 30fps (weak laptops)\nfx panel                open the FX panel (also: ✦ fx in the status bar)\nfx <effect> <0-200>     strength: bloom scanlines vignette\nfx chroma <0-100>       red/blue fringes of an old tube (0 = off)\nfx sharpness <0-100>    100 = razor sharp, lower = a CRT's soft focus",
  run(ctx) {
    const d = ctx.deck;
    const effects = ["bloom", "scanlines", "vignette", "ambient", "flicker", "glitch"] as const;
    const [what, state] = ctx.args;
    if (!what) {
      for (const e of effects) ctx.out(`${padEnd(e, 10)} ${d.settings.data.fx[e] ? fmt.green("on") : fmt.gray("off")}\n`);
      ctx.out(`${padEnd("chroma", 10)} ${d.settings.data.fx.levels.chroma ?? 0}%\n${padEnd("sharpness", 10)} ${d.settings.data.fx.levels.sharpness ?? 100}%\n`);
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
    // strengths: fx bloom 150 · fx chroma 30 · fx softness 40
    if (what === "softness") return ctx.err("fx: it's called sharpness now — fx sharpness 60 (100 = sharp)\n"), 1;
    const levels = ["bloom", "scanlines", "vignette", "chroma", "sharpness"];
    if (levels.includes(what) && state !== undefined && /^\d+$/.test(state)) {
      const max = what === "chroma" || what === "sharpness" ? 100 : 200;
      const v = Math.max(0, Math.min(max, Number(state)));
      d.settings.set(`fx.levels.${what}`, v);
      if (!["chroma", "sharpness"].includes(what) && v > 0) d.settings.set(`fx.${what}`, true);
      d.applyFx();
      ctx.out(`${what} ${v}%\n`);
      return;
    }
    if (what === "chroma" || what === "sharpness") {
      ctx.out(`${what} ${d.settings.data.fx.levels[what] ?? (what === "sharpness" ? 100 : 0)}% (fx ${what} <0-100>)\n`);
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
  examples: [
    ["config list", "every setting"],
    "config set appearance.scale 90",
    ["config set ai.allowWrites false", "the AI can't write notes any more"],
  ],
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
  usage: "plugin [ls]\nplugin enable <id>\nplugin disable <id>\nplugin reload\nplugin new <id>     (scaffold a plugin in .icebreaker/plugins/<id>)\nplugin install <user/repo | id>   (download from GitHub / the community index)\nplugin update <id>  (re-download an installed plugin)\nplugin search [words]  (browse the community index)",
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
    if (sub === "install" || sub === "update") {
      let src = id;
      if (sub === "update" && id) {
        const path = `.icebreaker/plugins/${id}/plugin.json`;
        src = (await ctx.deck.vault.exists(path)) ? JSON.parse(await ctx.deck.vault.read(path)).source : undefined;
        if (!src) return ctx.err(`${id}: not installed from a repo (no "source" in its plugin.json)\n`), 1;
      }
      if (!src) return ctx.err(`usage: plugin ${sub} <user/repo | id>\n`), 1;
      ctx.out(fmt.dim(`fetching ${src}…\n`));
      try {
        const p = await installPlugin(ctx.deck, src);
        await host.reload();
        ctx.out(`${fmt.green("✓")} ${p.name} (${p.id}) ${sub === "update" ? "updated" : "installed"} — permissions: ${p.permissions.join(", ") || "none"}\n`);
        if (sub === "install") ctx.out(`read its code in .icebreaker/plugins/${p.id}/, then: ${fmt.magenta(`plugin enable ${p.id}`)}\n`);
      } catch (e) {
        ctx.err(`plugin ${sub}: ${e instanceof Error ? e.message : e}\n`);
        return 1;
      }
      return;
    }
    if (sub === "search") {
      const q = ctx.args.slice(1).join(" ").toLowerCase();
      try {
        const hits = (await fetchIndex(ctx.deck)).filter((e) => !q || `${e.id} ${e.name} ${e.description}`.toLowerCase().includes(q));
        if (!hits.length) ctx.out("nothing found\n");
        for (const e of hits) ctx.out(`${fmt.magenta(padEnd(e.id, 18))} ${padEnd(e.kind, 7)} ${e.description} ${fmt.dim(`— ${e.author}`)}\n`);
      } catch (e) {
        ctx.err(`plugin search: ${e instanceof Error ? e.message : e}\n`);
        return 1;
      }
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

export const deckCommands: Command[] = [...devCommands, ...uiCommands, voiceCommand, stealthCommand, newsCommand, daily, chat, account, selfDestruct, lock, sound, mute, open, journal, note, checkboxes, ask, link, sysmon, theme, fx, config, vaultCmd, plugin, today];

/** A theme's current value for "section.key", for display. */
export function knobValue(t: Theme, key: string): string {
  const [sec, k] = key.split(".");
  const hexOf = (n: number | null | undefined) => (n === null || n === undefined || n < 0 ? "auto" : `#${n.toString(16).padStart(6, "0")}`);
  const camel = k.replace(/_(\w)/g, (_, c: string) => c.toUpperCase());
  if (sec === "ui") return hexOf((t.c as unknown as Record<string, number>)[camel]);
  if (sec === "meta" && k === "border") return t.border;
  if (sec === "font") return String((t.font as unknown as Record<string, unknown>)[k] ?? "");
  if (sec === "glyphs") return String((t.glyphs as unknown as Record<string, unknown>)[k] ?? "");
  if (sec === "background") {
    const v = (t.background as unknown as Record<string, unknown>)[k];
    return k.startsWith("color") ? hexOf(v as number | null) : String(v ?? "");
  }
  if (sec === "sound") return String((t.sound as unknown as Record<string, unknown>)[k] ?? "");
  if (sec === "anim") return String((t.anim as unknown as Record<string, unknown>)[k] ?? "");
  return "";
}
