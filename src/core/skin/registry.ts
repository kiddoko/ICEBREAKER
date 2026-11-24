import { contrast, type RGB } from "../color";
import type { Field, ReadContext } from "./fields";

/**
 * THE SKIN REGISTRY (docs/THEMES_V2_PLAN.md § 2.2): every part of the interface a theme can
 * restyle is declared once, here, as a component — its fields, their bounds and defaults, and
 * the floor it must keep (§ 3). The theme loader, `theme set`, its completion, the docs and the
 * tests all read these declarations: adding a field is one line, in one place.
 */

/** the theme colours a floor rule may need (a subset of UiColors) */
export interface FloorColors {
  fg: RGB;
  panel: RGB;
  accent: RGB;
}

/**
 * A rule that stays true whatever the theme says (§ 3): checked after the theme's values are
 * read, it puts back the default of the fields that break it, and says why.
 */
export interface FloorRule<V> {
  /** the fields reset when the rule fails */
  fields: (keyof V & string)[];
  /** null when kept, or the reason (shown by the theme check) */
  check(look: V, c: FloorColors): string | null;
}

export interface Component<V extends object> {
  /** the TOML table and the first part of a `theme set` key: [keys] · keys.radius */
  id: string;
  /** the skin schema version it appeared in */
  since: number;
  label: string;
  /** the studio group it belongs to */
  group: "colors" | "type" | "shape" | "background" | "sound" | "motion";
  doc: string;
  fields: { [K in keyof V]: Field };
  floor: FloorRule<V>[];
}

export function defineComponent<V extends object>(c: Component<V>): Component<V> {
  return c;
}

/** the component's own look: every field's default */
export function defaults<V extends object>(comp: Component<V>): V {
  const out = {} as Record<string, unknown>;
  for (const [k, f] of Object.entries(comp.fields) as [string, Field][]) out[k] = f.default;
  return out as V;
}

/**
 * A complete look from a partial, already-typed one (a Theme object): what's missing is the
 * default, what's out of bounds is clamped. Never throws, never half-done.
 */
export function resolve<V extends object>(comp: Component<V>, own?: Partial<V>): V {
  const out = {} as Record<string, unknown>;
  const given = (own ?? {}) as Record<string, unknown>;
  for (const [k, f] of Object.entries(comp.fields) as [string, Field][]) out[k] = k in given && given[k] !== undefined ? f.clamp(given[k]) : f.default;
  return out as V;
}

/** one thing a theme file got wrong: the field keeps its inherited or default value */
export interface SkinProblem {
  /** "keys.radius" */
  key: string;
  reason: string;
}

/**
 * Read a component's table from a theme file (or its tweaks): only the fields it sets, checked
 * one by one. A bad value is left out (so the parent theme's or the default stays) and reported;
 * an unknown key is reported too. `inherited` is the parent's partial look.
 */
export function readTable<V extends object>(comp: Component<V>, raw: unknown, ctx: ReadContext, inherited?: Partial<V>): { look: Partial<V> | undefined; problems: SkinProblem[] } {
  const problems: SkinProblem[] = [];
  if (raw === undefined) return { look: inherited, problems };
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { look: inherited, problems: [{ key: comp.id, reason: `[${comp.id}] must be a table` }] };
  const look = { ...(inherited ?? {}) } as Record<string, unknown>;
  const fields = comp.fields as Record<string, Field>;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const f = fields[k];
    if (!f) {
      problems.push({ key: `${comp.id}.${k}`, reason: `unknown field (known: ${Object.keys(fields).join(", ")})` });
      continue;
    }
    const r = f.read(v, ctx);
    if ("error" in r) problems.push({ key: `${comp.id}.${k}`, reason: r.error });
    else look[k] = r.value;
  }
  return { look: look as Partial<V>, problems };
}

/** Apply the component's floor to a partial look: the fields of a rule it breaks go back to their default. */
export function applyFloor<V extends object>(comp: Component<V>, own: Partial<V> | undefined, c: FloorColors): { look: Partial<V> | undefined; problems: SkinProblem[] } {
  if (!own) return { look: own, problems: [] };
  const problems: SkinProblem[] = [];
  let look = own;
  for (const rule of comp.floor) {
    const why = rule.check(resolve(comp, look), c);
    if (!why) continue;
    look = { ...look };
    for (const f of rule.fields) delete (look as Record<string, unknown>)[f];
    problems.push({ key: `${comp.id}.${rule.fields.join("/")}`, reason: why });
  }
  return { look, problems };
}

/** a floor rule: two colours of the look (null = `auto(c)`) read at least `ratio`:1 */
export function contrastRule<V extends object>(fields: (keyof V & string)[], ratio: number, pick: (look: V, c: FloorColors) => [RGB, RGB]): FloorRule<V> {
  return {
    fields,
    check(look, c) {
      const [a, b] = pick(look, c);
      const r = contrast(a, b);
      return r >= ratio ? null : `contrast ${r.toFixed(1)}:1 is under ${ratio}:1 — the deck's own is kept`;
    },
  };
}
