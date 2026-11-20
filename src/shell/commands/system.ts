import pkg from "../../../package.json";
import { AVATAR_COLORS, AVATARS, avatarOf } from "../../core/avatar";
import { AvatarPicker } from "../../workspace/avatarpicker";
import { helpText } from "../help";
import { fmt } from "../../core/ansi";
import { osKeys } from "../../core/keyhints";
import { gradient } from "../../core/color";
import { padEnd, strWidth } from "../../core/unicode";
import { ICE_ART } from "../../ui/bigtext";
import type { Command } from "../types";
import { humanSize } from "./files";

/** Shell built-ins and "system" commands. */

const help: Command = {
  name: "help",
  summary: "list commands",
  run(ctx) {
    const groups = new Map<string, Command[]>();
    for (const c of ctx.deck.commands.all()) {
      const g = c.source && c.source !== "core" ? `plugin: ${c.source}` : "core";
      (groups.get(g) ?? groups.set(g, []).get(g)!).push(c);
    }
    for (const [g, cmds] of groups) {
      ctx.out(`\n${ctx.isTTY ? fmt.bold(fmt.magenta(g.toUpperCase())) : g.toUpperCase()}\n`);
      for (const c of cmds) ctx.out(`  ${ctx.isTTY ? fmt.green(padEnd(c.name, 12)) : padEnd(c.name, 12)} ${c.summary}\n`);
    }
    ctx.out(`\n${fmt.dim(osKeys("<command> -h for its help and examples (todo -h) · ⌘K / shift twice: THE MENU · F1 manual"))}\n`);
  },
};

const man: Command = {
  name: "man",
  summary: "show a command's manual page",
  usage: "man command",
  complete: "command",
  run(ctx) {
    const name = ctx.args[0];
    const c = name ? ctx.deck.commands.get(name) : undefined;
    if (!c) {
      ctx.err(name ? `No manual entry for ${name}\n` : "What manual page do you want?\n");
      return 1;
    }
    ctx.out(helpText(c, ctx.isTTY));
  },
};

const clear: Command = {
  name: "clear",
  aliases: ["cls"],
  summary: "clear the terminal",
  run(ctx) {
    ctx.shell.clear();
  },
};

const history: Command = {
  name: "history",
  summary: "show command history",
  run(ctx) {
    ctx.shell.history().forEach((h, i) => ctx.out(`${String(i + 1).padStart(5)}  ${h}\n`));
  },
};

const date: Command = {
  name: "date",
  summary: "print the date and time",
  run(ctx) {
    ctx.out(new Date().toString() + "\n");
  },
};

const cal: Command = {
  name: "cal",
  summary: "show a calendar (journal days highlighted)",
  usage: "cal [month] [year]",
  run(ctx) {
    const now = new Date();
    const month = ctx.args[0] ? Number(ctx.args[0]) - 1 : now.getMonth();
    const year = ctx.args[1] ? Number(ctx.args[1]) : now.getFullYear();
    const first = new Date(year, month, 1);
    const days = new Date(year, month + 1, 0).getDate();
    const entries = ctx.deck.vault.journalDates();
    const title = first.toLocaleString("en", { month: "long", year: "numeric" });
    ctx.out(" ".repeat(Math.max(0, Math.floor((20 - title.length) / 2))) + title + "\n");
    ctx.out("Mo Tu We Th Fr Sa Su\n");
    let line = "   ".repeat((first.getDay() + 6) % 7);
    for (let d = 1; d <= days; d++) {
      const iso = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      let s = String(d).padStart(2);
      if (ctx.isTTY) {
        if (d === now.getDate() && month === now.getMonth() && year === now.getFullYear()) s = `\x1b[7m${s}\x1b[0m`;
        else if (entries.has(iso)) s = fmt.magenta(s);
      }
      line += s + " ";
      if ((first.getDay() + 6 + d) % 7 === 0) {
        ctx.out(line.trimEnd() + "\n");
        line = "";
      }
    }
    if (line) ctx.out(line.trimEnd() + "\n");
    if (ctx.isTTY) ctx.out(fmt.dim("magenta = journal entry") + "\n");
  },
};

const whoami: Command = {
  name: "whoami",
  summary: "print your handle (and your profile icon)",
  run(ctx) {
    const u = ctx.deck.settings.data.user;
    const a = avatarOf(u.avatar?.id);
    if (Array.isArray(a.art) && ctx.args[0] !== "-s") for (const line of a.art) ctx.out(`  ${fmt.magenta(line)}\n`);
    ctx.out(u.handle + "\n");
  },
};

const avatar: Command = {
  name: "avatar",
  aliases: ["profile"],
  summary: "your profile icon: a pixel face or a glyph, in a colour (Settings → YOU)",
  usage: "avatar                    the picker\navatar list               every icon\navatar <icon> [colour]    e.g. avatar visor cyan · avatar ☠ red\ncolours: " + Object.keys(AVATAR_COLORS).join(", "),
  complete: () => [...AVATARS.map((a) => a.id), "list", ...Object.keys(AVATAR_COLORS)],
  run(ctx) {
    const d = ctx.deck;
    const [id, color] = ctx.args;
    if (!id) return void d.workspace.push(new AvatarPicker(d)), 0;
    if (id === "list") {
      for (const a of AVATARS) ctx.out(`${a.id.padEnd(10)} ${Array.isArray(a.art) ? a.art.join(fmt.dim(" │ ")) : a.art}\n`);
      return 0;
    }
    const a = AVATARS.find((x) => x.id === id);
    if (!a) return ctx.err(`avatar: no icon ${id} (avatar list)\n`), 1;
    if (color && !(color in AVATAR_COLORS)) return ctx.err(`avatar: colours are ${Object.keys(AVATAR_COLORS).join(", ")}\n`), 1;
    d.settings.set("user.avatar", { id: a.id, color: color ?? d.settings.data.user.avatar?.color ?? "accent" });
    ctx.out(`${a.name}${color ? ` · ${color}` : ""}\n`);
    return 0;
  },
};

const uname: Command = {
  name: "uname",
  summary: "print system information",
  usage: "uname [-a]",
  async run(ctx) {
    const s = await ctx.deck.platform.system.stats();
    ctx.out(ctx.args.includes("-a") ? `ICEBREAKER 0.1.0 ${s.host} ${s.kernel || "-"} ${s.arch} (${s.os})\n` : "ICEBREAKER\n");
  },
};

const hostname: Command = {
  name: "hostname",
  summary: "print the machine name",
  async run(ctx) {
    ctx.out((await ctx.deck.platform.system.stats()).host + "\n");
  },
};

const uptime: Command = {
  name: "uptime",
  summary: "how long the machine has been running",
  async run(ctx) {
    const s = await ctx.deck.platform.system.stats();
    ctx.out(`up ${formatUptime(s.uptime)}, cpu ${s.cpu.toFixed(0)}%\n`);
  },
};

const env: Command = {
  name: "env",
  summary: "print environment variables",
  run(ctx) {
    for (const [k, v] of Object.entries(ctx.env)) ctx.out(`${k}=${v}\n`);
  },
};

const exportCmd: Command = {
  name: "export",
  summary: "set an environment variable",
  usage: "export NAME=value",
  run(ctx) {
    for (const a of ctx.args) {
      const [k, ...v] = a.split("=");
      if (k) ctx.env[k] = v.join("=");
    }
  },
};

const sleep: Command = {
  name: "sleep",
  summary: "wait N seconds",
  usage: "sleep seconds",
  run(ctx) {
    const ms = Number(ctx.args[0] ?? 1) * 1000;
    return new Promise<void>((resolve, reject) => {
      const t = setTimeout(resolve, ms);
      ctx.signal.addEventListener("abort", () => {
        clearTimeout(t);
        reject(new Error("interrupted"));
      });
    });
  },
};

const which: Command = {
  name: "which",
  aliases: ["type"],
  summary: "where does a command come from",
  complete: "command",
  run(ctx) {
    for (const n of ctx.args) {
      const c = ctx.deck.commands.get(n);
      ctx.out(c ? `${n}: ${c.source && c.source !== "core" ? `plugin ${c.source}` : "shell built-in"}${c.name !== n ? ` (alias of ${c.name})` : ""}\n` : `${n} not found\n`);
    }
  },
};

const neofetch: Command = {
  name: "neofetch",
  aliases: ["fastfetch", "deckfetch"],
  summary: "show deck info with style",
  async run(ctx) {
    const s = await ctx.deck.platform.system.stats();
    const d = ctx.deck;
    const t = d.theme;
    const user = d.settings.data.user.handle;
    const rgb = (c: number, text: string) => (ctx.isTTY ? `\x1b[38;2;${(c >> 16) & 255};${(c >> 8) & 255};${c & 255}m${text}\x1b[0m` : text);
    const key = (k: string) => (ctx.isTTY ? fmt.bold(fmt.magenta(k)) : k);
    const info = [
      `${fmt.bold(fmt.pink(user))}@${fmt.bold(fmt.pink(s.host.toLowerCase()))}`,
      "─".repeat(strWidth(`${user}@${s.host}`)),
      `${key("OS")}: ICEBREAKER 0.1.0 on ${s.os}`,
      `${key("Kernel")}: ${s.kernel || "n/a"} (${s.arch})`,
      `${key("Uptime")}: ${formatUptime(s.uptime)}`,
      `${key("Shell")}: ibsh ${pkg.version}`,
      `${key("Theme")}: ${t.name}`,
      `${key("Font")}: ${d.theme.font.family} ${d.settings.data.appearance.fontSize}px @ ${d.settings.data.appearance.scale}%`,
      `${key("CPU")}: ${s.cpuBrand || "unknown"} (${s.cores.length})`,
      `${key("Memory")}: ${humanSize(s.memUsed).replace("M", " MiB")} / ${humanSize(s.memTotal).replace("M", " MiB")}`,
      `${key("Vault")}: ${d.vault.markdown().length} notes · ${d.vault.journalDates().size} journal days`,
      `${key("AI link")}: ${d.ai.ready ? d.ai.provider.label : "offline"}`,
      `${key("Plugins")}: ${d.plugins.active().length} active`,
      "",
      t.ansi.slice(0, 8).map((c) => rgb(c, "███")).join(""),
      t.ansi.slice(8, 16).map((c) => rgb(c, "███")).join(""),
    ];
    const rows = Math.max(ICE_ART.length, info.length);
    for (let i = 0; i < rows; i++) {
      const art = ICE_ART[i] ?? " ".repeat(ICE_ART[0].length);
      const colored = ctx.isTTY ? rgb(gradient(t.gradient, i / ICE_ART.length), art) : art;
      ctx.out(`${colored}   ${info[i] ?? ""}\n`);
    }
  },
};

const FORTUNES = [
  "The deck doesn't care how tired you are. Write it down anyway.",
  "Every note you don't take is a memory you rent instead of own.",
  "Ice melts slowly, then all at once. So do bad habits.",
  "Cache your thoughts. Flush them to disk before you sleep.",
  "A clean vault is a fast vault. A messy vault is a lived-in one.",
  "Signal is what remains when you stop scrolling.",
  "The best encryption is a handwriting nobody else can read.",
  "You are not behind. You are buffering.",
  "Jack out once in a while. The street has better bandwidth.",
  "Small commits, small entries, long streaks.",
  "Your future self is a user too. Write them good docs.",
  "Neon fades. Plain text is forever.",
];

const fortune: Command = {
  name: "fortune",
  summary: "a line of street wisdom",
  run(ctx) {
    ctx.out(FORTUNES[Math.floor(Math.random() * FORTUNES.length)] + "\n");
  },
};

const rain: Command = {
  name: "rain",
  aliases: ["cmatrix", "screensaver"],
  summary: "falling glyphs screensaver (any key to exit)",
  run(ctx) {
    ctx.deck.screensaver();
  },
};

const exit: Command = {
  name: "exit",
  aliases: ["quit"],
  summary: "quit ICEBREAKER (like ⌘Q / Alt+F4)",
  man: `The normal way out, like ⌘Q / Alt+F4 or THE MENU's "Quit ICEBREAKER": open pages save,
the vault locks (an encrypted vault's key leaves the memory), and an update waiting to be
installed "by itself" installs as the app closes.
In a script, \`exit\` ends the script, not the app. In your real terminal (the term tab),
\`exit\` is that shell's own: it ends that terminal, not ICEBREAKER.
To hide the shell panel instead: ctrl+\` (it shows and hides it).`,
  async run(ctx) {
    await ctx.deck.quit();
  },
};

const reboot: Command = {
  name: "reboot",
  summary: "replay the boot sequence",
  run(ctx) {
    ctx.deck.reboot();
  },
};

const fullscreen: Command = {
  name: "fullscreen",
  summary: "toggle fullscreen (F11, ⌃⌘F on macOS)",
  async run(ctx) {
    await ctx.deck.toggleFullscreen();
  },
};

const colors: Command = {
  name: "colors",
  aliases: ["colortest"],
  summary: "show the theme's 16 terminal colors",
  run(ctx) {
    const names = ["black", "red", "green", "yellow", "blue", "magenta", "cyan", "white"];
    names.forEach((n, i) => ctx.out(`\x1b[${30 + i}m${"█".repeat(6)} ${padEnd(n, 8)}\x1b[0m \x1b[${90 + i}m${"█".repeat(6)} bright ${n}\x1b[0m\n`));
  },
};

export function formatUptime(sec: number): string {
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return [d && `${d}d`, h && `${h}h`, `${m}m`].filter(Boolean).join(" ");
}

export const systemCommands: Command[] = [help, man, clear, history, date, cal, whoami, avatar, uname, hostname, uptime, env, exportCmd, sleep, which, neofetch, fortune, rain, exit, reboot, fullscreen, colors];
