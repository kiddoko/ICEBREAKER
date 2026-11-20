/**
 * What a module needs (plugin.json `requires`):
 *
 *   "requires": { "todo": ">=0.1.0", "stats": "*", "icebreaker": ">=0.4.0" }
 *
 * - another module, by its id, with the lowest version that works ("*": any);
 * - `icebreaker`: the deck itself (a module written for a newer deck says so).
 *
 * The rules (host.ts and the `plugin` / `store` commands follow them):
 * - installing a module installs what it needs first (from the STORE, after asking);
 * - switching one on switches on what it needs first; a need that isn't installed
 *   keeps it off, with the command that fixes it;
 * - switching off or removing a module others need asks first, and takes them along;
 * - at start-up, modules wake up after what they need (`ib.modules.call` works in
 *   `activate`).
 * Pure functions: tests/deps.test.ts.
 */

export type Requires = Record<string, string>;

/** "1.2.3" → [1, 2, 3] (missing parts are 0, anything after a "-" ignored) */
function parts(v: string): number[] {
  return v
    .split("-")[0]
    .split(".")
    .map((x) => Number.parseInt(x, 10) || 0)
    .concat([0, 0, 0])
    .slice(0, 3);
}

export function compareVersions(a: string, b: string): number {
  const x = parts(a), y = parts(b);
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
  return 0;
}

/** Does `version` meet `range`? "*" / "" any · ">=1.2" · "1.2.0" (that one or newer: the same as >=) */
export function satisfies(version: string, range: string): boolean {
  const r = (range ?? "").trim();
  if (!r || r === "*" || r === "latest") return true;
  return compareVersions(version, r.replace(/^>=?\s*|^\^|^~/, "")) >= 0;
}

export interface Need {
  id: string;
  range: string;
  /** the version there is, if any */
  have?: string;
  /** "missing" (not installed) · "old" (too old) · "off" (installed, switched off) */
  problem: "missing" | "old" | "off";
}

export interface ModuleState {
  version: string;
  active: boolean;
}

/** What `requires` lacks, given the modules there are (`icebreaker` = the deck's version). */
export function unmet(requires: Requires | undefined, there: Map<string, ModuleState>, deckVersion: string): Need[] {
  const out: Need[] = [];
  for (const [id, range] of Object.entries(requires ?? {})) {
    if (id === "icebreaker") {
      if (!satisfies(deckVersion, range)) out.push({ id, range, have: deckVersion, problem: "old" });
      continue;
    }
    const m = there.get(id);
    if (!m) out.push({ id, range, problem: "missing" });
    else if (!satisfies(m.version, range)) out.push({ id, range, have: m.version, problem: "old" });
    else if (!m.active) out.push({ id, range, have: m.version, problem: "off" });
  }
  return out;
}

/** One line a person reads: "todo (not installed) · stats ≥ 0.2.0 (0.1.0 here)". */
export function describeNeeds(needs: Need[]): string {
  return needs
    .map((n) => {
      const want = n.range && n.range !== "*" ? ` ≥ ${n.range.replace(/^>=?\s*/, "")}` : "";
      const name = n.id === "icebreaker" ? "ICEBREAKER" : n.id;
      return `${name}${want} (${n.problem === "missing" ? "not installed" : n.problem === "off" ? "switched off" : `${n.have} here`})`;
    })
    .join(" · ");
}

/** The ids a module needs (not the deck), in the order they should wake up, deepest first; cycles are cut. */
export function wakeOrder(ids: string[], requiresOf: (id: string) => Requires | undefined): string[] {
  const out: string[] = [];
  const state = new Map<string, "visiting" | "done">();
  const visit = (id: string) => {
    if (state.get(id)) return; // done, or a cycle: cut here
    state.set(id, "visiting");
    for (const dep of Object.keys(requiresOf(id) ?? {})) if (dep !== "icebreaker" && ids.includes(dep)) visit(dep);
    state.set(id, "done");
    out.push(id);
  };
  for (const id of ids) visit(id);
  return out;
}

/** Who needs `id` among `active` modules (directly or through another), nearest first. */
export function dependents(id: string, active: string[], requiresOf: (id: string) => Requires | undefined): string[] {
  const out: string[] = [];
  const queue = [id];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const m of active) if (!out.includes(m) && m !== id && Object.keys(requiresOf(m) ?? {}).includes(cur)) (out.push(m), queue.push(m));
  }
  return out;
}
