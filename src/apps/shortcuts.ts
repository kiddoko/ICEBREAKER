import { fmt } from "../core/ansi";
import { mix } from "../core/color";
import { strWidth } from "../core/unicode";
import { BOLD, type Rect } from "../core/grid";
import { t } from "../core/i18n";
import type { Action, KeyInput } from "../core/input";
import { displayKeys, normalizeCombo, SHORTCUT_CATEGORIES, SHORTCUTS, type Shortcut } from "../core/shortcuts";
import type { Deck } from "../deck";
import { q } from "../ui/ui";
import type { Command } from "../shell/types";
import type { UI } from "../ui/ui";
import type { App, AppSpec } from "./types";

/**
 * SHORTCUTS (ctrl+/) — every shortcut by category, with a search field: just
 * type. Your own shortcuts are in "yours": F2 (or the button) binds a key to
 * any shell command — open a note, a folder, a module.
 */
type Row = { kind: "head"; cat: string } | { kind: "key"; s: Shortcut };

export function userShortcuts(deck: Deck): Shortcut[] {
  return Object.entries(deck.settings.data.keys ?? {}).map(([keys, cmd]) => ({ keys, what: cmd, cat: "yours", cmd }));
}

class ShortcutsApp implements App {
  readonly kind = "shortcuts";
  readonly key = "shortcuts";
  private query = "";
  private sel = 0;
  private scroll = 0;
  /** waiting for the key combo to bind */
  private capturing = false;

  constructor(private readonly deck: Deck) {}

  title() {
    return "shortcuts";
  }
  status() {
    return this.capturing ? t("press the keys to bind · esc cancel") : t("type to search · enter run · F2 bind a key · del unbind yours");
  }

  private rows(): Row[] {
    const q = this.query.toLowerCase().trim();
    const all = [...SHORTCUTS, ...userShortcuts(this.deck)];
    const match = (s: Shortcut) => !q || `${s.keys} ${displayKeys(s.keys)} ${s.what} ${t(s.what)} ${s.cat} ${t(s.cat)}`.toLowerCase().includes(q);
    const out: Row[] = [];
    for (const cat of SHORTCUT_CATEGORIES) {
      const list = all.filter((s) => s.cat === cat && match(s));
      if (!list.length && !(cat === "yours" && !q)) continue;
      out.push({ kind: "head", cat });
      for (const s of list) out.push({ kind: "key", s });
    }
    return out;
  }
  private keyRows(): Shortcut[] {
    return this.rows().flatMap((r) => (r.kind === "key" ? [r.s] : []));
  }

  private bind(): void {
    this.capturing = true;
  }

  onKey(k: KeyInput): boolean {
    if (this.capturing) {
      if (k.combo === "esc") return (this.capturing = false), true;
      if (["ctrl", "alt", "shift", "meta", "control", "option", "command"].includes(k.key)) return true; // wait for the real key
      const combo = normalizeCombo(k.combo);
      if (!combo) return this.deck.notify(t("use a modifier: ctrl / alt / shift + a key"), "warning"), true;
      this.capturing = false;
      void this.deck.prompt(t("Run what? (a shell command)"), { placeholder: "open notes/ideas.md · launch todo · explore projects" }).then((cmd) => {
        if (cmd?.trim()) void this.deck.act(`bind ${combo} ${q(cmd.trim())}`);
      });
      return true;
    }
    if (k.combo === "f2") return this.bind(), true;
    if (k.combo === "backspace") return (this.query = this.query.slice(0, -1)), (this.sel = 0), true;
    if (k.combo === "delete") {
      const s = this.keyRows()[this.sel];
      if (s?.cat === "yours") void this.deck.act(`unbind ${s.keys}`);
      return true;
    }
    if (k.combo === "esc" && this.query) return (this.query = ""), (this.sel = 0), true;
    return false;
  }
  onText(s: string): boolean {
    if (this.capturing) return true;
    this.query += s;
    this.sel = 0;
    return true;
  }
  onAction(a: Action): boolean {
    const n = this.keyRows().length;
    if (a === "up") return (this.sel = n ? (this.sel - 1 + n) % n : 0), true;
    if (a === "down" || a === "item-next") return (this.sel = n ? (this.sel + 1) % n : 0), true;
    if (a === "page-down") return (this.sel = Math.min(n - 1, this.sel + 10)), true;
    if (a === "page-up") return (this.sel = Math.max(0, this.sel - 10)), true;
    if (a === "confirm") {
      const s = this.keyRows()[this.sel];
      if (s?.cmd) void this.deck.act(s.cmd);
      return true;
    }
    return false;
  }

  render(ui: UI, r: Rect, focused: boolean): void {
    const c = ui.c;
    const w = Math.min(r.w - 4, 100), x = r.x + Math.floor((r.w - w) / 2);
    let y = r.y + 1;
    // the search field
    const bindLabel = this.capturing ? t("press keys…") : t("+ bind a key");
    const bx = x + w - strWidth(bindLabel) - 2;
    const field = { x, y, w: bx - x - 2, h: 1 };
    ui.fill(field, { bg: c.highlight });
    ui.text(x + 1, y, "⌕", { fg: c.accent, bg: c.highlight });
    if (this.query) ui.text(x + 3, y, this.query, { fg: c.fg, bg: c.highlight }, field.w - 4);
    else ui.text(x + 3, y, t("type to search: \"note\", \"tab\", \"ctrl+shift\"…"), { fg: c.muted, bg: c.highlight }, field.w - 4);
    if (focused && !this.capturing) ui.cursor(x + 3 + this.query.length, y);
    ui.button(bx, y, bindLabel, () => this.bind(), { tip: "F2 · bind <keys> <command>", selected: this.capturing });
    y += 2;

    const rows = this.rows();
    const keyed = this.keyRows();
    this.sel = Math.min(this.sel, Math.max(0, keyed.length - 1));
    const selShortcut = keyed[this.sel];
    // keep the selection visible
    const selIndex = rows.findIndex((row) => row.kind === "key" && row.s === selShortcut);
    const room = r.y + r.h - y - 1;
    if (selIndex - this.scroll >= room) this.scroll = selIndex - room + 1;
    if (selIndex >= 0 && selIndex < this.scroll + 1) this.scroll = Math.max(0, selIndex - 1);
    ui.hit({ x: r.x, y, w: r.w, h: room }, { onWheel: (d) => (this.scroll = Math.max(0, Math.min(rows.length - room, this.scroll + d))) });
    const keyW = Math.min(30, Math.floor(w * 0.36));
    for (const row of rows.slice(this.scroll, this.scroll + room)) {
      if (row.kind === "head") {
        ui.text(x, y, `${t(row.cat).toUpperCase()} `, { fg: c.title, attrs: BOLD });
        ui.hline(x + t(row.cat).length + 2, y, w - t(row.cat).length - 2, { fg: c.faint }, "─");
        if (row.cat === "yours" && !userShortcuts(this.deck).length) {
          y++;
          ui.text(x + 2, y, t("none yet — F2 binds a key to open a note, a folder, a module…"), { fg: c.muted }, w - 2);
        }
      } else {
        const s = row.s;
        const sel = s === selShortcut;
        const line = { x, y, w, h: 1 };
        const bg = sel && focused ? mix(c.accent, c.bg, 0.8) : ui.hovered(line) ? c.highlight : undefined;
        if (bg) ui.fill(line, { bg });
        const st = bg ? { bg } : {};
        ui.textRight(x + keyW, y, displayKeys(s.keys), { fg: c.accent, attrs: BOLD, ...st });
        ui.text(x + keyW + 3, y, s.cat === "yours" ? s.what : t(s.what), { fg: s.cmd ? c.fg : c.subtle, ...st }, w - keyW - 4);
        ui.hit(line, { onClick: () => (this.sel = keyed.indexOf(s)), onDouble: () => s.cmd && void this.deck.act(s.cmd), tip: s.cmd ? `${s.cmd}${s.cat === "yours" ? `\nunbind ${s.keys}` : ""}` : undefined });
      }
      y++;
    }
  }
}

export const shortcutsSpec: AppSpec = {
  kind: "shortcuts",
  title: "Shortcuts",
  description: "every keyboard shortcut, searchable; bind your own",
  icon: "⌨",
  create: (deck) => new ShortcutsApp(deck),
};

export const shortcutCommands: Command[] = [
  {
    name: "shortcuts",
    aliases: ["keys"],
    summary: "every keyboard shortcut, by category (ctrl+/)",
    usage: "shortcuts            the page\nshortcuts <words>    search them here",
    run(ctx) {
      const q = ctx.args.join(" ").toLowerCase();
      if (!q) return void ctx.deck.openApp("shortcuts"), 0;
      for (const s of [...SHORTCUTS, ...userShortcuts(ctx.deck)]) {
        if (!`${s.keys} ${s.what} ${s.cat}`.toLowerCase().includes(q)) continue;
        ctx.out(`${fmt.bold(displayKeys(s.keys).padStart(24))}  ${s.what} ${fmt.dim(`· ${s.cat}`)}\n`);
      }
      return 0;
    },
  },
  {
    name: "bind",
    summary: "your own shortcut: a key combo runs a shell command",
    usage: 'bind                          list yours\nbind <keys> "<command>"       e.g. bind ctrl+shift+1 "open notes/ideas.md"',
    examples: [
      ['bind ctrl+shift+1 "open notes/ideas.md"', "a note one key away"],
      ['bind alt+t "launch todo"', "a module"],
      ['bind ctrl+alt+p "explore projects"', "a folder in NEXUS"],
    ],
    run(ctx) {
      const d = ctx.deck;
      const [keys, ...rest] = ctx.args;
      const mine = d.settings.data.keys ?? {};
      if (!keys) {
        const list = Object.entries(mine);
        if (!list.length) return ctx.out(fmt.dim('none yet — bind ctrl+shift+1 "open notes/ideas.md"\n')), 0;
        for (const [k, cmd] of list) ctx.out(`${fmt.bold(displayKeys(k).padStart(16))}  ${cmd}\n`);
        return 0;
      }
      const combo = normalizeCombo(keys);
      if (!combo) return ctx.err(`bind: "${keys}" — use a modifier: ctrl+shift+1, alt+t, ⌘⇧1…\n`), 1;
      const cmd = rest.join(" ").trim();
      if (!cmd) return ctx.err('usage: bind <keys> "<command>"\n'), 1;
      const taken = SHORTCUTS.find((s) => s.keys.split(" · ").includes(combo));
      d.settings.set("keys", { ...mine, [combo]: cmd });
      ctx.out(`${fmt.green("⌨")} ${fmt.bold(displayKeys(combo))} → ${cmd}${taken ? fmt.yellow(`  (replaces: ${taken.what})`) : ""}\n`);
      return 0;
    },
  },
  {
    name: "unbind",
    summary: "remove one of your shortcuts",
    usage: "unbind <keys>",
    complete: () => [],
    run(ctx) {
      const d = ctx.deck;
      const combo = normalizeCombo(ctx.args.join(""));
      const mine = { ...(d.settings.data.keys ?? {}) };
      if (!combo || !(combo in mine)) return ctx.err(`unbind: no shortcut of yours on "${ctx.args.join(" ")}" (bind)\n`), 1;
      delete mine[combo];
      d.settings.set("keys", mine);
      ctx.out(`${fmt.red("✕")} ${displayKeys(combo)}\n`);
      return 0;
    },
  },
];
