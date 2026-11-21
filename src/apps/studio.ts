import { hex } from "../core/color";
import { BOLD, type Rect } from "../core/grid";
import type { Action, KeyInput } from "../core/input";
import { COLOR_SWATCHES, KNOBS, type Knob } from "../core/tweaks";
import type { Deck } from "../deck";
import { drawBackground } from "../fx/backgrounds";
import { knobValue } from "../shell/commands/deck";
import { ListView } from "../ui/list";
import { q, type UI } from "../ui/ui";
import { ColorPicker } from "../workspace/colorpicker";
import type { App, AppSpec } from "./types";
import { GAP, INSET } from "../ui/layout";
import { truncate } from "../core/unicode";

type Row =
  | { head: string }
  | { knob: Knob }
  | { theme: true }
  | { action: "export" | "reset" | "sounds" | "file" };

const GROUP_TITLES: Record<Knob["group"], string> = {
  colors: "COLORS", type: "TYPE", shape: "SHAPE", background: "BACKGROUND", sound: "SOUND", motion: "MOTION",
};

/**
 * THEME STUDIO: every knob of the current theme, with a live preview. It
 * never edits files: each change is a `theme tweak …` command (echoed in the
 * shell), kept in settings.json. "export" turns it all into a theme file.
 *
 *   ↑↓ choose · ←→ change · enter type a value (a colour: the palette) · r or ↺ reset that knob
 */
export class StudioApp implements App {
  readonly kind = "studio";
  readonly key = "studio";
  private list = new ListView<Row>();

  constructor(private readonly deck: Deck) {
    const rows: Row[] = [{ head: "THEME" }, { theme: true }];
    let group = "";
    for (const k of KNOBS) {
      if (k.group !== group) rows.push({ head: GROUP_TITLES[k.group] });
      group = k.group;
      rows.push({ knob: k });
    }
    rows.push({ head: "DONE?" }, { action: "sounds" }, { action: "export" }, { action: "reset" }, { action: "file" });
    this.list.items = rows;
    this.list.select(1);
    this.list.onActivate = (row) => void this.enter(row);
    this.list.tipOf = (row) => ("knob" in row ? `←→ change · enter ${row.knob.kind === "color" ? "the palette" : "type a value"} · r reset\ntheme tweak ${row.knob.name} <value>` : undefined);
  }

  title(): string {
    return "studio";
  }

  status(): string {
    return "↑↓ choose · ←→ change · enter type a value (colours: the palette) · r or ↺ reset knob · every change is a `theme tweak` command";
  }

  private get tweaks(): Record<string, string | number> {
    return this.deck.settings.data.appearance.tweaks[this.deck.theme.name] ?? {};
  }

  private value(k: Knob): string {
    const t = this.tweaks[k.key];
    return t !== undefined ? String(t) : knobValue(this.deck.theme, k.key);
  }

  /** The command for "next value" (dir +1) or "previous" (-1). */
  private cmdFor(row: Row, dir: 1 | -1): string | undefined {
    if ("theme" in row) {
      const names = this.deck.themes.list().map((t) => t.name);
      const i = names.indexOf(this.deck.settings.data.appearance.theme);
      return `theme set ${names[(i + dir + names.length) % names.length]}`;
    }
    if ("action" in row) return row.action === "reset" ? "theme tweak reset" : row.action === "sounds" ? "sound test" : undefined;
    if (!("knob" in row)) return undefined;
    const k = row.knob;
    const opts = k.kind === "color" ? COLOR_SWATCHES : (k.options?.() ?? []).map(String);
    if (!opts.length) return undefined;
    const cur = this.value(k).toLowerCase();
    let i = opts.findIndex((o) => String(o).toLowerCase() === cur);
    if (i < 0 && k.kind === "number") i = opts.findIndex((o) => Number(o) >= Number(cur)) - (dir > 0 ? 1 : 0);
    const next = opts[(i + dir + opts.length * 2) % opts.length];
    return `theme tweak ${k.name} ${q(String(next))}`;
  }

  private async enter(row: Row): Promise<void> {
    const d = this.deck;
    if ("action" in row) {
      if (row.action === "export") {
        const name = await d.prompt("Save as a new theme", { placeholder: `${d.theme.name}-remix` });
        if (name?.trim()) void d.act(`theme export ${q(name.trim())}`);
      } else if (row.action === "file") void d.act("theme new " + q(`${d.theme.name}-edit`));
      else void d.act(this.cmdFor(row, 1)!);
      return;
    }
    // a colour: the palette (ui: workspace/colorpicker.ts), #hex still typable there
    if ("knob" in row && row.knob.kind === "color") {
      const k = row.knob;
      d.workspace.push(new ColorPicker(d, k.label, this.value(k), (v) => {
        if (v === "reset") void d.act(`theme tweak reset ${k.name}`);
        else if (v && v.toLowerCase() !== this.value(k).toLowerCase()) void d.act(`theme tweak ${k.name} ${q(v)}`);
      }, this.tweaks[k.key] !== undefined));
      d.requestFrame();
      return;
    }
    if ("knob" in row && (row.knob.kind === "text" || row.knob.name === "font")) {
      const v = await d.prompt(`${row.knob.label} (${row.knob.kind === "color" ? "#hex or a palette name" : "value"})`, { initial: this.value(row.knob) });
      if (v?.trim()) void d.act(`theme tweak ${row.knob.name} ${q(v.trim())}`);
      return;
    }
    const c = this.cmdFor(row, 1);
    if (c) void d.act(c);
  }

  onText(t: string): boolean {
    const row = this.list.current;
    if (t === "r" && row && "knob" in row) return void this.deck.act(`theme tweak reset ${row.knob.name}`), true;
    return false;
  }

  onKey(k: KeyInput): boolean {
    const row = this.list.current;
    if (!row) return false;
    if (k.combo === "left" || k.combo === "right") {
      const c = this.cmdFor(row, k.combo === "left" ? -1 : 1);
      if (c) void this.deck.act(c);
      return true;
    }
    return false;
  }

  onAction(a: Action): boolean {
    // ↑↓: the next knob, section titles skipped, no going round from the top to the bottom
    if (a === "up" || a === "down") {
      const items = this.list.items;
      let i = this.list.selected;
      do i += a === "down" ? 1 : -1;
      while (i >= 0 && i < items.length && "head" in items[i]);
      if (i >= 0 && i < items.length) this.list.select(i);
      return true;
    }
    const before = this.list.selected;
    const handled = this.list.onAction(a);
    // skip section titles
    const row = this.list.current;
    if (row && "head" in row) this.list.select(this.list.selected + (this.list.selected >= before ? 1 : -1));
    return handled;
  }

  /** a click on a row's value: that row becomes the one you're on, then it acts (a colour: the palette) */
  private clickValue(row: Row): void {
    this.list.select(this.list.items.indexOf(row));
    if ("knob" in row && row.knob.kind === "color") return void this.enter(row);
    const c = this.cmdFor(row, 1);
    if (c) void this.deck.act(c);
  }

  render(ui: UI, r: Rect, focused: boolean): void {
    const c = ui.c;
    const previewW = r.w >= 96 ? Math.min(46, Math.floor(r.w * 0.42)) : 0;
    const listR = { x: r.x + 2, y: r.y + 1, w: Math.min(64, r.w - previewW - 5), h: r.h - 2 };
    const tw = this.tweaks;
    this.list.render(ui, listR, focused, (row, rect, selected) => {
      if ("head" in row) {
        ui.text(rect.x, rect.y, `── ${row.head} `, { fg: c.accent, attrs: BOLD });
        ui.hline(rect.x + row.head.length + 4, rect.y, rect.w - row.head.length - 5, { fg: c.faint });
        return;
      }
      const label = "theme" in row ? "theme" : "knob" in row ? row.knob.label : { export: "save as a new theme…", reset: "reset all tweaks", sounds: "hear the sounds", file: "open a copy of the file (by hand)" }[row.action];
      // the value on the right gets at most half the row (cut with …), the label what's left of it
      const vx = rect.x + rect.w - 2;
      const fit = (v: string) => truncate(v, Math.max(6, Math.floor(rect.w / 2) - 4));
      const drawLabel = (end: number) => ui.text(rect.x + 2, rect.y, label, { fg: selected ? c.fg : c.muted }, Math.max(0, end - rect.x - INSET * 2 - GAP));
      if ("theme" in row) {
        const v = fit(this.deck.settings.data.appearance.theme);
        const x = ui.textRight(vx, rect.y, selected ? `◂ ${v} ▸` : v, { fg: c.accent, attrs: BOLD });
        drawLabel(x);
        ui.hit({ x, y: rect.y, w: vx - x, h: 1 }, { onClick: () => this.clickValue(row), tip: `←→ change theme\n${this.cmdFor(row, 1)}` });
        return;
      }
      if (!("knob" in row)) {
        drawLabel(ui.textRight(vx, rect.y, selected ? "enter ⏎" : "›", { fg: selected ? c.accent : c.subtle }));
        ui.hit({ x: rect.x, y: rect.y, w: vx - rect.x, h: 1 }, { onClick: () => void this.enter(row) });
        return;
      }
      const k = row.knob;
      const v = fit(this.value(k));
      const tweaked = tw[k.key] !== undefined;
      // ↺ (back to the theme's value) on the row you're on or under the mouse: the value moves over for it
      const undo = tweaked && (selected || ui.hovered(rect));
      let x = ui.textRight(undo ? vx - 2 : vx, rect.y, selected ? `◂ ${v} ▸` : v, { fg: tweaked ? c.warning : c.accent, attrs: selected ? BOLD : 0 });
      const next = this.cmdFor(row, 1);
      if (next) ui.hit({ x, y: rect.y, w: vx - x, h: 1 }, { onClick: () => this.clickValue(row), tip: `${k.kind === "color" ? "click: the palette" : "click: next value"} · ←→ change · r reset\n${next}` });
      if (k.kind === "color" && /^#[0-9a-f]{6}$/i.test(v)) {
        x -= 3;
        const sw = { x, y: rect.y, w: 2, h: 1 };
        ui.text(x, rect.y, "██", { fg: hex(v) });
        // the swatch opens the palette
        ui.hit(sw, { onClick: () => (this.list.select(this.list.items.indexOf(row)), void this.enter(row)), tip: "the palette · enter" });
      }
      drawLabel(x);
      if (tweaked) ui.text(rect.x, rect.y, "•", { fg: c.warning, attrs: BOLD });
      // ↺ back to the theme's value, on the row you're on (or under the mouse) — like Settings
      if (undo) {
        const ur = { x: vx - 1, y: rect.y, w: 1, h: 1 };
        ui.text(ur.x, ur.y, "↺", { fg: ui.hovered(ur) ? c.warning : c.subtle, attrs: BOLD });
        ui.hit(ur, { cmd: `theme tweak reset ${k.name}`, tip: "back to the theme's value · r" });
      }
    });

    if (previewW) this.preview(ui, { x: r.x + r.w - previewW - 2, y: r.y + 1, w: previewW, h: Math.min(r.h - 2, 26) });
  }

  /** A miniature of the deck in the current theme. */
  private preview(ui: UI, r: Rect): void {
    const c = ui.c;
    const t = ui.theme;
    const inner = ui.box(r, { title: "PREVIEW", info: t.name, focused: true });
    // background effect, live
    const bgR = { x: inner.x, y: inner.y, w: inner.w, h: Math.max(3, Math.floor(inner.h * 0.4)) };
    ui.fill(bgR, { bg: c.bg });
    drawBackground(ui, bgR, t, 1);
    ui.textCenter(bgR, bgR.y + Math.floor(bgR.h / 2), ` ${t.background.effect} · ${t.font.family} `, { fg: c.fg, bg: c.bg, attrs: BOLD });
    let y = bgR.y + bgR.h + 1;
    // a small card
    const card = ui.box({ x: inner.x + 1, y, w: inner.w - 2, h: 6 }, { title: "TODO", focused: true });
    ui.text(card.x + 1, card.y, `2 open · 1 urgent`, { fg: c.accent, attrs: BOLD });
    ui.text(card.x + 1, card.y + 1, `${t.glyphs.todo} walk the dog`, { fg: c.fg });
    ui.textRight(card.x + card.w - 1, card.y + 1, "today", { fg: c.warning });
    ui.text(card.x + 1, card.y + 2, `${t.glyphs.done} buy bread`, { fg: c.faint });
    ui.bar(card.x + 1, card.y + 3, card.w - 2, 0.62, c.accent, c.faint);
    y += 7;
    // text styles
    if (y < inner.y + inner.h) ui.text(inner.x + 1, y++, `${t.glyphs.bullet} text  `, { fg: c.fg });
    if (y < inner.y + inner.h) {
      let x = ui.text(inner.x + 1, y, "muted ", { fg: c.muted });
      x = ui.text(x, y, "accent ", { fg: c.accent, attrs: BOLD });
      x = ui.text(x, y, "alt ", { fg: c.accentAlt });
      x = ui.text(x, y, "ok ", { fg: c.success });
      ui.text(x, y, "error", { fg: c.error });
      y++;
    }
    // swatches
    if (y + 1 < inner.y + inner.h) {
      y++;
      [c.bg, c.panel, c.highlight, c.faint, c.subtle, c.muted, c.fg, c.accent, c.accentAlt, c.success, c.warning, c.error].forEach((col, i) =>
        ui.text(inner.x + 1 + i * 3, y, "██", { fg: col }),
      );
      y += 2;
    }
    if (y < inner.y + inner.h) ui.text(inner.x + 1, y, `sounds: ${t.sound.pack} · select: ${t.anim.select}`, { fg: c.subtle }, inner.w - 2);
  }
}

export const studioSpec: AppSpec = {
  kind: "studio",
  title: "Theme studio",
  description: "colors, font, background effect, sounds — live",
  icon: "◐",
  launcher: true,
  create: (deck) => new StudioApp(deck),
};
