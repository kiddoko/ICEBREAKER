import { t, dateLocale } from "../../core/i18n";
import { checkVaultFolder, icebreakerInside } from "../../apps/setuppath";
import { describePerm, sayPerms } from "../../plugins/permissions";
import { readOpens } from "../../plugins/fileassoc";
import { contextCommand } from "../../ai/context";
import { BOX_OFF, BOX_ON } from "../../ui/controls";
import { redoCommand, tourCommand, changelogCommand, undoCommand } from "./undo";
import { auditReport } from "../../plugins/audit";
import { DEFAULT_SETTINGS } from "../../core/settings";
import { sayCommand, stealthCommand, voiceCommand } from "./voice";
import { encodersCommand } from "./encoders";
import { fmt } from "../../core/ansi";
import { realDeck } from "../origin";
import { formatUptime } from "./system";
import { askInShell, asker } from "../ask";
import { padEnd } from "../../core/unicode";
import { ASK_SYSTEM_PROMPT } from "../../ai/prompts";
import { appendLog, journalArgs } from "../../vault/journal";
import { join, slugify } from "../../vault/paths";
import { applyFxPreset, FX_PRESET_ALIASES, FX_PRESET_NAMES, FX_PRESETS } from "../../workspace/fxpanel";
import { installPlugin, installTheme, isOfficialSource, unverifiedWarning } from "../../plugins/install";
import { storeCommand } from "../../apps/store";
import { pickFolder } from "../../workspace/filebrowser";
import type { Command, ShellContext } from "../types";
import { applyTweaks, tweaksToToml, type Theme } from "../../core/theme";
import { checkTheme } from "../../core/skin/check";
import { component } from "../../core/skin/components";
import type { Field } from "../../core/skin/fields";
import { resolve } from "../../core/skin/registry";
import { upgradeSource } from "../../core/skin/schema";
import { knob, knobNames, knobSuggestions, KNOBS, parseKnobValue, SKIN_KNOBS } from "../../core/tweaks";
import { account, lock, login } from "./account";
import { chat, daily } from "./daily";
import { audioCommand, errorsCommand, mute, sound } from "./sound";
import { debugCommand, logCommand } from "./log";
import { FX_LEVELS, fxMax, getFx, setFx, type FxLevel } from "../../core/fxlevels";
import { pageNamed, uiCommands } from "./ui";
import { newsCommand } from "../../widgets/news";

/** Commands specific to ICEBREAKER: notes, journal, AI, themes, plugins, settings. */

const open: Command = {
  name: "open",
  examples: [
    ["open notes/idees.md", "open (or create) a note"],
    ["open todo", "a page's name opens the page (a module's too)"],
  ],
  aliases: ["edit", "vim", "nvim", "nano", "code"],
  summary: "open a page by its name, or a note (created if missing)",
  usage: "open <page name or note path>",
  complete: "path",
  async run(ctx) {
    if (!ctx.args[0]) {
      ctx.err("usage: open <page name or note path>\n");
      return 1;
    }
    // a name with spaces typed without quotes (open START HERE/README): the whole of it is the path
    const typed = ctx.args.join(" ");
    let p = ctx.resolve(typed);
    if (!/\.\w+$/.test(p)) p += ".md";
    // a note you have comes first (open todo → todo.md); then a page of that name (open breakermed);
    // a new note only when neither exists — a path (a "/" or an extension) is always a note
    const page = /[/\\]|\.\w+$/.test(typed) || ctx.deck.vault.find(p) ? undefined : pageNamed(ctx.deck, typed);
    if (page) return void ctx.deck.openApp(page);
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
    ["journal", "today's page, opened"],
    ["journal \"café avec Léa\"", "a timestamped line in today's page, without opening it"],
    "journal yesterday",
    ["journal 2026-11-05", "a given day"],
    ["date | journal", "piped text: a line too (handy from scripts)"],
    ["journal ls -n 7", "the last 7 entries"],
  ],
  aliases: ["j", "today"],
  summary: "today's journal: opens it, or adds a line to it (journal \"text\")",
  usage: "journal                   today's page (ctrl+J from anywhere)\njournal <text…>           adds a timestamped line to today's page, without opening it\njournal yesterday | -N | YYYY-MM-DD    opens that day\njournal ls [-n N]         the last entries\n(also: journal add <text>, echo text | journal; `today` is the same command)",
  man: `Entries live in <vault>/${"journal"}/YYYY-MM-DD.md (folder: config journal.folder).
"journal <text>" appends a timestamped line to the "## log" section of today's entry ("## fil du jour" in French),
without opening anything — handy from scripts: \`date | journal\`.
One word that names a day (today, yesterday, hier, -3, 2026-11-05, 24/12) opens that day;
to log such a word, write \`journal add yesterday\`.
Custom template: create .icebreaker/templates/journal.md ({{date}} {{title}} {{weekday}} {{time}}).`,
  async run(ctx) {
    const locale = ctx.deck.settings.data.user.locale;
    const what = journalArgs(ctx.args, ctx.stdin);
    if (what.kind === "error") return ctx.err(`journal: ${what.error}\n`), 1;
    if (what.kind === "open") return void (await ctx.deck.openJournal(what.day));
    if (what.kind === "ls") {
      const dates = [...ctx.deck.vault.journalDates()].sort().reverse().slice(0, what.n);
      for (const d of dates) ctx.out(`${ctx.isTTY ? fmt.magenta(d) : d}  ${new Date(d + "T12:00").toLocaleDateString(locale || dateLocale(), { weekday: "long" })}\n`);
      return;
    }
    const path = await appendLog(ctx.deck.vault, new Date(), what.text, locale);
    ctx.out(`${ctx.isTTY ? fmt.green("✓") : "ok"} logged to ${path}\n`);
  },
};

/**
 * The title `note` was given. `note new "ideas"` is read as `note "ideas"` (people type the
 * sub-command they expect; it made notes/new-ideas.md). `note new` alone → null: an untitled note.
 */
export function noteTitle(args: string[]): string | null {
  if (args[0] === "new") return args.length === 1 ? null : args.slice(1).join(" ").trim();
  return args.join(" ").trim();
}

const note: Command = {
  name: "note",
  examples: [
    ["note \"id\u00e9es de cadeaux\"", "creates notes/idees-de-cadeaux.md and opens it"],
    ["echo \"- pain\" | note courses", "a note from piped text"],
  ],
  summary: "create a note from a title and open it",
  usage: "note <title…>   (creates notes/<slug>.md; note new [title] works too)",
  async run(ctx) {
    const title = noteTitle(ctx.args);
    // `note new` alone: an untitled note, like ⌘N
    if (title === null) return void (await ctx.deck.newNote());
    if (!title) {
      ctx.err("usage: note <title>\n");
      return 1;
    }
    const path = join("notes", `${slugify(title)}.md`);
    const isNew = !(await ctx.deck.vault.exists(path));
    if (isNew) {
      await ctx.deck.vault.write(path, `# ${title}\n\n${ctx.stdin}`);
      ctx.deck.vault.recordCreated(path);
    }
    // never silent: what it made (or found), even when the page opens behind something
    ctx.out(`${isNew ? `${ctx.isTTY ? fmt.green("+") : "+"} created` : "opened"} ${path}\n`);
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
        const box = m[1] === " " ? BOX_OFF : BOX_ON;
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
  summary: "open the AI chat (LINK)",
  run(ctx) {
    ctx.deck.openApp("link");
  },
};

const sysmon: Command = {
  name: "sysmon",
  aliases: ["top", "htop", "btop"],
  summary: "the computer's vitals (sysmon open: the SYSMON page)",
  usage: "sysmon        cpu, memory, uptime, the busiest programs, the disks\nsysmon open   the SYSMON page (live graphs)",
  // like `moon` and `stats`: the command prints, `open` opens the page
  async run(ctx) {
    if (ctx.args[0] === "open") return void ctx.deck.openApp("sysmon");
    const s = await ctx.deck.platform.system.stats();
    const gb = (n: number) => `${(n / 1024 ** 3).toFixed(1)} G`;
    ctx.out(`${fmt.bold(s.host)} · ${s.os} · up ${formatUptime(s.uptime)}\n`);
    ctx.out(`cpu ${Math.round(s.cpu)}% (${s.cores.length} cores) · memory ${gb(s.memUsed)} / ${gb(s.memTotal)}${s.swapTotal ? ` · swap ${gb(s.swapUsed)}` : ""} · ${s.processes} processes\n`);
    // a line with an origin (a module, your real terminal) gets the vitals only, as through
    // sysmon.stats — not the programs or the disks (docs/SECURITY_AUDIT.md #61)
    if (realDeck(ctx.deck) !== ctx.deck) return 0;
    for (const p of (s.top ?? []).slice(0, 5)) ctx.out(`  ${p.name.padEnd(24).slice(0, 24)} ${`${Math.round(p.cpu)}%`.padStart(5)} ${gb(p.mem).padStart(8)}\n`);
    for (const d of s.disks ?? []) ctx.out(fmt.dim(`  ${d.mount} ${gb(d.total - d.available)} / ${gb(d.total)}\n`));
    return 0;
  },
};

const theme: Command = {
  name: "theme",
  examples: [
    ["theme", "list themes"],
    ["theme set phosphor", "green screen"],
    ["theme tweak", "every knob, and what you changed"],
    ["theme set accent #ff2e88", "a pink accent on the current theme (theme tweak … works too)"],
    ["theme set keys.radius 0", "square keys (every keys.* and pad.* field: theme set keys.<tab>)"],
    ["theme set checkbox.style ballot", "☑ checkboxes (frame, tabs, button, checkbox, choice, slider, list, caret, tree, icons, statusbar, tip: theme set <component>.<tab>)"],
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
  usage: "theme [ls]\ntheme set <name>\ntheme set <knob> <value>   (your changes on top of the theme; = theme tweak)\ntheme tweak [<knob> <value> | reset [knob]]\ntheme check [name]   (what the deck made of a theme file: schema, what it restyles, problems, the floor)\ntheme upgrade <name> [--write]   (your theme file as schema 2: a preview, then --write)\ntheme export <name>  (theme + tweaks → a new theme file)\ntheme studio         (the visual editor)\ntheme new <name>     (copies the current theme into your vault and opens it)\ntheme reload         (re-read .icebreaker/themes/*.toml)\ntheme install <user/repo/file.toml | id>   (download a community theme)",
  man: "Tweaks are kept per theme in settings.json (appearance.tweaks) — the theme file is never changed.\nKnobs: colors (accent accent2 text bg panel border), font font-size, frame mark bullet,\nbackground density speed bg-color bg-color2, sounds pitch, select noise; and every component field: keys.radius keys.lip keys.face… pad.size pad.weight…\n(theme tweak lists them all). Raw keys work too: theme tweak ui.cursor #fff.\nThe full format is in themes/nightshade.toml and docs/THEMES.md.",
  // theme set <tab> → knobs and component fields (keys.radius…), theme set keys.lip <tab> → values
  complete: (args: string[]) =>
    !args.length ? ["ls", "set", "tweak", "check", "upgrade", "export", "studio", "new", "reload", "install"]
    : args[0] !== "set" && args[0] !== "tweak" ? []
    : args.length === 1 ? knobNames()
    : args.length === 2 ? knobSuggestions(args[1])
    : [],
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
      // what a theme file set wrong in its components: that field kept the deck's own (core/skin)
      for (const t of d.themes.list()) for (const p of t.skinProblems ?? []) ctx.err(`⚠ ${t.name}: ${p.key} — ${p.reason}\n`);
      return;
    }
    // theme set <name> switches; theme set <knob> <value> is a tweak (theme tweak, its alias forever)
    if ((sub === "set" || sub === "use") && ctx.args.length < 3) {
      if (!name || !d.setTheme(name)) {
        ctx.err(`theme: unknown theme "${name ?? ""}" — try \`theme ls\`\n`);
        return 1;
      }
      ctx.out(`theme → ${name}\n`);
      return;
    }
    // theme check <name>: what the loader made of a theme, without switching to it (core/skin)
    if (sub === "check") {
      const t = name ? d.themes.get(name) : d.themes.current;
      const broken = name ? d.themes.errors.find((e) => e.file.replace(/\\/g, "/").split("/").pop() === `${name}.toml`) : undefined;
      if (broken) return ctx.err(`✖ ${broken.file}: ${broken.error}\n`), 1;
      if (!t) return ctx.err(`theme check: unknown theme "${name}" — try \`theme ls\`\n`), 1;
      const out = checkTheme(t);
      for (const line of out.lines) ctx.out(`${line}\n`);
      return out.ok ? 0 : 1;
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
    if (sub === "tweak" || sub === "untweak" || sub === "set") {
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
        for (const kn of [...KNOBS, ...SKIN_KNOBS]) {
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
        const t = applyTweaks(d.themes.get(d.settings.data.appearance.theme) ?? d.themes.default, mine);
        // a component field the skin refused (a palette name it doesn't know, the floor…)
        const refused = t.skinProblems?.find((p) => p.key === kn.key || p.key.startsWith(`${kn.key}/`));
        if (refused) throw new Error(`${refused.key}: ${refused.reason}`);
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
      // what a theme file set wrong in its components: that field kept the deck's own (core/skin)
      for (const t of d.themes.list()) for (const p of t.skinProblems ?? []) ctx.err(`⚠ ${t.name}: ${p.key} — ${p.reason}\n`);
      return;
    }
    // theme upgrade <name> [--write]: one of your theme files as schema 2 (core/skin/schema.ts)
    if (sub === "upgrade") {
      if (!name) return ctx.err("usage: theme upgrade <name> [--write]\n"), 1;
      const path = `.icebreaker/themes/${slugify(name)}.toml`;
      if (!(await d.vault.exists(path))) return ctx.err(`theme upgrade: no ${path} — only your own theme files (built-in ones are read as schema 2 already)\n`), 1;
      const src = await d.vault.read(path);
      let v2: string | null;
      try {
        v2 = upgradeSource(src);
      } catch (e) {
        return ctx.err(`theme upgrade: ${e instanceof Error ? e.message : e}\n`), 1;
      }
      if (v2 === null) return void ctx.out(`${path} is already schema 2\n`);
      if (!ctx.args.includes("--write")) {
        ctx.out(`${v2}\n${fmt.dim(`— a preview: ${path} is unchanged. Comments are not kept. To write it (the old file stays as ${path}.v1):`)}\n${fmt.magenta(`theme upgrade ${name} --write`)}\n`);
        return 0;
      }
      await d.vault.write(`${path}.v1`, src);
      await d.vault.write(path, v2);
      await d.reloadUserThemes();
      ctx.out(`${fmt.green("✓")} ${path} → schema 2 (the old one: ${path}.v1)\n`);
      return 0;
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
    // `theme nightshade`: a theme's name alone is `theme set nightshade`
    if (!name && d.themes.list().some((t) => t.name === sub) && d.setTheme(sub)) return void ctx.out(`theme → ${sub}\n`);
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
    ["fx none", "everything off, for old laptops"],
    ["fx party", "everything at the max"],
  ],
  summary: "toggle visual effects (bloom, scanlines, ambient…)",
  usage: "fx                      show current state\nfx <effect> on|off      bloom scanlines vignette ambient flicker glitch\nfx none (off) | light | medium | heavy | party   how much CRT, from nothing to everything (light: the default)\nfx panel                open the FX panel (also: ✦ fx in the status bar)\nfx <effect> <0-200>     strength, 0 = off: bloom scanlines vignette chroma (RGB split) glow\nfx sharpness <0-100>    100 = razor sharp, lower = a CRT's soft focus\nfx curve <0-100>        the curved glass of a CRT (0 = flat, the default)\nfx flicker <10-300>     CRT flicker on, at this speed (100 = the default pace)\nfx fps                  measure the frames a second the screen really gives",
  man: "bloom: a blurred copy of the screen laid over it — bright things bleed a soft halo of light onto what's around them; the number sets how far and how strong.\nchroma (RGB split): red and blue fringes on the text, the frames and the glyphs (never on the backgrounds).\ncurve: the picture bulges like the curved glass of a tube — lines bend towards the edges, rounded corners, a darker rim, a soft reflection (the mouse follows the bend).\nflicker: a faint, irregular brightness flicker and a slow rolling band; fx flicker 200 makes it twice as fast.",
  async run(ctx) {
    const d = ctx.deck;
    const effects = ["bloom", "scanlines", "vignette", "ambient", "flicker", "glitch"] as const;
    const [said, state] = ctx.args;
    // `fx off` = `fx none` (people type off, the preset is called none)
    const what = said === "off" && state === undefined ? "none" : said;
    if (!what) {
      for (const e of effects) ctx.out(`${padEnd(e, 10)} ${d.settings.data.fx[e] ? fmt.green("on") : fmt.gray("off")}\n`);
      ctx.out(`${padEnd("chroma", 10)} ${d.settings.data.fx.levels.chroma ?? 0}%\n${padEnd("sharpness", 10)} ${d.settings.data.fx.levels.sharpness ?? 100}%\n${padEnd("curve", 10)} ${d.settings.data.fx.levels.curve ?? 0}%\n${padEnd("flicker ⏵", 10)} ${d.settings.data.fx.flickerSpeed ?? 100}% speed\n`);
      const ap = d.settings.data.appearance;
      ctx.out(`${padEnd("fps", 10)} ${ap.vsync ? "vsync (the screen's rate)" : ap.maxFps || "frozen"}\n`);
      return;
    }
    if (what === "fps") {
      // count the frames the web view really gives for one second (the screen's
      // rate with ProMotion unlocked: 120 on a MacBook Pro, else 60)
      const n = await new Promise<number>((done) => {
        let frames = 0;
        const start = performance.now();
        const tick = (now: number) => (now - start < 1000 ? (frames++, requestAnimationFrame(tick)) : done(frames));
        requestAnimationFrame(tick);
      });
      ctx.out(`the screen gives ${fmt.green(String(n))} frames a second${n < 70 ? " (60 Hz: no ProMotion here, or Low Power mode)" : ""}\n`);
      return;
    }
    if ((FX_PRESET_NAMES as readonly string[]).includes(what) || what in FX_PRESET_ALIASES) {
      applyFxPreset(d, what);
      const p = FX_PRESET_ALIASES[what] ?? what;
      ctx.out(`effects: ${p} — ${FX_PRESETS[p as keyof typeof FX_PRESETS].hint}\n`);
      return;
    }
    if (what === "panel") {
      d.workspace.fxPanel();
      return;
    }
    // strengths: fx bloom 150 · fx chroma 30 · fx softness 40
    if (what === "softness") return ctx.err("fx: it's called sharpness now — fx sharpness 60 (100 = sharp)\n"), 1;
    // one number per effect: 0 = off, up to 200 % (sharpness 0-100)
    if ((FX_LEVELS as readonly string[]).includes(what) && state !== undefined && /^\d+$/.test(state)) {
      const v = setFx(d, what as FxLevel, Number(state));
      ctx.out(`${what} ${v ? `${v}%` : "off"}\n`);
      return;
    }
    // fx flicker 150: the flicker on, at that speed
    if (what === "flicker" && state !== undefined && /^\d+$/.test(state)) {
      const v = Math.max(10, Math.min(300, Number(state)));
      d.settings.set("fx.flicker", true);
      d.settings.set("fx.flickerSpeed", v);
      d.applyFx();
      ctx.out(`flicker on · ${v}% speed\n`);
      return;
    }
    if (what === "chroma" || what === "sharpness" || what === "curve") {
      ctx.out(`${what} ${getFx(d, what)}% (fx ${what} <0-${fxMax(what)}>)\n`);
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
  usage: "config [list]\nconfig get <key>\nconfig set <key> <value>\nconfig reset <key>      back to its default (Settings: ↺ next to it)\nconfig key              set the Anthropic API key (hidden input)\nconfig path",
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
    if (sub === "reset") {
      const def = (key ?? "").split(".").reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], DEFAULT_SETTINGS);
      if (!key || def === undefined) return ctx.err(`config: no default for "${key ?? ""}" (config list)\n`), 1;
      s.set(key, structuredClone(def));
      ctx.deck.applySettings(key);
      ctx.out(`${key} = ${JSON.stringify(def)}\n`);
      return 0;
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

/** "2026-11-20-1432": the local date and time, for the backup's name. */
function localStamp(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

function sizeText(bytes: number): string {
  return bytes < 1024 ? `${bytes} B` : bytes < 1 << 20 ? `${(bytes / 1024).toFixed(0)} KB` : `${(bytes / (1 << 20)).toFixed(1)} MB`;
}

/**
 * The recovery key, shown once: 24 numbered words to write on paper. One of them
 * is asked back (a wrong or empty answer shows the words again): that's the proof
 * they're written down somewhere. Then the screen is cleared: the words stay
 * nowhere, not even in the scrollback. Esc or ctrl+C stops (false): the key is then
 * never written (vault.rs keeps it aside until `confirmRecovery`).
 */
export async function showRecovery(ctx: ShellContext, words: string, stopped = recoveryNotKept(true)): Promise<boolean> {
  const list = words.trim().split(/\s+/);
  const show = () => {
    // compact (5 lines), so it fits a small shell panel: 3 rows of 8, read left to right
    ctx.out(`${fmt.bold(fmt.yellow("RECOVERY KEY"))} · write these 24 words on paper, in order · ${fmt.bold("shown only now")}\n`);
    for (let r = 0; r < 3; r++) ctx.out(` ${list.slice(r * 8, r * 8 + 8).map((w, i) => `${fmt.dim(String(r * 8 + i + 1).padStart(2))} ${padEnd(w, 10)}`).join("")}\n`);
    ctx.out(fmt.dim("they open your vault if you forget your account's password (login page: forgot password?) · ICEBREAKER keeps no copy · whoever has them can open it\n"));
  };
  show();
  // esc / ctrl+C ends the command at once, and a stopped command prints nothing more: what
  // must still be said (nothing was written) is handed to the shell first, the words cleared
  ctx.onStop?.(stopped, { clear: true });
  const i = Math.floor(Math.random() * 24);
  for (;;) {
    const typed = await ctx.read(`written down? type word ${i + 1}`, { placeholder: "from your paper" });
    // esc / ctrl+C: stopped. (Asking again would get null again at once, for ever: the
    // command is interrupted — that loop froze the deck, Windows bench 24/11.)
    if (typed === null) {
      // (the shell already cleared the screen and said `stopped`; without one, it's said here)
      if (!ctx.onStop) {
        ctx.shell.clear();
        ctx.err(`${stopped}\n`);
      }
      return false;
    }
    const w = typed.trim().toLowerCase();
    if (w && (w.length >= 4 ? list[i].startsWith(w) : w === list[i])) break;
    ctx.shell.clear();
    ctx.err(!w ? "write the words down first — they're the only way back if you forget your account's password\n" : `that's not word ${i + 1} — look at your paper again\n`);
    show();
  }
  ctx.onStop?.(null);
  ctx.shell.clear();
  ctx.out(`${fmt.green("✓")} recovery key written down · the screen is cleared, the words are nowhere else\n`);
  return true;
}

/**
 * What the shell says when the words weren't typed back: nothing was written. `had`:
 * the vault had a recovery key before (vault recovery: still that one).
 */
export function recoveryNotKept(had: boolean): string {
  return had
    ? "stopped · no new recovery key: your old one still works (vault recovery to try again)"
    : "stopped · this vault has no recovery key yet: if you forget your account's password, it's lost — vault recovery makes one";
}

/**
 * What `vault encrypt` says at the end about the plain backup it made first: it's still on
 * the disk, and copies of it may be elsewhere (docs/ENCRYPTION.md, "The plain backup").
 */
export function plainBackupWarning(
  path: string,
  tr: (s: string, v?: Record<string, string>) => string = (x, v) => x.replace("{p}", v?.p ?? ""),
  os: "mac" | "windows" | "linux" = hostOs(),
): string[] {
  const copies = {
    mac: "copies may also be in Time Machine, iCloud Drive / Dropbox (if that folder syncs) and the Trash: delete them there too",
    windows: "copies may also be in File History, OneDrive / Dropbox (if that folder syncs) and the Recycle Bin: delete them there too",
    linux: "copies may also be in your backups (Déjà Dup, Timeshift…), a synced folder and the Trash: delete them there too",
  }[os];
  const disk = {
    mac: "deleting it here overwrites it, then removes it; an SSD can keep old bytes: the disk's own encryption (FileVault) covers that",
    windows: "deleting it here overwrites it, then removes it; an SSD can keep old bytes: the disk's own encryption (BitLocker, device encryption) covers that",
    linux: "deleting it here overwrites it, then removes it; an SSD can keep old bytes: the disk's own encryption (LUKS) covers that",
  }[os];
  return [tr("⚠ the plain backup is still on the disk: {p}", { p: path }), tr("it's your notes unencrypted: anyone who gets this file reads them"), tr(copies), tr(disk)];
}

/** What this computer runs (the names of its backup and disk-encryption tools). */
function hostOs(): "mac" | "windows" | "linux" {
  const ua = typeof navigator === "undefined" ? "" : navigator.userAgent;
  return /Windows/i.test(ua) ? "windows" : /Mac/i.test(ua) ? "mac" : "linux";
}

/** The copies `vault wipe-backup` can't reach, named for this computer. */
export function backupCopiesNote(os: "mac" | "windows" | "linux" = hostOs()): string {
  return {
    mac: "copies in Time Machine, a synced folder or the Trash aren't touched: delete them there",
    windows: "copies in File History, a synced folder or the Recycle Bin aren't touched: delete them there",
    linux: "copies in your backups, a synced folder or the Trash aren't touched: delete them there",
  }[os];
}

/** "wait 4 s… (wrong passwords before)": the account's wait, rounded up. */
export function waitNote(ms: number): string {
  return `wait ${Math.ceil(ms / 1000)} s… (wrong passwords before)`;
}

/** What `vault export` left out of the plain copy, by name (what really was, not a fixed list). */
export function keptOutNote(names: string[]): string {
  return `left out of the copy, private to the deck: ${names.map((n) => `.icebreaker/${n}`).join(", ")}`;
}

/** `vault wipe-backup`: each path asked, then overwritten and removed (vault.rs vault_wipe_backup). */
async function wipeBackups(ctx: ShellContext, paths: string[], ask: (title: string, detail: string) => Promise<boolean>): Promise<number> {
  const crypt = ctx.deck.platform.vault.crypt;
  if (!crypt?.wipeBackup) return ctx.err("vault wipe-backup: needs the desktop app\n"), 1;
  let failed = 0;
  for (const p of paths) {
    if (!(await ask(t("Delete the plain backup?"), `${p}\n\n${t("Overwritten, then removed: it can't be undone. Your encrypted vault isn't touched.")}`))) continue;
    try {
      await crypt.wipeBackup(p);
      ctx.out(`${fmt.green("✓")} ${t("plain backup wiped: {p}", { p })}\n`);
    } catch (e) {
      failed++;
      ctx.err(`vault wipe-backup: ${e instanceof Error ? e.message : String(e)}\n`);
    }
  }
  if (paths.length) ctx.out(fmt.dim(`${t(backupCopiesNote())}\n`));
  return failed ? 1 : 0;
}

/** vault encrypt / decrypt / export / unlock / recovery / status (docs/ENCRYPTION.md). */
async function vaultCrypt(ctx: ShellContext, sub: string, rest: string[], window = false): Promise<number> {
  const { deck } = ctx;
  const crypt = deck.platform.vault.crypt;
  // --window (Settings, the setup): the password in a dialog, the recovery key in its window (copy all)
  // the words typed back → the key is written (vault.rs: kept aside until then); stopped →
  // forgotten, the vault's recovery key is what it was. Returns: kept.
  // `stopped`: what the shell says if esc / ctrl+C stops it at the word (the command's own
  // lines after that never show: it's said with them)
  const words = async (w: string, stopped: string): Promise<boolean> => {
    const kept = window ? (await deck.workspace.recoveryWords(w), true) : await showRecovery(ctx, w, stopped);
    if (!kept) {
      await crypt?.dropRecovery?.().catch(() => {});
      return false;
    }
    await crypt!.confirmRecovery!();
    if (window) ctx.out(`${fmt.green("✓")} recovery key kept · the words are nowhere else\n`);
    return true;
  };
  if (!crypt) return ctx.err("vault: encryption needs the desktop app\n"), 1;
  const st = await crypt.status();
  if (sub === "status") {
    ctx.out(
      st.encrypted
        ? `${fmt.green("encrypted")} · ${st.unlocked ? "unlocked" : fmt.yellow("locked")} · ${st.recovery ? "recovery key: yes" : fmt.yellow("no recovery key (vault recovery)")}${st.busy ? " · busy" : ""}\n`
        : `${fmt.yellow("plain")} · not encrypted ${fmt.dim("(vault encrypt)")}\n`,
    );
    for (const n of st.notes) ctx.out(fmt.dim(`  ${n}\n`));
    if (st.leftovers) ctx.out(fmt.yellow(`  ${st.leftovers} plain file(s) next to the encrypted vault (an older ICEBREAKER or another app wrote them): vault adopt\n`));
    const zips = (await crypt.backups?.().catch(() => [])) ?? [];
    if (st.encrypted && zips.length) ctx.out(fmt.yellow(`  ${zips.length} plain backup zip(s) next to the vault — your notes unencrypted: vault wipe-backup\n`));
    return 0;
  }
  if (sub === "backups") {
    const zips = (await crypt.backups?.()) ?? [];
    if (!zips.length) return ctx.out("no plain backup next to the vault\n"), 0;
    for (const z of zips) ctx.out(`${z}\n`);
    ctx.out(fmt.dim("your notes unencrypted · vault wipe-backup deletes them (overwritten first)\n"));
    return 0;
  }
  if (sub === "adopt") {
    if (!st.encrypted) return ctx.err("this vault isn't encrypted: nothing to adopt\n"), 1;
    if (!st.leftovers) return ctx.out("no plain file next to the encrypted vault\n"), 0;
    const r = await crypt.adopt();
    await deck.vault.rescan();
    ctx.out(`${fmt.green("✓")} ${r.files} plain file(s) encrypted into the vault (a name already taken: in .trash/from-plain-…), each checked, the plain ones removed\n`);
    return 0;
  }
  if (!ctx.isTTY) return ctx.err(`vault ${sub}: needs the terminal\n`), 1;
  const password = async (label = "your account's password"): Promise<string | null> => (window ? deck.prompt(label, { mask: true }) : ctx.read(label, { mask: true }));
  // the account's password, asked again while it's wrong (a typo gave up on the whole encryption:
  // the setup moved on to the tour with the vault still plain) — checked only, nothing unlocked
  // after wrong passwords the native side makes this account wait (delay.rs): said, not silent
  const sayWait = async (): Promise<void> => {
    const ms = (await deck.platform.account.wait?.(deck.account ?? "").catch(() => 0)) ?? 0;
    if (ms > 0) ctx.out(fmt.dim(`${waitNote(ms)}\n`));
  };
  const accountPassword = async (): Promise<string | null> => {
    // the next question says what went wrong (a toast behind the dialog went unseen)
    let label = "your account's password";
    for (;;) {
      const pw = await password(label);
      if (pw === null || !deck.account) return pw;
      await sayWait();
      if (await deck.platform.account.check(deck.account, pw).catch(() => true)) return pw;
      deck.sound.play("error");
      if (window) label = t("wrong password — try again (esc: cancel)");
      else ctx.err("wrong password — try again (ctrl+c: cancel)\n");
    }
  };
  // typed in the shell: everything stays in the shell; --window (Settings, THE MENU, the setup): dialogs
  const ask = (title: string, detail: string): Promise<boolean> => (window ? deck.confirm(title, detail) : askInShell(ctx, title, detail));
  const tell = async (title: string, detail: string, tone: "info" | "success" | "error" = "success"): Promise<void> => {
    if (window) await deck.workspace.message(title, detail, { frame: tone === "error" ? "PROBLEM" : "DONE", tone });
  };
  try {
    if (sub === "wipe-backup") {
      const given = rest.join(" ").trim();
      const paths = given ? [given] : ((await crypt.backups?.()) ?? []);
      if (!paths.length) return ctx.out("no plain backup next to the vault\n"), 0;
      return wipeBackups(ctx, paths, ask);
    }
    if (sub === "unlock") {
      if (!st.encrypted) return ctx.out("this vault isn't encrypted\n"), 0;
      if (st.unlocked) return ctx.out("already unlocked\n"), 0;
      const pw = await password("your account's password (or the 24 words of the recovery key)");
      if (pw === null) return 130;
      if (pw.trim().split(/\s+/).length >= 20) {
        // the recovery key: it opens the vault, then your account's password opens it from now on
        const mine = await password("your account's password (it opens this vault from now on)");
        if (mine === null) return 130;
        await crypt.recover(pw, mine);
      } else await crypt.unlock(pw);
      await deck.vault.rescan();
      ctx.out(`${fmt.green("✓")} unlocked · ${deck.vault.markdown().length} notes\n`);
      return 0;
    }
    if (sub === "encrypt") {
      if (st.encrypted) return ctx.out("this vault is already encrypted\n"), 0;
      if (!deck.account) return ctx.err("vault encrypt: log in first (the vault is encrypted with your account's password)\n"), 1;
      ctx.out(
        [
          `${fmt.bold("vault encrypt")} ${deck.vault.root}`,
          "  1. a plain backup zip next to the vault (at the end: delete it, it's your notes in plain)",
          "  2. every file encrypted — notes, names, folders — and checked before its plain copy is removed",
          "  3. ICEBREAKER and ibsh work as always; your real terminal, Obsidian and git only see noise",
          "  4. a recovery key — 24 words to write on paper — opens it if you forget your account's password",
          "",
        ].join("\n"),
      );
      const ok = await ask("Encrypt this vault?", "Have paper and a pen ready: 24 words to write down at the end.");
      if (!ok) return 1;
      // the password lives only until the native side has it (never while the words are shown)
      let pw = await accountPassword();
      if (pw === null) return 130;
      ctx.out(fmt.dim("backup, encryption, check… (don't quit)\n"));
      const r = await crypt.encrypt(pw, localStamp());
      pw = null;
      await deck.vault.rescan();
      const done = `${fmt.green("✓")} encrypted: ${r.files} files, ${r.folders} folders, ${sizeText(r.bytes)} · each one checked`;
      if (r.recovery) {
        const warn = r.backup ? plainBackupWarning(r.backup) : [];
        await words(r.recovery, [done, recoveryNotKept(false), ...warn, ...(r.backup ? [t("kept: delete it later with vault wipe-backup")] : [])].join("\n"));
      }
      ctx.out(`${done}\n`);
      if (r.left.length) ctx.err(`  couldn't remove ${r.left.length} plain file(s), remove them yourself:\n${r.left.map((l) => `    ${l}\n`).join("")}`);
      await tell(
        "The vault is encrypted",
        [`${r.files} files, ${r.folders} folders, ${sizeText(r.bytes)} · each one checked`, ...(r.left.length ? ["", `${r.left.length} plain file(s) couldn't be removed — the shell lists them.`] : [])].join("\n"),
      );
      // the plain backup: said very clearly, and offered to be wiped now (every file was just
      // checked, and you're reading them: the vault works)
      if (r.backup) {
        const warn = plainBackupWarning(r.backup);
        ctx.out(`${fmt.bold(fmt.yellow(warn[0]))}\n${warn.slice(1).map((l) => `  ${l}\n`).join("")}`);
        const wiped = (await wipeBackups(ctx, [r.backup], (_title, _detail) => ask(t("Delete the plain backup now?"), `${plainBackupWarning(r.backup!, t).join("\n\n")}\n\n${t("Overwritten, then removed: it can't be undone. Your encrypted vault isn't touched.")}`))) === 0;
        const still = (await crypt.backups?.().catch(() => [])) ?? [];
        if (wiped && still.includes(r.backup)) ctx.out(fmt.yellow(`${t("kept: delete it later with vault wipe-backup")}\n`));
      }
      return 0;
    }
    if (sub === "rekey") {
      if (!st.encrypted) return ctx.err("this vault isn't encrypted: there's no key to change\n"), 1;
      if (!st.unlocked) return ctx.err("unlock the vault first (vault unlock)\n"), 1;
      ctx.out("a new vault key: every file encrypted again (checked), and a new recovery key — the old key file, password or recovery key open nothing any more\n");
      if (!(await ask("Change the vault's key?", "Have paper and a pen ready: new recovery words at the end."))) return 1;
      let pw = await accountPassword();
      if (pw === null) return 130;
      ctx.out(fmt.dim("checking the password, then encrypting everything again and checking every file… (don't quit)\n"));
      const r = await crypt.rekey(pw);
      pw = null;
      // the old recovery key went with the old vault key: until the new words are typed back, there's none
      const done = `${fmt.green("✓")} a new vault key: ${r.files} files encrypted again, each checked · the old recovery key is gone`;
      const kept = r.recovery ? await words(r.recovery, `${done} · no new one yet (vault recovery)\n${recoveryNotKept(false)}`) : false;
      ctx.out(`${done}${kept ? "" : " · no new one yet (vault recovery)"}\n`);
      await tell("The vault has a new key", `${r.files} files encrypted again, each checked.\nThe old key, the old recovery words and copies made before open nothing new.`);
      return 0;
    }
    if (sub === "recovery") {
      if (!st.encrypted) return ctx.err("this vault isn't encrypted: no recovery key needed\n"), 1;
      if (!st.unlocked) return ctx.err("unlock the vault first (vault unlock)\n"), 1;
      if (st.recovery && !(await ask("Make a new recovery key?", "The old one stops working: throw its paper away."))) return 1;
      let pw = await accountPassword();
      if (pw === null) return 130;
      const w = await crypt.newRecovery(pw);
      pw = null;
      return (await words(w, recoveryNotKept(st.recovery))) ? 0 : 130;
    }
    if (sub === "decrypt") {
      if (!st.encrypted) return ctx.out("this vault isn't encrypted\n"), 0;
      ctx.out("every file goes back to plain on the disk (readable by any app, Obsidian, git…), each one checked before the encrypted copy is removed\n");
      const ok = await ask("Decrypt this vault?", "Its files become readable by any app again.");
      if (!ok) return 1;
      const pw = await password();
      if (pw === null) return 130;
      await sayWait();
      const r = await crypt.decrypt(pw);
      await deck.vault.rescan();
      ctx.out(`${fmt.green("✓")} plain again: ${r.files} files, ${r.folders} folders, ${sizeText(r.bytes)} · each one checked\n`);
      await tell("The vault is plain again", `${r.files} files, ${r.folders} folders, ${sizeText(r.bytes)} · each one checked`);
      return 0;
    }
    if (sub === "export") {
      const dest = rest.join(" ").trim();
      if (!dest) return ctx.err("usage: vault export <folder>   (a new or empty folder outside the vault, e.g. ~/Desktop/notes-copy)\n"), 1;
      if (!st.encrypted) return ctx.err("this vault isn't encrypted: its files are already plain\n"), 1;
      // a plain copy of everything: the password again, whoever sits at the deck
      const pw = await password();
      if (pw === null) return 130;
      // the native side checks it before it writes anything
      const r = await crypt.export(dest, pw);
      ctx.out(`${fmt.green("✓")} plain copy: ${r.files} files, ${r.folders} folders, ${sizeText(r.bytes)} in ${dest} ${fmt.dim("· delete it when you're done")}\n`);
      // the account (its password's hash), settings, secrets and shell history never go in a plain copy
      if (r.kept_out?.length) ctx.out(fmt.dim(`${keptOutNote(r.kept_out)}\n`));
      await tell("A plain copy is ready", `${r.files} files, ${r.folders} folders, ${sizeText(r.bytes)} in\n${dest}\nDelete it when you're done: it's your notes in plain.`);
      return 0;
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    ctx.err(`vault ${sub}: ${msg}\n`);
    await tell(/wrong password|wrong recovery/i.test(msg) ? "Wrong password" : `vault ${sub}: it didn't work`, /wrong password/i.test(msg) ? "Nothing was changed. Try again." : `${msg}\nNothing was changed.`, "error");
    return 1;
  }
  return 1;
}



/** `vault move [folder]`: the whole vault elsewhere (a USB key, another disk), nothing lost on the way. */
async function vaultMove(ctx: ShellContext, rest: string[], window = false): Promise<number> {
  const { deck } = ctx;
  const v = deck.platform.vault;
  if (!v.move || !v.moveCleanup) return ctx.err("vault move: needs the desktop app\n"), 1;
  const ask = (title: string, detail: string): Promise<boolean> => (window ? deck.confirm(title, detail) : askInShell(ctx, title, detail));
  const typed = rest.join(" ").trim();
  const dest = typed || (window ? await pickFolder(deck, "MOVE THE VAULT TO…") : await ctx.read("move the vault to (a folder)", { placeholder: "~/Documents or /Volumes/KEY" })) || "";
  if (!dest.trim()) return 130;
  const from = deck.vault.root;
  // a folder that already holds things: the vault goes inside it, under its own name (vault.rs does the same)
  const name = from.replace(/[\\/]+$/, "").split(/[\\/]/).pop() || "Icebreaker";
  const full = await (deck.platform.files?.list(dest).then((es) => (es.length ? `${dest.replace(/[\\/]+$/, "")}/${name}` : dest)).catch(() => dest) ?? dest);
  if (!(await ask("Move the vault?", `${from}\n→ ${full}\n\nEverything is copied there and checked (encrypted or not), then ICEBREAKER uses the new place.\nThe old folder stays until you say it can go.`))) return 1;
  ctx.out(fmt.dim("copying and checking every file… (don't quit)\n"));
  try {
    const root = await v.move(dest);
    await deck.vault.mount(root);
    deck.settings.set("vault.path", deck.vault.root);
    await deck.settings.flush();
    await deck.vault.rescan();
    ctx.out(`${fmt.green("✓")} the vault is now in ${root} · every file checked\n`);
    if (await ask("Remove the old folder?", `${from}\n\nEverything in it is now in ${root} (checked). Keep it as a copy if you like.`)) {
      await v.moveCleanup();
      ctx.out(`${fmt.green("✓")} the old folder is gone\n`);
    } else ctx.out(`the old folder stays: ${from} ${fmt.dim("(a copy — delete it yourself when you're sure)")}\n`);
    return 0;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    ctx.err(`vault move: ${msg}\n`);
    if (window) await deck.workspace.message("The vault didn't move", `${msg}\nNothing was changed.`, { frame: "PROBLEM", tone: "error" });
    return 1;
  }
}

const vaultCmd: Command = {
  name: "vault",
  interactive: true,
  summary: "show or switch the vault folder · encrypt it",
  usage:
    "vault                 show path and stats\nvault mount <abs path>  use another folder (e.g. your Obsidian vault; C:\\Users\\… as typed, quote a path with spaces)\nvault move [folder]   move the whole vault there (copied, checked, then used; no folder: choose one)\nvault rescan\nvault status          encrypted or plain, recovery key or not\nvault encrypt         encrypt it (a plain backup zip first, a recovery key at the end)\nvault decrypt         back to plain files\nvault export <folder> a plain copy, the vault stays encrypted (your notes and themes; never the account, settings, secrets or shell history)\nvault recovery        a new recovery key (24 words; the old one stops working once you type one back — esc keeps the old)\nvault rekey           a new vault key: everything encrypted again, a new recovery key\nvault unlock          open it with your account's password or the recovery key (the login does it)\nvault adopt           plain files written next to the encrypted vault go inside it\nvault backups         the plain backup zips vault encrypt left next to the vault\nvault wipe-backup [zip] delete them (overwritten first; copies in backups, synced folders or the trash stay)\n  --window            (encrypt, decrypt, recovery, rekey, unlock, export, move) dialogs and windows instead of the shell: the password, the recovery key (copy all), the result",
  man: "An encrypted vault is one folder of encrypted files (.icebreaker-vault): names, folders and notes. Your account's password opens it at login; lock wipes its key from memory.\nThe recovery key (24 words, shown once at vault encrypt or vault recovery) opens it if you forget the password: login page → forgot password?.\nICEBREAKER and ibsh read it as always; your real terminal, Obsidian and git only see noise. vault export makes a plain copy.\nSee docs/ENCRYPTION.md.",
  complete: () => ["mount", "move", "rescan", "status", "encrypt", "decrypt", "export", "recovery", "rekey", "unlock", "adopt", "backups", "wipe-backup"],
  async run(ctx) {
    const v = ctx.deck.vault;
    const [sub, ...rest] = ctx.args.filter((a) => a !== "--window");
    if (sub && ["status", "encrypt", "decrypt", "export", "recovery", "rekey", "unlock", "adopt", "backups", "wipe-backup"].includes(sub)) return vaultCrypt(ctx, sub, rest, ctx.args.includes("--window"));
    if (sub === "move") return vaultMove(ctx, rest, ctx.args.includes("--window"));
    if (sub === "rescan") {
      await v.rescan();
      ctx.out(`${v.entries.length} entries indexed\n`);
      return;
    }
    if (sub === "mount" || sub === "open") {
      const here = rest.includes("--here");
      let path = rest.filter((w) => w !== "--here").join(" ");
      if (!path) {
        ctx.err("usage: vault mount <absolute path> [--here]   (--here: a full folder as it is, without asking)\n");
        return 1;
      }
      // the same look as the setup's: a drive that isn't there, a folder full of other things
      const files = ctx.deck.platform.files;
      if (files && !here) {
        const found = await checkVaultFolder(path, await files.home().catch(() => ""), (d) => files.list(d));
        if (found.kind === "missing") return ctx.err(`vault: ${t("this disk or folder doesn't exist: {root}", { root: found.root })}\n`), 1;
        if (found.kind === "full") {
          const inside = icebreakerInside(path);
          if (await ctx.deck.confirm(t("this folder already holds {n} things", { n: found.count }), t("make a folder “Icebreaker” in it for the vault?\n{path}\n\nno: use the folder as it is", { path: inside }))) path = inside;
        }
      }
      await ctx.deck.mountVault(path);
      ctx.out(`mounted ${v.root}\n`);
      ctx.shell.cd("");
      return;
    }
    const st = await ctx.deck.platform.vault.crypt?.status().catch(() => null);
    const enc = !st
      ? ""
      : st.encrypted
        ? `${fmt.bold("encrypted")} ${fmt.green("yes")}${st.unlocked ? "" : fmt.yellow(" · locked (vault unlock)")}${st.recovery ? "" : fmt.yellow(" · no recovery key (vault recovery)")}\n`
        : `${fmt.bold("encrypted")} no ${fmt.dim("· vault encrypt")}\n`;
    ctx.out(`${fmt.bold("path")}     ${v.root}\n${enc}${fmt.bold("notes")}    ${v.markdown().length}\n${fmt.bold("files")}    ${v.files().length}\n${fmt.bold("journal")}  ${v.journalDates().size} days\n`);
  },
};

const plugin: Command = {
  name: "plugin",
  aliases: ["plugins"],
  summary: "list, enable, disable, scaffold plugins",
  usage: "plugin [ls]\nplugin enable <id>   (what it needs and is off comes on first)\nplugin disable <id>  (what needs it goes off too, after asking)\nplugin info <id>     (what it is, its state and why, what it asks for and may use)\nplugin perms [id]    (what each module may do, and when it last did)\nplugin revoke <id> <permission>   (take one away: it keeps running)\nplugin grant <id> <permission>    (give it back)\nplugin reload\nplugin new <id>     (scaffold a plugin in .icebreaker/plugins/<id>)\nplugin install <user/repo | id>   (download from GitHub / the community index)\nplugin update <id>  (re-download an installed plugin — store update shows what's new)\nplugin search [words]  (= store search)\nplugin audit <id>   (what its code does that a module shouldn't need)\nplugin open-with [ext] [module | -]   (which module opens .mod files when two can; - asks again)\n  --window          (enable, disable) ask in dialogs instead of the shell",
  man: "Plugins live in <vault>/.icebreaker/plugins/<id>/ with a plugin.json and a main.js.\nVault plugins are disabled until you enable them; you'll see the permissions they ask for first.\nSee docs/PLUGINS.md.",
  async run(ctx) {
    const host = ctx.deck.plugins;
    const [sub, id] = ctx.args.filter((a) => a !== "--window");
    if (sub === "audit") {
      if (!id) return ctx.err("usage: plugin audit <id>\n"), 1;
      const found = await host.audit(id);
      ctx.out(`${auditReport(found)}\n`);
      for (const f of found) ctx.out(fmt.dim(`  line ${f.line}: ${f.excerpt}\n`));
      return found.some((f) => f.level === "danger") ? 1 : 0;
    }
    if (!sub || sub === "ls" || sub === "list") {
      for (const p of host.list()) {
        const state = p.error ? fmt.red("error") : p.active ? fmt.green("on ") : fmt.gray("off");
        ctx.out(`${state} ${padEnd(p.manifest.id, 16)} ${fmt.dim(`${p.source} · v${p.manifest.version}`)}  ${p.manifest.description ?? ""}\n`);
        if (p.error) ctx.err(`    ${p.error}\n`);
      }
      return;
    }
    // ── permissions (docs/PERMISSIONS.md): see them, take one away, give it back ──
    if (sub === "perms" || sub === "permissions") {
      const list = id ? host.list().filter((p) => p.manifest.id === id) : host.list().filter((p) => p.active || p.source === "vault");
      if (id && !list.length) return ctx.err(`plugin perms: no module "${id}" (plugin ls)\n`), 1;
      const ago = (at?: number) => (at ? `${fmt.dim("last used")} ${new Date(at).toLocaleString(dateLocale(), { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}` : fmt.dim("never used"));
      for (const p of list) {
        const perms = host.permissionsOf(p.manifest.id);
        ctx.out(`${fmt.bold(p.manifest.name)} ${fmt.dim(`(${p.manifest.id}) · ${p.source === "builtin" ? "ships with the deck" : "from the STORE or the vault"}${p.active ? "" : " · off"}`)}\n`);
        // off, and why (an update that asks for more…): with what to type
        if (!p.active && p.error) ctx.out(fmt.red(`  ${p.error}\n`));
        if (!perms.length) ctx.out(fmt.dim("  asks for nothing\n"));
        for (const x of perms) {
          const d = describePerm(x.perm);
          const level = d.level === "total" ? fmt.red("TOTAL ") : d.level === "high" ? fmt.yellow("HIGH  ") : fmt.dim(d.level.padEnd(6));
          ctx.out(`  ${x.on ? fmt.green("●") : fmt.red("○")} ${level} ${padEnd(`${d.label}${d.scope ? ` → ${d.scope}` : ""}`, 44)} ${fmt.dim(padEnd(x.perm, 26))} ${x.on ? ago(x.lastUse) : fmt.red("taken away")}${x.always ? fmt.dim(" · always") : ""}\n`);
        }
        if (id) {
          const used = ctx.deck.access.of(p.manifest.id, 12);
          if (used.length) ctx.out(fmt.dim("  the last uses (the LOG's access filter has them all):\n"));
          for (const a of used) ctx.out(fmt.dim(`    ${new Date(a.at).toLocaleString(dateLocale(), { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}  ${a.perm}${a.what ? ` · ${a.what}` : ""}\n`));
        }
      }
      if (!id) ctx.out(fmt.dim("plugin perms <id> · plugin revoke <id> <permission> · plugin grant <id> <permission> · Settings → PERMISSIONS\n"));
      return 0;
    }
    // ── files it opens (plugin.json `opens`): which module, when two can ──
    if (sub === "open-with" || sub === "openwith") {
      const ext = (id ?? "").replace(/^\./, "").toLowerCase();
      const who = ctx.args.filter((a) => a !== "--window")[2];
      const chosen = ctx.deck.settings.data.plugins.openWith ?? {};
      if (!ext) {
        const kinds = new Map<string, string[]>();
        for (const p of host.active()) for (const o of readOpens(p.manifest)) for (const x of o.types) kinds.set(x, [...(kinds.get(x) ?? []), p.manifest.id]);
        if (!kinds.size) return ctx.out(fmt.dim("no module opens files (plugin.json \"opens\")\n")), 0;
        for (const [x, ids] of [...kinds].sort()) ctx.out(`.${padEnd(x, 8)} ${ids.map((i) => (i === chosen[x] || ids.length === 1 ? fmt.bold(i) : fmt.dim(i))).join("  ")}${ids.length > 1 && !chosen[x] ? fmt.dim("  (asked the first time)") : ""}\n`);
        return 0;
      }
      if (!who) return ctx.out(`.${ext}: ${chosen[ext] ?? fmt.dim("not chosen")}\n`), 0;
      const rest = { ...chosen };
      delete rest[ext];
      if (who === "-" || who === "ask") return ctx.deck.settings.set("plugins.openWith", rest), ctx.out(`.${ext}: asked again next time\n`), 0;
      if (!host.handlersFor(`x.${ext}`).some((h) => h.module === who)) return ctx.err(`plugin open-with: ${who} doesn't open .${ext} files (plugin open-with)\n`), 1;
      ctx.deck.settings.set("plugins.openWith", { ...rest, [ext]: who });
      return ctx.out(`.${ext} → ${who}\n`), 0;
    }
    if (sub === "revoke" || sub === "grant") {
      const perm = ctx.args.filter((a) => a !== "--window")[2];
      if (!id || !perm) return ctx.err(`usage: plugin ${sub} <id> <permission>   (plugin perms <id> lists them)\n`), 1;
      if (!host.list().some((p) => p.manifest.id === id)) return ctx.err(`plugin ${sub}: no module "${id}" (plugin ls)\n`), 1;
      const ok = sub === "revoke" ? host.revoke(id, perm) : host.grant(id, perm);
      if (!ok) return ctx.err(sub === "revoke" ? `plugin revoke: ${id} doesn't have "${perm}" (plugin perms ${id})\n` : `plugin grant: "${perm}" wasn't taken away from ${id} — a permission it never had is approved by switching it on (plugin enable ${id})\n`), 1;
      const label = describePerm(host.permissionsOf(id).find((x) => x.perm === perm || x.perm.startsWith(`${perm}:`))?.perm ?? perm).label;
      ctx.out(sub === "revoke" ? `${id}: “${label}” taken away — it keeps running, what needs it says so · plugin grant ${id} ${perm} gives it back\n` : `${id}: “${label}” given back\n`);
      return 0;
    }
    if (sub === "enable" || sub === "disable") {
      if (!id) {
        ctx.err(`usage: plugin ${sub} <id> [--window]\n`);
        return 1;
      }
      const ask = asker(ctx, ctx.args.includes("--window"));
      try {
        if (sub === "enable") {
          const before = new Set(host.active().map((p) => p.manifest.id));
          // --window (a click in the STORE, MODULES): the permission dialog; typed: asked here, in words
          const ok = await host.enable(id, ctx.args.includes("--window") ? undefined : ask);
          // what it needed and was off came on with it (plugins/deps.ts)
          const along = host.active().map((p) => p.manifest.id).filter((x) => x !== id && !before.has(x));
          const wasOn = before.has(id);
          ctx.out(ok ? `${id}: enabled${along.length ? fmt.dim(` · with what it needs: ${along.join(", ")}`) : ""}\n` : wasOn ? `${id}: already on${fmt.dim(" — its files changed? plugin reload (within what you approved; asking for more brings it back here)")}\n` : `${id}: unchanged\n`);
          return ok || host.active().some((p) => p.manifest.id === id) ? 0 : 1;
        }
        // others need it: they go off with it — after asking
        const deps = host.dependentsOf(id);
        if (deps.length && !(await ask(`${id} is needed by ${deps.join(", ")}`, `Switch ${deps.length > 1 ? "them" : "it"} off too?`))) return ctx.out(`${id}: unchanged\n`), 1;
        for (const x of deps.reverse()) await host.disable(x);
        const ok = await host.disable(id);
        ctx.out(ok ? `${id}: disabled${deps.length ? fmt.dim(` · and ${deps.join(", ")}`) : ""}\n` : `${id}: unchanged\n`);
        return 0;
      } catch (e) {
        ctx.err(`plugin ${sub}: ${e instanceof Error ? e.message : e}\n`);
        return 1;
      }
    }
    if (sub === "info") {
      const p = host.list().find((x) => x.manifest.id === id);
      if (!id || !p) return ctx.err(id ? `plugin info: no module "${id}" (plugin ls)\n` : "usage: plugin info <id>\n"), 1;
      const m = p.manifest;
      const granted = ctx.deck.settings.data.plugins.granted?.[m.id];
      const state = p.active ? fmt.green("on") : p.error ? fmt.red("off") : fmt.gray("off");
      ctx.out(`${fmt.bold(m.name)} ${fmt.dim(`(${m.id}) · v${m.version}${m.author ? ` · by ${m.author}` : ""} · ${p.source === "builtin" ? "ships with the deck" : `.icebreaker/plugins/${m.id}/`}`)}\n`);
      if (m.description) ctx.out(`${m.description}\n`);
      ctx.out(`${fmt.bold("state")}      ${state}${p.error ? ` — ${p.error}` : ""}\n`);
      ctx.out(`${fmt.bold("asks for")}   ${sayPerms(host.asks(m)) || "nothing"}\n`);
      if (p.source === "vault") ctx.out(`${fmt.bold("approved")}   ${Array.isArray(granted) ? sayPerms(granted) || "nothing" : fmt.dim("not yet")}\n`);
      if (p.active) ctx.out(`${fmt.bold("may use")}    ${sayPerms(host.effective(m.id)) || "nothing"}\n`);
      ctx.out(fmt.dim(`plugin perms ${m.id} · plugin audit ${m.id}${p.active ? "" : ` · plugin enable ${m.id}`}\n`));
      return 0;
    }
    if (sub === "reload") {
      // you ask for it yourself (modules can't run this): the code as it is now is the code you approve
      // what changed within what you approved runs (approved again from its plugin.json); what asks
      // for MORE stays off until you read it: said here, with the command (Windows bench 24/11)
      await host.reload(true);
      ctx.out(`${host.active().length} plugins active\n`);
      const off = host.offReasons();
      for (const x of off) ctx.err(`${fmt.red("off")} ${x.id}: ${x.error}\n`);
      return off.length ? 1 : 0;
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
      // straight from a repo: not reviewed by ICEBREAKER (the official STORE's own repo is)
      if (sub === "install" && !isOfficialSource(src)) {
        ctx.out(fmt.yellow(`⚠ not verified — ${src}\n`));
        if (!(await asker(ctx, ctx.args.includes("--window"))("Install a module nobody has checked?", unverifiedWarning(src)))) return ctx.out("not installed\n"), 1;
      }
      ctx.out(fmt.dim(`fetching ${src}…\n`));
      try {
        const p = await installPlugin(ctx.deck, src);
        await host.reload(sub === "update");
        ctx.out(`${fmt.green("✓")} ${p.name} (${p.id}) ${sub === "update" ? "updated" : "installed"} — asks for: ${sayPerms(p.permissions) || "nothing"}\n`);
        if (sub === "install") ctx.out(`read its code in .icebreaker/plugins/${p.id}/, then: ${fmt.magenta(`plugin enable ${p.id}`)}\n`);
      } catch (e) {
        ctx.err(`plugin ${sub}: ${e instanceof Error ? e.message : e}\n`);
        return 1;
      }
      return;
    }
    // one search, one catalog: the STORE's (with built-ins, states and what each needs)
    if (sub === "search") return storeCommand.run({ ...ctx, args: ["search", ...ctx.args.slice(1)] });
    ctx.err(`plugin: unknown subcommand ${sub}\n`);
    return 1;
  },
};

export const deckCommands: Command[] = [undoCommand, redoCommand, tourCommand, changelogCommand, contextCommand, ...uiCommands, voiceCommand, sayCommand, stealthCommand, encodersCommand, newsCommand, daily, chat, account, lock, login, sound, mute, audioCommand, errorsCommand, logCommand, debugCommand, open, journal, note, checkboxes, ask, link, sysmon, theme, fx, config, vaultCmd, plugin];

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
  // a component's field (core/skin): the resolved value, what the theme set over the deck's
  const comp = component(sec);
  if (comp && k in comp.fields) {
    const v = (resolve(comp, (t as unknown as Record<string, object | undefined>)[sec]) as Record<string, unknown>)[k];
    return (comp.fields as Record<string, Field>)[k].kind === "color" ? hexOf(v as number | null) : typeof v === "boolean" ? (v ? "on" : "off") : String(v);
  }
  return "";
}
