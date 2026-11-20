// Puts the modules that ship with the deck into a checkout of the STORE's repository
// (kiddoko/icebreaker-modules), so the STORE lists every one of them:
//   node scripts/pack-store.mjs ../icebreaker-modules
// - every bundled module (plugins/<id>/): its plugin.json, its source (main.ts) and a README
//   in modules/<id>/;
// - every core package (src/plugins/core-packages.ts: NEXUS, UPLINK, JOURNAL…): an entry only
//   (their code is the deck's own);
// - index.json: those entries marked "builtin": true (installing one puts the deck's own copy
//   back — nothing is downloaded), the store's other entries kept as they are.
// Then: node scripts/check-index.mjs in the store's checkout, commit, push.
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const here = resolve(new URL("..", import.meta.url).pathname);
const store = resolve(process.argv[2] ?? "");
if (!process.argv[2] || !existsSync(join(store, "index.json"))) {
  console.error("usage: node scripts/pack-store.mjs <checkout of icebreaker-modules>");
  process.exit(1);
}
const STORE_REPO = "kiddoko/icebreaker-modules/tree/main/modules";
const DECK_SRC = "kiddoko/ICEBREAKER/tree/master/src/plugins/core-packages.ts";
const version = JSON.parse(readFileSync(join(here, "package.json"), "utf8")).version;

const entries = [];
// the bundled modules
for (const id of readdirSync(join(here, "plugins")).sort()) {
  const dir = join(here, "plugins", id);
  if (!existsSync(join(dir, "plugin.json"))) continue;
  const m = JSON.parse(readFileSync(join(dir, "plugin.json"), "utf8"));
  const out = join(store, "modules", m.id);
  mkdirSync(out, { recursive: true });
  copyFileSync(join(dir, "plugin.json"), join(out, "plugin.json"));
  copyFileSync(join(dir, "main.ts"), join(out, "main.ts"));
  writeFileSync(
    join(out, "README.md"),
    `# ${m.name}\n\n${m.description}\n\n**Ships with ICEBREAKER** (since ${version}): remove it in MODULES, put it back from the STORE —\nthe deck's own copy comes back, nothing is downloaded.\n\nThis folder is its source, to read and to learn from: \`main.ts\` uses the same \`ib\` API as\nany module (docs/PLUGINS.md in the ICEBREAKER repository).\n`,
  );
  entries.push({ id: m.id, kind: "plugin", name: m.name, description: m.description, author: "icebreaker", repo: `${STORE_REPO}/${m.id}`, version: m.version, permissions: m.permissions ?? [], ...(m.requires ? { requires: m.requires } : {}), builtin: true });
}
// the core packages: { id: "nexus", name: "NEXUS", icon: "⬡", description: "…", … }
const core = readFileSync(join(here, "src/plugins/core-packages.ts"), "utf8");
for (const [, id, name, description] of core.matchAll(/\{ id: "([a-z0-9-]+)", name: "([^"]+)", icon: "[^"]*", description: "([^"]+)"/g)) {
  entries.push({ id, kind: "plugin", name, description, author: "icebreaker", repo: DECK_SRC, version, permissions: [], builtin: true });
}

const index = JSON.parse(readFileSync(join(store, "index.json"), "utf8"));
const ids = new Set(entries.map((e) => `plugin:${e.id}`));
const kept = index.filter((e) => !e.builtin && !ids.has(`${e.kind}:${e.id}`));
writeFileSync(join(store, "index.json"), JSON.stringify([...kept, ...entries], null, 2) + "\n");
console.log(`${entries.length} built-in modules (${entries.filter((e) => e.repo.startsWith(STORE_REPO)).length} with their source) + ${kept.length} other entries → ${join(store, "index.json")}`);
