import { Glide } from "../ui/glide";
import { WheelSpin } from "../ui/wheelspin";
import { FilterBar } from "../ui/filterbar";
import { checkbox, choice } from "../ui/controls";
import { t, uiCase } from "../core/i18n";
import { osKeys } from "../core/keyhints";
import { SETTINGS_HELP } from "./settings-help";
import { checkNeural } from "./settings-rows";
import { strWidth, truncate, wrapWords } from "../core/unicode";
import { askNumber, slider } from "../ui/slider";
import { BOLD, type Rect } from "../core/grid";
import type { Action, KeyInput } from "../core/input";
import { mix } from "../core/color";
import { GAP } from "../ui/layout";
import { displayKeys } from "../core/shortcuts";
import { defaultOf, kindOf, resetRow, rowIsDefault, rowResettable, type SettingRow as Row } from "../core/prefs";
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

  /**
   * Open at a category: its name or a module's ("weather", "◇ todo", "privacy"). False: none
   * matches (the first category stays).
   */
  goTo(name: string): boolean {
    this.secs = this.deck.prefs.sections();
    const want = name.trim().toLowerCase();
    const plain = (s: string) => s.replace(/^◇\s*/, "").toLowerCase();
    let i = this.secs.findIndex((s) => plain(s.name) === want);
    if (i < 0) i = this.secs.findIndex((s) => plain(s.name).startsWith(want));
    if (i < 0) return false;
    this.cat = i;
    this.sel = 0;
    this.pane = "rows";
    this.search.clear();
    this.deck.requestFrame();
    return true;
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
  /** type anywhere: it searches every setting (ui/field.ts) */
  private readonly search = new FilterBar({ always: true, colours: false, onChange: () => ((this.sel = 0), (this.pane = "rows")) });
  private get query(): string {
    return this.search.query;
  }
  private scroll = 0;
  /** the wheel's glide (ui/glide.ts) */
  private readonly glide = new Glide();
  /** the selection the view last followed */
  private shownSel = -1;
  /**
   * The wheel and the trackpad move the row you're on (and over the categories, the category),
   * like ↑↓: a mouse notch one row, a two-finger swipe a row every few lines (ui/wheelspin.ts).
   * A category that fits on the screen has nothing to scroll: the wheel did nothing there.
   */
  private readonly rowSpin = new WheelSpin(2);

  /** the wheel over the rows (or the categories): `lines` → rows, stopping at both ends */
  private wheel(lines: number, onCats: boolean): void {
    const steps = this.rowSpin.wheel(lines);
    if (!steps) return;
    const dir = Math.sign(steps) as 1 | -1;
    // the row under a mouse that stays still no longer counts (like ↑↓)
    this.mouseStill = this.mouseAt;
    this.hoverRow = undefined;
    if (onCats && !this.query) {
      const n = this.sections().length;
      const cat = Math.max(0, Math.min(n - 1, this.cat + steps));
      if (cat !== this.cat) (this.cat = cat), (this.sel = 0), this.deck.sound.play("move");
      this.pane = "cats";
      return;
    }
    const rows = this.shown();
    this.pane = "rows";
    for (let n = Math.abs(steps); n > 0; n--) {
      const next = this.step(rows, this.sel, dir);
      // no going round: the last row stays the last
      if ((dir > 0 && next <= this.sel) || (dir < 0 && next >= this.sel)) break;
      this.sel = next;
      this.deck.sound.play("move");
    }
  }

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
        // its name in both languages, its key, its section, its value — and what it does, in both
        // languages ("barre" found nothing: the word was only in its French explanation)
        .filter((row) => visible(row) && !row.head && `${row.label} ${t(row.label)} ${row.key ?? ""} ${sec.name} ${t(sec.name)} ${row.value()} ${(SETTINGS_HELP[row.key ?? row.label] ?? []).join(" ")}`.toLowerCase().includes(q))
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
    if (sec) void this.resetSection(sec.name, sec.rows);
  }

  private async resetSection(name: string, rows: Row[]): Promise<void> {
    const changed = rows.filter((r) => this.resettable(r) && !this.rowDefault(r));
    if (!changed.length) return this.deck.notify(t("everything here is already at its default"));
    if (!(await this.deck.confirm(t("Everything in {cat} back to default?", { cat: t(name) }), t("{n} settings change back: {list}", { n: changed.length, list: changed.map((r) => t(r.label)).slice(0, 6).join(", ") })))) return;
    for (const r of changed) resetRow(this.deck, r);
    this.deck.notify(t("{cat}: back to default", { cat: t(name) }), "success");
  }

  onText(ch: string): boolean {
    // space, when nothing is being searched, acts on the row you're on (the one under the
    // mouse, else the one selected) and never types: a box ticks, a ‹ choice › goes to the
    // next value, a slider goes to its rest and back (0 = mute / unmute; no 0: its default)
    if (ch === " " && !this.query) {
      const row = this.spaceRow();
      const kind = row ? kindOf(row) : undefined;
      if (!row || row.disabled?.()) return true;
      if (kind === "toggle" || kind === "choice") void row.change?.(1);
      else if (kind === "slider") this.flipSlider(row);
      return true;
    }
    return this.search.onText(ch);
  }
  /** the row under the mouse (last frame), unless the keys moved the selection since the mouse last moved */
  private hoverRow: Row | undefined;
  /** where the mouse was when ↑↓ last moved the selection: hovering counts again once it moves */
  private mouseStill = "";
  private mouseAt = "";
  /** the row space acts on */
  private spaceRow(): Row | undefined {
    return this.hoverRow ?? (this.pane === "rows" ? this.shown()[this.sel]?.row : undefined);
  }
  /** each slider's last value away from its rest (space: rest ⇄ that value) */
  private readonly lastOn = new Map<string, number>();
  /** space on a slider: to its rest and back — 0 when its range has one (mute / unmute),
   *  else its default (brightness, zoom, text size: back to normal, then to your value) */
  private flipSlider(row: Row): void {
    const sl = row.slider!;
    const id = row.key ?? row.label;
    const def = row.key ? Number(defaultOf(this.deck, row.key)) : NaN;
    const hasZero = sl.min <= 0 && sl.max >= 0;
    const rest = hasZero ? 0 : Number.isFinite(def) ? def : NaN;
    if (!Number.isFinite(rest)) return;
    const v = sl.get();
    if (v !== rest) {
      this.lastOn.set(id, v);
      return sl.set(rest);
    }
    const back = this.lastOn.get(id) ?? (hasZero ? (def > 0 ? def : 100) : undefined);
    if (back !== undefined) sl.set(Math.min(sl.max, Math.max(sl.min, back)));
  }

  /** on a shortcut row: 0 = its keys, 1 = its key on THE MENU */
  private keyCell: 0 | 1 = 0;

  onKey(k: KeyInput): boolean {
    const cur = this.pane === "rows" || this.query ? this.shown()[this.sel]?.row : undefined;
    // del: this row back to its default (one of your shortcuts: removed) · shift+del: the whole category
    if (k.combo === "delete" && cur) return cur.keys?.remove ? cur.keys.remove() : void this.resetOne(cur), true;
    if (k.combo === "shift+delete" && !this.query) return void this.resetCategory(), true;
    if (k.combo === "f2" && cur?.keys?.editCombo) return cur.keys.editCombo(), true;
    if (this.query && k.combo !== "enter" && this.search.onKey(k)) return true;
    if (k.combo === "esc" && this.query) return this.search.clear(), true;
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
    // the keys move the selection: the row under a mouse that stays still no longer counts
    if (a === "up" || a === "down" || a === "item-next") (this.mouseStill = this.mouseAt), (this.hoverRow = undefined);
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
    if (row.disabled?.() && (a === "left" || a === "right" || a === "confirm")) return a !== "left" || ((this.pane = "cats"), true);
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
    // the blinking caret: you can type here
    this.search.render(ui, { x: sx, y: sy, w: sw, h: 1 }, {}, { focused, placeholder: t("type to search every setting…") });

    // left: the categories
    const top = sy + 2;
    const catW = Math.min(24, Math.floor(r.w * 0.28));
    let extra = 0;
    secs.forEach((sec, i) => {
      if (i === 0 || sec.group !== secs[i - 1].group) {
        const hy = top + i + extra + (i ? 1 : 0);
        if (hy < r.y + r.h - 2) ui.text(sx, hy, t(sec.group), { fg: c.subtle, attrs: BOLD });
        extra += i ? 2 : 1;
      }
      const y = top + i + extra;
      if (y >= r.y + r.h - 2) return;
      const line = { x: sx, y, w: catW, h: 1 };
      const on = i === this.cat && !this.query;
      const bg = on ? (focused && this.pane === "cats" ? c.accent : mix(c.accent, c.bg, 0.75)) : ui.hovered(line) ? c.highlight : undefined;
      if (bg !== undefined) ui.fill(line, { bg });
      const name = t(sec.name);
      ui.text(sx + 1, y, `${on ? "▸" : " "} ${name}`, { fg: on && focused && this.pane === "cats" ? c.panel : on ? c.fg : c.muted, attrs: on ? BOLD : 0, ...(bg !== undefined ? { bg } : {}) }, catW - 1);
      ui.hit(line, { onClick: () => ((this.cat = i), this.search.clear(), (this.sel = 0), (this.pane = "rows")), tip: `${sec.rows.length} settings` });
    });
    ui.hit({ x: sx, y: top, w: catW, h: Math.max(1, r.y + r.h - 2 - top) }, { onWheel: (d) => this.wheel(d, true) });
    ui.vline(sx + catW + 1, top, r.y + r.h - top - 2, { fg: c.faint });

    // right: the settings of that category (or the search results)
    const rx = sx + catW + 3;
    // what a setting does goes to the right of its row when the frame is wide enough (the whole
    // text, next to what you're looking at); a narrower frame keeps it under the list
    const avail = r.w - (rx - r.x) - 2;
    const sideW = avail >= SIDE_MIN_ROWS + GAP + SIDE_MIN ? Math.min(SIDE_MAX, Math.max(SIDE_MIN, avail - 62)) : 0;
    const rw = Math.min(sideW ? avail - sideW - GAP - 1 : avail, 80);
    const rows = this.shown();
    this.sel = Math.min(this.sel, Math.max(0, rows.length - 1));
    if (rows[this.sel]?.row.head) this.sel = this.step(rows, this.sel, 1);
    // a big interface scale leaves few lines: the help at the bottom goes first, the settings stay
    // (5 lines of help when there's room: some explanations are long and were cut mid-sentence)
    const helpH = sideW ? 1 : r.h - (top - r.y) >= 18 ? 7 : r.h - (top - r.y) >= 14 ? 5 : 1;
    const room = Math.max(1, r.y + r.h - top - helpH);
    // a line of air under each setting (the empty line before a heading is air already; the
    // long lists of KEYS stay one per line). `at[i]`: the line row i starts on; scroll counts lines.
    const at: number[] = [];
    const total = rows.reduce((line, { row }, i) => ((at[i] = line), line + (row.head && !row.label ? 1 : row.keys ? 1 : 2)), 0) - 1;
    // keep the selected row in view only when the selection moves (else the wheel couldn't scroll away)
    if (this.sel !== this.shownSel && rows.length) {
      const first = rows[this.sel - 1]?.row.head ? at[this.sel - 1] : at[this.sel]; // its heading too
      if (first < this.scroll) this.scroll = Math.max(0, first);
      if (at[this.sel] >= this.scroll + room) this.scroll = at[this.sel] - room + 1;
      this.shownSel = this.sel;
    }
    this.scroll = this.glide.follow(ui, this.scroll, total + 1 - room);
    ui.hit({ x: rx, y: top, w: rw, h: room }, { onWheel: (d) => this.wheel(d, false) });
    if (!rows.length) ui.text(rx + 2, top, t("nothing matches — esc clears the search"), { fg: c.muted });
    let hoverRow: Row | undefined;
    let hoverY = -1, selY = -1;
    // the mouse hasn't moved since ↑↓ chose a row: the row under it isn't "the one you're on"
    this.mouseAt = `${ui.mouse.x},${ui.mouse.y}`;
    if (this.mouseStill && this.mouseStill !== this.mouseAt) this.mouseStill = "";
    const mouseCounts = !this.mouseStill;

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

    rows.forEach(({ row, from }, i) => {
      if (at[i] < this.scroll || at[i] >= this.scroll + room) return; // out of view
      const y = top + at[i] - this.scroll;
      const kind = kindOf(row);
      if (kind === "head") {
        if (!row.label) return; // the empty line above a heading
        // a heading inside the category (KEYS: with the names of the two columns)
        const name = t(row.label).toLowerCase();
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
      const hovered = mouseCounts && ui.hovered(line);
      const hot = (selected && focused) || hovered;
      const bg = selected && focused ? mix(c.accent, c.bg, 0.84) : hovered ? c.highlight : undefined;
      if (bg !== undefined) ui.fill(line, { bg });
      const st = bg !== undefined ? { bg } : {};
      if (hovered) (hoverRow = row), (hoverY = y);
      if (i === this.sel) selY = y;
      const changed = this.resettable(row) && !this.rowDefault(row);
      const disabled = row.disabled?.() ?? false;
      if (changed) ui.text(rx, y, "▎", { fg: c.accent, ...st });

      // the value first (so the label knows how much room is left)
      const raw = row.value();
      const v = kind === "keys" || kind === "slider" || kind === "toggle" ? "" : truncate(t(raw), Math.max(6, Math.floor(rw * 0.42)));
      const vw = kind === "slider" ? sliderW : kind === "toggle" ? 3 : kind === "keys" ? Math.min(22, Math.floor(rw * 0.4)) : strWidth(v) + 2;
      const labelRoom = Math.max(6, vx - vw - (rx + 2) - 2);
      const label = row.keys?.remove ? row.label : t(row.label); // yours: the command as you wrote it
      const lend = ui.text(rx + 2, y, label, { fg: disabled ? c.faint : selected ? c.fg : kind === "keys" && !row.keys?.editCombo ? c.subtle : c.muted, attrs: selected ? BOLD : 0, ...st }, labelRoom);
      if (this.query) ui.text(lend + 2, y, t(from).toLowerCase(), { fg: c.subtle, ...st }, Math.max(0, vx - vw - lend - 4));

      const pick = () => ((this.sel = i), (this.pane = "rows"));
      // greyed (it depends on another setting): chosen, never changed
      const act = (dir: 1 | -1 = 1) => (pick(), disabled ? undefined : void row.change?.(dir));
      const tip = row.cmd?.();
      // the whole line: choose it; a box ticks, text and actions open, at once
      // (with the description at the side, its command is there: no tip on top of it)
      ui.hit(line, { onClick: () => (kind === "toggle" || kind === "text" || kind === "action" ? act() : pick()), tip: sideW ? undefined : tip });

      const valFg = disabled ? c.faint : kind === "info" ? c.subtle : kind === "text" ? c.fg : c.accent;
      if (kind === "slider") {
        const sl = row.slider!;
        slider(ui, { x: ve - sliderW + 1, y, w: sliderW, h: 1 }, sl.get(), sl.min, sl.max, (nv) => (pick(), sl.set(nv)), {
          zeroIsOff: sl.zeroIsOff,
          show: sl.show,
          step: sl.step,
          disabled,
          tip: t("drag the handle · hold on the track · wheel · ←→ (1 at a time, faster when held) · space: 0 and back · double-click the number to type it"),
          onEdit: () => void askNumber(this.deck, t(row.label), sl.get(), sl.min, sl.max, sl.zeroIsOff).then((nv) => nv !== null && sl.set(nv)),
        });
      } else if (kind === "toggle") {
        checkbox(ui, ve - 2, y, raw === "on", { hot: hot && !disabled, bg: st.bg, disabled });
      } else if (kind === "keys") {
        this.drawKeys(ui, row, y, { vx, selected: selected && focused, hot, st, pick });
      } else {
        const vxStart = ve - strWidth(v) + 1;
        // ‹ value ›: the arrows only on the row you're on (ui/controls.ts)
        if (kind === "choice") choice(ui, vxStart, y, v, { arrows: hot && !disabled, onStep: (dir) => act(dir), fg: valFg, attrs: selected ? BOLD : 0, bg: st.bg, tip });
        else ui.text(vxStart, y, v, { fg: valFg, attrs: selected ? BOLD : 0, ...st });
        if (hot && !disabled && kind === "text") ui.text(vx, y, "✎", { fg: c.accent, ...st });
        else if (hot && !disabled && kind === "action") ui.text(vx, y, "›", { fg: c.accent, attrs: BOLD, ...st });
      }
      // ↺: back to the default, on the row you're on
      if (changed && hot) {
        const ur = { x: re, y, w: 1, h: 1 };
        ui.text(re, y, "↺", { fg: ui.hovered(ur) ? c.warning : c.subtle, attrs: BOLD, ...st });
        ui.hit(ur, { onClick: () => void this.resetOne(row), tip: `${t("back to the default")} · del` });
      }
    });
    if (total + 1 > room) ui.text(re, this.scroll + room <= total ? top + room - 1 : top, this.scroll + room <= total ? "↓" : "↑", { fg: c.accent, attrs: BOLD });

    // at the bottom: what the row does (the one under the mouse, else the chosen one),
    // and the category's "everything back to default" on the right
    this.hoverRow = hoverRow;
    const cur = hoverRow ?? rows[this.sel]?.row;
    const help = cur ? SETTINGS_HELP[cur.key ?? cur.label] : undefined;
    const fr = this.deck.settings.data.user.language === "fr";
    const by = r.y + r.h - 1;
    let helpRoom = rw - 2;
    const sec = secs[this.cat];
    if (!this.query && sec && sec.rows.some((x) => this.resettable(x))) {
      const nChanged = sec.rows.filter((x) => this.resettable(x) && !this.rowDefault(x)).length;
      if (nChanged) {
        const label = `↺ ${t("all back to default")}`;
        const bx = re - strWidth(label) - 1;
        ui.button(bx, by, label, () => void this.resetSection(sec.name, sec.rows), { tip: `${t("everything in {cat} back to default", { cat: t(sec.name) })} (${nChanged}) · shift+del`, accent: c.warning });
      }
    }
    if (sideW && cur) this.drawSide(ui, cur, help?.[fr ? 1 : 0], { x: re + GAP + 1, w: sideW, top, bottom: r.y + r.h - 1, rowY: hoverRow ? hoverY : selY, rowEnd: re });
    else if (help && helpH > 1) {
      helpRoom = rw - 2;
      // keys written the Mac way ("⌘K") read the way this keyboard does (Ctrl+K on Windows / Linux)
      const lines = wrapWords(osKeys(uiCase(help[fr ? 1 : 0])), helpRoom);
      const n = helpH - 2;
      ui.hline(rx, by - n - 1, rw, { fg: mix(c.subtle, c.bg, 0.5) }, "┄");
      // what doesn't fit ends with … (never a sentence cut without saying so)
      const shown = lines.slice(0, n);
      if (lines.length > n) shown[n - 1] = `${shown[n - 1].slice(0, Math.max(0, helpRoom - 2))} …`;
      shown.forEach((l, j) => ui.text(rx + 2, by - n + j, l, { fg: c.muted }, helpRoom));
    }
  }

  /**
   * The description beside the list: the row's name, what it does (all of it), its command and
   * its default. It sits level with the row (moved up when it would run off the bottom),
   * a thin line joining them:
   *
   *   ▸ fade in letters ………… [■] ──┐ fade in letters
   *                                 │ letters fade in as they appear…
   *                                 │ ❯ set appearance.fadeIn off
   */
  private drawSide(ui: UI, row: Row, help: string | undefined, o: { x: number; w: number; top: number; bottom: number; rowY: number; rowEnd: number }): void {
    const c = ui.c;
    const inner = o.w - GAP;
    const lines: { s: string; fg: number; attrs?: number }[] = [];
    const label = row.keys?.remove ? row.label : t(row.label);
    for (const l of wrapWords(label, inner)) lines.push({ s: l, fg: c.fg, attrs: BOLD });
    if (help) {
      lines.push({ s: "", fg: c.muted });
      for (const l of wrapWords(osKeys(uiCase(help)), inner)) lines.push({ s: l, fg: c.muted });
    }
    const cmd = row.cmd?.();
    if (cmd) {
      lines.push({ s: "", fg: c.muted });
      for (const l of wrapWords(`❯ ${cmd}`, inner)) lines.push({ s: l, fg: c.accent });
    }
    if (row.key && this.resettable(row)) {
      const def = defaultOf(this.deck, row.key);
      if (def !== undefined && def !== "" && typeof def !== "object") lines.push({ s: t("default: {v}", { v: t(String(def === true ? "on" : def === false ? "off" : def)) }), fg: c.subtle });
    }
    const room = Math.max(1, o.bottom - o.top);
    const shown = lines.slice(0, room);
    if (lines.length > room) shown[room - 1] = { ...shown[room - 1], s: `${truncate(shown[room - 1].s, inner - 2)} …` };
    const rowY = o.rowY >= 0 ? o.rowY : o.top;
    const y0 = Math.max(o.top, Math.min(rowY, o.bottom - shown.length));
    // the thread from the row to its description
    ui.hline(o.rowEnd + 1, rowY, o.x - o.rowEnd - 1, { fg: mix(c.accent, c.bg, 0.55) }, "─");
    ui.vline(o.x, y0, shown.length, { fg: mix(c.accent, c.bg, 0.55) });
    ui.text(o.x, rowY, shown.length === 1 ? "─" : rowY === y0 ? "┐" : rowY === y0 + shown.length - 1 ? "┘" : "┤", { fg: mix(c.accent, c.bg, 0.4) });
    shown.forEach((l, j) => ui.text(o.x + GAP, y0 + j, l.s, { fg: l.fg, attrs: l.attrs ?? 0 }, inner));
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

/** the description beside the list: its width, and the list's least width before it goes under */
const SIDE_MIN = 28;
const SIDE_MAX = 46;
const SIDE_MIN_ROWS = 52;

export const settingsSpec: AppSpec = {
  kind: "settings",
  title: "Settings",
  description: "theme, effects, AI, you",
  icon: "⚙",
  launcher: true,
  create: (deck) => new SettingsApp(deck),
};
