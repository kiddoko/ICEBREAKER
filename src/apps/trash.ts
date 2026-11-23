import { ago } from "../core/time";
import { mix } from "../core/color";
import { BOLD, type Rect } from "../core/grid";
import { t } from "../core/i18n";
import type { Action, KeyInput } from "../core/input";
import type { Deck } from "../deck";
import { purgeItems, trashItems, type TrashItem } from "../shell/commands/trash";
import { ListView } from "../ui/list";
import { q, type MenuEntry, type UI } from "../ui/ui";
import { strWidth } from "../core/unicode";
import { middlePath } from "../vault/paths";
import { fileIcon } from "../ui/fileicon";
import type { App, AppSpec } from "./types";
import { Bar } from "../ui/layout";
import { folders } from "../core/suggest";
import { TRASH } from "../core/glyphs";

/**
 * TRASH (the tree's last line, `trash open`) — a page, not a tab: what `rm`, Delete
 * in the tree and right-click → trash put in <vault>/.trash, newest first, with
 * where each thing lived. Put things back (where they were, or elsewhere), open
 * one to read it — or delete it for good (del, after a question that says it
 * can't be undone), or empty the whole trash.
 *
 *   ↑↓ choose · enter restore · r restore to… · o open · del delete for good · esc close
 */
export class TrashApp implements App {
  readonly kind = "trash";
  readonly key = "trash";
  private list = new ListView<TrashItem>();
  private loadedAt = -1e9;
  private loading = false;
  private loaded = false;
  private bornAt = performance.now();

  constructor(private readonly deck: Deck) {
    this.list.onActivate = (it) => this.restore(it);
    this.list.tipOf = (it) => `${it.from ? `${t("from")} /${it.from}\n` : ""}${t("enter: put it back")} · trash restore ${q(it.name)}`;
    this.list.menuOf = (it) => this.itemMenu(it);
  }

  title(): string {
    return "trash";
  }
  status(): string {
    return t("↑↓ choose · enter restore · r restore to… · o open · del delete for good · esc close");
  }

  private reload(): void {
    if (this.loading) return;
    this.loading = true;
    void trashItems(this.deck)
      .then((items) => {
        const cur = this.list.current?.path;
        this.list.items = items;
        const i = cur ? items.findIndex((x) => x.path === cur) : -1;
        this.list.select(i >= 0 ? i : Math.min(this.list.selected, items.length - 1));
      })
      .catch(() => {})
      .finally(() => {
        this.loading = false;
        this.loaded = true;
        this.loadedAt = performance.now();
        this.deck.requestFrame();
      });
  }

  private restore(it: TrashItem | undefined): void {
    if (!it) return;
    void this.deck.act(`trash restore ${q(it.path)}`).then(() => this.reload());
  }
  private async restoreTo(it: TrashItem | undefined): Promise<void> {
    if (!it) return;
    const to = await this.deck.prompt(t("Restore to (a path in the vault)"), { initial: it.from || it.name, suggestions: folders(this.deck).map((f) => `${f}/${it.name}`) });
    if (to?.trim()) void this.deck.act(`trash restore ${q(it.path)} ${q(to.trim())}`).then(() => this.reload());
  }
  /** gone for good, after a question that says so (shell/commands/trash.ts purgeItems) */
  private async purge(items: TrashItem[], all = false): Promise<void> {
    const n = await purgeItems(this.deck, items, all);
    if (n) this.deck.notify(n === 1 ? t("deleted for good") : t("{n} things deleted for good", { n }), "success");
    this.loadedAt = -1e9;
    this.reload();
  }
  private open(it: TrashItem | undefined): void {
    if (it && !it.isDir) void this.deck.openFile(it.path);
  }

  private itemMenu(it: TrashItem): MenuEntry[] {
    return [
      { label: `${t("restore")}${it.from ? ` → /${it.from}` : ""}`, run: () => this.restore(it), hint: "enter" },
      { label: t("Restore to…"), tip: t("put it back somewhere else"), run: () => void this.restoreTo(it), hint: "r" },
      { label: t("Preview"), tip: t("read it without taking it out of the trash"), run: () => this.open(it), hint: "o", disabled: it.isDir },
      "-",
      { label: t("Delete permanently…"), tip: t("can't be undone"), run: () => void this.purge([it]), hint: "del", danger: true },
      { label: t("Empty the trash…"), tip: t("everything in it, for good"), run: () => void this.purge(this.list.items, true), danger: true },
    ];
  }

  menu(): MenuEntry[] {
    const it = this.list.current;
    return it ? this.itemMenu(it) : [];
  }

  onText(s: string): boolean {
    if (s === "r") return void this.restoreTo(this.list.current), true;
    if (s === "o") return this.open(this.list.current), true;
    return false;
  }
  onKey(k: KeyInput): boolean {
    // del (⌘⌫ on a Mac): this one, for good — it asks first
    if (k.combo === "delete" && this.list.current) return void this.purge([this.list.current]), true;
    return false;
  }
  onAction(a: Action): boolean {
    return this.list.onAction(a);
  }

  render(ui: UI, r: Rect, focused: boolean): void {
    const c = ui.c;
    // the trash changes behind our back (rm in the shell, Delete in the tree): look again now and then
    if (performance.now() - this.loadedAt > 2000) this.reload();
    ui.animate(1000);
    ui.fill(r, { bg: c.bg });
    const items = this.list.items;
    const age = performance.now() - this.bornAt;
    if (age < 400) ui.animate(16);

    // ── the bin, on the left (when there's room) ──
    const wide = r.w >= 64;
    const artW = wide ? 18 : 0;
    if (wide) this.drawBin(ui, { x: r.x + 2, y: r.y + 1, w: artW - 2, h: 9 }, items.length);

    const x = r.x + artW + 2;
    const w = r.w - artW - 4;
    let y = r.y + 1;
    const count = !this.loaded ? `${ui.spinner()}` : items.length === 1 ? t("1 thing") : items.length ? t("{n} things", { n: items.length }) : t("empty");
    // title, the count, and "empty the whole trash" (asks first, can't be undone): when the
    // row is short the count goes first, then the button (`trash empty` / del still work)
    const bar = new Bar(ui, x, y, x + w)
      .text(`${TRASH} ${t("trash")}`, { fg: c.accent, attrs: BOLD }, { priority: 9, fit: 3 })
      .text(count, { fg: c.subtle }, { side: "right", priority: 5 });
    if (items.length) {
      const empty = () => void this.purge(items, true);
      const tip = `${t("everything in it, for good — it asks first")} · trash empty`;
      bar.button(`✕ ${t("empty the trash")}`, empty, { tip, accent: c.error }, { side: "right", priority: 7 });
    }
    bar.draw();
    y++;
    ui.hline(x, y, w, { fg: mix(c.accent, c.bg, 0.6) }, "━");
    y++;
    ui.text(x, y, t("put back with enter · delete for good with del (asks first, can't be undone)"), { fg: c.subtle }, w);
    y += 2;

    const panelH = 4;
    const listR = { x, y, w, h: Math.max(1, r.y + r.h - y - panelH - 1) };
    if (!items.length) {
      if (this.loaded) {
        ui.textCenter(listR, listR.y + Math.floor(listR.h / 3), t("nothing in the trash"), { fg: c.muted, attrs: BOLD });
        ui.textCenter(listR, listR.y + Math.floor(listR.h / 3) + 1, t("rm, Delete in the tree or right-click → trash put things here"), { fg: c.subtle });
      }
    } else {
      this.list.render(ui, listR, focused, (it, row, sel, i) => {
        const bg = sel ? mix(c.accent, c.bg, focused ? 0.8 : 0.88) : ui.hovered(row) ? c.highlight : -1;
        const st = bg !== -1 ? { bg } : {};
        if (bg !== -1) ui.fill(row, { bg });
        // rows slide in one after the other on the first look
        const late = age < 400 && i * 30 > age;
        if (late) return;
        const icon = it.isDir ? "▸" : fileIcon(it.name);
        ui.text(row.x + 1, row.y, icon, { fg: sel ? c.accent : c.subtle, ...st });
        const when = ago(it.at.getTime(), true);
        const right = `${it.from ? `/${it.from}  ` : ""}${when}`;
        const rw = Math.min(Math.floor(row.w * 0.55), right.length);
        ui.text(row.x + 4, row.y, it.isDir ? `${it.name}/` : it.name, { fg: sel ? c.fg : c.muted, attrs: sel ? BOLD : 0, ...st }, row.w - rw - 7);
        ui.textRight(row.x + row.w - 2, row.y, right.length > rw ? `…${right.slice(right.length - rw + 1)}` : right, { fg: sel ? c.subtle : c.faint, ...st });
      });
    }

    // ── what you can do with the chosen one ──
    const py = r.y + r.h - panelH;
    ui.fill({ x: r.x, y: py, w: r.w, h: panelH }, { bg: c.panelAlt });
    ui.hline(r.x, py, r.w, { fg: mix(c.accent, c.bg, 0.4) }, "━");
    const cur = this.list.current;
    if (cur) {
      ui.text(x, py + 1, cur.isDir ? `${cur.name}/` : cur.name, { fg: c.accent, bg: c.panelAlt, attrs: BOLD }, w);
      let bx = x;
      const btn = (label: string, run: () => void, tip: string, accent?: number) => (bx += ui.button(bx, py + 2, label, run, { tip, accent }) + 2);
      // the buttons' labels: long ones when they fit, else short ones (a narrow window cut
      // "delete permanently" off the right edge); each button is ` label ` + 2 between them
      const fits = (labels: string[]) => labels.reduce((n, l) => n + strWidth(l) + 4, 0) <= w;
      const long = [`${t("restore to…")}  r`, ...(cur.isDir ? [] : [`${t("open")}  o`]), `${t("delete permanently")}  del`];
      const short = [`${t("to…")} r`, ...(cur.isDir ? [] : [`${t("open")} o`]), `✕ ${t("delete")} del`];
      // a very narrow page: the keys alone (each still a button, its tip says what it does)
      const tiny = ["r", ...(cur.isDir ? [] : ["o"]), "✕ del"];
      const rest = fits([`${t("restore")}  ⏎`, ...long]) ? long : fits([`↩ ⏎`, ...short]) ? short : tiny;
      const head = rest === long ? `${t("restore")}  ⏎` : rest === short ? `↩ ⏎` : "↩";
      // the restore button gets what the others leave: a long path is cut in the middle,
      // its start and the file's name kept (/journal/…/2026-11-20.md); no room: no path
      const room = w - rest.reduce((n, l) => n + strWidth(l) + 4, 0) - strWidth(head) - 4;
      const where = cur.from && room >= 12 ? ` → ${middlePath(`/${cur.from}`, room)}` : "";
      btn(rest === tiny ? head : `${head.replace(/\s*⏎$/, "")}${where}  ⏎`, () => this.restore(cur), `${t("restore")} · enter · trash restore${cur.from ? `\n/${cur.from}` : ""}`);
      btn(rest[0], () => void this.restoreTo(cur), `${t("restore to…")} · r · trash restore <n> <path>`);
      if (!cur.isDir) btn(rest[1], () => this.open(cur), "o · read it");
      btn(rest[rest.length - 1], () => void this.purge([cur]), `${t("delete permanently")} · del · trash purge · ${t("can't be undone")}`, c.error);
    } else ui.text(x, py + 1, t("esc closes · trash in the shell lists it too"), { fg: c.subtle, bg: c.panelAlt }, w);
  }

  /** A little bin in characters; the more inside, the fuller it looks. */
  private drawBin(ui: UI, r: Rect, n: number): void {
    const c = ui.c;
    const edge = mix(c.accent, c.bg, 0.25);
    const dim = mix(c.accent, c.bg, 0.65);
    const full = Math.min(5, Math.ceil(n / 3));
    let y = r.y;
    ui.text(r.x + 4, y++, "┏━━━┓", { fg: edge }); // the handle: its corners stand on the lid's two ┻
    ui.text(r.x, y++, "╺━━━┻━━━┻━━━╸", { fg: edge, attrs: BOLD });
    for (let i = 0; i < 5; i++) {
      const filled = 5 - i <= full;
      ui.text(r.x + 1, y, "┃", { fg: edge });
      ui.text(r.x + 2, y, filled ? "░▒▓▒░▒▓▒░" : " ╏  ╏  ╏ ", { fg: filled ? dim : mix(c.faint, c.bg, 0.3) });
      ui.text(r.x + 11, y, "┃", { fg: edge });
      y++;
    }
    ui.text(r.x + 1, y, "┗━━━━━━━━━┛", { fg: edge });
  }
}


export const trashSpec: AppSpec = {
  kind: "trash",
  title: "Trash",
  description: "what you deleted: put it back",
  icon: "⌫",
  create: (deck) => new TrashApp(deck),
};
