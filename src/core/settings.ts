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
    /** The language of the deck: en · fr (dates follow `locale`). */
    language: "en" | "fr";
    /** Only if they want to say (setup): man · woman · nonbinary · other · "" (not said, neutral). */
    gender: "" | "man" | "woman" | "nonbinary" | "other";
    /** Their own word, with gender "other" (optional). */
    genderOther: string;
    /** how the deck refers to you: "she/her", "they/them", "iel"… (free text) */
    pronouns: string;
    /** the login screen fills in the account name (off: you type it each time) */
    rememberAccount: boolean;
    /**
     * Where you are, as precisely as you choose (weather, local news). Nothing
     * leaves the machine except to open-meteo.com / Google News when a widget asks.
     */
    location: { precision: "none" | "country" | "city" | "precise"; name: string; country: string; lat: number | null; lon: number | null };
  };
  /** First-run questionnaire (apps/setup.ts). */
  setup: { done: boolean };
  vault: { path: string };
  appearance: {
    theme: string;
    /** Your tweaks per theme: { nightshade: { "ui.accent": "#ff2e88", "background.effect": "snow" } } (`theme tweak`). */
    tweaks: Record<string, Record<string, string | number>>;
    /** Text size in px at 100 % scale. */
    fontSize: number;
    /** Interface scale in percent (25–200), changed with ctrl +/-. */
    scale: number;
    startFullscreen: boolean;
    fontWeight: "thin" | "light" | "regular";
    maxFps: number; showFps: boolean; lineNumbers: boolean;
    /** slow animations down (12 fps) while the window isn't the one you use */
    backgroundSlow: boolean };
  /** levels: how strong each effect is, in % of what the theme sets (0–200) */
  fx: { bloom: boolean; scanlines: boolean; vignette: boolean; ambient: boolean; flicker: boolean; glitch: boolean; screensaverMinutes: number; levels: { bloom: number; scanlines: number; vignette: number;
    /** 0–100: red/blue fringes of an old tube (0 = off) */ chroma: number;
    /** 0–100: glyphs a touch out of focus, like a CRT (0 = sharp) — old name, read once into sharpness */ softness?: number;
    /** 0–100: how sharp the glyphs are (100 = razor, lower = a CRT's soft focus) */ sharpness: number;
    /** 0–200: bright text and lit elements give off light (0 = off) */ glow?: number } };
  boot: { mode: "full" | "fast" | "off" };
  /** The shell panel: your system shell with ICEBREAKER's commands, or ibsh only. */
  shell: {
    mode: "system" | "ibsh";
    /** the system terminal's prompt: ICEBREAKER's own (the same for everyone) or yours */
    prompt: "icebreaker" | "mine";
    /** Buttons above the system terminal: a click types `cmd` + enter. {name} parts are asked for first. */
    macros: { label: string; cmd: string }[];
  };
  /** UI sounds (core/sound.ts). Volume 0–100. */
  /** muted: everything silent (ui sounds, voice, alerts) — the 🔇 button, `mute` */
  /** packByTheme: the sound pack chosen for a theme (else the theme's own) */
  sound: { enabled: boolean; volume: number; muted?: boolean; packByTheme: Record<string, string> };
  /** How alerts (reminders, modules' ib.ui.alert) reach you: sound (+ voice), visual (system notification + toast), both, or none. */
  notifications: { mode: "both" | "sound" | "visual" | "none" };
  /** Your own shortcuts: key combo → shell command (`bind ctrl+shift+1 "open notes/ideas.md"`). */
  keys: Record<string, string>;
  /** module settings values (ib.settings), per module id */
  moduleSettings: Record<string, Record<string, unknown>>;
  /** MODULES: a colour per module (red, orange…), to sort and filter the ring */
  moduleTags: Record<string, string>;
  /** your effects, per theme: switching theme brings back what you had set on it */
  fxByTheme?: Record<string, Record<string, unknown>>;
  /** what was open when you quit, to come back to it: the tree's open folders, the tabs */
  session?: { tree?: string[]; tabs?: string[]; active?: number };
  /** pinned notes, folders, modules (`pin`): top of the tree and the pinned widget */
  favorites: { kind: "note" | "folder" | "module"; target: string; label: string }[];
  ai: {
    provider: "claude-code" | "anthropic" | "ollama";
    /** Model for the Claude Code provider: "sonnet", "opus"… (empty = the CLI default). */
    claudeCodeModel: string;
    /** Claude Code may create and edit notes (inside the vault only, never .icebreaker/). */
    allowWrites: boolean;
    model: string;
    effort: "low" | "medium" | "high" | "xhigh" | "max";
    ollamaHost: string;
    ollamaModel: string;
    saveChats: boolean;
  };
  journal: { folder: string };
  /**
   * Stealth: 100 % local. No internet at all — no cloud AI, weather, news,
   * Google, module installs. Only this machine and your local network
   * (a local model with Ollama, a vault on your own server).
   */
  privacy: { stealth: boolean };
  /** The deck's voice (core/voice.ts): local text-to-speech through a robot filter. */
  voice: {
    /** what the voice says, in a small box bottom-right */
    subtitles?: boolean;
    enabled: boolean;
    /** auto (piper if installed, else the system voice) · piper · system */
    engine: "auto" | "piper" | "system";
    /** voice name for the engine ("" = its default) */
    name: string;
    /** 0.5–2 */
    rate: number;
    /** 0–100: how robotic (ring modulation, bit crush, chorus) */
    robot: number;
    volume: number;
    /** read LINK's answers aloud */
    readAI: boolean;
    /** "Welcome, netrunner" when the deck starts */
    greet: boolean;
    /** the language it speaks: en · fr · ja (Japanese, whatever the UI language) */
    language: "en" | "fr" | "ja";
  };
  editor: { autosave: boolean; tabSize: number };
  /** registry: the official index · sources: your own (URLs or user/repo of an index.json) */
  /** removed: built-in modules the user uninstalled (the STORE reinstalls them) */
  plugins: { enabled: string[]; disabled: string[]; removed: string[]; registry: string; sources: string[] };
  home: { widgets: WidgetPlacement[]; weatherCity: string; worldClocks: string[]; newsTopic: string;
    /** news interests: categories (tech, politics…) and free words, mixed with your area's news */
    newsInterests: string[];
    /** saved places of the WEATHER app */
    weatherPlaces: { name: string; admin: string; country: string; countryCode: string; lat: number; lon: number }[];
    /** the clock widget's face (clock style) and seconds (clock seconds) */
    clockStyle: string; clockSeconds: boolean };
}

export interface Secrets {
  anthropicApiKey: string;
}

export const DEFAULT_SETTINGS: Settings = {
  user: { handle: "netrunner", locale: "", language: "en", gender: "", genderOther: "", pronouns: "", rememberAccount: false, location: { precision: "none", name: "", country: "", lat: null, lon: null } },
  setup: { done: false },
  vault: { path: "" },
  appearance: { theme: "nightshade", tweaks: {}, fontSize: 13, scale: 100, startFullscreen: false, fontWeight: "thin", maxFps: 60, showFps: true, lineNumbers: true, backgroundSlow: true },
  // Minimal by default: the animated background and short glitch transitions.
  // The heavy CRT stuff (bloom, scanlines, vignette, flicker) is one click away in the FX panel.
  fx: { bloom: false, scanlines: false, vignette: false, ambient: true, flicker: false, glitch: true, screensaverMinutes: 0, levels: { bloom: 100, scanlines: 100, vignette: 100, chroma: 0, sharpness: 80, glow: 0 } },
  boot: { mode: "full" },
  sound: { enabled: true, volume: 50, packByTheme: {} },
  notifications: { mode: "both" },
  keys: {},
  favorites: [],
  session: {},
  fxByTheme: {},
  moduleSettings: {},
  moduleTags: {},
  shell: {
    mode: "system",
    prompt: "icebreaker",
    macros: [
      { label: "ls", cmd: "ls -la" },
      { label: "cd ..", cmd: "cd .." },
      { label: "mkdir", cmd: "mkdir -p {folder}" },
      { label: "touch", cmd: "touch {file}" },
      { label: "find", cmd: "grep -ril {text} ." },
      { label: "git status", cmd: "git status -sb" },
      { label: "todo", cmd: "todo" },
      { label: "clear", cmd: "clear" },
    ],
  },
  ai: {
    provider: "claude-code",
    claudeCodeModel: "",
    allowWrites: true,
    model: "claude-opus-5-5",
    effort: "medium",
    ollamaHost: "http://localhost:11434",
    ollamaModel: "llama3.1",
    saveChats: true,
  },
  journal: { folder: "journal" },
  privacy: { stealth: false },
  voice: { subtitles: true, enabled: false, engine: "auto", name: "", rate: 1.1, robot: 100, volume: 50, readAI: false, greet: true, language: "en" },
  editor: { autosave: true, tabSize: 2 },
  // the community index: a JSON list of plugins/themes (see docs/COMMUNITY.md)
  plugins: { enabled: [], disabled: [], removed: [], registry: "https://raw.githubusercontent.com/kiddoko/icebreaker-modules/main/index.json", sources: [] },
  // empty = the default layout (widgets/builtin.ts)
  home: { widgets: [], weatherCity: "Paris", worldClocks: ["America/New_York", "Europe/London", "Asia/Tokyo"], newsTopic: "", newsInterests: [], weatherPlaces: [], clockStyle: "dots", clockSeconds: false },
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
    // the community index moved to icebreaker-modules
    if (data.plugins.registry === "https://raw.githubusercontent.com/kiddoko/icebreaker-community/main/index.json") data.plugins.registry = DEFAULT_SETTINGS.plugins.registry;
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

  private frozen = false;

  /** Stop writing settings.json (before a factory reset moves the folder away). */
  freeze(): void {
    this.frozen = true;
    clearTimeout(this.saveTimer);
  }

  private scheduleSave(): void {
    if (this.frozen) return;
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
  // an empty default ({}) is a free-form record (your keys, module settings, the session):
  // everything saved in it is kept, not only the keys the defaults know about
  const record = Object.keys(b).length === 0;
  for (const [k, v] of Object.entries(extra)) {
    if (v && typeof v === "object" && !Array.isArray(v) && b[k] && typeof b[k] === "object") deepMerge(b[k] as object, v as Record<string, unknown>);
    else if (k in b || record) b[k] = v;
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
