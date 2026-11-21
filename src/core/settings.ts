import { levelOf, levelRank, migrateGranted } from "../plugins/permissions";
import type { UndoHistory } from "./undo";
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
    /** your profile icon (core/avatar.ts): a pixel face or a glyph, and its colour */
    avatar: { id: string; color: string };
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
    /** with vsync on, the frames a second at most: "auto" = 60 on battery, 120 on the mains */
    smooth?: "auto" | "60" | "120";
    /** the frame-rate cap when vsync is off: 0–240 (0 = no animations: the deck only redraws when you act) */
    maxFps: number;
    /** follow the screen's refresh rate (vertical sync); the fps cap is ignored then */
    vsync: boolean;
    /** 50–150 %: the whole picture lighter or darker (on top of the theme) */
    brightness: number;
    /** fewer, shorter animations: no page transitions or glitches, still backgrounds, animations at 30 fps at most */
    reduceMotion: boolean;
    showFps: boolean; lineNumbers: boolean;
    /** slow animations down (12 fps) while the window isn't the one you use */
    backgroundSlow: boolean;
    /** how fast text types itself out (ui/typewriter.ts): 0-100, 100 = at once */
    textSpeed: number;
    /** letters fade in as they appear — typing, the terminal, the chat (core/renderer.ts fadeMs) */
    fadeIn: boolean };
  /** levels: how strong each effect is, in % of what the theme sets (0–200) */
  fx: { bloom: boolean; scanlines: boolean; vignette: boolean; ambient: boolean; flicker: boolean; glitch: boolean; screensaverMinutes: number; levels: { bloom: number; scanlines: number; vignette: number;
    /** 0–100: red/blue fringes of an old tube (0 = off) */ chroma: number;
    /** 0–100: glyphs a touch out of focus, like a CRT (0 = sharp) — old name, read once into sharpness */ softness?: number;
    /** 0–100: how sharp the glyphs are (100 = razor, lower = a CRT's soft focus) */ sharpness: number;
    /** 0–200: bright text and lit elements give off light (0 = off) */ glow?: number;
    /** 0–100: the curved glass of a CRT (rounded screen, darker rim, a reflection; 0 = flat, the default) */ curve?: number };
    /** CRT flicker speed in % (10–300, 100 = the default pace) */ flickerSpeed?: number };
  boot: { mode: "full" | "fast" | "off" };
  /** The shell panel: your system shell with ICEBREAKER's commands, or ibsh only. */
  shell: {
    mode: "system" | "ibsh";
    /** the system terminal's prompt: ICEBREAKER's own (the same for everyone) or yours */
    prompt: "icebreaker" | "mine";
    /**
     * What a program in your real terminal may ask the deck (a plain vault; an encrypted one
     * answers nothing): nothing · read and write your notes · that and your timers and alarms.
     */
    bridge: "off" | "notes" | "more";
    /** Buttons above the system terminal: a click types `cmd` + enter. {name} parts are asked for first. */
    macros: { label: string; cmd: string }[];
    /** the macro row above the system terminal is shown (macro hide / show) */
    macrosShown: boolean;
  };
  /** UI sounds (core/sound.ts). Volume 0–100. */
  /** muted: everything silent (ui sounds, voice, alerts) — the ♪ button, `mute` */
  /** packByTheme: the sound pack chosen for a theme (else the theme's own) */
  /** mix: each channel's volume 0-100 (core/sound.ts SOUND_CHANNELS); typing: a click on your own keys */
  sound: { enabled: boolean; volume: number; muted?: boolean; packByTheme: Record<string, string>; mix: { ui: number; alerts: number; boot: number; text: number; typing: number; modules: number }; typing: boolean };
  /** How alerts (reminders, modules' ib.ui.alert) reach you: sound (+ voice), visual (system notification + toast), both, or none. */
  notifications: {
    /** a toast in the deck */
    screen: boolean;
    /** the alert sound (tu-dut) */
    sound: boolean;
    /** the system's notification center */
    system: boolean;
    /** …only when the deck isn't in front */
    systemOnlyAway: boolean;
    /** the voice reads it (if the voice is on) */
    voice: boolean;
  };
  /** Your own shortcuts: key combo → shell command (`bind ctrl+shift+1 "open notes/ideas.md"`). */
  keys: Record<string, string>;
  /** module settings values (ib.settings), per module id */
  moduleSettings: Record<string, Record<string, unknown>>;
  /** the deck's shortcuts you changed: shortcut id → keys ("" = switched off); see core/shortcuts.ts */
  keyOverrides: Record<string, string>;
  /** THE MENU (⌘K): shift twice opens it too; the deck shortcuts' keys on it you changed (id → key, "" = none) */
  menu: { doubleShift: boolean; keys: Record<string, string> };
  /** the side panel on the right: widgets always in view (panel show / add <widget>) */
  /** the side panel: its widgets (copy keys, like HOME's), the height you gave each and where each starts (lines from the top: gaps allowed) */
  panel: { shown: boolean; widgets: string[]; heights: Record<string, number>; tops: Record<string, number> };
  /** (before 0.3.2: the gamepad's action wheel; its slots move to THE MENU's keys once, then this stays empty) */
  gamepad: { wheel: { label: string; icon: string; cmd: string }[][] };
  /** MODULES: a colour per module (red, orange…), to sort and filter the ring */
  moduleTags: Record<string, string>;
  /** your effects, per theme: switching theme brings back what you had set on it */
  fxByTheme?: Record<string, Record<string, unknown>>;
  /** what was open when you quit, to come back to it: the tree's open folders, the tabs */
  /** places / shows: tabs moved to another frame, and the one each of those frames shows (workspace/tabplaces.ts) */
  session?: { tree?: string[]; tabs?: string[]; active?: number; groups?: unknown[]; places?: Record<string, string>; shows?: Record<string, string> };
  /** where the frames sit (workspace/layout/arrange.ts, docs/FRAMES.md): {} = today's arrangement; `layout preset`, `frame move` */
  layout: { version?: number; preset?: string; root?: unknown };
  /** pinned notes, folders, modules (`pin`): top of the tree and the pinned widget */
  /** pins (workspace/favorites.ts): notes, folders, modules, pages, macros, commands — also HOME's squares */
  favorites: { kind: "note" | "folder" | "module" | "page" | "macro" | "command"; target: string; label: string; id?: string; icon?: string; cmd?: string }[];
  ai: {
    provider: "claude-code" | "anthropic" | "ollama";
    /** Model for the Claude Code provider: "sonnet", "opus"… (empty = the CLI default). */
    claudeCodeModel: string;
    /** Claude Code may create and edit notes (inside the vault only, never .icebreaker/). */
    allowWrites: boolean;
    /**
     * What the AI may read by itself: nothing · what you give it (a note you name, pipe or have
     * in front) · your whole vault. Writing always asks (ai/tools.ts).
     */
    reads: "nothing" | "given" | "all";
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
  /**
   * Updates of ICEBREAKER and of the modules (core/updater.ts): when to look, download by
   * itself, install by itself or ask first. `endpoint`: where ICEBREAKER's releases are
   * (empty = the official one). Stealth mode looks for nothing.
   */
  updates: { check: "daily" | "start" | "never"; download: boolean; install: "ask" | "auto"; endpoint: string };
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
    /**
     * What else the voice says, topic by topic (Settings → VOICE → say aloud):
     * errors · reminders · timers (and focus) · calendar (30 min before) ·
     * weather (when the sky changes) · time (every half hour) · system (CPU or
     * memory overload) · modules (what modules ask to say). See Deck.speak.
     */
    speak: Record<string, boolean>;
    /** "Welcome, netrunner" when the deck starts */
    greet: boolean;
    /** the language it speaks: en · fr · ja (Japanese, whatever the UI language) */
    language: "en" | "fr" | "ja";
  };
  /** treeWheel: the wheel over the tree walks file by file and shows each one at once (else it scrolls) */
  editor: { autosave: boolean; tabSize: number; treeWheel: boolean };
  /** registry: the official index · sources: your own (URLs or user/repo of an index.json) */
  /** removed: built-in modules the user uninstalled (the STORE reinstalls them) */
  plugins: { enabled: string[]; disabled: string[]; removed: string[]; registry: string; sources: string[];
    /** the permissions you approved for each STORE / vault module when you switched it on (it never runs with more) */
    granted: Record<string, string[]>;
    /** the fingerprint (SHA-256) of each STORE / vault module's code when you switched it on: changed since, it stays off until you approve again */
    pinned: Record<string, string>;
    /** the permissions you took away from a module, built-in ones too (Settings → PERMISSIONS, `plugin revoke`) */
    revoked: Record<string, string[]>;
    /** the high-risk permissions you answered "always" for (asked again at first use otherwise) */
    always: Record<string, string[]>;
    /** 2: `granted` is in the names of 0.6 (plugins/permissions.ts); before, it's translated once at start */
    model?: number };
  /** links: the 1×1 shortcut widgets (widgets/links.ts) */
  home: { widgets: WidgetPlacement[]; links: { id: string; label: string; icon: string; cmd: string }[]; weatherCity: string; worldClocks: string[]; newsTopic: string;
    /** news interests: categories (tech, politics…) and free words, mixed with your area's news */
    newsInterests: string[];
    /** the NEWS page's own categories and words (apart from the widgets'; before it: newsInterests, newsTopic) */
    newsPage: { cats?: string[]; words?: string };
    /** each widget copy's own settings ("clock#2" → { style: "flip" }), see widgets/instances.ts */
    widgetConfig: Record<string, Record<string, unknown>>;
    /** saved places of the WEATHER app */
    weatherPlaces: { name: string; admin: string; country: string; countryCode: string; lat: number; lon: number }[];
    /** the clock widget's face (clock style) and seconds (clock seconds) */
    clockStyle: string; clockSeconds: boolean };
}

export interface Secrets {
  anthropicApiKey: string;
}

export const DEFAULT_SETTINGS: Settings = {
  user: { handle: "netrunner", locale: "", language: "en", gender: "", genderOther: "", pronouns: "", avatar: { id: "visor", color: "accent" }, location: { precision: "none", name: "", country: "", lat: null, lon: null } },
  setup: { done: false },
  vault: { path: "" },
  appearance: { theme: "nightshade", tweaks: {}, fontSize: 13, scale: 100, startFullscreen: false, fontWeight: "thin", maxFps: 60, vsync: true, smooth: "auto", brightness: 100, reduceMotion: false, showFps: true, lineNumbers: true, backgroundSlow: true, textSpeed: 50, fadeIn: true },
  // Minimal by default: the animated background and short glitch transitions.
  // The heavy CRT stuff (bloom, scanlines, vignette, flicker) is one click away in the FX panel.
  fx: { bloom: false, scanlines: false, vignette: false, ambient: true, flicker: false, glitch: true, screensaverMinutes: 0, levels: { bloom: 100, scanlines: 100, vignette: 100, chroma: 0, sharpness: 80, glow: 0, curve: 0 }, flickerSpeed: 100 },
  boot: { mode: "full" },
  sound: { enabled: true, volume: 50, muted: false, packByTheme: {}, mix: { ui: 100, alerts: 100, boot: 100, text: 60, typing: 60, modules: 80 }, typing: false },
  notifications: { screen: true, sound: true, system: true, systemOnlyAway: true, voice: true },
  keys: {},
  favorites: [],
  session: {},
  layout: {},
  fxByTheme: {},
  moduleSettings: {},
  moduleTags: {},
  gamepad: { wheel: [] },
  keyOverrides: {},
  menu: { doubleShift: true, keys: {} },
  panel: { shown: false, widgets: ["clock", "system"], heights: {}, tops: {} },
  shell: {
    mode: "system",
    prompt: "icebreaker",
    bridge: "more",
    macrosShown: true,
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
    reads: "given",
    model: "claude-opus-5-5",
    effort: "medium",
    ollamaHost: "http://localhost:11434",
    ollamaModel: "llama3.1",
    saveChats: true,
  },
  journal: { folder: "journal" },
  privacy: { stealth: false },
  updates: { check: "daily", download: true, install: "ask", endpoint: "" },
  voice: { subtitles: true, enabled: false, engine: "auto", name: "", rate: 1.1, robot: 100, volume: 50, readAI: false, greet: true, language: "en", speak: { errors: true, reminders: true, timers: true, calendar: true, weather: false, time: false, system: true, modules: true } },
  editor: { autosave: true, tabSize: 2, treeWheel: true },
  // the community index: a JSON list of plugins/themes (see docs/COMMUNITY.md)
  plugins: { enabled: [], disabled: [], removed: [], registry: "https://raw.githubusercontent.com/kiddoko/icebreaker-modules/main/index.json", sources: [], granted: {}, pinned: {}, revoked: {}, always: {}, model: 2 },
  // empty = the default layout (widgets/builtin.ts)
  home: { widgets: [], links: [], weatherCity: "Paris", worldClocks: ["America/New_York", "Europe/London", "Asia/Tokyo"], newsTopic: "", newsInterests: [], newsPage: {}, weatherPlaces: [], clockStyle: "dots", clockSeconds: false, widgetConfig: {} },
};

type Listener = (path: string) => void;

/** Changed by the deck itself, or not safe to flip back with ⌘Z (accounts, modules, the vault). */
const NOT_UNDONE = ["session", "setup", "vault", "plugins", "fxByTheme"];

function clone<T>(v: T): T {
  return v === undefined ? v : (JSON.parse(JSON.stringify(v)) as T);
}

/**
 * What a setting may hold, wherever the value comes from (`config set`, a module, a file
 * edited by hand, a vault from another computer): a number stays in its range, a choice is
 * one of its words, a name has no control characters. A text size of 0, an interface at
 * 1 000 000 % or a journal folder "../.." would leave a deck nobody can use — or reach —
 * until the file is fixed by hand.
 */
const RANGES: Record<string, [number, number]> = {
  "appearance.fontSize": [8, 40],
  "appearance.scale": [25, 200],
  "appearance.maxFps": [0, 240],
  "appearance.brightness": [50, 150],
  "appearance.textSpeed": [0, 100],
  "fx.screensaverMinutes": [0, 600],
  "fx.levels.bloom": [0, 200],
  "fx.levels.scanlines": [0, 200],
  "fx.levels.vignette": [0, 200],
  "fx.levels.chroma": [0, 100],
  "fx.levels.sharpness": [0, 100],
  "fx.levels.glow": [0, 200],
  "fx.levels.curve": [0, 100],
  "fx.flickerSpeed": [10, 300],
  "sound.volume": [0, 100],
  "voice.rate": [0.5, 2],
  "voice.robot": [0, 100],
  "voice.volume": [0, 100],
  "editor.tabSize": [1, 8],
};
const CHOICES: Record<string, string[]> = {
  "appearance.fontWeight": ["thin", "light", "regular"],
  "appearance.smooth": ["auto", "60", "120"],
  "boot.mode": ["full", "fast", "off"],
  "shell.mode": ["system", "ibsh"],
  "shell.prompt": ["icebreaker", "mine"],
  "shell.bridge": ["off", "notes", "more"],
  "ai.reads": ["nothing", "given", "all"],
  "voice.engine": ["auto", "piper", "system"],
  "voice.language": ["en", "fr", "ja"],
  "updates.check": ["daily", "start", "never"],
  "updates.install": ["ask", "auto"],
  "user.language": ["en", "fr"],
};
/** a folder of the vault for the deck's own use: inside it, never the deck's or the system's own */
function safeFolder(v: string, fallback: string): string {
  const parts = v.replace(/\\/g, "/").split("/").map((x) => x.trim()).filter((x) => x && x !== "." && x !== "..");
  const out = parts.join("/").replace(/[\u0000-\u001f\u007f]/g, "");
  return !out || out.length > 200 || /^\.(icebreaker|trash|git|obsidian)(\/|$|-)/i.test(out) ? fallback : out;
}

/** The value a setting really takes (`fallback`: what it has now, or its default). Throws on a choice that doesn't exist. */
export function limitSetting(path: string, value: unknown, fallback: unknown, strict = true): unknown {
  const range = RANGES[path] ?? (path.startsWith("sound.mix.") ? [0, 100] : undefined);
  if (range) {
    if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
    return Math.min(range[1], Math.max(range[0], value));
  }
  const choices = CHOICES[path];
  if (choices) {
    if (typeof value === "string" && choices.includes(value)) return value;
    if (strict) throw new Error(`${path}: one of ${choices.join(", ")}`);
    return fallback;
  }
  if (typeof value === "number" && !Number.isFinite(value)) return fallback;
  if (typeof value === "string") {
    if (path === "journal.folder") return safeFolder(value, typeof fallback === "string" && fallback ? fallback : "journal");
    // a name shown everywhere (the prompt, the status bar, the files it signs): no control characters, a sane length
    if (path === "user.handle") return value.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, "").trim().slice(0, 32) || (typeof fallback === "string" && fallback ? fallback : "netrunner");
  }
  return value;
}

/** Every limited setting of a whole settings object, put right in place (what a file or a vault brought). */
export function limitAll(data: Settings): void {
  const paths = [...Object.keys(RANGES), ...Object.keys(CHOICES), "journal.folder", "user.handle", ...Object.keys((data.sound?.mix ?? {}) as object).map((k) => `sound.mix.${k}`)];
  for (const path of paths) {
    const keys = path.split(".");
    const last = keys.pop()!;
    let o = data as unknown as Record<string, unknown>;
    let def = DEFAULT_SETTINGS as unknown as Record<string, unknown>;
    for (const k of keys) {
      o = (o?.[k] ?? undefined) as Record<string, unknown>;
      def = (def?.[k] ?? {}) as Record<string, unknown>;
    }
    if (!o || typeof o !== "object" || !(last in o)) continue;
    o[last] = limitSetting(path, o[last], def[last], false);
  }
}

/**
 * 0.6's permissions (plugins/permissions.ts), for an account made before: what each module
 * was approved for stays what it may do — the old names are translated, what every module
 * could do without asking (notify, run the deck's commands) is written down, and the
 * high-risk ones it already had aren't asked again. The AI keeps reading the whole vault
 * as it did (a new account starts on "what you give it").
 */
export function migratePermissions(data: Settings, raw: Record<string, unknown>): void {
  const had = raw && typeof raw === "object" && Object.keys(raw).length > 0;
  const p = data.plugins;
  p.revoked = isRecord(p.revoked) ? p.revoked : {};
  p.always = isRecord(p.always) ? p.always : {};
  const rawPlugins = (raw?.plugins ?? {}) as Record<string, unknown>;
  if (had && rawPlugins.model !== 2) {
    const granted: Record<string, string[]> = {};
    for (const [id, list] of Object.entries(isRecord(p.granted) ? p.granted : {})) {
      if (!Array.isArray(list)) continue;
      granted[id] = migrateGranted(list);
      p.always[id] = granted[id].filter((x) => levelRank(levelOf(x)) >= levelRank("high"));
    }
    p.granted = granted;
  }
  p.model = 2;
  const rawAi = (raw?.ai ?? {}) as Record<string, unknown>;
  if (had && rawAi.reads === undefined) data.ai.reads = "all";
}

const isRecord = (v: unknown): v is Record<string, string[]> => !!v && typeof v === "object" && !Array.isArray(v);

export class SettingsStore {
  data: Settings;
  secrets: Secrets;
  /** the file as it was read: keys a newer ICEBREAKER wrote are kept when this one saves */
  private raw: Record<string, unknown> = {};
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
    // (migrations from before 0.4.0 are gone: update through 0.4.x first)
    // the community index moved to icebreaker-modules
    if (data.plugins.registry === "https://raw.githubusercontent.com/kiddoko/icebreaker-community/main/index.json") data.plugins.registry = DEFAULT_SETTINGS.plugins.registry;
    migratePermissions(data, safeJson(raw));
    limitAll(data); // whatever the file holds: every value in its range
    const secrets = { anthropicApiKey: "", ...(safeJson(rawSecrets) as Partial<Secrets>) };
    const store = new SettingsStore(platform, data, secrets);
    store.raw = safeJson(raw);
    return store;
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
    const before = target[last];
    const like = defaults[last] ?? target[last];
    const next = coerce(value, like);
    // a section isn't a value: `config set fx.levels x` would replace the whole section by a word
    if (like !== null && like !== undefined && next !== null && !sameKind(like, next)) throw new Error(`${path}: expected ${Array.isArray(like) ? "a list" : typeof like === "object" ? "its own keys (config list shows them)" : `a ${typeof like}`}`);
    target[last] = limitSetting(path, next, before);
    const after = target[last];
    if (this.history && !NOT_UNDONE.some((k) => path === k || path.startsWith(k + ".")) && JSON.stringify(before) !== JSON.stringify(after)) {
      const was = clone(before);
      const now = clone(after);
      this.history.record({
        label: path,
        key: `set:${path}`,
        undo: () => this.revert(path, was),
        redo: () => this.revert(path, now),
      });
    }
    this.listeners.forEach((fn) => fn(path));
    this.scheduleSave();
  }

  /** The undo history (core/undo.ts) every change goes into, and what puts it on screen again. */
  history?: UndoHistory;
  onRevert?: (path: string) => void;

  private revert(path: string, value: unknown): void {
    this.set(path, clone(value));
    this.onRevert?.(path);
  }

  setSecret<K extends keyof Secrets>(key: K, value: Secrets[K]): Promise<void> {
    this.secrets[key] = value;
    if (this.readOnly) return Promise.resolve();
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
  /** nobody logged in (the login screen): settings are defaults, and nothing is written */
  readOnly = false;

  /** Write now (before a reload: logging out, switching account). */
  async flush(): Promise<void> {
    if (this.frozen || this.readOnly) return;
    clearTimeout(this.saveTimer);
    await this.platform.config.write("settings.json", this.serialize()).catch(saveFailed);
  }

  /** What's saved: the settings, over the keys this version doesn't know (a newer one wrote them: they stay). */
  serialize(): string {
    return JSON.stringify(keepUnknown(this.raw, this.data as unknown as Record<string, unknown>), null, 2);
  }

  /** Stop writing settings.json (before a factory reset moves the folder away). */
  freeze(): void {
    this.frozen = true;
    clearTimeout(this.saveTimer);
  }

  private scheduleSave(): void {
    if (this.frozen || this.readOnly) return;
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      this.platform.config.write("settings.json", this.serialize()).catch(saveFailed);
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

export function deepMerge(base: Record<string, unknown> | object, extra: Record<string, unknown>): object {
  const b = base as Record<string, unknown>;
  // an empty default ({}) is a free-form record (your keys, module settings, the session):
  // everything saved in it is kept, not only the keys the defaults know about
  const record = Object.keys(b).length === 0;
  for (const [k, v] of Object.entries(extra)) {
    if (v && typeof v === "object" && !Array.isArray(v) && b[k] && typeof b[k] === "object" && !Array.isArray(b[k])) deepMerge(b[k] as object, v as Record<string, unknown>);
    else if (record) b[k] = v;
    else if (k in b && (b[k] === null || sameKind(b[k], v))) b[k] = v;
    // unknown keys are left out (kept in the file, see keepUnknown); a value of another
    // kind (another ICEBREAKER changed what this setting is) leaves the default
  }
  return b;
}

/** Same JSON kind (number, text, list, object…): a setting can be taken as it is. */
function sameKind(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) || Array.isArray(b)) return Array.isArray(a) && Array.isArray(b);
  if (a === null || b === null) return true;
  return typeof a === typeof b;
}

/**
 * `data` over `raw`, deeply: keys this version doesn't know (a newer one wrote them)
 * are kept, so going back and forth between versions loses nothing. Free-form
 * records (empty defaults: your keys, module settings) are `data`'s alone — what
 * you deleted there stays deleted.
 */
export function keepUnknown(raw: Record<string, unknown>, data: Record<string, unknown>, defaults: unknown = DEFAULT_SETTINGS): Record<string, unknown> {
  const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);
  const def = isObj(defaults) ? defaults : {};
  const out: Record<string, unknown> = {};
  if (Object.keys(def).length) for (const [k, v] of Object.entries(raw)) if (!(k in def) && !(k in data)) out[k] = v;
  for (const [k, v] of Object.entries(data)) {
    const r = raw[k];
    out[k] = isObj(v) && isObj(r) && isObj(def[k]) && Object.keys(def[k] as object).length ? keepUnknown(r, v, def[k]) : v;
  }
  return out;
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

/** Writing settings before anyone has logged in is refused by the native side ("locked"):
 *  expected at boot, so only real failures are logged. */
function saveFailed(e: unknown): void {
  if (/locked/i.test(String(e))) return;
  console.error("settings save failed", e);
}
