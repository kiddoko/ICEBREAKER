/**
 * TODO — a to-do list, written as a module (a built-in plugin).
 *
 * One feature, one module: the tasks live in the module's own data file
 * (.icebreaker/plugin-data/todo.json), not in your notes. Three faces, one
 * source of truth — the `todo` command:
 *
 *   todo add "walk the dog" --urgent --due tomorrow +home
 *   the TODO app        (a / space / 1-4 / d / e / x …)
 *   the HOME widget     (todo.list)
 *
 * The app and the widget never change the data themselves: they run `todo …`
 * commands through ib.shell.run, so every click shows up in the shell.
 * It only uses the public plugin API (`ib`): copy it to start your own module.
 */
import type { App } from "../../src/apps/types";
import type { Rect } from "../../src/core/grid";
import type { Action, KeyInput } from "../../src/core/input";
import type { IcebreakerAPI } from "../../src/plugins/api";
import type { Command, ShellContext } from "../../src/shell/types";
import type { UI } from "../../src/ui/ui";

type Prio = "urgent" | "high" | "moderate" | "low";
const PRIOS: Prio[] = ["urgent", "high", "moderate", "low"];
/** Accepted spellings (flags and values), English and French. */
const PRIO_ALIAS: Record<string, Prio> = {
  urgent: "urgent", u: "urgent", "!!!": "urgent", "1": "urgent",
  high: "high", important: "high", haute: "high", "!!": "high", "2": "high",
  moderate: "moderate", normal: "moderate", medium: "moderate", moyenne: "moderate", "!": "moderate", "3": "moderate",
  low: "low", l: "low", basse: "low", later: "low", "4": "low",
};

interface Task {
  id: number;
  text: string;
  prio: Prio;
  /** YYYY-MM-DD or null */
  due: string | null;
  tags: string[];
  done: boolean;
  created: string;
  doneAt: string | null;
}

type Filter = "open" | "today" | "all" | "done";
const FILTERS: Filter[] = ["open", "today", "all", "done"];

// ── dates ──────────────────────────────────────────────────────────────────

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const inDays = (n: number) => {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + n);
  return iso(d);
};
const WEEKDAYS: Record<string, number> = {
  sun: 0, sunday: 0, dim: 0, dimanche: 0, mon: 1, monday: 1, lun: 1, lundi: 1, tue: 2, tuesday: 2, mar: 2, mardi: 2,
  wed: 3, wednesday: 3, mer: 3, mercredi: 3, thu: 4, thursday: 4, jeu: 4, jeudi: 4, fri: 5, friday: 5, ven: 5, vendredi: 5,
  sat: 6, saturday: 6, sam: 6, samedi: 6,
};

/** "tomorrow", "fri", "+3d", "2w", "2026-12-01", "24/12" → YYYY-MM-DD; "-" → null; unreadable → undefined. */
export function parseDue(raw: string): string | null | undefined {
  const s = raw.trim().toLowerCase();
  if (["-", "none", "no", "clear", "aucune", "aucun"].includes(s)) return null;
  if (["today", "tod", "now", "auj", "aujourd'hui", "aujourdhui", "ce-soir", "tonight"].includes(s)) return inDays(0);
  if (["tomorrow", "tmr", "tom", "demain"].includes(s)) return inDays(1);
  if (["week", "next-week", "semaine"].includes(s)) return inDays(7);
  let m = /^\+?(\d{1,3})(d|j)?$/.exec(s);
  if (m) return inDays(Number(m[1]));
  m = /^\+?(\d{1,2})(w|s)$/.exec(s);
  if (m) return inDays(Number(m[1]) * 7);
  if (s in WEEKDAYS) return inDays((WEEKDAYS[s] - new Date().getDay() + 7) % 7 || 7);
  m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (m) return iso(new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12));
  m = /^(\d{1,2})[/.](\d{1,2})(?:[/.](\d{2,4}))?$/.exec(s);
  if (m) {
    const now = new Date();
    let y = m[3] ? Number(m[3]) : now.getFullYear();
    if (y < 100) y += 2000;
    const d = new Date(y, Number(m[2]) - 1, Number(m[1]), 12);
    // "24/12" in January means next December's… no: the next 24/12 to come
    if (!m[3] && iso(d) < inDays(0)) d.setFullYear(y + 1);
    return iso(d);
  }
  return undefined;
}

function daysUntil(due: string): number {
  const [y, mo, d] = due.split("-").map(Number);
  const now = new Date();
  now.setHours(12, 0, 0, 0);
  return Math.round((new Date(y, mo - 1, d, 12).getTime() - now.getTime()) / 86_400_000);
}

function dueLabel(due: string | null): string {
  if (!due) return "";
  const n = daysUntil(due);
  if (n < -1) return `${-n}d late`;
  if (n === -1) return "yesterday";
  if (n === 0) return "today";
  if (n === 1) return "tomorrow";
  const d = new Date(`${due}T12:00`);
  return n < 7 ? d.toLocaleDateString("en", { weekday: "short" }).toLowerCase() : d.toLocaleDateString("en", { day: "numeric", month: "short" }).toLowerCase();
}

// ── parsing "walk the dog --urgent --due tomorrow +home" ──────────────────

interface Parsed {
  text: string;
  prio?: Prio;
  due?: string | null;
  dueRaw?: string;
  tags: string[];
  error?: string;
}

export function parseTask(tokens: string[]): Parsed {
  const out: Parsed = { text: "", tags: [] };
  const words: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    const f = /^--?([a-z!]+)(?:=(.*))?$/i.exec(t);
    if (f && t !== "-") {
      const k = f[1].toLowerCase();
      let v = f[2];
      if (PRIO_ALIAS[k] && !/^\d$/.test(k)) {
        out.prio = PRIO_ALIAS[k];
        continue;
      }
      if (k === "due" || k === "d" || k === "for") {
        v ??= tokens[++i];
        const d = v === undefined ? undefined : parseDue(v);
        if (d === undefined) out.error = `can't read the date "${v ?? ""}" — try today, tomorrow, fri, +3d, 2026-12-01, 24/12`;
        else (out.due = d), (out.dueRaw = v);
        continue;
      }
      if (k === "prio" || k === "p") {
        v ??= tokens[++i];
        const p = PRIO_ALIAS[(v ?? "").toLowerCase()];
        if (!p) out.error = `unknown priority "${v ?? ""}" — urgent, high, moderate or low`;
        else out.prio = p;
        continue;
      }
      if (k === "tag" || k === "t") {
        v ??= tokens[++i];
        if (v) out.tags.push(v.replace(/^\+/, ""));
        continue;
      }
      out.error = `unknown option ${t} (see: man todo)`;
      continue;
    }
    if (/^\+[\p{L}\p{N}_-]+$/u.test(t)) {
      out.tags.push(t.slice(1));
      continue;
    }
    words.push(t);
  }
  out.text = words.join(" ").trim();
  return out;
}

/** Split typed text like a (tiny) shell: spaces separate, quotes group. */
function tokenize(s: string): string[] {
  const out: string[] = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  for (const m of s.matchAll(re)) out.push(m[1] ?? m[2] ?? m[3]);
  return out;
}

// ── the module ─────────────────────────────────────────────────────────────

export function activate(ib: IcebreakerAPI): void {
  const { BOLD, DIM, STRIKE, mix, strWidth, q, fmt } = ib.lib;

  // ── store (only the `todo` command writes it) ──
  let tasks: Task[] = [];
  let trash: Task[] = [];
  let nextId = 1;
  let loaded = false;
  const ready = (async () => {
    tasks = await ib.storage.get<Task[]>("tasks", []);
    trash = await ib.storage.get<Task[]>("trash", []);
    nextId = await ib.storage.get<number>("next", tasks.reduce((m, t) => Math.max(m, t.id + 1), 1));
    loaded = true;
    ib.ui.redraw();
  })();
  const save = async () => {
    await ib.storage.set("tasks", tasks);
    await ib.storage.set("trash", trash.slice(-20));
    await ib.storage.set("next", nextId);
    ib.ui.redraw();
  };

  const rank = (t: Task) => PRIOS.indexOf(t.prio);
  const sorted = (list: Task[]) =>
    [...list].sort((a, b) => Number(a.done) - Number(b.done) || rank(a) - rank(b) || (a.due ?? "9999").localeCompare(b.due ?? "9999") || a.id - b.id);
  const isToday = (t: Task) => !!t.due && daysUntil(t.due) <= 0;
  const pick = (f: Filter) => sorted(tasks.filter((t) => (f === "done" ? t.done : f === "all" ? true : !t.done && (f === "open" || isToday(t)))));

  /** Short form for messages and the shell: "walk the dog (urgent, tomorrow)". */
  const describe = (t: Task) => {
    const bits = [t.prio !== "moderate" ? t.prio : "", t.due ? dueLabel(t.due) : "", ...t.tags.map((g) => `+${g}`)].filter(Boolean);
    return `${t.text}${bits.length ? ` (${bits.join(", ")})` : ""}`;
  };

  const prioMark = (p: Prio) => (p === "urgent" ? "!!!" : p === "high" ? "!! " : p === "moderate" ? "!  " : "·  ");
  const prioAnsi = (p: Prio, s: string) => (p === "urgent" ? fmt.red(s) : p === "high" ? fmt.yellow(s) : p === "moderate" ? fmt.cyan(s) : fmt.gray(s));

  function line(t: Task): string {
    const box = t.done ? fmt.green("☑") : "☐";
    const due = t.due ? (daysUntil(t.due) < 0 && !t.done ? fmt.red(dueLabel(t.due)) : daysUntil(t.due) === 0 ? fmt.yellow("today") : fmt.dim(dueLabel(t.due))) : "";
    const tags = t.tags.map((g) => fmt.magenta(`+${g}`)).join(" ");
    const text = t.done ? fmt.dim(t.text) : t.text;
    return `${fmt.dim(String(t.id).padStart(3))} ${box} ${prioAnsi(t.prio, prioMark(t.prio))} ${text}${tags ? ` ${tags}` : ""}${due ? `  ${due}` : ""}\n`;
  }

  function ids(ctx: ShellContext, args: string[]): Task[] | null {
    if (!args.length) return ctx.err("which one? give its number (todo shows them)\n"), null;
    const out: Task[] = [];
    for (const a of args) {
      const t = tasks.find((x) => x.id === Number(a.replace(/^#/, "")));
      if (!t) return ctx.err(`todo: no task ${a}\n`), null;
      out.push(t);
    }
    return out;
  }

  const SUBS = ["add", "done", "undo", "edit", "prio", "due", "rm", "restore", "ls", "clear", "open"];

  const command: Command = {
    name: "todo",
    aliases: ["td"],
    summary: "your to-do list: priorities, due dates, tags (the TODO module)",
    usage: [
      "todo                          what's left to do",
      "todo add <text> [options]     (also: todo task add …)",
      "     --urgent --high --moderate --low      priority (default: moderate)",
      "     --due today|tomorrow|fri|+3d|2w|2026-12-01|24/12",
      "     +tag                     tags: +home +work",
      "todo done <n…>    todo undo <n…>",
      "todo edit <n> [new text] [options]",
      "todo prio <n> urgent|high|moderate|low",
      "todo due <n> <date | ->",
      "todo rm <n…>      todo restore    (brings back what you just removed)",
      "todo ls [--all | --done | --today | --late] [+tag]",
      "todo clear        forget finished tasks",
      "todo open         the TODO app",
    ].join("\n"),
    man: "Tasks are stored by the TODO module in .icebreaker/plugin-data/todo.json, not in your notes.\nThe app and the HOME widget run these same commands: click around and watch the shell.",
    complete: () => SUBS,
    async run(ctx) {
      await ready;
      const args = [...ctx.args];
      if (args[0] === "task") args.shift();
      const sub = args.shift() ?? "ls";

      switch (sub) {
        case "add":
        case "a": {
          const p = parseTask(args);
          if (p.error) return ctx.err(`todo: ${p.error}\n`), 1;
          if (!p.text) return ctx.err('usage: todo add "what to do" [--urgent] [--due tomorrow] [+tag]\n'), 1;
          const t: Task = { id: nextId++, text: p.text, prio: p.prio ?? "moderate", due: p.due ?? null, tags: p.tags, done: false, created: new Date().toISOString(), doneAt: null };
          tasks.push(t);
          await save();
          ctx.out(`${fmt.green("+")} ${fmt.dim(`#${t.id}`)} ${describe(t)}\n`);
          return 0;
        }
        case "done":
        case "undo": {
          const list = ids(ctx, args);
          if (!list) return 1;
          for (const t of list) {
            t.done = sub === "done";
            t.doneAt = t.done ? new Date().toISOString() : null;
            ctx.out(`${t.done ? fmt.green("☑") : "☐"} ${t.text}\n`);
          }
          await save();
          const left = tasks.filter((t) => !t.done).length;
          if (sub === "done" && left === 0) ib.ui.notify("all done. go outside.", "success");
          return 0;
        }
        case "edit": {
          const [n, ...rest] = args;
          const list = ids(ctx, n ? [n] : []);
          if (!list) return 1;
          const t = list[0];
          const p = parseTask(rest);
          if (p.error) return ctx.err(`todo: ${p.error}\n`), 1;
          if (p.text) t.text = p.text;
          if (p.prio) t.prio = p.prio;
          if (p.due !== undefined) t.due = p.due;
          if (p.tags.length) t.tags = p.tags;
          await save();
          ctx.out(`${fmt.cyan("~")} ${fmt.dim(`#${t.id}`)} ${describe(t)}\n`);
          return 0;
        }
        case "prio": {
          const [n, v] = args;
          const list = ids(ctx, n ? [n] : []);
          if (!list) return 1;
          const p = PRIO_ALIAS[(v ?? "").toLowerCase()];
          if (!p) return ctx.err("usage: todo prio <n> urgent|high|moderate|low\n"), 1;
          list[0].prio = p;
          await save();
          ctx.out(`${prioAnsi(p, prioMark(p).trim())} ${list[0].text}\n`);
          return 0;
        }
        case "due": {
          const [n, ...v] = args;
          const list = ids(ctx, n ? [n] : []);
          if (!list) return 1;
          const d = parseDue(v.join(" ") || "-");
          if (d === undefined) return ctx.err(`todo: can't read the date "${v.join(" ")}" — today, tomorrow, fri, +3d, 2026-12-01, 24/12, or - to clear\n`), 1;
          list[0].due = d;
          await save();
          ctx.out(`${list[0].text}: ${d ? dueLabel(d) : "no due date"}\n`);
          return 0;
        }
        case "rm": {
          const list = ids(ctx, args);
          if (!list) return 1;
          tasks = tasks.filter((t) => !list.includes(t));
          trash.push(...list);
          await save();
          ctx.out(`${fmt.red("−")} ${list.map((t) => t.text).join(", ")} ${fmt.dim("(todo restore to undo)")}\n`);
          return 0;
        }
        case "restore": {
          const t = trash.pop();
          if (!t) return ctx.err("todo: nothing to restore\n"), 1;
          tasks.push(t);
          await save();
          ctx.out(`${fmt.green("+")} ${fmt.dim(`#${t.id}`)} ${describe(t)}\n`);
          return 0;
        }
        case "clear": {
          const done = tasks.filter((t) => t.done);
          tasks = tasks.filter((t) => !t.done);
          trash.push(...done);
          await save();
          ctx.out(`${done.length} finished task${done.length === 1 ? "" : "s"} cleared\n`);
          return 0;
        }
        case "open": {
          const app = ib.apps.open("todo") as TodoApp | null;
          if (app && args.includes("--add")) app.startTyping();
          return 0;
        }
        case "ls": {
          const f: Filter = args.includes("--all") || args.includes("-a") ? "all" : args.includes("--done") ? "done" : args.includes("--today") ? "today" : "open";
          const tag = args.find((a) => a.startsWith("+"))?.slice(1);
          let list = pick(f);
          if (args.includes("--late")) list = list.filter((t) => t.due && daysUntil(t.due) < 0);
          if (tag) list = list.filter((t) => t.tags.includes(tag));
          if (!list.length) return ctx.out(f === "open" ? "nothing to do. suspicious.\n" : "nothing here.\n"), 0;
          for (const t of list) ctx.out(line(t));
          return 0;
        }
        default:
          ctx.err(`todo: "${sub}"? try ${SUBS.map((s) => fmt.bold(s)).join(" · ")}  (todo add "${[sub, ...args].join(" ")}" to add it)\n`);
          return 1;
      }
    },
  };
  ib.commands.register(command);

  // ── the app ──

  const run = (line: string) => void ib.shell.run(line);

  class TodoApp implements App {
    readonly kind = "todo";
    readonly key = "todo";
    private filter: Filter = "open";
    private sel = 0;
    private scroll = 0;
    private typing = false;
    private input = "";
    private inputAt = 0;
    private hint = "";

    title(): string {
      return "todo";
    }

    status(): string {
      return this.typing
        ? "type · --urgent --high --low · --due tomorrow · +tag · enter add · esc stop"
        : "a add · space done · 1-4 priority · d due · e edit · x remove · tab filter · u restore";
    }

    startTyping(): void {
      this.typing = true;
      this.inputAt = performance.now();
    }

    private get list(): Task[] {
      return pick(this.filter);
    }

    private get current(): Task | undefined {
      return this.list[this.sel];
    }

    private submit(): void {
      const p = parseTask(tokenize(this.input));
      if (p.error) return void (this.hint = p.error);
      if (!p.text) return void (this.typing = false);
      // the clean, quoted command that does it — so the shell shows how to type it
      const flags = [p.prio && p.prio !== "moderate" ? `--${p.prio}` : "", p.due !== undefined && p.dueRaw ? `--due ${q(p.dueRaw)}` : "", ...p.tags.map((t) => `+${t}`)].filter(Boolean);
      run(`todo add ${q(p.text)}${flags.length ? ` ${flags.join(" ")}` : ""}`);
      this.input = "";
      this.hint = "";
      if (this.filter === "done") this.filter = "open";
    }

    private async edit(t: Task): Promise<void> {
      const v = await ib.ui.prompt(`edit #${t.id}`, { initial: t.text });
      if (v?.trim() && v.trim() !== t.text) run(`todo edit ${t.id} ${q(v.trim())}`);
    }

    private async due(t: Task): Promise<void> {
      const v = await ib.ui.prompt(`due date for #${t.id}`, { initial: t.due ?? "", placeholder: "today, tomorrow, fri, +3d, 24/12 — or - to clear" });
      if (v !== null) run(`todo due ${t.id} ${q(v.trim() || "-")}`);
    }

    onText(t: string): boolean {
      if (this.typing) {
        if (t.includes("\n")) {
          this.input += t.replace(/[\r\n]+/g, " ").trimEnd();
          this.submit();
        } else this.input += t;
        this.hint = "";
        this.inputAt = performance.now();
        return true;
      }
      const cur = this.current;
      switch (t) {
        case "a": case "n": case "+": case "i": this.startTyping(); return true;
        case " ": if (cur) run(`todo ${cur.done ? "undo" : "done"} ${cur.id}`); return true;
        case "1": case "2": case "3": case "4": if (cur) run(`todo prio ${cur.id} ${PRIOS[Number(t) - 1]}`); return true;
        case "d": if (cur) void this.due(cur); return true;
        case "e": if (cur) void this.edit(cur); return true;
        case "x": if (cur) run(`todo rm ${cur.id}`); return true;
        case "u": run("todo restore"); return true;
        case "c": run("todo clear"); return true;
        default: return false; // h → HOME etc.
      }
    }

    onKey(k: KeyInput): boolean {
      if (this.typing) {
        switch (k.combo) {
          case "enter": this.submit(); return true;
          case "esc": this.typing = false; this.input = ""; this.hint = ""; return true;
          case "backspace": this.input = this.input.slice(0, -1); this.inputAt = performance.now(); return true;
          case "ctrl+u": this.input = ""; return true;
          case "down": case "tab": this.typing = false; return true;
          default: return k.combo.length === 1; // letters arrive as text
        }
      }
      if (k.combo === "tab" || k.combo === "shift+tab") {
        const i = FILTERS.indexOf(this.filter);
        this.filter = FILTERS[(i + (k.shift ? FILTERS.length - 1 : 1)) % FILTERS.length];
        this.sel = 0;
        return true;
      }
      if (k.combo === "delete" && this.current) return run(`todo rm ${this.current.id}`), true;
      return false;
    }

    onAction(a: Action): boolean {
      if (this.typing) return false;
      const n = this.list.length;
      switch (a) {
        case "up": if (this.sel === 0) this.startTyping(); else this.sel--; return true;
        case "down": this.sel = Math.min(n - 1, this.sel + 1); return true;
        case "confirm": if (this.current) run(`todo ${this.current.done ? "undo" : "done"} ${this.current.id}`); return true;
        case "home": this.sel = 0; return true;
        case "end": this.sel = Math.max(0, n - 1); return true;
        default: return false;
      }
    }

    render(ui: UI, r: Rect, focused: boolean): void {
      const c = ui.c;
      const g = ui.theme.glyphs;
      if (!loaded) return void ui.text(r.x + 1, r.y, `${ui.spinner()} loading…`, { fg: c.muted });
      const w = Math.min(r.w - 2, 110);
      const x0 = r.x + Math.max(1, Math.floor((r.w - w) / 2));
      let y = r.y + 1;

      // ── input line ──
      const inRect = { x: x0, y, w, h: 1 };
      const bg = this.typing ? mix(c.accent, c.bg, 0.86) : c.panelAlt;
      ui.fill(inRect, { bg });
      ui.text(x0 + 1, y, "+", { fg: c.accent, bg, attrs: BOLD });
      if (this.input) ui.text(x0 + 3, y, this.input.slice(-(w - 5)), { fg: c.fg, bg });
      else ui.text(x0 + 3, y, this.typing ? "walk the dog --urgent --due tomorrow +home" : "add a task  (a)", { fg: c.faint, bg }, w - 4);
      if (this.typing && focused) ui.cursor(x0 + 3 + Math.min(strWidth(this.input), w - 5), y, this.inputAt);
      ui.hit(inRect, { onClick: () => this.startTyping(), tip: "type, enter adds · same syntax as `todo add`" });
      y++;
      if (this.hint) ui.text(x0 + 1, y, `⚠ ${this.hint}`, { fg: c.error }, w - 2);
      y += 2;

      // ── filters + counters ──
      let fx = x0;
      for (const f of FILTERS) {
        const label = ` ${f} ${pick(f).length} `;
        const on = f === this.filter;
        const rect = { x: fx, y, w: strWidth(label), h: 1 };
        ui.text(fx, y, label, on ? { fg: c.panel, bg: c.accent, attrs: BOLD } : { fg: ui.hovered(rect) ? c.accent : c.muted, bg: c.highlight });
        ui.hit(rect, { onClick: () => ((this.filter = f), (this.sel = 0)), tip: "tab cycles the filters" });
        fx += rect.w + 1;
      }
      const open = tasks.filter((t) => !t.done);
      const late = open.filter((t) => t.due && daysUntil(t.due) < 0).length;
      const urgent = open.filter((t) => t.prio === "urgent").length;
      const sum = [urgent ? `${urgent} urgent` : "", late ? `${late} late` : ""].filter(Boolean).join(" · ");
      if (sum) ui.textRight(x0 + w, y, sum, { fg: late ? c.error : c.warning });
      y += 2;

      // ── list, grouped by priority ──
      const list = this.list;
      this.sel = Math.max(0, Math.min(this.sel, list.length - 1));
      type Row = { head: Prio } | { task: Task; index: number };
      const rows: Row[] = [];
      list.forEach((t, index) => {
        const prev = list[index - 1];
        if (this.filter !== "done" && !t.done && (!prev || prev.prio !== t.prio || prev.done)) rows.push({ head: t.prio });
        rows.push({ task: t, index });
      });
      const viewH = r.y + r.h - y;
      const selRow = rows.findIndex((row) => "task" in row && row.index === this.sel);
      if (selRow - 1 < this.scroll) this.scroll = Math.max(0, selRow - 1);
      if (selRow >= this.scroll + viewH) this.scroll = selRow - viewH + 1;
      this.scroll = Math.max(0, Math.min(this.scroll, Math.max(0, rows.length - viewH)));

      if (!list.length) {
        const msg = this.filter === "done" ? "nothing finished yet" : this.filter === "today" ? "nothing due today" : "nothing to do. suspicious.  (a to add)";
        ui.text(x0 + 1, y, msg, { fg: c.muted });
      }
      const pc = (p: Prio) => (p === "urgent" ? c.error : p === "high" ? c.warning : p === "moderate" ? c.accent : c.subtle);
      rows.slice(this.scroll, this.scroll + viewH).forEach((row, k) => {
        const ry = y + k;
        if ("head" in row) {
          const label = ` ${row.head.toUpperCase()} `;
          ui.text(x0, ry, "──", { fg: c.faint });
          ui.text(x0 + 2, ry, label, { fg: pc(row.head), attrs: BOLD });
          ui.hline(x0 + 2 + label.length, ry, w - label.length - 2, { fg: c.faint });
          return;
        }
        const t = row.task;
        const rect = { x: x0, y: ry, w, h: 1 };
        const sel = row.index === this.sel && !this.typing;
        const hot = ui.hovered(rect);
        const rbg = sel ? (focused ? c.selection : c.highlight) : hot ? c.highlight : undefined;
        if (rbg !== undefined) ui.fill(rect, { bg: rbg });
        ui.hit(rect, { onClick: () => ((this.sel = row.index), (this.typing = false)), onDouble: () => void this.edit(t) });
        // checkbox → done / undo
        const box = t.done ? g.done : g.todo;
        const bw = strWidth(box);
        ui.text(x0 + 1, ry, box, { fg: t.done ? c.success : pc(t.prio), bg: rbg, attrs: BOLD });
        ui.hit({ x: x0 + 1, y: ry, w: bw, h: 1 }, { cmd: `todo ${t.done ? "undo" : "done"} ${t.id}`, tip: "space / enter" });
        let tx = x0 + 2 + bw;
        ui.text(tx, ry, String(t.id).padStart(3), { fg: c.faint, bg: rbg });
        tx += 4;
        // priority mark: click to cycle
        const mark = prioMark(t.prio);
        const next = PRIOS[(rank(t) + PRIOS.length - 1) % PRIOS.length];
        ui.text(tx, ry, mark, { fg: pc(t.prio), bg: rbg, attrs: BOLD });
        ui.hit({ x: tx, y: ry, w: 3, h: 1 }, { cmd: `todo prio ${t.id} ${next}`, tip: "1 urgent · 2 high · 3 moderate · 4 low" });
        tx += 4;
        // due + remove on the right
        const right = x0 + w - 1;
        let rx = right;
        if (hot || sel) {
          ui.text(right - 1, ry, "×", { fg: c.error, bg: rbg, attrs: BOLD });
          ui.hit({ x: right - 1, y: ry, w: 1, h: 1 }, { cmd: `todo rm ${t.id}`, tip: "x · todo restore brings it back" });
          rx = right - 3;
        }
        if (t.due) {
          const n = daysUntil(t.due);
          const label = dueLabel(t.due);
          const fg = t.done ? c.faint : n < 0 ? c.error : n === 0 ? c.warning : n === 1 ? c.accent : c.subtle;
          rx = ui.textRight(rx, ry, label, { fg, bg: rbg, attrs: n <= 0 && !t.done ? BOLD : 0 }) - 2;
          ui.hit({ x: rx + 2, y: ry, w: strWidth(label), h: 1 }, { onClick: () => void this.due(t), tip: "d · todo due <n> <date>" });
        }
        // text + tags
        const tags = t.tags.map((x) => `+${x}`).join(" ");
        const room = rx - tx - (tags ? strWidth(tags) + 1 : 0);
        const end = ui.text(tx, ry, t.text, { fg: t.done ? c.faint : sel ? c.fg : c.fg, bg: rbg, attrs: t.done ? STRIKE | DIM : 0 }, Math.max(1, room));
        if (tags && room > 4) ui.text(end + 1, ry, tags, { fg: c.accentAlt, bg: rbg }, rx - end - 1);
      });
      if (this.scroll + viewH < rows.length) ui.textRight(x0 + w, r.y + r.h - 1, ` ↓ ${rows.length - this.scroll - viewH} more `, { fg: c.panel, bg: c.accent });
    }
  }

  ib.apps.register({
    kind: "todo",
    title: "Todo",
    description: "to-do list: priorities, due dates, tags",
    icon: "☑",
    launcher: true,
    create: () => new TodoApp(),
  });

  ib.palette.register({ id: "todo.add", title: "Todo: add a task", group: "todo", run: () => run("todo open --add") });

  // ── the HOME widget ──

  ib.widgets.register({
    id: "list",
    title: "todo",
    description: "what's left to do (TODO module)",
    size: { w: 4, h: 5 },
    min: { w: 3, h: 2 },
    render(ui, r) {
      const c = ui.c;
      const g = ui.theme.glyphs;
      if (!loaded) return void ui.text(r.x + 1, r.y, `${ui.spinner()} loading…`, { fg: c.muted });
      const open = pick("open");
      const urgent = open.filter((t) => t.prio === "urgent").length;
      const late = open.filter((t) => t.due && daysUntil(t.due) < 0).length;
      const add = " + add ";
      const ax = r.x + r.w - strWidth(add) - 1;
      const room = ax - r.x - 2;
      let hx = ui.text(r.x + 1, r.y, `${open.length} open`, { fg: open.length ? c.accent : c.success, attrs: BOLD }, room);
      const extra = [urgent ? `${urgent} urgent` : "", late ? `${late} late` : ""].filter(Boolean).join(" · ");
      if (extra && hx - r.x - 1 + 3 + strWidth(extra) <= room) hx = ui.text(hx, r.y, ` · ${extra}`, { fg: c.error });
      const addRect = { x: ax, y: r.y, w: strWidth(add), h: 1 };
      ui.text(ax, r.y, add, ui.hovered(addRect) ? { fg: c.panel, bg: c.accent, attrs: BOLD } : { fg: c.accent, bg: c.highlight });
      ui.hit(addRect, { cmd: "todo open --add", tip: 'or straight from the shell: todo add "…"' });
      if (!open.length) return void ui.text(r.x + 1, r.y + 1, "nothing to do. suspicious.", { fg: c.muted });
      const pc = (p: Prio) => (p === "urgent" ? c.error : p === "high" ? c.warning : p === "moderate" ? c.accent : c.subtle);
      const fits = open.length > r.h - 1 ? r.h - 2 : r.h - 1;
      open.slice(0, fits).forEach((t, i) => {
        const y = r.y + 1 + i;
        const row = { x: r.x, y, w: r.w, h: 1 };
        const hot = ui.hovered(row);
        const box = hot ? g.done : g.todo;
        ui.text(r.x + 1, y, box, { fg: pc(t.prio), attrs: BOLD });
        ui.hit(row, { cmd: `todo done ${t.id}`, tip: `${describe(t)}\nclick: done · todo undo ${t.id} to take it back` });
        const tx = r.x + 2 + strWidth(box);
        const due = t.due ? dueLabel(t.due) : "";
        const dueFg = t.due && daysUntil(t.due) < 0 ? c.error : t.due && daysUntil(t.due) === 0 ? c.warning : c.subtle;
        const dx = due ? ui.textRight(r.x + r.w - 1, y, due, { fg: dueFg }) : r.x + r.w;
        ui.text(tx, y, t.text, { fg: hot ? c.accent : c.fg, attrs: hot ? STRIKE : 0 }, Math.max(1, dx - tx - 1));
      });
      if (fits < open.length) ui.text(r.x + 1, r.y + r.h - 1, `+${open.length - fits} more · enter opens the list`, { fg: c.faint }, r.w - 2);
    },
    activate: () => run("todo open"),
  });
}
