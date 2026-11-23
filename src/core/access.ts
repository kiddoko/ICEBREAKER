import type { Platform } from "../platform/types";

/**
 * THE ACCESS JOURNAL — who used which permission, when, on what. It makes permissions
 * checkable: Settings → PERMISSIONS shows each one's last use, the LOG tab has an
 * "access" filter, `plugin perms <id>` prints them.
 *
 * Local only: a file in the app's configuration folder (`access.json`, your account's),
 * never in the vault — it doesn't travel or sync. 30 days, names only: a note's path, a
 * host, a command's first word. Never what a note says.
 *
 * An encrypted vault hides its notes' names on the disk too: the file then keeps who used
 * `vault:read` / `vault:write` and when, but not on which note (the LOG tab and Settings
 * still show the names, from memory, until you quit).
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
/** more than this many different things by one module with one permission in a minute: one line that counts */
const BURST = 12;
const BURST_MS = 60_000;

export class AccessLog {
  list: Access[] = [];
  /** called for each new line (the deck writes it in the LOG) */
  onAdd: (a: Access) => void = () => {};
  private last = new Map<string, number>();
  private recent = new Map<string, number>();
  /** by who|perm: the minute's count, and the line that says "+N more" */
  private bursts = new Map<string, { since: number; count: number; more?: Access; n: number }>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private loaded = false;

  /**
   * `hideNames`: is the vault encrypted? Then the file never gets a note's name
   * (access.json is in the app's configuration folder, outside the encrypted vault).
   */
  constructor(
    private readonly platform: Pick<Platform, "config"> | null,
    private readonly hideNames: () => Promise<boolean> = async () => false,
  ) {}

  /** What goes into access.json: with `hide`, the vault lines without the note's name. */
  static forDisk(list: Access[], hide: boolean): Access[] {
    return hide ? list.map((a) => (a.perm.startsWith("vault") && a.what && !a.what.startsWith("+") ? { ...a, what: "" } : a)) : list;
  }

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
    // a burst (a module reading a whole folder): the first ones by name, then one line that counts
    const bk = `${who}|${perm}`;
    let b = this.bursts.get(bk);
    if (!b || now - b.since > BURST_MS) this.bursts.set(bk, (b = { since: now, count: 0, n: 0 }));
    if (++b.count > BURST) {
      b.n++;
      if (b.more) b.more.what = `+${b.n} more`;
      else {
        b.more = { at: now, who, perm, what: `+${b.n} more` };
        this.list.push(b.more);
        this.onAdd(b.more);
      }
      return this.save();
    }
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
    this.timer = setTimeout(async () => {
      const now = Date.now();
      this.list = this.list.filter((a) => now - a.at < KEEP_MS);
      // can't tell whether the vault is encrypted: the names stay out
      const hide = await this.hideNames().catch(() => true);
      void this.platform!.config.write("access.json", JSON.stringify(AccessLog.forDisk(this.list, hide))).catch(() => {});
    }, 2000);
  }
}
