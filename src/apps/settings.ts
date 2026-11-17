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
    return "↑↓ select · ←→ / enter change · everything is also in `config list`";
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
      value: () => (s.get(key) ? "on" : "off"),
      change: () => set(key, !s.get(key)),
    });
    const cycle = <T,>(key: string, label: string, options: T[], section?: string, show: (v: T) => string = String): Row => ({
      section,
      label,
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
      { section: "APPEARANCE", label: "", value: () => "" },
      cycle("appearance.theme", "theme", d.themes.list().map((t) => t.name)),
      cycle("appearance.fontSize", "font size", [11, 12, 13, 14, 15, 16, 18, 20, 22, 24], undefined, (v) => `${v}px`),
      toggle("appearance.fullscreen", "fullscreen"),
      cycle("appearance.maxFps", "fps cap", [30, 60, 120, 0], undefined, (v) => (v ? `${v}` : "unlimited")),
      toggle("appearance.showFps", "show fps"),
      toggle("appearance.lineNumbers", "line numbers"),
      { section: "EFFECTS", label: "", value: () => "" },
      toggle("fx.bloom", "bloom glow"),
      toggle("fx.scanlines", "scanlines"),
      toggle("fx.vignette", "vignette"),
      toggle("fx.ambient", "ambient fog"),
      toggle("fx.flicker", "crt flicker"),
      toggle("fx.glitch", "glitch transitions"),
      cycle("fx.screensaverMinutes", "screensaver after", [0, 5, 10, 20, 30], undefined, (v) => (v ? `${v} min` : "never")),
      cycle("boot.mode", "boot sequence", ["full", "fast", "off"]),
      {
        label: "presets: minimal / max / potato",
        value: () => "open",
        change: () => d.workspace.fxPanel(),
      },
      { section: "NEURAL LINK", label: "", value: () => "" },
      cycle("ai.provider", "provider", ["anthropic", "ollama"]),
      text("ai.model", "claude model", undefined, "claude-opus-5-5"),
      cycle("ai.effort", "claude effort", ["low", "medium", "high", "xhigh", "max"]),
      {
        label: "anthropic api key",
        value: () => (s.secrets.anthropicApiKey ? `sk-…${s.secrets.anthropicApiKey.slice(-4)}` : d.ai.envKey ? "from env" : "not set"),
        change: () => void d.shell.runLine("config key"),
      },
      text("ai.ollamaHost", "ollama host", undefined, "http://localhost:11434"),
      text("ai.ollamaModel", "ollama model", undefined, "llama3.1"),
      toggle("ai.saveChats", "save chats to vault"),
      { section: "YOU", label: "", value: () => "" },
      text("user.handle", "handle"),
      text("user.locale", "date language", undefined, "fr-FR, en-US… (empty = system)"),
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
        ui.text(rect.x, rect.y, `── ${row.section} `, { fg: c.accent, attrs: BOLD });
        ui.hline(rect.x + (row.section?.length ?? 0) + 4, rect.y, rect.w - (row.section?.length ?? 0) - 5, { fg: c.faint });
        return;
      }
      ui.text(rect.x + 2, rect.y, row.label, { fg: selected ? c.fg : c.muted });
      const v = row.value();
      const vx = rect.x + rect.w - 2;
      if (row.change) {
        const label = selected ? `◂ ${v} ▸` : v;
        const color = v === "on" ? c.success : v === "off" ? c.subtle : c.accent;
        ui.textRight(vx, rect.y, label, { fg: color, attrs: selected ? BOLD : 0 });
        ui.hit({ x: vx - label.length, y: rect.y, w: label.length, h: 1 }, { onClick: () => void row.change?.(1) });
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
