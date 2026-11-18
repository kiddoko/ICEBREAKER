import { mix, type RGB } from "../core/color";
import { BOLD, type Rect } from "../core/grid";
import type { Action, KeyInput } from "../core/input";
import type { Deck } from "../deck";
import { drawBackground } from "../fx/backgrounds";
import { dots } from "../ui/dots";
import { decrypt } from "../fx/glitch";
import type { VaultEntry } from "../platform/types";
import { q, type UI } from "../ui/ui";
import { basename, dirname } from "../vault/paths";
import { ago } from "../widgets/builtin";
import type { App, AppSpec } from "./types";

/**
 * NEXUS — the vault as a place. The current folder's files ride a carousel in
 * perspective above a synthwave floor grid, glyph rain falls in the sky, and
 * the one in front shows its data below.
 *
 *   ←→ / wheel   turn            enter / ↑   open (folder: dive in · file: edit)
 *   ⌫ / ↓        back up         type        jump to a name
 *   /            search the vault             +   new note here
 *   F2           rename          delete      to the trash
 *   :  (pad menu) every action: new folder, sort, copy the path…
 * Every action is a shell command (touch, mkdir, mv, rm), echoed in the shell.
 */
export class ExplorerApp implements App {
  readonly kind = "explorer";
  readonly key = "explorer";
  private dir: string;
  private sel = 0;
  /** Animated carousel position (eases toward `sel`). */
  private pos = 0;
  private lastT = 0;
  /** Floor scroll, pushed by turning and diving. */
  private travel = 0;
  private warpUntil = 0;
  private shownAt = 0;
  private typed = "";
  private typedAt = 0;
  private preview = new Map<string, string>();
  private sortBy: "name" | "modified" | "size" = "name";

  constructor(
    private readonly deck: Deck,
    start = "",
  ) {
    this.dir = start;
  }

  title(): string {
    return "nexus";
  }

  status(): string {
    return "←→ turn · enter open · ⌫ up · / search · + note · F2 rename · del trash · : actions";
  }

  private items(): VaultEntry[] {
    return this.deck.vault.entries
      .filter((e) => dirname(e.path) === this.dir)
      .sort(
        (a, b) =>
          Number(b.isDir) - Number(a.isDir) ||
          (this.sortBy === "modified" ? b.modified - a.modified : this.sortBy === "size" ? b.size - a.size : 0) ||
          a.name.localeCompare(b.name),
      );
  }

  // ── actions (each one a shell command) ──
  private get current(): VaultEntry | undefined {
    return this.items()[this.sel];
  }
  private here(name: string): string {
    return this.dir ? `${this.dir}/${name}` : name;
  }
  private async newNote(): Promise<void> {
    const name = await this.deck.prompt("New note here", { placeholder: "night city ideas" });
    if (!name?.trim()) return;
    const path = this.here(name.trim().endsWith(".md") ? name.trim() : `${name.trim()}.md`);
    await this.deck.act(`touch ${q(path)}`);
    await this.deck.act(`open ${q(path)}`);
  }
  private async newFolder(): Promise<void> {
    const name = await this.deck.prompt("New folder here", { placeholder: "projects" });
    if (!name?.trim()) return;
    await this.deck.act(`mkdir ${q(this.here(name.trim()))}`);
    this.go(this.dir, this.here(name.trim()));
  }
  private async rename(): Promise<void> {
    const e = this.current;
    if (!e) return;
    const name = await this.deck.prompt(`Rename ${e.name}`, { initial: e.name });
    if (!name?.trim() || name.trim() === e.name) return;
    const to = this.here(name.trim());
    await this.deck.act(`mv ${q(e.path)} ${q(to)}`);
    this.go(this.dir, to);
  }
  private async trash(): Promise<void> {
    const e = this.current;
    if (!e) return;
    if (!(await this.deck.confirm(`Move ${e.name} to the trash?`, "It goes to .trash in your vault — nothing is deleted for good."))) return;
    await this.deck.act(`rm ${e.isDir ? "-r " : ""}${q(e.path)}`);
  }
  private async search(): Promise<void> {
    const all = this.deck.vault.entries.filter((e) => !e.path.startsWith("."));
    const i = await this.deck.choose("Find in the vault", all.map((e) => ({ label: `${e.isDir ? "▣" : "≡"} ${e.name}`, hint: dirname(e.path) || "/" })));
    if (i === null) return;
    const e = all[i];
    this.go(dirname(e.path), e.path);
  }
  private cycleSort(): void {
    const order = ["name", "modified", "size"] as const;
    const cur = this.current?.path;
    this.sortBy = order[(order.indexOf(this.sortBy) + 1) % order.length];
    const items = this.items();
    this.sel = Math.max(0, items.findIndex((e) => e.path === cur));
    this.pos = this.sel;
    this.deck.notify(`nexus: sorted by ${this.sortBy}`);
  }
  private async actionMenu(): Promise<void> {
    const e = this.current;
    const actions: [string, string, () => unknown][] = [
      ["New note here", "+", () => this.newNote()],
      ["New folder here", "", () => this.newFolder()],
      ["Search the vault", "/", () => this.search()],
      [`Sort by… (now ${this.sortBy})`, "", () => this.cycleSort()],
      ...(e
        ? ([
            [`Open ${e.name}`, "enter", () => this.open(e)],
            [`Rename ${e.name}`, "F2", () => this.rename()],
            [`Move ${e.name} to the trash`, "delete", () => this.trash()],
            ["Copy its path", "", () => navigator.clipboard?.writeText(e.path).then(() => this.deck.notify(`copied ${e.path}`))],
          ] as [string, string, () => unknown][])
        : []),
    ];
    const i = await this.deck.choose("NEXUS", actions.map(([label, hint]) => ({ label, hint })));
    if (i !== null) void actions[i][2]();
  }

  private go(dir: string, select?: string): void {
    this.dir = dir;
    const items = this.items();
    this.sel = Math.max(0, select ? items.findIndex((e) => e.path === select) : 0);
    this.pos = this.sel + (select ? 0 : 3); // swing in
    this.warpUntil = performance.now() + 450;
    this.shownAt = 0;
    this.deck.sound.play("open");
  }

  private open(e: VaultEntry | undefined): void {
    if (!e) return;
    if (e.isDir) this.go(e.path);
    else void this.deck.act(`open ${q(e.path)}`);
  }

  private up(): boolean {
    if (!this.dir) return false;
    this.go(dirname(this.dir), this.dir);
    return true;
  }

  private turn(d: number): void {
    const n = this.items().length;
    if (!n) return;
    this.sel = (this.sel + d + n) % n;
    this.deck.sound.play("move");
  }

  onText(t: string): boolean {
    if (t === "/") return void this.search(), true;
    if (t === "+") return void this.newNote(), true;
    if (t === ":") return void this.actionMenu(), true;
    if (!/^[\p{L}\p{N}._ -]$/u.test(t)) return false;
    if (t === "h" && !this.typed) return false; // h → HOME, unless typing a name
    const now = performance.now();
    this.typed = now - this.typedAt > 900 ? t : this.typed + t;
    this.typedAt = now;
    const i = this.items().findIndex((e) => e.name.toLowerCase().startsWith(this.typed.toLowerCase()));
    if (i >= 0) this.sel = i;
    return true;
  }

  onKey(k: KeyInput): boolean {
    if (k.combo === "backspace") return this.up();
    if (k.combo === "f2") return void this.rename(), true;
    if (k.combo === "delete") return void this.trash(), true;
    return false;
  }

  onAction(a: Action): boolean {
    switch (a) {
      case "left": this.turn(-1); return true;
      case "right": this.turn(1); return true;
      case "confirm": case "up": this.open(this.items()[this.sel]); return true;
      case "down": return this.up();
      case "back": return this.up(); // at the root, esc closes the tab as usual
      case "menu": void this.actionMenu(); return true;
      default: return false;
    }
  }

  render(ui: UI, r: Rect, focused: boolean): void {
    const c = ui.c;
    const now = performance.now();
    const dt = this.lastT ? Math.min(0.1, (now - this.lastT) / 1000) : 0;
    this.lastT = now;
    if (!this.shownAt) this.shownAt = ui.now;
    const items = this.items();
    this.sel = Math.min(this.sel, Math.max(0, items.length - 1));
    // ease the carousel; the floor moves with it
    const before = this.pos;
    // a disc that never ends: pos keeps turning the short way round (past the last
    // comes the first, still forward), it's never reset
    const nItems = Math.max(1, items.length);
    const gap = ringDelta(this.sel - this.pos, nItems);
    this.pos += gap * Math.min(1, dt * 9);
    if (Math.abs(ringDelta(this.sel - this.pos, nItems)) < 0.001) this.pos += ringDelta(this.sel - this.pos, nItems);
    const warp = Math.max(0, (this.warpUntil - now) / 450);
    this.travel += (this.pos - before) * 0.8 + dt * (0.15 + warp * 6);
    ui.animate(Math.abs(ringDelta(this.sel - this.pos, Math.max(1, items.length))) > 0.001 || warp > 0 ? 16 : 60);

    ui.fill(r, { bg: c.bg });
    // a tall page (shell hidden): the scene keeps its size and sits in the middle
    const sceneH = Math.min(r.h, 36);
    const sy = r.y + Math.floor((r.h - sceneH) / 2);
    const horizon = sy + Math.max(3, Math.floor(sceneH * 0.34));
    const previewH = sceneH >= 26 ? 8 : sceneH >= 18 ? 5 : 0;
    const floorBottom = sy + sceneH - previewH - 1;

    // ── sky: glyph rain, fading toward the horizon ──
    const sky = { x: r.x, y: r.y + 1, w: r.w, h: horizon - r.y - 1 };
    const t = ui.theme;
    drawBackground(ui, sky, { ...t, background: { ...t.background, effect: "rain", density: 0.5 + warp, speed: 1 + warp * 4, color: mix(c.bg, c.accent, 0.45), color2: c.accentAlt, glyphs: t.anim.noise } }, 1);

    // ── floor: a fine perspective grid (braille dots: continuous thin lines) ──
    const cx = r.x + r.w / 2;
    const depthRows = Math.max(1, floorBottom - horizon);
    ui.hline(r.x, horizon, r.w, { fg: mix(c.accent, c.bg, 0.2) }, "─");
    const floorR = { x: r.x, y: horizon + 1, w: r.w, h: depthRows };
    const A = ui.cellAspect;
    const vx = (cx - r.x) * A; // vanishing point x, in cell-height units
    const spacing = Math.max(2.5, (r.w * A) / 16); // rail spacing at the bottom edge
    const travel = this.travel;
    const near = mix(c.bg, c.accent, 0.75), far = mix(c.bg, c.accent, 0.3);
    dots(ui, floorR, [far, near], (X, Y) => {
      const k = (Y + 0.5) / (depthRows + 0.5); // 0 at the horizon → 1 at the bottom
      if (k <= 0.02) return 0;
      // rails converge on the vanishing point
      const off = (X - vx) / (spacing * k);
      const rail = Math.abs(off - Math.round(off)) * spacing * k < 0.07 + k * 0.05;
      // cross lines: evenly spaced in depth, scrolling toward you
      const z = 1 / k + travel * 3;
      const cross = k > 0.08 && Math.abs(z - Math.round(z)) < Math.min(0.12, 0.022 / k);
      if (!rail && !cross) return 0;
      return k > 0.45 ? 2 : 1;
    });

    // ── breadcrumb ──
    const parts = this.dir ? this.dir.split("/") : [];
    let bx = ui.text(r.x + 1, r.y, " ◈ vault ", { fg: c.panel, bg: c.accent, attrs: BOLD });
    ui.hit({ x: r.x + 1, y: r.y, w: 9, h: 1 }, { onClick: () => this.go(""), tip: "back to the root" });
    parts.forEach((p, i) => {
      const path = parts.slice(0, i + 1).join("/");
      bx = ui.text(bx, r.y, " / ", { fg: c.subtle });
      const x0 = bx;
      bx = ui.text(bx, r.y, p, { fg: i === parts.length - 1 ? c.accent : c.muted, attrs: i === parts.length - 1 ? BOLD : 0 });
      ui.hit({ x: x0, y: r.y, w: bx - x0, h: 1 }, { onClick: () => this.go(path) });
    });
    // the toolbar: every action, one click away
    let tx = r.x + r.w - 1;
    const tools: [string, () => unknown, string][] = [
      [" : ", () => this.actionMenu(), "every action · : · pad menu"],
      [` ⇅ ${this.sortBy} `, () => this.cycleSort(), "sort: name · modified · size"],
      [" ✕ ", () => this.trash(), "to the trash · delete"],
      [" ✎ ", () => this.rename(), "rename · F2"],
      [" ⌕ ", () => this.search(), "search the vault · /"],
      [" + folder ", () => this.newFolder(), "new folder here"],
      [" + note ", () => this.newNote(), "new note here · +"],
    ];
    for (const [label, run, tip] of tools) {
      const w = label.length;
      tx -= w;
      const rect = { x: tx, y: r.y, w, h: 1 };
      const hot = ui.hovered(rect);
      ui.text(tx, r.y, label, hot ? { fg: c.panel, bg: c.accent, attrs: BOLD } : { fg: c.fg, bg: c.highlight });
      ui.hit(rect, { onClick: () => void run(), tip });
      tx -= 1;
    }
    if (tx - 12 > bx) ui.textRight(tx - 1, r.y, `${items.length} node${items.length === 1 ? "" : "s"} `, { fg: c.subtle });

    if (!items.length) {
      ui.textCenter(r, horizon + 2, "empty sector", { fg: c.muted, attrs: BOLD });
      ui.textCenter(r, horizon + 3, "⌫ to back up", { fg: c.faint });
      return;
    }

    // ── the carousel, drawn back to front ──
    // the front of the ring: 5 lockers once there are 5 things or more, 3 for 3-4, 1 below
    const half = items.length >= 5 ? 2 : items.length >= 3 ? 1 : 0;
    const step = half === 2 ? 0.62 : 0.9;
    const radius = Math.min(r.w * 0.42, 60);
    const visible: { e: VaultEntry; i: number; z: number; x: number }[] = [];
    for (let i = 0; i < items.length; i++) {
      const off = ringDelta(i - this.pos, items.length);
      if (Math.abs(off) > half + 0.5) continue; // (+0.5: the next one slides in while the ring turns)
      const a = off * step;
      visible.push({ e: items[i], i, z: Math.cos(a), x: cx + Math.sin(a) * radius });
    }
    visible.sort((a, b) => a.z - b.z);
    ui.hit({ x: r.x, y: horizon, w: r.w, h: floorBottom - horizon + 1 }, { onWheel: (dir) => this.turn(dir > 0 ? 1 : -1) });
    for (const v of visible) this.drawNode(ui, r, v, horizon, floorBottom, focused);

    // ── data panel: the one in front ──
    if (previewH) this.drawData(ui, { x: r.x + 1, y: floorBottom + 1, w: r.w - 2, h: previewH }, items[this.sel]);
  }

  private drawNode(ui: UI, r: Rect, v: { e: VaultEntry; i: number; z: number; x: number }, horizon: number, floor: number, focused: boolean): void {
    const c = ui.c;
    const front = v.i === this.sel;
    const near = (v.z + 1) / 2; // 0 back → 1 front
    const big = near > 0.93, mid = near > 0.7;
    const w = big ? 26 : mid ? 18 : 12;
    const h = big ? 7 : mid ? 5 : 3;
    const baseY = Math.round(horizon + 1 + near * near * (floor - horizon - h - 1));
    const x = Math.round(v.x - w / 2);
    const fade = (col: RGB) => mix(c.bg, col, 0.25 + near * 0.75);
    const edge = front ? (focused ? c.accent : c.accentAlt) : fade(c.border);
    if (x + w < r.x || x >= r.x + r.w) return;

    // the cube: a back edge offset up-right, then the front face over it
    const d = big ? 2 : 1;
    const back = { x: x + d * 2, y: baseY - d, w, h };
    ui.box(back, { border: "single", bg: mix(c.bg, c.panel, near * 0.6), fill: true });
    ui.tint(back, fade(mix(edge, c.bg, 0.4)));
    for (let k = 1; k <= d; k++) {
      ui.text(x + k * 2 - 1, baseY - k, "╱", { fg: edge });
      ui.text(x + w + k * 2 - 1, baseY - k, "╱", { fg: edge });
      ui.text(x + w + k * 2 - 1, baseY + h - 1 - k, "╱", { fg: edge });
    }
    const face = { x, y: baseY, w, h };
    const inner = ui.box(face, { border: front ? "heavy" : "single", bg: front ? mix(c.panel, c.accent, 0.08) : mix(c.bg, c.panel, near), focused: front });
    ui.tint(face, edge);

    // what's written on it
    const e = v.e;
    const icon = e.isDir ? "▣" : /\.md$/i.test(e.name) ? "≡" : "◇";
    const name = e.isDir ? e.name : basename(e.name, ".md");
    const p = Math.min(1, (ui.now - this.shownAt - (v.i - this.sel + 4) * 40) / 400);
    if (p < 1) ui.animate(30);
    const label = p < 1 ? decrypt(name, Math.max(0, p), ui.now) : name;
    if (inner.h >= 1) ui.text(inner.x + 1, inner.y + (h >= 5 ? 1 : 0) - (h === 3 ? 0 : 0), `${icon} ${label}`, { fg: front ? c.fg : fade(c.muted), attrs: front ? BOLD : 0 }, inner.w - 2);
    if (h >= 5) {
      const kids = e.isDir ? this.deck.vault.entries.filter((x) => dirname(x.path) === e.path).length : 0;
      const meta = e.isDir ? `${kids} node${kids === 1 ? "" : "s"}` : `${(e.size / 1024).toFixed(e.size < 10240 ? 1 : 0)} kB`;
      ui.text(inner.x + 1, inner.y + 2, meta, { fg: fade(c.subtle) }, inner.w - 2);
      if (h >= 7) {
        ui.text(inner.x + 1, inner.y + 3, `mod ${ago(e.modified)}`, { fg: fade(c.subtle) }, inner.w - 2);
        ui.text(inner.x + 1, inner.y + 4, e.isDir ? "enter ▸ dive in" : "enter ▸ open", { fg: c.accent }, inner.w - 2);
      }
    }
    // shadow on the floor
    const sy = baseY + h;
    if (sy <= floor) ui.text(x + 1, sy, "▔".repeat(Math.max(0, w - 2)), { fg: mix(c.bg, edge, 0.35) });
    ui.hit(face, front ? { onClick: () => this.open(e), tip: e.isDir ? `explore ${e.path}` : `open ${e.path}` } : { onClick: () => (this.sel = v.i), tip: e.name });
  }

  private drawData(ui: UI, r: Rect, e: VaultEntry | undefined): void {
    const c = ui.c;
    if (!e) return;
    const inner = ui.box(r, { title: e.isDir ? "SECTOR" : "DATA", info: e.path, bg: c.panel });
    if (e.isDir) {
      const kids = this.deck.vault.entries.filter((x) => dirname(x.path) === e.path);
      const line = kids.slice(0, 40).map((k) => (k.isDir ? `▣ ${k.name}` : `≡ ${basename(k.name, ".md")}`)).join("   ");
      ui.text(inner.x + 1, inner.y, line || "empty", { fg: c.muted }, inner.w - 2);
      return;
    }
    let text = this.preview.get(e.path);
    if (text === undefined) {
      this.preview.set(e.path, "");
      if (e.size < 200_000)
        void this.deck.vault
          .read(e.path)
          .then((s) => {
            this.preview.set(e.path, s);
            this.deck.requestFrame();
          })
          .catch(() => this.preview.set(e.path, "(unreadable)"));
      text = "";
    }
    const lines = text.split("\n").filter((l) => l.trim() && !/^---\s*$/.test(l)).slice(0, inner.h);
    lines.forEach((l, i) => {
      const heading = /^#+\s/.test(l);
      ui.text(inner.x + 1, inner.y + i, heading ? l.replace(/^#+\s*/, "") : l, { fg: heading ? c.accent : c.muted, attrs: heading ? BOLD : 0 }, inner.w - 2);
    });
    if (!lines.length) ui.text(inner.x + 1, inner.y, text ? "(empty)" : `${ui.spinner()} decrypting…`, { fg: c.faint });
  }
}

export const explorerSpec: AppSpec = {
  kind: "explorer",
  title: "Nexus",
  description: "the vault in pseudo-3D: turn, dive, open",
  icon: "⬡",
  launcher: true,
  create: (deck, args) => new ExplorerApp(deck, typeof args === "string" ? args : ""),
};

/** The shortest way round a ring of n: a signed distance in (-n/2, n/2]. */
function ringDelta(d: number, n: number): number {
  const m = ((d % n) + n) % n;
  return m > n / 2 ? m - n : m;
}
