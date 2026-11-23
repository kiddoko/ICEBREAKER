import { FX_LEVELS, getFx } from "../../core/fxlevels";
import { isLogKind, LOG_KINDS } from "../../core/eventlog";
import type { Command } from "../types";
import { fmt } from "../../core/ansi";
import { groupIssues, parseSize, PROBE_SIZES, type SizeReport } from "../../ui/probe";
import type { Deck } from "../../deck";
import { padIcon, type PadButton, type PadKind } from "../../core/padglyphs";

/** The LOG tab by command: open it, choose what it shows, print the last lines, empty it. */
export const logCommand: Command = {
  name: "log",
  summary: "the log: what you typed, what clicks ran, errors, messages, debug — on the shell's right (or its LOG tab)",
  usage:
    "log                     open the LOG tab\n" +
    "log show <kinds…>       show only these: cmd action error notify debug access (several at once)\n" +
    "log show all            show everything again\n" +
    "log tail [n]            print the last n lines here (default 20)\n" +
    "log clear [kinds…]      empty it (or only those kinds)\n" +
    "log side on|off         a wide shell shows the log on its right (on) or as a tab (off)",
  examples: [["log show error debug", "only errors and debug lines"], ["log tail 50", "the last 50 things that happened"]],
  complete: () => ["show", "tail", "clear", "side", "all", ...LOG_KINDS.map((k) => k.kind)],
  run(ctx) {
    const d = ctx.deck;
    const [a, ...rest] = ctx.args;
    const pane = d.workspace.logPane;
    if (!a) return d.workspace.showShellTab("log"), 0;
    if (a === "show") {
      pane.show.clear();
      for (const k of rest) {
        if (k === "all") continue;
        if (!isLogKind(k)) return ctx.err(`log: no kind "${k}" (${LOG_KINDS.map((k) => k.kind).join(" ")})\n`), 1;
        pane.show.add(k);
      }
      d.workspace.showShellTab("log");
      return 0;
    }
    if (a === "side") {
      const on = rest[0] === "on" ? true : rest[0] === "off" ? false : d.settings.data.shell.logSide === false;
      d.settings.set("shell.logSide", on);
      return ctx.out(fmt.dim(on ? "the log sits on the shell's right when the shell is wide\n" : "the log is a tab of the shell\n")), 0;
    }
    if (a === "clear") {
      const kinds = rest.filter(isLogKind);
      d.log.clear(kinds.length ? kinds : undefined);
      if (!kinds.length || kinds.includes("error")) d.errors.clear();
      return ctx.out(fmt.dim("log emptied\n")), 0;
    }
    if (a === "tail") {
      const n = Math.max(1, Number(rest[0]) || 20);
      for (const e of d.log.list.slice(-n)) {
        const glyph = LOG_KINDS.find((k) => k.kind === e.kind)?.glyph ?? "·";
        const time = new Date(e.at).toLocaleTimeString(undefined, { hour12: false });
        ctx.out(`${fmt.dim(time)} ${glyph} ${e.kind === "error" ? fmt.red(e.text) : e.text}${e.source && e.kind === "debug" ? fmt.dim(` [${e.source}]`) : ""}\n`);
        if (e.detail) ctx.out(fmt.dim(`         ${e.detail.trim().split("\n").join("\n         ")}\n`));
      }
      return 0;
    }
    return ctx.err("usage: log [show <kinds…> | tail [n] | clear | side on|off]\n"), 1;
  },
};

/** Tools for people building ICEBREAKER or a module. */
export const debugCommand: Command = {
  name: "debug",
  summary: "developer tools: the deck's own events in the log, clickable areas, state",
  usage:
    "debug                   what's on\n" +
    "debug on|off            the deck logs its own events (slow frames, pages opened, settings changed)\n" +
    "debug hits              outline every clickable area (green: a command, yellow: a menu) — again to stop\n" +
    "debug log <text>        write a debug line (modules: ib.debug)\n" +
    "debug state             where things are: page, focus, panes, frame rate, grid, modules\n" +
    "debug perf [seconds]    measure the frames while you use the deck (3 s): building, painting, cells, stutters\n" +
    "debug layout [WxH…]     draw this screen at many sizes (off screen) and list what is cut or overlaps (--json)\n" +
    "debug layout pages      the same for every page and module page, one after the other\n" +
    "debug layout show       mark it on the screen as you go: red = cut, yellow = over another text — again to stop\n" +
    "debug pad               the gamepad's buttons in pixel art, for each kind of pad (and which one is plugged in)",
  examples: [["debug on", "then log show debug"], ["debug hits", "see what is clickable where"], ["debug layout", "what breaks at 14 screen sizes"], ["debug layout 100x30 300x60", "two sizes only"]],
  complete: () => ["on", "off", "hits", "log", "state", "perf", "layout", "pad"],
  async run(ctx) {
    const d = ctx.deck;
    const [a, ...rest] = ctx.args;
    const ws = d.workspace;
    if (!a) {
      ctx.out(`events  ${d.log.debugOn ? fmt.green("on") : fmt.gray("off")}\nhits    ${d.showHits ? fmt.green("on") : fmt.gray("off")}\nlines   ${d.log.list.filter((e) => e.kind === "debug").length} in the log (log show debug)\n`);
      return 0;
    }
    if (a === "on" || a === "off") {
      d.log.debugOn = a === "on";
      d.debug(`debug ${a}`);
      return ctx.out(`debug events ${a === "on" ? fmt.green("on") : "off"} — ${fmt.dim("log show debug")}\n`), 0;
    }
    if (a === "hits") {
      d.showHits = !d.showHits;
      d.requestFrame();
      return ctx.out(`clickable areas ${d.showHits ? fmt.green("shown") : "hidden"}\n`), 0;
    }
    if (a === "log") {
      const text = rest.join(" ").trim();
      if (!text) return ctx.err("usage: debug log <text>\n"), 1;
      d.debug(text, "shell");
      return 0;
    }
    if (a === "perf") {
      const secs = Math.max(1, Math.min(30, Number(rest[0]) || 3));
      ctx.out(fmt.dim(`measuring for ${secs} s — use the deck now (scroll, turn the ring…)\n`));
      d.renderer.takeAtlasMisses();
      d.perfRec = { until: performance.now() + secs * 1000, frames: [] };
      await new Promise((r) => setTimeout(r, secs * 1000 + 50));
      const f = d.perfRec.frames;
      d.perfRec = null;
      if (f.length < 2) return ctx.out("no frames drawn (nothing moved)\n"), 0;
      const stat = (xs: number[]) => {
        const s = [...xs].sort((p, q) => p - q);
        return `avg ${(xs.reduce((p, q) => p + q, 0) / xs.length).toFixed(1)} · p95 ${s[Math.floor(s.length * 0.95)].toFixed(1)} · max ${s[s.length - 1].toFixed(1)}`;
      };
      // a frame is late when it comes much later than the one before asked (an animation at
      // 12 fps on purpose isn't a stutter; a ring that asked for the next frame now and got it 80 ms later is)
      const gaps = f.slice(1).map((x, i) => x.at - f[i].at);
      const late = f.slice(1).map((x, i) => x.at - f[i].at - Math.max(0, Math.min(1000, f[i].wanted)));
      const moving = f.slice(1).filter((_, i) => f[i].wanted <= 17).length;
      const janks = late.filter((g) => g > 12).length;
      const fx = d.settings.data.fx;
      ctx.out(
        [
          `${fmt.bold("frames")}   ${f.length} in ${secs} s (${Math.round(f.length / secs)} fps while something moved) · ${d.renderer.cols}×${d.renderer.rows} cells`,
          `${fmt.bold("build")}    ${stat(f.map((x) => x.build))} ms  ${fmt.dim("(the page drawn into the grid: JavaScript)")}`,
          `${fmt.bold("paint")}    ${stat(f.map((x) => x.paint))} ms  ${fmt.dim("(changed cells onto the canvas)")}`,
          `${fmt.bold("cells")}    ${stat(f.map((x) => x.cells))} repainted a frame`,
          `${fmt.bold("glyphs")}   ${stat(f.map((x) => x.glyphs))} new a frame  ${fmt.dim("(drawn for the first time: should be ~0 once things move)")}`,
          `${fmt.bold("gaps")}     ${stat(gaps)} ms between frames · ${moving} frames asked for at once`,
          `${fmt.bold("late")}     ${stat(late)} ms after they were asked for · ${janks ? fmt.yellow(`${janks} late frame(s) > 12 ms — the screen's work (effects, compositing), not JavaScript`) : fmt.green("none late")}`,
          `${fmt.bold("fx")}       ${FX_LEVELS.map((k) => [k, getFx(d, k)] as const).filter(([k, v]) => v > 0 && !(k === "sharpness" && v === 100)).map(([k, v]) => `${k} ${v}`).join(" · ") || "none"}${fx.ambient ? " · ambient" : ""}${fx.flicker ? " · flicker" : ""}${fx.glitch ? " · glitch" : ""} · theme ${d.theme.name}`,
          "",
        ].join("\n"),
      );
      return 0;
    }
    if (a === "layout") return layoutCheck(ctx.deck, rest, ctx.out);
    if (a === "pad") {
      // every button's icon (core/padglyphs.ts), pad by pad: two cells each, then its name
      const order: PadButton[] = ["south", "east", "west", "north", "lb", "rb", "lt", "rt", "select", "start", "home", "ls", "rs", "dpad", "up", "down", "left", "right"];
      const kinds: PadKind[] = ["xbox", "playstation", "nintendo", "generic"];
      const plugged = d.gamepad.connected ? d.gamepad.kind : null;
      for (const k of kinds) {
        ctx.out(`${k === plugged ? fmt.green(`◈ ${k.padEnd(12)}`) : `  ${k.padEnd(12)}`}${order.map((b) => padIcon(b, k).text).join(" ")}\n`);
        ctx.out(fmt.dim(`  ${"".padEnd(12)}${order.map((b) => padIcon(b, k).name.slice(0, 2).padEnd(2)).join(" ")}\n`));
      }
      ctx.out(fmt.dim(plugged ? `plugged in: ${d.gamepad.name}\n` : "no pad plugged in\n"));
      return 0;
    }
    if (a === "state") {
      const g = d.gridSize;
      const lines = [
        ["page", `${ws.activeApp?.kind ?? "-"} (${ws.tabs.length} tabs)`],
        ["focus", ws.focus],
        ["fade", (() => { const f = d.renderer.fadeStats(); return `${d.renderer.fadeMs} ms · ${f.fading} fading · ${f.stuck} stuck · frame ${d.renderer.fading ? "asked" : "idle"}`; })()],
        ["panes", `tree ${ws.sidebarVisible ? "on" : "off"} · shell ${ws.shellVisible ? `on (${ws.shellTab})` : "off"}`],
        ["frames", `${d.loop.fps} fps · ${d.loop.frameMs.toFixed(1)} ms a frame`],
        ["grid", `${g.cols}×${g.rows} cells`],
        ["modules", `${d.plugins.list().filter((p) => p.active).length} on / ${d.plugins.list().length}`],
        ["log", `${d.log.list.length} lines · ${d.errors.list.length} errors`],
      ];
      for (const [k, v] of lines) ctx.out(`${fmt.dim(k.padEnd(8))} ${v}\n`);
      return 0;
    }
    return ctx.err("usage: debug [on|off|hits|log <text>|state|perf|layout|pad]\n"), 1;
  },
};

/** pages `debug layout pages` doesn't open: they start something (a shell, the setup) or need a file */
const NOT_PROBED = new Set(["note", "setup", "terminal", "ibsh"]);

/**
 * `debug layout`: the screen (or every page) drawn off screen at many sizes, with the
 * layout probe (ui/probe.ts) — what is cut, what is drawn over another text, and the
 * line of code that drew it. docs/LAYOUT.md "Checking a page".
 */
async function layoutCheck(d: Deck, args: string[], out: (s: string) => void): Promise<number> {
  const json = args.includes("--json");
  const rest = args.filter((x) => x !== "--json");
  if (rest[0] === "show") {
    d.showLayout = !d.showLayout;
    d.layoutIssues = [];
    d.requestFrame();
    out(d.showLayout ? `layout marks ${fmt.green("on")}: ${fmt.red("red")} = cut, ${fmt.yellow("yellow")} = drawn over another text — debug layout show again to stop\n` : "layout marks off\n");
    return 0;
  }
  const sizes = rest.filter((x) => x !== "pages").map(parseSize);
  if (sizes.some((s) => !s)) return out(fmt.red("a size is COLSxROWS, from 20x8 to 600x300 (e.g. 120x34)\n")), 1;
  const list = sizes.length ? (sizes as typeof PROBE_SIZES) : PROBE_SIZES;
  const sweep = (page: string): SizeReport[] => list.map((s) => ({ ...s, label: page ? `${page} ${s.label}` : s.label, issues: d.probeLayout(s.cols, s.rows) }));

  let reports: SizeReport[] = [];
  const perPage: [string, number][] = [];
  if (rest[0] === "pages") {
    // each page opened in turn (no sound, no transition), measured, then closed again
    const ws = d.workspace;
    const before = new Set(ws.tabs);
    const back = ws.activeApp?.key;
    const kinds = d.apps.list().map((a) => a.kind).filter((k) => !NOT_PROBED.has(k));
    if (!json) out(fmt.dim(`${kinds.length} pages × ${list.length} sizes…\n`));
    for (const kind of kinds) {
      const spec = d.apps.get(kind);
      if (!spec) continue;
      try {
        ws.open(spec.create(d));
      } catch {
        continue;
      }
      d.requestFrame();
      await new Promise((r) => setTimeout(r, 350)); // its data loads, a sandboxed page sends its first frame
      const r = sweep(kind);
      perPage.push([kind, r.reduce((n, x) => n + x.issues.length, 0)]);
      reports = reports.concat(r);
    }
    for (let i = ws.tabs.length - 1; i >= 0; i--) if (!before.has(ws.tabs[i])) await ws.closeTab(i);
    const at = ws.tabs.findIndex((t) => t.key === back);
    if (at >= 0) ws.switchTab(at);
    d.requestFrame();
  } else reports = sweep("");

  const groups = groupIssues(reports);
  if (json) return out(`${JSON.stringify({ sizes: list, pages: perPage, issues: groups }, null, 2)}\n`), 0;
  const total = reports.reduce((n, r) => n + r.issues.length, 0);
  if (!total) return out(fmt.green(`nothing cut, nothing overlapping at ${reports.length} sizes\n`)), 0;
  if (perPage.length) out(`${perPage.filter(([, n]) => n).map(([k, n]) => `${k} ${fmt.yellow(String(n))}`).join(" · ")}\n\n`);
  for (const g of groups.slice(0, 40)) {
    const kind = g.kind === "cut" ? fmt.red("cut    ") : fmt.yellow("overlap");
    const sizes = g.sizes.length > 4 ? `${g.sizes.slice(0, 4).join(", ")} +${g.sizes.length - 4}` : g.sizes.join(", ");
    out(`${kind} ${fmt.bold(g.where.padEnd(34))} ${fmt.dim(sizes)}\n        "${g.sample}"${g.under ? fmt.dim(` over "${g.under}"`) : ""}\n`);
  }
  if (groups.length > 40) out(fmt.dim(`… and ${groups.length - 40} more places (--json for all)\n`));
  if (groups.some((g) => g.where === "?")) out(fmt.dim("? = a built app doesn't know its code's names: npm run dev or npm run app shows them\n"));
  out(fmt.dim(`${total} issues in ${groups.length} places, ${reports.length} sizes\n`));
  return 0;
}
