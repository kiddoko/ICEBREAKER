/**
 * HABITS — boxes that reset every day. Not tasks (that's TODO): things you
 * do again and again, with a streak for each and the numbers in STATS.
 *
 *   habit                              today: what's done, what's left, streaks
 *   habit add "drink water" --times 8  several times a day
 *   habit add "stretch" --days mon,wed,fri
 *   habit check 1 · habit check water  one more (enter / space in the app)
 *   habit uncheck 1 · habit rm 1 · habit open
 *
 * Stored in the module's data file; nothing online.
 */
import type { App } from "../../src/apps/types";
import type { Rect } from "../../src/core/grid";
import type { Action, KeyInput } from "../../src/core/input";
import type { IcebreakerAPI } from "../../src/plugins/api";
import type { UI } from "../../src/ui/ui";

interface Habit {
  id: number;
  name: string;
  /** times per day */
  per: number;
  /** weekdays it's due, 0 = sunday (empty = every day) */
  days: number[];
  created: string;
}
/** "YYYY-MM-DD" → habit id → times done */
type Log = Record<string, Record<number, number>>;

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const back = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
};
const DAY_NAMES: Record<string, number> = { sun: 0, dim: 0, mon: 1, lun: 1, tue: 2, mar: 2, wed: 3, mer: 3, thu: 4, jeu: 4, fri: 5, ven: 5, sat: 6, sam: 6 };

export function activate(ib: IcebreakerAPI): void {
  const { BOLD, mix, fmt, parseFlags, t, q } = ib.lib;
  const run = (line: string) => void ib.shell.run(line);
  let habits: Habit[] = [];
  let log: Log = {};
  let next = 1;
  let loaded = false;
  const ready = (async () => {
    habits = await ib.storage.get<Habit[]>("habits", []);
    log = await ib.storage.get<Log>("log", {});
    next = habits.reduce((n, h) => Math.max(n, h.id + 1), 1);
    loaded = true;
    ib.ui.redraw();
  })();

  const dueOn = (h: Habit, d: Date) => !h.days.length || h.days.includes(d.getDay());
  const count = (h: Habit, d: Date) => log[ymd(d)]?.[h.id] ?? 0;
  const doneOn = (h: Habit, d: Date) => count(h, d) >= h.per;
  const today = () => habits.filter((h) => dueOn(h, new Date()));
  /** days in a row, scheduled days only; today counts once it's done */
  const streak = (h: Habit) => {
    let n = 0;
    for (let i = doneOn(h, new Date()) ? 0 : 1; i < 400; i++) {
      const d = back(i);
      if (d < new Date(h.created) && ymd(d) !== ymd(new Date(h.created))) break;
      if (!dueOn(h, d)) continue;
      if (!doneOn(h, d)) break;
      n++;
    }
    return n;
  };
  const record = () => {
    const due = today();
    const done = due.filter((h) => doneOn(h, new Date())).length;
    void ib.stats.set("today", due.length ? Math.round((done / due.length) * 100) : 0, { label: "habits done today", unit: "%" }).catch(() => {});
    void ib.stats.set("best", habits.reduce((m, h) => Math.max(m, streak(h)), 0), { label: "best habit streak", unit: "d" }).catch(() => {});
  };
  const save = async () => {
    // keep a year of history
    const cut = ymd(back(400));
    for (const k of Object.keys(log)) if (k < cut) delete log[k];
    await ib.storage.set("habits", habits);
    await ib.storage.set("log", log);
    record();
    ib.ui.redraw();
  };
  const find = (k: string | undefined) => (k === undefined ? undefined : habits.find((h) => h.id === Number(k)) ?? habits.find((h) => h.name.toLowerCase().includes(k.toLowerCase())));
  const bump = async (h: Habit, delta: number) => {
    const k = ymd(new Date());
    const day = (log[k] ??= {});
    const before = day[h.id] ?? 0;
    day[h.id] = Math.max(0, Math.min(h.per, before + delta));
    if (before < h.per && day[h.id] >= h.per) void ib.stats.add("done", 1, { label: "habits completed", kind: "counter" }).catch(() => {});
    await save();
    return day[h.id];
  };
  const boxes = (h: Habit, d = new Date()) => {
    const n = count(h, d);
    return h.per === 1 ? (n ? "☑" : "☐") : h.per <= 8 ? "●".repeat(n) + "○".repeat(h.per - n) : `${n}/${h.per}`;
  };
  const daysLabel = (h: Habit) => (h.days.length ? h.days.map((d) => ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][d]).join(" ") : t("every day"));

  ib.commands.register({
    name: "habit",
    aliases: ["habits"],
    summary: "daily habits: boxes that reset every day, streaks (HABITS module)",
    usage: [
      "habit                                    today, with streaks",
      'habit add "name" [--times 8] [--days mon,wed,fri]',
      "habit check <n|name> · habit uncheck <n|name>",
      "habit rm <n> · habit open",
    ].join("\n"),
    examples: [
      ['habit add "drink water" --times 8', "eight glasses: ●●●○○○○○"],
      ['habit add "stretch" --days mon,wed,fri', "only those days"],
      ["habit check water", "one more glass"],
    ],
    complete: () => ["add", "check", "uncheck", "rm", "open", ...habits.map((h) => String(h.id))],
    async run(ctx) {
      await ready;
      const { flags, rest } = parseFlags(ctx.args, ["times", "days"]);
      const [sub, ...words] = rest;
      if (!sub || sub === "ls" || sub === "today") {
        if (!habits.length) return ctx.out(fmt.dim('no habits yet — habit add "read 20 pages"\n')), 0;
        for (const h of habits) {
          const due = dueOn(h, new Date());
          const s = streak(h);
          ctx.out(`${fmt.dim(String(h.id).padStart(3))}  ${due ? (doneOn(h, new Date()) ? fmt.green(boxes(h)) : boxes(h)) : fmt.dim("—")}  ${due ? fmt.bold(h.name) : fmt.dim(h.name)}${s ? fmt.yellow(`  ▲${s}`) : ""}${h.days.length ? fmt.dim(`  ${daysLabel(h)}`) : ""}\n`);
        }
        return 0;
      }
      if (sub === "open") return void ib.apps.open("habits"), 0;
      if (sub === "add") {
        const name = words.join(" ").trim();
        if (!name) return ctx.err('usage: habit add "name" [--times 8] [--days mon,wed,fri]\n'), 1;
        const per = Math.max(1, Math.min(50, Number(flags.times) || 1));
        const days = typeof flags.days === "string" ? [...new Set(flags.days.toLowerCase().split(/[,\s]+/).map((d) => DAY_NAMES[d.slice(0, 3)]).filter((d) => d !== undefined))] : [];
        const h: Habit = { id: next++, name, per, days, created: new Date().toISOString() };
        habits.push(h);
        await save();
        ctx.out(`${fmt.green("+")} ${fmt.bold(h.name)} ${fmt.dim(`· ${per > 1 ? `${per}× a day · ` : ""}${daysLabel(h)} · #${h.id}`)}\n`);
        return 0;
      }
      const h = find(words.join(" ") || undefined);
      if (!h) return ctx.err(`habit: no habit "${words.join(" ")}" (habit ls)\n`), 1;
      if (sub === "check" || sub === "uncheck") {
        const n = await bump(h, sub === "check" ? 1 : -1);
        ctx.out(`${n >= h.per ? fmt.green(boxes(h)) : boxes(h)} ${h.name}${n >= h.per && sub === "check" ? fmt.yellow(`  ▲${streak(h)}`) : ""}\n`);
        return 0;
      }
      if (sub === "rm" || sub === "remove") {
        habits = habits.filter((x) => x !== h);
        await save();
        ctx.out(`${fmt.red("✕")} ${h.name}\n`);
        return 0;
      }
      return ctx.err(`habit: unknown "${sub}" (man habit)\n`), 1;
    },
  });

  async function addFlow(): Promise<void> {
    const name = await ib.ui.prompt(t("A new habit"), { placeholder: t("read 20 pages · drink water · stretch") });
    if (!name?.trim()) return;
    const times = await ib.ui.prompt(t("How many times a day?"), { initial: "1" });
    if (times === null) return;
    const days = await ib.ui.prompt(t("Which days? (empty = every day)"), { placeholder: "mon,wed,fri" });
    if (days === null) return;
    run(`habit add ${q(name.trim())}${Number(times) > 1 ? ` --times ${Number(times)}` : ""}${days.trim() ? ` --days ${days.trim().replace(/\s+/g, "")}` : ""}`);
  }

  ib.modules.expose("list", { doc: "list() → [{ id, name, per, days, today (count), done, streak }]", fn: async () => (await ready, habits.map((h) => ({ ...h, today: count(h, new Date()), done: doneOn(h, new Date()), streak: streak(h) }))) });
  ib.modules.expose("check", { doc: "check(id) → one more today; returns today's count", fn: async (id: number) => (await ready, bump(habits.find((h) => h.id === Number(id)) ?? (() => { throw new Error(`no habit ${id}`); })(), 1)) });

  /** one row: boxes, name, streak, the last 14 days */
  const drawRow = (ui: UI, x: number, y: number, w: number, h: Habit, bg?: number) => {
    const c = ui.c;
    const st = bg !== undefined ? { bg } : {};
    const due = dueOn(h, new Date());
    const done = doneOn(h, new Date());
    let cx = ui.text(x + 1, y, due ? boxes(h) : "—", { fg: done ? c.success : due ? c.accent : c.faint, attrs: BOLD, ...st });
    const stripW = w >= 50 ? 14 : w >= 36 ? 7 : 0;
    const s = streak(h);
    const right = x + w - 1;
    const sEnd = ui.textRight(right, y, s ? `▲${s}` : "", { fg: c.warning, attrs: BOLD, ...st });
    if (stripW) {
      let sx = sEnd - stripW - 2;
      for (let i = stripW - 1; i >= 0; i--) {
        const d = back(i);
        const ch = !dueOn(h, d) ? "·" : doneOn(h, d) ? "■" : count(h, d) ? "▪" : "□";
        ui.text(sx++, y, ch, { fg: doneOn(h, d) ? c.accent : c.faint, ...st });
      }
    }
    cx += 1;
    ui.text(cx, y, h.name, { fg: due ? (done ? c.subtle : c.fg) : c.muted, attrs: done ? 0 : BOLD, ...st }, sEnd - (stripW ? stripW + 3 : 1) - cx);
  };

  class HabitsApp implements App {
    readonly kind = "habits";
    readonly key = "habits";
    private sel = 0;
    title() {
      return "Habits";
    }
    status() {
      return t("space / enter check · u uncheck · a add · x remove");
    }
    onText(s: string): boolean {
      const h = habits[this.sel];
      if (s === "a" || s === "+") return void addFlow(), true;
      if (s === " " && h) return run(`habit check ${h.id}`), true;
      if (s === "u" && h) return run(`habit uncheck ${h.id}`), true;
      if (s === "x" && h) {
        void ib.ui.confirm(t("Remove {name}?", { name: h.name }), t("Its history goes too.")).then((ok) => ok && run(`habit rm ${h.id}`));
        return true;
      }
      return false;
    }
    onKey(k: KeyInput): boolean {
      return k.combo === "delete" ? this.onText("x") : false;
    }
    onAction(a: Action): boolean {
      const n = habits.length;
      if (a === "up") return (this.sel = n ? (this.sel - 1 + n) % n : 0), true;
      if (a === "down" || a === "item-next") return (this.sel = n ? (this.sel + 1) % n : 0), true;
      if (a === "confirm") return habits[this.sel] ? run(`habit check ${habits[this.sel].id}`) : void addFlow(), true;
      return false;
    }
    render(ui: UI, r: Rect, focused: boolean): void {
      const c = ui.c;
      if (!loaded) return;
      ui.animate(60_000);
      const w = Math.min(r.w - 4, 90), x = r.x + Math.floor((r.w - w) / 2);
      let y = r.y + 1;
      const due = today(), done = due.filter((h) => doneOn(h, new Date())).length;
      ui.button(x, y, t("+ new habit"), () => void addFlow(), { tip: "a" });
      ui.textRight(x + w, y, due.length ? t("{done} of {n} today", { done, n: due.length }) : "", { fg: done === due.length && due.length ? c.success : c.subtle, attrs: BOLD });
      y += 1;
      if (due.length) ui.bar(x, ++y, w, done / due.length, c.accent, c.faint);
      y += 2;
      this.sel = Math.min(this.sel, Math.max(0, habits.length - 1));
      if (!habits.length) ui.text(x, y, t("no habits yet — a adds one (drink water ×8, read, stretch on mon wed fri…)"), { fg: c.muted }, w);
      habits.forEach((h, i) => {
        if (y >= r.y + r.h - 1) return;
        const line = { x, y, w, h: 1 };
        const bg = i === this.sel && focused ? mix(c.accent, c.bg, 0.8) : ui.hovered(line) ? c.highlight : undefined;
        if (bg !== undefined) ui.fill(line, { bg });
        drawRow(ui, x, y, w, h, bg);
        ui.hit(line, { onClick: () => (this.sel = i), onDouble: () => run(`habit check ${h.id}`), tip: `habit check ${h.id} · habit uncheck ${h.id}` });
        y++;
      });
    }
  }
  ib.apps.register({ kind: "habits", title: "Habits", description: "daily habits with streaks", icon: "◉", launcher: true, create: () => new HabitsApp() });
  ib.palette.register({ id: "habits.add", title: "Habits: a new habit…", group: "habits", run: () => void addFlow() });

  let popSel = 0;
  ib.widgets.register({
    id: "today",
    title: "habits",
    description: "today's habits and streaks (HABITS module)",
    size: { w: 4, h: 3 },
    min: { w: 2, h: 1 },
    open: "habit open",
    render(ui, r) {
      if (!loaded) return;
      ui.animate(60_000);
      const list = today();
      if (!list.length) return void ui.text(r.x + 1, r.y, habits.length ? t("nothing due today") : t("no habits yet"), { fg: ui.c.muted }, r.w - 2);
      list.slice(0, r.h).forEach((h, i) => drawRow(ui, r.x, r.y + i, r.w, h));
    },
    popup: {
      title: "habits",
      size: { w: 60, h: 12 },
      hint: "space check · u uncheck · a add · ↑↓",
      render(ui, r) {
        const c = ui.c;
        const list = today();
        popSel = Math.min(popSel, Math.max(0, list.length - 1));
        list.slice(0, r.h - 2).forEach((h, i) => {
          const bg = i === popSel ? mix(c.accent, c.bg, 0.8) : undefined;
          if (bg !== undefined) ui.fill({ x: r.x, y: r.y + i, w: r.w, h: 1 }, { bg });
          drawRow(ui, r.x + 1, r.y + i, r.w - 2, h, bg);
          ui.hit({ x: r.x, y: r.y + i, w: r.w, h: 1 }, { onClick: () => (popSel = i), onDouble: () => run(`habit check ${h.id}`) });
        });
        if (!list.length) ui.text(r.x + 2, r.y, t("nothing due today"), { fg: c.muted });
        ui.button(r.x + 2, r.y + r.h - 1, t("+ new habit"), () => void addFlow(), { tip: "a" });
      },
      onText: (s, { close }) => {
        const h = today()[popSel];
        if (s === "a" || s === "+") return close(), void addFlow(), true;
        if (s === " " && h) return run(`habit check ${h.id}`), true;
        if (s === "u" && h) return run(`habit uncheck ${h.id}`), true;
        return false;
      },
      onAction: (a) => {
        const n = today().length;
        if (a === "up") return (popSel = n ? (popSel - 1 + n) % n : 0), true;
        if (a === "down") return (popSel = n ? (popSel + 1) % n : 0), true;
        if (a === "confirm" && today()[popSel]) return run(`habit check ${today()[popSel].id}`), true;
        return false;
      },
    },
  });

  ib.lib.addTranslations("fr", {
    "every day": "tous les jours",
    "A new habit": "Une nouvelle habitude",
    "read 20 pages · drink water · stretch": "lire 20 pages · boire de l'eau · s'étirer",
    "How many times a day?": "Combien de fois par jour ?",
    "Which days? (empty = every day)": "Quels jours ? (vide = tous les jours)",
    "Habits": "Habitudes",
    "habits": "habitudes",
    "space / enter check · u uncheck · a add · x remove": "espace / entrée cocher · u décocher · a ajouter · x retirer",
    "Remove {name}?": "Retirer {name} ?",
    "Its history goes too.": "Son historique part aussi.",
    "+ new habit": "+ nouvelle habitude",
    "{done} of {n} today": "{done} sur {n} aujourd'hui",
    "no habits yet — a adds one (drink water ×8, read, stretch on mon wed fri…)": "pas encore d'habitudes — a en ajoute une (boire de l'eau ×8, lire, s'étirer lun mer ven…)",
    "nothing due today": "rien de prévu aujourd'hui",
    "no habits yet": "pas encore d'habitudes",
    "space check · u uncheck · a add · ↑↓": "espace cocher · u décocher · a ajouter · ↑↓",
    "today's habits and streaks (HABITS module)": "les habitudes du jour et leurs séries (module HABITS)",
    "habits done today": "habitudes faites aujourd'hui",
    "best habit streak": "meilleure série d'habitude",
    "habits completed": "habitudes accomplies",
  });
}

export function deactivate(): void {}
