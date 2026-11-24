import { padEnd, strWidth } from "../../core/unicode";
import { allWidgetKeys, forgetWidget, newWidgetKey, widgetIdOf } from "../../widgets/instances";
import { addToMenu, quickItems } from "../../workspace/quickmenu";
import { closeMany } from "../../workspace/menus";
import { tabTitle } from "../../workspace/tabstrip";
import { t } from "../../core/i18n";
import { MENU, normalizeCombo } from "../../core/shortcuts";
import { BLOCK_KINDS, type BlockKind } from "../../core/catalog";
import { addLink, links, newLinkFlow, NEW_LINK, removeLink } from "../../widgets/links";
import { isTagColor, TAG_NAMES } from "../../vault/marks";
import { popupCommands } from "../../widgets/popups";
import { quoteCommand, worldclockCommand } from "../../widgets/extra";
import { WidgetPopup } from "../../workspace/widgetpopup";
import { fmt } from "../../core/ansi";
import { frameArg } from "../../workspace/tabplaces";
import { CORE_PACKAGES } from "../../plugins/core-packages";
import { q } from "../../ui/ui";
import { HomeApp } from "../../apps/home";
import { DEFAULT_SETTINGS } from "../../core/settings";

const DEFAULT_MACROS = () => DEFAULT_SETTINGS.shell.macros.map((m) => ({ ...m }));
import type { Command, ShellContext } from "../types";
import { frameCommand, layoutCommand, statusbarCommand } from "./layout";

/*
 * Everything you can click has a command (the click runs it, visibly, in the
 * shell). These are the ones that drive the interface itself.
 */

function home(ctx: ShellContext): HomeApp {
  const d = ctx.deck;
  const tab = d.workspace.findTab("home");
  if (tab instanceof HomeApp) {
    d.workspace.open(tab);
    return tab;
  }
  return d.openApp("home") as HomeApp;
}

const homeCmd: Command = {
  name: "home",
  examples: [
    ["home widgets", "what you can put on the grid"],
    ["home add todo.list", "add the to-do widget"],
    ["home rm matrix", "take one off"],
    ["home edit", "rearrange with the arrows (they shrink to fit)"],
    ["home page 2", "go to page 2 (keys: [ and ])"],
    ["home page new", "a new empty page; widgets you add land there"],
    ["home move music.now 2", "send a widget to page 2"],
  ],
  summary: "the HOME dashboard: open it, edit it, add / remove widgets",
  usage: "home                open HOME (key: h)\nhome edit           rearrange (key: e)\nhome done           leave edit mode\nhome add <widget>   put a widget on the grid\nhome rm <widget>    take it off\nhome widgets        what's available\nhome link new       a 1×1 shortcut square (module, note, folder, page, macro, command)\nhome link add <label> \"<cmd>\" [icon] · home link rm <label> · home links\nhome reset          default layout",
  complete: () => ["edit", "done", "add", "rm", "widgets", "reset", "page", "move", "link", "links"],
  run(ctx) {
    const d = ctx.deck;
    // --keep: a widget moving here from the side panel keeps its key (and its own settings)
    const keep = ctx.args.includes("--keep");
    const [sub, id] = ctx.args.filter((a) => a !== "--keep");
    if (sub === "widgets") {
      const used = new Set(d.settings.data.home.widgets.map((p) => p.id));
      for (const w of d.widgets.list()) ctx.out(`${used.has(w.id) ? fmt.green("●") : fmt.dim("○")} ${w.id.padEnd(12)} ${fmt.dim(w.description ?? "")}\n`);
      return 0;
    }
    const h = home(ctx);
    if (!sub) return 0;
    if (sub === "edit") return h.setEditing(true), 0;
    if (sub === "done") return h.setEditing(false), 0;
    if (sub === "reset") return h.resetLayout(), 0;
    if (sub === "page") {
      const a = id ?? "";
      const n = a === "next" ? h.page + 1 : a === "prev" ? h.page - 1 : a === "new" ? h.pageCount() : Number(a) - 1;
      if (!a) return ctx.out(`page ${h.page + 1}/${h.pageCount()}\n`), 0;
      if (!Number.isFinite(n)) return ctx.err("usage: home page <n> | next | prev | new\n"), 1;
      return h.setPage(n), 0;
    }
    if (sub === "move") {
      const n = Number(ctx.args[2]) - 1;
      if (!id || !Number.isFinite(n) || n < 0) return ctx.err("usage: home move <widget> <page>\n"), 1;
      if (!h.moveToPage(id, n)) return ctx.err(`home: ${id} isn't on HOME\n`), 1;
      return h.setPage(n), 0;
    }
    // the 1×1 shortcut squares
    if (sub === "links") {
      const all = links(d);
      if (!all.length) return ctx.out(fmt.dim("no shortcut squares yet — home link new\n")), 0;
      for (const l of all) ctx.out(`${l.icon} ${fmt.bold(l.label.padEnd(16))} ${fmt.dim(l.cmd)}\n`);
      return 0;
    }
    if (sub === "link") {
      const [, what, label, cmd, icon] = ctx.args;
      if (what === "new" || !what) return void newLinkFlow(d), 0;
      if (what === "add") {
        if (!label || !cmd) return ctx.err('usage: home link add <label> "<command>" [icon]\n'), 1;
        const l = addLink(d, label, cmd, icon ?? "◆");
        h.place(`link.${l.id}`);
        return 0;
      }
      if (what === "rm") return removeLink(d, label ?? "") ? 0 : (ctx.err(`home: no shortcut "${label ?? ""}" (home links)\n`), 1);
      return ctx.err("usage: home link new | add <label> \"<cmd>\" [icon] | rm <label>\n"), 1;
    }
    if (sub === "add" && id === NEW_LINK) return void newLinkFlow(d), 0;
    if (sub === "add" || sub === "rm") {
      if (!id && sub === "add") return h.add(), 0; // no name: the picker
      if (!id) return ctx.err(`usage: home ${sub} <widget>   (home widgets lists them)\n`), 1;
      if (!d.widgets.get(widgetIdOf(id))) return ctx.err(`home: no widget "${id}" (home widgets)\n`), 1;
      const ok = sub === "add" ? h.place(id, keep) : h.unplace(id);
      if (!ok) return ctx.err(`home: ${id} is ${sub === "add" ? "already" : "not"} on the grid\n`), 1;
      return 0;
    }
    ctx.err(`home: unknown subcommand ${sub}\n`);
    return 1;
  },
};

const widget: Command = {
  name: "widget",
  summary: "use a HOME widget (what enter does on it)",
  usage: "widget <id>        its pop-up, or its action (what enter does on it)\nwidget <id> open   the module it belongs to\nwidget <id> do     its action, even when it has a pop-up",
  complete: () => [],
  run(ctx) {
    // a copy's key ("clock#2") or a widget's id
    const [id, what] = ctx.args;
    const spec = id ? ctx.deck.widgets.get(widgetIdOf(id)) : undefined;
    if (!spec) return ctx.err("usage: widget <id> [open | do]   (home widgets lists them)\n"), 1;
    if (what === "open") return spec.open ? ctx.deck.act(spec.open) : (ctx.out(fmt.dim(`${id} belongs to no module\n`)), 0);
    if (spec.popup && what !== "do") return void ctx.deck.workspace.push(new WidgetPopup(ctx.deck, spec, id));
    if (spec.activate) return void spec.activate({ deck: ctx.deck, focused: true, key: id });
    if (spec.open) return ctx.deck.act(spec.open);
    ctx.out(fmt.dim(`${id} has no action\n`));
  },
};

const tab: Command = {
  name: "tab",
  examples: [
    ["tab", "list tabs"],
    ["tab 2", "go to tab 2"],
    ["tab close", "close the current one"],
  ],
  summary: "list, switch and close tabs",
  usage: "tab              list\ntab <n>          switch (keys: ctrl+1…9)\ntab next | prev  (ctrl+tab)\ntab close [n]    (ctrl+w)\ntab close others|right|all [n]  the other tabs · those right of it · all (HOME stays)\ntab move <n> <m> put tab n at place m (drag a tab sideways)\ntab move <n> tree|panel|shell|main  tab n into another frame (drag it onto that frame)\ntab group <n> <m> [name]  tab m joins tab n's group (drop a tab on another)\ntab ungroup <n>  tab n on its own again · tab ungroup all\ntab groupname <n> <name>  rename tab n's group\n(move, group, ungroup, groupname: in ibsh only — not from a module or your real terminal)",
  complete: () => ["next", "prev", "close", "move", "group", "ungroup", "groupname"],
  async run(ctx) {
    const ws = ctx.deck.workspace;
    const [a, b] = ctx.args;
    if (!a) {
      ws.tabs.forEach((tab, i) => ctx.out(`${i === ws.active ? fmt.magenta("▸") : " "} ${i + 1} ${tabTitle(tab)}${tab.dirty?.() ? fmt.yellow(" ●") : ""}\n`));
      return 0;
    }
    if (a === "next") return ws.stepTab(1), 0;
    if (a === "group") {
      const n = Number(b) - 1, m = Number(ctx.args[2]) - 1;
      if (!ws.groupTabs(n, m, ctx.args.slice(3).join(" "))) return ctx.err(`usage: tab group <n> <m> [name] (two different tabs, 1…${ws.tabCount})\n`), 1;
      return 0;
    }
    if (a === "ungroup") {
      if (!ws.ungroupTab(Number(b) - 1)) return ctx.err("usage: tab ungroup <n> (a tab in a group)\n"), 1;
      return 0;
    }
    if (a === "groupname") {
      // "-" (what the menu sends for an empty name) or nothing: no name (it shows its tab's)
      const raw = ctx.args.slice(2).join(" ").trim();
      const name = raw === "-" ? "" : raw;
      if (!ws.renameGroupOf(Number(b) - 1, name)) return ctx.err("usage: tab groupname <n> <name> (a tab in a group)\n"), 1;
      return 0;
    }
    if (a === "move") {
      // tab move <n> tree|panel|shell|main: to another frame (Refonte UI 3b)
      const place = frameArg(ctx.args[2]);
      if (place) {
        const n = Number(b) - 1;
        if (!Number.isInteger(n) || !ws.tabs[n] || n >= ws.tabCount) return ctx.err(`usage: tab move <n> tree|panel|shell|main (1…${ws.tabCount})\n`), 1;
        return ws.moveTabTo(n, place) ? 0 : 1;
      }
      const from = Number(b) - 1, to = Number(ctx.args[2]) - 1;
      if (!Number.isInteger(from) || !Number.isInteger(to) || !ws.moveTab(from, to)) return ctx.err(`usage: tab move <n> <m> (1…${ws.tabCount})\n`), 1;
      return 0;
    }
    if (a === "prev") return ws.stepTab(-1), 0;
    if (a === "close" && (b === "others" || b === "right" || b === "all")) {
      // like the tab's menu: within that tab's own frame (the other frames' tabs aren't "others")
      const raw = ctx.args[2];
      const i = raw ? Number(raw) - 1 : Math.max(0, ws.tabs.indexOf(ws.focusedPage ?? ws.tabs[ws.active]));
      if (!ws.tabs[i]) return ctx.err(`tab: no tab ${raw}\n`), 1;
      const same = (j: number) => ws.placeOf(j) === ws.placeOf(i);
      await closeMany(ws, b === "all" ? same : b === "others" ? (j) => j !== i && same(j) : (j) => j > i && same(j));
      return 0;
    }
    if (a === "ungroup" && b === "all") {
      for (let j = ws.tabs.length - 1; j >= 0; j--) ws.ungroupTab(j);
      return 0;
    }
    if (a === "close") {
      // no number: the tab you're looking at — in the focused frame (a tab moved there), else the page's
      const n = b ? Number(b) - 1 : Math.max(0, ws.tabs.indexOf(ws.focusedPage ?? ws.tabs[ws.active]));
      if (!ws.tabs[n]) return ctx.err(`tab: no tab ${b}\n`), 1;
      await ws.closeTab(n);
      return 0;
    }
    const n = Number(a) - 1;
    if (!ws.tabs[n]) return ctx.err(`tab: no tab ${a}\n`), 1;
    ws.switchTab(n);
  },
};

/** each page by the name on its tab ("nexus", "catalog", "manual"), not its inner id (E2) */
const tabName = (a: { title: string }) => a.title.toLowerCase().replace(/\s*\(.*\)$/, "");

/**
 * The page (app or module) called `name` — its id, its tab's name or a module's — or undefined.
 * `launch nexus` is its page, explorer; `open breakermed` too (shell/commands/deck.ts).
 */
export function pageNamed(d: ShellContext["deck"], name: string): string | undefined {
  const n = name.trim().toLowerCase();
  if (!n) return undefined;
  if (d.apps.get(n) && d.apps.get(n)!.kind !== "note") return n;
  return d.apps.list().find((x) => x.kind !== "note" && (x.title.toLowerCase() === n || tabName(x) === n))?.kind ?? CORE_PACKAGES.find((x) => x.id === n)?.apps?.find((k) => d.apps.get(k));
}

const launch: Command = {
  name: "launch",
  examples: [
    ["launch", "list apps and modules"],
    ["launch todo", "open the TODO app"],
  ],
  aliases: ["app"],
  summary: "open an app or module by name",
  usage: "launch           list them\nlaunch <name>    e.g. launch sysmon, launch todo",
  complete: () => [],
  run(ctx) {
    const d = ctx.deck;
    const kind = ctx.args.join(" ");
    if (!kind) {
      // the icons' column as wide as the widest one (STATS' « ▁▃▇ » is 3 cells: its name went a column right)
      const apps = d.apps.list().filter((a) => a.kind !== "note");
      const iw = Math.max(1, ...apps.map((a) => strWidth(a.icon ?? "·")));
      for (const a of apps) ctx.out(`${padEnd(a.icon ?? "·", iw)} ${padEnd(tabName(a), 13)} ${fmt.dim(a.description ?? "")}\n`);
      return 0;
    }
    const found = pageNamed(d, kind);
    if (!found) return ctx.err(`launch: no app "${kind}" (launch to list)\n`), 1;
    d.openApp(found);
  },
};

const opener = (name: string, kind: string, summary: string, aliases?: string[]): Command => ({
  name,
  aliases,
  summary,
  run(ctx) {
    ctx.deck.openApp(kind);
  },
});

const view: Command = {
  name: "view",
  // an old name: `frame` (and ctrl+b, ctrl+`, F11, fx) say the same — kept for habits, not in `help` (E1)
  hidden: true,
  summary: "show / hide parts of the screen (old name: frame fold|unfold, fullscreen, fx)",
  usage: "view sidebar     file tree (ctrl+b)\nview shell       this panel (ctrl+`)\nview fullscreen  (F11, ⌃⌘F)\nview fx          the effects panel",
  complete: () => ["sidebar", "shell", "fullscreen", "fx"],
  async run(ctx) {
    const d = ctx.deck;
    switch (ctx.args[0]) {
      case "sidebar": return d.workspace.toggleSidebar(), 0;
      case "shell": return d.workspace.toggleShell(), 0;
      case "fullscreen": return await d.toggleFullscreen(), 0;
      case "fx": return d.workspace.fxPanel(), 0;
    }
    ctx.err("usage: view sidebar|shell|fullscreen|fx\n");
    return 1;
  },
};

const scale: Command = {
  name: "scale",
  examples: [
    ["scale 80", "everything smaller"],
    ["scale reset", "back to 100 %"],
  ],
  summary: "interface scale, 25–200 % (ctrl+= / ctrl+- / ctrl+0)",
  usage: "scale            current\nscale <25-200>\nscale + | - | reset",
  run(ctx) {
    const d = ctx.deck;
    const a = ctx.args[0];
    if (!a) return ctx.out(`${d.settings.data.appearance.scale}%\n`), 0;
    if (a === "+") return d.zoom(1), 0;
    if (a === "-") return d.zoom(-1), 0;
    if (a === "reset") return d.zoom(0), 0;
    const n = Number(a.replace("%", ""));
    if (!Number.isFinite(n)) return ctx.err("usage: scale <25-200>\n"), 1;
    d.settings.set("appearance.scale", Math.max(25, Math.min(200, Math.round(n))));
  },
};

const palette: Command = {
  name: "palette",
  summary: "THE MENU, straight to searching everything (ctrl+k)",
  run(ctx) {
    ctx.deck.workspace.palette();
  },
};

const osk: Command = {
  name: "osk",
  summary: "on-screen keyboard (type with the mouse or a gamepad)",
  run(ctx) {
    ctx.deck.workspace.toggleOsk();
  },
};

const explore: Command = {
  name: "explore",
  aliases: ["nexus"],
  summary: "NEXUS: walk the vault in pseudo-3D",
  usage: "explore [folder]",
  examples: [["explore", "the vault root"], ["explore journal", "start in a folder"]],
  complete: "path",
  async run(ctx) {
    const dir = ctx.args[0] ? ctx.resolve(ctx.args[0]).replace(/\/$/, "") : ctx.cwd;
    if (dir && !ctx.deck.vault.entries.some((e) => e.isDir && e.path === dir)) return ctx.err(`explore: no folder ${ctx.args[0]}\n`), 1;
    const open = ctx.deck.workspace.findTab("explorer");
    if (open) await ctx.deck.workspace.closeTab(ctx.deck.workspace.tabs.indexOf(open));
    ctx.deck.openApp("explorer", dir);
  },
};

const termCmd: Command = {
  name: "term",
  summary: "the shell panel: its tabs (ibsh and your shells), the log; a terminal in the main window",
  usage:
    "term                 your system terminal (zsh, bash…)\n" +
    "term new [shell]     a new tab: ibsh, or one of your shells (term shells) — none: the default (Settings → SHELL)\n" +
    "term shells          the shells of this computer\n" +
    "term menu            the « + » menu (ctrl+shift+`)\n" +
    "term <n>             go to tab n (your terminals, then the ibsh tabs)\n" +
    "term close [n]       close one (× on its tab)\n" +
    "term rename [n] <name>   rename one (right-click on its tab); \"\" gives back its shell's name\n" +
    "term open            a terminal in the main window (a tab of its own)\n" +
    "term hide            fold the shell panel away (term show, ctrl+`)\n" +
    "term max             the shell becomes a big tab after the others (⤢)\n" +
    "term dock            a terminal tab goes back to the panel\n" +
    "term ibsh            ICEBREAKER's shell\n" +
    "term log             the log (what happened, with filters)\n" +
    "term restart         a fresh system shell\n" +
    "term mode system|ibsh   which one the panel uses",
  examples: [["term new ibsh", "a second ibsh, with its own folder and history"], ["term new bash", "a bash tab next to your zsh"], ["term shells", "what « + » offers"], ["term rename 2 build", "tab 2 is called « build »"]],
  complete: () => ["new", "shells", "menu", "close", "rename", "open", "dock", "hide", "show", "max", "ibsh", "log", "restart", "mode", ...(lastShells ?? []).map((x) => x.name)],
  async run(ctx) {
    const d = ctx.deck;
    const ws = d.workspace;
    const [a, b] = ctx.args;
    if (a === "mode") {
      if (b !== "system" && b !== "ibsh") return ctx.err("usage: term mode system|ibsh\n"), 1;
      d.settings.set("shell.mode", b);
      return 0;
    }
    if (a === "hide") return (ws.shellVisible = false), (ws.focus = "main"), 0;
    if (a === "show") return ws.showShellTab(ws.shellTab), 0;
    if (a === "max") return ws.toggleShellMax(), 0;
    if (a === "dock") return ws.dockTerminal(), 0;
    if (a === "open") return void d.openApp("terminal", { fresh: true }), 0;
    if (a === "ibsh") return ws.showShellTab("ibsh"), 0;
    if (a === "log" || a === "history" || a === "errors") return ws.showShellTab("log"), 0;
    if (a === "menu") return void ws.newShellMenu(), 0;
    if (a === "shells") {
      const list = (lastShells = await ws.loadShells());
      const def = d.settings.data.shell.defaultShell || "ibsh";
      ctx.out(`${def === "ibsh" ? "●" : " "} ibsh  ${fmt.dim(t("ICEBREAKER's own shell"))}\n`);
      for (const sh of list) ctx.out(`${def === sh.name || def === sh.path ? "●" : " "} ${sh.name.padEnd(5)} ${fmt.dim(sh.path)}\n`);
      if (!list.length) ctx.out(fmt.dim(`${d.platform.pty ? t("(the panel is in ibsh mode: term mode system)") : t("(your shells need the desktop app)")}\n`));
      return 0;
    }
    if (a === "new") {
      const want = (b ?? (d.settings.data.shell.defaultShell || "ibsh")).trim();
      if (want === "ibsh") return ws.newIbsh(), 0;
      if (!d.platform.pty) return ctx.err(`term: ${t("your shells need the desktop app (term new ibsh works here)")}\n`), 1;
      if (!ws.termAvailable) return ctx.err("term: the panel is in ibsh mode (term mode system)\n"), 1;
      const list = (lastShells = await ws.loadShells());
      const name = want.split(/[\\/]/).pop()!.replace(/\.exe$/i, "").toLowerCase();
      const found = list.find((x) => x.path === want || x.name === name);
      // asked by name with nothing listed (an old /etc/shells): the login shell, if it's that one
      if (!found && list.length) return ctx.err(`term: ${t("no shell « {x} » on this computer — term shells lists them", { x: want })}\n`), 1;
      return ws.newTerminal(found?.name), 0;
    }
    // the panel's tabs by number (your terminals, then the ibsh tabs) — rename, close, go
    const entries = ws.shellEntries();
    const pick = (n: string | undefined) => (n && /^\d+$/.test(n) ? entries[Number(n) - 1] : ws.shownEntry ?? undefined);
    if (a === "rename") {
      // term rename <name> (the one shown) · term rename <n> <name>
      const rest = ctx.args.slice(1);
      const e = rest.length > 1 && /^\d+$/.test(rest[0]) ? pick(rest.shift()) : pick(undefined);
      if (!e) return ctx.err("term: no such tab\n"), 1;
      const name = rest.join(" ").trim();
      if (!rest.length) return void ws.renameShellTab(e), 0;
      ws.renameEntry(e, name === '""' ? "" : name);
      const now = ws.shellEntries().find((x) => x.kind === e.kind && x.i === e.i);
      return ctx.out(`${t("tab")} ${entries.indexOf(entries.find((x) => x.kind === e.kind && x.i === e.i)!) + 1}: ${now?.name ?? name}\n`), 0;
    }
    if (a === "close") {
      const e = pick(b);
      if (!e) return ctx.err(`term: ${t("no tab {n} (there are {m})", { n: b ?? "", m: entries.length })}\n`), 1;
      return ws.closeEntry(e), 0;
    }
    if (a && /^\d+$/.test(a)) {
      const e = pick(a);
      if (!e) return ctx.err(`term: ${t("no tab {n} (there are {m})", { n: a, m: entries.length })}\n`), 1;
      return ws.showEntry(e), 0;
    }
    if (!d.platform.pty) return ctx.err("term: needs the desktop app\n"), 1;
    if (!ws.termAvailable) return ctx.err("term: the panel is in ibsh mode (term mode system)\n"), 1;
    if (a === "restart") return ws.sysTerm?.restart(), ws.showShellTab("term"), 0;
    ws.showShellTab("term");
  },
};

/** the shells last listed (Tab completes `term new <shell>` with them) */
let lastShells: { name: string; path: string }[] | null = null;

const macro: Command = {
  name: "macro",
  summary: "the buttons above your terminal: list, add, remove",
  usage: "macro                      list\nmacro add <label> <command>   {name} in the command is asked for on click\nmacro rm <label>\nmacro run <label>           press it (bind a key to this: right-click a macro → shortcut)\nmacro show | hide | toggle the row of buttons\nmacro reset                the default buttons",
  examples: [
    ['macro add deploy "git pull && npm run build"', "a deploy button"],
    ['macro add ssh-box "ssh {user}@my-server"', "asks who you are, then connects"],
    ["macro rm clear", ""],
  ],
  complete: () => ["add", "rm", "run", "show", "hide", "toggle", "reset"],
  run(ctx) {
    const s = ctx.deck.settings;
    const list = [...s.data.shell.macros];
    const [a, label, ...rest] = ctx.args;
    if (a === "show" || a === "hide" || a === "toggle") {
      s.set("shell.macrosShown", a === "toggle" ? s.data.shell.macrosShown === false : a === "show");
      return 0;
    }
    if (a === "run") {
      const m = list.find((x) => x.label === label);
      if (!m) return ctx.err(`macro: no "${label ?? ""}" (macro lists them)\n`), 1;
      void ctx.deck.workspace.runMacro(m);
      return 0;
    }
    if (!a) {
      for (const m of list) ctx.out(`${fmt.bold(m.label.padEnd(12))} ${fmt.dim(m.cmd)}\n`);
      return 0;
    }
    if (a === "reset") return s.set("shell.macros", []), s.set("shell.macros", DEFAULT_MACROS()), ctx.out("default macros back\n"), 0;
    if (a === "add") {
      const cmd = rest.join(" ").trim();
      if (!label || !cmd) return ctx.err("usage: macro add <label> <command>\n"), 1;
      const i = list.findIndex((m) => m.label === label);
      if (i >= 0) list[i] = { label, cmd };
      else list.push({ label, cmd });
      s.set("shell.macros", list);
      return 0;
    }
    if (a === "rm") {
      const next = list.filter((m) => m.label !== label);
      if (next.length === list.length) return ctx.err(`macro: no "${label ?? ""}"\n`), 1;
      s.set("shell.macros", next);
      return 0;
    }
    ctx.err("usage: macro [add <label> <command> | rm <label> | reset]\n");
    return 1;
  },
};

const menuCmd: Command = {
  name: "menu",
  aliases: ["wheel"],
  summary: "THE MENU: search everything, or a key + enter (⌘K, shift twice, hold RB)",
  usage: 'menu                        open it\nmenu ls                     every key on it, and where it comes from\nmenu add <key> "<cmd>"      ⌘K, <key>, enter runs the command\nmenu add "<cmd>"            asks for the key\nmenu rm <key>               one of yours off the menu',
  examples: [
    ['menu add t "launch todo"', "⌘K t ⏎ opens TODO"],
    ['menu add 1 "open notes/ideas.md"', "a note one key away"],
  ],
  complete: () => ["ls", "add", "rm"],
  run(ctx) {
    const d = ctx.deck;
    const [a, ...rest] = ctx.args;
    if (!a) return void d.workspace.menu(), 0;
    if (a === "ls") {
      for (const it of quickItems(d)) ctx.out(`${fmt.bold(`≡ ${it.key}`)}  ${it.label.padEnd(28)} ${fmt.dim(it.from)}\n`);
      return 0;
    }
    if (a === "add") {
      if (rest.length === 1) return addToMenu(d, rest[0], rest[0]), 0;
      const [key, ...cmd] = rest;
      if (!key || [...key].length !== 1 || !cmd.length) return ctx.err('usage: menu add <key> "<command>"\n'), 1;
      return d.act(`bind ${q(MENU + key)} ${q(cmd.join(" "))}`);
    }
    if (a === "rm") {
      const combo = normalizeCombo(`menu ${rest[0] ?? ""}`);
      if (!combo || !(combo in (d.settings.data.keys ?? {}))) return ctx.err(`menu: no key of yours on "${rest[0] ?? ""}" (menu ls)\n`), 1;
      return d.act(`unbind ${q(combo)}`);
    }
    return ctx.err("usage: menu [ls | add | rm]\n"), 1;
  },
};

/** The catalog in the shell: every block, by kind, searchable; --json for scripts. */
const catalogCmd: Command = {
  name: "catalog",
  aliases: ["blocks"],
  summary: "everything the deck can do — commands, settings, functions, shortcuts… — and how to call it",
  usage: "catalog                      the CATALOG page\ncatalog <kind> [words]       one kind: " + BLOCK_KINDS.join(" · ") + "\ncatalog all <words>          search every kind\ncatalog … --json             as JSON (scripts)",
  examples: [
    ["catalog function todo", "what the TODO module lets you call"],
    ["catalog setting voice", "every voice setting and its value"],
  ],
  complete: () => [...BLOCK_KINDS, "all", "--json"],
  run(ctx) {
    const d = ctx.deck;
    const json = ctx.args.includes("--json");
    const args = ctx.args.filter((a) => a !== "--json");
    if (!args.length && !json) return void d.openApp("blocks"), 0; // (the page's inner id stays "blocks": saved sessions)
    const [k, ...words] = args;
    const kind = (BLOCK_KINDS as readonly string[]).includes(k) ? (k as BlockKind) : undefined;
    const q = (kind || k === "all" ? words : args).join(" ");
    const list = d.catalog.info(kind, q);
    if (json) return ctx.out(`${JSON.stringify(list, null, 2)}\n`), 0;
    for (const b of list) ctx.out(`${fmt.dim(b.kind.padEnd(9))}${fmt.bold(b.name.padEnd(28))} ${b.doc.slice(0, 60)}${b.from !== "core" ? fmt.cyan(`  ${b.from}`) : ""}\n`);
    ctx.out(fmt.dim(`${list.length} entries\n`));
    return 0;
  },
};

/** Tell yourself something (scripts, macros, bound keys): a toast, or a real alert. */
const notifyCmd: Command = {
  name: "notify",
  summary: "a message on screen — or --alert: the way reminders call you (Settings → NOTIFICATIONS)",
  usage: 'notify <text>                     a toast\nnotify --ok | --warn | --error <text>\nnotify --alert "<title>" [body]   sound, screen, notification center, voice — as you set them',
  run(ctx) {
    const d = ctx.deck;
    const [first, ...rest] = ctx.args;
    if (!first) return ctx.err("usage: notify <text>\n"), 1;
    if (first === "--alert") return d.alert(rest[0] ?? "ICEBREAKER", rest.slice(1).join(" ")), 0;
    const kind = ({ "--ok": "success", "--warn": "warning", "--error": "error" } as const)[first as "--ok"];
    d.notify((kind ? rest : ctx.args).join(" "), kind ?? "info");
    return 0;
  },
};

const panelCmd: Command = {
  name: "panel",
  summary: "the side panel on the right: widgets always in view (◨ in the status bar)",
  usage: "panel                show / hide it\npanel show | hide\npanel add [widget]   one more (no name: the list; the same widget again: another copy)\npanel rm <widget>\npanel up | down <widget>   reorder\npanel height <widget> <lines>   how tall it is\npanel top <widget> <line>       where it starts (gaps allowed)\npanel ls",
  complete: () => ["show", "hide", "add", "rm", "up", "down", "height", "top", "ls"],
  run(ctx) {
    const d = ctx.deck;
    const s = d.settings;
    const p0 = s.data.panel;
    const cur = { shown: !!p0?.shown, widgets: [...(p0?.widgets ?? [])], heights: { ...(p0?.heights ?? {}) }, tops: { ...(p0?.tops ?? {}) } };
    // --keep: a widget moving here from HOME keeps its key (and its own settings)
    const keep = ctx.args.includes("--keep");
    const [a, id, n] = ctx.args.filter((x) => x !== "--keep");
    const save = (p: Partial<typeof cur>) => s.set("panel", { ...cur, ...p });
    // shown: the widgets, not a tab moved into the panel's frame
    if ((!a && !cur.shown) || a === "show") d.workspace.ownContent("panel");
    if (!a) return save({ shown: !cur.shown }), 0;
    if (a === "show" || a === "hide") return save({ shown: a === "show" }), 0;
    if (a === "ls") {
      for (const w of cur.widgets) ctx.out(`${w}${cur.heights[w] ? fmt.dim(`  ${cur.heights[w]} lines`) : ""}\n`);
      return 0;
    }
    if (a === "add") {
      if (!id) return void d.workspace.panelAdd(), 0;
      if (!d.widgets.get(widgetIdOf(id))) return ctx.err(`panel: no widget ${id} (home widgets)\n`), 1;
      const key = keep || id.includes("#") ? id : newWidgetKey(d, widgetIdOf(id));
      if (!cur.widgets.includes(key)) save({ shown: true, widgets: [...cur.widgets, key] });
      else save({ shown: true });
      return 0;
    }
    if (a === "rm") {
      const key = cur.widgets.includes(id ?? "") ? id! : cur.widgets.find((w) => widgetIdOf(w) === id);
      if (!key) return ctx.err(`panel: ${id ?? ""} isn't in the panel (panel ls)\n`), 1;
      const heights = { ...cur.heights };
      const tops = { ...cur.tops };
      delete heights[key];
      delete tops[key];
      save({ widgets: cur.widgets.filter((w) => w !== key), heights, tops });
      if (!allWidgetKeys(d).includes(key)) forgetWidget(d, key);
      return 0;
    }
    if (a === "up" || a === "down") {
      const w = [...cur.widgets];
      const i = w.indexOf(id ?? "");
      const j = i + (a === "up" ? -1 : 1);
      if (i < 0 || j < 0 || j >= w.length) return 0;
      [w[i], w[j]] = [w[j], w[i]];
      return save({ widgets: w }), 0;
    }
    if (a === "top") {
      // where it starts, in lines from the top of the panel (the panel keeps gaps: no gravity)
      const y = Math.round(Number(n));
      if (!id || !cur.widgets.includes(id) || !(y >= 0 && y <= 500)) return ctx.err("usage: panel top <widget> <line>\n"), 1;
      return save({ tops: { ...cur.tops, [id]: y } }), 0;
    }
    if (a === "layout") {
      // every widget's start line at once: panel layout clock=0 system=12 (the panel's drag and arrows use it)
      const tops = { ...cur.tops };
      for (const pair of ctx.args.slice(1)) {
        const [k, v] = pair.split("=");
        if (cur.widgets.includes(k) && Number(v) >= 0) tops[k] = Math.round(Number(v));
      }
      return save({ tops }), 0;
    }
    if (a === "height") {
      const h = Math.round(Number(n));
      if (!id || !cur.widgets.includes(id) || !(h >= 3 && h <= 60)) return ctx.err("usage: panel height <widget> <3-60>\n"), 1;
      return save({ heights: { ...cur.heights, [id]: h } }), 0;
    }
    return ctx.err("usage: panel [show | hide | add | rm | up | down | height | ls]\n"), 1;
  },
};

export const uiCommands: Command[] = [
  layoutCommand,
  frameCommand,
  statusbarCommand,
  menuCmd,
  notifyCmd,
  catalogCmd,
  panelCmd,
  worldclockCommand,
  quoteCommand,
  ...popupCommands,
  explore,
  macro,
  termCmd,
  homeCmd,
  widget,
  tab,
  launch,
  view,
  scale,
  palette,
  osk,
  {
    name: "settings",
    aliases: ["prefs"],
    summary: "settings (ctrl+,) · settings <category>: open at it (privacy, weather, todo…)",
    usage: "settings              the settings\nsettings <category>   open at that category or module's settings",
    examples: [["settings weather", "the weather module's settings"]],
    run(ctx) {
      const app = ctx.deck.openApp("settings") as { goTo?(n: string): boolean } | null;
      const want = ctx.args.join(" ");
      if (want && app?.goTo && !app.goTo(want)) return ctx.err(`settings: ${t("no category “{name}”", { name: want })}\n`), 1;
    },
  },
  {
    name: "modules",
    summary: "all apps and plugins (key on HOME: m); what they expose to each other",
    usage: "modules [open]                  the MODULES ring\nmodules ls                      every module, on or off\nmodules on|off <module>         switch one on or off (plugin enable|disable)\nmodules tag <module> <colour>   give it a colour (red, orange, yellow, green, cyan, blue, purple, pink) · modules tag <module> rm\nmodules view <colour…> | off   MODULES shows those colours (or: / to search, the squares)\nmodules api [module]            functions modules expose to each other (ib.modules)\nmodules call <module> <fn> [args…]   call one (args: text, numbers or JSON)",
    examples: [
      ["modules api", "every function a module can call"],
      ['modules call todo add "walk the dog"', "add a task through the TODO module's API"],
      ["modules call sysmon stats", "the machine's vitals as JSON"],
    ],
    complete: () => ["open", "ls", "on", "off", "api", "call", "tag", "view", "set"],
    async run(ctx) {
      const d = ctx.deck;
      const [sub, mod, fn, ...rest] = ctx.args;
      if (!sub || sub === "open") return void d.openApp("modules"), 0;
      // `modules on todo`: the word everything else uses ("module"); `plugin enable` stays the developers'
      if (sub === "on" || sub === "off") {
        if (!mod) return ctx.err(`usage: modules ${sub} <module>\n`), 1;
        return ctx.shell.run(`plugin ${sub === "on" ? "enable" : "disable"} ${mod}`);
      }
      if (sub === "ls" || sub === "list") return ctx.shell.run("plugin ls");
      if (sub === "tag") {
        if (!mod || !fn) return ctx.err(`usage: modules tag <module> <colour|rm>   (${TAG_NAMES.join(", ")})\n`), 1;
        if (!d.plugins.list().some((p) => p.manifest.id === mod)) return ctx.err(`modules: no module ${mod}\n`), 1;
        const tags = { ...(d.settings.data.moduleTags ?? {}) };
        if (fn === "rm" || fn === "none" || fn === "off") delete tags[mod];
        else if (isTagColor(fn)) tags[mod] = fn;
        else return ctx.err(`modules: ${fn} isn't a colour (${TAG_NAMES.join(", ")})\n`), 1;
        d.settings.set("moduleTags", tags);
        return ctx.out(`${mod}: ${tags[mod] ?? "no colour"}\n`), 0;
      }
      if (sub === "view") {
        const app = (d.workspace.findTab("modules") ?? d.openApp("modules")) as { filter?: { colours: Set<string>; clear(): void } } | null;
        if (!app?.filter) return 1;
        const cs = [mod, fn, ...rest].filter(Boolean) as string[];
        if (!cs.length || cs[0] === "off" || cs[0] === "all") app.filter.clear();
        else if (cs.every(isTagColor)) app.filter.colours = new Set(cs);
        else return ctx.err(`usage: modules view <colour…> | off   (${TAG_NAMES.join(", ")})\n`), 1;
        d.requestFrame();
        return 0;
      }
      if (sub === "api") {
        const list = d.services.list(mod);
        if (!list.length) return ctx.out(fmt.dim(mod ? `${mod} exposes nothing (or is off)\n` : "nothing exposed\n")), 0;
        let last = "";
        for (const s of list) {
          if (s.module !== last) ctx.out(`${fmt.bold(s.module)}\n`), (last = s.module);
          ctx.out(`  ${fmt.cyan(s.name.padEnd(12))} ${s.doc}${s.needs ? fmt.yellow(`  [${s.needs}]`) : ""}\n`);
        }
        return 0;
      }
      if (sub === "set") {
        // modules set <module> <key> <value>
        const value = rest.join(" ");
        if (!mod || !fn) return ctx.err("usage: modules set <module> <key> <value>\n"), 1;
        const spec = d.moduleSettings.get(mod)?.find((x) => x.key === fn);
        if (!spec) return ctx.err(`modules: ${mod} has no setting "${fn}"\n`), 1;
        d.setModuleSetting(mod, fn, spec.type === "number" ? Number(value) : spec.type === "toggle" ? /^(on|true|1)$/.test(value) : value);
        return ctx.out(`${mod}.${fn} = ${value}\n`), 0;
      }
      if (sub === "call") {
        if (!mod || !fn) return ctx.err("usage: modules call <module> <fn> [args…]\n"), 1;
        const args = rest.map((a) => {
          try {
            return JSON.parse(a);
          } catch {
            return a;
          }
        });
        try {
          // the shell is you: every permission
          const out = await d.services.call({ id: "shell", permissions: "all" }, mod, fn, args);
          if (out !== undefined) ctx.out(`${typeof out === "string" ? out : JSON.stringify(out, null, 2)}\n`);
          return 0;
        } catch (e) {
          return ctx.err(`modules: ${e instanceof Error ? e.message : e}\n`), 1;
        }
      }
      return ctx.err("usage: modules [api [module] | call <module> <fn> [args…]]\n"), 1;
    },
  },
  opener("manual", "help", "the manual: keys, mouse, gamepad, commands (F1)"),
  opener("setup", "setup", "the first-run questions again, to change your answers (◆ menu → setup)"),
];
