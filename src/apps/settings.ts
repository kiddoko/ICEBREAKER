import { t } from "../core/i18n";
import { q } from "../ui/ui";
import { BOLD, type Rect } from "../core/grid";
import type { Action, KeyInput } from "../core/input";
import { mix } from "../core/color";
import type { Deck } from "../deck";
import { ListView } from "../ui/list";
import type { UI } from "../ui/ui";
import type { App, AppSpec } from "./types";

interface Row {
  section?: string;
  /** the settings key (search, and the command shown under the list) */
  key?: string;
  label: string;
  value: () => string;
  /** dir: +1 = next / confirm, -1 = previous */
  change?: (dir: 1 | -1) => void | Promise<void>;
  /** The shell command for one click (next value). */
  cmd?: () => string;
}

/**
 * Settings screen for people who'd rather not type `config set …`.
 * ←/→ (or click, or A) change a value; text values open an input box.
 */
export class SettingsApp implements App {
  readonly kind = "settings";
  readonly key = "settings";
  private list = new ListView<Row>();

  constructor(private readonly deck: Deck) {
    this.list.items = this.rows();
    this.list.onActivate = (row) => void row.change?.(1);
    this.list.select(1);
  }

  title(): string {
    return "settings";
  }

  status(): string {
    return t("type to search · ↑↓ choose · ←→ / enter change · tab categories ⇄ settings · every setting: `config set`");
  }

  private rows(): Row[] {
    const d = this.deck;
    const s = d.settings;
    const set = (key: string, v: unknown) => {
      s.set(key, v);
      d.applySettings(key);
    };
    const toggle = (key: string, label: string, section?: string): Row => ({
      section,
      key,
      label,
      cmd: () => `config set ${key} ${!s.get(key)}`,
      value: () => (s.get(key) ? "on" : "off"),
      change: () => set(key, !s.get(key)),
    });
    const cycle = <T,>(key: string, label: string, options: T[], section?: string, show: (v: T) => string = String): Row => ({
      section,
      key,
      label,
      cmd: () => {
        const i = options.indexOf(s.get(key) as T);
        return `config set ${key} ${q(String(options[(i + 1) % options.length]))}`;
      },
      value: () => show(s.get(key) as T),
      change: (dir) => {
        const i = options.indexOf(s.get(key) as T);
        set(key, options[(i + dir + options.length) % options.length]);
      },
    });
    const text = (key: string, label: string, section?: string, placeholder = ""): Row => ({
      section,
      key,
      label,
      cmd: () => `config set ${key} ${q(String(s.get(key) ?? ""))}`,
      value: () => String(s.get(key) || "—"),
      change: async () => {
        const v = await d.prompt(label, { initial: String(s.get(key) ?? ""), placeholder });
        if (v !== null) set(key, v);
      },
    });

    return [
      { section: "YOU", label: "", value: () => "" },
      cycle("user.language", "language", ["en", "fr"], undefined, (v) => (v === "fr" ? "Français" : "English")),
      text("user.handle", "handle"),
      cycle("user.gender", "gender (optional)", ["", "woman", "man", "nonbinary", "other"], undefined, (v) => v || "not specified"),
      text("user.genderOther", "your word (with other)"),
      text("user.locale", "date language", undefined, "fr-FR, en-US… (empty = system)"),
      { section: "APPEARANCE", label: "", value: () => "" },
      cycle("appearance.theme", "theme", d.themes.list().map((t) => t.name)),
      cycle("appearance.scale", "interface scale", [25, 50, 75, 80, 90, 100, 110, 125, 150, 175, 200], undefined, (v) => `${v}%`),
      cycle("appearance.fontSize", "text size at 100%", [10, 11, 12, 13, 14, 15, 16, 18, 20], undefined, (v) => `${v}px`),
      cycle("appearance.fontWeight", "font weight", ["thin", "light", "regular"]),
      toggle("appearance.startFullscreen", "start fullscreen"),
      cycle("appearance.maxFps", "fps cap", [30, 60, 120, 0], undefined, (v) => (v ? `${v}` : "unlimited")),
      toggle("appearance.showFps", "show fps"),
      toggle("appearance.lineNumbers", "line numbers"),
      toggle("appearance.backgroundSlow", "slow down in the background (energy)"),
      cycle("home.clockStyle", "clock face", ["dots", "segment", "analog", "binary", "minimal"]),
      toggle("home.clockSeconds", "clock seconds"),
      { section: "EFFECTS", label: "", value: () => "" },
      toggle("fx.bloom", "bloom glow"),
      toggle("fx.scanlines", "scanlines"),
      toggle("fx.vignette", "vignette"),
      toggle("fx.ambient", "animated background"),
      toggle("fx.flicker", "crt flicker"),
      toggle("fx.glitch", "animations (glitch, page & typing motion)"),
      cycle("fx.levels.bloom", "bloom strength", [25, 50, 75, 100, 125, 150, 200], undefined, (v) => `${v}%`),
      cycle("fx.levels.scanlines", "scanlines strength", [25, 50, 75, 100, 125, 150, 200], undefined, (v) => `${v}%`),
      cycle("fx.levels.vignette", "vignette strength", [25, 50, 75, 100, 125, 150, 200], undefined, (v) => `${v}%`),
      cycle("fx.levels.chroma", "colour fringes (CRT)", [0, 15, 30, 50, 75, 100], undefined, (v) => (v ? `${v}%` : t("off"))),
      cycle("fx.levels.softness", "softness (CRT focus)", [0, 20, 40, 60, 80, 100], undefined, (v) => (v ? `${v}%` : t("sharp"))),
      cycle("fx.screensaverMinutes", "screensaver after", [0, 5, 10, 20, 30], undefined, (v) => (v ? `${v} min` : "never")),
      cycle("boot.mode", "boot sequence", ["full", "fast", "off"]),
      { section: "SOUND", label: "", value: () => "" },
      toggle("sound.enabled", "ui sounds"),
      cycle("sound.volume", "volume", [10, 25, 50, 75, 100], undefined, (v) => `${v}%`),
      cycle("notifications.mode", "notifications", ["both", "sound", "visual", "none"], undefined, (v) => t(({ both: "sound + screen", sound: "sound only", visual: "screen only", none: "off" } as Record<string, string>)[String(v)] ?? String(v))),
      {
        label: "presets: minimal / max / potato",
        value: () => "open",
        change: () => d.workspace.fxPanel(),
      },
      { section: "VOICE", label: "", value: () => "" },
      toggle("voice.enabled", "voice"),
      toggle("voice.readAI", "read LINK's answers aloud"),
      toggle("voice.greet", "greeting at start-up"),
      cycle("voice.robot", "robot filter", [0, 25, 40, 55, 70, 85, 100], undefined, (v) => `${v}%`),
      cycle("voice.rate", "speed", [0.8, 0.9, 1, 1.1, 1.25, 1.5]),
      cycle("voice.volume", "voice volume", [25, 50, 65, 80, 100], undefined, (v) => `${v}%`),
      cycle("voice.language", "voice language", ["en", "fr", "ja"], undefined, (v) => (v === "fr" ? "Français" : v === "ja" ? "日本語" : "English")),
      cycle("voice.engine", "engine", ["auto", "piper", "system"], undefined, (v) => (v === "auto" ? "auto (piper if installed)" : v)),
      { label: "download the neural voice", value: () => (s.data.voice.language === "ja" ? "system voice" : "voice install"), change: () => void d.act("voice install") },
      { label: "test", value: () => "voice test", change: () => void d.act("voice test") },
      { section: "PRIVACY", label: "", value: () => "" },
      toggle("privacy.stealth", "stealth: 100 % local, no internet"),
      { section: "UPLINK (AI)", label: "", value: () => "" },
      cycle("ai.provider", "provider", ["claude-code", "anthropic", "ollama"], undefined, (v) => (v === "claude-code" ? "claude code (subscription)" : v === "anthropic" ? "anthropic api (tokens)" : "ollama (local)")),
      text("ai.claudeCodeModel", "claude code model", undefined, "sonnet, opus… (empty = default)"),
      toggle("ai.allowWrites", "AI can write notes (vault only)"),
      cycle("shell.mode", "shell panel", ["system", "ibsh"], undefined, (v) => (v === "system" ? "my terminal + ICEBREAKER" : "ibsh only")),
      text("ai.model", "api model", undefined, "claude-opus-5-5"),
      cycle("ai.effort", "claude effort", ["low", "medium", "high", "xhigh", "max"]),
      {
        label: "anthropic api key",
        value: () => (s.secrets.anthropicApiKey ? `sk-…${s.secrets.anthropicApiKey.slice(-4)}` : d.ai.envKey ? "from env" : "not set"),
        change: () => void d.shell.runLine("config key"),
      },
      text("ai.ollamaHost", "ollama host", undefined, "http://localhost:11434"),
      text("ai.ollamaModel", "ollama model", undefined, "llama3.1"),
      toggle("ai.saveChats", "save chats to vault"),
      { section: "KEYS", label: "", value: () => "" },
      { label: "every shortcut (searchable)", value: () => "ctrl+/", cmd: () => "shortcuts", change: () => void d.openApp("shortcuts") },
      { label: "your own shortcuts", value: () => String(Object.keys(s.data.keys ?? {}).length), cmd: () => "bind", change: () => void d.openApp("shortcuts") },
      { section: "MODULES", label: "", value: () => "" },
      { label: "modules on", value: () => `${d.plugins.active().length} / ${d.plugins.list().length}`, cmd: () => "modules", change: () => void d.openApp("modules") },
      { label: "store", value: () => "open", cmd: () => "store", change: () => void d.act("store") },
      { label: "what modules expose to each other", value: () => String(d.services.list().length), cmd: () => "modules api", change: () => void d.act("modules api") },
      { section: "VAULT", label: "", value: () => "" },
      text("journal.folder", "journal folder"),
      toggle("editor.autosave", "autosave notes"),
      {
        label: "vault folder",
        value: () => d.vault.root,
        change: async () => {
          const p = await d.prompt("Mount another folder as vault (absolute path)", { initial: d.vault.root });
          if (p) await d.mountVault(p);
        },
      },
      { section: "DANGER ZONE", label: "", value: () => "" },
      { label: "self-destruct the vault (asks 4 times)", value: () => "☢", cmd: () => "self-destruct", change: () => void d.act("self-destruct") },
    ];
  }

  /** the categories, in order, with their rows */
  private sections(): { name: string; rows: Row[] }[] {
    const out: { name: string; rows: Row[] }[] = [];
    for (const r of this.list.items) {
      if (!r.label && r.section) out.push({ name: r.section, rows: [] });
      else if (out.length) out[out.length - 1].rows.push(r);
    }
    return out;
  }
  private cat = 0;
  private sel = 0;
  private pane: "cats" | "rows" = "cats";
  private query = "";
  private scroll = 0;

  /** what the right side shows: the category, or the search results across all of them */
  private shown(): { row: Row; from: string }[] {
    const secs = this.sections();
    const q = this.query.toLowerCase().trim();
    if (!q) return (secs[this.cat]?.rows ?? []).map((row) => ({ row, from: secs[this.cat].name }));
    return secs.flatMap((sec) =>
      sec.rows
        .filter((row) => `${row.label} ${t(row.label)} ${row.key ?? ""} ${sec.name} ${t(sec.name)} ${row.value()}`.toLowerCase().includes(q))
        .map((row) => ({ row, from: sec.name })),
    );
  }

  onText(ch: string): boolean {
    if (ch === "\n") return false;
    this.query += ch;
    this.sel = 0;
    this.pane = "rows";
    return true;
  }

  onKey(k: KeyInput): boolean {
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
    if (a === "up") return (this.sel = rows.length ? (this.sel - 1 + rows.length) % rows.length : 0), true;
    if (a === "down" || a === "item-next") return (this.sel = rows.length ? (this.sel + 1) % rows.length : 0), true;
    if (a === "left" && !this.query && (!row?.change || this.sel < 0)) return (this.pane = "cats"), true;
    if ((a === "left" || a === "right") && row?.change) return void row.change(a === "left" ? -1 : 1), true;
    if (a === "confirm" && row?.change) return void row.change(1), true;
    if (a === "back" && !this.query) return (this.pane = "cats"), true;
    return false;
  }

  render(ui: UI, r: Rect, focused: boolean): void {
    const c = ui.c;
    const secs = this.sections();
    this.cat = Math.min(this.cat, secs.length - 1);
    // the search field
    const sy = r.y + 1;
    const sw = Math.min(r.w - 4, 100);
    const sx = r.x + 2;
    ui.fill({ x: sx, y: sy, w: sw, h: 1 }, { bg: c.highlight });
    ui.text(sx + 1, sy, "⌕", { fg: c.accent, bg: c.highlight });
    ui.text(sx + 3, sy, this.query || t("type to search every setting…"), { fg: this.query ? c.fg : c.muted, bg: c.highlight }, sw - 4);
    if (focused && this.query) ui.cursor(sx + 3 + this.query.length, sy);

    // left: the categories
    const top = sy + 2;
    const catW = Math.min(24, Math.floor(r.w * 0.28));
    secs.forEach((sec, i) => {
      const y = top + i;
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
    const rx = sx + catW + 3, rw = Math.min(r.w - (rx - r.x) - 2, 86);
    const rows = this.shown();
    this.sel = Math.min(this.sel, Math.max(0, rows.length - 1));
    const room = r.y + r.h - top - 3;
    if (this.sel < this.scroll) this.scroll = this.sel;
    if (this.sel >= this.scroll + room) this.scroll = this.sel - room + 1;
    this.scroll = Math.max(0, Math.min(this.scroll, Math.max(0, rows.length - room)));
    ui.hit({ x: rx, y: top, w: rw, h: room }, { onWheel: (d) => (this.scroll = Math.max(0, Math.min(Math.max(0, rows.length - room), this.scroll + d))) });
    if (!rows.length) ui.text(rx, top, t("nothing matches — esc clears the search"), { fg: c.muted });
    rows.slice(this.scroll, this.scroll + room).forEach(({ row, from }, k) => {
      const i = this.scroll + k;
      const y = top + k;
      const selected = i === this.sel && (this.pane === "rows" || !!this.query);
      const line = { x: rx, y, w: rw, h: 1 };
      const bg = selected && focused ? mix(c.accent, c.bg, 0.82) : ui.hovered(line) ? c.highlight : undefined;
      if (bg !== undefined) ui.fill(line, { bg });
      const st = bg !== undefined ? { bg } : {};
      const label = this.query ? `${t(row.label)}  ` : t(row.label);
      const lx = ui.text(rx + 1, y, label, { fg: selected ? c.fg : c.muted, ...st }, rw - 24);
      if (this.query) ui.text(lx, y, t(from).toLowerCase(), { fg: c.faint, ...st }, rw - (lx - rx) - 24);
      const raw = row.value();
      const v = t(raw);
      const vx = rx + rw - 1;
      const shownV = selected && row.change ? `◂ ${v} ▸` : v;
      const color = raw === "on" ? c.success : raw === "off" ? c.subtle : from === "DANGER ZONE" ? c.error : c.accent;
      ui.textRight(vx, y, shownV, { fg: color, attrs: selected ? BOLD : 0, ...st });
      ui.hit(line, { onClick: () => ((this.sel = i), (this.pane = "rows")), onDouble: () => void row.change?.(1), tip: row.cmd?.() });
      const cmd = row.cmd?.();
      if (row.change) ui.hit({ x: vx - shownV.length, y, w: shownV.length, h: 1 }, cmd ? { cmd, tip: "←→ / enter change it too" } : { onClick: () => void row.change?.(1) });
    });

    // the command that does the same, so the shell is never far
    const cur = rows[this.sel]?.row;
    const cmd = cur?.cmd?.() ?? (cur?.key ? `config get ${cur.key}` : "");
    if (cmd) ui.text(rx, r.y + r.h - 2, `› ${cmd}`, { fg: c.subtle }, rw);
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
