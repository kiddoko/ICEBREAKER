/**
 * STATS — numbers over time. Modules record theirs through `ib.stats`
 * (budget left, pages read…); the deck records "commands run" and "notes in
 * the vault"; you keep your own from the shell or the app:
 *
 *   stats                         every stat, with its last 14 days
 *   stats show deck.commands 60   a graph of the last 60 days
 *   stats set weight 72.4 --unit kg
 *   stats add pushups 20          a counter (adds up per day)
 *   stats pin budget.left         show it on the widget
 *   stats rm weight               forget one of yours
 *
 * Everything stays in the vault (.icebreaker/stats.json), nothing online.
 */
import type { App } from "../../src/apps/types";
import type { Rect } from "../../src/core/grid";
import type { Action, KeyInput } from "../../src/core/input";
import type { Stat } from "../../src/core/stats";
import type { IcebreakerAPI } from "../../src/plugins/api";
import type { UI } from "../../src/ui/ui";
import type { RGB } from "../../src/core/color";
import { byWeekday, facts, lineChart, pctText, pieChart, type Point } from "./charts";

const RANGES = [7, 30, 90, 365];
const WEEKDAY = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

export function activate(ib: IcebreakerAPI): void {
  ib.settings.register([
    { key: "range", label: "default period (days)", type: "choice", options: RANGES.map(String), default: "30", help: "The period the STATS page shows when it opens: 7, 30, 90 or 365 days (←→ changes it on the page)." },
  ]);
  const { BOLD, mix, fmt, parseFlags, t, q, sparkline, formatStat, Bar, stack, cards, INSET, GAP, strWidth: strW } = ib.lib;
  const RANGE_LABEL = (d: number) => (d === 365 ? t("1 year") : `${d} ${t("d")}`);
  /** the colours of the pie's slices, in order */
  const SLICE = (c: UI["c"], i: number): RGB => [c.accent, c.success, c.warning, 0x7fb4ea, c.error, c.title, c.subtle][i % 7];
  /** "14 nov" */
  const dayText = (key: string) => {
    const [y, m, d] = key.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(undefined, { day: "numeric", month: "short" });
  };
  const run = (line: string) => void ib.shell.run(line);
  let all: Stat[] = [];
  let pinned: string[] = [];
  /** stats you chose not to see (the setup page: s in the app, or stats hide) */
  let hidden: string[] = [];
  const visible = () => all.filter((s) => !hidden.includes(s.id));
  /** the setup page opens next time the app is shown (`stats setup`) */
  let wantSetup = false;
  const moduleName = (id: string) => (id === "deck" ? "deck" : (ib.modules.installed().find((m) => m.id === id)?.name ?? id).toLowerCase());
  let loaded = false;

  const refresh = async () => {
    all = await ib.stats.list();
    loaded = true;
    ib.ui.redraw();
  };
  const ready = (async () => {
    pinned = await ib.storage.get<string[]>("pinned", []);
    hidden = await ib.storage.get<string[]>("hidden", []);
    await refresh();
  })();
  let pending: ReturnType<typeof setTimeout> | null = null;
  const off = ib.stats.onChange(() => {
    if (pending) return;
    pending = setTimeout(() => ((pending = null), void refresh()), 250);
  });
  stopListening = off;

  const find = (id: string) => all.find((s) => s.id === id) ?? all.find((s) => s.id === `stats.${id}`) ?? all.find((s) => (s.label === id || t(s.label) === id)) ?? null;
  const values = async (id: string, days: number) => (await ib.stats.series(id, days)).map((p) => p.value);
  /** a number with its unit; deltas get a sign */
  const show = (s: Stat, v = s.value) => formatStat(s, v);
  const shown = () => (pinned.length ? pinned.map(find).filter((s): s is Stat => !!s) : visible());
  /** cached 14-day series for lists/widgets (refreshed with the list) */
  const sparks = new Map<string, string>();
  const spark = (s: Stat, w = 14) => {
    const key = `${s.id}:${w}:${s.updated}`;
    if (!sparks.has(key)) {
      sparks.set(key, "");
      void ib.stats.series(s.id, w).then((p) => (sparks.set(key, sparkline(p.map((x) => x.value), w)), ib.ui.redraw()));
    }
    return sparks.get(key) ?? "";
  };

  ib.commands.register({
    name: "stats",
    aliases: ["stat"],
    summary: "numbers over time, from your modules and from you (STATS module)",
    usage: [
      "stats [ls] [prefix]                       every stat with its last 14 days",
      "stats show <id> [days]                    a graph (default 30 days)",
      "stats set <name> <number> [--unit u] [--label \"…\"]   one of yours (a level: weight, savings)",
      "stats add <name> [n] [--unit u]           a counter of yours (adds up per day)",
      "stats pin <id> · stats unpin <id>         choose what the widget shows",
      "stats rm <name>                           forget one of yours",
      "stats hide <id|module> · stats unhide …   choose what STATS shows",
      "stats setup                               the page to choose (s in the app)",
      "stats open                                the STATS app",
    ].join("\n"),
    examples: [
      ["stats set weight 72.4 --unit kg", "a stat of your own"],
      ["stats add pushups 20", "a counter: today's total grows"],
      ["stats show deck.commands 90", "commands run, last 90 days"],
    ],
    complete: () => ["ls", "show", "set", "add", "pin", "unpin", "rm", "open", "hide", "unhide", "setup", ...all.map((s) => s.id)],
    async run(ctx) {
      await ready;
      const { flags, rest } = parseFlags(ctx.args, ["unit", "label"]);
      const [sub, a, b] = rest;
      const meta = { unit: typeof flags.unit === "string" ? flags.unit : undefined, label: typeof flags.label === "string" ? flags.label : undefined };
      if (!sub || sub === "ls" || sub === "list") {
        const list = all.filter((s) => !a || s.id.startsWith(a));
        if (!list.length) return ctx.out(fmt.dim("no stats yet — stats set <name> <number>, or a module records some\n")), 0;
        const w = Math.max(...list.map((s) => s.id.length));
        for (const s of list) {
          const p = await values(s.id, 14);
          ctx.out(`${s.id.padEnd(w)}  ${fmt.bold(show(s).padStart(12))}  ${fmt.cyan(sparkline(p, 14))}  ${fmt.dim(t(s.label))}${pinned.includes(s.id) ? fmt.yellow(" ★") : ""}${hidden.includes(s.id) ? fmt.dim(" (hidden)") : ""}\n`);
        }
        return 0;
      }
      if (sub === "open") return void ib.apps.open("stats"), 0;
      if (sub === "show") {
        const s = a ? find(a) : null;
        if (!s) return ctx.err(`stats: no stat "${a ?? ""}" (stats ls)\n`), 1;
        const days = Math.max(2, Math.min(400, Number(b) || 30));
        const p = await values(s.id, days);
        const lo = Math.min(...p), hi = Math.max(...p), sum = p.reduce((x, y) => x + y, 0);
        ctx.out(`${fmt.bold(t(s.label))} ${fmt.dim(`· ${s.id} · ${s.kind} · ${t("from")} ${s.source}`)}\n`);
        ctx.out(`${fmt.bold(show(s))}  ${fmt.dim(t("updated"))} ${new Date(s.updated).toLocaleString()}\n`);
        for (let i = 0; i < p.length; i += 60) ctx.out(`${fmt.cyan(sparkline(p, p.length).slice(i, i + 60))}\n`);
        ctx.out(fmt.dim(`${days} ${t("days")} · min ${show(s, lo)} · max ${show(s, hi)} · ${s.kind === "counter" ? `${t("total")} ${show(s, sum)}` : `${t("avg")} ${show(s, sum / p.length)}`}\n`));
        return 0;
      }
      if (sub === "set" || sub === "add") {
        if (!a) return ctx.err(`usage: stats ${sub} <name> ${sub === "set" ? "<number>" : "[n]"}\n`), 1;
        const n = b === undefined && sub === "add" ? 1 : Number(String(b).replace(",", "."));
        if (!Number.isFinite(n)) return ctx.err(`stats: "${b ?? ""}" isn't a number\n`), 1;
        const name = a.startsWith("stats.") ? a.slice(6) : a;
        if (name.includes(".")) return ctx.err(`stats: "${a}" belongs to a module — yours have plain names (weight, pushups)\n`), 1;
        const s = sub === "set" ? await ib.stats.set(name, n, meta) : await ib.stats.add(name, n, meta);
        await refresh();
        ctx.out(`${fmt.green("▲")} ${fmt.bold(t(s.label))} ${show(s)}${sub === "add" ? fmt.dim(` (+${n})`) : ""}\n`);
        return 0;
      }
      if (sub === "pin" || sub === "unpin") {
        const s = a ? find(a) : null;
        if (!s) return ctx.err(`stats: no stat "${a ?? ""}" (stats ls)\n`), 1;
        pinned = pinned.filter((x) => x !== s.id);
        if (sub === "pin") pinned.push(s.id);
        await ib.storage.set("pinned", pinned);
        ib.ui.redraw();
        ctx.out(`${sub === "pin" ? fmt.yellow("★") : fmt.dim("☆")} ${t(s.label)}\n`);
        return 0;
      }
      if (sub === "setup") return (wantSetup = true), void ib.apps.open("stats"), 0;
      if (sub === "hide" || sub === "unhide") {
        if (!a) return ctx.err(`usage: stats ${sub} <id | module>\n`), 1;
        const ids = all.filter((x) => x.id === a || x.source === a || x.id === `stats.${a}`).map((x) => x.id);
        if (!ids.length) return ctx.err(`stats: no stat or module "${a}" (stats ls)\n`), 1;
        hidden = sub === "hide" ? [...new Set([...hidden, ...ids])] : hidden.filter((x) => !ids.includes(x));
        await ib.storage.set("hidden", hidden);
        ib.ui.redraw();
        ctx.out(`${sub === "hide" ? fmt.dim("☐ hidden") : fmt.green("☑ shown")}: ${ids.join(", ")}\n`);
        return 0;
      }
      if (sub === "rm" || sub === "remove") {
        const s = a ? find(a) : null;
        if (!s) return ctx.err(`stats: no stat "${a ?? ""}" (stats ls)\n`), 1;
        if (s.source !== "stats") return ctx.err(`stats: ${s.id} belongs to the ${s.source} module — only yours can be removed\n`), 1;
        await ib.stats.remove(s.id);
        pinned = pinned.filter((x) => x !== s.id);
        await ib.storage.set("pinned", pinned);
        await refresh();
        ctx.out(`${fmt.red("✕")} ${t(s.label)}\n`);
        return 0;
      }
      return ctx.err(`stats: unknown "${sub}" (man stats)\n`), 1;
    },
  });

  /** Name, then the number — the same words as the command. */
  async function addFlow(): Promise<void> {
    const name = await ib.ui.prompt(t("Track what?"), { placeholder: t("weight, pushups, savings…") });
    if (!name?.trim()) return;
    const kind = await ib.ui.choose(t("What kind?"), [
      { label: t("a level"), hint: t("weight, savings: the last value counts") },
      { label: t("a counter"), hint: t("pushups, pages: adds up each day") },
    ]);
    if (kind === null) return;
    const v = await ib.ui.prompt(kind === 0 ? t("Value now?") : t("How many today?"), { placeholder: "12" });
    if (!v?.trim()) return;
    const unit = await ib.ui.prompt(t("Unit? (optional)"), { placeholder: "kg · € · min" });
    run(`stats ${kind === 0 ? "set" : "add"} ${q(name.trim().replace(/\s+/g, "-").toLowerCase())} ${v.trim()}${unit?.trim() ? ` --unit ${q(unit.trim())}` : ""}`);
  }
  async function updateFlow(s: Stat): Promise<void> {
    if (s.source !== "stats") return ib.ui.notify(t("{id} is kept by the {m} module", { id: s.id, m: s.source }), "info");
    const v = await ib.ui.prompt(s.kind === "counter" ? t("Add how many?") : t("Value now?"), { placeholder: show(s) });
    if (!v?.trim()) return;
    run(`stats ${s.kind === "counter" ? "add" : "set"} ${s.id.slice(6)} ${v.trim()}`);
  }

  // ── the app ──
  class StatsApp implements App {
    readonly kind = "stats";
    readonly key = "stats";
    private sel = 0;
    private range = Math.max(0, RANGES.indexOf(Number(ib.settings.get("range")) || 30));
    private setup = false;
    private setupSel = 0;
    /** the setup page: each module, then its stats, with a box to show / hide */
    private setupRows(): ({ kind: "mod"; id: string } | { kind: "stat"; s: Stat })[] {
      const out: ({ kind: "mod"; id: string } | { kind: "stat"; s: Stat })[] = [];
      for (const src of [...new Set(all.map((x) => x.source))].sort()) {
        out.push({ kind: "mod", id: src });
        for (const x of all.filter((y) => y.source === src)) out.push({ kind: "stat", s: x });
      }
      return out;
    }
    private toggleRow(i: number): void {
      const row = this.setupRows()[i];
      if (!row) return;
      if (row.kind === "stat") return run(`stats ${hidden.includes(row.s.id) ? "unhide" : "hide"} ${row.s.id}`);
      const mine = all.filter((x) => x.source === row.id);
      run(`stats ${mine.every((x) => hidden.includes(x.id)) ? "unhide" : "hide"} ${row.id}`);
    }
    private renderSetup(ui: UI, r: Rect, focused: boolean): void {
      const c = ui.c;
      const w = Math.min(r.w - 4, 80), x = r.x + Math.floor((r.w - w) / 2);
      let y = r.y + 1;
      ui.button(x, y, t("‹ back to the stats"), () => (this.setup = false), { tip: "s · esc" });
      ui.text(x + 24, y, t("what STATS shows — space or click to switch"), { fg: c.muted }, w - 24);
      y += 2;
      const rows = this.setupRows();
      this.setupSel = Math.min(this.setupSel, Math.max(0, rows.length - 1));
      const room = r.y + r.h - y - 1;
      const from = Math.max(0, Math.min(this.setupSel - Math.floor(room / 2), rows.length - room));
      rows.slice(from, from + room).forEach((row, k) => {
        const i = from + k;
        const line = { x, y, w, h: 1 };
        const bg = i === this.setupSel && focused ? mix(c.accent, c.bg, 0.8) : ui.hovered(line) ? c.highlight : undefined;
        if (bg) ui.fill(line, { bg });
        const st = bg ? { bg } : {};
        if (row.kind === "mod") {
          const mine = all.filter((s) => s.source === row.id);
          const on = mine.filter((s) => !hidden.includes(s.id)).length;
          ib.lib.checkbox(ui, x + 1, y, on === mine.length ? true : on ? "some" : false, { bg: st.bg });
          ui.text(x + 5, y, moduleName(row.id), { fg: c.title, attrs: BOLD, ...st });
          ui.textRight(x + w - 1, y, `${on}/${mine.length}`, { fg: c.subtle, ...st });
        } else {
          const off = hidden.includes(row.s.id);
          ui.text(x + 1, y, "└", { fg: c.faint, ...st });
          ib.lib.checkbox(ui, x + 3, y, !off, { bg: st.bg });
          ui.text(x + 7, y, t(row.s.label), { fg: off ? c.muted : c.fg, ...st }, w - 32);
          ui.textRight(x + w - 1, y, `${show(row.s)}  ${row.s.id}`, { fg: c.subtle, ...st });
        }
        ui.hit(line, { onClick: () => ((this.setupSel = i), this.toggleRow(i)), tip: row.kind === "mod" ? `stats hide ${row.id} · stats unhide ${row.id}` : `stats hide ${row.s.id}` });
        y++;
      });
      if (!rows.length) ui.text(x, y, t("no stats yet"), { fg: c.muted });
    }
    title() {
      return "Stats";
    }
    status() {
      return this.setup ? t("↑↓ choose · space show / hide · s back") : t("a new · enter update · p pin · ←→ range · x remove · s choose what shows");
    }
    private cur(): Stat | undefined {
      return visible()[this.sel];
    }
    onText(s: string): boolean {
      if (s === "s") return (this.setup = !this.setup), true;
      if (this.setup) return s === " " ? (this.toggleRow(this.setupSel), true) : false;
      const st = this.cur();
      if (s === "a" || s === "+") return void addFlow(), true;
      if (s === "p" && st) return run(`stats ${pinned.includes(st.id) ? "unpin" : "pin"} ${st.id}`), true;
      if (s === "x" && st) return run(`stats rm ${st.id}`), true;
      return false;
    }
    onKey(k: KeyInput): boolean {
      return k.combo === "delete" ? this.onText("x") : false;
    }
    onAction(a: Action): boolean {
      if (this.setup) {
        const n = this.setupRows().length;
        if (a === "up") return (this.setupSel = n ? (this.setupSel - 1 + n) % n : 0), true;
        if (a === "down" || a === "item-next") return (this.setupSel = n ? (this.setupSel + 1) % n : 0), true;
        if (a === "confirm") return this.toggleRow(this.setupSel), true;
        if (a === "back") return (this.setup = false), true;
        return false;
      }
      const n = visible().length;
      if (a === "up") return (this.sel = n ? (this.sel - 1 + n) % n : 0), true;
      if (a === "down") return (this.sel = n ? (this.sel + 1) % n : 0), true;
      if (a === "left") return (this.range = Math.max(0, this.range - 1)), true;
      if (a === "right") return (this.range = Math.min(RANGES.length - 1, this.range + 1)), true;
      if (a === "confirm") {
        const st = this.cur();
        return void (st ? updateFlow(st) : addFlow()), true;
      }
      return false;
    }
    /** two periods of points per stat (the one shown and the one before), fetched once per range and change */
    private pts = new Map<string, Point[]>();
    /** the first look starts on the first tile; after that, what you chose */
    private picked = false;
    private points(st: Stat, days: number): Point[] {
      const key = `${st.id}:${days}:${st.updated}`;
      if (!this.pts.has(key)) {
        this.pts.set(key, []);
        // a level (weight…) has no value before its first one: those days aren't zeros
        const first = Object.keys(st.days ?? {}).sort()[0] ?? "";
        void ib.stats.series(st.id, days * 2).then((p) => (this.pts.set(key, st.kind === "counter" ? p : p.filter((x) => x.day >= first)), ib.ui.redraw()));
      }
      return this.pts.get(key) ?? [];
    }
    /** the tiles on top: pinned ones first, then the latest changed */
    private tiles(): Stat[] {
      const pins = pinned.map(find).filter((x): x is Stat => !!x && !hidden.includes(x.id));
      const rest = visible().filter((x) => !pins.includes(x)).sort((x, y) => y.updated.localeCompare(x.updated));
      return [...pins, ...rest];
    }

    render(ui: UI, r: Rect, focused: boolean): void {
      const c = ui.c;
      if (!loaded) return;
      if (wantSetup) (this.setup = true), (wantSetup = false);
      if (this.setup) return this.renderSetup(ui, r, focused);
      ui.animate(60_000);
      const days = RANGES[this.range];
      const inner = { x: r.x + INSET * 2, y: r.y + 1, w: Math.max(0, r.w - INSET * 4), h: Math.max(0, r.h - 2) };
      // the head: what this is, the period, and the two buttons
      const head = new Bar(ui, inner.x, inner.y, inner.x + inner.w);
      head.text(t("{n} numbers · the last {d} days", { n: visible().length, d: days }), { fg: c.muted }, { priority: 4, fit: 10 });
      // right-side items read in the order they're added: 7 d · 30 d · 90 d · 1 year, then the buttons
      RANGES.forEach((d, i) => {
        const label = RANGE_LABEL(d);
        head.item(strW(label) + 2, (x) => ui.button(x, inner.y, label, () => (this.range = i), { selected: i === this.range, tip: "← →" }), { side: "right", priority: 8 });
      });
      head.item(strW(t("+ track something")) + 2, (x) => ui.button(x, inner.y, t("+ track something"), () => void addFlow(), { tip: "a" }), { side: "right", priority: 6 });
      head.item(strW(t("⚙ what shows")) + 2, (x) => ui.button(x, inner.y, t("⚙ what shows"), () => (this.setup = true), { tip: "s · stats setup" }), { side: "right", priority: 3 });
      head.draw();
      const list = visible();
      if (!this.picked && list.length) {
        this.picked = true;
        this.sel = Math.max(0, list.indexOf(this.tiles()[0]));
      }
      this.sel = Math.min(this.sel, Math.max(0, list.length - 1));
      const body = { x: inner.x, y: inner.y + 2, w: inner.w, h: Math.max(0, inner.h - 2) };
      if (!list.length) return void ui.text(body.x, body.y, t("no stats yet — a starts one; modules add theirs"), { fg: c.muted }, body.w);
      // tiles on top (one row), then the list · the chart · the side (pie, weekdays)
      const [tilesR, mainR] = stack(body, [{ min: 5, h: 5, priority: 6 }, { min: 8, fill: 1, priority: 9 }]);
      if (tilesR) this.drawTiles(ui, tilesR, days);
      if (!mainR) return;
      const listW = mainR.w >= 110 ? 30 : mainR.w >= 70 ? 24 : 0;
      const sideW = mainR.w >= 120 ? 32 : 0;
      const listR = listW ? { x: mainR.x, y: mainR.y, w: listW, h: mainR.h } : null;
      const sideR = sideW ? { x: mainR.x + mainR.w - sideW, y: mainR.y, w: sideW, h: mainR.h } : null;
      const chartR = { x: mainR.x + (listW ? listW + GAP : 0), y: mainR.y, w: mainR.w - (listW ? listW + GAP : 0) - (sideW ? sideW + GAP : 0), h: mainR.h };
      if (listR) this.drawList(ui, listR, focused);
      const st = this.cur();
      if (st) this.drawChart(ui, chartR, st, days);
      if (sideR && st) this.drawSide(ui, sideR, st, days);
    }

    /** a tile per stat: its number big, how it moved, a spark, what it means */
    private drawTiles(ui: UI, r: Rect, days: number): void {
      const c = ui.c;
      const all = this.tiles();
      const { rects } = cards(r, Math.max(1, Math.min(all.length, Math.floor((r.w + GAP) / (22 + GAP)))), { minW: 22, maxW: 40, h: r.h });
      rects.forEach((box, i) => {
        const st = all[i];
        if (!st) return;
        const counter = st.kind === "counter";
        const f = facts(this.points(st, days), days, counter);
        const lit = visible()[this.sel] === st;
        const inn = ui.box(box, { title: t(st.label), focused: lit });
        const big = counter ? show(st, f.total) : show(st);
        const row = new Bar(ui, inn.x + INSET, inn.y, inn.x + inn.w - INSET);
        row.text(big, { fg: c.accent, attrs: BOLD }, { priority: 10 });
        const pct = pctText(f.changePct);
        if (pct) row.text(`${pct.startsWith("−") ? "▼" : pct === "=" ? "■" : "▲"} ${pct}`, { fg: pct === "=" ? c.subtle : pct.startsWith("−") ? c.error : c.success }, { side: "right", priority: 7 });
        row.draw();
        const w = Math.max(0, inn.w - INSET * 2);
        ui.text(inn.x + INSET, inn.y + 1, sparkline(this.points(st, days).slice(-days).map((p) => p.value), w), { fg: lit ? c.accent : c.subtle }, w);
        // short enough for a 22-cell tile: "30 d · 4/day", "↓ 71 ↑ 72,4 kg", "steady"
        const says = counter
          ? `${RANGE_LABEL(days)} · ${t("{a}/day", { a: show(st, f.avg) })}`
          : f.min === f.max
            ? t("steady")
            : `↓ ${show({ ...st, unit: "" }, f.min)} ↑ ${show(st, f.max)}`;
        ui.text(inn.x + INSET, inn.y + 2, says, { fg: c.muted, raw: true }, w); // raw: ↓ ↑ are data, not keys
        ui.hit(box, { onClick: () => (this.sel = visible().indexOf(st)), tip: `stats show ${st.id} ${days}` });
      });
    }

    private drawList(ui: UI, r: Rect, focused: boolean): void {
      const c = ui.c;
      const inn = ui.box(r, { title: t("ALL"), focused });
      const list = visible();
      const from = Math.max(0, Math.min(this.sel - Math.floor(inn.h / 2), list.length - inn.h));
      list.slice(from, from + inn.h).forEach((st, k) => {
        const i = from + k, y = inn.y + k;
        const line = { x: inn.x, y, w: inn.w, h: 1 };
        const sel = i === this.sel;
        const bg = sel ? mix(c.accent, c.bg, focused ? 0.78 : 0.88) : ui.hovered(line) ? c.highlight : undefined;
        if (bg) ui.fill(line, { bg });
        const sty = bg ? { bg } : {};
        new Bar(ui, inn.x + INSET, y, inn.x + inn.w - INSET)
          .text(pinned.includes(st.id) ? "★" : "·", { fg: pinned.includes(st.id) ? c.warning : c.faint, ...sty }, { priority: 9 })
          .text(t(st.label), { fg: sel ? c.fg : c.subtle, ...sty }, { priority: 8, fit: 6 })
          .text(show(st), { fg: c.fg, attrs: BOLD, ...sty }, { side: "right", priority: 10 })
          .draw();
        ui.hit(line, { onClick: () => (this.sel = i), tip: `stats show ${st.id}` });
      });
    }

    /** the chosen stat: a line with its area, the axes in words, the facts under it */
    private drawChart(ui: UI, r: Rect, st: Stat, days: number): void {
      const c = ui.c;
      const counter = st.kind === "counter";
      const inn = ui.box(r, { title: `${t(st.label)} · ${moduleName(st.source)}`, focused: true });
      const pts = this.points(st, days);
      const now = pts.slice(-days);
      if (!now.length) return void ui.text(inn.x + INSET, inn.y, `${ui.spinner()} …`, { fg: c.muted });
      const f = facts(pts, days, counter);
      const [topR, plotR, axisR, factR] = stack(inn, [{ h: 1, priority: 9 }, { min: 3, fill: 1, priority: 8 }, { h: 1, priority: 5 }, { h: 1, priority: 7 }], 0);
      if (topR) {
        const b = new Bar(ui, topR.x + INSET, topR.y, topR.x + topR.w - INSET);
        b.text(counter ? show(st, f.total) : show(st), { fg: c.accent, attrs: BOLD }, { priority: 10 });
        b.text(counter ? t("in {d} days", { d: days }) : t("now"), { fg: c.muted }, { priority: 6 });
        const pct = pctText(f.changePct);
        // nothing before to divide by: the change itself, signed ("+20")
        if (f.change !== null) b.text(t("{p} vs the {d} days before", { p: pct || `${f.change > 0 ? "+" : f.change < 0 ? "−" : ""}${show(st, Math.abs(f.change))}`, d: days }), { fg: (f.change ?? 0) < 0 ? c.error : f.change ? c.success : c.subtle }, { side: "right", priority: 5 });
        b.draw();
      }
      if (plotR) {
        const v = now.map((p) => p.value);
        const lo = counter ? 0 : Math.min(...v) - (Math.max(...v) - Math.min(...v)) * 0.1;
        const hi = Math.max(...v) === lo ? lo + 1 : Math.max(...v);
        // the y axis: max, middle, min as numbers on the left
        const gutter = Math.min(10, Math.max(...[hi, (hi + lo) / 2, lo].map((x) => strW(show(st, x)))) + 1);
        const px = plotR.x + INSET + gutter, pw = Math.max(1, plotR.x + plotR.w - INSET - px);
        ui.text(plotR.x + INSET, plotR.y, show(st, hi), { fg: c.subtle }, gutter - 1);
        if (plotR.h >= 5) ui.text(plotR.x + INSET, plotR.y + Math.floor(plotR.h / 2), show(st, (hi + lo) / 2), { fg: c.faint }, gutter - 1);
        ui.text(plotR.x + INSET, plotR.y + plotR.h - 1, show(st, lo), { fg: c.subtle }, gutter - 1);
        // the average as a dashed line behind
        const avgRow = plotR.y + Math.round((plotR.h - 1) * (1 - (f.avg - lo) / (hi - lo || 1)));
        const dots = lineChart(v, pw, plotR.h, lo, hi);
        ui.art(() => {
          for (let x = 0; x < pw; x++) if (!dots.bits[(avgRow - plotR.y) * pw + x]) ui.text(px + x, avgRow, x % 2 ? " " : "┄", { fg: c.faint });
          dots.rows().forEach((runs, y) => runs.forEach(([x, s, layer]) => ui.text(px + x, plotR.y + y, s, { fg: layer ? c.accent : mix(c.accent, c.bg, 0.7) })));
        });
        if (axisR) {
          // the x axis: the first day, the middle, today
          const ax = new Bar(ui, px, axisR.y, px + pw);
          ax.text(dayText(now[0].day), { fg: c.subtle }, { priority: 8 });
          ax.text(t("avg") + " ┄ " + show(st, f.avg), { fg: c.subtle }, { priority: 3 });
          ax.text(t("today"), { fg: c.subtle }, { side: "right", priority: 9 });
          ax.draw();
        }
      }
      if (factR) {
        const b = new Bar(ui, factR.x + INSET, factR.y, factR.x + factR.w - INSET);
        if (counter) {
          b.text(t("{a}/day", { a: show(st, f.avg) }), { fg: c.fg }, { priority: 9 });
          if (f.best) b.text(t("best {v} ({d})", { v: show(st, f.best.value), d: dayText(f.best.day) }), { fg: c.success }, { priority: 7 });
          b.text(f.active === 1 ? t("1 active day") : t("{n} active days", { n: f.active }), { fg: c.subtle }, { priority: 5 });
          if (f.streak > 1) b.text(t("{n} days in a row", { n: f.streak }), { fg: c.warning }, { priority: 6 });
        } else {
          b.text(t("min {a}", { a: show(st, f.min) }), { fg: c.fg }, { priority: 8 });
          b.text(t("max {a}", { a: show(st, f.max) }), { fg: c.fg }, { priority: 8 });
          b.text(t("avg {a}", { a: show(st, f.avg) }), { fg: c.subtle }, { priority: 6 });
        }
        b.text(`${t("updated")} ${new Date(st.updated).toLocaleDateString()}`, { fg: c.faint }, { side: "right", priority: 2 });
        b.draw();
      }
    }

    /** the side: where the activity comes from (a pie of the counters by module), and the chosen stat by weekday */
    private drawSide(ui: UI, r: Rect, st: Stat, days: number): void {
      const c = ui.c;
      const counters = visible().filter((x) => x.kind === "counter");
      const bySource = new Map<string, number>();
      for (const x of counters) bySource.set(x.source, (bySource.get(x.source) ?? 0) + facts(this.points(x, days), days, true).total);
      const parts = [...bySource.entries()].filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
      // counters: the total per weekday; a level (weight): its average on the days it has one ("–" when none)
      const wpts = this.points(st, days).slice(-days);
      const sums = byWeekday(wpts);
      const counts = byWeekday(wpts.map((p) => ({ ...p, value: 1 })));
      const counter = st.kind === "counter";
      const week = counter ? sums : sums.map((v, d) => (counts[d] ? v / counts[d] : 0));
      // the pie first when rows are short: it's the picture this column is for
      const [pieR, weekR] = stack(r, [{ min: 8, fill: 1, priority: 8 }, { h: 9, priority: 6 }]);
      if (pieR) {
        const inn = ui.box(pieR, { title: t("ACTIVITY BY MODULE") });
        const total = parts.reduce((a, [, n]) => a + n, 0);
        if (!total) ui.text(inn.x + INSET, inn.y, t("nothing counted yet"), { fg: c.muted }, inn.w - INSET * 2);
        else {
          const legend = Math.min(parts.length, Math.max(1, inn.h - 4));
          const ph = Math.max(2, inn.h - legend - 1), pw = Math.min(inn.w - INSET * 2, Math.ceil(ph / (ui.cellAspect || 0.5)));
          const pie = pieChart(parts.map(([, n]) => n), pw, ph, ui.cellAspect || 0.5);
          const x0 = inn.x + Math.floor((inn.w - pw) / 2);
          ui.art(() => pie.rows().forEach((runs, y) => runs.forEach(([x, s, layer]) => ui.text(x0 + x, inn.y + y, s, { fg: SLICE(c, layer) }))));
          parts.slice(0, legend).forEach(([src, n], i) => {
            const y = inn.y + ph + 1 + i;
            new Bar(ui, inn.x + INSET, y, inn.x + inn.w - INSET)
              .text("■", { fg: SLICE(c, i) }, { priority: 9 })
              .text(moduleName(src), { fg: c.fg }, { priority: 8, fit: 4 })
              .text(`${Math.round((n / total) * 100)} %`, { fg: c.subtle }, { side: "right", priority: 9 })
              .draw();
          });
        }
      }
      if (weekR) {
        const inn = ui.box(weekR, { title: t("BY WEEKDAY") });
        const lo = counter ? 0 : Math.min(...week.filter((_, d) => counts[d])) * 0.95;
        const hi = Math.max(...week) - lo || 1;
        [1, 2, 3, 4, 5, 6, 0].forEach((d, i) => {
          const y = inn.y + i;
          if (y >= inn.y + inn.h) return;
          const top = week[d] === Math.max(...week) && week[d] > 0;
          new Bar(ui, inn.x + INSET, y, inn.x + inn.w - INSET)
            .text(t(WEEKDAY[d]), { fg: top ? c.fg : c.subtle }, { priority: 9 })
            .item(Math.max(4, inn.w - INSET * 2 - 14), (x, w) => {
              const n = counter || counts[d] ? Math.round(((week[d] - lo) / hi) * w) : 0;
              ui.text(x, y, "━".repeat(n), { fg: top ? c.accent : mix(c.accent, c.bg, 0.45) });
              ui.text(x + n, y, "─".repeat(w - n), { fg: c.faint });
            }, { priority: 5 })
            .text(counter || counts[d] ? show(st, week[d]) : "–", { fg: top ? c.accent : c.subtle }, { side: "right", priority: 8 })
            .draw();
        });
      }
    }
  }

  ib.apps.register({ kind: "stats", title: "Stats", description: "numbers over time, from modules and from you", icon: "▁▃▇", launcher: true, create: () => new StatsApp() });
  ib.palette.register({ id: "stats.new", title: "Stats: track something new…", group: "stats", run: () => void addFlow() });

  // ── the widget (and its pop-up) ──
  let popSel = 0;
  ib.widgets.register({
    id: "board",
    title: "stats",
    description: "your numbers and their last days (STATS module) — stats pin <id> to choose",
    size: { w: 4, h: 3 },
    min: { w: 2, h: 1 },
    open: "stats open",
    render(ui, r) {
      const c = ui.c;
      if (!loaded) return;
      const list = shown();
      if (!list.length) return void ui.text(r.x + 1, r.y, t("no stats yet"), { fg: c.muted }, r.w - 2);
      const sw = r.w >= 30 ? 10 : r.w >= 20 ? 6 : 0;
      list.slice(0, r.h).forEach((s, i) => {
        const end = ui.textRight(r.x + r.w - 1, r.y + i, show(s), { fg: c.fg, attrs: BOLD });
        if (sw) ui.text(end - sw - 1, r.y + i, spark(s, sw), { fg: c.accent });
        ui.text(r.x + 1, r.y + i, t(s.label), { fg: c.subtle }, end - r.x - sw - 3);
      });
    },
    popup: {
      title: "stats",
      size: { w: 64, h: 14 },
      hint: "a new · enter update · p pin · ↑↓",
      render(ui, r) {
        const c = ui.c;
        popSel = Math.min(popSel, Math.max(0, visible().length - 1));
        visible().slice(0, r.h - 2).forEach((s, i) => {
          const row = { x: r.x, y: r.y + i, w: r.w, h: 1 };
          const bg = i === popSel ? mix(c.accent, c.bg, 0.8) : undefined;
          if (bg) ui.fill(row, { bg });
          const st = bg ? { bg } : {};
          ui.text(r.x + 1, r.y + i, pinned.includes(s.id) ? "★" : " ", { fg: c.warning, ...st });
          const end = ui.textRight(r.x + r.w - 2, r.y + i, show(s), { fg: c.fg, attrs: BOLD, ...st });
          ui.text(end - 15, r.y + i, spark(s, 14), { fg: c.accent, ...st });
          ui.text(r.x + 3, r.y + i, t(s.label), { fg: c.fg, ...st }, end - r.x - 20);
          ui.hit(row, { onClick: () => (popSel = i), tip: `stats show ${s.id}` });
        });
        if (!visible().length) ui.text(r.x + 2, r.y, t("no stats yet — a starts one; modules add theirs"), { fg: c.muted });
        ui.button(r.x + 2, r.y + r.h - 1, t("+ track something"), () => void addFlow(), { tip: "a" });
      },
      onText: (s) => {
        const st = visible()[popSel];
        if (s === "a" || s === "+") return void addFlow(), true;
        if (s === "p" && st) return run(`stats ${pinned.includes(st.id) ? "unpin" : "pin"} ${st.id}`), true;
        return false;
      },
      onAction: (a) => {
        const n = visible().length;
        if (a === "up") return (popSel = n ? (popSel - 1 + n) % n : 0), true;
        if (a === "down") return (popSel = n ? (popSel + 1) % n : 0), true;
        if (a === "confirm" && visible()[popSel]) return void updateFlow(visible()[popSel]), true;
        return false;
      },
    },
  });

  ib.lib.addTranslations("fr", {
    "Stats": "Stats",
    "stats": "stats",
    "from": "de",
    "updated": "mis à jour",
    "days": "jours",
    "d": "j",
    "total": "total",
    "avg": "moy.",
    "Track what?": "Suivre quoi ?",
    "weight, pushups, savings…": "poids, pompes, épargne…",
    "What kind?": "Quel genre ?",
    "a level": "un niveau",
    "weight, savings: the last value counts": "poids, épargne : la dernière valeur compte",
    "a counter": "un compteur",
    "pushups, pages: adds up each day": "pompes, pages : s'additionne chaque jour",
    "Value now?": "Valeur actuelle ?",
    "How many today?": "Combien aujourd'hui ?",
    "Add how many?": "Ajouter combien ?",
    "Unit? (optional)": "Unité ? (facultatif)",
    "{id} is kept by the {m} module": "{id} est tenu par le module {m}",
    "a new · enter update · p pin · ←→ range · x remove": "a nouveau · entrée mettre à jour · p épingler · ←→ période · x retirer",
    "+ track something": "+ suivre quelque chose",
    "no stats yet — a starts one; modules add theirs": "pas encore de stats — a en commence une ; les modules ajoutent les leurs",
    "no stats yet": "pas encore de stats",
    "a new · enter update · p pin · ↑↓": "a nouveau · entrée mettre à jour · p épingler · ↑↓",
    "your numbers and their last days (STATS module) — stats pin <id> to choose": "tes chiffres et leurs derniers jours (module STATS) — stats pin <id> pour choisir",
    "numbers over time, from modules and from you": "des chiffres dans le temps, des modules et de toi",
    "‹ back to the stats": "‹ retour aux stats",
    "what STATS shows — space or click to switch": "ce que STATS affiche — espace ou clic pour basculer",
    "↑↓ choose · space show / hide · s back": "↑↓ choisir · espace afficher / masquer · s retour",
    "a new · enter update · p pin · ←→ range · x remove · s choose what shows": "a nouveau · entrée mettre à jour · p épingler · ←→ période · x retirer · s choisir l'affichage",
    "⚙ what shows": "⚙ affichage",
    "STATS": "STATS",
    "{n} numbers · the last {d} days": "{n} chiffres · les {d} derniers jours",
    "1 year": "1 an",
    "in {d} days · {a}/day": "en {d} jours · {a}/jour",
    "min {a} · max {b}": "min {a} · max {b}",
    "ALL": "TOUTES",
    "in {d} days": "en {d} jours",
    "now": "maintenant",
    "{p} vs the {d} days before": "{p} par rapport aux {d} jours d'avant",
    "today": "aujourd'hui",
    "{a}/day": "{a}/jour",
    "best {v} ({d})": "record {v} ({d})",
    "{n} active days": "{n} jours actifs",
    "1 active day": "1 jour actif",
    "steady": "stable",
    "{n} days in a row": "{n} jours d'affilée",
    "min {a}": "min {a}",
    "max {a}": "max {a}",
    "avg {a}": "moy. {a}",
    "ACTIVITY BY MODULE": "ACTIVITÉ PAR MODULE",
    "nothing counted yet": "rien de compté pour l'instant",
    "BY WEEKDAY": "PAR JOUR DE LA SEMAINE",
    "mon": "lun", "tue": "mar", "wed": "mer", "thu": "jeu", "fri": "ven", "sat": "sam", "sun": "dim",
    "tasks open": "tâches ouvertes",
    "tasks added": "tâches ajoutées",
    "tasks done": "tâches faites",
    "reminders pending": "rappels à venir",
    "reminders rung": "rappels sonnés",
    "events this week": "événements cette semaine",
    "tracks played": "morceaux joués",
    "focus sessions": "sessions de focus",
    "minutes of focus": "minutes de focus",
    "timers started": "minuteurs lancés",
    "journal pages": "pages de journal",
    "messages to the AI": "messages à l'IA",
    "commands run": "commandes lancées",
    "notes in the vault": "notes dans le coffre",
  });
}

let stopListening: (() => void) | null = null;
export function deactivate(): void {
  stopListening?.();
  stopListening = null;
}
