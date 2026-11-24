type Tr = (s: string, v?: Record<string, string | number>) => string;
const plain: Tr = (s, v) => s.replace(/\{(\w+)\}/g, (_, k: string) => String(v?.[k] ?? ""));

/**
 * An encrypted vault that opens with files its index didn't know (a crash between a
 * file and the index, a copy from another computer): store.rs puts each one back in
 * `.trash/recovered-<time>/`, and its note says "recovered <path>". Until 0.8.1 only
 * `vault status` showed it. The deck now says it once, with the folder to look in.
 * `told`: the notes already said (they're added to it).
 */
export function recoveredMessage(notes: string[], told: Set<string>, tr: Tr = plain): string | null {
  const fresh = notes.filter((n) => n.startsWith("recovered ") && !told.has(n));
  if (!fresh.length) return null;
  for (const n of fresh) told.add(n);
  const folder = fresh[0].slice("recovered ".length).match(/^\.trash\/recovered-[^/]+/)?.[0] ?? ".trash";
  return fresh.length === 1
    ? tr("a file the vault didn't list was found and put back in {folder}/ — look there (vault status)", { folder })
    : tr("{n} files the vault didn't list were found and put back in {folder}/ — look there (vault status)", { n: fresh.length, folder });
}
