import { fmt } from "../../core/ansi";
import type { VaultEntry } from "../../platform/types";
import { basename, display, dirname, globToRegex, join } from "../../vault/paths";
import { parseFlags } from "../parser";
import { columns } from "../shell";
import type { Command, ShellContext } from "../types";

/**
 * File commands, working on the vault. They behave like their GNU
 * counterparts for everyday flags; `man <cmd>` lists what's supported.
 */

const humanSize = (n: number) =>
  n < 1024 ? `${n}B` : n < 1024 ** 2 ? `${(n / 1024).toFixed(1)}K` : `${(n / 1024 ** 2).toFixed(1)}M`;

function lsDate(ms: number): string {
  const d = new Date(ms);
  const mon = d.toLocaleString("en", { month: "short" });
  const recent = Date.now() - ms < 180 * 86400_000;
  const tail = recent ? `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}` : ` ${d.getFullYear()}`;
  return `${mon} ${String(d.getDate()).padStart(2)} ${tail}`;
}

function colorName(e: VaultEntry, tty: boolean): string {
  if (!tty) return e.name;
  if (e.isDir) return fmt.bold(fmt.blue(e.name)) + "/";
  if (e.name.startsWith(".")) return fmt.gray(e.name);
  if (e.name.endsWith(".md")) return e.name;
  if (/\.(toml|json|js|ts)$/.test(e.name)) return fmt.yellow(e.name);
  return fmt.cyan(e.name);
}

async function readInputs(ctx: ShellContext, files: string[]): Promise<{ name: string; text: string }[]> {
  if (files.length === 0) return [{ name: "(stdin)", text: ctx.stdin }];
  const out: { name: string; text: string }[] = [];
  for (const f of files) {
    if (f === "-") out.push({ name: "(stdin)", text: ctx.stdin });
    else out.push({ name: f, text: await ctx.deck.vault.read(ctx.resolve(f)) });
  }
  return out;
}

const ls: Command = {
  name: "ls",
  aliases: ["dir"],
  summary: "list directory contents",
  usage: "ls [-la1] [path…]",
  man: "-l  long format (permissions, size, date)\n-a  show hidden files (.icebreaker, .trash…)\n-1  one entry per line",
  complete: "path",
  async run(ctx) {
    const { flags, rest } = parseFlags(ctx.args);
    const long = !!flags.l || ctx.args.length === 0 && ctx.env.LS_LONG === "1";
    const targets = rest.length ? rest : ["."];
    for (const [i, t] of targets.entries()) {
      const path = ctx.resolve(t);
      let entries: VaultEntry[];
      try {
        entries = await ctx.deck.vault.list(path);
      } catch {
        ctx.err(`ls: cannot access '${t}': No such file or directory\n`);
        continue;
      }
      if (!flags.a) entries = entries.filter((e) => !e.name.startsWith("."));
      entries.sort((a, b) => Number(b.isDir) - Number(a.isDir) || a.name.localeCompare(b.name));
      if (targets.length > 1) ctx.out(`${i ? "\n" : ""}${t}:\n`);
      if (long) {
        ctx.out(`total ${entries.length}\n`);
        const user = ctx.env.USER;
        for (const e of entries) {
          const perms = e.isDir ? "drwxr-xr-x" : "-rw-r--r--";
          const size = (e.isDir ? "-" : humanSize(e.size)).padStart(6);
          ctx.out(`${ctx.isTTY ? fmt.gray(perms) : perms} ${user} ${ctx.isTTY ? fmt.green(size) : size} ${ctx.isTTY ? fmt.dim(lsDate(e.modified)) : lsDate(e.modified)} ${colorName(e, ctx.isTTY)}\n`);
        }
      } else if (flags["1"] || !ctx.isTTY) {
        for (const e of entries) ctx.out(colorName(e, ctx.isTTY) + "\n");
      } else if (entries.length) {
        // columns, measured on the plain names
        const plain = entries.map((e) => e.name + (e.isDir ? "/" : ""));
        const laid = columns(plain, 100).split("\n");
        const lookup = new Map(entries.map((e) => [e.name + (e.isDir ? "/" : ""), e]));
        for (const line of laid) {
          ctx.out(line.replace(/\S+\/?/g, (name) => (lookup.has(name) ? colorName(lookup.get(name)!, true) : name)) + "\n");
        }
      }
    }
  },
};

const cd: Command = {
  name: "cd",
  summary: "change directory",
  usage: "cd [path]   (no argument or ~ = vault root, - = previous)",
  complete: "path",
  run(ctx) {
    const target = ctx.args[0] ?? "~";
    const prev = ctx.env.OLDPWD ?? "";
    const path = target === "-" ? prev : ctx.resolve(target);
    if (!ctx.deck.vault.isDir(path)) {
      ctx.err(`cd: no such directory: ${target}\n`);
      return 1;
    }
    ctx.env.OLDPWD = ctx.cwd;
    ctx.shell.cd(path);
  },
};

const pwd: Command = {
  name: "pwd",
  summary: "print working directory",
  run(ctx) {
    ctx.out(`/${ctx.cwd}\n`);
  },
};

const tree: Command = {
  name: "tree",
  summary: "show the folder hierarchy",
  usage: "tree [-L depth] [path]",
  complete: "path",
  run(ctx) {
    const { flags, rest } = parseFlags(ctx.args, ["L"]);
    const root = ctx.resolve(rest[0] ?? ".");
    const maxDepth = flags.L ? Number(flags.L) : Infinity;
    const all = ctx.deck.vault.entries;
    let dirs = 0;
    let files = 0;
    const walk = (dir: string, prefix: string, depth: number) => {
      const kids = all.filter((e) => dirname(e.path) === dir).sort((a, b) => Number(b.isDir) - Number(a.isDir) || a.name.localeCompare(b.name));
      kids.forEach((k, i) => {
        const last = i === kids.length - 1;
        const branch = last ? "└── " : "├── ";
        ctx.out(`${ctx.isTTY ? fmt.gray(prefix + branch) : prefix + branch}${colorName(k, ctx.isTTY)}\n`);
        if (k.isDir) {
          dirs++;
          if (depth < maxDepth) walk(k.path, prefix + (last ? "    " : "│   "), depth + 1);
        } else files++;
      });
    };
    ctx.out((ctx.isTTY ? fmt.bold(fmt.blue(display(root))) : display(root)) + "\n");
    walk(root, "", 1);
    ctx.out(`\n${dirs} director${dirs === 1 ? "y" : "ies"}, ${files} file${files === 1 ? "" : "s"}\n`);
  },
};

const cat: Command = {
  name: "cat",
  summary: "print files",
  usage: "cat [-n] [file…]   (reads stdin without files)",
  complete: "path",
  async run(ctx) {
    const { flags, rest } = parseFlags(ctx.args);
    for (const f of await readInputs(ctx, rest)) {
      if (flags.n) {
        const lines = f.text.split("\n");
        lines.forEach((l, i) => {
          if (i === lines.length - 1 && l === "") return;
          ctx.out(`${String(i + 1).padStart(6)}  ${l}\n`);
        });
      } else ctx.out(f.text.endsWith("\n") || !f.text ? f.text : f.text + "\n");
    }
  },
};

function headTail(which: "head" | "tail"): Command {
  return {
    name: which,
    summary: which === "head" ? "first lines of files" : "last lines of files",
    usage: `${which} [-n N] [file…]`,
    complete: "path",
    async run(ctx) {
      const { flags, rest } = parseFlags(ctx.args, ["n"]);
      const n = Number(flags.n ?? 10);
      for (const f of await readInputs(ctx, rest)) {
        const lines = f.text.replace(/\n$/, "").split("\n");
        const part = which === "head" ? lines.slice(0, n) : lines.slice(-n);
        ctx.out(part.join("\n") + "\n");
      }
    },
  };
}

const wc: Command = {
  name: "wc",
  summary: "count lines, words, characters",
  usage: "wc [-lwc] [file…]",
  complete: "path",
  async run(ctx) {
    const { flags, rest } = parseFlags(ctx.args);
    const all = !flags.l && !flags.w && !flags.c;
    for (const f of await readInputs(ctx, rest)) {
      const parts: string[] = [];
      if (all || flags.l) parts.push(String(f.text.split("\n").length - (f.text.endsWith("\n") ? 1 : 0)).padStart(7));
      if (all || flags.w) parts.push(String((f.text.match(/\S+/g) ?? []).length).padStart(7));
      if (all || flags.c) parts.push(String(f.text.length).padStart(7));
      ctx.out(parts.join(" ") + (rest.length ? ` ${f.name}` : "") + "\n");
    }
  },
};

const grep: Command = {
  name: "grep",
  aliases: ["rg"],
  summary: "search text (regular expressions)",
  usage: "grep [-inrvlc] pattern [path…]",
  man: "-i  ignore case\n-n  show line numbers\n-r  search folders recursively (default when no file is given and nothing is piped)\n-v  invert match\n-l  only print file names\n-c  count matches per file",
  complete: "path",
  async run(ctx) {
    const { flags, rest } = parseFlags(ctx.args);
    const [pattern, ...targets] = rest;
    if (!pattern) {
      ctx.err("usage: grep [-inrvlc] pattern [path…]\n");
      return 2;
    }
    let re: RegExp;
    try {
      re = new RegExp(pattern, flags.i ? "i" : "");
    } catch (e) {
      ctx.err(`grep: invalid pattern: ${(e as Error).message}\n`);
      return 2;
    }
    const hl = (line: string) =>
      ctx.isTTY ? line.replace(new RegExp(re.source, re.flags + "g"), (m) => fmt.bold(fmt.red(m))) : line;

    let files: { name: string; text: string }[];
    const fromStdin = targets.length === 0 && ctx.stdin !== "";
    if (fromStdin) files = [{ name: "", text: ctx.stdin }];
    else {
      const paths = targets.length ? targets.map(ctx.resolve) : [ctx.cwd];
      const list: string[] = [];
      for (const p of paths) {
        if (ctx.deck.vault.isDir(p)) {
          list.push(...ctx.deck.vault.files().filter((e) => (p ? e.path.startsWith(p + "/") : true) && /\.(md|txt|toml|json|js)$/.test(e.name)).map((e) => e.path));
        } else list.push(p);
      }
      const contents = await ctx.deck.vault.readMany(list);
      files = list.map((p, i) => ({ name: p, text: contents[i] ?? "" }));
    }

    let found = 0;
    const showName = !fromStdin && (files.length > 1 || targets.length === 0 || !!flags.r);
    for (const f of files) {
      let count = 0;
      f.text.split("\n").forEach((line, i) => {
        if (re.test(line) === !!flags.v) return;
        count++;
        found++;
        if (flags.l || flags.c) return;
        const name = showName ? (ctx.isTTY ? fmt.magenta(f.name) : f.name) + ":" : "";
        const num = flags.n ? (ctx.isTTY ? fmt.green(String(i + 1)) : String(i + 1)) + ":" : "";
        ctx.out(`${name}${num}${hl(line)}\n`);
      });
      if (flags.l && count) ctx.out((ctx.isTTY ? fmt.magenta(f.name) : f.name) + "\n");
      if (flags.c) ctx.out(`${showName ? f.name + ":" : ""}${count}\n`);
    }
    return found ? 0 : 1;
  },
};

const find: Command = {
  name: "find",
  aliases: ["fd"],
  summary: "find files by name",
  usage: "find [path] [-name glob] [-type f|d]",
  complete: "path",
  run(ctx) {
    const args = [...ctx.args];
    let name: RegExp | null = null;
    let type: string | null = null;
    const paths: string[] = [];
    while (args.length) {
      const a = args.shift()!;
      if (a === "-name" || a === "-iname") name = globToRegex(args.shift() ?? "*");
      else if (a === "-type") type = args.shift() ?? null;
      else paths.push(a);
    }
    const base = ctx.resolve(paths[0] ?? ".");
    for (const e of ctx.deck.vault.entries) {
      if (base && !e.path.startsWith(base + "/")) continue;
      if (name && !name.test(e.name)) continue;
      if (type === "f" && e.isDir) continue;
      if (type === "d" && !e.isDir) continue;
      ctx.out(`./${base ? e.path.slice(base.length + 1) : e.path}\n`);
    }
  },
};

const mkdir: Command = {
  name: "mkdir",
  summary: "create folders",
  usage: "mkdir [-p] dir…",
  complete: "path",
  async run(ctx) {
    const { rest } = parseFlags(ctx.args);
    for (const d of rest) {
      const p = ctx.resolve(d);
      const isNew = !(await ctx.deck.vault.exists(p));
      await ctx.deck.vault.mkdir(p);
      if (isNew) ctx.deck.vault.recordCreated(p);
    }
  },
};

const touch: Command = {
  name: "touch",
  summary: "create empty files (or update their date)",
  usage: "touch file…",
  complete: "path",
  async run(ctx) {
    for (const f of ctx.args) {
      const p = ctx.resolve(f);
      const existed = await ctx.deck.vault.exists(p);
      const content = existed ? await ctx.deck.vault.read(p) : "";
      await ctx.deck.vault.write(p, content);
      if (!existed) ctx.deck.vault.recordCreated(p);
    }
  },
};

const rm: Command = {
  name: "rm",
  summary: "move files to the vault trash (.trash) — recoverable",
  usage: "rm [-r] path…",
  man: "Nothing is ever hard-deleted: files go to <vault>/.trash/<timestamp>-<name>.\nFolders need -r.",
  complete: "path",
  async run(ctx) {
    const { flags, rest } = parseFlags(ctx.args);
    let status = 0;
    for (const f of rest) {
      const p = ctx.resolve(f);
      if (!p) {
        ctx.err("rm: refusing to remove the vault root\n");
        status = 1;
        continue;
      }
      if (ctx.deck.vault.isDir(p) && !flags.r && !flags.R) {
        ctx.err(`rm: ${f}: is a directory (use -r)\n`);
        status = 1;
        continue;
      }
      try {
        const dest = await ctx.deck.vault.trash(p);
        if (flags.v) ctx.out(`moved ${f} → ${dest}\n`);
      } catch (e) {
        ctx.err(`rm: ${f}: ${(e as Error).message}\n`);
        status = 1;
      }
    }
    return status;
  },
};

const mv: Command = {
  name: "mv",
  summary: "move or rename",
  usage: "mv source dest\nmv a.md b.md … folder/   several into a folder",
  complete: "path",
  async run(ctx) {
    if (ctx.args.length > 2) {
      const dir = ctx.resolve(ctx.args[ctx.args.length - 1]);
      if (!ctx.deck.vault.isDir(dir)) return ctx.err("mv: with several sources, the last one must be a folder\n"), 1;
      for (const a of ctx.args.slice(0, -1)) await ctx.deck.vault.rename(ctx.resolve(a), join(dir, basename(ctx.resolve(a))));
      return 0;
    }
    const [src, dest] = ctx.args;
    if (!src || !dest) {
      ctx.err("usage: mv source dest\n");
      return 1;
    }
    let to = ctx.resolve(dest);
    if (ctx.deck.vault.isDir(to)) to = join(to, basename(ctx.resolve(src)));
    await ctx.deck.vault.rename(ctx.resolve(src), to);
  },
};

const cp: Command = {
  name: "cp",
  summary: "copy a file",
  usage: "cp source dest",
  complete: "path",
  async run(ctx) {
    const [src, dest] = ctx.args;
    if (!src || !dest) {
      ctx.err("usage: cp source dest\n");
      return 1;
    }
    let to = ctx.resolve(dest);
    if (ctx.deck.vault.isDir(to)) to = join(to, basename(ctx.resolve(src)));
    const existed = await ctx.deck.vault.exists(to);
    const before = existed ? await ctx.deck.vault.read(to) : "";
    await ctx.deck.vault.write(to, await ctx.deck.vault.read(ctx.resolve(src)));
    if (!existed) ctx.deck.vault.recordCreated(to);
    else ctx.deck.history.record({ label: `cp → ${to}`, undo: () => ctx.deck.vault.write(to, before) });
  },
};

const echo: Command = {
  name: "echo",
  summary: "print text",
  usage: "echo [-n] text…",
  run(ctx) {
    const noNl = ctx.args[0] === "-n";
    ctx.out((noNl ? ctx.args.slice(1) : ctx.args).join(" ") + (noNl ? "" : "\n"));
  },
};

const sort: Command = {
  name: "sort",
  summary: "sort lines",
  usage: "sort [-rnu] [file…]",
  complete: "path",
  async run(ctx) {
    const { flags, rest } = parseFlags(ctx.args);
    const text = (await readInputs(ctx, rest)).map((f) => f.text).join("\n");
    let lines = text.split("\n").filter((l, i, a) => !(i === a.length - 1 && l === ""));
    lines.sort(flags.n ? (a, b) => parseFloat(a) - parseFloat(b) : (a, b) => a.localeCompare(b));
    if (flags.r) lines.reverse();
    if (flags.u) lines = [...new Set(lines)];
    ctx.out(lines.join("\n") + "\n");
  },
};

const uniq: Command = {
  name: "uniq",
  summary: "drop repeated adjacent lines",
  usage: "uniq [-c]",
  async run(ctx) {
    const { flags, rest } = parseFlags(ctx.args);
    const text = (await readInputs(ctx, rest)).map((f) => f.text).join("\n");
    const out: [string, number][] = [];
    for (const l of text.replace(/\n$/, "").split("\n")) {
      if (out.length && out[out.length - 1][0] === l) out[out.length - 1][1]++;
      else out.push([l, 1]);
    }
    ctx.out(out.map(([l, n]) => (flags.c ? `${String(n).padStart(7)} ${l}` : l)).join("\n") + "\n");
  },
};

export const fileCommands: Command[] = [ls, cd, pwd, tree, cat, headTail("head"), headTail("tail"), wc, grep, find, mkdir, touch, rm, mv, cp, echo, sort, uniq];

// used by other command files
export { humanSize };
