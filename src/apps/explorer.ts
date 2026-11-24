import { mix, type RGB } from "../core/color";
import { t as tr } from "../core/i18n";
import { BOLD, type Rect } from "../core/grid";
import type { Action, KeyInput } from "../core/input";
import type { Deck } from "../deck";
import { drawBackground } from "../fx/backgrounds";
import { perspectiveFloor } from "../ui/floor";
import { ring, WheelSpin } from "../ui/wheelspin";
import { FilterBar } from "../ui/filterbar";
import { pageBar } from "../ui/pagebar";
import { GAP, INSET } from "../ui/layout";
import { tagRGB, type TagColor } from "../vault/marks";
import type { VaultEntry } from "../platform/types";
import { q, type UI } from "../ui/ui";
import { basename, dirname } from "../vault/paths";
import { ago } from "../core/time";
import type { App, AppSpec } from "./types";
import { fileIcon } from "../ui/fileicon";
import { icon } from "../core/skin/icons";

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
/** what a node is: a folder, a note, or a file of some kind — its glyph, its word, its colour */
export function kindOf(e: { isDir: boolean; name: string }): { icon: string; word: string; color: (c: UI["c"]) => RGB } {
  if (e.isDir) return { icon: icon("file.folder"), word: "folder", color: (c) => c.accentAlt };
  if (/\.md$/i.test(e.name)) return { icon: icon("file.note"), word: "note", color: (c) => c.accent };
  const ext = /\.([a-z0-9]{1,5})$/i.exec(e.name)?.[1]?.toLowerCase() ?? "file";
  return { icon: fileIcon(e.name), word: ext, color: (c) => c.warning };
}

/**
 * A file's little drawing on its NEXUS sheet, by what it holds (ASCII, two or three lines): a
 * note's lines of text, a picture's mountain and sun, a sound's wave, code's brackets…
 */
export function fileArt(name: string): string[] {
  const n = name.toLowerCase();
  if (/\.md$/.test(n)) return ["━━━ ━━ ━━━━", "━━ ━━━━ ━", "━━━━ ━━━"];
  if (/\.(png|jpe?g|gif|webp|heic|bmp|svg)$/.test(n)) return ["   ◠  ▲  ", "  ▲ ▲▲▲▲ ", " ▲▲▲▲▲▲▲▲"];
  if (/\.(mp3|wav|flac|m4a|ogg|aiff?|bmed|mid)$/.test(n)) return ["♪   ♫", "▁▃▅▇▅▃▁▃▅", ""];
  if (/\.(mp4|mov|mkv|webm)$/.test(n)) return ["┌─────┐", "│  ▶  │", "└─────┘"];
  if (/\.(js|mjs|cjs|ts|tsx|jsx|py|rs|go|c|cpp|h|java|kt|swift|rb|lua|sh|zsh|bash|ps1|ibsh|html?|css)$/.test(n)) return ["{ </> }", "  ;;  "];
  if (/\.(csv|tsv|xlsx?|json|toml|ya?ml|ics)$/.test(n)) return ["┼─┼─┼─┼", "┼─┼─┼─┼"];
  if (/\.pdf$/.test(n)) return ["▤ PDF", "━━━━━"];
  if (/\.(zip|tar|gz|7z|rar)$/.test(n)) return ["▦▦▦", "▦▦▦"];
  if (/\.(txt|log)$/.test(n)) return ["─── ── ───", "── ─── ─"];
  return ["◇"];
}

/** below this many lines the 3D scene has no room: the folder is a list */
const SCENE_MIN_H = 12;

export class ExplorerApp implements App {
  readonly kind = "explorer";
  readonly key = "explorer";
  private dir: string;
  private sel = 0;
  /** The carousel: wheel / trackpad steps and the eased position (`spin.pos`). */
  private spin = new WheelSpin();
  private lastT = 0;
  /** Floor scroll, pushed by turning and diving. */
  private travel = 0;
  private warpUntil = 0;
  private shownAt = 0;
  /** when we last went into (or out of) a folder: the dive animation */
  private diveAt = 0;
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
    return "←→ turn · enter open · ⌫ up · / filter · + note · F2 rename · del trash · : actions";
  }

  /** search + colours (the same bar as MODULES): / types, squares tick colours */
  /** typing a letter searches at once (no letter shortcuts here) */
  readonly filter = new FilterBar({ typeToSearch: true });

  private items(): VaultEntry[] {
    // colours ticked: what wears one, and the folders that hold some; a search: the names
    const bar = this.filter;
    const marks = this.deck.marks;
    const tagged = bar.colours.size ? [...bar.colours].flatMap((c) => marks.tagged(c)) : [];
    const keep = (e: VaultEntry) => !bar.active || bar.matches(e.name, marks.tagOf(e.path) ?? null) || (e.isDir && !bar.query && tagged.some((p) => p.startsWith(`${e.path}/`)));
    return this.deck.vault.entries
      .filter((e) => dirname(e.path) === this.dir && keep(e))
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
    const name = await this.deck.prompt(tr("New note here"), { placeholder: "night city ideas" });
    if (!name?.trim()) return;
    const path = this.here(name.trim().endsWith(".md") ? name.trim() : `${name.trim()}.md`);
    await this.deck.act(`touch ${q(path)}`);
    await this.deck.act(`open ${q(path)}`);
  }
  private async newFolder(): Promise<void> {
    const name = await this.deck.prompt(tr("New folder here"), { placeholder: "projects" });
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
    this.spin.pos = this.sel;
    this.deck.notify(`nexus: sorted by ${this.sortBy}`);
  }
  private async actionMenu(): Promise<void> {
    const e = this.current;
    const actions: [string, string, () => unknown][] = [
      [tr("New note here"), "+", () => this.newNote()],
      [tr("New folder here"), "", () => this.newFolder()],
      [tr("Search the vault"), "/", () => this.search()],
      [`Sort by… (now ${this.sortBy})`, "", () => this.cycleSort()],
      ...(e
        ? ([
            [`Open ${e.name}`, "enter", () => this.open(e)],
            [`Rename ${e.name}`, "F2", () => this.rename()],
            [`Move ${e.name} to the trash`, "delete", () => this.trash()],
            [tr("Copy its path"), "", () => navigator.clipboard?.writeText(e.path).then(() => this.deck.notify(`copied ${e.path}`))],
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
    this.spin.pos = this.sel + (select ? 0 : 3); // swing in
    this.warpUntil = performance.now() + 450;
    this.diveAt = performance.now();
    this.shownAt = 0;
    this.deck.sound.play("open");
  }

  private open(e: VaultEntry | undefined): void {
    if (!e) return;
    this.deck.sound.play("select");
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
    this.deck.sound.play("tick");
  }

  onText(t: string): boolean {
    if (this.filter.onText(t)) return (this.sel = 0), true;
    if (t === "+") return void this.newNote(), true;
    if (t === ":") return void this.actionMenu(), true;
    return false;
  }

  onKey(k: KeyInput): boolean {
    if (this.filter.onKey(k)) return (this.sel = 0), true;
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
    const before = this.spin.pos;
    // a disc that never ends: pos keeps turning the short way round (past the last
    // comes the first, still forward), it's never reset
    const nItems = Math.max(1, items.length);
    const left = this.spin.ease(this.sel, nItems, dt);
    const warp = Math.max(0, (this.warpUntil - now) / 450);
    this.travel += (this.spin.pos - before) * 0.8 + dt * (0.15 + warp * 6);
    ui.animate(left > 0.001 || warp > 0 ? 16 : 60);

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
    drawBackground(ui, sky, { ...t, background: { ...t.background, effect: "rain", density: 0.3 + warp, speed: 1 + warp * 4, color: mix(c.bg, c.accent, 0.2 + warp * 0.25), color2: mix(c.bg, c.accentAlt, 0.5), glyphs: t.anim.noise } }, 0.7);

    // ── floor: the shared perspective grid (the same as MODULES') ──
    const cx = r.x + r.w / 2;
    perspectiveFloor(ui, { x: r.x, y: horizon, w: r.w, h: floorBottom - horizon + 1 }, cx, this.travel);

    // ── the top of the page: where you are, the tools, the filter (the same bar as MODULES) ──
    const parts = this.dir ? this.dir.split("/") : [];
    const counts: Partial<Record<TagColor, number>> = {};
    for (const tc of Object.values(this.deck.marks.tags)) counts[tc] = (counts[tc] ?? 0) + 1;
    pageBar(ui, r, {
      crumbs: [{ label: "◈ vault", go: () => this.go(""), tip: tr("back to the root") }, ...parts.map((p, i) => ({ label: p, go: () => this.go(parts.slice(0, i + 1).join("/")) }))],
      info: tr(items.length === 1 ? "{n} node" : "{n} nodes", { n: items.length }),
      tools: [
        { label: tr("+ note"), run: () => this.newNote(), tip: tr("new note here · +") },
        { label: tr("+ folder"), run: () => this.newFolder(), tip: tr("new folder here") },
        { label: "⌕", run: () => this.search(), tip: tr("search the vault · /") },
        { label: "✎", run: () => this.rename(), tip: tr("rename · F2") },
        { label: "✕", run: () => this.trash(), tip: tr("to the trash · delete") },
        { label: `⇅ ${tr(this.sortBy)}`, run: () => this.cycleSort(), tip: tr("sort: name · modified · size") },
        { label: ":", run: () => this.actionMenu(), tip: tr("every action · : · pad menu") },
      ],
      filter: this.filter,
      counts,
    });

    if (!items.length) {
      const on = this.filter.active;
      const y0 = r.h < SCENE_MIN_H ? r.y + 3 : horizon + 2;
      ui.textCenter(r, y0, on ? tr("nothing matches") : tr("empty sector"), { fg: c.muted, attrs: BOLD });
      ui.textCenter(r, y0 + 1, on ? tr("esc clears the search · × shows everything") : tr("⌫ to back up"), { fg: c.subtle });
      return;
    }
    // a short page (a small window with the shell open): no room for the scene — the nodes ran
    // over the bar at the top. The folder as a list instead, the same keys.
    if (r.h < SCENE_MIN_H) return this.drawList(ui, { x: r.x + INSET, y: r.y + 2, w: r.w - INSET * 2, h: r.h - 2 }, items, focused);

    // ── the carousel, drawn back to front ──
    // the front of the ring: 5 lockers once there are 5 things or more, 3 for 3-4, 1 below
    const half = items.length >= 5 ? 2 : items.length >= 3 ? 1 : 0;
    const step = half === 2 ? 0.62 : 0.9;
    const radius = Math.min(r.w * 0.42, 60);
    const visible: { e: VaultEntry; i: number; z: number; x: number }[] = [];
    for (let i = 0; i < items.length; i++) {
      const off = ring(i - this.spin.pos, items.length);
      if (Math.abs(off) > half + 0.5) continue; // (+0.5: the next one slides in while the ring turns)
      const a = off * step;
      visible.push({ e: items[i], i, z: Math.cos(a), x: cx + Math.sin(a) * radius });
    }
    visible.sort((a, b) => a.z - b.z);
    // the wheel turns the ring wherever the mouse is
    ui.hit(r, { onWheel: (lines) => { const s = this.spin.wheel(lines); if (s) this.turn(s); } });
    // diving into a folder: the lockers come out of the vanishing point, frames rush past
    const dv = Math.min(1, (performance.now() - this.diveAt) / 300);
    if (dv < 1) {
      ui.animate(16);
      const ease = 1 - (1 - dv) ** 3;
      for (const v of visible) v.x = cx + (v.x - cx) * (0.12 + 0.88 * ease);
      for (let k = 0; k < 3; k++) {
        const g = (dv * 1.6 + k / 3) % 1; // each frame grows from the middle outward
        const fw = Math.round(r.w * g), fh = Math.round((floorBottom - horizon + 6) * g);
        if (fw < 4 || fh < 2) continue;
        const fx = Math.round(cx - fw / 2), fy = Math.round(horizon - fh / 3);
        const st = { fg: mix(c.bg, c.accent, (1 - g) * 0.6) };
        ui.hline(fx, fy, fw, st, "─");
        ui.hline(fx, fy + fh - 1, fw, st, "─");
        ui.vline(fx, fy, fh, st, "│");
        ui.vline(fx + fw - 1, fy, fh, st, "│");
      }
    }
    // the 3D nodes overlap on purpose (ui.art: debug layout doesn't count it) — under the bar, never over it
    ui.clip({ x: r.x, y: r.y + 2, w: r.w, h: r.h - 2 }, () =>
      ui.art(() => {
        for (const v of visible) this.drawNode(ui, r, v, horizon, floorBottom, focused);
      }),
    );


    // ── the floating summary of the node under the pointer (after a short rest, it unfolds) ──
    this.drawHover(ui, r);

    // ── data panel: the one in front ──
    if (previewH) this.drawData(ui, { x: r.x + 1, y: floorBottom + 1, w: r.w - 2, h: previewH }, items[this.sel]);
  }

  private drawNode(ui: UI, r: Rect, v: { e: VaultEntry; i: number; z: number; x: number }, horizon: number, floor: number, focused: boolean): void {
    const c = ui.c;
    const front = v.i === this.sel;
    // 0 back → 1 front, in 12 steps: the colours that fade with depth repeat from one
    // frame to the next (each new tint is a glyph drawn again — core/atlas.ts)
    const near = Math.round(((v.z + 1) / 2) * 12) / 12;
    // sizes follow the depth continuously (no jump from one size to the next)
    const big = near > 0.93;
    const k = near * near;
    const w = Math.round(12 + 14 * k);
    const h = Math.round(3 + 4 * k);
    const baseY = Math.round(horizon + 1 + near * near * (floor - horizon - h - 1));
    const x = Math.round(v.x - w / 2);
    const fade = (col: RGB) => mix(c.bg, col, 0.25 + near * 0.75);
    const tag = this.deck.marks.tagOf(v.e.path);
    const edge = tag ? (front ? tagRGB(tag) : fade(mix(tagRGB(tag), c.border, 0.35))) : front ? (focused ? c.accent : c.accentAlt) : fade(c.border);
    if (x + w < r.x || x >= r.x + r.w) return;

    // a folder is a box (a cube: a back edge offset up-right, then the front face over it); a
    // file is a sheet with a folded corner and a little drawing of what it holds
    const d = big ? 2 : 1;
    if (v.e.isDir) {
      const back = { x: x + d * 2, y: baseY - d, w, h };
      ui.box(back, { border: "single", bg: mix(c.bg, c.panel, near * 0.6), fill: true });
      ui.tint(back, fade(mix(edge, c.bg, 0.4)));
      for (let k = 1; k <= d; k++) {
        ui.text(x + k * 2 - 1, baseY - k, "╱", { fg: edge });
        ui.text(x + w + k * 2 - 1, baseY - k, "╱", { fg: edge });
        ui.text(x + w + k * 2 - 1, baseY + h - 1 - k, "╱", { fg: edge });
      }
    }
    const face = { x, y: baseY, w, h };
    const inner = ui.box(face, { border: front ? "heavy" : "single", bg: front ? mix(c.panel, c.accent, 0.08) : mix(c.bg, c.panel, near), focused: front });
    ui.tint(face, edge);
    if (!v.e.isDir) ui.text(x + w - 1, baseY, "╲", { fg: edge, bg: c.bg });

    // what's written on it: what it is first (a folder, a note, a file and its kind), then its name
    const e = v.e;
    const kind = kindOf(e);
    const icon = kind.icon;
    const name = e.isDir ? `${e.name}/` : basename(e.name, ".md");
    // a folder has a tab on its top edge, like a folder (files have none)
    if (e.isDir && inner.h >= 1) ui.text(x + 1, baseY - 1, `▁${"▁".repeat(Math.min(6, Math.max(2, Math.floor(w / 3))))}▁`, { fg: edge });
    if (h >= 4) ui.textRight(face.x + face.w - GAP, baseY, ` ${tr(kind.word)} `, { fg: front ? c.bg : fade(kind.color(c)), bg: front ? kind.color(c) : undefined, attrs: BOLD });
    if (ui.hovered(face)) this.hoverAt(e, face, ui.now);
    const p = Math.min(1, (ui.now - this.shownAt - (v.i - this.sel + 4) * 40) / 400);
    if (p < 1) ui.animate(30);
    const label = ui.reveal(name, p);
    if (inner.h >= 1) {
      const ix = ui.text(inner.x + INSET, inner.y + (h >= 5 ? 1 : 0), `${icon} `, { fg: fade(kind.color(c)), attrs: BOLD });
      ui.text(ix, inner.y + (h >= 5 ? 1 : 0), label, { fg: front ? c.fg : fade(c.muted), attrs: front || e.isDir ? BOLD : 0 }, inner.w - (ix - inner.x) - 1);
    }
    // a file's drawing (its kind), under its name, when the sheet is tall enough
    if (!e.isDir && h >= 5) {
      const art = fileArt(e.name);
      const rows = Math.min(art.length, inner.h - (h >= 7 ? 3 : 2));
      for (let i = 0; i < rows; i++) ui.textCenter({ x: inner.x, y: 0, w: inner.w, h: 1 }, inner.y + 2 + i, art[i], { fg: fade(kind.color(c)) });
      if (h >= 7) ui.text(inner.x + 1, inner.y + inner.h - 1, tr("enter ▸ open"), { fg: c.accent }, inner.w - 2);
    } else if (h >= 5) {
      const kids = e.isDir ? this.deck.vault.entries.filter((x) => dirname(x.path) === e.path).length : 0;
      const meta = e.isDir ? tr(kids === 1 ? "{n} thing inside" : "{n} things inside", { n: kids }) : `${(e.size / 1024).toFixed(e.size < 10240 ? 1 : 0)} kB`;
      ui.text(inner.x + 1, inner.y + 2, meta, { fg: fade(c.subtle) }, inner.w - 2);
      if (h >= 7) {
        ui.text(inner.x + 1, inner.y + 3, `mod ${ago(e.modified)}`, { fg: fade(c.subtle) }, inner.w - 2);
        ui.text(inner.x + 1, inner.y + 4, tr(e.isDir ? "enter ▸ dive in" : "enter ▸ open"), { fg: c.accent }, inner.w - 2);
      }
    }
    // shadow on the floor
    const sy = baseY + h;
    if (sy <= floor) ui.text(x + 1, sy, "▔".repeat(Math.max(0, w - 2)), { fg: mix(c.bg, edge, 0.35) });
    ui.hit(face, front ? { onClick: () => this.open(e), tip: e.isDir ? `explore ${e.path}` : `open ${e.path}` } : { onClick: () => (this.sel = v.i) }); // its summary floats above it (drawHover): no tip on top
  }

  /** the node under the pointer and since when (set while drawing the nodes) */
  private hover: { path: string; e: VaultEntry; face: Rect; since: number; seen: number } | null = null;
  private hoverAt(e: VaultEntry, face: Rect, now: number): void {
    if (this.hover?.path === e.path) Object.assign(this.hover, { face, seen: now });
    else this.hover = { path: e.path, e, face, since: now, seen: now };
  }

  /**
   * A small floating window beside the node the pointer rests on: what's in a folder (how many
   * folders, notes, other files, the first names), a note's first lines, a file's size and date.
   * It waits 350 ms, then unfolds from its corner (150 ms); it goes when the pointer leaves.
   */
  private drawHover(ui: UI, r: Rect): void {
    const h = this.hover;
    if (!h || ui.now - h.seen > 50) return void (this.hover = null);
    const wait = 350 - (ui.now - h.since);
    if (wait > 0) return ui.animate(wait);
    const c = ui.c;
    const e = h.e;
    const lines: { s: string; fg: number; attrs?: number }[] = [];
    if (e.isDir) {
      const kids = this.deck.vault.entries.filter((x) => dirname(x.path) === e.path);
      const dirs = kids.filter((k) => k.isDir).length, notes = kids.filter((k) => !k.isDir && /\.md$/i.test(k.name)).length;
      const other = kids.length - dirs - notes;
      lines.push({ s: [dirs && tr("{n} folders", { n: dirs }), notes && tr("{n} notes", { n: notes }), other && tr("{n} other files", { n: other })].filter(Boolean).join(" · ") || tr("empty"), fg: c.fg, attrs: BOLD });
      for (const k of kids.slice(0, 6)) lines.push({ s: `${kindOf(k).icon} ${k.isDir ? `${k.name}/` : basename(k.name, ".md")}`, fg: k.isDir ? c.accentAlt : c.muted });
      if (kids.length > 6) lines.push({ s: `… +${kids.length - 6}`, fg: c.subtle });
    } else {
      const k = kindOf(e);
      lines.push({ s: `${tr(k.word)} · ${(e.size / 1024).toFixed(e.size < 10240 ? 1 : 0)} kB · ${ago(e.modified)}`, fg: c.fg, attrs: BOLD });
      if (/\.md$/i.test(e.name)) {
        const text = this.preview.get(e.path);
        if (text === undefined) void this.deck.vault.read(e.path).then((s) => (this.preview.set(e.path, s), this.deck.requestFrame())).catch(() => this.preview.set(e.path, ""));
        for (const l of (text ?? "").split("\n").filter((l) => l.trim() && !/^---\s*$/.test(l)).slice(0, 5)) lines.push({ s: l.replace(/^#+\s*/, ""), fg: /^#/.test(l) ? c.accent : c.muted });
      }
    }
    const W = Math.min(40, r.w - GAP * 2), H = Math.min(lines.length + 2, 10);
    // unfolds from the node's top-right corner
    const p = Math.min(1, (ui.now - h.since - 350) / 150);
    if (p < 1) ui.animate(16);
    const w = Math.max(4, Math.round(W * p)), hh = Math.max(3, Math.round(H * p));
    // above the node (its neighbours stay visible), else under it; its left edge on the node's
    const x = Math.max(r.x, Math.min(h.face.x, r.x + r.w - W));
    let y = h.face.y - H - 2;
    if (y < r.y + 1) y = Math.min(h.face.y + h.face.h + 1, r.y + r.h - H);
    const box = { x, y, w, h: hh };
    const inner = ui.box(box, { title: p >= 1 ? (e.isDir ? `${e.name}/` : basename(e.name, ".md")) : "", bg: c.panelAlt, focused: true });
    if (p >= 1) lines.slice(0, inner.h).forEach((l, i) => ui.text(inner.x + INSET, inner.y + i, l.s, { fg: l.fg, attrs: l.attrs ?? 0 }, inner.w - INSET * 2));
  }

  /** the folder as a list (a short page): what it is, its name, the one chosen lit; a click chooses, a second opens */
  private drawList(ui: UI, r: Rect, items: VaultEntry[], focused: boolean): void {
    const c = ui.c;
    ui.fill(r, { bg: c.bg }); // (the sky's rain fell through the names)
    const first = Math.max(0, Math.min(this.sel - Math.floor(r.h / 2), items.length - r.h));
    items.slice(first, first + r.h).forEach((e, k) => {
      const i = first + k, y = r.y + k;
      const on = i === this.sel;
      const kind = kindOf(e);
      const row = { x: r.x, y, w: r.w, h: 1 };
      if (on) ui.fill(row, { bg: focused ? mix(c.accent, c.bg, 0.75) : c.highlight });
      const st = on ? { bg: focused ? mix(c.accent, c.bg, 0.75) : c.highlight } : {};
      const x = ui.text(r.x, y, `${kind.icon} `, { fg: kind.color(c), attrs: BOLD, ...st });
      ui.text(x, y, e.isDir ? `${e.name}/` : basename(e.name, ".md"), { fg: on ? c.fg : c.muted, attrs: on || e.isDir ? BOLD : 0, ...st }, r.w - (x - r.x) - 8);
      ui.textRight(r.x + r.w, y, tr(kind.word), { fg: c.subtle, ...st });
      ui.hit(row, { onClick: () => (on ? this.open(e) : (this.sel = i)), onDouble: () => this.open(e), tip: e.isDir ? `explore ${e.path}` : `open ${e.path}` });
    });
  }

  private drawData(ui: UI, r: Rect, e: VaultEntry | undefined): void {
    const c = ui.c;
    if (!e) return;
    const inner = ui.box(r, { title: tr(e.isDir ? "SECTOR" : "DATA"), info: e.path, bg: c.panel });
    if (e.isDir) {
      const kids = this.deck.vault.entries.filter((x) => dirname(x.path) === e.path);
      const line = kids.slice(0, 40).map((k) => (k.isDir ? `▣ ${k.name}` : `≡ ${basename(k.name, ".md")}`)).join("   ");
      ui.text(inner.x + 1, inner.y, line || tr("empty"), { fg: c.muted }, inner.w - 2);
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
    if (!lines.length) ui.text(inner.x + 1, inner.y, text ? "(empty)" : `${ui.spinner()} decrypting…`, { fg: c.subtle });
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
