import { Glide } from "../ui/glide";
import { t } from "../core/i18n";
import { SETTINGS_HELP } from "./settings-help";
import { checkNeural } from "./settings-rows";
import { strWidth, truncate } from "../core/unicode";
import { askNumber, slider } from "../ui/slider";
import { BOLD, type Rect } from "../core/grid";
import type { Action, KeyInput } from "../core/input";
import { mix } from "../core/color";
import { displayKeys } from "../core/shortcuts";
import { kindOf, resetRow, rowIsDefault, rowResettable, type SettingRow as Row } from "../core/prefs";
import type { Deck } from "../deck";
import type { UI } from "../ui/ui";
import type { App, AppSpec } from "./types";

/**
 * Settings screen for people who'd rather not type `config set …`.
 * ←/→ (or click, or A) change a value; text values open an input box.
 */
export class SettingsApp implements App {
  readonly kind = "settings";
  readonly key = "settings";
  /** the rows, from deck.prefs (rebuilt when what they depend on changes) */
  private secs: ReturnType<Deck["prefs"]["sections"]> = [];

  constructor(private readonly deck: Deck) {
    void checkNeural(deck);
  }

  title(): string {
    return "settings";
  }

  status(): string {
    return t("type to search · ↑↓ ←→ enter · del: back to default");
  }

  /** the categories, in order, with their rows (deck.prefs: the deck's and the modules') */
  private sections(): ReturnType<Deck["prefs"]["sections"]> {
    return this.secs;
  }
  private cat = 0;
  private sel = 0;
  private pane: "cats" | "rows" = "cats";
  private query = "";
  private scroll = 0;
  /** the wheel's glide (ui/glide.ts) */
  private readonly glide = new Glide();
  /** the selection the view last followed */
  private shownSel = -1;

  /** what the right side shows: the category, or the search results across all of them */
  private shown(): { row: Row; from: string }[] {
    const secs = this.sections();
    const q = this.query.toLowerCase().trim();
    const visible = (row: Row) => !row.hidden?.();
    if (!q) {
      const sec = secs[this.cat];
      return sec ? sec.rows.filter(visible).map((row) => ({ row, from: sec.name })) : [];
    }
    return secs.flatMap((sec) =>
      sec.rows
        .filter((row) => visible(row) && !row.head && `${row.label} ${t(row.label)} ${row.key ?? ""} ${sec.name} ${t(sec.name)} ${row.value()}`.toLowerCase().includes(q))
        .map((row) => ({ row, from: sec.name })),
    );
  }

  /** the next selectable row (headings are skipped) */
  private step(rows: { row: Row }[], from: number, dir: 1 | -1): number {
    if (!rows.length) return 0;
    let i = from;
    for (let n = 0; n < rows.length; n++) {
      i = (i + dir + rows.length) % rows.length;
      if (!rows[i].row.head) return i;
    }
    return from;
  }

  // ── back to default ──────────────────────────────────────────────────────

  private rowDefault(row: Row): boolean {
    return rowIsDefault(this.deck, row);
  }
  private resettable(row: Row): boolean {
    return rowResettable(this.deck, row);
  }

  private async resetOne(row: Row): Promise<void> {
    if (!this.resettable(row) || this.rowDefault(row)) return;
    if (!(await this.deck.confirm(t("Back to the default?"), t(row.label)))) return;
    resetRow(this.deck, row);
  }

  /** the category shown: everything back to default (asks first) */
  private resetCategory(): void {
    const sec = this.sections()[this.cat];
    if (sec && sec.group !== "DANGER") void this.resetSection(sec.name, sec.rows);
  }

  private async resetSection(name: string, rows: Row[]): Promise<void> {
    const changed = rows.filter((r) => this.resettable(r) && !this.rowDefault(r));
    if (!changed.length) return this.deck.notify(t("everything here is already at its default"));
    if (!(await this.deck.confirm(t("Everything in {cat} back to default?", { cat: t(name) }), t("{n} settings change back: {list}", { n: changed.length, list: changed.map((r) => t(r.label)).slice(0, 6).join(", ") })))) return;
    for (const r of changed) resetRow(this.deck, r);
    this.deck.notify(t("{cat}: back to default", { cat: t(name) }), "success");
  }

  onText(ch: string): boolean {
    if (ch === "\n") return false;
    this.query += ch;
    this.sel = 0;
    this.pane = "rows";
    return true;
  }

  /** on a shortcut row: 0 = its keys, 1 = its key on THE MENU */
  private keyCell: 0 | 1 = 0;

  onKey(k: KeyInput): boolean {
    const cur = this.pane === "rows" || this.query ? this.shown()[this.sel]?.row : undefined;
    // del: this row back to its default (one of your shortcuts: removed) · shift+del: the whole category
    if (k.combo === "delete" && cur) return cur.keys?.remove ? cur.keys.remove() : void this.resetOne(cur), true;
    if (k.combo === "shift+delete" && !this.query) return void this.resetCategory(), true;
    if (k.combo === "f2" && cur?.keys?.editCombo) return cur.keys.editCombo(), true;
    if (k.combo === "backspace" && this.query) return (this.query = this.query.slice(0, -1)), (this.sel = 0), true;
    if (k.combo === "esc" && this.query) return (this.query = ""), (this.sel = 0), true;
    if (k.combo === "esc" && this.pane === "rows") return (this.pane = "cats"), true;
    if (k.combo === "tab" || k.combo === "shift+tab") {
      if (k.combo === "shift+tab" && this.pane === "cats") return false; // the next part of the screen
      this.pane = this.pane === "cats" ? "rows" : "cats";
      return true;
    }
    return false;
  }

  onAction(a: Action): boolean {
    const secs = this.sections();
    if (this.pane === "cats" && !this.query) {
      if (a === "up") return (this.cat = (this.cat - 1 + secs.length) % secs.length), (this.sel = 0), true;
      if (a === "down" || a === "item-next") return (this.cat = (this.cat + 1) % secs.length), (this.sel = 0), true;
      if (a === "right" || a === "confirm") return (this.pane = "rows"), true;
      return false;
    }
    const rows = this.shown();
    const row = rows[this.sel]?.row;
    if (a === "up") return (this.sel = this.step(rows, this.sel, -1)), true;
    if (a === "down" || a === "item-next") return (this.sel = this.step(rows, this.sel, 1)), true;
    if (a === "back" && !this.query) return (this.pane = "cats"), true;
    if (!row) return a === "left" ? ((this.pane = "cats"), true) : false;
    const kind = kindOf(row);
    // a shortcut: ←→ between its keys and its menu key, enter changes the one chosen
    if (kind === "keys") {
      const k = row.keys!;
      if (a === "right" && k.menuKey && this.keyCell === 0) return (this.keyCell = 1), true;
      if (a === "left" && this.keyCell === 1) return (this.keyCell = 0), true;
      if (a === "confirm") return (this.keyCell === 1 && k.menuKey ? k.editMenuKey : k.editCombo)?.(), true;
      if (a === "left" && !this.query) return (this.pane = "cats"), true;
      return a === "right";
    }
    // a choice, a box, a slider: ←→ change it · text and actions: enter / → open, ← back to the categories
    const sideways = kind === "choice" || kind === "toggle" || kind === "slider";
    if ((a === "left" || a === "right") && sideways) return void row.change?.(a === "left" ? -1 : 1), true;
    if (a === "left") return !this.query && ((this.pane = "cats"), true);
    if ((a === "right" || a === "confirm") && row.change) return void row.change(1), true;
    return false;
  }

  private builtFor = "";
  render(ui: UI, r: Rect, focused: boolean): void {
    const c = ui.c;
    // what the rows depend on (your shortcuts, the language, the modules that are on): rebuild then
    const d = this.deck;
    const sig = `${JSON.stringify(d.settings.data.keys ?? {})}|${d.settings.data.user.language}|${d.plugins.active().map((p) => p.manifest.id).join()}|${d.moduleSettings.size}`;
    if (sig !== this.builtFor) (this.builtFor = sig), (this.secs = d.prefs.sections());
    const secs = this.sections();
    this.cat = Math.min(this.cat, secs.length - 1);
    // the search field
    const sy = r.y + 1;
    const sw = Math.min(r.w - 4, 100);
    const sx = r.x + 2;
    ui.fill({ x: sx, y: sy, w: sw, h: 1 }, { bg: c.highlight });
    ui.text(sx + 1, sy, "⌕", { fg: c.accent, bg: c.highlight });
    ui.text(sx + 3, sy, this.query || ` ${t("type to search every setting…")}`, { fg: this.query ? c.fg : c.muted, bg: c.highlight }, sw - 4);
    // the blinking caret: you can type here
    if (focused) ui.cursor(sx + 3 + strWidth(this.query), sy);

    // left: the categories
    const top = sy + 2;
    const catW = Math.min(24, Math.floor(r.w * 0.28));
    let extra = 0;
    secs.forEach((sec, i) => {
      if (i === 0 || sec.group !== secs[i - 1].group) {
        const hy = top + i + extra + (i ? 1 : 0);
        if (hy < r.y + r.h - 2 && sec.group !== "DANGER") ui.text(sx, hy, t(sec.group), { fg: c.subtle, attrs: BOLD });
        else if (hy < r.y + r.h - 2) ui.hline(sx, hy, catW, { fg: c.faint }, "┄");
        extra += i ? 2 : 1;
      }
      const y = top + i + extra;
      if (y >= r.y + r.h - 2) return;
      const line = { x: sx, y, w: catW, h: 1 };
      const on = i === this.cat && !this.query;
      const bg = on ? (focused && this.pane === "cats" ? c.accent : mix(c.accent, c.bg, 0.75)) : ui.hovered(line) ? c.highlight : undefined;
      if (bg !== undefined) ui.fill(line, { bg });
      const name = t(sec.name);
      ui.text(sx + 1, y, `${on ? "▸" : " "} ${name}`, { fg: on && focused && this.pane === "cats" ? c.panel : sec.name === "DANGER ZONE" ? c.error : on ? c.fg : c.muted, attrs: on ? BOLD : 0, ...(bg !== undefined ? { bg } : {}) }, catW - 1);
      ui.hit(line, { onClick: () => ((this.cat = i), (this.sel = 0), (this.query = ""), (this.pane = "rows")), tip: `${sec.rows.length} settings` });
    });
    ui.vline(sx + catW + 1, top, r.y + r.h - top - 2, { fg: c.faint });

    // right: the settings of that category (or the search results)
    const rx = sx + catW + 3, rw = Math.min(r.w - (rx - r.x) - 2, 80);
    const rows = this.shown();
    this.sel = Math.min(this.sel, Math.max(0, rows.length - 1));
    if (rows[this.sel]?.row.head) this.sel = this.step(rows, this.sel, 1);
    // a big interface scale leaves few lines: the help at the bottom goes first, the settings stay
    const helpH = r.h - (top - r.y) >= 14 ? 5 : 1;
    const room = Math.max(1, r.y + r.h - top - helpH);
    // keep the selected row in view only when the selection moves (else the wheel couldn't scroll away)
    if (this.sel !== this.shownSel) {
      if (this.sel < this.scroll) this.scroll = Math.max(0, this.sel - (rows[this.sel - 1]?.row.head ? 1 : 0));
      if (this.sel >= this.scroll + room) this.scroll = this.sel - room + 1;
      this.shownSel = this.sel;
    }
    this.scroll = this.glide.follow(ui, this.scroll, rows.length - room);
    ui.hit({ x: rx, y: top, w: rw, h: room }, { onWheel: (d) => this.glide.push(d) });
    if (!rows.length) ui.text(rx + 2, top, t("nothing matches — esc clears the search"), { fg: c.muted });
    let hoverRow: Row | undefined;

    // One sheet, the same on every row:
    //   ▎ label ……………………………………………  value  ›  ↺
    // the label on the left, the value against the right edge (everything ends in the
    // same column), the controls only on the row you're on (or under the mouse):
    //   choice ‹ English ›   box [■]   text netrunner ✎   action edit ›   slider ━━━━╸── 80%
    // (every value, box and slider ends in column ve; the hint after it — › ✎ — in column vx)
    // ▎ on the left = changed from the default; ↺ (on the row you're on) puts it back.
    const re = rx + rw - 1;
    const vx = re - 2; // where every control ends
    const ve = vx - 2; // where every value ends
    const sliderW = Math.max(14, Math.min(26, Math.floor(rw * 0.34)));

    rows.slice(this.scroll, this.scroll + room).forEach(({ row, from }, k) => {
      const i = this.scroll + k;
      const y = top + k;
      const kind = kindOf(row);
      if (kind === "head") {
        // a heading inside the category (KEYS: with the names of the two columns)
        const name = t(row.label).toUpperCase();
        const hx = ui.text(rx + 2, y, name, { fg: c.title, attrs: BOLD });
        ui.hline(hx + 1, y, Math.max(0, re - hx - 1), { fg: mix(c.subtle, c.bg, 0.5) }, "─");
        if (from === "KEYS") {
          ui.textRight(vx - 4, y, ` ${t("keys")} `, { fg: c.subtle });
          ui.text(vx - 2, y, " ≡ ", { fg: c.subtle, attrs: BOLD });
        }
        return;
      }
      const selected = i === this.sel && (this.pane === "rows" || !!this.query);
      const line = { x: rx, y, w: rw, h: 1 };
      // the chosen row's long label scrolls by itself (ui.marqueeZone)
      ui.marqueeZone = selected && focused ? line : null;
      const hovered = ui.hovered(line);
      const hot = (selected && focused) || hovered;
      const bg = selected && focused ? mix(c.accent, c.bg, 0.84) : hovered ? c.highlight : undefined;
      if (bg !== undefined) ui.fill(line, { bg });
      const st = bg !== undefined ? { bg } : {};
      if (hovered) hoverRow = row;
      const changed = this.resettable(row) && !this.rowDefault(row);
      const disabled = row.disabled?.() ?? false;
      if (changed) ui.text(rx, y, "▎", { fg: c.accent, ...st });

      // the value first (so the label knows how much room is left)
      const raw = row.value();
      const v = kind === "keys" || kind === "slider" || kind === "toggle" ? "" : truncate(t(raw), Math.max(6, Math.floor(rw * 0.42)));
      const vw = kind === "slider" ? sliderW : kind === "toggle" ? 3 : kind === "keys" ? Math.min(22, Math.floor(rw * 0.4)) : strWidth(v) + 2;
      const labelRoom = Math.max(6, vx - vw - (rx + 2) - 2);
      const label = row.keys?.remove ? row.label : t(row.label); // yours: the command as you wrote it
      const lend = ui.text(rx + 2, y, label, { fg: selected ? c.fg : kind === "keys" && !row.keys?.editCombo ? c.subtle : disabled ? c.subtle : c.muted, attrs: selected ? BOLD : 0, ...st }, labelRoom);
      if (this.query) ui.text(lend + 2, y, t(from).toLowerCase(), { fg: c.faint, ...st }, Math.max(0, vx - vw - lend - 4));

      const pick = () => ((this.sel = i), (this.pane = "rows"));
      const act = (dir: 1 | -1 = 1) => (pick(), void row.change?.(dir));
      const tip = row.cmd?.();
      // the whole line: choose it; a box ticks, text and actions open, at once
      ui.hit(line, { onClick: () => (kind === "toggle" || kind === "text" || kind === "action" ? act() : pick()), tip });

      const valFg = disabled ? c.faint : from === "DANGER ZONE" ? c.error : kind === "info" ? c.subtle : kind === "text" ? c.fg : c.accent;
      if (kind === "slider") {
        const sl = row.slider!;
        slider(ui, { x: ve - sliderW + 1, y, w: sliderW, h: 1 }, sl.get(), sl.min, sl.max, (nv) => (pick(), sl.set(nv)), {
          zeroIsOff: sl.zeroIsOff,
          show: sl.show,
          step: sl.step,
          disabled,
          tip: t("drag, click, wheel · ←→ by 5 · double-click the number to type it"),
          onEdit: () => void askNumber(this.deck, t(row.label), sl.get(), sl.min, sl.max, sl.zeroIsOff).then((nv) => nv !== null && sl.set(nv)),
        });
      } else if (kind === "toggle") {
        const on = raw === "on";
        ui.text(ve - 2, y, "[", { fg: hot ? c.fg : c.subtle, ...st });
        ui.text(ve - 1, y, on ? "■" : " ", { fg: c.accent, attrs: BOLD, ...st });
        ui.text(ve, y, "]", { fg: hot ? c.fg : c.subtle, ...st });
      } else if (kind === "keys") {
        this.drawKeys(ui, row, y, { vx, selected: selected && focused, hot, st, pick });
      } else {
        const vxStart = ve - strWidth(v) + 1;
        ui.text(vxStart, y, v, { fg: valFg, attrs: selected ? BOLD : 0, ...st });
        if (kind === "choice") {
          // ‹ value ›: the arrows only on the row you're on
          const arrow = (x: number, ch: string, dir: 1 | -1) => {
            const ar = { x: x - 1, y, w: 2, h: 1 };
            if (hot) ui.text(x, y, ch, { fg: ui.hovered(ar) ? c.fg : c.accent, attrs: BOLD, ...st });
            ui.hit(ar, { onClick: () => act(dir) });
          };
          ui.hit({ x: vxStart, y, w: strWidth(v), h: 1 }, { onClick: () => act(1), tip });
          arrow(vxStart - 2, "‹", -1);
          arrow(vx, "›", 1);
        } else if (hot && kind === "text") ui.text(vx, y, "✎", { fg: c.accent, ...st });
        else if (hot && kind === "action") ui.text(vx, y, "›", { fg: c.accent, attrs: BOLD, ...st });
      }
      // ↺: back to the default, on the row you're on
      if (changed && hot) {
        const ur = { x: re, y, w: 1, h: 1 };
        ui.text(re, y, "↺", { fg: ui.hovered(ur) ? c.warning : c.subtle, attrs: BOLD, ...st });
        ui.hit(ur, { onClick: () => void this.resetOne(row), tip: `${t("back to the default")} · del` });
      }
    });
    if (rows.length > room) ui.text(re, this.scroll + room < rows.length ? top + room - 1 : top, this.scroll + room < rows.length ? "↓" : "↑", { fg: c.accent, attrs: BOLD });

    // at the bottom: what the row does (the one under the mouse, else the chosen one),
    // and the category's "everything back to default" on the right
    const cur = hoverRow ?? rows[this.sel]?.row;
    const help = cur ? SETTINGS_HELP[cur.key ?? cur.label] : undefined;
    const fr = this.deck.settings.data.user.language === "fr";
    const by = r.y + r.h - 1;
    let helpRoom = rw - 2;
    const sec = secs[this.cat];
    if (!this.query && sec && sec.group !== "DANGER" && sec.rows.some((x) => this.resettable(x))) {
      const nChanged = sec.rows.filter((x) => this.resettable(x) && !this.rowDefault(x)).length;
      if (nChanged) {
        const label = `↺ ${t("all back to default")}`;
        const bx = re - strWidth(label) - 1;
        ui.button(bx, by, label, () => void this.resetSection(sec.name, sec.rows), { tip: `${t("everything in {cat} back to default", { cat: t(sec.name) })} (${nChanged}) · shift+del`, accent: c.warning });
      }
    }
    if (help && helpH > 1) {
      helpRoom = rw - 2;
      const words = help[fr ? 1 : 0].split(" ");
      const lines: string[] = [];
      let line = "";
      for (const w of words) {
        if (strWidth(`${line} ${w}`) > helpRoom && line) (lines.push(line), (line = w));
        else line = line ? `${line} ${w}` : w;
      }
      lines.push(line);
      ui.hline(rx, by - 4, rw, { fg: mix(c.subtle, c.bg, 0.5) }, "┄");
      lines.slice(0, 3).forEach((l, j) => ui.text(rx + 2, by - 3 + j, l, { fg: c.muted }, helpRoom));
    }
  }

  /** A shortcut row: its keys and its key on THE MENU (≡); × for yours. */
  private drawKeys(ui: UI, row: Row, y: number, o: { vx: number; selected: boolean; hot: boolean; st: { bg?: ReturnType<typeof mix> }; pick: () => void }): void {
    const c = ui.c;
    const k = row.keys!;
    const cell = (xEnd: number, w: number, text: string, on: boolean, edit: (() => void) | undefined, tip: string, fg: typeof c.fg) => {
      const r = { x: xEnd - w + 1, y, w, h: 1 };
      const hov = !!edit && ui.hovered(r);
      const bg = on ? mix(c.accent, c.bg, 0.6) : hov ? mix(c.accent, c.bg, 0.8) : o.st.bg;
      if (bg !== undefined && bg !== o.st.bg) ui.fill(r, { bg });
      // a key is drawn as a key (the menu's letter), the "+" placeholder isn't
      ui.textRight(xEnd + 1, y, truncate(text, w), { fg: on ? c.fg : fg, attrs: edit ? BOLD : 0, key: !!text.trim() && text !== "+", ...(bg !== undefined ? { bg } : {}) });
      if (edit) ui.hit(r, { onClick: () => (o.pick(), edit()), tip });
    };
    const combo = k.combo();
    // the keys: every combination drawn as a key of its own, right-aligned in one column
    // ("⌘⇧T  ⌘B"), the same on every row — never left to guess which text is a key
    const xEnd = o.vx - 4, w = 18;
    const on = o.selected && this.keyCell === 0;
    const r = { x: xEnd - w + 1, y, w, h: 1 };
    const hov = !!k.editCombo && ui.hovered(r);
    if (on || hov) ui.fill(r, { bg: on ? mix(c.accent, c.bg, 0.6) : mix(c.accent, c.bg, 0.8) });
    if (combo) {
      const parts = displayKeys(combo).split(" · ").filter(Boolean);
      let x = xEnd + 1;
      for (let i = parts.length - 1; i >= 0; i--) {
        const part = truncate(parts[i], w);
        x -= strWidth(part);
        if (x < r.x) break;
        ui.text(x, y, part, { fg: c.fg, attrs: BOLD, key: true });
        x -= 1;
      }
    } else ui.textRight(xEnd + 1, y, t("off"), { fg: c.subtle, raw: true, ...o.st });
    if (k.editCombo) ui.hit(r, { onClick: () => (o.pick(), k.editCombo!()), tip: t("click (or enter): press the new keys") });
    if (k.menuKey) {
      const lead = k.menuKey();
      cell(o.vx, 3, lead || (o.hot ? "+" : ""), o.selected && this.keyCell === 1, k.editMenuKey, t("its key on THE MENU (⌘K, this key, enter) · click to change"), lead ? c.accent : c.faint);
    } else if (k.remove && o.hot) {
      const xr = { x: o.vx - 1, y, w: 2, h: 1 };
      ui.text(o.vx, y, "×", { fg: ui.hovered(xr) ? c.error : c.subtle, attrs: BOLD, ...o.st });
      ui.hit(xr, { onClick: () => k.remove!(), tip: t("remove this shortcut · del") });
    }
  }
}

export const settingsSpec: AppSpec = {
  kind: "settings",
  title: "Settings",
  description: "theme, effects, AI, you",
  icon: "⚙",
  launcher: true,
  create: (deck) => new SettingsApp(deck),
};
