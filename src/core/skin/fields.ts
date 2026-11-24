import { hex, type RGB } from "../color";

/**
 * THE FIELDS a theme component is made of (docs/THEMES_V2_PLAN.md § 2.2). A field says, once:
 * its type, its bounds, its default and one line of help. Everything else is derived from that —
 * the clamp the drawing code reads, the check of a theme file, `theme set` completion, the docs.
 */

/** where a field's value came from a theme file: what it can refer to */
export interface ReadContext {
  /** the theme's [palette]: a colour field may name one of these */
  palette: Record<string, RGB>;
}

/** reading a raw value from a file: the value, or why it's refused (the field then keeps its default) */
export type Read<T> = { value: T } | { error: string };

interface FieldBase<T> {
  doc: string;
  default: T;
  /** a value already typed (a theme object, a test): kept in bounds, never refused */
  clamp(v: unknown): T;
  /** a value from a theme file or a tweak (a number, a string…) */
  read(raw: unknown, ctx: ReadContext): Read<T>;
  /** what `theme set <key> <tab>` offers */
  suggest(): string[];
}

export interface NumField extends FieldBase<number> {
  kind: "number";
  min: number;
  max: number;
  /** whole numbers only (device pixels, a font weight) */
  integer: boolean;
}
export interface BoolField extends FieldBase<boolean> {
  kind: "bool";
}
/** a colour: a #hex, a [palette] name, or — when its default is null — "auto" (worked out from the theme's colours) */
export interface ColorField extends FieldBase<RGB | null> {
  kind: "color";
}
export interface ChoiceField extends FieldBase<string> {
  kind: "choice";
  options: readonly string[];
}
export type Field = NumField | BoolField | ColorField | ChoiceField;

const toNumber = (raw: unknown): number => (typeof raw === "number" ? raw : typeof raw === "string" && raw.trim() !== "" ? Number(raw.trim().replace(/%$/, "")) : NaN);

function numberField(min: number, max: number, def: number, doc: string, integer: boolean): NumField {
  const clamp = (v: unknown): number => {
    const n = typeof v === "number" && Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : def;
    return integer ? Math.round(n) : n;
  };
  return {
    kind: "number", min, max, integer, default: def, doc, clamp,
    read(raw) {
      const n = toNumber(raw);
      return Number.isFinite(n) ? { value: clamp(n) } : { error: `expected a number from ${min} to ${max}` };
    },
    suggest() {
      const steps = 4, out = new Set<string>();
      for (let i = 0; i <= steps; i++) out.add(String(clamp(+(min + ((max - min) * i) / steps).toFixed(2))));
      return [...out];
    },
  };
}

/** a number kept between `min` and `max` */
export const num = (min: number, max: number, def: number, doc: string): NumField => numberField(min, max, def, doc, false);
/** a whole number kept between `min` and `max` */
export const int = (min: number, max: number, def: number, doc: string): NumField => numberField(min, max, def, doc, true);

const TRUE = ["true", "on", "yes", "1"], FALSE = ["false", "off", "no", "0"];
export function bool(def: boolean, doc: string): BoolField {
  return {
    kind: "bool", default: def, doc,
    clamp: (v) => (typeof v === "boolean" ? v : def),
    read(raw) {
      if (typeof raw === "boolean") return { value: raw };
      const s = String(raw).trim().toLowerCase();
      if (TRUE.includes(s)) return { value: true };
      if (FALSE.includes(s)) return { value: false };
      return { error: "expected on or off" };
    },
    suggest: () => ["on", "off"],
  };
}

export function color(def: RGB | null, doc: string): ColorField {
  return {
    kind: "color", default: def, doc,
    clamp: (v) => ((v === null && def === null) || (typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 0xffffff) ? v : def),
    read(raw, ctx) {
      const s = String(raw).trim();
      if ((s === "" || s === "auto") && def === null) return { value: null };
      if (s === "" || s === "auto") return { value: def };
      if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(s)) return { value: hex(s) };
      if (s in ctx.palette) return { value: ctx.palette[s] };
      return { error: `"${s}": not a #hex colour${def === null ? ", a [palette] name, nor auto" : " nor a [palette] name"}` };
    },
    suggest: () => (def === null ? ["auto"] : ["#" + def.toString(16).padStart(6, "0")]),
  };
}

export function choice(options: readonly string[], def: string, doc: string): ChoiceField {
  return {
    kind: "choice", options, default: def, doc,
    clamp: (v) => (typeof v === "string" && options.includes(v) ? v : def),
    read(raw) {
      const s = String(raw).trim().toLowerCase();
      return options.includes(s) ? { value: s } : { error: `one of ${options.join(", ")}` };
    },
    suggest: () => [...options],
  };
}
