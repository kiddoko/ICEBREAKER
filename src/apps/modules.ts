import { mix } from "../core/color";
import { BOLD, type Rect } from "../core/grid";
import { t } from "../core/i18n";
import type { Action, KeyInput } from "../core/input";
import { strWidth } from "../core/unicode";
import type { Deck } from "../deck";
import { drawBackground } from "../fx/backgrounds";
import { decrypt } from "../fx/glitch";
import type { UI } from "../ui/ui";
import type { App, AppSpec } from "./types";

/** One cartridge in the hive: a module, or one of the deck's own doors. */
interface Cart {
  id: string;
  icon: string;
  name: string;
  description: string;
  /** a module (can be switched, removed) or a door of the frame (new note, shell…) */
  module: boolean;
  on: boolean;
  builtin: boolean;
  /** what enter does */
  launch?: string;
  widgetsOnly?: boolean;
}

/**
 * MODULES — the hive. Every module is a cartridge on a grid seen in
 * perspective: the row you're on sits in front, the rest recede toward the
 * vanishing point, dimmer and smaller. The chosen cartridge lifts out under a
 * scan beam; the bar below says what it is and what you can do with it.
 *
 *   ←↑↓→ choose · enter launch · space on/off · x remove · s store
 * Everything here is also a command: launch, plugin enable/disable, store remove.
 */
export class ModulesApp implements App {
  readonly kind = "modules";
  readonly key = "modules";
  private sel = 0;
  private cols = 4;
  /** the row in front, eased (the hive slides toward you) */
  private depth = 0;
  private lastT = 0;
  private bornAt = performance.now();

  constructor(private readonly deck: Deck) {}

  title(): string {
    return "modules";
  }
  status(): string {
    return t("←↑↓→ choose · enter launch · space on/off · x remove · s store");
  }

  private carts(): Cart[] {
    const d = this.deck;
    const appOf = (id: string) => d.apps.list().find((a) => a.launcher && d.apps.sourceOf(a.kind) === id);
    const mods: Cart[] = d.plugins
      .list()
      .filter((p) => p.manifest.launcher !== false)
      .map((p) => {
        const app = p.active ? appOf(p.manifest.id) : undefined;
        const widgets = d.widgets.list().some((w) => w.source === p.manifest.id);
        return {
          id: p.manifest.id,
          icon: p.manifest.icon ?? app?.icon ?? "▦",
          name: p.manifest.name,
          description: p.manifest.description ?? "",
          module: true,
          on: p.active,
          builtin: p.source === "builtin",
          launch: app ? `launch ${app.kind}` : undefined,
          widgetsOnly: !app && widgets,
        };
      });
    const doors: Cart[] = [
      { id: "note", icon: "✚", name: t("New note"), description: t("a blank page, any title"), module: false, on: true, builtin: true },
      { id: "shell", icon: "❯", name: t("Shell"), description: t("your terminal, with every command of the deck"), module: false, on: true, builtin: true },
      { id: "store", icon: "⇣", name: t("Store"), description: t("more modules and themes"), module: false, on: true, builtin: true, launch: "store" },
    ];
    return [...doors, ...mods];
  }

  private run(c: Cart | undefined): void {
    if (!c) return;
    if (c.id === "shell") return this.deck.workspace.focusShell();
    if (c.id === "note") return void this.deck.newNote();
    if (c.module && !c.on) return void this.deck.act(`plugin enable ${c.id}`);
    if (c.launch) return void this.deck.act(c.launch);
    if (c.widgetsOnly) this.deck.notify(t("{name} adds widgets: on HOME, e then a", { name: c.name }));
  }

  onText(s: string): boolean {
    const c = this.carts()[this.sel];
    if (s === " " && c?.module) return void this.deck.act(`plugin ${c.on ? "disable" : "enable"} ${c.id}`), true;
    if (s === "x" && c?.module) {
      void this.deck.confirm(t("Remove {name}?", { name: c.name }), c.builtin ? t("It ships with the deck: the STORE can reinstall it any time.") : t("Its files go to .trash in your vault.")).then((ok) => {
        if (ok) void this.deck.act(`store remove ${c.id}`);
      });
      return true;
    }
    if (s === "s") return void this.deck.act("store"), true;
    return false;
  }
  onKey(k: KeyInput): boolean {
    if (k.combo === "delete") return this.onText("x");
    return false;
  }
  onAction(a: Action): boolean {
    const n = this.carts().length;
    switch (a) {
      case "left": this.sel = (this.sel - 1 + n) % n; return true;
      case "right": this.sel = (this.sel + 1) % n; return true;
      case "up": this.sel = Math.min(n - 1, this.sel + this.cols); return true; // deeper into the hive
      case "down": this.sel = Math.max(0, this.sel - this.cols); return true;
      case "confirm": this.run(this.carts()[this.sel]); return true;
      case "menu": return this.onText(" ");
      default: return false;
    }
  }

  render(ui: UI, r: Rect, focused: boolean): void {
    const c = ui.c;
    const now = performance.now();
    const dt = this.lastT ? Math.min(0.1, (now - this.lastT) / 1000) : 0;
    this.lastT = now;
    const carts = this.carts();
    this.sel = Math.min(this.sel, carts.length - 1);
    ui.fill(r, { bg: c.bg });

    // layout: cards per row from the width
    const panelH = 5;
    const field = { x: r.x, y: r.y + 1, w: r.w, h: r.h - panelH - 1 };
    const baseW = Math.max(18, Math.min(30, Math.floor(r.w / 4)));
    this.cols = Math.max(2, Math.min(6, Math.floor((r.w - 4) / (baseW + 2))));
    const rows = Math.ceil(carts.length / this.cols);
    const selRow = Math.floor(this.sel / this.cols);
    this.depth += (selRow - this.depth) * Math.min(1, dt * 10);
    if (Math.abs(selRow - this.depth) < 0.002) this.depth = selRow;
    const moving = Math.abs(selRow - this.depth) > 0.002;
    const age = now - this.bornAt;
    ui.animate(moving || age < 900 ? 16 : 60);

    // the sky and the floor: a vanishing point high in the middle, rails toward you
    const vx = r.x + r.w / 2, vy = field.y + 1;
    drawBackground(ui, { x: r.x, y: r.y, w: r.w, h: Math.max(1, Math.floor(field.h * 0.25)) }, { ...ui.theme, background: { ...ui.theme.background, effect: "stars", density: 0.5 } }, 0.6);
    const floorTop = field.y + Math.floor(field.h * 0.22);
    for (let y = floorTop; y < field.y + field.h; y++) {
      const k = (y - vy) / (field.y + field.h - vy); // 0 far → 1 near
      const col = mix(c.bg, c.accent, 0.08 + k * 0.22);
      for (let i = -8; i <= 8; i++) {
        const x = Math.round(vx + i * k * (r.w / 9));
        if (x >= r.x && x < r.x + r.w) ui.text(x, y, k > 0.6 ? "╱╲│"[i < 0 ? 0 : i > 0 ? 1 : 2] : "·", { fg: col });
      }
      // horizontal grid lines rolling toward you
      const phase = (y - floorTop + (now / 600) % 3) % 3;
      if (phase < 1 && k > 0.15) ui.hline(r.x, y, r.w, { fg: mix(c.bg, c.accent, 0.05 + k * 0.1) }, "─");
    }

    // rows from the farthest to the nearest, so the near ones draw on top
    const order: { row: number; d: number }[] = [];
    for (let row = 0; row < rows; row++) {
      const d = row - this.depth; // 0 = in front
      if (d < -0.6 || d > 3.6) continue;
      order.push({ row, d });
    }
    order.sort((a, b) => b.d - a.d);
    for (const { row, d } of order) {
      const s = Math.max(0.35, 1 - d * 0.2); // scale with depth
      const cw = Math.max(8, Math.round(baseW * s));
      const ch = Math.max(3, Math.round(5 * s));
      const gap = Math.max(1, Math.round(2 * s));
      const y = Math.round(field.y + field.h - ch - 1 - d * (field.h * 0.24));
      const inRow = carts.slice(row * this.cols, row * this.cols + this.cols);
      const total = inRow.length * cw + (inRow.length - 1) * gap;
      let x = Math.round(vx - total / 2);
      const fade = Math.min(0.8, Math.max(0, d * 0.28));
      inRow.forEach((cart, k) => {
        const i = row * this.cols + k;
        const isSel = i === this.sel;
        const lift = isSel ? 1 : 0;
        const rect = { x, y: y - lift, w: cw, h: ch };
        if (rect.y >= field.y && rect.y + rect.h <= field.y + field.h + 1) this.drawCart(ui, rect, cart, isSel && focused, fade, age - i * 40);
        ui.hit(rect, { onClick: () => (this.sel = i), onDouble: () => this.run(cart), tip: cart.description });
        x += cw + gap;
      });
    }

    // the bar: what it is, what you can do
    const cur = carts[this.sel];
    const py = r.y + r.h - panelH;
    ui.fill({ x: r.x, y: py, w: r.w, h: panelH }, { bg: c.panelAlt });
    ui.hline(r.x, py, r.w, { fg: mix(c.accent, c.bg, 0.4) }, "━");
    if (!cur) return;
    ui.text(r.x + 2, py + 1, `${cur.icon}  ${cur.name.toUpperCase()}`, { fg: c.accent, bg: c.panelAlt, attrs: BOLD });
    if (cur.module) ui.textRight(r.x + r.w - 2, py + 1, `${cur.builtin ? t("built-in") : t("from the store")} · ${cur.on ? t("on") : t("off")}`, { fg: cur.on ? c.success : c.subtle, bg: c.panelAlt });
    ui.text(r.x + 2, py + 2, cur.description, { fg: c.fg, bg: c.panelAlt }, r.w - 4);
    let bx = r.x + 2;
    const btn = (label: string, run: () => void, tip: string, accent?: number) => (bx += ui.button(bx, py + 3, label, run, { tip, accent }) + 2);
    if (cur.module && !cur.on) btn(t("switch on  ⏎"), () => this.run(cur), "enter · plugin enable");
    else if (cur.launch || cur.id === "shell" || cur.id === "note") btn(t("launch  ⏎"), () => this.run(cur), cur.launch ?? "ctrl+`");
    else if (cur.widgetsOnly) btn(t("its widgets: HOME → e → a"), () => this.run(cur), "e then a on HOME");
    if (cur.module) {
      if (cur.on) btn(t("switch off  space"), () => void this.deck.act(`plugin disable ${cur.id}`), "space · plugin disable");
      btn(t("remove  x"), () => this.onText("x"), "x · store remove", c.error);
    }
    btn(t("store  s"), () => void this.deck.act("store"), "s");
  }

  private drawCart(ui: UI, r: Rect, cart: Cart, sel: boolean, fade: number, age: number): void {
    const c = ui.c;
    const dim = (col: number) => mix(col, c.bg, fade);
    const bg = sel ? mix(c.accent, c.bg, 0.8) : dim(cart.on ? c.panel : c.bg);
    ui.fill(r, { bg });
    // the cartridge: a heavy top edge, a notch, a status light
    const edge = sel ? c.accent : dim(cart.on ? mix(c.accent, c.border, 0.5) : c.faint);
    ui.box(r, { fill: false, border: sel ? "heavy" : "single", bg, focused: sel });
    ui.text(r.x, r.y, sel ? "┏" : "┌", { fg: edge, bg });
    ui.text(r.x + r.w - 3, r.y, cart.on ? "●" : "○", { fg: cart.on ? (sel ? c.success : dim(c.success)) : dim(c.subtle), bg });
    if (r.h >= 3) {
      const name = r.w >= 14 ? cart.name.toUpperCase() : cart.icon;
      const shown = age < 600 ? decrypt(name, Math.max(0, age / 600), ui.now) : name;
      ui.text(r.x + 2, r.y + 1, r.w >= 14 ? `${cart.icon} ${shown}` : shown, { fg: sel ? c.fg : dim(cart.on ? c.fg : c.muted), bg, attrs: sel ? BOLD : 0 }, r.w - 3);
    }
    if (r.h >= 4 && r.w >= 16) ui.text(r.x + 2, r.y + 2, cart.description, { fg: sel ? c.muted : dim(c.subtle), bg }, r.w - 4);
    // the scan beam over the chosen one
    if (sel) {
      const sy = r.y + 1 + (Math.floor(ui.now / 90) % Math.max(1, r.h - 2));
      ui.tint({ x: r.x + 1, y: sy, w: r.w - 2, h: 1 }, -1, mix(bg, c.accent, 0.25));
      ui.animate(90);
    }
    if (strWidth(cart.icon) && r.h < 3) ui.text(r.x + 1, r.y + Math.floor(r.h / 2), cart.icon, { fg: c.accent, bg });
  }
}

export const modulesSpec: AppSpec = {
  kind: "modules",
  title: "Modules",
  description: "every module on the deck: launch, switch, remove",
  icon: "▦",
  create: (deck) => new ModulesApp(deck),
};
