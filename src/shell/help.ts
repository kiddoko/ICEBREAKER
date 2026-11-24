import { fmt } from "../core/ansi";
import { osKeys } from "../core/keyhints";
import { padEnd } from "../core/unicode";
import { t, tLoose } from "../core/i18n";
import type { Command } from "./types";

/**
 * The help page of a command: what `todo -h`, `todo --help` and `man todo`
 * print. Built from the command's summary, usage, examples and man text, so
 * every command (core or module) gets one for free. Key hints come out the
 * way this computer reads them (core/keyhints.ts).
 */
export function helpText(c: Command, tty: boolean): string {
  const h = (s: string) => (tty ? fmt.bold(fmt.magenta(s)) : s);
  const d = (s: string) => (tty ? fmt.dim(s) : s);
  const out: string[] = [];
  out.push(`${tty ? fmt.bold(c.name) : c.name} — ${tLoose(c.summary)}${c.source && c.source !== "core" ? d(`   (module: ${c.source})`) : ""}`);
  out.push("", h("USAGE"));
  for (const l of (c.usage ?? c.name).split("\n")) out.push(`  ${l}`);
  if (c.examples?.length) {
    out.push("", h("EXAMPLES"));
    for (const ex of c.examples) {
      const [line, what] = Array.isArray(ex) ? ex : [ex, ""];
      out.push(`  ${tty ? fmt.cyan("❯") : "$"} ${line}`);
      if (what) out.push(`    ${d(what)}`);
    }
  }
  if (c.man) {
    out.push("", h("MORE"));
    for (const l of c.man.split("\n")) out.push(`  ${l}`);
  }
  if (c.aliases?.length) out.push("", `${d("also:")} ${c.aliases.join(", ")}`);
  // key hints the way this computer's keyboard reads (⌘K on a Mac, Ctrl+K elsewhere)
  return `${osKeys(out.join("\n"))}\n`;
}

/** `cmd -h` / `cmd --help` (alone) shows the help instead of running the command. */
export function wantsHelp(args: string[]): boolean {
  return args.length === 1 && (args[0] === "-h" || args[0] === "--help");
}

/** What `help` lists alone: the commands to start with (those that exist on this deck). */
export const HELP_START = ["note", "journal", "todo", "remind", "cal", "ls", "open", "find", "launch", "theme", "ask", "settings", "modules"];

/**
 * `help` → the commands to start with and how to see more; `help all` → every command,
 * grouped (the deck's, then each module's); `help <module>` → that module's commands.
 * 130 lines at once was too many to read (B4). Hidden commands (old names) never show.
 */
export function helpList(commands: Command[], args: string[], tty: boolean): string {
  const shown = commands.filter((c) => !c.hidden);
  const h = (s: string) => (tty ? fmt.bold(fmt.magenta(s)) : s);
  const g = (s: string) => (tty ? fmt.green(s) : s);
  const d = (s: string) => (tty ? fmt.dim(s) : s);
  // the summaries in the deck's language (a module gives its French with addTranslations)
  const line = (c: Command) => `  ${g(padEnd(c.name, 12))} ${tLoose(c.summary)}`;
  const out: string[] = [];
  const what = args[0]?.toLowerCase();
  if (!what) {
    out.push(h(t("to start")));
    for (const n of HELP_START) {
      const c = shown.find((x) => x.name === n);
      if (c) out.push(line(c));
    }
    out.push("", d(t("help all       every command")), d(t("help <module>  a module's commands (help todo)")), d(t(osKeys("<command> -h   its help and examples · ⌘K / shift twice: THE MENU · F1 manual"))));
    return `${out.join("\n")}\n`;
  }
  const groups = new Map<string, Command[]>();
  for (const c of shown) {
    const k = c.source && c.source !== "core" ? t("module: {x}", { x: c.source }) : t("deck");
    (groups.get(k) ?? groups.set(k, []).get(k)!).push(c);
  }
  const pick = what === "all" ? [...groups.keys()] : [t("module: {x}", { x: what })].filter((k) => groups.has(k));
  if (!pick.length) return "";
  for (const k of pick) {
    out.push("", h(k));
    for (const c of groups.get(k)!.sort((a, b) => a.name.localeCompare(b.name))) out.push(line(c));
  }
  out.push("", d(t(osKeys("<command> -h for its help and examples (todo -h) · ⌘K / shift twice: THE MENU · F1 manual"))));
  return `${out.join("\n")}\n`;
}
