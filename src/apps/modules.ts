import { mix, type RGB } from "../core/color";
import { BOLD, type Rect } from "../core/grid";
import { t, tLoose } from "../core/i18n";
import type { Action, KeyInput } from "../core/input";
import type { Deck } from "../deck";
import type { MenuEntry, UI } from "../ui/ui";
import { ring, WheelSpin } from "../ui/wheelspin";
import { FilterBar } from "../ui/filterbar";
import { pageBar } from "../ui/pagebar";
import { perspectiveFloor } from "../ui/floor";
import { drawBackground } from "../fx/backgrounds";
import { addToMenu } from "../workspace/quickmenu";
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
 * MODULES — NEXUS's scene (the same ring, sky, floor and motion) with modules on
 * it: each one a cyberdeck shard in its colour, with its state; they power up one
 * after the other when the page opens. The panel below says what the one in front
 * is and what you can do with it.
 *
 *   ←↑↓→ choose · enter launch · space on/off · del remove · type to search
 * Everything here is also a command: launch, plugin enable/disable, store remove.
 */
export class ModulesApp implements App {
  readonly kind = "modules";
  readonly key = "modules";
  private sel = 0;
  /** where the ring is (`spin.pos`), eased toward sel; the wheel / trackpad steps */
  private spin = new WheelSpin();
  private lastT = 0;
  /** how far the floor has rolled (it follows the ring) */
  private travel = 0;
  /** when the page was first drawn (the modules power up one after the other) */
  private shownAt = 0;
  /** search + colours (the same bar as NEXUS): / types, squares tick colours (modules view <colour…>) */
  /** typing a letter searches at once (no letter shortcuts here: space, del, enter and the menu) */
  readonly filter = new FilterBar({ typeToSearch: true });
  /** a shard going into its socket (enter): it launches once it's in */
  private inserting: { at: number; id: string } | null = null;
  constructor(private readonly deck: Deck) {
    this.spin.pos = 3; // the ring swings in when the page opens, like NEXUS
  }

  title(): string {
    return "modules";
  }
  status(): string {
    return t("←↑↓→ choose · enter launch · space on/off · del remove · type to search");
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
    if (c.id === "note") return void this.deck.newNote();
    if (c.module && !c.on) return void this.deck.act(`plugin enable ${c.id} --window`);
    if (c.launch) return void this.deck.act(c.launch);
    if (c.widgetsOnly) this.deck.notify(t("{name} adds widgets: on HOME, e then a", { name: c.name }));
  }

  /** Right-click on a card. */
  private cartMenu(c: Cart): MenuEntry[] {
    const items: MenuEntry[] = [];
    if (c.module && !c.on) items.push({ label: t("Turn on"), run: () => this.run(c), hint: "enter" });
    else if (c.launch || !c.module) items.push({ label: t("Open"), run: () => this.run(c), hint: "enter" });
    if (c.module) {
      if (c.on) items.push({ label: t("Turn off"), cmd: `plugin disable ${c.id} --window`, hint: "space" });
      items.push(
        { label: t("Pin"), tip: t("at the top of the tree and in the pinned widget"), cmd: `pin ${c.id}` },
        ...(c.launch ? [{ label: t("Add to THE MENU…"), tip: t("give it a key on THE MENU (⌘K)"), run: () => addToMenu(this.deck, c.name, c.launch!) }] : []),
        {
          label: t("Colour"), tip: t("a colour tag, like Ableton"),
          sub: () => [
            ...TAG_NAMES.map((tc) => ({ label: t(tc), color: tagRGB(tc), hint: c.tag === tc ? "✓" : "", cmd: `modules tag ${c.id} ${tc}` })),
            "-" as const,
            { label: t("No colour"), cmd: `modules tag ${c.id} rm`, disabled: !c.tag },
            { label: t("Show only this colour"), cmd: `modules view ${c.tag}`, disabled: !c.tag },
          ],
        },
        "-",
        { label: t("Uninstall…"), tip: t("remove the module (the STORE can put it back)"), run: () => this.remove(c), danger: true, hint: "del" },
      );
    }
    items.push("-", { label: t("store"), cmd: "store" });
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
    if (s === " " && c?.module) return void this.deck.act(`plugin ${c.on ? "disable" : "enable"} ${c.id} --window`), true;
    return false;
  }
  private remove(c: ReturnType<ModulesApp["carts"]>[number] | undefined): void {
    if (!c?.module) return;
    void this.deck.confirm(t("Remove {name}?", { name: c.name }), c.builtin ? t("It ships with the deck: the STORE can reinstall it any time.") : t("Its files go to .trash in your vault.")).then((ok) => {
      if (ok) void this.deck.act(`store remove ${c.id} --window`);
    });
  }
  onKey(k: KeyInput): boolean {
    if (this.filter.onKey(k)) return (this.sel = 0), true;
    if (k.combo === "delete" || k.combo === "backspace") return this.remove(this.carts()[this.sel]), true;
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

  /**
   * The scene is NEXUS's — the same ring, sky, floor and feel (WheelSpin, the shared
   * perspective floor) — with modules instead of cubes. One piece of code for the
   * motion, so both glide the same.
   */
  render(ui: UI, r: Rect, focused: boolean): void {
    const c = ui.c;
    const now = performance.now();
    const dt = this.lastT ? Math.min(0.1, (now - this.lastT) / 1000) : 0;
    this.lastT = now;
    if (!this.shownAt) this.shownAt = ui.now;
    const carts = this.carts();
    this.sel = Math.min(this.sel, Math.max(0, carts.length - 1));
    const n = Math.max(1, carts.length);
    const before = this.spin.pos;
    const left = this.spin.ease(this.sel, n, dt);
    this.travel += (this.spin.pos - before) * 0.8 + dt * 0.15;
    const booting = ui.now - this.shownAt < 1100;
    // at rest only the floor drifts and a light runs along the front stripe: 8 frames a
    // second (16 kept ~700 cells repainting for nothing you'd see)
    ui.animate(left > 0.001 || booting || this.inserting ? 16 : 125);

    ui.fill(r, { bg: c.bg });
    const sceneH = Math.min(r.h, 36);
    const sy = r.y + Math.floor((r.h - sceneH) / 2);
    const horizon = sy + Math.max(3, Math.floor(sceneH * 0.34));
    const previewH = sceneH >= 24 ? 6 : sceneH >= 16 ? 4 : 0;
    const floorBottom = sy + sceneH - previewH - 1;

    // the sky (the same glyph rain as NEXUS) and the floor
    const sky = { x: r.x, y: r.y + 1, w: r.w, h: horizon - r.y - 1 };
    const th = ui.theme;
    drawBackground(ui, sky, { ...th, background: { ...th.background, effect: "rain", density: 0.3, speed: 1, color: mix(c.bg, c.accent, 0.2), color2: mix(c.bg, c.accentAlt, 0.5), glyphs: th.anim.noise } }, 0.7);
    const cx = r.x + r.w / 2;
    perspectiveFloor(ui, { x: r.x, y: horizon, w: r.w, h: floorBottom - horizon + 1 }, cx, this.travel);

    // the top: the same bar as NEXUS (chip, count, tools, search + colours)
    const all = this.deck.plugins.list().length;
    pageBar(ui, r, {
      crumbs: [{ label: "▦ modules" }],
      info: this.filter.active ? `${carts.length} / ${all + 3}` : `${carts.length}`,
      tools: [
        { label: "store", run: () => this.deck.act("store"), tip: "more modules · s" },
        { label: ":", run: () => this.deck.workspace.openMenu(this.menu(), r.x + r.w - 4, r.y + 1), tip: "every action · right-click" },
      ],
      filter: this.filter,
      counts: this.tagCounts(),
    });
    if (!carts.length) {
      ui.textCenter(r, horizon + 2, t("nothing matches"), { fg: c.muted, attrs: BOLD });
      ui.textCenter(r, horizon + 3, t("esc clears the search · × shows everything"), { fg: c.subtle });
      return;
    }

    // the ring, back to front — NEXUS's layout exactly
    const half = carts.length >= 5 ? 2 : carts.length >= 3 ? 1 : 0;
    const step = half === 2 ? 0.62 : 0.9;
    const radius = Math.min(r.w * 0.42, 60);
    const visible: { cart: Cart; i: number; z: number; x: number }[] = [];
    for (let i = 0; i < carts.length; i++) {
      const off = ring(i - this.spin.pos, carts.length);
      if (Math.abs(off) > half + 0.5) continue;
      const a = off * step;
      visible.push({ cart: carts[i], i, z: Math.cos(a), x: cx + Math.sin(a) * radius });
    }
    visible.sort((a, b) => a.z - b.z);
    ui.hit(r, { onWheel: (lines) => { const st = this.spin.wheel(lines); if (st) this.turn(st); } });
    // the shards stand in front of each other on purpose (ui.art: debug layout doesn't count it)
    ui.art(() => {
      for (const v of visible) this.drawModule(ui, r, v, horizon, floorBottom, focused);
    });

    if (previewH) this.drawData(ui, { x: r.x, y: floorBottom + 1, w: r.w, h: r.y + r.h - floorBottom - 1 }, carts[this.sel]);
  }

  /** the wheel / trackpad: steps of the ring (WheelSpin decides how many) */
  private turn(steps: number): void {
    const n = this.carts().length;
    if (!n) return;
    this.sel = (((this.sel + steps) % n) + n) % n;
    this.deck.sound.play("tick");
    this.deck.requestFrame();
  }

  private hueOf(ui: UI, cart: Cart): RGB {
    if (cart.tag) return tagRGB(cart.tag);
    const c = ui.c;
    const pal = [c.accent, c.accentAlt, mix(c.accent, c.accentAlt, 0.5), c.success, c.warning];
    let h = 0;
    for (const ch of cart.id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return pal[h % pal.length];
  }

  /**
   * One module, in NEXUS's place and size, drawn as a cyberdeck shard: gold pins on
   * top (it plugs in upward), heavy edges in its colour, the bottom-right corner cut,
   * a status light, a stripe in its colour, then what it is. When the page opens they
   * power up one after the other: the light blinks on, the name decodes.
   */
  private drawModule(ui: UI, r: Rect, v: { cart: Cart; i: number; z: number; x: number }, horizon: number, floor: number, focused: boolean): void {
    const c = ui.c;
    const cart = v.cart;
    const front = v.i === this.sel;
    // in 12 steps: depth tints repeat from frame to frame (a new tint = a glyph drawn again, core/atlas.ts)
    const near = Math.round(((v.z + 1) / 2) * 12) / 12;
    const k = near * near;
    // NEXUS's sizes, kept to the page's width (a narrow page: narrower shards, less overlap)
    const frontW = Math.max(16, Math.min(26, Math.round(r.w * 0.3)));
    const backW = Math.max(10, Math.round(frontW * 0.5));
    const w = Math.round(backW + (frontW - backW) * k);
    const h = Math.round(4 + 4 * k);
    let y = Math.round(horizon + 2 + k * (floor - horizon - h - 2));
    const x = Math.round(v.x - w / 2);
    if (x + w < r.x || x >= r.x + r.w) return;
    const hue = this.hueOf(ui, cart);
    const fade = (col: RGB) => mix(c.bg, col, 0.25 + near * 0.75);
    // enter: it slides up into its socket, then launches
    const ins = this.inserting?.id === cart.id ? Math.min(1, (performance.now() - this.inserting.at) / 180) : 0;
    y -= Math.round(ins * ins * h * 0.8);
    // power-up when the page opens: each one a little after the one before
    const boot = Math.min(1, Math.max(0, (ui.now - this.shownAt - (ring(v.i - this.sel, this.carts().length) + 3) * 70) / 450));
    const lit = boot >= 1 || Math.floor(ui.now / 60) % 2 === 0;

    const body = front ? mix(c.panel, hue, 0.16) : mix(c.bg, mix(c.panel, hue, cart.on ? 0.08 : 0), near);
    const edge = front ? (focused ? hue : mix(hue, c.border, 0.3)) : fade(cart.on ? mix(hue, c.border, 0.35) : c.border);
    const gold = fade(mix(c.warning, c.fg, 0.25));
    // the pins, the socket line above the one in front
    const pins = Math.max(3, Math.floor(w * 0.55));
    if (y - 1 > horizon) ui.text(x + Math.floor((w - pins) / 2), y - 1, "╻".repeat(pins), { fg: gold });
    if (front && y - 2 > horizon) ui.text(x + 2, y - 2, `╺${"━".repeat(Math.max(0, w - 6))}╸`, { fg: mix(c.bg, hue, focused ? 0.6 : 0.3) });
    // the body: heavy edges, the corner cut
    const bot = y + h - 1;
    ui.fill({ x, y, w, h }, { bg: body });
    ui.text(x, y, `┏${"━".repeat(w - 2)}┓`, { fg: edge, bg: body });
    for (let yy = y + 1; yy < bot; yy++) {
      ui.text(x, yy, "┃", { fg: edge, bg: body });
      ui.text(x + w - 1, yy, yy === bot - 1 ? "╱" : "┃", { fg: edge, bg: body });
    }
    ui.text(x, bot, `┗${"━".repeat(w - 3)}╱`, { fg: edge, bg: body });
    ui.text(x + w - 1, bot, " ", { bg: c.bg });
    const ix = x + 2, iw = w - 4;
    let ty = y + 1;
    // the light and the name (decoding while it powers up)
    const led = cart.on ? (lit ? c.success : c.faint) : c.subtle;
    ui.text(x + w - 3, ty, cart.on ? "●" : "○", { fg: front ? led : fade(led), bg: body });
    const name = ui.reveal(cart.name.toLowerCase(), boot);
    ui.text(ix, ty, `${cart.icon} ${name}`, { fg: front ? c.fg : fade(cart.on ? c.fg : c.muted), bg: body, attrs: BOLD }, iw - 2);
    ty++;
    // the stripe: its colour, a light running along it on the one in front
    if (ty < bot) {
      const run = front ? Math.floor((ui.now / 125) % (iw + 6)) - 3 : -99;
      for (let i = 0; i < iw; i++) ui.text(ix + i, ty, "▬", { fg: Math.abs(i - run) <= 1 ? mix(hue, c.fg, 0.6) : fade(front ? hue : mix(hue, c.bg, 0.35)), bg: body });
      if (front) ui.animate(125);
      ty++;
    }
    // a few facts, as room allows: what it is, its state
    if (ty < bot) {
      const kind = t(cart.module ? (cart.builtin ? "MOD·CORE" : "MOD·STORE") : "SYS");
      ui.text(ix, ty, `${kind} · ${cart.module ? (cart.on ? t("on") : t("off")) : t("ready")}`, { fg: fade(cart.on ? c.success : c.subtle), bg: body }, iw);
      ty++;
    }
    if (ty < bot && h >= 7) {
      ui.text(ix, ty, tLoose(cart.description), { fg: fade(c.muted), bg: body }, iw);
      ty++;
    }
    if (ty < bot && front && h >= 8) ui.text(ix, bot - 1, t(cart.module && !cart.on ? "enter ▸ switch on" : "enter ▸ launch"), { fg: c.accent, bg: body }, iw - 1);
    // its shadow on the floor
    if (bot + 1 <= floor) ui.text(x + 1, bot + 1, "▔".repeat(Math.max(0, w - 2)), { fg: mix(c.bg, edge, 0.35) });
    ui.hit({ x, y, w, h }, front ? { onClick: () => this.run(cart), onDouble: () => this.run(cart), tip: tLoose(cart.description), menu: () => this.cartMenu(cart) } : { onClick: () => (this.sel = v.i), tip: tLoose(cart.description), menu: () => ((this.sel = v.i), this.cartMenu(cart)) });
  }

  /** Under the ring: the one in front — what it is and what you can do (like NEXUS's data panel). */
  private drawData(ui: UI, r: Rect, cur: Cart | undefined): void {
    const c = ui.c;
    ui.fill(r, { bg: c.panelAlt });
    ui.hline(r.x, r.y, r.w, { fg: mix(c.accent, c.bg, 0.4) }, "━");
    if (!cur) return;
    ui.text(r.x + 2, r.y + 1, `${cur.icon}  ${cur.name.toLowerCase()}`, { fg: c.accent, bg: c.panelAlt, attrs: BOLD });
    if (cur.module) ui.textRight(r.x + r.w - 2, r.y + 1, `${cur.builtin ? t("built-in") : t("from the store")} · ${cur.on ? t("on") : t("off")}`, { fg: cur.on ? c.success : c.subtle, bg: c.panelAlt });
    if (r.h > 2) ui.text(r.x + 2, r.y + 2, tLoose(cur.description), { fg: c.fg, bg: c.panelAlt }, r.w - 4);
    if (r.h <= 3) return;
    let bx = r.x + 2;
    const by = r.y + 3;
    const btn = (label: string, run: () => void, tip: string, accent?: number) => (bx += ui.button(bx, by, label, run, { tip, accent }) + 2);
    if (cur.module && !cur.on) btn(t("switch on  ⏎"), () => this.run(cur), "enter · plugin enable");
    else if (cur.launch || cur.id === "note") btn(t("launch  ⏎"), () => this.run(cur), cur.launch ?? "enter");
    else if (cur.widgetsOnly) btn(t("its widgets: HOME → e → a"), () => this.run(cur), "e then a on HOME");
    if (cur.module) {
      if (cur.on) btn(t("switch off  space"), () => void this.deck.act(`plugin disable ${cur.id} --window`), "space · plugin disable");
      btn(t("remove  del"), () => this.remove(cur), "del · store remove", c.error);
    }
    btn(t("store"), () => void this.deck.act("store"), "store");
  }
}

export const modulesSpec: AppSpec = {
  kind: "modules",
  title: "Modules",
  description: "every module on the deck: launch, switch, remove",
  icon: "▦",
  create: (deck) => new ModulesApp(deck),
};
