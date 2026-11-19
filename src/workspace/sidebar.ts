import { q, type MenuEntry } from "../ui/ui";
import { strWidth } from "../core/unicode";
import { copyToClipboard } from "../core/clipboard";
import { t } from "../core/i18n";
import { BOLD, type Rect } from "../core/grid";
import { mix } from "../core/color";
import { favCommand, favIcon, favorites } from "./favorites";
import type { Action, KeyInput } from "../core/input";
import type { Deck } from "../deck";
import type { VaultEntry } from "../platform/types";
import { ListView } from "../ui/list";
import type { UI } from "../ui/ui";
import { basename, dirname, join } from "../vault/paths";
import { ICON_CHOICES, TAG_NAMES, tagRGB, type TagColor } from "../vault/marks";

interface Row {
  entry: VaultEntry;
  depth: number;
  /** last child of its folder (└─ instead of ├─) */
  last: boolean;
  /** for each ancestor level: does a line (│) continue below it? */
  rails: boolean[];
  /** folders: how many things inside */
  count?: number;
  /** colour view: a flat list, the whole path shown */
  flat?: boolean;
}

/** The file tree. Enter/click opens a note or folds a folder; `n` new note, `r` rescan. */
export class Sidebar {
  private list = new ListView<Row>();
  private open = new Set<string>(["journal", "notes"]);
  private version = 0;
  private lastList: Rect | null = null;
  /** colour view: only what has this tag (tag view <colour>) */
  filter: TagColor | null = null;
  private builtKey = "";

  constructor(private readonly deck: Deck) {
    deck.vault.events.on("changed", () => this.version++);
    deck.vault.events.on("rescanned", () => this.version++);
    this.list.onActivate = (row) => this.activate(row);
    this.list.cmdOf = (row) => (row.entry.isDir ? undefined : `open ${q(row.entry.path)}`);
    this.list.tipOf = (row) => (row.entry.isDir ? "click: select · double-click: fold · right-click: more" : "n new note here · p pin · F2 rename · right-click: more");
    this.list.menuOf = (row) => this.entryMenu(row);
    // one click opens or folds a folder (files already open on one click)
    this.list.clickActivates = (row) => row.entry.isDir;
    // the folders you had open last time
    const saved = deck.settings.data.session?.tree;
    if (saved) this.open = new Set(saved);
  }

  /** Show one colour only (null: everything). */
  setFilter(c: TagColor | null): void {
    this.filter = c;
    this.version++;
    this.list.select(0);
    this.list.scrollTop = 0;
  }

  private rebuild(): void {
    const all = this.deck.vault.entries;
    const rows: Row[] = [];
    if (this.filter) {
      const paths = this.deck.marks.tagged(this.filter);
      paths.forEach((p, i) => {
        const entry = this.deck.vault.find(p) ?? (this.deck.vault.isDir(p) ? { path: p, name: basename(p), isDir: true, size: 0, modified: 0 } as VaultEntry : undefined);
        if (entry) rows.push({ entry, depth: 0, last: i === paths.length - 1, rails: [], flat: true });
      });
      this.list.items = rows;
      if (this.list.selected >= rows.length) this.list.select(Math.max(0, rows.length - 1));
      return;
    }
    const kidsOf = (dir: string) =>
      all
        .filter((e) => dirname(e.path) === dir && !e.name.startsWith("."))
        .sort((a, b) => Number(b.isDir) - Number(a.isDir) || a.name.localeCompare(b.name, undefined, { numeric: true }));
    const walk = (dir: string, depth: number, rails: boolean[]) => {
      const kids = kidsOf(dir);
      kids.forEach((e, i) => {
        const last = i === kids.length - 1;
        rows.push({ entry: e, depth, last, rails, count: e.isDir ? kidsOf(e.path).length : undefined });
        if (e.isDir && this.open.has(e.path)) walk(e.path, depth + 1, [...rails, !last]);
      });
    };
    walk("", 0, []);
    const current = this.list.current?.entry.path;
    this.list.items = rows;
    const idx = rows.findIndex((r) => r.entry.path === current);
    if (idx >= 0) this.list.selected = idx;
  }

  private activate(row: Row): void {
    if (row.entry.isDir) {
      if (this.open.has(row.entry.path)) this.open.delete(row.entry.path);
      else this.open.add(row.entry.path);
      this.version++;
      this.saveOpen();
    } else void this.deck.openFile(row.entry.path);
  }

  /** Remember the open folders (they come back after a restart). */
  private saveOpen(): void {
    const s = this.deck.settings;
    s.set("session", { ...(s.data.session ?? {}), tree: [...this.open] });
  }

  /** Highlight the file shown in the main area. */
  reveal(path: string): void {
    for (let d = dirname(path); d; d = dirname(d)) this.open.add(d);
    this.version++;
    this.rebuild();
    const idx = this.list.items.findIndex((r) => r.entry.path === path);
    if (idx >= 0) this.list.select(idx);
  }

  /** Right-click on an entry of the tree. */
  private entryMenu(row: Row): MenuEntry[] {
    const d = this.deck;
    const e = row.entry;
    const p = e.path;
    const abs = q("/" + p);
    const here = e.isDir ? p : dirname(p);
    const pinned = favorites(d).some((f) => f.target === p);
    const md = !e.isDir && e.name.endsWith(".md");
    return [
      e.isDir
        ? { label: this.open.has(p) ? t("fold") : t("unfold"), run: () => this.activate(row), hint: "enter" }
        : { label: t("open"), cmd: `open ${q(p)}`, hint: "enter" },
      "-",
      { label: t("new note here"), run: () => d.newNote(here || "notes"), hint: "n" },
      { label: t("new folder here"), run: () => d.newFolder(here) },
      "-",
      { label: t("rename…"), run: () => this.rename(row), hint: "F2" },
      ...(!e.isDir ? [{ label: t("duplicate"), cmd: `cp ${abs} ${q("/" + copyName(p))}` }] : []),
      { label: pinned ? t("unpin") : t("pin"), cmd: `${pinned ? "unpin" : "pin"} ${q(p)}`, hint: "p" },
      "-",
      { label: t("colour"), sub: () => this.colourMenu(p) },
      { label: t("icon"), sub: () => this.iconMenu(p) },
      { label: t("copy path"), run: () => (copyToClipboard(p), d.notify(t("path copied"))) },
      ...(md ? [{ label: t("copy [[link]]"), run: () => (copyToClipboard(`[[${e.name.replace(/\.md$/, "")}]]`), d.notify(t("link copied"))) }] : []),
      "-",
      { label: t("move to the trash"), cmd: `rm ${e.isDir ? "-r " : ""}${abs}`, danger: true, hint: "del" },
    ];
  }

  private colourMenu(p: string): MenuEntry[] {
    const cur = this.deck.marks.tagOf(p);
    const abs = q("/" + p);
    return [
      ...TAG_NAMES.map((tc) => ({ label: t(tc), color: tagRGB(tc), hint: cur === tc ? "✓" : "", cmd: `tag ${abs} ${tc}` })),
      "-",
      { label: t("no colour"), cmd: `tag rm ${abs}`, disabled: !cur },
      { label: t("see this colour only"), cmd: `tag view ${cur}`, disabled: !cur },
    ];
  }

  private iconMenu(p: string): MenuEntry[] {
    const cur = this.deck.marks.iconOf(p);
    const abs = q("/" + p);
    return [
      ...ICON_CHOICES.slice(0, 16).map((g) => ({ label: g, hint: cur === g ? "✓" : "", cmd: `icon ${abs} ${q(g)}` })),
      "-",
      {
        label: t("other…"),
        run: async () => {
          const g = await this.deck.prompt(t("One character: an emoji, a symbol (★ ♥ ⚡ λ…)"), { initial: cur ?? "", suggestions: ICON_CHOICES });
          if (g?.trim()) void this.deck.act(`icon ${abs} ${q([...g.trim()][0])}`);
        },
      },
      { label: t("default icon"), cmd: `icon rm ${abs}`, disabled: !cur },
    ];
  }

  /** Right-click on an empty spot of the tree (or the menu key). */
  menu(): MenuEntry[] {
    const row = this.list.current;
    if (row) return this.entryMenu(row);
    return [
      { label: t("new note"), run: () => this.deck.newNote("notes"), hint: "n" },
      { label: t("new folder"), run: () => this.deck.newFolder("") },
      { label: t("rescan the vault"), run: () => this.deck.vault.rescan(), hint: "r" },
    ];
  }

  /** Where the menu key opens the menu: under the selected line. */
  anchor(): { x: number; y: number } | null {
    const r = this.lastList;
    if (!r || !this.list.current) return null;
    const y = r.y + this.list.selected - this.list.scrollTop;
    return y >= r.y && y < r.y + r.h ? { x: r.x + 4, y } : null;
  }

  private async rename(row: Row): Promise<void> {
    const e = row.entry;
    const v = await this.deck.prompt(e.isDir ? t("New folder name") : t("New name"), { initial: e.isDir || !e.name.endsWith(".md") ? e.name : e.name.replace(/\.md$/, "") });
    const name = v?.trim();
    if (!name || name === e.name) return;
    const final = !e.isDir && e.name.endsWith(".md") && !/\.[a-z0-9]+$/i.test(name) ? `${name}.md` : name;
    if (final.includes("/")) return this.deck.notify(t("a name can't contain /"), "warning");
    await this.deck.act(`mv ${q("/" + e.path)} ${q("/" + join(dirname(e.path), final))}`);
  }

  onKey(k: KeyInput): boolean {
    const row = this.list.current;
    if (k.key === "f2" && row) return void this.rename(row), true;
    if ((k.key === "delete" || (k.ctrl && k.key === "backspace")) && row) {
      void this.deck.confirm(t("Move to the trash?"), `/${row.entry.path}\n${t("it goes to .trash, you can get it back")}`).then((ok) => {
        if (ok) void this.deck.act(`rm ${row.entry.isDir ? "-r " : ""}${q("/" + row.entry.path)}`);
      });
      return true;
    }
    if (k.key === "right" && row?.entry.isDir && !this.open.has(row.entry.path)) return this.activate(row), true;
    if (k.key === "left" && row) {
      if (row.entry.isDir && this.open.has(row.entry.path)) return this.activate(row), true;
      const parent = dirname(row.entry.path);
      const idx = this.list.items.findIndex((r) => r.entry.path === parent);
      if (idx >= 0) this.list.select(idx);
      return true;
    }
    return false;
  }

  onText(t: string): boolean {
    if (t === "p" && this.list.current) {
      const e = this.list.current.entry;
      const pinned = favorites(this.deck).some((f) => f.target === e.path);
      void this.deck.act(`${pinned ? "unpin" : "pin"} ${q(e.path)}`);
      return true;
    }
    if (t === "n") void this.deck.newNote(this.list.current ? (this.list.current.entry.isDir ? this.list.current.entry.path : dirname(this.list.current.entry.path)) : "notes");
    else if (t === "r") void this.deck.vault.rescan();
    else return false;
    return true;
  }

  onAction(a: Action): boolean {
    const row = this.list.current;
    if (a === "right" && row?.entry.isDir) return this.activate(row), true;
    return this.list.onAction(a);
  }

  /** The folder new things go in: the selected folder, or the selected file's folder. */
  private here(): string {
    const cur = this.list.current?.entry;
    return cur ? (cur.isDir ? cur.path : dirname(cur.path)) : "";
  }

  render(ui: UI, r: Rect, focused: boolean): void {
    const key = `${this.version}:${this.filter ? this.deck.marks.version : 0}`;
    if (this.builtKey !== key) {
      this.builtKey = key;
      this.rebuild();
    }
    const c = ui.c;
    const activeKey = this.deck.workspace.activeApp?.key ?? "";

    // the toolbar: [+ note] [+ dir], like an old file manager
    const here = this.here();
    let bx = r.x + 1;
    bx += ui.button(bx, r.y, "+ note", () => void this.deck.newNote(here || "notes"), { tip: `new note in /${here || "notes"}\nctrl+n · n` }) + 1;
    ui.button(bx, r.y, "+ dir", () => void this.deck.newFolder(here), { tip: `new folder in /${here}\nctrl+shift+n` });
    // colour tags, on a row of their own: ● has some, ○ none yet, ◉ the one shown
    // (click = see only that colour)
    const counts = this.deck.marks.counts();
    let dx = r.x + 1;
    let tagRows = 1;
    // greys-only themes (e-ink): colours can't be told apart, so they're written
    // (3 letters: rou/ros, ver/vio stay distinct), on two lines if the tree is narrow
    if (ui.theme.fx.monochrome) {
      let ty = r.y + 1;
      for (const tc of TAG_NAMES) {
        const label = t(tc).slice(0, 3);
        const w = strWidth(label);
        if (dx + w > r.x + r.w - 1) {
          if (tagRows >= 2) break;
          tagRows++;
          ty++;
          dx = r.x + 1;
        }
        const on = this.filter === tc;
        const rect = { x: dx, y: ty, w: w + 1, h: 1 };
        const hot = ui.hovered(rect);
        ui.text(dx, ty, label, { fg: on ? c.panel : counts[tc] || hot ? c.fg : c.faint, bg: on ? c.accent : hot ? c.highlight : undefined, attrs: counts[tc] || on ? BOLD : 0 });
        ui.hit(rect, { cmd: on ? "tag view off" : `tag view ${tc}`, tip: `${t(tc)} · ${counts[tc]}\n${on ? t("click: show everything") : t("click: show only this colour")}` });
        dx += w + 1;
      }
    } else for (const tc of TAG_NAMES) {
      if (dx + 2 > r.x + r.w) break;
      const on = this.filter === tc;
      const n = counts[tc];
      const rect = { x: dx, y: r.y + 1, w: 2, h: 1 };
      const hot = ui.hovered(rect);
      ui.text(dx, r.y + 1, on ? "▣" : n ? "■" : "□", { fg: n || on || hot ? tagRGB(tc) : mix(tagRGB(tc), c.bg, 0.45), bg: on || hot ? c.highlight : undefined });
      ui.hit(rect, { cmd: on ? "tag view off" : `tag view ${tc}`, tip: `${t(tc)} · ${n}\n${on ? t("click: show everything") : t("click: show only this colour")}` });
      dx += 2;
    }
    if (this.filter && dx + 4 <= r.x + r.w) {
      const xr = { x: dx, y: r.y + tagRows, w: 3, h: 1 };
      ui.text(dx, r.y + tagRows, " × ", { fg: ui.hovered(xr) ? c.error : c.subtle });
      ui.hit(xr, { cmd: "tag view off", tip: t("show everything") });
    }
    ui.hline(r.x, r.y + 1 + tagRows, r.w, { fg: c.faint }, "┄");
    // ★ pinned: notes, folders, modules (p pins the selected entry)
    const favs = favorites(this.deck);
    let top = r.y + 2 + tagRows;
    if (favs.length) {
      const shown = favs.slice(0, Math.max(1, Math.min(8, Math.floor(r.h / 3))));
      for (const f of shown) {
        const line = { x: r.x, y: top, w: r.w, h: 1 };
        const hot = ui.hovered(line);
        if (hot) ui.fill(line, { bg: c.highlight });
        const st = hot ? { bg: c.highlight } : {};
        ui.text(r.x + 1, top, "★", { fg: c.warning, ...st });
        ui.text(r.x + 3, top, favIcon(f), { fg: c.accent, ...st });
        ui.text(r.x + 5, top, f.label, { fg: hot ? c.fg : c.subtle, ...st }, r.w - 6);
        ui.hit(line, {
          cmd: favCommand(this.deck, f),
          tip: `${favCommand(this.deck, f)}\nunpin ${f.target}`,
          menu: () => [
            { label: t("open"), cmd: favCommand(this.deck, f) },
            ...(f.kind !== "module" ? [{ label: t("show in the tree"), run: () => this.reveal(f.target) }] : []),
            { label: t("unpin"), cmd: `unpin ${q(f.target)}` },
          ],
        });
        top++;
      }
      ui.hline(r.x, top, r.w, { fg: c.faint }, "┄");
      top++;
    }
    const list = { x: r.x, y: top, w: r.w, h: Math.max(0, r.y + r.h - top) };
    this.lastList = list;

    const guide = { fg: mix(c.subtle, c.bg, 0.35) };
    const marks = this.deck.marks;
    const mono = ui.theme.fx.monochrome;
    this.list.render(ui, list, focused, ({ entry, depth, last, rails, count, flat }, row, selected) => {
      const isOpen = activeKey === `note:${entry.path}`;
      const tag = marks.tagOf(entry.path);
      const custom = marks.iconOf(entry.path);
      const tint = tag ? tagRGB(tag) : undefined;
      let x = row.x + 1;
      if (flat) {
        // colour view: icon + the whole path
        x = ui.text(x, row.y, custom ?? (entry.isDir ? "▸" : entry.name.endsWith(".md") ? "■" : fileIcon(entry.name)), { fg: tint ?? c.accent });
        x = ui.text(x, row.y, " ", {});
        const dir = dirname(entry.path);
        if (dir) x = ui.text(x, row.y, `${dir}/`, { fg: c.subtle }, row.w - (x - row.x) - 2);
        ui.text(x, row.y, entry.isDir ? `${entry.name}/` : entry.name.replace(/\.md$/, ""), { fg: isOpen ? c.accentAlt : c.fg, attrs: entry.isDir || isOpen ? BOLD : 0 }, row.w - (x - row.x) - 1);
        if (isOpen) ui.text(row.x, row.y, "▌", { fg: c.accentAlt });
        return;
      }
      // tree guides: │ for open branches above, then ├─ or └─
      // (top-level items have no connector: their rail is rails[0], not drawn)
      for (let i = 1; i < depth; i++) x = ui.text(x, row.y, rails[i] ? "│ " : "  ", guide);
      if (depth > 0) x = ui.text(x, row.y, last ? "└" : "├", guide);
      if (entry.isDir) {
        const opened = this.open.has(entry.path);
        x = ui.text(x, row.y, depth > 0 ? "─" : "", guide);
        x = ui.text(x, row.y, opened ? "▾" : "▸", { fg: c.accent });
        if (custom) x = ui.text(x, row.y, custom, { fg: c.accent });
        // the colour tag: a small square at the right edge (a word in greys-only themes)
        const mark = tag ? (mono ? `${t(tag)} ` : "■ ") : "";
        x = ui.text(x, row.y, ` ${entry.name}/`, { fg: c.fg, attrs: BOLD }, row.w - (x - row.x) - 5 - strWidth(mark));
        const countS = count !== undefined ? String(count) : "";
        if (row.w - (x - row.x) > 3 + strWidth(mark) + countS.length) {
          const cx = ui.textRight(row.x + row.w - 1, row.y, countS, { fg: selected ? c.subtle : c.faint });
          if (mark) ui.textRight(cx, row.y, mark, { fg: mono ? (selected ? c.subtle : c.faint) : tint, attrs: BOLD });
        }
      } else {
        const md = entry.name.endsWith(".md");
        x = ui.text(x, row.y, depth > 0 ? "─" : "", guide);
        // the icon, then a space: a glyph never touches the name
        const icon = custom ?? (md ? "" : fileIcon(entry.name));
        x = icon ? ui.text(ui.text(x, row.y, icon, { fg: c.accentAlt }), row.y, " ") : ui.text(x, row.y, " ");
        const word = tag ? (mono ? t(tag) : "■") : "";
        ui.text(x, row.y, md ? entry.name.replace(/\.md$/, "") : entry.name, {
          fg: isOpen ? c.accentAlt : selected ? c.fg : c.muted,
          attrs: isOpen ? BOLD : 0,
        }, row.w - (x - row.x) - 1 - (word ? strWidth(word) + 2 : 0));
        if (word) ui.textRight(row.x + row.w - 2, row.y, word, { fg: mono ? (selected ? c.subtle : c.faint) : tint, attrs: BOLD });
        if (isOpen) ui.text(row.x, row.y, "▌", { fg: c.accentAlt });
      }
    });
    if (this.list.items.length === 0) ui.text(list.x + 2, list.y + 1, this.filter ? t("nothing {colour} yet", { colour: t(this.filter) }) : "empty vault", { fg: c.subtle }, list.w - 3);
  }
}

/** A glyph per file type (notes need none): code, scripts, data, media… */
const ICONS: [RegExp, string][] = [
  [/\.py$/i, "∿"], [/\.(js|mjs|cjs|ts|tsx|jsx)$/i, "ʝ"], [/\.(sh|zsh|bash|fish|ibsh|ps1|bat)$/i, "❯"], [/\.(rs|go|c|cpp|h|java|kt|swift|rb|lua)$/i, "λ"],
  [/\.(json|toml|ya?ml|ini|conf|cfg)$/i, "⚙"], [/\.(csv|tsv|xlsx?)$/i, "▥"], [/\.(html?|css|svg)$/i, "◇"], [/\.(txt|log)$/i, "≡"],
  [/\.(png|jpe?g|gif|webp|heic|bmp)$/i, "▣"], [/\.pdf$/i, "▤"], [/\.(mp3|wav|flac|m4a|ogg|aiff?)$/i, "♪"], [/\.(mp4|mov|mkv|webm)$/i, "▶"],
  [/\.(zip|tar|gz|7z|rar)$/i, "▦"], [/\.(canvas|base)$/i, "◫"],
];
export const fileIcon = (name: string) => ICONS.find(([re]) => re.test(name))?.[1] ?? "◦";

/** notes/a.md → notes/a copy.md (then a copy 2…) */
function copyName(p: string): string {
  const b = basename(p);
  const dot = b.lastIndexOf(".");
  const [stem, ext] = dot > 0 ? [b.slice(0, dot), b.slice(dot)] : [b, ""];
  return join(dirname(p), `${stem} copy${ext}`);
}
