import { t } from "../core/i18n";
import { displayKeys, SHORTCUTS } from "../core/shortcuts";
import { SETTINGS_HELP } from "./settings-help";
import { focus } from "../widgets/focusstate";
import { q } from "../ui/ui";
import { strWidth, truncate } from "../core/unicode";
import { slider } from "../ui/slider";
import { fxMax, getFx, setFx, type FxLevel } from "../core/fxlevels";
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
  /** a text value (opens an input box, no ◂ ▸) */
  isText?: boolean;
  /** The shell command for one click (next value). */
  cmd?: () => string;
  /** a real slider instead of a value (drag / click / wheel; ←→ by 5) */
  slider?: { min: number; max: number; get: () => number; set: (v: number) => void; zeroIsOff?: boolean; show?: (v: number) => string };
}

/**
 * Settings screen for people who'd rather not type `config set …`.
 * ←/→ (or click, or A) change a value; text values open an input box.
 */
export class SettingsApp implements App {
  readonly kind = "settings";
  readonly key = "settings";
  private list = new ListView<Row>();

  /** a neural voice for the voice's language is installed (null: don't know yet) */
  private neural: boolean | null = null;
  private async checkNeural(): Promise<void> {
    try {
      const info = await this.deck.platform.voice?.info();
      const lang = this.deck.settings.data.voice.language;
      this.neural = !!info?.piper && info.piper_voices.some((v) => v.includes(`-${lang}_`) || v.includes(`-${lang}-`));
    } catch {
      this.neural = false;
    }
    this.deck.requestFrame();
  }

  constructor(private readonly deck: Deck) {
    void this.checkNeural();
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
    /** a real slider row; ←→ step by 5 */
    const slide = (key: string, label: string, min: number, max: number, get: () => number, put: (v: number) => void, extra: { zeroIsOff?: boolean; show?: (v: number) => string; cmd?: (v: number) => string } = {}): Row => ({
      key,
      label,
      cmd: () => (extra.cmd ? extra.cmd(get()) : `config set ${key} ${get()}`),
      value: () => (extra.show ? extra.show(get()) : extra.zeroIsOff && get() === 0 ? t("off") : `${get()}%`),
      change: (dir) => put(Math.max(min, Math.min(max, Math.round(get() / 5) * 5 + dir * 5))),
      slider: { min, max, get, set: put, zeroIsOff: extra.zeroIsOff, show: extra.show },
    });
    const fxSlide = (e: FxLevel, label: string, show?: (v: number) => string) =>
      slide(`fx.levels.${e}`, label, 0, fxMax(e), () => getFx(d, e), (v) => void setFx(d, e, v), { zeroIsOff: e !== "sharpness", show, cmd: (v) => `fx ${e} ${v}` });
    const num = (key: string) => Number(s.get(key) ?? 0);
    const text = (key: string, label: string, section?: string, placeholder = "", suggestions?: () => string[]): Row => ({
      section,
      key,
      isText: true,
      label,
      cmd: () => `config set ${key} ${q(String(s.get(key) ?? ""))}`,
      value: () => String(s.get(key) || "—"),
      change: async () => {
        const v = await d.prompt(t(label), { initial: String(s.get(key) ?? ""), placeholder, suggestions: suggestions?.() });
        if (v !== null) set(key, v);
      },
    });

    return [
      { section: "YOU", label: "", value: () => "" },
      cycle("user.language", "language", ["en", "fr"], undefined, (v) => (v === "fr" ? "Français" : "English")),
      text("user.handle", "handle"),
      cycle("user.gender", "gender (optional)", ["", "woman", "man", "nonbinary", "other"], undefined, (v) => v || "not specified"),
      text("user.genderOther", "your own word (when gender is other)"),
      {
        key: "user.pronouns",
        label: "pronouns",
        cmd: () => `config set user.pronouns ${q(String(s.get("user.pronouns") ?? ""))}`,
        value: () => String(s.get("user.pronouns") || "not specified"),
        // the usual ones, or your own
        change: async () => {
          const opts = ["", "she/her", "he/him", "they/them", "elle", "il", "iel"];
          const cur = String(s.get("user.pronouns") ?? "");
          const i = await d.choose(t("pronouns"), [...opts.map((o) => ({ label: o || t("not specified") })), { label: t("my own…") }], { selected: Math.max(0, opts.indexOf(cur)) });
          if (i === null) return;
          if (i < opts.length) return set("user.pronouns", opts[i]);
          const v = await d.prompt(t("Your pronouns"), { initial: opts.includes(cur) ? "" : cur, placeholder: "xe/xem", suggestions: ["xe/xem", "ze/hir", "ae/aer", "fae/faer", "any", "ille", "ul", "al"] });
          if (v !== null) set("user.pronouns", v.trim());
        },
      },
      text("user.locale", "date language", undefined, "fr-FR, en-US… (empty = system)", () => ["fr-FR", "fr-CH", "fr-BE", "fr-CA", "en-US", "en-GB", "de-CH", "de-DE", "it-CH", "it-IT", "es-ES", "pt-BR", "ja-JP", "nb-NO"]),
      { section: "APPEARANCE", label: "", value: () => "" },
      cycle("appearance.theme", "theme", d.themes.list().map((t) => t.name)),
      slide("appearance.scale", "interface scale", 50, 200, () => num("appearance.scale"), (v) => set("appearance.scale", v)),
      cycle("appearance.fontSize", "text size at 100%", [10, 11, 12, 13, 14, 15, 16, 18, 20], undefined, (v) => `${v}px`),
      cycle("appearance.fontWeight", "font weight", ["thin", "light", "regular"]),
      toggle("appearance.startFullscreen", "start fullscreen"),
      cycle("appearance.maxFps", "fps cap", [30, 60, 120, 0], undefined, (v) => (v ? `${v}` : "unlimited")),
      toggle("appearance.showFps", "show fps"),
      toggle("appearance.lineNumbers", "line numbers"),
      toggle("appearance.backgroundSlow", "slow down in the background (energy)"),

      // (the effects are part of APPEARANCE)
      toggle("fx.ambient", "animated background"),
      toggle("fx.flicker", "crt flicker"),
      toggle("fx.glitch", "animations (glitch, page & typing motion)"),
      {
        label: "effect presets: minimal / max / potato",
        value: () => "open",
        change: () => d.workspace.fxPanel(),
      },
      // one slider per effect: 0 = off
      fxSlide("bloom", "bloom glow"),
      fxSlide("scanlines", "scanlines"),
      fxSlide("vignette", "vignette"),
      fxSlide("chroma", "RGB split (colour fringes)"),
      fxSlide("sharpness", "sharpness", (v) => (v === 100 ? t("razor sharp") : `${v}%`)),
      cycle("fx.screensaverMinutes", "screensaver after", [0, 5, 10, 20, 30], undefined, (v) => (v ? `${v} min` : "never")),
      cycle("boot.mode", "boot sequence", ["full", "fast", "off"]),
      { section: "SOUND", label: "", value: () => "" },
      // ui sounds: one slider, 0 = off
      slide("sound.volume", "ui sounds", 0, 100, () => (s.data.sound.enabled ? num("sound.volume") : 0), (v) => {
        set("sound.enabled", v > 0);
        if (v > 0) set("sound.volume", v);
      }, { zeroIsOff: true }),
      cycle("notifications.mode", "notifications", ["both", "sound", "visual", "none"], undefined, (v) => t(({ both: "sound + screen", sound: "sound only", visual: "screen only", none: "off" } as Record<string, string>)[String(v)] ?? String(v))),
      { section: "VOICE", label: "", value: () => "" },
      toggle("voice.enabled", "voice"),
      toggle("voice.readAI", "read LINK's answers aloud"),
      toggle("voice.subtitles", "subtitles (what the voice says, bottom-right)"),
      toggle("voice.greet", "greeting at start-up"),
      slide("voice.robot", "robot filter", 0, 100, () => num("voice.robot"), (v) => set("voice.robot", v), { zeroIsOff: true }),
      cycle("voice.rate", "speed", [0.8, 0.9, 1, 1.1, 1.2, 1.3, 1.5], undefined, (v) => `×${v}`),
      slide("voice.volume", "voice volume", 0, 100, () => num("voice.volume"), (v) => set("voice.volume", v), { zeroIsOff: true }),
      cycle("voice.language", "voice language", ["en", "fr", "ja"], undefined, (v) => (v === "fr" ? "Français" : v === "ja" ? "日本語" : "English")),
      cycle("voice.engine", "engine", ["auto", "piper", "system"], undefined, (v) => (v === "auto" ? "auto (piper if installed)" : v)),
      {
        label: "natural voice (neural, ~60 MB)",
        value: () => (s.data.voice.language === "ja" ? "system voice" : this.neural === null ? "…" : this.neural ? "installed ✓" : "download ↓"),
        cmd: () => `voice install ${s.data.voice.language === "en" ? "en" : s.data.voice.language}`,
        change: () => {
          if (s.data.voice.language === "ja") return d.notify("Japanese uses the system voice", "info");
          if (this.neural) return void d.act("voice test");
          // the download shows its progress in the shell
          d.workspace.showShellTab("ibsh");
          d.notify("downloading the natural voice — the shell shows the progress", "info");
          void d.act(`voice install ${s.data.voice.language}`).then(() => this.checkNeural());
        },
      },
      { label: "hear it", value: () => "test", cmd: () => "voice test", change: () => void d.act("voice test") },
      { section: "PRIVACY", label: "", value: () => "" },
      toggle("privacy.stealth", "stealth: 100 % local, no internet"),
      { section: "UPLINK (AI)", label: "", value: () => "" },
      cycle("ai.provider", "provider", ["claude-code", "anthropic", "ollama"], undefined, (v) => (v === "claude-code" ? "claude code (subscription)" : v === "anthropic" ? "anthropic api (tokens)" : "ollama (local)")),
      text("ai.claudeCodeModel", "claude code model", undefined, "sonnet, opus… (empty = default)"),
      toggle("ai.allowWrites", "AI can write notes (vault only)"),
      cycle("shell.mode", "shell panel", ["system", "ibsh"], undefined, (v) => (v === "system" ? "my terminal + ICEBREAKER" : "ibsh only")),
      cycle("shell.prompt", "terminal prompt", ["icebreaker", "mine"], undefined, (v) => (v === "mine" ? "mine (my own theme)" : "ICEBREAKER's")),
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
      { label: "every shortcut on one page, in columns (searchable)", value: () => "open", cmd: () => "shortcuts", change: () => void d.openApp("shortcuts") },
      { label: "+ bind a key to anything", value: () => "add", cmd: () => "bind", change: async () => {
        const keys = await d.prompt("Which keys?", { placeholder: "ctrl+shift+1 · alt+t" });
        if (!keys?.trim()) return;
        const cmd = await d.prompt("Run what? (a shell command)", { placeholder: "open notes/ideas.md · launch todo" });
        if (cmd?.trim()) void d.act(`bind ${keys.trim()} ${q(cmd.trim())}`);
      } },
      ...Object.entries(s.data.keys ?? {}).map(([k, cmd]): Row => ({ label: `★ ${cmd}`, value: () => displayKeys(k), cmd: () => `unbind ${k}`, change: () => void d.act(`unbind ${k}`) })),
      ...SHORTCUTS.map((sc): Row => ({ label: `${t(sc.what)}  · ${t(sc.cat)}`, value: () => displayKeys(sc.keys), cmd: sc.cmd ? () => sc.cmd! : undefined, change: sc.cmd ? () => void d.act(sc.cmd!) : undefined })),
      { section: "OVERVIEW", label: "", value: () => "" },
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
      // ── each module's own settings (only the modules that are on) ──
      ...this.moduleRows(set, toggle, cycle, text),
      { section: "DANGER ZONE", label: "", value: () => "" },
      { label: "self-destruct the vault (asks 4 times)", value: () => "☢", cmd: () => "self-destruct", change: () => void d.act("self-destruct") },
    ];
  }

  /** the categories, in order, with their rows */
  private sections(): { name: string; rows: Row[]; group: "GENERAL" | "MODULES" | "DANGER" }[] {
    const out: { name: string; rows: Row[]; group: "GENERAL" | "MODULES" | "DANGER" }[] = [];
    for (const r of this.list.items) {
      if (!r.label && r.section) out.push({ name: r.section, rows: [], group: r.section === "DANGER ZONE" ? "DANGER" : r.section === "OVERVIEW" || r.section.startsWith("◇") ? "MODULES" : "GENERAL" });
      else if (out.length) out[out.length - 1].rows.push(r);
    }
    // GENERAL, then MODULES (the overview, then each module), then the danger zone alone at the bottom
    return [...out.filter((x) => x.group === "GENERAL"), ...out.filter((x) => x.group === "MODULES"), ...out.filter((x) => x.group === "DANGER")];
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

  /** A section per module: the built-in ones here, the others from ib.settings.register. */
  private moduleRows(set: (k: string, v: unknown) => void, toggle: (k: string, l: string) => Row, cycle: <T>(k: string, l: string, o: T[], sec?: string, show?: (v: T) => string) => Row, text: (k: string, l: string, sec?: string, ph?: string, sug?: () => string[]) => Row): Row[] {
    const d = this.deck;
    const on = (id: string) => d.plugins.list().some((p) => p.manifest.id === id && p.active);
    const out: Row[] = [];
    const head = (name: string) => out.push({ section: `◇ ${name}`, label: "", value: () => "" });
    if (on("weather")) {
      head("WEATHER");
      out.push(text("home.weatherCity", "weather city (when your location isn't set)", undefined, "Lausanne", () => [...((d.settings.data.home.weatherPlaces ?? []) as { name: string }[]).map((p) => p.name), "Lausanne", "Genève", "Zürich", "Paris", "London", "New York", "Tokyo", "Oslo", "Berlin", "Montréal"]));
      out.push({ label: "saved places", value: () => String((d.settings.data.home.weatherPlaces ?? []).length), cmd: () => "weather places", change: () => void d.act("weather open") });
    }
    if (on("news")) {
      head("NEWS");
      out.push(text("home.newsTopic", "news topic (instead of your area)", undefined, "space, F1…"));
      out.push({ label: "news interests", value: () => (d.settings.data.home.newsInterests ?? []).join(", ") || "—", cmd: () => "news interests", change: () => void d.act("news interests") });
    }
    if (on("focus")) {
      head("FOCUS");
      out.push({ label: "focus / break minutes", value: () => `${focus.work} / ${focus.rest}`, cmd: () => "focus set 25 5", change: (dir) => {
        const p: [number, number][] = [[25, 5], [50, 10], [90, 20]];
        const i = p.findIndex(([w]) => w === focus.work);
        const [w, b] = p[(i + dir + p.length) % p.length];
        void d.act(`focus set ${w} ${b}`);
      } });
    }
    if (on("clocks")) {
      head("CLOCKS");
      out.push({ label: "world clocks", value: () => d.settings.data.home.worldClocks.map((z) => z.split("/").pop()).join(", "), cmd: () => "worldclock", change: () => void d.act("launch clocks") });
    }
    // modules from /plugins and the store: whatever they registered
    for (const [id, rows] of d.moduleSettings) {
      if (!on(id) || !rows.length) continue;
      head(d.plugins.list().find((p) => p.manifest.id === id)?.manifest.name ?? id.toUpperCase());
      for (const ms of rows) {
        const k = `plugin.${id}.${ms.key}`;
        out.push({
          key: k,
          label: ms.label,
          isText: ms.type === "text",
          value: () => {
            const v = d.moduleSettingValue(id, ms.key);
            return ms.type === "toggle" ? (v ? "on" : "off") : String(v ?? "—");
          },
          cmd: () => `modules set ${id} ${ms.key} ${q(String(d.moduleSettingValue(id, ms.key) ?? ""))}`,
          change: async (dir) => {
            const v = d.moduleSettingValue(id, ms.key);
            if (ms.type === "toggle") return void d.setModuleSetting(id, ms.key, !v);
            if (ms.type === "choice" && ms.options?.length) {
              const i = ms.options.indexOf(String(v));
              return void d.setModuleSetting(id, ms.key, ms.options[(i + dir + ms.options.length) % ms.options.length]);
            }
            const nv = await d.prompt(ms.label, { initial: String(v ?? "") });
            if (nv !== null) d.setModuleSetting(id, ms.key, ms.type === "number" ? Number(nv) : nv);
          },
        });
        if (ms.help) SETTINGS_HELP[k] = [ms.help, ms.help];
      }
    }
    void set; void toggle; void cycle;
    return out;
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

  private builtFor = "";
  render(ui: UI, r: Rect, focused: boolean): void {
    const c = ui.c;
    // your own shortcuts and the language change the rows: rebuild then
    const sig = `${JSON.stringify(this.deck.settings.data.keys ?? {})}|${this.deck.settings.data.user.language}`;
    if (sig !== this.builtFor) (this.builtFor = sig), (this.list.items = this.rows());
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
    const rx = sx + catW + 3, rw = Math.min(r.w - (rx - r.x) - 2, 86);
    const rows = this.shown();
    this.sel = Math.min(this.sel, Math.max(0, rows.length - 1));
    // a big interface scale leaves few lines: the help box at the bottom goes first, the settings stay
    const helpH = r.h - (top - r.y) >= 16 ? 7 : 1;
    const room = Math.max(1, r.y + r.h - top - helpH);
    if (this.sel < this.scroll) this.scroll = this.sel;
    if (this.sel >= this.scroll + room) this.scroll = this.sel - room + 1;
    this.scroll = Math.max(0, Math.min(this.scroll, Math.max(0, rows.length - room)));
    ui.hit({ x: rx, y: top, w: rw, h: room }, { onWheel: (d) => (this.scroll = Math.max(0, Math.min(Math.max(0, rows.length - room), this.scroll + d))) });
    if (!rows.length) ui.text(rx, top, t("nothing matches — esc clears the search"), { fg: c.muted });
    let hoverRow: Row | undefined;
    rows.slice(this.scroll, this.scroll + room).forEach(({ row, from }, k) => {
      const i = this.scroll + k;
      const y = top + k;
      const selected = i === this.sel && (this.pane === "rows" || !!this.query);
      const line = { x: rx, y, w: rw, h: 1 };
      const bg = selected && focused ? mix(c.accent, c.bg, 0.82) : ui.hovered(line) ? c.highlight : undefined;
      if (bg !== undefined) ui.fill(line, { bg });
      const st = bg !== undefined ? { bg } : {};
      const label = this.query ? `${t(row.label)}  ` : t(row.label);
      const raw = row.value();
      const v = t(raw);
      const vx = rx + rw - 1;
      // a slider: drawn in the value's place, dragged with the mouse
      if (row.slider) {
        const sw = Math.min(30, Math.max(10, Math.floor(rw * 0.45)));
        ui.text(rx + 1, y, label, { fg: selected ? c.fg : c.muted, ...st }, Math.max(4, rw - sw - 3));
        if (ui.hovered(line)) hoverRow = row;
        ui.hit(line, { onClick: () => ((this.sel = i), (this.pane = "rows")) });
        const sl = row.slider;
        slider(ui, { x: rx + rw - sw - 1, y, w: sw, h: 1 }, sl.get(), sl.min, sl.max, (v) => {
          this.sel = i;
          this.pane = "rows";
          sl.set(v);
        }, { zeroIsOff: sl.zeroIsOff, show: sl.show, tip: `${row.cmd?.() ?? ""}\n${t("drag, click, wheel · ←→ by 5")}` });
        return;
      }
      // ◂ ▸ only on values you step through; an action just says what it does
      const shownV = truncate(selected && row.change && row.key && !row.isText ? `◂ ${v} ▸` : selected && row.change ? `${v} ›` : v, Math.max(4, Math.floor(rw / 2)));
      // the label gets what the value leaves (never a negative width: the line must never vanish)
      const labelW = Math.max(4, rw - strWidth(shownV) - 3);
      const lx = ui.text(rx + 1, y, label, { fg: selected ? c.fg : c.muted, ...st }, labelW);
      if (this.query) ui.text(lx, y, t(from).toLowerCase(), { fg: c.faint, ...st }, Math.max(0, labelW - (lx - rx - 1)));
      const color = raw === "on" ? c.success : raw === "off" ? c.subtle : from === "DANGER ZONE" ? c.error : c.accent;
      ui.textRight(vx, y, shownV, { fg: color, attrs: selected ? BOLD : 0, ...st });
      if (ui.hovered(line)) hoverRow = row;
      ui.hit(line, { onClick: () => ((this.sel = i), (this.pane = "rows")), onDouble: () => void row.change?.(1) });
      const cmd = row.cmd?.();
      if (row.change) ui.hit({ x: vx - shownV.length, y, w: shownV.length, h: 1 }, cmd ? { cmd, tip: "←→ / enter change it too" } : { onClick: () => void row.change?.(1) });
    });

    // what it does (the row under the mouse, else the selected one), and the command that does the same
    const cur = hoverRow ?? rows[this.sel]?.row;
    const help = cur ? SETTINGS_HELP[cur.key ?? cur.label] : undefined;
    const fr = this.deck.settings.data.user.language === "fr";
    if ((help || cur) && helpH > 1) {
      ui.hline(rx, r.y + r.h - 6, rw, { fg: c.faint }, "┄");
      const words = (help ? help[fr ? 1 : 0] : t(cur!.label)).split(" ");
      const lines: string[] = [];
      let line = "";
      for (const w of words) {
        if ((line + " " + w).length > rw - 2 && line) (lines.push(line), (line = w));
        else line = line ? `${line} ${w}` : w;
      }
      lines.push(line);
      lines.slice(0, 3).forEach((l, i) => ui.text(rx, r.y + r.h - 5 + i, l, { fg: c.fg }, rw));
    }
    const cmd = cur?.cmd?.() ?? (cur?.key ? `config get ${cur.key}` : "");
    if (cmd && helpH > 1) ui.text(rx, r.y + r.h - 2, `› ${cmd}`, { fg: c.subtle }, rw);
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
