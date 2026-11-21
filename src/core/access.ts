import type { Platform } from "../platform/types";

/**
 * THE ACCESS JOURNAL — who used which permission, when, on what. It makes permissions
 * checkable: Settings → PERMISSIONS shows each one's last use, the LOG tab has an
 * "access" filter, `plugin perms <id>` prints them.
 *
 * Local only: a file in the app's configuration folder (`access.json`, your account's),
 * never in the vault — it doesn't travel or sync. 30 days, names only: a note's path, a
 * host, a command's first word. Never what a note says.
 */
export interface Access {
  at: number;
  /** a module's id, "ai", "terminal" */
  who: string;
  /** the permission's base name ("vault:read") */
  perm: string;
  /** a note's path, a host, a command's first word */
  what: string;
}

const KEEP_MS = 30 * 86_400_000;
const MAX = 4000;
/** the same thing again within this long is one line */
const SAME_MS = 10 * 60_000;

export class AccessLog {
  list: Access[] = [];
  /** called for each new line (the deck writes it in the LOG) */
  onAdd: (a: Access) => void = () => {};
  private last = new Map<string, number>();
  private recent = new Map<string, number>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private loaded = false;

  constructor(private readonly platform: Pick<Platform, "config"> | null) {}

  /** Read the file (once logged in). What's older than 30 days is dropped. */
  async load(): Promise<void> {
    this.loaded = true;
    try {
      const raw = JSON.parse((await this.platform?.config.read("access.json")) ?? "[]") as unknown;
      const now = Date.now();
      const old = Array.isArray(raw) ? raw.filter((a): a is Access => !!a && typeof a === "object" && typeof (a as Access).at === "number" && typeof (a as Access).who === "string" && typeof (a as Access).perm === "string" && typeof (a as Access).what === "string" && now - (a as Access).at < KEEP_MS) : [];
      // what was noted before the file was read (the first moments of a start) comes after
      this.list = [...old, ...this.list].slice(-MAX);
    } catch {
      /* a broken journal is an empty one */
    }
    this.last.clear();
    for (const a of this.list) this.last.set(`${a.who}|${a.perm}`, a.at);
  }

  /** One use. `what` is a name (a path, a host, a command's first word), cut to a sane length. */
  note(who: string, perm: string, what = ""): void {
    const now = Date.now();
    const name = String(what).replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, 160);
    this.last.set(`${who}|${perm}`, now);
    const key = `${who}|${perm}|${name}`;
    const before = this.recent.get(key);
    if (before !== undefined && now - before < SAME_MS) return;
    this.recent.set(key, now);
    if (this.recent.size > 2000) for (const [k, at] of this.recent) if (now - at >= SAME_MS) this.recent.delete(k);
    const a: Access = { at: now, who, perm, what: name };
    this.list.push(a);
    if (this.list.length > MAX) this.list.splice(0, this.list.length - MAX);
    this.onAdd(a);
    this.save();
  }

  /** When `who` last used `perm` (ms since 1970), or undefined. */
  lastUse(who: string, perm: string): number | undefined {
    return this.last.get(`${who}|${perm}`);
  }

  /** The lines about one module (or everyone), newest first. */
  of(who?: string, limit = 50): Access[] {
    const out = who ? this.list.filter((a) => a.who === who) : this.list;
    return out.slice(-limit).reverse();
  }

  /** Forget everything (or one module's lines). */
  clear(who?: string): void {
    this.list = who ? this.list.filter((a) => a.who !== who) : [];
    this.last.clear();
    for (const a of this.list) this.last.set(`${a.who}|${a.perm}`, a.at);
    this.save();
  }

  private save(): void {
    if (!this.platform || !this.loaded) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      const now = Date.now();
      this.list = this.list.filter((a) => now - a.at < KEEP_MS);
      void this.platform!.config.write("access.json", JSON.stringify(this.list)).catch(() => {});
    }, 2000);
  }
}
