/**
 * What the deck needs to know about the shell of a system terminal tab (shell/systerm.ts):
 * where a bridged command runs in the vault, and how a macro is said in that shell.
 * Windows pitfall (CLAUDE.md): PowerShell sends `C:\Users\me\Notes\journal`, with `\`.
 */

/** "zsh", "bash", "fish", "powershell" (pwsh too), "cmd", or the program's own name. */
export function shellFamily(name: string): string {
  const n = (name.split(/[\\/]/).pop() ?? name).replace(/\.exe$/i, "").toLowerCase();
  return n === "pwsh" ? "powershell" : n;
}

/**
 * The vault folder a command typed in a system terminal runs in ("" = the vault's root, also
 * when the terminal is outside the vault). `\` and `/` are the same; on Windows (a drive
 * letter, or `\` in the path) case doesn't count either, as for the disk.
 */
export function bridgeCwd(root: string, cwd: string): string {
  const slash = (p: string) => p.replace(/\\/g, "/").replace(/\/+$/, "");
  const r = slash(root);
  const c = slash(cwd);
  const windows = /^[a-z]:\//i.test(r) || root.includes("\\");
  const same = (a: string, b: string) => (windows ? a.toLowerCase() === b.toLowerCase() : a === b);
  if (!r || same(c, r)) return "";
  const head = c.slice(0, r.length + 1);
  return same(head, `${r}/`) ? c.slice(r.length + 1) : "";
}

/**
 * A macro as that shell says it. The macros that come with the deck are written for zsh / bash;
 * in PowerShell or cmd, `ls -la` and `mkdir -p` are errors. Those few are said the shell's way
 * (`{holes}` kept for the prompt); anything else — your own macros — goes as you wrote it.
 */
export function macroForShell(cmd: string, shell: string): string {
  const fam = shellFamily(shell);
  const table = fam === "powershell" ? POWERSHELL : fam === "cmd" ? CMD : null;
  if (!table) return cmd;
  for (const [unix, theirs] of table) {
    const m = unix.exec(cmd.trim());
    if (m) return theirs.replace(/\$(\d)/g, (_, i: string) => m[Number(i)] ?? "");
  }
  return cmd;
}

const POWERSHELL: [RegExp, string][] = [
  [/^ls -la$/, "Get-ChildItem -Force"],
  [/^mkdir -p (.+)$/, "New-Item -ItemType Directory -Force $1 | Out-Null"],
  // the deck's own commands: `ib` asks for them by name (no PowerShell look-alike in between)
  [/^touch (.+)$/, "ib touch $1"],
  [/^grep (.+)$/, "ib grep $1"],
  [/^git status -sb$/, "git status -sb"],
];

const CMD: [RegExp, string][] = [
  [/^ls -la$/, "dir /a"],
  [/^mkdir -p (.+)$/, "mkdir $1"],
  [/^touch (.+)$/, "type nul >> $1"],
  [/^grep -ril (.+) \.$/, "findstr /s /i /m $1 *"],
  [/^clear$/, "cls"],
];

/** Said once when a cmd tab starts: it has no way to ask the deck for its commands. */
export const CMD_HINT = "ICEBREAKER: cmd can't run the deck's commands (ls, grep, todo…) — they work in PowerShell (term new powershell) and in ibsh";

/** An answer put in a macro's {hole}, quoted the way that shell reads it (null: the deck's own `q`). */
export function quoteForShell(shell: string): ((v: string) => string) | null {
  const fam = shellFamily(shell);
  if (fam === "cmd") return (v) => `"${v.replace(/"/g, "")}"`;
  // PowerShell: single quotes take everything as is ('' is one ')
  if (fam === "powershell") return (v) => (/^[\w./~@:+-]+$/.test(v) ? v : `'${v.replace(/['‘’‚‛]/g, "''")}'`);
  return null;
}

/** Text cut into lines of at most `cols`, between words (a word longer than a line is cut). */
export function wrapWords(text: string, cols: number): string[] {
  const width = Math.max(10, cols);
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    for (let w = word; w; ) {
      const room = line ? width - line.length - 1 : width;
      if (w.length <= room) {
        line = line ? `${line} ${w}` : w;
        w = "";
      } else if (line) {
        lines.push(line);
        line = "";
      } else {
        lines.push(w.slice(0, width));
        w = w.slice(width);
      }
    }
  }
  if (line) lines.push(line);
  return lines;
}
