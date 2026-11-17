import type { Platform } from "../platform/types";
import type { WidgetPlacement } from "../widgets/types";

/**
 * User settings, saved as JSON in the OS config folder
 * (Windows: %APPDATA%\org.icebreaker.deck, Linux: ~/.config/org.icebreaker.deck,
 *  macOS: ~/Library/Application Support/org.icebreaker.deck).
 *
 * Secrets (API keys) live in a separate secrets.json next to it, so you can
 * share settings.json without leaking anything.
 *
 * Every setting is reachable from the shell: `config set fx.bloom false`.
 */
export interface Settings {
  user: {
    handle: string;
    locale: string;
    /**
     * Where you are, as precisely as you choose (weather, local news). Nothing
     * leaves the machine except to open-meteo.com / Google News when a widget asks.
     */
    location: { precision: "none" | "country" | "city" | "precise"; name: string; country: string; lat: number | null; lon: number | null };
  };
  /** First-run questionnaire (apps/setup.ts). */
  setup: { done: boolean };
  vault: { path: string };
  appearance: { theme: string; fontSize: number; startFullscreen: boolean; fontWeight: "light" | "regular"; maxFps: number; showFps: boolean; lineNumbers: boolean };
  fx: { bloom: boolean; scanlines: boolean; vignette: boolean; ambient: boolean; flicker: boolean; glitch: boolean; screensaverMinutes: number };
  boot: { mode: "full" | "fast" | "off" };
  ai: {
    provider: "claude-code" | "anthropic" | "ollama";
    /** Model for the Claude Code provider: "sonnet", "opus"… (empty = the CLI default). */
    claudeCodeModel: string;
    model: string;
    effort: "low" | "medium" | "high" | "xhigh" | "max";
    ollamaHost: string;
    ollamaModel: string;
    saveChats: boolean;
  };
  journal: { folder: string };
  editor: { autosave: boolean; tabSize: number };
  plugins: { enabled: string[]; disabled: string[]; registry: string };
  home: { widgets: WidgetPlacement[]; weatherCity: string; worldClocks: string[]; newsTopic: string };
}

export interface Secrets {
  anthropicApiKey: string;
}

export const DEFAULT_SETTINGS: Settings = {
  user: { handle: "netrunner", locale: "", location: { precision: "none", name: "", country: "", lat: null, lon: null } },
  setup: { done: false },
  vault: { path: "" },
  appearance: { theme: "nightshade", fontSize: 15, startFullscreen: false, fontWeight: "light", maxFps: 60, showFps: true, lineNumbers: true },
  // Minimal by default: the animated background and short glitch transitions.
  // The heavy CRT stuff (bloom, scanlines, vignette, flicker) is one click away in the FX panel.
  fx: { bloom: false, scanlines: false, vignette: false, ambient: true, flicker: false, glitch: true, screensaverMinutes: 0 },
  boot: { mode: "full" },
  ai: {
    provider: "claude-code",
    claudeCodeModel: "",
    model: "claude-opus-5-5",
    effort: "medium",
    ollamaHost: "http://localhost:11434",
    ollamaModel: "llama3.1",
    saveChats: true,
  },
  journal: { folder: "journal" },
  editor: { autosave: true, tabSize: 2 },
  // the community index: a JSON list of plugins/themes (see docs/COMMUNITY.md)
  plugins: { enabled: [], disabled: [], registry: "https://raw.githubusercontent.com/kiddoko/icebreaker-community/main/index.json" },
  // empty = the default layout (widgets/builtin.ts)
  home: { widgets: [], weatherCity: "Paris", worldClocks: ["America/New_York", "Europe/London", "Asia/Tokyo"], newsTopic: "" },
};

type Listener = (path: string) => void;

export class SettingsStore {
  data: Settings;
  secrets: Secrets;
  private listeners = new Set<Listener>();
  private saveTimer: ReturnType<typeof setTimeout> | undefined;

  private constructor(
    private readonly platform: Platform,
    data: Settings,
    secrets: Secrets,
  ) {
    this.data = data;
    this.secrets = secrets;
  }

  static async load(platform: Platform): Promise<SettingsStore> {
    const raw = await platform.config.read("settings.json").catch(() => null);
    const rawSecrets = await platform.config.read("secrets.json").catch(() => null);
    // (JSON copy rather than structuredClone: works on older macOS WebKit too)
    const data = deepMerge(JSON.parse(JSON.stringify(DEFAULT_SETTINGS)), safeJson(raw)) as Settings;
    const secrets = { anthropicApiKey: "", ...(safeJson(rawSecrets) as Partial<Secrets>) };
    return new SettingsStore(platform, data, secrets);
  }

  onChange(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Read a value by dotted path, e.g. get("fx.bloom"). */
  get(path: string): unknown {
    return path.split(".").reduce<unknown>((o, k) => (o && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined), this.data);
  }

  /**
   * Set a value by dotted path. Strings are converted to the type of the
   * default value ("false" → false, "60" → 60), so the shell can pass raw text.
   */
  set(path: string, value: unknown): void {
    const keys = path.split(".");
    const last = keys.pop()!;
    let target = this.data as unknown as Record<string, unknown>;
    let defaults = DEFAULT_SETTINGS as unknown as Record<string, unknown>;
    for (const k of keys) {
      if (!target[k] || typeof target[k] !== "object") throw new Error(`unknown setting: ${path}`);
      target = target[k] as Record<string, unknown>;
      defaults = (defaults?.[k] ?? {}) as Record<string, unknown>;
    }
    if (!(last in target)) throw new Error(`unknown setting: ${path}`);
    target[last] = coerce(value, defaults[last] ?? target[last]);
    this.listeners.forEach((fn) => fn(path));
    this.scheduleSave();
  }

  setSecret<K extends keyof Secrets>(key: K, value: Secrets[K]): Promise<void> {
    this.secrets[key] = value;
    return this.platform.config.write("secrets.json", JSON.stringify(this.secrets, null, 2));
  }

  /** All settings as "a.b.c" → value, for `config list`. */
  flatten(): [string, unknown][] {
    const out: [string, unknown][] = [];
    const walk = (o: Record<string, unknown>, prefix: string) => {
      for (const [k, v] of Object.entries(o)) {
        const p = prefix ? `${prefix}.${k}` : k;
        if (v && typeof v === "object" && !Array.isArray(v)) walk(v as Record<string, unknown>, p);
        else out.push([p, v]);
      }
    };
    walk(this.data as unknown as Record<string, unknown>, "");
    return out;
  }

  private scheduleSave(): void {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      this.platform.config.write("settings.json", JSON.stringify(this.data, null, 2)).catch((e) => console.error("settings save failed", e));
    }, 300);
  }
}

function safeJson(raw: string | null): Record<string, unknown> {
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    console.warn("settings file is not valid JSON — using defaults");
    return {};
  }
}

function deepMerge(base: Record<string, unknown> | object, extra: Record<string, unknown>): object {
  const b = base as Record<string, unknown>;
  for (const [k, v] of Object.entries(extra)) {
    if (v && typeof v === "object" && !Array.isArray(v) && b[k] && typeof b[k] === "object") deepMerge(b[k] as object, v as Record<string, unknown>);
    else if (k in b) b[k] = v;
  }
  return b;
}

function coerce(value: unknown, like: unknown): unknown {
  if (typeof value !== "string") return value;
  if (typeof like === "boolean") {
    if (/^(true|on|yes|1)$/i.test(value)) return true;
    if (/^(false|off|no|0)$/i.test(value)) return false;
    throw new Error(`expected true/false, got "${value}"`);
  }
  if (typeof like === "number") {
    const n = Number(value);
    if (Number.isNaN(n)) throw new Error(`expected a number, got "${value}"`);
    return n;
  }
  if (Array.isArray(like)) return value.split(",").map((s) => s.trim()).filter(Boolean);
  return value;
}
