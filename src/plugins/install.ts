import type { Deck } from "../deck";
import { slugify } from "../vault/paths";

/**
 * Installing community plugins and themes straight from GitHub.
 *
 *   plugin install someone/icebreaker-pomodoro        (repo root has plugin.json + main.js)
 *   plugin install someone/repo/tree/main/plugins/x   (a sub-folder of a repo)
 *   plugin install pomodoro                           (looked up in the community index)
 *   theme install someone/icebreaker-themes/synthwave.toml
 *
 * Files are downloaded from raw.githubusercontent.com and written into the
 * vault (.icebreaker/plugins/<id>/, .icebreaker/themes/). A plugin is never
 * enabled by installing it: the user still runs `plugin enable <id>` and
 * approves its permissions.
 */

export interface IndexEntry {
  id: string;
  name: string;
  description: string;
  author: string;
  /** "user/repo" or "user/repo/tree/<branch>/<folder>" or a .toml path for themes. */
  repo: string;
  kind: "plugin" | "theme";
  /** which index it came from (filled in by fetchIndex) */
  index?: string;
  version?: string;
  permissions?: string[];
}

/** "user/repo[/tree/<branch>/<path>]", a github.com URL or a raw URL → raw base URL (ends with "/"). */
export function rawBase(src: string): string {
  let s = src.trim().replace(/^https?:\/\/(www\.)?github\.com\//, "").replace(/\.git$/, "").replace(/\/$/, "");
  if (/^https?:\/\//.test(s)) return s.endsWith("/") ? s : `${s}/`;
  const parts = s.split("/");
  if (parts.length < 2) throw new Error(`not a GitHub repo: ${src} (expected user/repo)`);
  const [user, repo, kind, branch, ...rest] = parts;
  const ref = (kind === "tree" || kind === "blob") && branch ? branch : "HEAD";
  const path = (kind === "tree" || kind === "blob") ? rest.join("/") : parts.slice(2).join("/");
  s = `https://raw.githubusercontent.com/${user}/${repo}/${ref}/${path}`;
  return s.endsWith("/") ? s : `${s}/`;
}

let deckRef: Deck | null = null;

async function get(url: string): Promise<string> {
  // desktop: through the native side (any https host, http on the local network)
  if (deckRef?.platform.netGet) return deckRef.platform.netGet(url);
  let res: Response;
  try {
    res = await fetch(url, { cache: "no-store" });
  } catch {
    throw new Error(`network error fetching ${url}`);
  }
  if (!res.ok) throw new Error(`${res.status} fetching ${url}`);
  return res.text();
}

/** "user/repo" → its index.json on GitHub; URLs stay as they are. */
export function indexUrl(src: string): string {
  const s = src.trim();
  if (/^https?:\/\//.test(s)) return s;
  return `${rawBase(s)}index.json`;
}

/** Every index: the official one, then yours. Entries know which index they came from. */
export function indexSources(deck: Deck): string[] {
  const p = deck.settings.data.plugins;
  return [p.registry, ...(p.sources ?? [])].filter(Boolean);
}

/** All entries from all indexes. Indexes that fail are reported in `errors`. */
export async function fetchAll(deck: Deck): Promise<{ entries: IndexEntry[]; errors: { source: string; error: string }[] }> {
  deckRef = deck;
  const entries: IndexEntry[] = [];
  const errors: { source: string; error: string }[] = [];
  await Promise.all(
    indexSources(deck).map(async (src) => {
      try {
        const data = JSON.parse(await get(indexUrl(src)));
        for (const e of (Array.isArray(data) ? data : data.entries ?? []) as IndexEntry[]) if (e?.id && e.repo) entries.push({ ...e, index: src });
      } catch (e) {
        errors.push({ source: src, error: e instanceof Error ? e.message : String(e) });
      }
    }),
  );
  return { entries, errors };
}

export async function fetchIndex(deck: Deck): Promise<IndexEntry[]> {
  const { entries, errors } = await fetchAll(deck);
  if (!entries.length && errors.length) throw new Error(errors.map((e) => `${e.source}: ${e.error}`).join("\n"));
  return entries;
}

async function resolve(deck: Deck, src: string, kind: IndexEntry["kind"]): Promise<string> {
  if (src.includes("/") || src.includes(":")) return src;
  const hit = (await fetchIndex(deck)).find((e) => e.kind === kind && e.id === src);
  if (!hit) throw new Error(`“${src}” isn't in the community index — use user/repo instead`);
  return hit.repo;
}

/** Download a plugin into .icebreaker/plugins/<id>/. Returns its manifest. */
export async function installPlugin(deck: Deck, src: string): Promise<{ id: string; name: string; permissions: string[]; source: string }> {
  deckRef = deck;
  const repo = await resolve(deck, src, "plugin");
  const base = rawBase(repo);
  const manifest = JSON.parse(await get(`${base}plugin.json`));
  const id = slugify(String(manifest.id ?? ""));
  if (!id || id !== manifest.id) throw new Error("plugin.json needs an \"id\" made of lowercase letters, digits and dashes");
  if (!manifest.name) throw new Error("plugin.json needs a \"name\"");
  const main = await get(`${base}${manifest.main ?? "main.js"}`);
  const dir = `.icebreaker/plugins/${id}`;
  await deck.vault.mkdir(dir);
  // remember where it came from, so `plugin update <id>` can fetch it again
  await deck.vault.write(`${dir}/plugin.json`, JSON.stringify({ ...manifest, source: repo }, null, 2));
  await deck.vault.write(`${dir}/${manifest.main ?? "main.js"}`, main);
  const readme = await get(`${base}README.md`).catch(() => null);
  if (readme) await deck.vault.write(`${dir}/README.md`, readme);
  return { id, name: manifest.name, permissions: manifest.permissions ?? [], source: repo };
}

/** Download a .toml theme into .icebreaker/themes/. Returns the file name. */
export async function installTheme(deck: Deck, src: string): Promise<string> {
  deckRef = deck;
  const repo = await resolve(deck, src, "theme");
  const url = /\.toml$/.test(repo) ? rawBase(repo).replace(/\/$/, "") : `${rawBase(repo)}theme.toml`;
  const toml = await get(url);
  if (!/^\s*name\s*=/m.test(toml)) throw new Error("that file doesn't look like an ICEBREAKER theme (no `name = …`)");
  const name = slugify(toml.match(/^\s*name\s*=\s*"([^"]+)"/m)?.[1] ?? url.split("/").pop()!.replace(/\.toml$/, ""));
  await deck.vault.mkdir(".icebreaker/themes");
  const path = `.icebreaker/themes/${name}.toml`;
  await deck.vault.write(path, toml);
  return path;
}
