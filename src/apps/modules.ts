import { mix, type RGB } from "../core/color";
import { BOLD, type Rect } from "../core/grid";
import { t } from "../core/i18n";
import type { Action, KeyInput } from "../core/input";
import { strWidth } from "../core/unicode";
import type { Deck } from "../deck";
import { decrypt } from "../fx/glitch";
import type { MenuEntry, UI } from "../ui/ui";
import { ring, WheelSpin } from "../ui/wheelspin";
import { drawTagBar } from "../ui/tagbar";
import { isTagColor, TAG_NAMES, tagRGB, type TagColor } from "../vault/marks";
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
  /** its colour (MODULES → right-click → colour) */
  tag?: TagColor;
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
  /** only the modules of this colour (modules view <colour>) */
  filter: TagColor | null = null;
  /** a floppy going into the drive (enter): it launches once it's in */
  private inserting: { at: number; id: string } | null = null;
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
    const tags = d.settings.data.moduleTags ?? {};
    for (const m of mods) {
      const tg = tags[m.id];
      if (tg && isTagColor(tg)) m.tag = tg;
    }
    const all = [...doors, ...mods];
    return this.filter ? all.filter((c) => c.tag === this.filter) : all;
  }

  /** how many modules wear each colour (the squares at the top) */
  private tagCounts(): Partial<Record<TagColor, number>> {
    const out: Partial<Record<TagColor, number>> = {};
    for (const v of Object.values(this.deck.settings.data.moduleTags ?? {})) if (isTagColor(v)) out[v] = (out[v] ?? 0) + 1;
    return out;
  }

  private run(c: Cart | undefined): void {
    if (!c || this.inserting) return;
    this.deck.sound.play("select");
    // the floppy slides into the drive first (a blink: 180 ms), then it launches
    this.inserting = { at: performance.now(), id: c.id };
    this.deck.requestFrame();
    setTimeout(() => {
      this.inserting = null;
      this.launch(c);
      this.deck.requestFrame();
    }, 180);
  }

  private launch(c: Cart): void {
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
      items.push(
        { label: t("pin"), cmd: `pin ${c.id}`, hint: "p" },
        {
          label: t("colour"),
          sub: () => [
            ...TAG_NAMES.map((tc) => ({ label: t(tc), color: tagRGB(tc), hint: c.tag === tc ? "✓" : "", cmd: `modules tag ${c.id} ${tc}` })),
            "-" as const,
            { label: t("no colour"), cmd: `modules tag ${c.id} rm`, disabled: !c.tag },
            { label: t("see this colour only"), cmd: `modules view ${c.tag}`, disabled: !c.tag },
          ],
        },
        "-",
        { label: t("remove…"), run: () => void this.onText("x"), danger: true, hint: "x" },
      );
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
    // the colour squares, top right: only one colour's modules (modules view <colour>)
    const tagBar = () => drawTagBar(ui, r.x + r.w - 1, top, this.filter, this.tagCounts(), (tc) => `modules view ${tc ?? "off"}`);
    if (!n) {
      tagBar();
      ui.textCenter(field, field.y + Math.floor(field.h / 2), t("no module of this colour"), { fg: c.muted });
      ui.textCenter(field, field.y + Math.floor(field.h / 2) + 1, t("right-click a floppy → colour · × shows them all"), { fg: c.faint });
      return;
    }
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
    const roomy = bottom - horizon >= 16;
    for (const v of shown) {
      const near = (v.z + 1) / 2;
      const big = near > 0.93, mid = near > 0.7;
      const w = big ? (roomy ? 30 : 26) : mid ? 20 : 14;
      const h = big ? (roomy ? 14 : 12) : mid ? 9 : 7;
      const y = Math.round(horizon + 1 + near * near * Math.max(0, bottom - horizon - h - 1)) - (big ? 1 : 0);
      const rect = { x: Math.round(v.x - w / 2), y, w, h };
      if (rect.x + rect.w < r.x || rect.x >= r.x + r.w) continue;
      const isSel = v.i === this.sel;
      const hue = this.hueOf(ui, v.cart);
      // the one in front glows on the floor under it
      if (isSel && rect.y + rect.h < bottom) ui.hline(rect.x - 1, rect.y + rect.h, rect.w + 2, { fg: mix(c.bg, hue, focused ? 0.45 : 0.25) }, "▀");
      // its thickness: the back of the disk, offset toward the middle of the ring and up
      const side = Math.sign(Math.round(v.x - vx));
      const d = big ? 2 : 1;
      const back = { x: rect.x - side * d * 2, y: rect.y - 1, w: rect.w, h: rect.h };
      const fadeK = Math.max(0, 0.85 - near) * 0.9;
      ui.fill(back, { bg: mix(mix(c.bg, hue, 0.22), c.bg, fadeK) });
      ui.hline(back.x, back.y, back.w, { fg: mix(mix(c.bg, hue, 0.55), c.bg, fadeK), bg: mix(mix(c.bg, hue, 0.22), c.bg, fadeK) }, "▔");
      // enter: the floppy slides down into the drive's slot, then the module opens
      const ins = this.inserting?.id === v.cart.id ? Math.min(1, (now - this.inserting.at) / 180) : 0;
      if (ins) ui.animate(16);
      const dy = Math.round(ins * ins * rect.h * 0.8);
      const drawn = { ...rect, y: rect.y + dy };
      this.drawFloppy(ui, drawn, v.cart, isSel && focused, fadeK, age - Math.abs(ring(v.i - this.sel, n)) * 60, hue);
      if (ins) {
        // what went into the drive is hidden; the slot is a bright line
        const slot = rect.y + rect.h;
        ui.fill({ x: rect.x - 1, y: slot, w: rect.w + 2, h: Math.max(0, Math.min(dy, bottom - slot)) }, { bg: c.bg });
        ui.hline(rect.x - 2, slot, rect.w + 4, { fg: hue }, "▀");
      }
      ui.hit(rect, { onClick: () => (this.sel = v.i), onDouble: () => this.run(v.cart), tip: v.cart.description, menu: () => ((this.sel = v.i), this.cartMenu(v.cart)) });
    }

    tagBar();
    if (this.filter) ui.text(r.x + 2, top, `${t("only")} ■ ${t(this.filter)} · ${n}`, { fg: tagRGB(this.filter) });

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
  /** A floppy's colour: its tag, else one of the theme's accents (each disk keeps its own). */
  private hueOf(ui: UI, cart: Cart): RGB {
    if (cart.tag) return tagRGB(cart.tag);
    const c = ui.c;
    const pal = [c.accent, c.accentAlt, mix(c.accent, c.accentAlt, 0.5), c.success, c.warning];
    let h = 0;
    for (const ch of cart.id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return pal[h % pal.length];
  }

  private drawFloppy(ui: UI, r: Rect, cart: Cart, sel: boolean, fade: number, age: number, hue: RGB): void {
    const c = ui.c;
    const dim = (col: number) => mix(col, c.bg, fade);
    const body = sel ? mix(hue, c.bg, 0.78) : dim(cart.on ? mix(c.panel, hue, 0.12) : c.panel);
    const edge = sel ? hue : dim(cart.on ? mix(hue, c.border, 0.4) : c.faint);
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
    // the label sticker: coloured when the module has a colour, like real disks
    const paper = cart.tag ? (sel ? mix(c.panelAlt, hue, 0.35) : dim(mix(c.panelAlt, hue, 0.25))) : sel ? mix(c.panelAlt, hue, 0.12) : dim(c.panelAlt);
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
      ui.tint({ x: r.x + 1, y: r.y + 1 + pos, w: r.w - 2, h: 1 }, -1, mix(body, hue, 0.22));
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
