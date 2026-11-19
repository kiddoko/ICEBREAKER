import { Glide } from "../ui/glide";
import { fmt } from "../core/ansi";
import { mix } from "../core/color";
import { strWidth } from "../core/unicode";
import { BOLD, type Rect } from "../core/grid";
import { t } from "../core/i18n";
import type { Action, KeyInput } from "../core/input";
import { DECK_KEYS, displayKeys, displayMenuKey, keysOf, menuKeyOf, normalizeCombo, SHORTCUT_CATEGORIES, SHORTCUTS, type Shortcut } from "../core/shortcuts";
import type { Deck } from "../deck";

import type { Command } from "../shell/types";
import type { UI } from "../ui/ui";
import type { App, AppSpec } from "./types";
import { KeyCapture } from "../workspace/keycapture";
import { q } from "../ui/ui";

/**
 * SHORTCUTS (ctrl+/) — every shortcut by category, with a search field: just
 * type. Your own shortcuts are in "yours": F2 (or the button) binds a key to
 * any shell command — open a note, a folder, a module.
 */
type Row = { kind: "head"; cat: string } | { kind: "key"; s: Shortcut };

/** Rebind one of the deck's shortcuts: the dialog, then `keys set <id> <combo>`. */
export function rebind(deck: Deck, s: Shortcut): void {
  if (!s.id) return;
  deck.workspace.push(new KeyCapture(deck, t("New keys for: {what}", { what: t(s.what) }), [], (combo) => void deck.act(`keys set ${s.id} ${combo}`), s.id, "combo"));
}

/** Its key on THE MENU: the dialog, then `keys menu <id> <key>`. */
export function rebindMenuKey(deck: Deck, s: Shortcut): void {
  if (!s.id) return;
  deck.workspace.push(new KeyCapture(deck, t("Its key on THE MENU: {what}", { what: t(s.short ?? s.what) }), [], (key) => void deck.act(`keys menu ${s.id} ${q(key)}`), s.id, "menu"));
}

/** Back to the default keys — one shortcut, or all of them (asks first). */
export async function resetKeys(deck: Deck, id?: string): Promise<void> {
  const what = id ? t(DECK_KEYS.find((s) => s.id === id)?.what ?? id) : t("every deck shortcut");
  if (!(await deck.confirm(t("Back to the default keys?"), `${what}\n${t("your own shortcuts (bind) stay")}`))) return;
  void deck.act(`keys reset ${id ?? "all"}`);
}

export function userShortcuts(deck: Deck): Shortcut[] {
  return Object.entries(deck.settings.data.keys ?? {}).map(([keys, cmd]) => ({ keys, what: cmd, cat: "yours", cmd }));
}

class ShortcutsApp implements App {
  readonly kind = "shortcuts";
  readonly key = "shortcuts";
  private query = "";
  private sel = 0;
  private scroll = 0;
  /** the wheel's glide (ui/glide.ts) */
  private readonly glide = new Glide();
  /** waiting for the key combo to bind */

  constructor(private readonly deck: Deck) {}

  title() {
    return "shortcuts";
  }
  status() {
    return t("type to search · enter run · F2 change the keys · del back to default / unbind yours");
  }

  private rows(): Row[] {
    const q = this.query.toLowerCase().trim();
    const over = this.deck.settings.data.keyOverrides;
    const all = [...SHORTCUTS.map((sc) => (sc.id ? { ...sc, keys: keysOf(sc, over) || t("(off)") } : sc)), ...userShortcuts(this.deck)];
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
    // the dialog: press the keys, see what they'd replace, say what they do
    this.deck.workspace.push(new KeyCapture(this.deck, t("A new shortcut"), []));
  }

  onKey(k: KeyInput): boolean {
    // F2: change the selected deck shortcut's keys (on one of yours / nothing: a new shortcut)
    if (k.combo === "f2") {
      const cur = this.keyRows()[this.sel];
      const deckKey = cur?.id ? SHORTCUTS.find((x) => x.id === cur.id) : undefined;
      return deckKey ? rebind(this.deck, deckKey) : this.bind(), true;
    }
    if (k.combo === "backspace") return (this.query = this.query.slice(0, -1)), (this.sel = 0), true;
    if (k.combo === "delete") {
      const s = this.keyRows()[this.sel];
      if (s?.cat === "yours") void this.deck.act(`unbind ${s.keys}`);
      else if (s?.id && s.id in (this.deck.settings.data.keyOverrides ?? {})) void resetKeys(this.deck, s.id);
      return true;
    }
    if (k.combo === "esc" && this.query) return (this.query = ""), (this.sel = 0), true;
    return false;
  }
  onText(s: string): boolean {
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
    const bindLabel = t("+ bind a key");
    const bx = x + w - strWidth(bindLabel) - 2;
    const field = { x, y, w: bx - x - 2, h: 1 };
    ui.fill(field, { bg: c.highlight });
    ui.text(x + 1, y, "⌕", { fg: c.accent, bg: c.highlight });
    if (this.query) ui.text(x + 3, y, this.query, { fg: c.fg, bg: c.highlight }, field.w - 4);
    else ui.text(x + 3, y, t("type to search: \"note\", \"tab\", \"ctrl+shift\"…"), { fg: c.muted, bg: c.highlight }, field.w - 4);
    if (focused) ui.cursor(x + 3 + this.query.length, y);
    ui.button(bx, y, bindLabel, () => this.bind(), { tip: "F2 · bind <keys> <command>" });
    // every deck shortcut back to its default keys (asks first)
    const changed = Object.keys(this.deck.settings.data.keyOverrides ?? {}).length;
    if (changed) {
      const rl = `↺ ${t("defaults")} (${changed})`;
      ui.button(bx - strWidth(rl) - 4, y, rl, () => void resetKeys(this.deck), { tip: t("every deck shortcut back to its default keys · keys reset all"), accent: c.warning });
    }
    y += 2;

    const rows = this.rows();
    const keyed = this.keyRows();
    this.sel = Math.min(this.sel, Math.max(0, keyed.length - 1));
    const selShortcut = keyed[this.sel];
    const room = r.y + r.h - y - 1;

    // a cheat sheet: the categories flow into columns (as many as fit, 2-4),
    // a category stays in one column; the whole board scrolls if it's taller than the page
    const area = { x: r.x + 2, w: r.w - 4 };
    const ncols = Math.max(1, Math.min(4, Math.floor(area.w / 44)));
    const colW = Math.floor((area.w - (ncols - 1) * 3) / ncols);
    type Line = Row | { kind: "none" };
    const blocks: Line[][] = [];
    for (const row of rows) {
      if (row.kind === "head") blocks.push([row, ...(row.cat === "yours" && !userShortcuts(this.deck).length ? [{ kind: "none" } as Line] : [])]);
      else blocks[blocks.length - 1]?.push(row);
    }
    const total = blocks.reduce((n, b) => n + b.length + 1, 0);
    const target = Math.max(room, Math.ceil(total / ncols));
    const cols: Line[][] = Array.from({ length: ncols }, () => []);
    let ci = 0;
    for (const b of blocks) {
      if (ci < ncols - 1 && cols[ci].length && cols[ci].length + b.length > target) ci++;
      if (cols[ci].length) cols[ci].push({ kind: "none", gap: true } as unknown as Line);
      cols[ci].push(...b);
    }
    const boardH = Math.max(0, ...cols.map((c2) => c2.length));
    // keep the selection visible
    const selLine = cols.map((col) => col.findIndex((l) => l.kind === "key" && l.s === selShortcut)).find((i) => i >= 0) ?? -1;
    if (selLine >= 0 && selLine - this.scroll >= room) this.scroll = selLine - room + 1;
    if (selLine >= 0 && selLine < this.scroll + 1) this.scroll = Math.max(0, selLine - 1);
    this.scroll = this.glide.follow(ui, this.scroll, boardH - room);
    ui.hit({ x: r.x, y, w: r.w, h: room }, { onWheel: (d) => this.glide.push(d) });
    const keyW = Math.min(20, Math.floor(colW * 0.42));
    cols.forEach((col, k) => {
      const cx = area.x + k * (colW + 3);
      if (k) ui.vline(cx - 2, y, room, { fg: c.faint }, "┊");
      col.slice(this.scroll, this.scroll + room).forEach((line, j) => {
        const ly = y + j;
        if (line.kind === "head") {
          const name = t(line.cat).toUpperCase();
          ui.text(cx, ly, name, { fg: c.title, attrs: BOLD });
          ui.hline(cx + strWidth(name) + 1, ly, colW - strWidth(name) - 1, { fg: c.faint }, "─");
        } else if (line.kind === "none") {
          if (!(line as { gap?: boolean }).gap) ui.text(cx + 1, ly, t("none yet — F2 binds a key"), { fg: c.muted }, colW - 1);
        } else {
          const s2 = line.s;
          const sel = s2 === selShortcut;
          const box = { x: cx, y: ly, w: colW, h: 1 };
          const bg = sel && focused ? mix(c.accent, c.bg, 0.8) : ui.hovered(box) ? c.highlight : undefined;
          if (bg) ui.fill(box, { bg });
          const st = bg ? { bg } : {};
          ui.textRight(cx + keyW, ly, truncateKeys(displayKeys(s2.keys), keyW), { fg: c.accent, attrs: BOLD, ...st });
          ui.text(cx + keyW + 2, ly, s2.cat === "yours" ? s2.what : t(s2.what), { fg: s2.cmd ? c.fg : c.subtle, ...st }, colW - keyW - 2);
          ui.hit(box, { onClick: () => (this.sel = keyed.indexOf(s2)), onDouble: () => s2.cmd && void this.deck.act(s2.cmd), tip: `${displayKeys(s2.keys)} — ${s2.cat === "yours" ? s2.what : t(s2.what)}${s2.cmd ? `\n${s2.cmd}` : ""}${s2.cat === "yours" ? `\nunbind ${s2.keys}` : ""}` });
        }
      });
    });
    if (boardH > room) ui.textRight(r.x + r.w - 1, r.y + r.h - 1, ` ${this.scroll + room < boardH ? "↓" : "↑"} ${t("wheel")} `, { fg: c.panel, bg: c.accent });
  }
}

/** keys too long for their column keep their end (the key itself) */
function truncateKeys(k: string, w: number): string {
  return strWidth(k) <= w ? k : `…${k.slice(k.length - w + 1)}`;
}

export const shortcutsSpec: AppSpec = {
  kind: "shortcuts",
  title: "Shortcuts",
  description: "every keyboard shortcut, searchable; bind your own",
  icon: "⌨",
  create: (deck) => new ShortcutsApp(deck),
};

const keysCmd: Command = {
  name: "keys",
  summary: "the deck's own shortcuts: change them, switch them off, back to the defaults",
  usage: "keys                    the ones you changed\nkeys list               every deck shortcut, with its id\nkeys set <id> <keys>    e.g. keys set panel ctrl+shift+b\nkeys off <id>           switch one off\nkeys reset <id> | all   back to the default keys (and keys on THE MENU)\nkeys menu               the keys on THE MENU (⌘K, a key, enter)\nkeys menu <id> <key>    e.g. keys menu panel p  (off: none, reset: its default)",
  complete: () => ["list", "set", "off", "reset", "menu", ...DECK_KEYS.map((s) => s.id!)],
  run(ctx) {
    const d = ctx.deck;
    const over = { ...(d.settings.data.keyOverrides ?? {}) };
    const [a, id, ...rest] = ctx.args;
    const find = (i?: string) => DECK_KEYS.find((s) => s.id === i);
    if (a === "menu" || a === "space") {
      const lead = { ...(d.settings.data.menu?.keys ?? {}) };
      if (!id) {
        ctx.out(fmt.dim("THE MENU (⌘K · shift twice): a key, then enter\n"));
        for (const s of DECK_KEYS) {
          const k = menuKeyOf(s, lead);
          if (k) ctx.out(`${fmt.bold(displayMenuKey(k).padEnd(6))} ${t(s.short ?? s.what)}${s.id! in lead ? fmt.yellow("  (changed)") : ""}\n`);
        }
        return 0;
      }
      const s = find(id);
      if (!s) return ctx.err(`keys: no shortcut ${id} (keys list)\n`), 1;
      const v = rest.join(" ");
      if (v === "reset") delete lead[s.id!];
      else if (v === "off") lead[s.id!] = "";
      else {
        const key = v;
        if ([...key].length !== 1 || key === " ") return ctx.err("keys menu: one key (a letter, a digit, a sign)\n"), 1;
        // one key, one shortcut: the one that had it lets it go
        for (const o of DECK_KEYS) if (o !== s && menuKeyOf(o, lead) === key) lead[o.id!] = "";
        lead[s.id!] = key;
      }
      d.settings.set("menu.keys", lead);
      return ctx.out(`${s.id} → ${displayMenuKey(menuKeyOf(s, lead)) || "(off)"}\n`), 0;
    }
    if (!a || a === "list") {
      const list = a === "list" ? DECK_KEYS : DECK_KEYS.filter((s) => s.id! in over);
      if (!list.length) return ctx.out(fmt.dim("all at their default keys · keys list shows them\n")), 0;
      for (const s of list) ctx.out(`${fmt.bold(s.id!.padEnd(12))} ${displayKeys(keysOf(s, over) || "—").padEnd(22)} ${fmt.dim(t(s.what))}${s.id! in over ? fmt.yellow("  (changed)") : ""}\n`);
      return 0;
    }
    if (a === "reset") {
      if (id === "all") d.settings.set("keyOverrides", {}), d.settings.set("menu.keys", {});
      else if (find(id)) {
        delete over[id!];
        d.settings.set("keyOverrides", over);
        const lead = { ...(d.settings.data.menu?.keys ?? {}) };
        delete lead[id!];
        d.settings.set("menu.keys", lead);
      }
      else return ctx.err(`keys: no shortcut ${id ?? ""} (keys list)\n`), 1;
      return ctx.out(`${id === "all" ? "every shortcut" : id}: default keys\n`), 0;
    }
    const s = find(id);
    if (!s) return ctx.err(`keys: no shortcut ${id ?? ""} (keys list)\n`), 1;
    if (a === "off") return d.settings.set("keyOverrides", { ...over, [s.id!]: "" }), ctx.out(`${s.id}: off\n`), 0;
    if (a === "set") {
      const combo = normalizeCombo(rest.join(" "));
      if (!combo) return ctx.err(`keys: "${rest.join(" ")}" — use a modifier (ctrl+shift+b) or an F key\n`), 1;
      d.settings.set("keyOverrides", { ...over, [s.id!]: combo });
      return ctx.out(`${s.id} → ${displayKeys(combo)}\n`), 0;
    }
    return ctx.err("usage: keys [list | set <id> <keys> | off <id> | reset <id>|all]\n"), 1;
  },
};

export const shortcutCommands: Command[] = [
  keysCmd,
  {
    name: "shortcuts",
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
    usage: 'bind                          list yours\nbind <keys> "<command>"       e.g. bind ctrl+shift+1 "open notes/ideas.md"\nbind <keys> "<cmd 1>; <cmd 2>" several things, one after the other\nbind --pick ["<command>"]     a dialog: press the keys, see what they\'d replace',
    examples: [
      ['bind ctrl+shift+1 "open notes/ideas.md"', "a note one key away"],
      ['bind alt+t "launch todo"', "a module"],
      ['bind ctrl+alt+p "explore projects"', "a folder in NEXUS"],
    ],
    run(ctx) {
      const d = ctx.deck;
      const [keys, ...rest] = ctx.args;
      const mine = d.settings.data.keys ?? {};
      // bind --pick ["command"]: the dialog that waits for the keys (and checks what they'd replace)
      if (keys === "--pick") {
        d.workspace.push(new KeyCapture(d, t("A new shortcut"), rest.length ? [rest.join(" ")] : []));
        return 0;
      }
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
