/**
 * The setup's VAULT folder question — pure, no deck (apps/setup.ts).
 *
 * The folder typed there used to be dropped without a word: tab "skipped" the question
 * (a Linux user presses tab to complete a path), and a relative path or a failed mount
 * left the vault in the default folder. Now tab completes the folder name like a
 * terminal, and a path that can't be one is said at once.
 */

/** Why this can't be the vault's folder (null: it can). */
export function vaultPathProblem(path: string): string | null {
  const p = path.trim();
  if (!p) return "type the folder's full path (or esc: keep this folder)";
  // absolute: /…, ~ or ~/…, C:\… or C:/…, \\server\share
  if (p.startsWith("/") || p === "~" || p.startsWith("~/") || p.startsWith("~\\") || /^[a-zA-Z]:[\\/]/.test(p) || p.startsWith("\\\\")) return null;
  return "a full path, from the top: /home/you/notes, ~/notes or C:\\notes";
}

export interface Completed {
  /** the text with the folder name completed (as far as it's sure) */
  text: string;
  /** the folders it could be (more than one: tab shows them) */
  choices: string[];
}

type Lister = (dir: string) => Promise<{ name: string; isDir: boolean }[]>;

/**
 * Complete the last folder name of `typed` (tab). `home` replaces a leading ~ for the
 * listing (the text keeps its ~). null: nothing to complete.
 */
export async function completeFolder(typed: string, home: string, list: Lister): Promise<Completed | null> {
  const cut = Math.max(typed.lastIndexOf("/"), typed.lastIndexOf("\\"));
  if (cut < 0) return null;
  const dir = typed.slice(0, cut + 1);
  const prefix = typed.slice(cut + 1);
  const sep = typed[cut];
  let listed = dir.startsWith("~") && home ? home.replace(/[\\/]+$/, "") + dir.slice(1) : dir;
  // a folder is listed without its last separator, the top of a disk with it (/, C:\)
  if (listed.length > 1 && !/^[a-zA-Z]:[\\/]$/.test(listed)) listed = listed.replace(/[\\/]+$/, "") || listed;
  const entries = (await list(listed)).filter((e) => e.isDir && (prefix.startsWith(".") || !e.name.startsWith(".")));
  // the same case first; a Windows / macOS disk doesn't care about case, so then any case
  let names = entries.map((e) => e.name).filter((n) => n.startsWith(prefix));
  if (!names.length) names = entries.map((e) => e.name).filter((n) => n.toLowerCase().startsWith(prefix.toLowerCase()));
  names.sort((a, b) => a.localeCompare(b));
  if (!names.length) return null;
  if (names.length === 1) return { text: `${dir}${names[0]}${sep}`, choices: names };
  let common = names[0];
  for (const n of names) while (!n.toLowerCase().startsWith(common.toLowerCase())) common = common.slice(0, -1);
  return { text: `${dir}${common.length >= prefix.length ? common : prefix}`, choices: names };
}

/** The system the deck runs on, for the examples the setup shows. */
export type Os = "mac" | "windows" | "linux";
export function osOf(platform: string, userAgent: string): Os {
  if (/Mac|iPhone|iPad/.test(platform) || /Mac OS X/.test(userAgent)) return "mac";
  if (/Win/.test(platform) || /Windows/.test(userAgent)) return "windows";
  return "linux";
}

/** Examples of a vault folder on this system (a Mac path on Windows read like a mistake). */
export function pathExamples(os: Os): { placeholder: string; examples: string; shells: string } {
  if (os === "windows") return { placeholder: "D:\\Icebreaker", examples: "D:\\Icebreaker, C:\\Users\\you\\OneDrive\\notes, \\\\nas\\vault", shells: "PowerShell, cmd" };
  if (os === "linux") return { placeholder: "/mnt/nas/icebreaker", examples: "/mnt/nas/vault, ~/Sync/notes", shells: "bash, zsh, fish" };
  return { placeholder: "/Volumes/nas/icebreaker", examples: "/Volumes/nas/vault, ~/Sync/notes", shells: "zsh, bash" };
}
