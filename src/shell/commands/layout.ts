import { fmt } from "../../core/ansi";
import { osKeys } from "../../core/keyhints";
import type { Command } from "../types";
import { SHELL_RATIO } from "../../workspace/workspace";
import { moveStatusItem, STATUS_IDS, STATUS_ITEMS, statusOrder } from "../../workspace/statusbar";
import { CLASSIC, describe, moveFrame, parseArrangement, PRESETS, type FrameId, type Side } from "../../workspace/layout/arrange";

/** what you call a frame → its id ("tree" is the vault frame) */
const NAMES: Record<string, FrameId> = { tree: "vault", vault: "vault", panel: "panel", shell: "shell", terminal: "shell", page: "main", main: "main" };
const SIDES: Side[] = ["left", "right", "top", "bottom"];

/** Where the frames sit: see it, a ready-made arrangement, back to today's (docs/FRAMES.md). */
export const layoutCommand: Command = {
  name: "layout",
  summary: "where the frames sit (the tree, the page, the panel, the shell): ready-made layouts, back to the classic one",
  usage:
    "layout                    where each frame sits now\n" +
    "layout presets            the ready-made layouts\n" +
    "layout preset <name>      one of them (⌘Z undoes it)\n" +
    "layout reset              the classic layout back\n" +
    "frame move <frame> <side> one frame along a side (frame --help)\n" +
    "(in ibsh: modules and your real terminal can look, not rearrange the screen)",
  examples: [["layout preset shell-right", "the shell along the right edge"], ["layout reset", "as it always was"]],
  complete: () => ["presets", "preset", "reset", ...Object.keys(PRESETS)],
  run(ctx) {
    const d = ctx.deck;
    const [a, b] = ctx.args;
    const saved = d.settings.data.layout;
    if (!a) {
      const arr = parseArrangement(saved) ?? CLASSIC;
      const name = parseArrangement(saved) ? (saved.preset ?? "your own") : "classic";
      ctx.out(`${fmt.bold("layout")} ${name}${fmt.dim("  (layout presets · frame move <frame> <side>)")}\n`);
      for (const line of describe(arr)) ctx.out(`  ${line}\n`);
      ctx.out(fmt.dim(osKeys("  hidden frames give their room to the others: ⌘B the tree, ⌘⇧P the panel, ctrl+` the shell\n")));
      return 0;
    }
    if (a === "presets") {
      for (const [name, p] of Object.entries(PRESETS)) ctx.out(`${fmt.bold(name.padEnd(13))} ${p.doc}\n`);
      return 0;
    }
    if (a === "reset") {
      d.settings.set("layout", {});
      // the shell's height too (dragging its top border changes it, apart from the arrangement)
      d.workspace.shellRatio = SHELL_RATIO;
      d.requestFrame();
      return ctx.out("layout: classic\n"), 0;
    }
    if (a === "preset") {
      const p = b ? PRESETS[b] : undefined;
      if (!p) return ctx.err(`usage: layout preset ${Object.keys(PRESETS).join("|")}\n`), 1;
      d.settings.set("layout", b === "classic" ? {} : { version: 1, preset: b, root: JSON.parse(JSON.stringify(p.root)) });
      d.requestFrame();
      return ctx.out(osKeys(`layout: ${b} — ⌘Z puts the last one back\n`)), 0;
    }
    return ctx.err("usage: layout [presets | preset <name> | reset]\n"), 1;
  },
};

/** Move one frame along a side of the screen. */
export const frameCommand: Command = {
  name: "frame",
  summary: "move a frame (the tree, the panel, the shell) along a side of the screen, fold it into a strip",
  usage:
    "frame move <tree|panel|shell> <left|right|top|bottom>   it goes along that edge, the rest keeps its places\n" +
    "frame fold <tree|panel|shell>     a thin strip with its name (a click on it opens it again)\n" +
    "frame unfold <tree|panel|shell>   open it again\n" +
    "frame solo                        the page alone: the tree, the panel and the shell away (again: they come back)\n" +
    "(⌘Z undoes any of these; drag the border between two frames to resize them)",
  examples: [["frame move shell right", "the shell along the right edge"], ["frame move tree bottom", "the tree along the bottom"], ["frame fold panel", "the panel folded into a strip"]],
  complete: () => ["move", "fold", "unfold", "solo", "tree", "panel", "shell", ...SIDES],
  run(ctx) {
    const d = ctx.deck;
    const [a, who, side] = ctx.args;
    const id = who ? NAMES[who.toLowerCase()] : undefined;
    if (a === "solo") {
      d.workspace.toggleSolo();
      return ctx.out(d.workspace.solo ? "the page alone — frame solo again brings the rest back\n" : "the frames are back\n"), 0;
    }
    if (a === "fold" || a === "unfold") {
      if (!id || id === "main") return ctx.err("usage: frame fold|unfold <tree|panel|shell> (the page never folds)\n"), 1;
      d.workspace.setFrameFolded(id, a === "fold");
      return ctx.out(`${who} ${a === "fold" ? "folded — a click on its strip opens it" : "open"}\n`), 0;
    }
    if (a !== "move" || !id || !SIDES.includes(side as Side)) return ctx.err(`usage: ${frameCommand.usage}\n`), 1;
    if (id === "main") return ctx.err("frame: the page stays where it is — move the others around it\n"), 1;
    const arr = parseArrangement(d.settings.data.layout) ?? CLASSIC;
    const ws = d.workspace;
    // one ⌘Z step: the move, and the panel switched on to see it
    d.history.group(`frame move ${who} ${side}`, () => {
      d.settings.set("layout", { version: 1, root: moveFrame(arr, id, side as Side) });
      if (id === "panel" && !d.settings.data.panel?.shown) d.settings.set("panel.shown", true);
    });
    // a frame moved while folded away: shown, so the move is seen
    if (id === "vault" && !ws.sidebarVisible) ws.toggleSidebar();
    if (id === "shell" && !ws.shellVisible) ws.toggleShell(true);
    d.requestFrame();
    return ctx.out(osKeys(`${who} → ${side} — ⌘Z puts it back · layout reset for the classic layout\n`)), 0;
  },
};

/** The status bar's right side: its items, their order, which are hidden (workspace/statusbar.ts). */
export const statusbarCommand: Command = {
  name: "statusbar",
  summary: "arrange the status bar: which items, in which order (or drag one sideways, right-click it)",
  usage:
    "statusbar                       its items, in order, and the hidden ones\n" +
    "statusbar move <item> left|right|<n>   one place left / right, or to place n (1 = first)\n" +
    "statusbar hide <item>           take it off the bar\n" +
    "statusbar show <item>           put it back\n" +
    "statusbar order <items…>        this order (the ones not named keep their default places)\n" +
    "statusbar reset                 back to the default",
  examples: [["statusbar move help 1", "the manual first"], ["statusbar hide screensaver", "no ☾ on the bar"]],
  complete: () => ["move", "hide", "show", "order", "reset", ...STATUS_IDS],
  run(ctx) {
    const d = ctx.deck;
    const [a, id, where] = ctx.args;
    const cfg = d.settings.data.statusBar ?? { order: [], hidden: [] };
    const hidden = new Set(cfg.hidden ?? []);
    const save = (order: string[], h = hidden) => {
      d.settings.set("statusBar", { order, hidden: [...h] });
      d.requestFrame();
    };
    const known = (x: string | undefined): x is string => !!x && STATUS_IDS.includes(x);
    if (!a) {
      for (const x of statusOrder(cfg)) ctx.out(`  ${fmt.bold(x.padEnd(12))} ${fmt.dim(STATUS_ITEMS.find((i) => i.id === x)?.about ?? "")}\n`);
      if (hidden.size) ctx.out(fmt.dim(`hidden: ${[...hidden].join(" ")} (statusbar show <item>)\n`));
      return 0;
    }
    if (a === "reset") return save([], new Set()), ctx.out(fmt.dim("the status bar is back to its default\n")), 0;
    if (a === "order") {
      const ids = ctx.args.slice(1).filter(known);
      if (!ids.length) return ctx.err(`statusbar order: name some items (${STATUS_IDS.join(" ")})\n`), 1;
      return save(statusOrder({ order: ids, hidden: [] })), 0;
    }
    if (!known(id)) return ctx.err(`statusbar: no item "${id ?? ""}" (${STATUS_IDS.join(" ")})\n`), 1;
    if (a === "hide" || a === "show") {
      if (a === "hide") hidden.add(id);
      else hidden.delete(id);
      save(cfg.order ?? [], hidden);
      return ctx.out(fmt.dim(a === "hide" ? `${id} hidden — statusbar show ${id} brings it back\n` : `${id} is back\n`)), 0;
    }
    if (a === "move") {
      const shown = statusOrder({ order: cfg.order, hidden: [] });
      const from = shown.indexOf(id);
      const to = where === "left" ? from - 1 : where === "right" ? from + 1 : Number(where) - 1;
      if (!Number.isFinite(to)) return ctx.err("usage: statusbar move <item> left|right|<n>\n"), 1;
      save(moveStatusItem(shown, id, to));
      return 0;
    }
    return ctx.err(`usage: ${statusbarCommand.usage}\n`), 1;
  },
};
