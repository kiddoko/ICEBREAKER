/**
 * File associations: the kinds of files a module opens (plugin.json `opens`).
 *
 *   "opens": ["bmed", "mod", "med"]                         its page (the one named like the module)
 *   "opens": [{ "types": ["bmed"], "page": "breakermed" }]   a given page
 *
 * A file of that kind opened from the tree, NEXUS or `open <file>` opens in that page
 * (`deck.openFile` → `PluginHost.openWith`). Two modules for one kind: you're asked once,
 * and the answer is kept (`plugins.openWith`). Notes (.md) are always the deck's.
 * Pure: tests/fileassoc.test.ts.
 */

export interface Opens {
  /** extensions, lowercase, without the dot */
  types: string[];
  /** the page (an app kind of the module) that opens them; default: the module's own page */
  page?: string;
}

export interface Handler {
  module: string;
  page?: string;
}

/** kinds no module may take: notes are the deck's */
const DECK_OWN = new Set(["md", "markdown"]);

const cleanExt = (x: unknown): string | null => {
  if (typeof x !== "string") return null;
  const e = x.trim().toLowerCase().replace(/^\./, "");
  return /^[a-z0-9]{1,10}$/.test(e) && !DECK_OWN.has(e) ? e : null;
};

/** what a manifest's `opens` says, cleaned (anything odd is dropped) */
export function readOpens(m: { id: string; opens?: unknown }): Opens[] {
  const raw = m.opens;
  if (!Array.isArray(raw)) return [];
  const out: Opens[] = [];
  const short = raw.map(cleanExt).filter((e): e is string => !!e);
  if (short.length) out.push({ types: short, page: undefined });
  for (const o of raw) {
    if (!o || typeof o !== "object" || Array.isArray(o)) continue;
    const rec = o as { types?: unknown; page?: unknown };
    const types = (Array.isArray(rec.types) ? rec.types : []).map(cleanExt).filter((e): e is string => !!e);
    if (types.length) out.push({ types, page: typeof rec.page === "string" && rec.page ? rec.page : undefined });
  }
  return out;
}

/** a path's extension, lowercase ("" when it has none) */
export function extOf(path: string): string {
  const name = path.split(/[/\\]/).pop() ?? "";
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
}

/** every module (switched on) that opens this file, in the order given */
export function handlersFor(path: string, mods: readonly { id: string; opens: readonly Opens[] }[]): Handler[] {
  const ext = extOf(path);
  if (!ext) return [];
  const out: Handler[] = [];
  for (const m of mods) {
    const o = m.opens.find((x) => x.types.includes(ext));
    if (o) out.push({ module: m.id, page: o.page });
  }
  return out;
}

/** the one to use: the only one, the one you chose before (`remembered`: ext → module), or "ask" */
export function chooseHandler(handlers: readonly Handler[], remembered: Record<string, string>, ext: string): Handler | "ask" | null {
  if (!handlers.length) return null;
  if (handlers.length === 1) return handlers[0];
  return handlers.find((h) => h.module === remembered[ext]) ?? "ask";
}
