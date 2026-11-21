/**
 * TAB GROUPS (Refonte UI step 3, docs/FRAMES.md) — several tabs behind one chip:
 * drop a tab ON another (or `tab group 2 5`) and they make a group, `▣ research ³`;
 * hovering it lists its tabs (pick one, take it out ⇱, close it ×); it can be renamed.
 *
 * Pure data: a group is a name and the keys of its tabs (App.key), in order. The tabs
 * themselves stay where they are (Workspace.tabs); a group only changes how the strip
 * shows them — one chip, at the place of its first tab.
 */

export interface TabGroup {
  /** stable id ("g1"…) */
  id: string;
  name: string;
  /** its tabs' keys, in order (2 at least: a group of one is no group) */
  keys: string[];
  /** the key shown when the group is picked (its last one used) */
  active: string;
}

/** what the strip shows, in order: a tab on its own, or a group (at its first tab's place) */
export type StripEntry = { kind: "tab"; index: number } | { kind: "group"; group: TabGroup; indexes: number[] };

/** The group holding this key, if any. */
export function groupOf(groups: TabGroup[], key: string): TabGroup | undefined {
  return groups.find((g) => g.keys.includes(key));
}

let next = 1;
const newId = (groups: TabGroup[]) => {
  while (groups.some((g) => g.id === `g${next}`)) next++;
  return `g${next++}`;
};

/**
 * Tab `key` joins the group of tab `target` (a new group of the two when `target` has
 * none). A key already in another group leaves it first. `name`: the new group's name.
 */
export function joinGroup(groups: TabGroup[], target: string, key: string, name?: string): TabGroup[] {
  if (target === key) return groups;
  let out = takeOut(groups, key);
  const g = groupOf(out, target);
  if (g) return out.map((x) => (x === g ? { ...x, keys: [...x.keys, key], active: key } : x));
  out = [...out, { id: newId(out), name: name?.trim() || "", keys: [target, key], active: key }];
  return out;
}

/** Tab `key` out of its group (a group left with one tab dissolves). */
export function takeOut(groups: TabGroup[], key: string): TabGroup[] {
  return groups
    .map((g) => (g.keys.includes(key) ? { ...g, keys: g.keys.filter((k) => k !== key), active: g.active === key ? (g.keys.find((k) => k !== key) ?? "") : g.active } : g))
    .filter((g) => g.keys.length >= 2);
}

/** The group holding `key` renamed (an empty name: its first tab's title is shown). */
export function renameGroup(groups: TabGroup[], key: string, name: string): TabGroup[] {
  return groups.map((g) => (g.keys.includes(key) ? { ...g, name: name.trim().slice(0, 32) } : g));
}

/** The group's shown tab becomes `key`. */
export function pick(groups: TabGroup[], key: string): TabGroup[] {
  return groups.map((g) => (g.keys.includes(key) && g.active !== key ? { ...g, active: key } : g));
}

/** Only the keys still open; groups left with fewer than two tabs dissolve. */
export function prune(groups: TabGroup[], open: string[]): TabGroup[] {
  const set = new Set(open);
  let changed = false;
  const out = groups
    .map((g) => {
      const keys = g.keys.filter((k) => set.has(k));
      if (keys.length !== g.keys.length) changed = true;
      return keys.length === g.keys.length ? g : { ...g, keys, active: keys.includes(g.active) ? g.active : (keys[0] ?? "") };
    })
    .filter((g) => g.keys.length >= 2);
  return changed || out.length !== groups.length ? out : groups;
}

/** The strip, in order: each group once, at the place of its first open tab. */
export function stripEntries(groups: TabGroup[], keys: string[]): StripEntry[] {
  const out: StripEntry[] = [];
  const placed = new Set<string>();
  keys.forEach((k, i) => {
    const g = groupOf(groups, k);
    if (!g) return void out.push({ kind: "tab", index: i });
    if (placed.has(g.id)) return;
    placed.add(g.id);
    out.push({ kind: "group", group: g, indexes: g.keys.map((gk) => keys.indexOf(gk)).filter((x) => x >= 0) });
  });
  return out;
}

/** Saved groups, checked (a session from another version or computer): only sane ones kept. */
export function parseGroups(raw: unknown): TabGroup[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: TabGroup[] = [];
  for (const r of raw.slice(0, 20)) {
    if (!r || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    if (typeof o.id !== "string" || typeof o.name !== "string" || !Array.isArray(o.keys)) continue;
    // one group per id (two with the same id hid the second one's tabs)
    const gid = String(o.id).slice(0, 16);
    if (out.some((g) => g.id === gid)) continue;
    const keys = (o.keys as unknown[]).filter((k): k is string => typeof k === "string" && k.length < 500 && !seen.has(k)).slice(0, 50);
    if (keys.length < 2) continue;
    keys.forEach((k) => seen.add(k));
    out.push({ id: o.id.slice(0, 16), name: o.name.slice(0, 32), keys, active: typeof o.active === "string" && keys.includes(o.active) ? o.active : keys[0] });
  }
  return out;
}
