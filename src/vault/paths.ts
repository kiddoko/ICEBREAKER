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

export function extname(p: string): string {
  const b = basename(p);
  const i = b.lastIndexOf(".");
  return i <= 0 ? "" : b.slice(i);
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
