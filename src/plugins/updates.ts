import type { Deck } from "../deck";
import { compareVersions } from "./deps";
import { fetchText, installPlugin, rawBase } from "./install";

/**
 * Updates of the modules installed from a repo (the STORE, `plugin install`): their
 * plugin.json remembers where they came from (`source`), so the newest one is read there
 * and compared with the one in the vault. Built-in modules update with the deck itself
 * (core/appupdate.ts).
 *
 * Used by `store update` (shell), the STORE's "update" buttons and Settings → UPDATES
 * (check by itself, download by itself, ask before installing).
 */
export interface ModuleUpdate {
  id: string;
  name: string;
  have: string;
  latest: string;
  source: string;
}

/** What could be updated now (reads each module's source: network). Errors are skipped, not thrown. */
export async function checkModuleUpdates(deck: Deck): Promise<{ updates: ModuleUpdate[]; errors: string[] }> {
  const updates: ModuleUpdate[] = [];
  const errors: string[] = [];
  for (const p of deck.plugins.list().filter((x) => x.source === "vault")) {
    const id = p.manifest.id;
    let source: string | undefined;
    try {
      source = JSON.parse(await deck.vault.read(`.icebreaker/plugins/${id}/plugin.json`)).source;
    } catch {
      continue;
    }
    if (!source) continue; // written by hand in the vault: nothing to compare with
    try {
      const latest = JSON.parse(await fetchText(deck, `${rawBase(source)}plugin.json`)).version as string;
      if (latest && compareVersions(latest, p.manifest.version) > 0) updates.push({ id, name: p.manifest.name, have: p.manifest.version, latest, source });
    } catch (e) {
      errors.push(`${id}: ${e instanceof Error ? e.message : e}`);
    }
  }
  return { updates, errors };
}

/** Install the newest version of one module (from where it came), then reload the modules. */
export async function updateModule(deck: Deck, u: Pick<ModuleUpdate, "id" | "source">): Promise<string> {
  const r = await installPlugin(deck, u.source);
  // an update you accepted (or asked to be installed by itself): its new code is the approved
  // one — its permissions still can't grow without your yes
  await deck.plugins.reload(true);
  const now = deck.plugins.list().find((p) => p.manifest.id === u.id);
  // the new version asks for more than you approved: it stays off until you read and accept (plugins/host.ts)
  if (now?.error?.startsWith("asks for more") || now?.error?.startsWith("not approved")) {
    deck.notify(`${r.name}: its update ${now.error} — it's switched off until then`, "warning");
    return `${r.name} ${now.manifest.version} (off: new permissions to approve)`;
  }
  return `${r.name} ${now?.manifest.version ?? ""}`.trim();
}
