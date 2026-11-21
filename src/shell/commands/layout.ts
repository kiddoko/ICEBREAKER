import { fmt } from "../../core/ansi";
import type { Command } from "../types";
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
    "frame move <frame> <side> one frame along a side (frame --help)",
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
      ctx.out(fmt.dim("  hidden frames give their room to the others: ⌘B the tree, ⌘⇧P the panel, ctrl+` the shell\n"));
      return 0;
    }
    if (a === "presets") {
      for (const [name, p] of Object.entries(PRESETS)) ctx.out(`${fmt.bold(name.padEnd(13))} ${p.doc}\n`);
      return 0;
    }
    if (a === "reset") {
      d.settings.set("layout", {});
      d.requestFrame();
      return ctx.out("layout: classic\n"), 0;
    }
    if (a === "preset") {
      const p = b ? PRESETS[b] : undefined;
      if (!p) return ctx.err(`usage: layout preset ${Object.keys(PRESETS).join("|")}\n`), 1;
      d.settings.set("layout", b === "classic" ? {} : { version: 1, preset: b, root: JSON.parse(JSON.stringify(p.root)) });
      d.requestFrame();
      return ctx.out(`layout: ${b} — ⌘Z puts the last one back\n`), 0;
    }
    return ctx.err("usage: layout [presets | preset <name> | reset]\n"), 1;
  },
};

/** Move one frame along a side of the screen. */
export const frameCommand: Command = {
  name: "frame",
  summary: "move a frame (the tree, the panel, the shell) along a side of the screen",
  usage: "frame move <tree|panel|shell> <left|right|top|bottom>   it goes along that edge, the rest keeps its places (⌘Z undoes it)",
  examples: [["frame move shell right", "the shell along the right edge"], ["frame move tree bottom", "the tree along the bottom"], ["frame move panel left", "the panel on the left"]],
  complete: () => ["move", "tree", "panel", "shell", ...SIDES],
  run(ctx) {
    const d = ctx.deck;
    const [a, who, side] = ctx.args;
    const id = who ? NAMES[who.toLowerCase()] : undefined;
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
    return ctx.out(`${who} → ${side} — ⌘Z puts it back · layout reset for the classic layout\n`), 0;
  },
};
