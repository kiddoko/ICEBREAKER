/**
 * THEME FILE SCHEMAS (themes v2, milestone 2 — docs/THEMES_V2_PLAN.md § 2.5).
 *
 * Schema 1 is every theme written before v2: `[meta] border`, `[meta] widget_frame`, `[ascii] logo`.
 * Schema 2 (`[meta] schema = 2`) moves them into their components: `[frame] style`,
 * `[widget_frame] style`, `[logo] text`. The loader reads both — today's files keep working,
 * forever — and `upgrade1to2` is the one converter (the loader, `theme check`, the tests).
 */

/** the newest schema this deck knows */
export const SKIN_SCHEMA = 2;

type Table = Record<string, unknown>;

/** a theme document's schema: 1 when it doesn't say */
export function schemaOf(doc: Table): number {
  const s = (doc.meta as Table | undefined)?.schema;
  return typeof s === "number" && Number.isInteger(s) && s >= 1 ? s : 1;
}

/**
 * A schema-1 document as schema 2, in memory (the file on disk is never touched). Keys already
 * in their schema-2 place win; a document already at 2 or more comes back as it is.
 */
export function upgrade1to2(doc: Table): Table {
  if (schemaOf(doc) >= 2) return doc;
  const out: Table = {};
  for (const [k, v] of Object.entries(doc)) out[k] = v && typeof v === "object" && !Array.isArray(v) ? { ...(v as Table) } : v;
  const meta = (out.meta ?? {}) as Table;
  const move = (from: Table, key: string, section: string, to: string) => {
    if (from[key] === undefined) return;
    const t = ((out[section] ??= {}) as Table);
    if (t[to] === undefined) t[to] = from[key];
    delete from[key];
  };
  move(meta, "border", "frame", "style");
  move(meta, "widget_frame", "widget_frame", "style");
  const ascii = out.ascii as Table | undefined;
  if (ascii) {
    move(ascii, "logo", "logo", "text");
    if (!Object.keys(ascii).length) delete out.ascii;
  }
  out.meta = { ...meta, schema: 2 };
  return out;
}

/** what a reader of a schema-2 document asks for, wherever the file wrote it (1 or 2) */
export function frameStyle(doc: Table): unknown {
  return ((doc.frame as Table | undefined)?.style) ?? (doc.meta as Table | undefined)?.border;
}
export function widgetFrameStyle(doc: Table): unknown {
  return ((doc.widget_frame as Table | undefined)?.style) ?? (doc.meta as Table | undefined)?.widget_frame;
}
export function logoText(doc: Table): unknown {
  return ((doc.logo as Table | undefined)?.text) ?? (doc.ascii as Table | undefined)?.logo;
}

/** a notice for a file made for a newer deck (it still loads what this one understands) */
export function newerSchemaNotice(doc: Table): string | null {
  const s = schemaOf(doc);
  return s > SKIN_SCHEMA ? `made for a newer ICEBREAKER (theme schema ${s}, this deck reads ${SKIN_SCHEMA}): some of it may be ignored` : null;
}
