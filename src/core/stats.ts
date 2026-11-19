/**
 * STATS — numbers that modules (and the user) keep over time: "budget left",
 * "pages read", "focus minutes", "commands run"… Any module writes its own
 * stats through `ib.stats` and can read everyone's (permission "stats:read"
 * for other modules' stats). The STATS module shows them; this store lives
 * in the core so modules can record even while the STATS module is off.
 *
 * Kept in the vault, in .icebreaker/stats.json: one value per stat plus one
 * number per day (the last value of the day for a "value", the day's total
 * for a "counter"), so `series` can draw a history without a database.
 *
 * Ids are "<module>.<name>": "budget.left", "deck.commands", "stats.weight".
 */
import type { Vault } from "../vault/vault";

export type StatKind = "value" | "counter";

export interface StatMeta {
  /** human name, "budget left" */
  label?: string;
  /** "€", "kg", "min"… shown after the value */
  unit?: string;
  /** "value" (a level: the last write wins) or "counter" (adds up, per day) */
  kind?: StatKind;
  /** digits after the dot (default: 0 for counters, up to 2 for values) */
  decimals?: number;
}

export interface Stat extends Required<Omit<StatMeta, "decimals">> {
  id: string;
  decimals?: number;
  /** the module that owns it */
  source: string;
  value: number;
  /** ISO date-time of the last change */
  updated: string;
  /** "YYYY-MM-DD" → that day's value (last value, or the day's total for counters) */
  days: Record<string, number>;
}

export interface StatPoint {
  day: string;
  value: number;
}

const FILE = ".icebreaker/stats.json";
/** days of history kept per stat */
const KEEP_DAYS = 400;

const pad = (n: number) => String(n).padStart(2, "0");
export const dayKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function formatStat(s: Pick<Stat, "value" | "unit" | "kind" | "decimals">, value = s.value): string {
  const dec = s.decimals ?? (s.kind === "counter" ? 0 : Number.isInteger(value) ? 0 : 2);
  const n = value.toLocaleString(undefined, { maximumFractionDigits: dec, minimumFractionDigits: s.decimals ?? 0 });
  return s.unit ? `${n} ${s.unit}` : n;
}

export class StatsStore {
  private stats = new Map<string, Stat>();
  private loaded: Promise<void> | null = null;
  /** the vault the cache belongs to (another vault mounted → read again) */
  private loadedFor = "";
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private listeners = new Set<(id: string) => void>();

  constructor(private readonly vault: Vault) {}

  /** Read the file once (every method waits for it). */
  ready(): Promise<void> {
    // no vault yet: nothing to read, and nothing cached (it would hide the file)
    if (!this.vault.root) return Promise.resolve();
    if (this.loadedFor !== this.vault.root) {
      this.loaded = null;
      this.stats.clear();
    }
    if (!this.loaded) {
      this.loadedFor = this.vault.root;
      this.loaded = (async () => {
        let text = "";
        try {
          if (await this.vault.exists(FILE)) {
            text = await this.vault.read(FILE);
            const data = JSON.parse(text) as { stats?: Record<string, Stat> };
            for (const [id, s] of Object.entries(data.stats ?? {})) this.stats.set(id, { ...s, id });
          }
        } catch {
          // a broken file starts empty and is rewritten on the next change: keep a copy first
          if (text) await this.vault.write(`${FILE}.broken`, text).catch(() => {});
        }
      })();
    }
    return this.loaded;
  }

  onChange(fn: (id: string) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Sync, after ready(): everything, sorted by id. */
  all(): Stat[] {
    return [...this.stats.values()].sort((a, b) => a.id.localeCompare(b.id));
  }

  peek(id: string): Stat | null {
    return this.stats.get(id) ?? null;
  }

  async get(id: string): Promise<Stat | null> {
    await this.ready();
    return this.peek(id);
  }

  async list(prefix?: string): Promise<Stat[]> {
    await this.ready();
    return this.all().filter((s) => !prefix || s.id.startsWith(prefix));
  }

  /** Create or describe a stat (label, unit, kind). Values are kept. */
  async define(id: string, meta: StatMeta, source: string): Promise<Stat> {
    await this.ready();
    const s = this.ensure(id, source, meta.kind ?? "value");
    if (meta.label !== undefined) s.label = meta.label;
    if (meta.unit !== undefined) s.unit = meta.unit;
    if (meta.kind !== undefined) s.kind = meta.kind;
    if (meta.decimals !== undefined) s.decimals = meta.decimals;
    this.changed(id);
    return s;
  }

  /** Set the current value (a "value" stat: today's point becomes this). */
  async set(id: string, value: number, source: string, meta?: StatMeta): Promise<Stat> {
    await this.ready();
    if (!Number.isFinite(value)) throw new Error(`stats: ${id}: not a number`);
    const s = this.ensure(id, source, meta?.kind ?? "value");
    if (meta) Object.assign(s, Object.fromEntries(Object.entries(meta).filter(([, v]) => v !== undefined)));
    s.value = value;
    s.days[dayKey()] = value;
    this.changed(id);
    return s;
  }

  /** Add to a stat (default +1). Counters add to today's total too. */
  async add(id: string, delta: number, source: string, meta?: StatMeta): Promise<Stat> {
    await this.ready();
    if (!Number.isFinite(delta)) throw new Error(`stats: ${id}: not a number`);
    const s = this.ensure(id, source, meta?.kind ?? "counter");
    if (meta) Object.assign(s, Object.fromEntries(Object.entries(meta).filter(([, v]) => v !== undefined)));
    s.value += delta;
    const k = dayKey();
    s.days[k] = s.kind === "counter" ? (s.days[k] ?? 0) + delta : s.value;
    this.changed(id);
    return s;
  }

  /**
   * One point per day for the last `days` days (oldest first). Days without
   * a write are 0 for counters and carry the previous value for values.
   */
  async series(id: string, days = 30): Promise<StatPoint[]> {
    await this.ready();
    return this.seriesNow(id, days);
  }

  seriesNow(id: string, days = 30): StatPoint[] {
    const s = this.stats.get(id);
    if (!s) return [];
    const out: StatPoint[] = [];
    const known = Object.keys(s.days).sort();
    const today = new Date();
    let carry = 0;
    const start = dayKey(new Date(today.getFullYear(), today.getMonth(), today.getDate() - days + 1));
    for (const k of known) if (k < start) carry = s.days[k];
    for (let i = days - 1; i >= 0; i--) {
      const k = dayKey(new Date(today.getFullYear(), today.getMonth(), today.getDate() - i));
      const v = s.days[k];
      if (v !== undefined) carry = v;
      out.push({ day: k, value: v ?? (s.kind === "counter" ? 0 : carry) });
    }
    return out;
  }

  async remove(id: string): Promise<boolean> {
    await this.ready();
    const had = this.stats.delete(id);
    if (had) this.changed(id);
    return had;
  }

  private ensure(id: string, source: string, kind: StatKind): Stat {
    if (!/^[a-z0-9][\w-]*\.[\w.-]+$/i.test(id)) throw new Error(`stats: "${id}" isn't a stat id (module.name)`);
    let s = this.stats.get(id);
    if (!s) {
      s = { id, source, label: id.slice(id.indexOf(".") + 1).replace(/[._-]/g, " "), unit: "", kind, value: 0, updated: new Date().toISOString(), days: {} };
      this.stats.set(id, s);
    }
    return s;
  }

  private changed(id: string): void {
    const s = this.stats.get(id);
    if (s) {
      s.updated = new Date().toISOString();
      const keys = Object.keys(s.days).sort();
      for (const k of keys.slice(0, Math.max(0, keys.length - KEEP_DAYS))) delete s.days[k];
    }
    for (const fn of this.listeners) fn(id);
    if (this.saveTimer) clearTimeout(this.saveTimer);
    // many small writes (a counter on every command) → one file write
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      void this.flush();
    }, 1500);
  }

  async flush(): Promise<void> {
    if (!this.loaded || this.loadedFor !== this.vault.root) return;
    const stats = Object.fromEntries(this.all().map((s) => [s.id, s]));
    try {
      await this.vault.write(FILE, JSON.stringify({ version: 1, stats }, null, 1));
    } catch {
      /* no vault (yet): kept in memory */
    }
  }
}

/** ▁▂▃▄▅▆▇█ — one glyph per point, scaled between the series' min and max. */
export function sparkline(values: number[], width = values.length): string {
  const v = values.slice(-width);
  if (!v.length) return "";
  const bars = "▁▂▃▄▅▆▇█";
  const lo = Math.min(...v), hi = Math.max(...v);
  return v.map((x) => (hi === lo ? (x === 0 ? bars[0] : bars[3]) : bars[Math.round(((x - lo) / (hi - lo)) * 7)])).join("");
}
