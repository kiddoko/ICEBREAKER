import { mix } from "../core/color";
import { BOLD, type Rect } from "../core/grid";
import { t } from "../core/i18n";
import type { Action, KeyInput } from "../core/input";
import { strWidth } from "../core/unicode";
import type { Deck } from "../deck";
import { decrypt } from "../fx/glitch";
import type { MenuEntry, UI } from "../ui/ui";
import { ring, WheelSpin } from "../ui/wheelspin";
import type { App, AppSpec } from "./types";

/** One floppy on the ring: a module, or one of the deck's own doors. */
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
 * MODULES — a ring of floppy disks, like NEXUS: every module is a disk turning
 * on an endless ring (5 in front), smaller and dimmer toward the back. The one
 * in front sits under the drive's read beam; the bar below says what it is and
 * what you can do with it.
 *
 *   ←↑↓→ choose · enter launch · space on/off · x remove · s store
 * Everything here is also a command: launch, plugin enable/disable, store remove.
 */
export class ModulesApp implements App {
  readonly kind = "modules";
  readonly key = "modules";
  private sel = 0;
  /** where the ring is (`spin.pos`), eased toward sel; the wheel / trackpad steps */
  private spin = new WheelSpin();
  /** spin.pos, read by the floor and the ring this frame */
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
    this.deck.sound.play("select");
    if (c.id === "shell") return this.deck.workspace.focusShell();
    if (c.id === "note") return void this.deck.newNote();
    if (c.module && !c.on) return void this.deck.act(`plugin enable ${c.id}`);
    if (c.launch) return void this.deck.act(c.launch);
    if (c.widgetsOnly) this.deck.notify(t("{name} adds widgets: on HOME, e then a", { name: c.name }));
  }

  /** Right-click on a card. */
  private cartMenu(c: Cart): MenuEntry[] {
    const items: MenuEntry[] = [];
    if (c.module && !c.on) items.push({ label: t("switch on"), run: () => this.run(c), hint: "enter" });
    else if (c.launch || !c.module) items.push({ label: t("launch"), run: () => this.run(c), hint: "enter" });
    if (c.module) {
      if (c.on) items.push({ label: t("switch off"), cmd: `plugin disable ${c.id}`, hint: "space" });
      items.push({ label: t("pin"), cmd: `pin ${c.id}`, hint: "p" }, "-", { label: t("remove…"), run: () => void this.onText("x"), danger: true, hint: "x" });
    }
    items.push("-", { label: t("store"), cmd: "store", hint: "s" });
    return items;
  }

  /** Right-click on an empty spot: the selected card. */
  menu(): MenuEntry[] {
    const c = this.carts()[this.sel];
    return c ? this.cartMenu(c) : [{ label: t("store"), cmd: "store" }];
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
    if (s === "p" && c?.module) return void this.deck.act(`pin ${c.id}`), true;
    return false;
  }
  onKey(k: KeyInput): boolean {
    if (k.combo === "delete") return this.onText("x");
    return false;
  }
  onAction(a: Action): boolean {
    const n = this.carts().length;
    switch (a) {
      case "left": case "up": this.sel = (this.sel - 1 + n) % n; this.deck.sound.play("tick"); return true;
      // the ring turns with ↑↓ too
      case "right": case "down": case "item-next": this.sel = (this.sel + 1) % n; this.deck.sound.play("tick"); return true;
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

    // ── a ring of floppies, like NEXUS: never ends, 5 in front (3 for 3-4 modules) ──
    const panelH = 5;
    // a tall page (shell hidden): the scene keeps its size and sits in the middle, the bar under it
    const sceneH = Math.min(r.h - panelH - 1, 30);
    const top = r.y + Math.max(0, Math.floor((r.h - panelH - 1 - sceneH) / 2));
    const field = { x: r.x, y: top + 1, w: r.w, h: sceneH };
    const n = carts.length;
    // ease the ring the short way round (pos never resets: past the last comes the first)
    const moving = this.spin.ease(this.sel, n, dt) > 0.002;
    this.depth = this.spin.pos;
    const age = now - this.bornAt;
    ui.animate(moving || age < 900 ? 16 : focused ? 120 : 400);
    ui.hit(r, {
      onWheel: (lines) => {
        const s = this.spin.wheel(lines);
        if (s) (this.sel = (((this.sel + s) % n) + n) % n), this.deck.sound.play("tick");
      },
    });

    // the floor: a quiet perspective grid rolling toward you as the ring turns
    const horizon = field.y + Math.max(2, Math.floor(field.h * 0.22));
    const bottom = field.y + field.h;
    const vx = r.x + r.w / 2;
    ui.hline(r.x, horizon, r.w, { fg: mix(c.bg, c.accent, 0.35) }, "─");
    for (let y = horizon + 1; y < bottom; y++) {
      const k = (y - horizon) / Math.max(1, bottom - horizon);
      const col = mix(c.bg, c.accent, 0.05 + k * 0.14);
      for (let i = -6; i <= 6; i++) {
        const x = Math.round(vx + i * k * (r.w / 7));
        if (x >= r.x && x < r.x + r.w) ui.text(x, y, k > 0.45 ? (i < 0 ? "╱" : i > 0 ? "╲" : "│") : "·", { fg: col });
      }
      const z = 1 / Math.max(0.04, k) + this.depth * 1.5;
      if (Math.abs((z % 1.6) - 0.8) < 0.8 * k * 0.4) ui.hline(r.x, y, r.w, { fg: mix(c.bg, c.accent, 0.03 + k * 0.08) }, k > 0.5 ? "─" : "╌");
    }

    const half = n >= 5 ? 2 : n >= 3 ? 1 : 0;
    const step = half === 2 ? 0.62 : 0.9;
    const radius = Math.min(r.w * 0.42, 64);
    const shown: { cart: Cart; i: number; z: number; x: number }[] = [];
    for (let i = 0; i < n; i++) {
      const off = ring(i - this.depth, n);
      if (Math.abs(off) > half + 0.5) continue;
      const ang = off * step;
      shown.push({ cart: carts[i], i, z: Math.cos(ang), x: vx + Math.sin(ang) * radius });
    }
    shown.sort((p, q) => p.z - q.z);
    for (const v of shown) {
      const near = (v.z + 1) / 2;
      const big = near > 0.93, mid = near > 0.7;
      const w = big ? 26 : mid ? 20 : 14;
      const h = big ? 12 : mid ? 9 : 7;
      const y = Math.round(horizon + 1 + near * near * Math.max(0, bottom - horizon - h - 1)) - (big ? 1 : 0);
      const rect = { x: Math.round(v.x - w / 2), y, w, h };
      if (rect.x + rect.w < r.x || rect.x >= r.x + r.w) continue;
      const isSel = v.i === this.sel;
      this.drawFloppy(ui, rect, v.cart, isSel && focused, Math.max(0, 0.85 - near) * 0.9, age - Math.abs(ring(v.i - this.sel, n)) * 60);
      ui.hit(rect, { onClick: () => (this.sel = v.i), onDouble: () => this.run(v.cart), tip: v.cart.description, menu: () => ((this.sel = v.i), this.cartMenu(v.cart)) });
    }

    // the bar: what it is, what you can do
    const cur = carts[this.sel];
    const py = field.y + field.h;
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

  /**
   * A floppy disk in characters: the metal shutter on top (with its window),
   * a write-protect notch, the label with the module's name, icon and what it
   * does, a status light. Far ones are smaller and fade into the dark.
   */
  private drawFloppy(ui: UI, r: Rect, cart: Cart, sel: boolean, fade: number, age: number): void {
    const c = ui.c;
    const dim = (col: number) => mix(col, c.bg, fade);
    const body = sel ? mix(c.accent, c.bg, 0.78) : dim(cart.on ? mix(c.panel, c.accent, 0.08) : c.panel);
    const edge = sel ? c.accent : dim(cart.on ? mix(c.accent, c.border, 0.4) : c.faint);
    ui.fill(r, { bg: body });
    ui.box(r, { fill: false, border: sel ? "heavy" : "single", bg: body, focused: sel });
    // the shutter: a metal strip with its window, slid to one side
    const sw = Math.max(4, Math.floor(r.w * 0.55)), sx = r.x + Math.floor((r.w - sw) / 2);
    if (r.h >= 5) {
      const metal = dim(mix(c.subtle, c.fg, 0.35));
      ui.text(sx, r.y + 1, "▐" + "█".repeat(sw - 2) + "▌", { fg: metal, bg: body });
      const win = Math.max(2, Math.floor(sw * 0.3));
      ui.text(sx + Math.floor(sw * 0.55), r.y + 1, "▒".repeat(win), { fg: dim(c.bg), bg: metal });
      if (r.h >= 9) ui.text(sx, r.y + 2, "▐" + "█".repeat(sw - 2) + "▌", { fg: metal, bg: body });
    }
    // the write-protect notch and the status light
    ui.text(r.x + r.w - 2, r.y + 1, cart.on ? "●" : "○", { fg: cart.on ? (sel ? c.success : dim(c.success)) : dim(c.subtle), bg: body });
    ui.text(r.x + 1, r.y + r.h - 2, "▪", { fg: edge, bg: body });
    // the label: a lighter sticker with the name, the icon, a line of what it does
    const top = r.h >= 9 ? r.y + 4 : r.h >= 5 ? r.y + 3 : r.y + 1;
    const lh = Math.max(1, r.y + r.h - 1 - top);
    const label = { x: r.x + 2, y: top, w: r.w - 4, h: lh };
    const paper = sel ? mix(c.panelAlt, c.accent, 0.12) : dim(c.panelAlt);
    ui.fill(label, { bg: paper });
    const name = r.w >= 16 ? cart.name.toUpperCase() : cart.icon;
    const shownName = age < 600 ? decrypt(name, Math.max(0, age / 600), ui.now) : name;
    ui.text(label.x + 1, label.y, r.w >= 16 ? `${cart.icon} ${shownName}` : shownName, { fg: sel ? c.fg : dim(cart.on ? c.fg : c.muted), bg: paper, attrs: BOLD }, label.w - 2);
    if (lh >= 2) ui.hline(label.x + 1, label.y + 1, label.w - 2, { fg: dim(c.faint), bg: paper }, "┈");
    if (lh >= 3 && fade < 0.45) {
      const room = label.w - 2, lines: string[] = [];
      let line = "";
      for (const w of cart.description.split(" ")) {
        if ((line + " " + w).length > room && line) (lines.push(line), (line = w));
        else line = line ? `${line} ${w}` : w;
      }
      lines.push(line);
      const max = lh - 2;
      lines.slice(0, max).forEach((l, i) => ui.text(label.x + 1, label.y + 2 + i, i === max - 1 && lines.length > max ? `${l.slice(0, room - 1)}…` : l, { fg: sel ? c.muted : dim(c.subtle), bg: paper }, room));
    }
    if (sel) {
      // the drive's read beam gliding over the chosen one
      const span = Math.max(1, r.h - 2), pos = Math.floor((ui.now / 160) % span);
      ui.tint({ x: r.x + 1, y: r.y + 1 + pos, w: r.w - 2, h: 1 }, -1, mix(body, c.accent, 0.22));
    }
    void strWidth;
  }

}

export const modulesSpec: AppSpec = {
  kind: "modules",
  title: "Modules",
  description: "every module on the deck: launch, switch, remove",
  icon: "▦",
  create: (deck) => new ModulesApp(deck),
};
