import { mix, type RGB } from "../core/color";
import { BOLD, type Rect } from "../core/grid";
import { t } from "../core/i18n";
import type { Action, KeyInput } from "../core/input";
import type { Deck } from "../deck";
import { decrypt } from "../fx/glitch";
import type { MenuEntry, UI } from "../ui/ui";
import { ring, WheelSpin } from "../ui/wheelspin";
import { FilterBar } from "../ui/filterbar";
import { addToWheel } from "../workspace/actionwheel";
import { isTagColor, TAG_NAMES, tagRGB, type TagColor } from "../vault/marks";
import type { App, AppSpec } from "./types";

/** One shard on the ring: a module, or one of the deck's own doors. */
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
 * MODULES — a ring of shards (the chips netrunners slot in), like NEXUS: every module turning
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
  /** search + colours (the same bar as NEXUS): / types, squares tick colours (modules view <colour…>) */
  readonly filter = new FilterBar();
  /** a shard going into its socket (enter): it launches once it's in */
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
    return this.filter.active ? all.filter((c) => this.filter.matches(`${c.name} ${c.id} ${c.description}`, c.tag)) : all;
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
    // the shard slides up into its socket first (a blink: 180 ms), then it launches
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
        ...(c.launch ? [{ label: t("add to the wheel"), run: () => void addToWheel(this.deck, { label: c.name, cmd: c.launch!, icon: c.icon }) }] : []),
        {
          label: t("colour"),
          sub: () => [
            ...TAG_NAMES.map((tc) => ({ label: t(tc), color: tagRGB(tc), hint: c.tag === tc ? "✓" : "", cmd: `modules tag ${c.id} ${tc}` })),
            "-" as const,
            { label: t("no colour"), cmd: `modules tag ${c.id} rm`, disabled: !c.tag },
            { label: t("see this colour"), cmd: `modules view ${c.tag}`, disabled: !c.tag },
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
    if (this.filter.onText(s)) return (this.sel = 0), true;
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
    if (this.filter.onKey(k)) return (this.sel = 0), true;
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

    // ── a ring of shards, like NEXUS: never ends, 5 in front (3 for 3-4 modules) ──
    const panelH = 5;
    // a tall page (shell hidden): the scene keeps its size and sits in the middle, the bar under it
    const sceneH = Math.min(r.h - panelH - 1, 30);
    const top = r.y + Math.max(0, Math.floor((r.h - panelH - 1 - sceneH) / 2));
    const field = { x: r.x, y: top + 1, w: r.w, h: sceneH };
    const n = carts.length;
    // the colour squares, top right: only one colour's modules (modules view <colour>)
    const tagBar = () => this.filter.render(ui, { x: r.x + 2, y: top, w: r.w - 3, h: 1 }, this.tagCounts());
    if (!n) {
      tagBar();
      ui.textCenter(field, field.y + Math.floor(field.h / 2), t("nothing matches"), { fg: c.muted });
      ui.textCenter(field, field.y + Math.floor(field.h / 2) + 1, t("esc clears the search · × shows everything"), { fg: c.faint });
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
      // sizes follow the depth continuously (no jump from one size to the next)
      const big = near > 0.93;
      const k = near * near;
      const w = Math.round(14 + ((roomy ? 30 : 26) - 14) * k);
      const h = Math.round(7 + ((roomy ? 14 : 12) - 7) * k);
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
      // (the body starts under the contacts' row: its back, one row up, lies under them)
      const back = { x: rect.x - side * d * 2, y: rect.y, w: rect.w, h: rect.h - 1 };
      const fadeK = Math.max(0, 0.85 - near) * 0.9;
      ui.fill(back, { bg: mix(mix(c.bg, hue, 0.22), c.bg, fadeK) });
      ui.hline(back.x, back.y, back.w, { fg: mix(mix(c.bg, hue, 0.55), c.bg, fadeK), bg: mix(mix(c.bg, hue, 0.22), c.bg, fadeK) }, "▔");
      // the socket above the chosen one: where it plugs in
      if (isSel) ui.text(rect.x + 2, rect.y - 2, `╺${"━".repeat(Math.max(0, rect.w - 6))}╸`, { fg: mix(c.bg, hue, focused ? 0.6 : 0.3) });
      // enter: the module slides UP into the socket, then it opens
      const ins = this.inserting?.id === v.cart.id ? Math.min(1, (now - this.inserting.at) / 180) : 0;
      if (ins) ui.animate(16);
      const dy = Math.round(ins * ins * rect.h * 0.8);
      this.drawShard(ui, { ...rect, y: rect.y - dy }, v.cart, isSel && focused, fadeK, age - Math.abs(ring(v.i - this.sel, n)) * 60, hue);
      if (ins) {
        // what went into the socket is hidden; the socket glows
        const top = Math.max(field.y, rect.y - dy - 1);
        ui.fill({ x: rect.x - 2, y: top, w: rect.w + 4, h: Math.max(0, rect.y - 2 - top) }, { bg: c.bg });
        ui.hline(rect.x - 2, rect.y - 2, rect.w + 4, { fg: hue, attrs: BOLD }, "▄");
      }
      ui.hit(rect, { onClick: () => (this.sel = v.i), onDouble: () => this.run(v.cart), tip: v.cart.description, menu: () => ((this.sel = v.i), this.cartMenu(v.cart)) });
    }

    tagBar();

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

  /** A module's colour: its tag, else one of the theme's accents (each module keeps its own). */
  private hueOf(ui: UI, cart: Cart): RGB {
    if (cart.tag) return tagRGB(cart.tag);
    const c = ui.c;
    const pal = [c.accent, c.accentAlt, mix(c.accent, c.accentAlt, 0.5), c.success, c.warning];
    let h = 0;
    for (const ch of cart.id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return pal[h % pal.length];
  }

  /**
   * A module as a cyberdeck shard (the chips netrunners slot into their neck):
   * gold contacts on top (it plugs in upward), a chamfered corner, the module's
   * colour as a glowing stripe, its name, a line of what it does, a status
   * light and a serial. Far ones are smaller and fade into the dark.
   */
  private drawShard(ui: UI, r: Rect, cart: Cart, sel: boolean, fade: number, age: number, hue: RGB): void {
    const c = ui.c;
    const dim = (col: number) => mix(col, c.bg, fade);
    const body = sel ? mix(c.panel, hue, 0.2) : dim(cart.on ? mix(c.panel, hue, 0.1) : c.panel);
    const edge = sel ? hue : dim(cart.on ? mix(hue, c.border, 0.35) : c.faint);
    const gold = dim(mix(c.warning, c.fg, 0.25));
    const W = r.w, H = r.h;
    // the contacts: a row of gold pins above the body
    const pins = Math.max(3, Math.floor(W * 0.55));
    const px = r.x + Math.floor((W - pins) / 2);
    ui.text(px, r.y, "╻".repeat(pins), { fg: gold });
    // the body: heavy edges, the bottom-right corner cut off
    const top = r.y + 1, bot = r.y + H - 1;
    ui.fill({ x: r.x, y: top, w: W, h: H - 1 }, { bg: body });
    ui.text(r.x, top, `┏${"━".repeat(W - 2)}┓`, { fg: edge, bg: body });
    for (let y = top + 1; y < bot; y++) {
      ui.text(r.x, y, "┃", { fg: edge, bg: body });
      ui.text(r.x + W - 1, y, y === bot - 1 ? "╱" : "┃", { fg: edge, bg: body });
    }
    ui.text(r.x, bot, `┗${"━".repeat(W - 3)}╱`, { fg: edge, bg: body });
    ui.text(r.x + W - 1, bot, " ", { bg: c.bg });
    // a notch on the left, like a key
    if (H >= 7) ui.text(r.x, top + 2, "╢", { fg: edge, bg: body });
    const ix = r.x + 2, iw = W - 4;
    let y = top + 1;
    // the status light and the name
    ui.text(r.x + W - 3, y, cart.on ? "●" : "○", { fg: cart.on ? (sel ? c.success : dim(c.success)) : dim(c.subtle), bg: body });
    const name = W >= 16 ? cart.name.toUpperCase() : cart.icon;
    const shown = age < 600 ? decrypt(name, Math.max(0, age / 600), ui.now) : name;
    ui.text(ix, y, W >= 16 ? `${cart.icon} ${shown}` : shown, { fg: sel ? c.fg : dim(cart.on ? c.fg : c.muted), bg: body, attrs: BOLD }, iw - 2);
    y++;
    // the stripe: the module's colour, a light running along it on the chosen one
    if (y < bot) {
      const run = sel ? Math.floor((ui.now / 70) % (iw + 6)) - 3 : -99;
      for (let i = 0; i < iw; i++) ui.text(ix + i, y, "▬", { fg: Math.abs(i - run) <= 1 ? mix(hue, c.fg, 0.6) : dim(sel ? hue : mix(hue, c.bg, 0.35)), bg: body });
      y++;
    }
    // what it does (wrapped), when there's room and it's near enough to read
    if (fade < 0.45) {
      const lines: string[] = [];
      let line = "";
      for (const w of cart.description.split(" ")) {
        if ((line + " " + w).length > iw && line) (lines.push(line), (line = w));
        else line = line ? `${line} ${w}` : w;
      }
      lines.push(line);
      const room = Math.max(0, bot - y - (H >= 9 ? 1 : 0));
      lines.slice(0, room).forEach((l, i) => ui.text(ix, y + i, i === room - 1 && lines.length > room ? `${l.slice(0, iw - 1)}…` : l, { fg: sel ? c.muted : dim(c.subtle), bg: body }, iw));
    }
    // the serial, bottom left
    if (H >= 9) ui.text(ix, bot - 1, `${cart.module ? "MOD" : "SYS"}·${cart.id.slice(0, 6).toUpperCase()}`, { fg: dim(mix(c.faint, hue, 0.3)), bg: body }, iw - 2);
    if (sel) ui.animate(70);
  }

}

export const modulesSpec: AppSpec = {
  kind: "modules",
  title: "Modules",
  description: "every module on the deck: launch, switch, remove",
  icon: "▦",
  create: (deck) => new ModulesApp(deck),
};
