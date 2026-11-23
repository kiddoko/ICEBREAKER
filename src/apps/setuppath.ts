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

/** What the folder typed for the vault is, on this disk. */
export type FolderCheck =
  /** fine: new, empty, notes only, or already a vault */
  | { kind: "ok" }
  /** not even its disk / top folder exists (Q:\ on a PC without a Q drive) */
  | { kind: "missing"; root: string }
  /** a folder already full of other things (Documents, the home folder, a disk): `count` things in it */
  | { kind: "full"; count: number };

type Listing = (dir: string) => Promise<{ name: string; isDir: boolean }[]>;

/** the folder that holds `p` ("" at the top of a disk) */
function parentOf(p: string): string {
  const cut = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
  if (cut < 0) return "";
  const up = p.slice(0, cut);
  // C:\x → C:\ ; /x → /
  if (/^[a-zA-Z]:$/.test(up)) return up + p[cut];
  return up || p[cut];
}

/**
 * Look at the folder typed for the vault before using it (setup, `vault mount`): a drive that
 * isn't there was accepted without a word, and so was all of Documents (encrypting it then would
 * have wrapped every file in it). `home` replaces a leading ~.
 */
export async function checkVaultFolder(typed: string, home: string, list: Listing): Promise<FolderCheck> {
  let p = typed.trim().replace(/[\\/]+$/, "") || typed.trim();
  if (/^[a-zA-Z]:$/.test(p)) p += "\\"; // the top of a disk keeps its separator (C: alone is "where you are on C")
  if (p.startsWith("~") && home) p = home.replace(/[\\/]+$/, "") + p.slice(1);
  const tryList = async (d: string) => {
    try {
      return await list(d);
    } catch {
      return null;
    }
  };
  const here = await tryList(p);
  if (!here) {
    // a new folder: its nearest existing parent must exist (else the disk itself is missing)
    let up = parentOf(p);
    while (up) {
      if (await tryList(up)) return { kind: "ok" };
      const next = parentOf(up);
      if (next === up) break;
      up = next;
    }
    const root = /^[a-zA-Z]:/.test(p) ? p.slice(0, 3) : p.startsWith("\\\\") ? p.split(/[\\]/).slice(0, 4).join("\\") : "/";
    return { kind: "missing", root };
  }
  if (here.some((e) => e.name === ".icebreaker" || e.name === ".icebreaker-vault")) return { kind: "ok" };
  const shown = here.filter((e) => !e.name.startsWith("."));
  const norm = (x: string) => x.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
  const h = norm(home);
  const special = norm(p) === h || /^[a-z]:\/?$/.test(norm(p)) || norm(p) === "" || (!!h && ["documents", "desktop", "downloads", "bureau", "téléchargements"].some((n) => norm(p) === `${h}/${n}`));
  const others = shown.filter((e) => e.isDir || !/\.md$/i.test(e.name));
  if (special || others.length) return shown.length ? { kind: "full", count: shown.length } : { kind: "ok" };
  return { kind: "ok" };
}

/** Where the vault goes when a full folder gets its own "Icebreaker" folder. */
export function icebreakerInside(typed: string): string {
  const t = typed.trim().replace(/[\\/]+$/, "");
  const sep = t.includes("\\") && !t.includes("/") ? "\\" : "/";
  return `${t}${sep}Icebreaker`;
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
