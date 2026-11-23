/**
 * WHAT THE DESKTOP LOOKED LIKE when you quit — pure, no deck (settings.session.view).
 *
 * The tabs, their groups and the frames they moved to are saved by workspace.ts
 * (saveSession); this is the rest, so a relaunch puts everything back as you left it:
 * the tree and the shell shown or hidden, the shell's height, the shell's tab, its
 * terminals, the open page (SETTINGS, STORE…) and which frame had the focus.
 *
 *   view = { tree: true, shell: false, ratio: 0.32, shellTab: "term", terms: 2, page: "settings", focus: "main" }
 *
 * Terminal tabs (`terminal:<n>`) can't keep their running shell: a new one opens in
 * their place, under a new key — `renameKeys` carries their group and frame over to it.
 */
export type ShellTabName = "term" | "ibsh" | "log";
export type FocusName = "main" | "sidebar" | "shell" | "panel";

export interface SessionView {
  /** the tree (VAULT) is shown */
  tree: boolean;
  /** the shell panel is shown */
  shell: boolean;
  /** the shell's height, as a share of the body (when it sits along the bottom) */
  ratio: number;
  /** the tab the shell panel shows */
  shellTab: ShellTabName;
  /** how many terminals the shell panel had (new ones are started for them) */
  terms: number;
  /**
   * The shell panel's tabs, in order (0.7.2): a terminal and the shell it ran, an ibsh and its
   * folder, and the names you gave them. New shells start in their place. Older views: `terms`.
   */
  shellTabs?: ShellTabSave[];
  /** which of shellTabs was shown */
  shellAt?: number;
  /** the page open over the tabs (SETTINGS, STORE, NEXUS…), if any */
  page?: string;
  /** the frame that had the focus */
  focus: FocusName;
}

const SHELL_TABS: readonly string[] = ["term", "ibsh", "log"];

export interface ShellTabSave {
  kind: "term" | "ibsh";
  /** a terminal's shell ("bash", "pwsh"; none: the login shell) */
  shell?: string;
  /** the name you gave the tab */
  name?: string;
  /** an ibsh's folder in the vault */
  cwd?: string;
}

const shortText = (v: unknown, max: number): string | undefined => (typeof v === "string" && v.length > 0 && v.length <= max ? v : undefined);

function parseShellTabs(raw: unknown): ShellTabSave[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: ShellTabSave[] = [];
  for (const it of raw.slice(0, 12)) {
    if (!it || typeof it !== "object") continue;
    const o = it as Record<string, unknown>;
    if (o.kind !== "term" && o.kind !== "ibsh") continue;
    const tab: ShellTabSave = { kind: o.kind };
    const shell = o.kind === "term" ? shortText(o.shell, 260) : undefined;
    const name = shortText(o.name, 24);
    const cwd = o.kind === "ibsh" ? shortText(o.cwd, 400) : undefined;
    if (shell) tab.shell = shell;
    if (name) tab.name = name;
    if (cwd) tab.cwd = cwd;
    out.push(tab);
  }
  return out;
}
const FOCUSES: readonly string[] = ["main", "sidebar", "shell", "panel"];

/** A saved view, checked (anything odd falls back to today's default for that part). */
export function parseView(raw: unknown): SessionView | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const ratio = typeof o.ratio === "number" && Number.isFinite(o.ratio) ? Math.max(0.15, Math.min(0.8, o.ratio)) : 0;
  return {
    tree: o.tree !== false,
    shell: o.shell !== false,
    ratio,
    shellTab: typeof o.shellTab === "string" && SHELL_TABS.includes(o.shellTab) ? (o.shellTab as ShellTabName) : "ibsh",
    terms: typeof o.terms === "number" && Number.isFinite(o.terms) ? Math.max(0, Math.min(9, Math.floor(o.terms))) : 0,
    ...(() => {
      const shellTabs = parseShellTabs(o.shellTabs);
      if (!shellTabs) return {};
      const at = typeof o.shellAt === "number" && Number.isInteger(o.shellAt) && o.shellAt >= 0 && o.shellAt < shellTabs.length ? o.shellAt : 0;
      return { shellTabs, shellAt: at };
    })(),
    page: typeof o.page === "string" && o.page.length < 100 ? o.page : undefined,
    focus: typeof o.focus === "string" && FOCUSES.includes(o.focus) ? (o.focus as FocusName) : "main",
  };
}

/** A tab key that comes back as a new tab under another key (a terminal). */
export const isTerminalKey = (k: string): boolean => /^terminal:\d+$/.test(k);

/**
 * The saved groups / places / shown tabs with some keys renamed (old → new): a terminal
 * tab reopened under a new key keeps its group and its frame. Raw in, raw out (they're
 * checked by parseGroups / parsePlaces / parseShows afterwards).
 */
export function renameKeys(ses: { groups?: unknown; places?: unknown; shows?: unknown }, rename: Record<string, string>): { groups: unknown; places: unknown; shows: unknown } {
  const r = (k: unknown) => (typeof k === "string" && rename[k] ? rename[k] : k);
  const groups = Array.isArray(ses.groups)
    ? ses.groups.map((g) => {
        if (!g || typeof g !== "object") return g;
        const o = g as Record<string, unknown>;
        return { ...o, keys: Array.isArray(o.keys) ? o.keys.map(r) : o.keys, active: r(o.active) };
      })
    : ses.groups;
  const places = ses.places && typeof ses.places === "object" && !Array.isArray(ses.places) ? Object.fromEntries(Object.entries(ses.places as Record<string, unknown>).map(([k, v]) => [r(k) as string, v])) : ses.places;
  const shows = ses.shows && typeof ses.shows === "object" && !Array.isArray(ses.shows) ? Object.fromEntries(Object.entries(ses.shows as Record<string, unknown>).map(([f, k]) => [f, r(k)])) : ses.shows;
  return { groups, places, shows };
}
