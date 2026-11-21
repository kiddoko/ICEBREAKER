import { sayPerms } from "../plugins/permissions";
import { fmt } from "../core/ansi";
import { compareVersions } from "../plugins/deps";
import { FilterBar } from "../ui/filterbar";
import { tabs } from "../ui/controls";
import { BOLD, type Rect } from "../core/grid";
import { t } from "../core/i18n";
import type { Action, KeyInput } from "../core/input";
import { wrapWords } from "../core/unicode";
import { ListView } from "../ui/list";
import { Row } from "../ui/layout";
import type { Deck } from "../deck";
import { fetchAll, indexSources, installPlugin, isVerified, unverifiedWarning, type IndexEntry } from "../plugins/install";
import { describeNeeds } from "../plugins/deps";
import { checkModuleUpdates, updateModule } from "../plugins/updates";
import { asker } from "../shell/ask";
import type { ShellContext } from "../shell/types";
import type { Command } from "../shell/types";
import { q, type UI } from "../ui/ui";
import type { App, AppSpec } from "./types";

/**
 * STORE — modules and themes from the community index on GitHub, and from any
 * index you add (your own server, a friend's repo, a company's). Every button
 * runs a command (`store …`, `plugin …`, `theme …`), so all of it works from
 * the shell too.
 *
 *   store                       what's there · store search <words>
 *   store install <id>          a module or a theme (asks before enabling a module)
 *   store remove <id>           uninstall (to .trash)
 *   store sources               where it looks · store sources add <url | user/repo> · rm <…>
 *   store refresh · store open
 */

type Tab = "modules" | "themes" | "installed" | "sources";
type StoreRow = IndexEntry | Owned | string;
const TABS: Tab[] = ["modules", "themes", "installed", "sources"];

/** What the store knows, shared by the app and the command. */
const cache = { entries: [] as IndexEntry[], errors: [] as { source: string; error: string }[], at: 0, loading: false };

async function refresh(deck: Deck): Promise<void> {
  if (cache.loading) return;
  cache.loading = true;
  deck.requestFrame();
  try {
    const r = await fetchAll(deck);
    cache.entries = r.entries;
    cache.errors = r.errors;
    cache.at = Date.now();
  } finally {
    cache.loading = false;
    deck.requestFrame();
  }
}

const installedPlugin = (deck: Deck, id: string) => deck.plugins.list().find((p) => p.manifest.id === id);
/** Built-in modules the user removed: offered again in the STORE. */
function removedBuiltins(deck: Deck): IndexEntry[] {
  const removed = deck.settings.data.plugins.removed ?? [];
  return deck.plugins
    .allBuiltins()
    .filter((p) => removed.includes(p.manifest.id))
    .map((p) => ({ id: p.manifest.id, name: p.manifest.name, description: p.manifest.description ?? "", author: "icebreaker · built-in", repo: "built-in", kind: "plugin" as const, builtin: true }));
}
const installedTheme = (deck: Deck, id: string) => deck.themes.list().find((th) => th.name === id && th.source === "vault");
function stateOf(deck: Deck, e: IndexEntry): "enabled" | "installed" | "" {
  if (e.kind === "theme") return installedTheme(deck, e.id) ? "installed" : "";
  const p = installedPlugin(deck, e.id);
  return p ? (p.active ? "enabled" : "installed") : "";
}

/** Every entry the STORE knows: the deck's removed built-ins, then the indexes (a built-in once). */
function catalog(deck: Deck): IndexEntry[] {
  const local = removedBuiltins(deck);
  const mine = new Set(local.map((e) => e.id));
  return [...local, ...cache.entries.filter((e) => !mine.has(e.id))];
}

/**
 * `store install <id>`: a removed built-in comes back; a module from an index is downloaded,
 * then what it needs is installed (after asking — the same way, from the STORE), then it's
 * switched on (which shows its permissions). `seen`: a module never installs itself twice.
 */
async function storeInstall(ctx: ShellContext, arg: string, window: boolean, seen: Set<string>): Promise<number> {
  const d = ctx.deck;
  const ask = asker(ctx, window);
  seen.add(arg);
  if ((d.settings.data.plugins.removed ?? []).includes(arg)) {
    await d.plugins.restoreBuiltin(arg);
    ctx.out(`${fmt.green("✓")} ${arg} is back\n`);
    return 0;
  }
  if (!cache.at) await refresh(d);
  const e = cache.entries.find((x) => x.id === arg);
  // a module that ships with the deck: never downloaded — it's here, or it needs a newer deck
  if (e?.builtin) {
    if (installedPlugin(d, e.id)) return ctx.out(`${e.id}: already on the deck (MODULES switches it on and off)\n`), 0;
    return ctx.err(`${e.id} ships with a newer ICEBREAKER: update the deck to get it\n`), 1;
  }
  const kind = e?.kind ?? (arg.endsWith(".toml") ? "theme" : "plugin");
  const src = e?.repo ?? arg;
  if (kind === "theme") {
    const code = await d.act(`theme install ${q(src)}`);
    if (code === 0 && e) await d.act(`theme set ${e.id}`);
    return code;
  }
  // not reviewed by ICEBREAKER: said plainly, and asked, before anything is downloaded
  if (!e || !isVerified(e)) {
    ctx.out(fmt.yellow(`⚠ not verified — ${src}\n`));
    if (!(await ask("Install a module nobody has checked?", unverifiedWarning(e?.index && e.index !== src ? `${src} (listed by ${e.index})` : src)))) return ctx.out("not installed\n"), 1;
  }
  let id: string;
  try {
    ctx.out(fmt.dim(`fetching ${src}…\n`));
    const r = await installPlugin(d, src);
    await d.plugins.reload();
    id = r.id;
    ctx.out(`${fmt.green("✓")} ${r.name} (${r.id}) installed — asks for: ${sayPerms(r.permissions) || "nothing"}\n`);
  } catch (err) {
    ctx.err(`store install: ${err instanceof Error ? err.message : err}\n`);
    return 1;
  }
  // what it needs and isn't there (or is too old): from the STORE too, after asking
  const needs = d.plugins.needsOf(id).filter((n) => n.problem !== "off" && n.id !== "icebreaker");
  if (needs.length) {
    if (!(await ask(`${id} needs ${needs.map((n) => n.id).join(", ")}`, `${describeNeeds(needs)}\nInstall ${needs.length > 1 ? "them" : "it"} from the STORE too?`))) {
      return ctx.out(`${id} stays off until it has ${describeNeeds(needs)}\n`), 1;
    }
    for (const n of needs) if (!seen.has(n.id) && (await storeInstall(ctx, n.id, window, seen)) !== 0) return ctx.err(`${id}: ${n.id} couldn't be installed — it stays off\n`), 1;
  }
  // switching it on shows its own permissions and the audit (and switches on what it needs)
  try {
    if (!(await d.plugins.enable(id, ask))) return ctx.out(`${id}: installed, off (plugin enable ${id})\n`), 0;
    ctx.out(`${fmt.green("✓")} ${id} is on\n`);
    return 0;
  } catch (err) {
    ctx.err(`${err instanceof Error ? err.message : err}\n`);
    return 1;
  }
}

/** One row of the "installed" tab. */
interface Owned {
  id: string;
  kind: "plugin" | "theme";
  name: string;
  description: string;
  builtin: boolean;
  active: boolean;
}
function owned(deck: Deck): Owned[] {
  const mods = deck.plugins.list().map((p) => ({ id: p.manifest.id, kind: "plugin" as const, name: p.manifest.name, description: p.manifest.description ?? "", builtin: p.source === "builtin", active: p.active }));
  const themes = deck.themes.list().filter((th) => th.source === "vault").map((th) => ({ id: th.name, kind: "theme" as const, name: th.name, description: th.description, builtin: false, active: deck.theme.name === th.name }));
  return [...mods, ...themes];
}

/**
 * The STORE's search: every word you type is in the name, the id, the description or the
 * author — the name's matches first. (A fuzzy search let "clock" find VOICE, CALENDAR and
 * MUSIC through letters scattered in their descriptions: it looked like no filter at all.)
 */
function matching<T>(query: string, list: T[], names: (x: T) => string[], more: (x: T) => string): T[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const hits = list.filter((x) => {
    const text = `${names(x).join(" ")} ${more(x)}`.toLowerCase();
    return words.every((w) => text.includes(w));
  });
  const inName = (x: T) => words.every((w) => names(x).join(" ").toLowerCase().includes(w));
  return [...hits.filter(inName), ...hits.filter((x) => !inName(x))];
}

class StoreApp implements App {
  readonly kind = "store";
  readonly key = "store";
  tab: Tab = "modules";
  /** type anywhere: it searches (THE search bar, the same as Settings, BLOCKS, SHORTCUTS) */
  private readonly search = new FilterBar({ always: true, colours: false, onChange: () => this.list.select(0) });
  /** THE list (ui/list.ts): selection, scrolling, mouse */
  private readonly list = new ListView<StoreRow>();
  private get query(): string {
    return this.search.query;
  }

  constructor(private readonly deck: Deck) {
    if (!cache.at) void refresh(deck);
  }

  title(): string {
    return "Store";
  }
  status(): string {
    return t("type to search · tab: sections · enter: install / use · del: remove");
  }

  private rows(): StoreRow[] {
    const d = this.deck;
    if (this.tab === "sources") return indexSources(d);
    if (this.tab === "installed") {
      const list = owned(d);
      return this.query ? matching(this.query, list, (o) => [o.name, o.id], (o) => `${o.description}`) : list;
    }
    // the deck's own removed modules first, then the index (a built-in listed by both: once)
    const list = catalog(d).filter((e) => e.kind === (this.tab === "modules" ? "plugin" : "theme"));
    return this.query ? matching(this.query, list, (e) => [e.name, e.id], (e) => `${e.description} ${e.author}`) : list;
  }

  /** The main action of a row: install / enable / use / … — always a command. */
  private primary(row: IndexEntry | Owned | string | undefined): void {
    if (!row) return;
    const d = this.deck;
    if (typeof row === "string") return;
    if ("repo" in row) {
      const st = stateOf(d, row);
      if (row.kind === "theme") return void d.act(st ? `theme set ${row.id}` : `store install ${row.id}`);
      return void d.act(st === "enabled" ? `store open ${row.id}` : st === "installed" ? `plugin enable ${row.id} --window` : `store install ${row.id} --window`);
    }
    if (row.kind === "theme") return void d.act(`theme set ${row.id}`);
    void d.act(`plugin ${row.active ? "disable" : "enable"} ${row.id} --window`);
  }

  private async remove(row: IndexEntry | Owned | string | undefined): Promise<void> {
    if (!row) return;
    const d = this.deck;
    if (typeof row === "string") {
      if (row === d.settings.data.plugins.registry) return d.notify(t("the official index stays — add yours next to it"), "warning");
      return void d.act(`store sources rm ${q(row)}`);
    }
    const builtin = "builtin" in row && row.builtin;
    if (await d.confirm(t("Remove {name}?", { name: row.name }), builtin ? t("It ships with the deck: the STORE can reinstall it any time.") : t("Its files go to .trash in your vault."))) void d.act(`store remove ${row.id} --window`);
  }

  private async addSource(): Promise<void> {
    const v = await this.deck.prompt(t("Add a source: an index.json URL or a GitHub user/repo"), { placeholder: "https://my-server.lan/icebreaker/index.json · someone/their-modules" });
    if (v?.trim()) void this.deck.act(`store sources add ${q(v.trim())}`);
  }

  onText(s: string): boolean {
    // every key types into the search (removing: del · a source: + add a source · refresh: ⟳)
    return this.search.onText(s);
  }
  onKey(k: KeyInput): boolean {
    if (this.query && this.search.onKey(k)) return true;
    if (k.combo === "esc" && this.query) return this.search.clear(), true;
    if (k.combo === "tab" || k.combo === "shift+tab") {
      this.tab = TABS[(TABS.indexOf(this.tab) + (k.shift ? TABS.length - 1 : 1)) % TABS.length];
      this.list.select(0);
      return true;
    }
    if (k.combo === "delete") return void this.remove(this.list.current), true;
    return false;
  }
  onAction(a: Action): boolean {
    switch (a) {
      case "up": case "down": case "page-up": case "page-down": return this.list.onAction(a);
      case "left": case "tab-prev": this.onKey({ key: "tab", code: "", ctrl: false, alt: false, shift: true, meta: false, combo: "shift+tab" }); return true;
      case "right": case "tab-next": this.onKey({ key: "tab", code: "", ctrl: false, alt: false, shift: false, meta: false, combo: "tab" }); return true;
      case "confirm": this.tab === "sources" && !this.list.current ? void this.addSource() : this.primary(this.list.current); return true;
      default: return false;
    }
  }

  render(ui: UI, r: Rect, focused: boolean): void {
    const c = ui.c;
    const d = this.deck;
    if (cache.loading) ui.animate(80);
    // the search on top, on its own line (where every page has it), then the tabs
    this.search.render(ui, { x: r.x + 2, y: r.y + 1, w: Math.min(r.w - 4, 100), h: 1 }, {}, { focused, placeholder: t("type to search a module, a theme…") });
    const ty = r.y + 3;
    const refreshLabel = cache.loading ? ` ${ui.spinner()} ` : " ⟳ ";
    const rx = r.x + r.w - 6;
    ui.button(rx, ty, refreshLabel.trim() || "⟳", () => {}, { cmd: "store refresh", tip: "store refresh" });
    tabs(ui, r.x + 1, ty, TABS, this.tab, (tb) => ((this.tab = tb as typeof this.tab), this.list.select(0)), { tip: "tab", label: (tb) => t(tb), end: rx - 1 });

    const top = ty + 2;
    const listW = Math.min(Math.floor(r.w * 0.5), 60);
    const h = r.y + r.h - top - 1;
    const rows = this.rows();
    this.list.items = rows;

    if (this.tab !== "installed" && this.tab !== "sources" && !cache.entries.length) {
      const msg = cache.loading ? t("reaching the indexes…") : cache.errors.length ? t("couldn't read the index (offline, private repo or stealth mode)") : t("nothing here yet");
      ui.text(r.x + 2, top, msg, { fg: cache.errors.length ? c.warning : c.muted }, r.w - 4);
      cache.errors.slice(0, 4).forEach((e, i) => ui.text(r.x + 4, top + 2 + i, `${e.source}: ${e.error}`, { fg: c.faint }, r.w - 6));
      return;
    }

    const listH = this.tab === "sources" ? Math.min(h, rows.length) : h;
    this.list.render(ui, { x: r.x + 1, y: top, w: listW, h: listH }, focused, (row, rr, sel) => {
      const y = rr.y;
      // (the list paints the row's background: the text keeps it)
      const st = {};
      if (typeof row === "string") {
        ui.text(r.x + 2, y, row === d.settings.data.plugins.registry ? "◆" : "◇", { fg: c.accent, ...st });
        ui.text(r.x + 4, y, row, { fg: c.fg, ...st }, listW - 4);
      } else if ("repo" in row) {
        const state = stateOf(d, row);
        ui.text(r.x + 2, y, row.kind === "theme" ? "◐" : "▦", { fg: c.accent, ...st });
        ui.text(r.x + 4, y, row.name, { fg: c.fg, attrs: sel ? BOLD : 0, ...st }, listW - 18);
        if (state) ui.textRight(r.x + listW, y, t(state), { fg: state === "enabled" ? c.success : c.info, ...st });
        else if (row.kind === "plugin" && !isVerified(row)) ui.textRight(r.x + listW, y, `⚠ ${t("unverified")}`, { fg: c.warning, ...st });
      } else {
        ui.text(r.x + 2, y, row.kind === "theme" ? "◐" : "▦", { fg: row.active ? c.success : c.subtle, ...st });
        ui.text(r.x + 4, y, row.name, { fg: c.fg, attrs: sel ? BOLD : 0, ...st }, listW - 18);
        ui.textRight(r.x + listW, y, row.builtin ? t("built-in") : row.kind === "theme" ? (row.active ? t("in use") : "") : row.active ? t("enabled") : t("off"), { fg: row.active ? c.success : c.faint, ...st });
      }
    });
    if (this.tab === "sources") {
      const y = top + rows.length + 1;
      ui.button(r.x + 2, y, t("+ add a source"), () => void this.addSource(), { tip: "store sources add <url | user/repo>" });
      ui.text(r.x + 2, y + 2, t("An index is a JSON list of modules and themes (see docs/COMMUNITY.md)."), { fg: c.faint }, listW);
      ui.text(r.x + 2, y + 3, t("Host yours anywhere: GitHub, your server, a NAS on your network."), { fg: c.faint }, listW);
    }

    // the details of the selected row
    const dx = r.x + listW + 3, dw = r.x + r.w - dx - 1;
    if (dw < 20) return;
    ui.vline(dx - 2, top, h, { fg: c.faint });
    const row = this.list.current;
    if (!row || typeof row === "string") return;
    let y = top;
    ui.text(dx, y++, row.name.toUpperCase(), { fg: c.accent, attrs: BOLD }, dw);
    if ("repo" in row) ui.text(dx, y++, `${row.kind === "theme" ? t("theme") : t("module")} · ${row.author}${row.version ? ` · v${row.version}` : ""}`, { fg: c.subtle }, dw);
    y++;
    // the description, wrapped (core/unicode.ts: one wrapping for the whole deck)
    for (const line of wrapWords(row.description || "", dw)) ui.text(dx, y++, line, { fg: c.fg });
    y++;
    if ("repo" in row) {
      ui.text(dx, y++, row.repo, { fg: c.subtle }, dw);
      if (row.permissions?.length) ui.text(dx, y++, `${t("asks for")}: ${sayPerms(row.permissions, t)}`, { fg: c.warning }, dw);
      if (row.index && row.index !== d.settings.data.plugins.registry) ui.text(dx, y++, `${t("from")} ${row.index}`, { fg: c.faint }, dw);
      // reviewed or not: always said (themes are only colours, modules are code)
      if (row.kind === "plugin") ui.text(dx, y++, isVerified(row) ? `✓ ${t("verified: reviewed in the official STORE")}` : `⚠ ${t("not verified: nobody from ICEBREAKER checked its code")}`, { fg: isVerified(row) ? c.success : c.warning }, dw);
      y++;
      const st = stateOf(d, row);
      const action = row.kind === "theme" ? (st ? t("use it") : t("install")) : st === "enabled" ? t("open") : st === "installed" ? t("enable") : t("install");
      const bar = new Row(ui, dx, y, dx + dw);
      bar.button(`${action}  ⏎`, () => this.primary(row));
      if (st) bar.button(t("remove  del"), () => void this.remove(row), { accent: c.error });
      // "update" only when the index says there's a newer one (it showed on every installed
      // module, even one installed a second ago); an entry without a version: still offered
      const mine = d.plugins.list().find((p) => p.manifest.id === row.id)?.manifest.version;
      const newer = !("version" in row) || !row.version || !mine || compareVersions(row.version, mine) > 0;
      if (st && row.kind === "plugin" && newer) bar.button(row.version && mine ? `${t("update")} ${mine} → ${row.version}` : t("update"), () => {}, { cmd: `store update ${row.id} --window` });
    } else {
      const bar = new Row(ui, dx, y, dx + dw);
      bar.button(row.kind === "theme" ? t("use it") : row.active ? t("switch off") : t("switch on"), () => this.primary(row));
      if (!row.builtin) bar.button(t("remove  del"), () => void this.remove(row), { accent: c.error });
    }
  }
}

export const storeSpec: AppSpec = {
  kind: "store",
  title: "Store",
  description: "modules and themes from GitHub and your own sources",
  icon: "⇣",
  launcher: true,
  create: (deck) => new StoreApp(deck),
};

/** `store` — the same, from the shell. */
export const storeCommand: Command = {
  name: "store",
  summary: "modules and themes from GitHub and your own sources",
  usage: [
    "store                      open the STORE",
    "store list [modules | themes]   what the indexes have",
    "store search <words>",
    "store info <id>            what it is, what it asks, what it needs, what you have",
    "store install <id>         a module (and what it needs) or a theme",
    "store remove <id>          uninstall (to .trash; what needs it goes off, after asking)",
    "store update               what can be updated · store update <id> · store update --all",
    "store sources              the indexes it reads",
    "store sources add <url | user/repo>   your own index (https, or http on your network)",
    "store sources rm <url | user/repo>",
    "store refresh",
    "  --window                 (install, remove, update) ask in dialogs instead of the shell",
  ].join("\n"),
  examples: [
    ["store search pomodoro", "find a module"],
    ["store install synthwave", "a theme from the index"],
    ["store sources add someone/their-modules", "their index.json on GitHub"],
    ["store sources add http://nas.local/icebreaker/index.json", "your own, at home"],
  ],
  complete: () => ["list", "search", "info", "install", "remove", "update", "sources", "refresh", "open"],
  async run(ctx) {
    const d = ctx.deck;
    const window = ctx.args.includes("--window");
    const [sub, ...rest] = ctx.args.filter((a) => a !== "--window" && a !== "--all");
    const all = ctx.args.includes("--all");
    const arg = rest.join(" ").trim();
    switch (sub) {
      case undefined:
      case "open": {
        if (sub === "open" && arg) {
          // open an installed module's app
          const spec = d.apps.list().find((a) => d.apps.sourceOf(a.kind) === arg);
          if (spec) return void d.openApp(spec.kind);
        }
        const app = d.openApp("store") as StoreApp | null;
        if (app && arg && TABS.includes(arg as Tab)) app.tab = arg as Tab;
        return 0;
      }
      case "refresh":
        await refresh(d);
        ctx.out(`${cache.entries.length} entries from ${indexSources(d).length} source(s)${cache.errors.length ? fmt.yellow(` · ${cache.errors.length} unreachable`) : ""}\n`);
        for (const e of cache.errors) ctx.err(`${e.source}: ${e.error}\n`);
        return cache.errors.length && !cache.entries.length ? 1 : 0;
      case "list":
      case "search": {
        await refresh(d);
        const kind = sub === "list" && arg ? (arg.startsWith("theme") ? "theme" : "plugin") : null;
        const qy = sub === "search" ? arg.toLowerCase() : "";
        const hits = catalog(d).filter((e) => (!kind || e.kind === kind) && (!qy || `${e.id} ${e.name} ${e.description} ${e.author}`.toLowerCase().includes(qy)));
        if (!hits.length) ctx.out(cache.errors.length ? fmt.yellow("couldn't read the index — store refresh for details\n") : "nothing found\n");
        for (const e of hits) {
          const st = stateOf(d, e);
          const needs = Object.keys(e.requires ?? {}).filter((x) => x !== "icebreaker");
          ctx.out(`${fmt.magenta(e.id.padEnd(18))} ${(e.kind === "plugin" ? "module" : "theme").padEnd(7)} ${e.description} ${fmt.dim(`— ${e.author}${e.builtin ? " · built-in" : e.kind === "plugin" && !isVerified(e) ? " · ⚠ not verified" : ""}${needs.length ? ` · needs ${needs.join(", ")}` : ""}`)}${st ? fmt.green(` [${st}]`) : ""}\n`);
        }
        return 0;
      }
      case "install":
        if (!arg) return ctx.err("usage: store install <id> [--window]\n"), 1;
        return storeInstall(ctx, arg, window, new Set());
      case "info": {
        if (!arg) return ctx.err("usage: store info <id>\n"), 1;
        if (!cache.at) await refresh(d);
        const e = catalog(d).find((x) => x.id === arg);
        const p = installedPlugin(d, arg);
        if (!e && !p) return ctx.err(`store: no "${arg}" in the indexes nor on the deck (store search …)\n`), 1;
        const req = e?.requires ?? p?.manifest.requires ?? {};
        const lines: [string, string][] = [
          ["name", `${e?.name ?? p?.manifest.name} (${arg})`],
          ["what", e?.description ?? p?.manifest.description ?? ""],
          ["kind", e?.kind === "theme" ? "theme" : "module"],
          ["by", `${e?.author ?? p?.manifest.author ?? "?"}${e?.builtin || p?.source === "builtin" ? " · ships with the deck" : ""}`],
          ["version", `${e?.version ? `${e.version} in the store` : "—"}${p ? ` · ${p.manifest.version} here` : ""}`],
          ["asks for", sayPerms(e?.permissions ?? p?.manifest.permissions ?? []) || "nothing"],
          ["needs", Object.keys(req).length ? Object.entries(req).map(([k, v]) => (v && v !== "*" ? `${k} ${v}` : k)).join(", ") : "nothing"],
          ["state", p ? (p.active ? "on" : p.error ? `off — ${p.error}` : "installed, off") : (d.settings.data.plugins.removed ?? []).includes(arg) ? "removed (store install brings it back)" : "not installed"],
          ["source", e?.repo ?? "—"],
        ];
        for (const [k, v] of lines) ctx.out(`${fmt.bold(k.padEnd(9))} ${v}\n`);
        return 0;
      }
      case "update": {
        // nothing named: what could be updated · a name or --all: do it
        ctx.out(fmt.dim("reading where each module came from…\n"));
        const { updates, errors } = await checkModuleUpdates(d);
        for (const e of errors) ctx.err(`  ${e}\n`);
        const todo = all ? updates : arg ? updates.filter((u) => u.id === arg) : [];
        if (!arg && !all) {
          if (!updates.length) return ctx.out(`${fmt.green("✓")} every module is up to date\n`), 0;
          for (const u of updates) ctx.out(`${fmt.magenta(u.id.padEnd(18))} ${u.have} → ${fmt.green(u.latest)}\n`);
          return ctx.out(fmt.dim(`store update <id> · store update --all\n`)), 0;
        }
        if (arg && !todo.length) return ctx.out(`${arg}: up to date (or not installed from a repo)\n`), 0;
        for (const u of todo) {
          try {
            ctx.out(`${fmt.green("✓")} ${await updateModule(d, u)} ${fmt.dim(`(was ${u.have})`)}\n`);
          } catch (e) {
            ctx.err(`${u.id}: ${e instanceof Error ? e.message : e}\n`);
          }
        }
        return 0;
      }
      case "remove":
      case "uninstall": {
        if (!arg) return ctx.err("usage: store remove <id>\n"), 1;
        const th = installedTheme(d, arg);
        if (th) {
          if (d.theme.name === arg) await d.act("theme set nightshade");
          await d.vault.trash(`.icebreaker/themes/${arg}.toml`).catch(() => {});
          await d.reloadUserThemes();
          ctx.out(`${arg}: removed (in .trash)\n`);
          return 0;
        }
        const p = installedPlugin(d, arg);
        if (!p) return ctx.err(`store: "${arg}" isn't installed\n`), 1;
        // others need it: they go off with it, after asking (plugins/deps.ts)
        const needers = d.plugins.dependentsOf(arg);
        if (needers.length && !(await asker(ctx, window)(`${arg} is needed by ${needers.join(", ")}`, `Removing it switches ${needers.length > 1 ? "them" : "it"} off.`))) return ctx.out(`${arg}: kept\n`), 1;
        // ⌘Z right after brings back a working module (its files, switched on, approved as
        // before, what needed it on again) — as ONE step, and only while it's the last thing
        // done: never stray files restored from the trash later (core/undo.ts lastOnly)
        const dir = `.icebreaker/plugins/${arg}`;
        const pl = d.settings.data.plugins;
        const before = JSON.parse(JSON.stringify({ enabled: pl.enabled, disabled: pl.disabled, removed: pl.removed ?? [], granted: pl.granted ?? {}, pinned: pl.pinned ?? {}, always: pl.always ?? {}, revoked: pl.revoked ?? {} })) as Record<string, unknown>;
        let inTrash = "";
        const remove = async () => {
          for (const x of [...needers].reverse()) await d.plugins.disable(x).catch(() => false);
          if (p.source === "builtin") return d.plugins.removeBuiltin(arg);
          // removed: nothing of it stays approved, switched on or not (the same module installed
          // again asks again — it used to come back on by itself, with no dialog)
          await d.plugins.disable(arg);
          inTrash = await d.vault.trash(dir);
          await d.plugins.reload();
        };
        await d.history.quietAsync(remove);
        d.history.record({
          label: `uninstall ${arg}`,
          lastOnly: true,
          undo: async () => {
            if (inTrash) await d.vault.restore(inTrash, dir);
            for (const [k, v] of Object.entries(before)) d.settings.set(`plugins.${k}`, v);
            await d.plugins.reload();
          },
          redo: remove,
        });
        ctx.out(p.source === "builtin" ? `${arg}: removed · store install ${arg} brings it back (⌘Z too, right now)\n` : `${arg}: removed (in .trash · ⌘Z right now brings it back)\n`);
        return 0;
      }
      case "sources": {
        const [verb, ...more] = rest;
        const src = more.join(" ").trim();
        const list = [...(d.settings.data.plugins.sources ?? [])];
        if (!verb) {
          for (const s of indexSources(d)) ctx.out(`${s === d.settings.data.plugins.registry ? fmt.magenta("◆ official") : "◇ yours   "} ${s}\n`);
          return 0;
        }
        if (!src) return ctx.err("usage: store sources add | rm <url | user/repo>\n"), 1;
        if (verb === "add") {
          if (!/^https?:\/\//.test(src) && !/^[\w.-]+\/[\w.-]+/.test(src)) return ctx.err("a source is an index.json URL (https://…, or http:// on your network) or a GitHub user/repo\n"), 1;
          if (!list.includes(src)) list.push(src);
        } else if (verb === "rm" || verb === "remove") {
          if (!list.includes(src)) return ctx.err(`store: "${src}" isn't one of your sources\n`), 1;
          list.splice(list.indexOf(src), 1);
        } else return ctx.err("usage: store sources add | rm <url | user/repo>\n"), 1;
        d.settings.set("plugins.sources", list);
        cache.at = 0;
        await refresh(d);
        ctx.out(`${list.length} source(s) of your own · ${cache.entries.length} entries\n`);
        return 0;
      }
      default:
        ctx.err(`store: "${sub}"? try store -h\n`);
        return 1;
    }
  },
};
