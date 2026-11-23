import { missing, readPerms } from "./permissions";
import { t } from "../core/i18n";
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
  /** what it needs (its plugin.json `requires`, copied into the index so the STORE can say it before downloading) */
  requires?: Record<string, string>;
  /**
   * Ships with the deck (TODO, CALENDAR, NEXUS…): installing it puts the deck's own copy
   * back — nothing is downloaded; `repo` is where its source can be read.
   */
  builtin?: boolean;
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

/** A text file from the network, the way the STORE reads it (native on the desktop). */
export function fetchText(deck: Deck, url: string): Promise<string> {
  deckRef = deck;
  return get(url);
}

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

/** THE official STORE: its index, and the repository its reviewed modules live in. */
export const OFFICIAL_INDEX = "https://raw.githubusercontent.com/kiddoko/icebreaker-modules/main/index.json";
export const OFFICIAL_REPO = "kiddoko/icebreaker-modules/";

/**
 * Verified = listed in the official STORE **and** its code lives in the official repository
 * (modules/<id>/, where every change goes through a review) — or it ships with the deck.
 * Anything else (another index, a repo of its own, `plugin install user/repo`) is not:
 * the STORE warns before installing it (docs/COMMUNITY.md).
 */
export function isVerified(e: Pick<IndexEntry, "index" | "repo" | "builtin">): boolean {
  return !!e.builtin || (e.index === OFFICIAL_INDEX && isOfficialSource(e.repo));
}

/**
 * Does this source really point into the official repository? Decided on the address the
 * download will use (never on what the text contains: "https://evil.example/github.com/kiddoko/
 * icebreaker-modules/" is not it), and only on its default branch's modules/ folder.
 */
export function isOfficialSource(src: string): boolean {
  try {
    const base = rawBase(src);
    return base.startsWith(`https://raw.githubusercontent.com/${OFFICIAL_REPO}`) && !base.includes("..") && /^https:\/\/raw\.githubusercontent\.com\/kiddoko\/icebreaker-modules\/(HEAD|main)\//.test(base);
  } catch {
    return false;
  }
}

/** What the person reads before installing a module nobody from ICEBREAKER checked. */
export function unverifiedWarning(source: string): string {
  return [
    t("Nobody from ICEBREAKER has checked this module's code. It comes from: {s}", { s: source }),
    "",
    t("It runs in a sandbox, but with the permissions you give it, it can read or change your notes —"),
    t("and it can be buggy, or written to do harm. Install only what you trust; read its code first"),
    t("(.icebreaker/plugins/<id>/ after the download, plugin audit <id>)."),
  ].join("\n");
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
  if (!id || id !== manifest.id || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(id)) throw new Error("plugin.json needs an \"id\" made of lowercase letters, digits and dashes");
  // never the id of a module that ships with the deck (it would pass for it)
  if (deck.plugins.allBuiltins().some((p) => p.manifest.id === id)) throw new Error(`"${id}" is the id of a module that ships with the deck: this one can't take it`);
  if (manifest.permissions !== undefined && (!Array.isArray(manifest.permissions) || manifest.permissions.some((x: unknown) => typeof x !== "string"))) throw new Error("plugin.json: \"permissions\" must be a list of names");
  if (!manifest.name) throw new Error("plugin.json needs a \"name\"");
  // its code is one file next to plugin.json: a "main" with a folder in it could write anywhere in the vault
  if (manifest.main !== undefined && !/^[\w.-]+\.m?js$/.test(manifest.main)) throw new Error(`plugin.json: "main" must be a file name like main.js (got "${manifest.main}")`);
  const main = await get(`${base}${manifest.main ?? "main.js"}`);
  const dir = `.icebreaker/plugins/${id}`;
  // An update that asks for more than you approved is held: nothing is written until you
  // say yes to what's new — say no and the version you have keeps running (it used to be
  // installed anyway, and the module stayed off).
  const approved = deck.settings.data.plugins.granted?.[id];
  if (Array.isArray(approved) && (await deck.vault.exists(`${dir}/plugin.json`).catch(() => false))) {
    const asks = readPerms(manifest.permissions, !(typeof manifest.api === "number" && manifest.api >= 2)).perms;
    const more = missing(asks, approved);
    if (more.length) {
      const have = deck.plugins.list().find((p) => p.manifest.id === id)?.manifest.version ?? "?";
      const answer = await deck.askPermission({
        frame: t("AN UPDATE ASKS FOR MORE"),
        heading: `${manifest.name} · v${have} → v${manifest.version ?? "?"}`,
        facts: [isOfficialSource(repo) ? `✔ ${t("from the official STORE")}` : `⚠ ${t("not from the official STORE: {s}", { s: repo })}`],
        intro: t("The new version asks for this, on top of what you approved:"),
        lines: deck.plugins.permLines(more, manifest, more),
        body: [t("Say no and nothing changes: the version you have keeps running, with what you approved.")],
        buttons: [
          { label: t("[N]o, keep v{v}", { v: have }), value: "no", key: "n", tone: "error" },
          { label: t("[Y]es, update"), value: "yes", key: "y" },
        ],
        selected: 0,
      });
      if (answer !== "yes") throw new Error(`${manifest.name}: kept as it is (v${have}) — the update asks for more: ${more.join(", ")}`);
      // what you just approved, on top of what you had (what you took away stays taken away)
      deck.settings.set("plugins.granted", { ...(deck.settings.data.plugins.granted ?? {}), [id]: asks });
    }
  }
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
