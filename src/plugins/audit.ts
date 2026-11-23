import { t } from "../core/i18n";
/**
 * READ A MODULE BEFORE IT RUNS. Modules from the vault or the STORE run in a sandbox
 * (docs/SANDBOX.md). This is a second look, before you switch one on: it searches the
 * module's code for what a well-behaved module never needs — reaching for the native
 * side, building code at run time, touching the page or the network directly — and
 * the deck shows what it found.
 *
 *   plugin audit <id>      the same report in the shell
 *
 * It's a guard rail, not a proof: code can hide what it does. A module with a
 * red finding should be read, line by line, before it's trusted.
 */
export interface AuditFinding {
  level: "danger" | "warning";
  /** what it means, in plain words */
  what: string;
  /** the first line where it was seen (1-based) */
  line: number;
  /** that line, shortened */
  excerpt: string;
}

const RULES: { level: AuditFinding["level"]; re: RegExp; what: string }[] = [
  { level: "danger", re: /__TAURI|@tauri-apps|\binvoke\s*\(|ipc\.localhost|\bipc:/, what: "talks to the native side directly — around the permissions you grant" },
  { level: "danger", re: /\beval\s*\(|new\s+Function\s*\(|\bFunction\s*\(\s*["'`]/, what: "builds and runs code at run time (you can't read what it will do)" },
  { level: "danger", re: /\bimportScripts\s*\(|\bimport\s*\(\s*[^"'`\s)]/, what: "loads code from somewhere it computes" },
  { level: "warning", re: /\bimport\s*\(\s*["'`]https?:/, what: "loads code from the internet" },
  { level: "warning", re: /\bfetch\s*\(|XMLHttpRequest|new\s+WebSocket|navigator\.sendBeacon/, what: "goes on the network itself (not through ib.*)" },
  { level: "warning", re: /localStorage|sessionStorage|indexedDB|document\.cookie/, what: "reads or writes the deck's own browser storage" },
  { level: "warning", re: /\bdocument\.|\bwindow\.(?!setTimeout|clearTimeout|setInterval|clearInterval|requestAnimationFrame)/, what: "touches the page directly (the deck draws everything through ib.ui)" },
];

/** What a module's code does that a module shouldn't need. */
export function auditCode(code: string): AuditFinding[] {
  const lines = code.split("\n");
  const out: AuditFinding[] = [];
  for (const rule of RULES) {
    const i = lines.findIndex((l) => rule.re.test(l));
    if (i >= 0) out.push({ level: rule.level, what: rule.what, line: i + 1, excerpt: lines[i].trim().slice(0, 90) });
  }
  // minified / obfuscated: one huge line, or lots of escaped characters
  const longest = Math.max(0, ...lines.map((l) => l.length));
  const escapes = (code.match(/\\x[0-9a-f]{2}|\\u[0-9a-f]{4}/gi) ?? []).length;
  if (longest > 2000 || escapes > 200) {
    const i = lines.findIndex((l) => l.length === longest);
    out.push({ level: "warning", what: "is minified or obfuscated: hard for anyone to read before trusting it", line: i + 1, excerpt: `${longest} characters on one line · ${escapes} escaped characters` });
  }
  return out.sort((a, b) => (a.level === b.level ? a.line - b.line : a.level === "danger" ? -1 : 1));
}

/** The report as lines of text (the enable dialog, `plugin audit`). */
export function auditReport(findings: AuditFinding[]): string {
  if (!findings.length) return `✓ ${t("this quick look found nothing unusual in its code (a look, not a proof)")}`;
  return findings.map((f) => `${f.level === "danger" ? "✕" : "!"} ${t("it {what} (line {n})", { what: t(f.what), n: f.line })}`).join("\n");
}
