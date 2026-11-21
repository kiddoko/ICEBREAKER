import { strWidth, truncate } from "../core/unicode";
/**
 * Vault paths are POSIX-style and relative to the vault root:
 * "journal/2026-11-17.md". The empty string is the root itself.
 */

/** Resolve "..", "." and duplicate slashes. Never goes above the root. */
export function normalize(p: string): string {
  const out: string[] = [];
  for (const part of p.replace(/\\/g, "/").split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") out.pop();
    else out.push(part);
  }
  return out.join("/");
}

/**
 * Resolve `p` against the current directory, shell-style:
 *   "/x" and "~/x" are relative to the vault root, anything else to `cwd`.
 */
export function resolvePath(cwd: string, p: string): string {
  if (p === "~" || p === "/") return "";
  if (p.startsWith("~/")) return normalize(p.slice(2));
  if (p.startsWith("/")) return normalize(p);
  return normalize(cwd ? `${cwd}/${p}` : p);
}

/**
 * A name as the disk may see it: macOS and Windows hold ".ICEBREAKER" and ".icebreaker"
 * as ONE folder, Windows drops trailing dots and spaces, some disks ignore invisible
 * characters. Two names with the same fold may be the same file — compare folds, never
 * the names as typed, when a path must NOT be one of the deck's own.
 */
export function foldName(name: string): string {
  return name
    .normalize("NFC")
    .replace(/[\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/g, "")
    .toLowerCase()
    .replace(/:.*$/, "") // Windows: "name:stream" is the file "name"
    .replace(/[. ]+$/, "");
}

/**
 * Why a NEW file or folder can't have this name (null: it can): control characters (an
 * escape sequence in a name repaints a terminal that lists it), characters that reverse
 * the reading direction ("‮gnp.exe" shows as "exe.png"), line breaks. Names that already
 * exist on the disk are still read, moved and trashed.
 */
export function newNameProblem(path: string): string | null {
  for (const part of normalize(path).split("/")) {
    if (/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/.test(part)) return "a name can't hold control characters or line breaks";
    if (/[\u202a-\u202e\u2066-\u2069]/.test(part)) return "a name can't hold characters that reverse the reading direction";
    if (part.length > 255) return "a name can't be longer than 255 characters";
  }
  return null;
}

/** Is this path in the deck's own folder (.icebreaker/: modules' code, scripts, themes, settings)? */
export function isDeckPath(p: string): boolean {
  const first = normalize(p).split("/")[0] ?? "";
  const f = foldName(first);
  // "ICEBRE~1": the short name Windows may give that folder
  return f === ".icebreaker" || /^\.?icebre~\d+$/.test(f);
}

export function join(...parts: string[]): string {
  return normalize(parts.filter(Boolean).join("/"));
}

export function dirname(p: string): string {
  const i = p.lastIndexOf("/");
  return i === -1 ? "" : p.slice(0, i);
}

export function basename(p: string, ext?: string): string {
  const b = p.slice(p.lastIndexOf("/") + 1);
  return ext && b.endsWith(ext) ? b.slice(0, -ext.length) : b;
}

/** How the shell shows a path: "~" for the root, "~/journal" for a folder. */
export function display(p: string): string {
  return p ? `~/${p}` : "~";
}

/** "My Big Idea!" → "my-big-idea" */
export function slugify(title: string): string {
  return (
    title
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9぀-ヿ一-鿿]+/g, "-")
      .replace(/^-+|-+$/g, "") || "untitled"
  );
}

/** Simple glob → RegExp (* and ? only, within one path segment). */
export function globToRegex(glob: string): RegExp {
  const re = glob.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*").replace(/\?/g, "[^/]");
  return new RegExp(`^${re}$`, "i");
}

/** YYYY-MM-DD in local time. */
export function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** A path that fits `max` columns: its start and its last part kept, the middle cut (/a/b/…/name.md). */
export function middlePath(p: string, max: number): string {
  if (strWidth(p) <= max) return p;
  const name = p.slice(p.lastIndexOf("/") + 1);
  const keep = max - strWidth(name) - 2; // "…/"
  if (keep < 2) return truncate(name, Math.max(4, max), "…");
  return `${truncate(p.slice(0, p.length - name.length), keep, "")}…/${name}`;
}
