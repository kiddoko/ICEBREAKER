import { fmt } from "../core/ansi";
import { mix } from "../core/color";
import { fuzzyFilter } from "../core/fuzzy";
import { BOLD, type Rect } from "../core/grid";
import { t } from "../core/i18n";
import type { Action, KeyInput } from "../core/input";
import { strWidth } from "../core/unicode";
import type { Deck } from "../deck";
import { fetchAll, indexSources, type IndexEntry } from "../plugins/install";
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
const installedTheme = (deck: Deck, id: string) => deck.themes.list().find((th) => th.name === id && th.source === "vault");
function stateOf(deck: Deck, e: IndexEntry): "enabled" | "installed" | "" {
  if (e.kind === "theme") return installedTheme(deck, e.id) ? "installed" : "";
  const p = installedPlugin(deck, e.id);
  return p ? (p.active ? "enabled" : "installed") : "";
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

class StoreApp implements App {
  readonly kind = "store";
  readonly key = "store";
  tab: Tab = "modules";
  private sel = 0;
  private scroll = 0;
  private query = "";
  private typing = false;

  constructor(private readonly deck: Deck) {
    if (!cache.at) void refresh(deck);
  }

  title(): string {
    return "Store";
  }
  status(): string {
    return t("tab: sections · / search · enter: install / use · x: remove · a: add a source · r: refresh");
  }

  private rows(): (IndexEntry | Owned | string)[] {
    const d = this.deck;
    if (this.tab === "sources") return indexSources(d);
    if (this.tab === "installed") {
      const list = owned(d);
      return this.query ? fuzzyFilter(this.query, list, (o) => `${o.name} ${o.id} ${o.description}`, 100) : list;
    }
    const list = cache.entries.filter((e) => e.kind === (this.tab === "modules" ? "plugin" : "theme"));
    return this.query ? fuzzyFilter(this.query, list, (e) => `${e.name} ${e.id} ${e.description} ${e.author}`, 100) : list;
  }

  /** The main action of a row: install / enable / use / … — always a command. */
  private primary(row: IndexEntry | Owned | string | undefined): void {
    if (!row) return;
    const d = this.deck;
    if (typeof row === "string") return;
    if ("repo" in row) {
      const st = stateOf(d, row);
      if (row.kind === "theme") return void d.act(st ? `theme set ${row.id}` : `store install ${row.id}`);
      return void d.act(st === "enabled" ? `store open ${row.id}` : st === "installed" ? `plugin enable ${row.id}` : `store install ${row.id}`);
    }
    if (row.kind === "theme") return void d.act(`theme set ${row.id}`);
    void d.act(`plugin ${row.active ? "disable" : "enable"} ${row.id}`);
  }

  private async remove(row: IndexEntry | Owned | string | undefined): Promise<void> {
    if (!row) return;
    const d = this.deck;
    if (typeof row === "string") {
      if (row === d.settings.data.plugins.registry) return d.notify(t("the official index stays — add yours next to it"), "warning");
      return void d.act(`store sources rm ${q(row)}`);
    }
    if ("builtin" in row && row.builtin) return d.notify(t("built-in modules can only be switched off"), "warning");
    if (await d.confirm(t("Remove {name}?", { name: row.name }), t("Its files go to .trash in your vault."))) void d.act(`store remove ${row.id}`);
  }

  private async addSource(): Promise<void> {
    const v = await this.deck.prompt(t("Add a source: an index.json URL or a GitHub user/repo"), { placeholder: "https://my-server.lan/icebreaker/index.json · someone/their-modules" });
    if (v?.trim()) void this.deck.act(`store sources add ${q(v.trim())}`);
  }

  onText(s: string): boolean {
    if (this.typing) {
      if (s.includes("\n")) this.typing = false;
      else this.query += s;
      this.sel = 0;
      return true;
    }
    switch (s) {
      case "/": this.typing = true; this.query = ""; return true;
      case "x": void this.remove(this.rows()[this.sel]); return true;
      case "a": if (this.tab === "sources") void this.addSource(); return true;
      case "r": void this.deck.act("store refresh"); return true;
      default: return false;
    }
  }
  onKey(k: KeyInput): boolean {
    if (this.typing) {
      if (k.combo === "esc") return (this.typing = false), (this.query = ""), true;
      if (k.combo === "backspace") return (this.query = this.query.slice(0, -1)), true;
      if (k.combo === "enter") return (this.typing = false), true;
      return k.combo.length === 1;
    }
    if (k.combo === "tab" || k.combo === "shift+tab") {
      this.tab = TABS[(TABS.indexOf(this.tab) + (k.shift ? TABS.length - 1 : 1)) % TABS.length];
      this.sel = this.scroll = 0;
      return true;
    }
    if (k.combo === "delete") return void this.remove(this.rows()[this.sel]), true;
    return false;
  }
  onAction(a: Action): boolean {
    const n = this.rows().length;
    switch (a) {
      case "up": this.sel = Math.max(0, this.sel - 1); return true;
      case "down": this.sel = Math.min(n - 1, this.sel + 1); return true;
      case "left": case "tab-prev": this.onKey({ key: "tab", code: "", ctrl: false, alt: false, shift: true, meta: false, combo: "shift+tab" }); return true;
      case "right": case "tab-next": this.onKey({ key: "tab", code: "", ctrl: false, alt: false, shift: false, meta: false, combo: "tab" }); return true;
      case "confirm": this.tab === "sources" && this.sel >= n ? void this.addSource() : this.primary(this.rows()[this.sel]); return true;
      default: return false;
    }
  }

  render(ui: UI, r: Rect, focused: boolean): void {
    const c = ui.c;
    const d = this.deck;
    if (cache.loading) ui.animate(80);
    // tabs + search
    let x = r.x + 1;
    for (const tb of TABS) {
      const label = ` ${t(tb)} `;
      const rect = { x, y: r.y, w: strWidth(label), h: 1 };
      const on = tb === this.tab;
      ui.text(x, r.y, label, on ? { fg: c.panel, bg: c.accent, attrs: BOLD } : { fg: ui.hovered(rect) ? c.accent : c.fg, bg: c.highlight });
      ui.hit(rect, { onClick: () => ((this.tab = tb), (this.sel = this.scroll = 0)), tip: "tab" });
      x += rect.w + 1;
    }
    const sx = x + 1, sw = Math.max(10, r.x + r.w - sx - 16);
    ui.fill({ x: sx, y: r.y, w: sw, h: 1 }, { bg: this.typing ? mix(c.accent, c.bg, 0.86) : c.panelAlt });
    ui.text(sx + 1, r.y, `⌕ ${this.query || (this.typing ? "" : t("search  (/)"))}`, { fg: this.query ? c.fg : c.faint }, sw - 2);
    if (this.typing && focused) ui.cursor(sx + 3 + strWidth(this.query), r.y);
    ui.hit({ x: sx, y: r.y, w: sw, h: 1 }, { onClick: () => ((this.typing = true), (this.query = "")) });
    const refreshLabel = cache.loading ? ` ${ui.spinner()} ` : " ⟳ ";
    ui.button(r.x + r.w - 6, r.y, refreshLabel.trim() || "⟳", () => {}, { cmd: "store refresh", tip: "r · store refresh" });

    const top = r.y + 2;
    const listW = Math.min(Math.floor(r.w * 0.5), 60);
    const h = r.h - 3;
    const rows = this.rows();
    this.sel = Math.max(0, Math.min(this.sel, rows.length - (this.tab === "sources" ? 0 : 1)));
    if (this.sel < this.scroll) this.scroll = this.sel;
    if (this.sel >= this.scroll + h) this.scroll = this.sel - h + 1;

    if (this.tab !== "installed" && this.tab !== "sources" && !cache.entries.length) {
      const msg = cache.loading ? t("reaching the indexes…") : cache.errors.length ? t("couldn't read the index (offline, private repo or stealth mode)") : t("nothing here yet");
      ui.text(r.x + 2, top, msg, { fg: cache.errors.length ? c.warning : c.muted }, r.w - 4);
      cache.errors.slice(0, 4).forEach((e, i) => ui.text(r.x + 4, top + 2 + i, `${e.source}: ${e.error}`, { fg: c.faint }, r.w - 6));
      return;
    }

    rows.slice(this.scroll, this.scroll + h).forEach((row, k) => {
      const i = this.scroll + k;
      const y = top + k;
      const rect = { x: r.x + 1, y, w: listW, h: 1 };
      const sel = i === this.sel;
      const bg = sel ? mix(c.accent, c.bg, focused ? 0.75 : 0.85) : ui.hovered(rect) ? c.highlight : -1;
      if (bg !== -1) ui.fill(rect, { bg });
      const st = bg !== -1 ? { bg } : {};
      if (typeof row === "string") {
        ui.text(r.x + 2, y, row === d.settings.data.plugins.registry ? "◆" : "◇", { fg: c.accent, ...st });
        ui.text(r.x + 4, y, row, { fg: c.fg, ...st }, listW - 4);
      } else if ("repo" in row) {
        const state = stateOf(d, row);
        ui.text(r.x + 2, y, row.kind === "theme" ? "◐" : "▦", { fg: c.accent, ...st });
        ui.text(r.x + 4, y, row.name, { fg: c.fg, attrs: sel ? BOLD : 0, ...st }, listW - 18);
        if (state) ui.textRight(r.x + listW, y, t(state), { fg: state === "enabled" ? c.success : c.info, ...st });
      } else {
        ui.text(r.x + 2, y, row.kind === "theme" ? "◐" : "▦", { fg: row.active ? c.success : c.subtle, ...st });
        ui.text(r.x + 4, y, row.name, { fg: c.fg, attrs: sel ? BOLD : 0, ...st }, listW - 18);
        ui.textRight(r.x + listW, y, row.builtin ? t("built-in") : row.kind === "theme" ? (row.active ? t("in use") : "") : row.active ? t("enabled") : t("off"), { fg: row.active ? c.success : c.faint, ...st });
      }
      ui.hit(rect, { onClick: () => (this.sel = i), onDouble: () => this.primary(row) });
    });
    if (this.tab === "sources") {
      const y = top + rows.length + 1;
      ui.button(r.x + 2, y, t("+ add a source"), () => void this.addSource(), { tip: "a · store sources add <url | user/repo>" });
      ui.text(r.x + 2, y + 2, t("An index is a JSON list of modules and themes (see docs/COMMUNITY.md)."), { fg: c.faint }, listW);
      ui.text(r.x + 2, y + 3, t("Host yours anywhere: GitHub, your server, a NAS on your network."), { fg: c.faint }, listW);
    }

    // the details of the selected row
    const dx = r.x + listW + 3, dw = r.x + r.w - dx - 1;
    if (dw < 20) return;
    ui.vline(dx - 2, top, h, { fg: c.faint });
    const row = rows[this.sel];
    if (!row || typeof row === "string") return;
    let y = top;
    ui.text(dx, y++, row.name.toUpperCase(), { fg: c.accent, attrs: BOLD }, dw);
    if ("repo" in row) ui.text(dx, y++, `${row.kind === "theme" ? t("theme") : t("module")} · ${row.author}${row.version ? ` · v${row.version}` : ""}`, { fg: c.subtle }, dw);
    y++;
    // word-wrapped description
    let line = "";
    for (const w of (row.description || "").split(" ")) {
      if (strWidth(line + " " + w) > dw && line) {
        ui.text(dx, y++, line, { fg: c.fg });
        line = w;
      } else line = line ? `${line} ${w}` : w;
    }
    if (line) ui.text(dx, y++, line, { fg: c.fg });
    y++;
    if ("repo" in row) {
      ui.text(dx, y++, row.repo, { fg: c.faint }, dw);
      if (row.permissions?.length) ui.text(dx, y++, `${t("asks for")}: ${row.permissions.join(", ")}`, { fg: c.warning }, dw);
      if (row.index && row.index !== d.settings.data.plugins.registry) ui.text(dx, y++, `${t("from")} ${row.index}`, { fg: c.faint }, dw);
      y++;
      const st = stateOf(d, row);
      const action = row.kind === "theme" ? (st ? t("use it") : t("install")) : st === "enabled" ? t("open") : st === "installed" ? t("enable") : t("install");
      let bx = dx;
      bx += ui.button(bx, y, `${action}  ⏎`, () => this.primary(row), {}) + 2;
      if (st) bx += ui.button(bx, y, t("remove  x"), () => void this.remove(row), { accent: c.error }) + 2;
      if (st && row.kind === "plugin") ui.button(bx, y, t("update"), () => {}, { cmd: `plugin update ${row.id}` });
    } else {
      let bx = dx;
      bx += ui.button(bx, y, row.kind === "theme" ? t("use it") : row.active ? t("switch off") : t("switch on"), () => this.primary(row)) + 2;
      if (!row.builtin) ui.button(bx, y, t("remove  x"), () => void this.remove(row), { accent: c.error });
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
    "store install <id>         a module or a theme",
    "store remove <id>          uninstall (to .trash)",
    "store sources              the indexes it reads",
    "store sources add <url | user/repo>   your own index (https, or http on your network)",
    "store sources rm <url | user/repo>",
    "store refresh",
  ].join("\n"),
  examples: [
    ["store search pomodoro", "find a module"],
    ["store install synthwave", "a theme from the index"],
    ["store sources add someone/their-modules", "their index.json on GitHub"],
    ["store sources add http://nas.local/icebreaker/index.json", "your own, at home"],
  ],
  complete: () => ["list", "search", "install", "remove", "sources", "refresh", "open"],
  async run(ctx) {
    const d = ctx.deck;
    const [sub, ...rest] = ctx.args;
    const arg = rest.join(" ").trim();
    const find = async (id: string) => {
      if (!cache.at) await refresh(d);
      return cache.entries.find((e) => e.id === id);
    };
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
        const hits = cache.entries.filter((e) => (!kind || e.kind === kind) && (!qy || `${e.id} ${e.name} ${e.description} ${e.author}`.toLowerCase().includes(qy)));
        if (!hits.length) ctx.out(cache.errors.length ? fmt.yellow("couldn't read the index — store refresh for details\n") : "nothing found\n");
        for (const e of hits) {
          const st = stateOf(d, e);
          ctx.out(`${fmt.magenta(e.id.padEnd(18))} ${(e.kind === "plugin" ? "module" : "theme").padEnd(7)} ${e.description} ${fmt.dim(`— ${e.author}`)}${st ? fmt.green(` [${st}]`) : ""}\n`);
        }
        return 0;
      }
      case "install": {
        if (!arg) return ctx.err("usage: store install <id>\n"), 1;
        const e = await find(arg);
        const kind = e?.kind ?? (arg.endsWith(".toml") ? "theme" : "plugin");
        const src = e?.repo ?? arg;
        if (kind === "theme") {
          const code = await d.act(`theme install ${q(src)}`);
          if (code === 0 && e) await d.act(`theme set ${e.id}`);
          return code;
        }
        const code = await d.act(`plugin install ${q(src)}`);
        // a module never runs before you've seen what it asks for
        if (code === 0 && (await d.confirm(t("Enable {name}?", { name: e?.name ?? arg }), `${t("It asks for")}: ${(e?.permissions ?? []).join(", ") || t("nothing special")}\n${t("Read its code in .icebreaker/plugins/ first if you don't know its author.")}`))) await d.act(`plugin enable ${e?.id ?? arg}`);
        return code;
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
        if (p.source === "builtin") return ctx.err(`store: ${arg} is built in — plugin disable ${arg} switches it off\n`), 1;
        if (p.active) await d.act(`plugin disable ${arg}`);
        await d.vault.trash(`.icebreaker/plugins/${arg}`);
        await d.plugins.reload();
        ctx.out(`${arg}: removed (in .trash)\n`);
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
