/**
 * PERMISSIONS — what a module (or anything that isn't you) may reach, in plain words.
 * Pure: no deck, no settings. docs/PERMISSIONS.md is the page a person reads.
 *
 * A permission is a name, sometimes narrowed:
 *
 *   vault:read            read your notes            vault:read:songs/     …only that folder
 *   vault:write           change your notes          vault:write:songs/
 *   ai                    use your AI
 *   audio                 play sound
 *   media:control         drive your music player    media:files   read audio files outside the vault
 *   google-calendar       your Google Calendar       google-calendar:read  …read only
 *   stats:read            the other modules' counters
 *   system                the computer's details (programs, disks, network)
 *   notify                notify you and talk to you
 *   shell                 run the deck's commands
 *   net:api.example.com   go online, to that host only
 *   terminal              type in your real terminal
 *
 * Each has a LEVEL, which decides what you're asked and when:
 *
 *   low     listed when you switch the module on
 *   medium  listed, with a line that says what it means
 *   high    listed in the warning colour — and asked again the first time it's really used
 *   total   listed in red, the answer starts on No — and every use is shown first
 *
 * Before 0.6 there were 8 names. A module written then (no `"api": 2` in its plugin.json)
 * is read the old way: `media` is both halves, and it may notify you and run the deck's
 * commands as it always could — said in the dialog, so nothing is implied in silence.
 */

export type Level = "low" | "medium" | "high" | "total";

/** the names a plugin.json may use (a narrowed one adds `:<folder>` or `:<host>`) */
export const BASES = ["vault:read", "vault:write", "ai", "audio", "media:control", "media:files", "google-calendar", "google-calendar:read", "stats:read", "system", "notify", "shell", "net", "terminal"] as const;
export type Base = (typeof BASES)[number];

export interface PermSpec {
  level: Level;
  /** a glyph for the lists */
  icon: string;
  /** what the person reads: "Read your notes" */
  label: string;
  /** one line more, for medium and up */
  means: string;
  /** the group it's listed under */
  group: "notes" | "ai" | "sound" | "files" | "calendar" | "system" | "deck" | "internet" | "computer";
}

export const PERMS: Record<Base, PermSpec> = {
  "vault:read": { level: "medium", icon: "▤", label: "Read your notes", means: "every note and file of the vault it's allowed in — never the deck's own folder", group: "notes" },
  "vault:write": { level: "high", icon: "✎", label: "Change your notes", means: "create, change, rename and trash them (the trash and ⌘Z bring them back)", group: "notes" },
  ai: { level: "medium", icon: "◉", label: "Use your AI", means: "it asks your AI provider: your plan or your key, and what it sends goes to that provider", group: "ai" },
  audio: { level: "low", icon: "♪", label: "Play sound", means: "sound of its own, through your speakers", group: "sound" },
  "media:control": { level: "low", icon: "▶", label: "Drive your music player", means: "see what's playing; play, pause, skip", group: "sound" },
  "media:files": { level: "medium", icon: "♫", label: "Read your audio files outside the vault", means: "list and play the audio files of any folder of this computer", group: "files" },
  "google-calendar": { level: "medium", icon: "▦", label: "Your Google Calendar", means: "read and change your events", group: "calendar" },
  "google-calendar:read": { level: "medium", icon: "▦", label: "Read your Google Calendar", means: "read your events, change nothing", group: "calendar" },
  "stats:read": { level: "low", icon: "▁", label: "Read the other modules' counters", means: "the numbers STATS shows", group: "system" },
  system: { level: "medium", icon: "▤", label: "See the computer's details", means: "the busiest programs, the disks' names, the network's counters", group: "system" },
  notify: { level: "low", icon: "◆", label: "Notify you and talk to you", means: "toasts, alerts and the voice, signed with its name", group: "deck" },
  shell: { level: "medium", icon: "❯", label: "Run the deck's commands", means: "open a page, change the theme, start a timer… never what only you may do", group: "deck" },
  net: { level: "high", icon: "⇅", label: "Go online", means: "only to the hosts named — what it sends there leaves this computer", group: "internet" },
  terminal: { level: "total", icon: "⚠", label: "Type in your real terminal", means: "any command, with all your rights on this computer", group: "computer" },
};

const LEVEL_ORDER: Level[] = ["low", "medium", "high", "total"];
export const levelRank = (l: Level): number => LEVEL_ORDER.indexOf(l);

export interface Parsed {
  base: Base;
  /** a folder ("songs/") for the vault, a host for net; undefined: all of it */
  scope?: string;
}

/** a host as a permission names it: lowercase, no port, no path ("*.example.com" allowed) */
function cleanHost(h: string): string | null {
  const s = h.trim().toLowerCase();
  return /^(\*\.)?([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/.test(s) ? s : null;
}

/** a folder as a permission names it: "songs/", "notes/work/" — never "..", never the deck's own */
function cleanFolder(f: string): string | null {
  const parts = f.trim().replace(/\\/g, "/").split("/").filter(Boolean);
  if (!parts.length || parts.some((p) => p === "." || p === ".." || p.toLowerCase() === ".icebreaker")) return null;
  return parts.join("/") + "/";
}

/** One name of a plugin.json → what it is; null when it isn't a permission. */
export function parsePerm(raw: unknown): Parsed | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  if ((BASES as readonly string[]).includes(s)) return s === "net" ? null : { base: s as Base }; // "net" alone names no host
  for (const base of ["vault:read", "vault:write"] as const) {
    if (s.startsWith(base + ":")) {
      const scope = cleanFolder(s.slice(base.length + 1));
      return scope ? { base, scope } : null;
    }
  }
  if (s.startsWith("net:")) {
    const scope = cleanHost(s.slice(4));
    return scope ? { base: "net", scope } : null;
  }
  return null;
}

/** the name back from what it is */
export const permId = (p: Parsed): string => (p.scope ? `${p.base}:${p.scope}` : p.base);

/** the permissions a module had without asking before 0.6 (kept for one written then) */
export const LEGACY_IMPLIED: readonly string[] = ["notify", "shell"];

/**
 * What a plugin.json's list really asks for, in today's names, sorted and without doubles:
 * `media` is both halves; a module written before 0.6 (`legacy`) also gets what every module
 * could do then. Names that aren't permissions are returned apart (the dialog shows them).
 */
export function readPerms(list: readonly unknown[] | undefined, legacy: boolean): { perms: string[]; unknown: string[] } {
  const out = new Set<string>();
  const unknown: string[] = [];
  for (const raw of list ?? []) {
    if (raw === "media") {
      out.add("media:control").add("media:files");
      continue;
    }
    const p = parsePerm(raw);
    if (p) out.add(permId(p));
    else unknown.push(String(raw));
  }
  if (legacy) for (const p of LEGACY_IMPLIED) out.add(p);
  return { perms: sortPerms([...out]), unknown };
}

/** by level (the riskiest last), then by name */
export function sortPerms(perms: string[]): string[] {
  const rank = (p: string) => levelRank(levelOf(p));
  return [...new Set(perms)].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

/** like parsePerm, and "net" alone too (the question "may it go online?", not a name a plugin.json may use) */
const asked = (perm: string): Parsed | null => parsePerm(perm) ?? (perm === "net" ? { base: "net" } : null);

export function specOf(perm: string): PermSpec | null {
  const p = asked(perm);
  return p ? PERMS[p.base] : null;
}

export function levelOf(perm: string): Level {
  return specOf(perm)?.level ?? "total"; // what we can't name is treated as the worst
}

/** does `have` (one granted name) cover `base` on `target` (a path, a host)? */
function coversOne(have: Parsed, base: Base, target?: string): boolean {
  // the whole calendar covers reading it
  if (have.base === "google-calendar" && base === "google-calendar:read") return true;
  if (have.base !== base) return false;
  if (base === "net") {
    if (target === undefined) return true; // "may it go online at all?"
    const host = target.toLowerCase();
    const s = have.scope ?? "";
    return s.startsWith("*.") ? host === s.slice(2) || host.endsWith(s.slice(1)) : host === s;
  }
  if (have.scope === undefined || target === undefined) return true; // all of it, or "at all?"
  const path = target.replace(/\\/g, "/").replace(/^\/+/, "");
  // the folder itself, or anything in it — compared as the disk does on a Mac or Windows
  const a = path.toLowerCase(), b = have.scope.toLowerCase();
  return a.startsWith(b) || a + "/" === b;
}

/**
 * A write that never asks (gate), though its permission is a high one: a module's own autosave —
 * a `.recovery/` folder inside the folder you granted ("vault:write:songs/" → songs/.recovery/…).
 * A grant of the whole vault is no folder of its own: it still asks. BreakerMED's autosave used
 * to open the question in the middle of your work.
 */
export function quietWrite(target: string, grant: string): boolean {
  const g = parsePerm(grant);
  if (!g || g.base !== "vault:write" || !g.scope) return false;
  const path = target.replace(/\\/g, "/").replace(/^\/+/, "");
  if (path.split("/").some((p) => p === ".." || p === ".")) return false;
  return coversOne(g, "vault:write", path) && /(^|\/)\.recovery\//.test(path.slice(g.scope.length - 1));
}

/**
 * A set of granted permissions, asked the way the code asks: `has("vault:write", "songs/a.bmed")`.
 * `list` is read at every question, so a permission you take away stops working at once.
 * Without a target the question is "at all?" (a narrowed permission says yes).
 */
export class Grants {
  constructor(
    private readonly list: () => readonly string[],
    /** everything but what `list` names (a module that ships with the deck, minus what you took away) */
    private readonly allBut = false,
  ) {}

  /** the names as they are */
  names(): readonly string[] {
    return this.list();
  }

  /** every permission, but the ones you took away (`list`) */
  get everything(): boolean {
    return this.allBut;
  }

  has(perm: string, target?: string): boolean {
    const want = parsePerm(perm) ?? (perm === "net" ? { base: "net" as Base } : null);
    if (!want) return false;
    const hit = this.list().some((g) => {
      const have = parsePerm(g);
      return !!have && coversOne(have, want.base, target ?? want.scope);
    });
    return this.allBut ? !hit : hit;
  }

  /** the folders a narrowed vault permission is limited to (null: the whole vault, or none at all) */
  folders(base: "vault:read" | "vault:write"): string[] | null {
    if (this.allBut) return null;
    const mine = this.list().map(parsePerm).filter((p): p is Parsed => !!p && p.base === base);
    if (!mine.length || mine.some((p) => p.scope === undefined)) return null;
    return mine.map((p) => p.scope!);
  }
}

/** anything that answers `has` (a plain Set of names does, for the whole-vault names) */
export interface PermSet {
  has(perm: string, target?: string): boolean;
}

/**
 * What `asks` wants that `granted` doesn't cover: the lines a dialog shows as "new".
 * A narrower request is covered by a wider grant (`vault:read:songs/` by `vault:read`).
 */
export function missing(asks: readonly string[], granted: readonly string[]): string[] {
  const have = granted.map(parsePerm).filter((p): p is Parsed => !!p);
  return asks.filter((a) => {
    const p = parsePerm(a);
    if (!p) return true;
    // the whole of something is covered only by the whole; a part, by the whole or a wider part
    return !have.some((h) => (p.scope === undefined ? h.scope === undefined && coversOne(h, p.base) : coversOne(h, p.base, p.scope)));
  });
}

/** One line for a list: "✎ Change your notes → songs/". */
export function describePerm(perm: string, tr: (s: string) => string = (s) => s): { icon: string; label: string; scope: string; level: Level; means: string } {
  const p = asked(perm);
  const s = p ? PERMS[p.base] : null;
  if (!p || !s) return { icon: "?", label: perm, scope: "", level: "total", means: tr("not a permission this deck knows") };
  return { icon: s.icon, label: tr(s.label), scope: p.scope ?? "", level: s.level, means: tr(s.means) };
}

/** A list of names as one line a person reads: "Play sound, Read your notes, Change your notes → songs/". */
export function sayPerms(list: readonly unknown[] | undefined, tr: (s: string) => string = (s) => s): string {
  const { perms, unknown } = readPerms(list, false);
  return [...perms.map((p) => { const d = describePerm(p, tr); return d.scope ? `${d.label} → ${d.scope}` : d.label; }), ...unknown.map((u) => `${u} (?)`)].join(", ");
}

/**
 * Approvals written before 0.6 (`plugins.granted`, the old names) in today's: what the module
 * could do stays what it can do — `media` both halves, notifying and the deck's commands
 * as before. Returns the new list.
 */
export function migrateGranted(old: readonly unknown[]): string[] {
  return readPerms(old, true).perms;
}
