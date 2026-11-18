import { t } from "../core/i18n";
import { q } from "../ui/ui";
import { BOLD, type Rect } from "../core/grid";
import type { Action } from "../core/input";
import type { Deck } from "../deck";
import { ListView } from "../ui/list";
import type { UI } from "../ui/ui";
import type { App, AppSpec } from "./types";

interface Row {
  section?: string;
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
    return t("↑↓ select · ←→ / enter change · everything is also in `config list`");
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
      label,
      cmd: () => `config set ${key} ${!s.get(key)}`,
      value: () => (s.get(key) ? "on" : "off"),
      change: () => set(key, !s.get(key)),
    });
    const cycle = <T,>(key: string, label: string, options: T[], section?: string, show: (v: T) => string = String): Row => ({
      section,
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
      label,
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
    ];
  }

  onAction(a: Action): boolean {
    const row = this.list.current;
    if ((a === "left" || a === "right") && row?.change) {
      void row.change(a === "left" ? -1 : 1);
      return true;
    }
    const handled = this.list.onAction(a);
    // skip section headers
    if ((a === "up" || a === "down") && this.list.current?.section !== undefined && !this.list.current.label) {
      this.list.select(this.list.selected + (a === "up" ? -1 : 1));
      if (this.list.selected === 0) this.list.select(1);
    }
    return handled;
  }

  render(ui: UI, r: Rect, focused: boolean): void {
    const c = ui.c;
    const area = { x: r.x + 2, y: r.y + 1, w: Math.min(r.w - 4, 80), h: r.h - 1 };
    this.list.render(ui, area, focused, (row, rect, selected) => {
      if (!row.label) {
        const sec = t(row.section ?? "");
        ui.text(rect.x, rect.y, `── ${sec} `, { fg: c.accent, attrs: BOLD });
        ui.hline(rect.x + sec.length + 4, rect.y, rect.w - sec.length - 5, { fg: c.faint });
        return;
      }
      ui.text(rect.x + 2, rect.y, t(row.label), { fg: selected ? c.fg : c.muted });
      const raw = row.value();
      const v = t(raw);
      const vx = rect.x + rect.w - 2;
      if (row.change) {
        const label = selected ? `◂ ${v} ▸` : v;
        const color = raw === "on" ? c.success : raw === "off" ? c.subtle : c.accent;
        ui.textRight(vx, rect.y, label, { fg: color, attrs: selected ? BOLD : 0 });
        const cmd = row.cmd?.();
        ui.hit({ x: vx - label.length, y: rect.y, w: label.length, h: 1 }, cmd ? { cmd, tip: "←→ / enter change it too" } : { onClick: () => void row.change?.(1) });
      } else ui.textRight(vx, rect.y, v, { fg: c.subtle });
    });
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
