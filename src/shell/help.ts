import { fmt } from "../core/ansi";
import type { Command } from "./types";

/**
 * The help page of a command: what `todo -h`, `todo --help` and `man todo`
 * print. Built from the command's summary, usage, examples and man text, so
 * every command (core or module) gets one for free.
 */
export function helpText(c: Command, tty: boolean): string {
  const h = (s: string) => (tty ? fmt.bold(fmt.magenta(s)) : s);
  const d = (s: string) => (tty ? fmt.dim(s) : s);
  const out: string[] = [];
  out.push(`${tty ? fmt.bold(c.name) : c.name} — ${c.summary}${c.source && c.source !== "core" ? d(`   (module: ${c.source})`) : ""}`);
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
  return `${out.join("\n")}\n`;
}

/** `cmd -h` / `cmd --help` (alone) shows the help instead of running the command. */
export function wantsHelp(args: string[]): boolean {
  return args.length === 1 && (args[0] === "-h" || args[0] === "--help");
}
