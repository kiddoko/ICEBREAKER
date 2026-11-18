import { fmt } from "../../core/ansi";
import { HomeApp } from "../../apps/home";
import { DEFAULT_SETTINGS } from "../../core/settings";

const DEFAULT_MACROS = () => DEFAULT_SETTINGS.shell.macros.map((m) => ({ ...m }));
import type { Command, ShellContext } from "../types";

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
  usage: "home                open HOME (key: h)\nhome edit           rearrange (key: e)\nhome done           leave edit mode\nhome add <widget>   put a widget on the grid\nhome rm <widget>    take it off\nhome widgets        what's available\nhome reset          default layout",
  complete: () => ["edit", "done", "add", "rm", "widgets", "reset", "page", "move"],
  run(ctx) {
    const d = ctx.deck;
    const [sub, id] = ctx.args;
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
    if (sub === "add" || sub === "rm") {
      if (!id && sub === "add") return h.add(), 0; // no name: the picker
      if (!id) return ctx.err(`usage: home ${sub} <widget>   (home widgets lists them)\n`), 1;
      if (!d.widgets.get(id)) return ctx.err(`home: no widget "${id}" (home widgets)\n`), 1;
      const ok = sub === "add" ? h.place(id) : h.unplace(id);
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
  usage: "widget <id>     e.g. widget focus (start/pause), widget weather (refresh)",
  complete: () => [],
  run(ctx) {
    const id = ctx.args[0];
    const spec = id ? ctx.deck.widgets.get(id) : undefined;
    if (!spec) return ctx.err("usage: widget <id>   (home widgets lists them)\n"), 1;
    if (!spec.activate) return ctx.out(fmt.dim(`${id} has no action\n`)), 0;
    spec.activate({ deck: ctx.deck, focused: true });
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
  usage: "tab              list\ntab <n>          switch (keys: ctrl+1…9)\ntab next | prev  (ctrl+tab)\ntab close [n]    (ctrl+w)",
  complete: () => ["next", "prev", "close"],
  async run(ctx) {
    const ws = ctx.deck.workspace;
    const [a, b] = ctx.args;
    if (!a) {
      ws.tabs.forEach((t, i) => ctx.out(`${i === ws.active ? fmt.magenta("▸") : " "} ${i + 1} ${t.title()}${t.dirty?.() ? fmt.yellow(" ●") : ""}\n`));
      return 0;
    }
    if (a === "next") return ws.switchTab(ws.active + 1), 0;
    if (a === "prev") return ws.switchTab(ws.active - 1), 0;
    if (a === "close") {
      const n = b ? Number(b) - 1 : ws.active;
      if (!ws.tabs[n]) return ctx.err(`tab: no tab ${b}\n`), 1;
      await ws.closeTab(n);
      return 0;
    }
    const n = Number(a) - 1;
    if (!ws.tabs[n]) return ctx.err(`tab: no tab ${a}\n`), 1;
    ws.switchTab(n);
  },
};

const launch: Command = {
  name: "launch",
  examples: [
    ["launch", "list apps and modules"],
    ["launch todo", "open the TODO app"],
  ],
  aliases: ["app"],
  summary: "open an app or module by name",
  usage: "launch           list them\nlaunch <name>    e.g. launch sysmon, launch lingo",
  complete: () => [],
  run(ctx) {
    const d = ctx.deck;
    const kind = ctx.args[0];
    if (!kind) {
      for (const a of d.apps.list()) if (a.kind !== "note") ctx.out(`${(a.icon ?? "·").padEnd(2)} ${a.kind.padEnd(10)} ${fmt.dim(a.description ?? "")}\n`);
      return 0;
    }
    if (!d.apps.get(kind)) return ctx.err(`launch: no app "${kind}" (launch to list)\n`), 1;
    d.openApp(kind);
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
  summary: "show / hide parts of the screen",
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
  summary: "the command palette (ctrl+k): search everything",
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
  summary: "the shell panel's tabs: your terminal, ibsh, history",
  usage: "term            your system terminal (zsh, bash…)\nterm max        big shell, the page goes below (again: back)\nterm ibsh       ICEBREAKER's shell\nterm history    what clicks ran\nterm restart    a fresh system shell\nterm mode system|ibsh   which one the panel uses",
  examples: [["term", "jump to your real terminal"], ["term history", "see what your clicks ran"], ["term mode ibsh", "vault-only shell, rm goes to .trash"]],
  complete: () => ["ibsh", "history", "restart", "mode"],
  run(ctx) {
    const ws = ctx.deck.workspace;
    const [a, b] = ctx.args;
    if (a === "mode") {
      if (b !== "system" && b !== "ibsh") return ctx.err("usage: term mode system|ibsh\n"), 1;
      ctx.deck.settings.set("shell.mode", b);
      return 0;
    }
    if (a === "restart") return ws.sysTerm?.restart(), ws.showShellTab("term"), 0;
    if (a === "max") return ws.toggleShellMax(), 0;
    if (!a && !ws.termAvailable) return ctx.err(ctx.deck.platform.pty ? "term: the panel is in ibsh mode (term mode system)\n" : "term: needs the desktop app\n"), 1;
    ws.showShellTab(a === "ibsh" ? "ibsh" : a === "history" ? "history" : "term");
  },
};

const macro: Command = {
  name: "macro",
  summary: "the buttons above your terminal: list, add, remove",
  usage: "macro                      list\nmacro add <label> <command>   {name} in the command is asked for on click\nmacro rm <label>\nmacro reset                the default buttons",
  examples: [
    ['macro add deploy "git pull && npm run build"', "a deploy button"],
    ['macro add ssh-box "ssh {user}@my-server"', "asks who you are, then connects"],
    ["macro rm clear", ""],
  ],
  complete: () => ["add", "rm", "reset"],
  run(ctx) {
    const s = ctx.deck.settings;
    const list = [...s.data.shell.macros];
    const [a, label, ...rest] = ctx.args;
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

export const uiCommands: Command[] = [
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
  opener("settings", "settings", "settings (ctrl+,)", ["prefs"]),
  opener("modules", "modules", "all apps and plugins (key on HOME: m)"),
  opener("manual", "help", "the manual: keys, mouse, gamepad, commands (F1)"),
];
