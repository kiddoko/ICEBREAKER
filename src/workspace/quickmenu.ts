import type { PaletteAction } from "../apps/types";
import { mix } from "../core/color";
import { fuzzyFilter } from "../core/fuzzy";
import { BOLD, type Rect } from "../core/grid";
import { t } from "../core/i18n";
import type { Action, KeyInput } from "../core/input";
import { DECK_KEYS, menuKeyOf, MENU, shortcutFor } from "../core/shortcuts";
import { strWidth, truncate } from "../core/unicode";
import type { Deck } from "../deck";
import { TextEditor } from "../ui/editor";
import { ListView } from "../ui/list";
import { q, type UI } from "../ui/ui";
import { KeyCapture } from "./keycapture";
import type { Overlay } from "./overlays";

/**
 * THE MENU — one place to do anything, from anywhere:
 *
 *   ⌘K / ctrl+K · shift twice (even while typing) · hold RB or Y (gamepad)
 *
 * You type, it searches everything (commands, notes, apps, themes, shortcuts).
 * Empty, it shows the keys of what you use most: type the key and enter
 * (m ⏎ = MODULES) — the exact key always comes first in the results, so a key
 * never fires by itself and you can still search anything that starts with it.
 * Arrows / the stick move, enter / A runs, esc / B closes.
 *
 * The keys come from three places, in this order (a later one takes the key):
 *   1. the deck's shortcuts (core/shortcuts.ts `menuKey`, changed in Settings → KEYS)
 *   2. modules: ib.palette.register({ id, title, key: "g", run })  (only if the key is free)
 *   3. yours: settings.keys "menu g" → a command (`menu add g "open notes/x.md"`,
 *      or right-click anything → "add to the menu…")
 */
export interface QuickItem {
  key: string;
  label: string;
  run(): void;
  /** where it comes from: "deck", a module id, "yours" */
  from: string;
  tip?: string;
}

export function quickItems(deck: Deck): QuickItem[] {
  const s = deck.settings.data;
  const out = new Map<string, QuickItem>();
  for (const sc of DECK_KEYS) {
    const key = menuKeyOf(sc, s.menu?.keys);
    if (key) out.set(key, { key, label: sc.short ?? sc.what, from: "deck", run: () => deck.workspace.runShortcut(sc), tip: sc.cmd });
  }
  for (const a of deck.actions.list()) {
    if (a.key && !out.has(a.key)) out.set(a.key, { key: a.key, label: a.title, from: deck.actions.sourceOf(a.id) ?? "core", run: () => void a.run() });
  }
  for (const [combo, cmd] of Object.entries(s.keys ?? {})) {
    if (!combo.startsWith(MENU)) continue;
    const key = combo.slice(MENU.length);
    out.set(key, { key, label: cmd, from: "yours", run: () => void deck.act(cmd), tip: cmd });
  }
  return [...out.values()];
}

/** A free key for something new on the menu (digits first, then letters nobody uses). */
export function freeQuickKey(deck: Deck, taken: Set<string> = new Set()): string | null {
  const used = new Set([...quickItems(deck).map((i) => i.key), ...taken]);
  return [..."1234567890", ..."bcdgiorvyzBCDGIJKLMOPRSTUVWXYZ"].find((k) => !used.has(k)) ?? null;
}

const CELL = 22;

export class QuickMenu implements Overlay {
  modal = true;
  done = false;
  private readonly input = new TextEditor("", { singleLine: true, placeholder: t("search everything, or a key + enter") });
  private readonly list = new ListView<PaletteAction>();
  private lastQuery = "\0";
  /** empty search: the chosen key in the grid (arrows, stick), -1 none */
  private cell = -1;
  private readonly items: QuickItem[];
  /** gamepad: the stick moved the choice (letting go of RB runs it) */
  private padMoved = false;
  private stickArmed = true;
  private stickAt = 0;

  constructor(
    private readonly deck: Deck,
    o: { pad?: boolean } = {},
  ) {
    this.items = quickItems(deck);
    if (o.pad) this.cell = 0;
    this.input.onSubmit = () => this.runSelected();
    this.list.onActivate = () => this.runSelected();
    deck.sound.play("tick");
  }

  private get query(): string {
    return this.input.text;
  }

  private runItem(i: QuickItem): void {
    this.done = true;
    i.run();
  }

  private runSelected(): void {
    if (!this.query) {
      const i = this.items[this.cell];
      if (i) this.runItem(i);
      return;
    }
    const a = this.list.current;
    this.done = true;
    if (a) void Promise.resolve(a.run()).catch((e) => console.error(e));
  }

  /** The search: the item whose key you typed first, then everything that matches. */
  private search(q: string): PaletteAction[] {
    const exact = this.items
      .filter((i) => i.key === q)
      .map((i): PaletteAction => ({ id: `menu.${i.key}`, title: i.from === "deck" ? t(i.label) : i.label, group: `≡ ${i.key}`, hint: t("enter"), run: () => i.run() }));
    return [...exact, ...fuzzyFilter(q, this.deck.paletteEntries(), (a) => `${a.group ?? ""} ${a.title}`, 300)];
  }

  // ── the grid (empty search) ─────────────────────────────────────────────
  private cols = 4;
  private rows = 1;
  private move(dx: number, dy: number): void {
    const n = this.items.length;
    if (!n) return;
    if (this.cell < 0) return void (this.cell = 0);
    // column-major (the grid is filled column by column)
    let col = Math.floor(this.cell / this.rows), row = this.cell % this.rows;
    col = (col + dx + this.cols) % this.cols;
    row = (row + dy + this.rows) % this.rows;
    this.cell = Math.min(n - 1, col * this.rows + row);
    this.deck.sound.play("move");
  }

  /** The gamepad's stick while RB is held: one step per push (and repeats while held). */
  aim(angle: number, mag: number): void {
    const now = performance.now();
    if (mag < 0.35) return void (this.stickArmed = true);
    if (mag < 0.6 || (!this.stickArmed && now - this.stickAt < 220)) return;
    this.stickArmed = false;
    this.stickAt = now;
    // 0 = up, clockwise
    const dir = Math.round(((angle % (2 * Math.PI)) + 2 * Math.PI) / (Math.PI / 2)) % 4;
    this.move(dir === 1 ? 1 : dir === 3 ? -1 : 0, dir === 0 ? -1 : dir === 2 ? 1 : 0);
    this.padMoved = true;
  }

  /** RB let go: runs what the stick chose; if it didn't move, the menu stays (d-pad, A, B). */
  release(): void {
    if (this.padMoved) this.runSelected();
  }

  // ── input ───────────────────────────────────────────────────────────────
  onText(ch: string): boolean {
    this.input.onText(ch);
    return true;
  }

  onKey(k: KeyInput): boolean {
    if (k.combo === "esc") return this.query ? this.input.setText("") : (this.done = true), true;
    if (shortcutFor(k.combo, this.deck.settings.data.keyOverrides)?.id === "menu" || k.combo === "ctrl+p") return (this.done = true), true;
    const arrows: Record<string, [number, number]> = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] };
    if (!this.query && arrows[k.key] && !k.ctrl) return this.move(...arrows[k.key]), true;
    if (this.query && ["up", "down", "pageup", "pagedown"].includes(k.key)) {
      this.list.onAction(k.key === "up" ? "up" : k.key === "down" ? "down" : k.key === "pageup" ? "page-up" : "page-down");
      return true;
    }
    if (k.combo === "enter") return this.runSelected(), true;
    this.input.onKey(k);
    return true;
  }

  onAction(a: Action): boolean {
    if (a === "back" || a === "palette") this.done = true;
    else if (a === "confirm") this.runSelected();
    else if (!this.query && (a === "left" || a === "right" || a === "up" || a === "down")) this.move(a === "left" ? -1 : a === "right" ? 1 : 0, a === "up" ? -1 : a === "down" ? 1 : 0);
    else this.list.onAction(a);
    return true;
  }

  // ── drawing ─────────────────────────────────────────────────────────────
  render(ui: UI, screen: Rect): void {
    const c = ui.c;
    if (this.query !== this.lastQuery) {
      this.lastQuery = this.query;
      if (this.query) {
        this.list.items = this.search(this.query);
        this.list.select(0);
        this.list.scrollTop = 0;
      }
    }
    ui.tint(screen, c.subtle);
    ui.hit(screen, { onClick: () => (this.done = true), onWheel: () => {}, block: true });

    const w = Math.min(screen.w - 4, 92);
    this.cols = Math.max(1, Math.floor((w - 4) / CELL));
    this.rows = Math.max(1, Math.ceil(this.items.length / this.cols));
    const bodyH = this.query ? Math.min(18, Math.max(3, this.list.items.length)) : this.rows + 2;
    const h = Math.min(screen.h - 2, bodyH + 4);
    const box = { x: screen.x + Math.floor((screen.w - w) / 2), y: screen.y + Math.max(1, Math.floor(screen.h * 0.14)), w, h };
    const inner = ui.box(box, { title: "MENU", focused: true, bg: c.panelAlt, info: this.query ? `${this.list.items.length}` : "esc" });

    // the search line
    ui.text(inner.x + 1, inner.y, "❯", { fg: c.accent, attrs: BOLD, bg: c.panelAlt });
    this.input.render(ui, { x: inner.x + 3, y: inner.y, w: inner.w - 4, h: 1 }, true);
    ui.hline(inner.x, inner.y + 1, inner.w, { fg: c.border });
    const body = { x: inner.x, y: inner.y + 2, w: inner.w, h: inner.h - 2 };

    if (this.query) {
      this.list.render(ui, body, true, (a, row, selected) => {
        const gx = ui.text(row.x + 1, row.y, a.group ? `${a.group} ` : "", { fg: selected ? c.accentAlt : a.id.startsWith("menu.") ? c.accent : c.subtle, attrs: a.id.startsWith("menu.") ? BOLD : 0 });
        const hintW = a.hint ? Math.min(strWidth(a.hint), Math.floor(row.w / 3)) : 0;
        const tx = ui.text(gx, row.y, a.title, { fg: selected ? c.fg : c.muted, attrs: selected ? BOLD : 0 }, row.w - (gx - row.x) - hintW - 3);
        if (a.hint && row.x + row.w - 2 - hintW > tx) ui.textRight(row.x + row.w - 2, row.y, truncate(a.hint, hintW), { fg: c.faint });
      });
      if (!this.list.items.length) ui.textCenter(body, body.y + 1, t("nothing matches"), { fg: c.subtle });
      return;
    }

    // the keys, column by column
    this.items.forEach((it, i) => {
      const col = Math.floor(i / this.rows), row = i % this.rows;
      const cell = { x: body.x + 1 + col * CELL, y: body.y + row, w: CELL - 1, h: 1 };
      if (cell.y >= body.y + body.h - 1) return;
      const on = i === this.cell;
      const hot = on || ui.hovered(cell);
      const bg = on ? mix(c.accent, c.panelAlt, 0.6) : hot ? c.highlight : c.panelAlt;
      if (hot) ui.fill(cell, { bg });
      ui.text(cell.x + 1, cell.y, it.key, { fg: c.accent, bg, attrs: BOLD });
      const label = it.from === "deck" ? t(it.label) : it.label;
      ui.text(cell.x + 3, cell.y, truncate(label, CELL - 5), { fg: it.from === "yours" ? c.title : on ? c.fg : c.muted, bg });
      ui.hit(cell, { onClick: () => this.runItem(it), tip: it.tip });
    });
    ui.text(body.x + 1, body.y + body.h - 1, t("a key + enter runs it · type to search · ⌘K or shift twice, from anywhere"), { fg: c.faint, bg: c.panelAlt }, body.w - 2);
  }
}

/**
 * "Add to the menu…" (right-click menus, `menu add`): asks which key, then
 * binds it to the command (`bind "menu g" "<cmd>"`).
 */
export function addToMenu(deck: Deck, label: string, cmd: string): void {
  deck.workspace.push(
    new KeyCapture(deck, t("Its key on THE MENU: {what}", { what: label }), [cmd], (key) => void deck.act(`bind ${q(MENU + key)} ${q(cmd)}`), undefined, "menu"),
  );
}

/**
 * The gamepad's old action wheel (settings.gamepad.wheel, before 0.3.2): its
 * slots become keys on THE MENU, once.
 */
export function migrateWheel(deck: Deck): void {
  const pages = deck.settings.data.gamepad?.wheel ?? [];
  if (!pages.length) return;
  const mine = { ...(deck.settings.data.keys ?? {}) };
  const have = new Set(Object.values(mine));
  const taken = new Set<string>();
  for (const slot of pages.flat()) {
    if (!slot?.cmd || have.has(slot.cmd)) continue;
    const key = freeQuickKey(deck, taken);
    if (!key) break;
    taken.add(key);
    mine[MENU + key] = slot.cmd;
    have.add(slot.cmd);
  }
  deck.settings.set("keys", mine);
  deck.settings.set("gamepad", { ...deck.settings.data.gamepad, wheel: [] });
}
