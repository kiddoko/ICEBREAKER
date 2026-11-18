/**
 * Everything ICEBREAKER needs from the host OS, behind one interface.
 *
 *  - platform/tauri.ts  the real desktop app (Rust commands in src-tauri/)
 *  - platform/web.ts    plain browser (`npm run dev`): in-memory demo vault,
 *                       handy for hacking on the UI without compiling Rust.
 */

export interface VaultEntry {
  /** Vault-relative POSIX path, e.g. "journal/2026-11-17.md" ("" is the root). */
  path: string;
  name: string;
  isDir: boolean;
  size: number;
  /** Last modification, ms since epoch. */
  modified: number;
}

export interface VaultBackend {
  /** Mount a folder as the vault (created if missing). Returns the absolute path. */
  mount(absPath: string): Promise<string>;
  defaultPath(): Promise<string>;
  list(dir: string): Promise<VaultEntry[]>;
  /** Every file and folder, recursively (dot-folders like .git/.obsidian skipped). */
  walk(): Promise<VaultEntry[]>;
  read(path: string): Promise<string>;
  readMany(paths: string[]): Promise<(string | null)[]>;
  write(path: string, content: string): Promise<void>;
  mkdir(path: string): Promise<void>;
  /** Moves to <vault>/.trash — nothing is ever hard-deleted. */
  trash(path: string): Promise<string>;
  rename(from: string, to: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  /** Raw bytes of a small file (desktop only). */
  readBytes?(path: string): Promise<ArrayBuffer>;
}

export interface SystemStats {
  cpu: number; // 0..100
  cores: number[];
  memUsed: number; // bytes
  memTotal: number;
  swapUsed: number;
  swapTotal: number;
  uptime: number; // seconds
  host: string;
  os: string;
  kernel: string;
  cpuBrand: string;
  processes: number;
  arch: string;
}

export interface Platform {
  kind: "desktop" | "web";
  vault: VaultBackend;
  /** App config files (settings.json, secrets.json). */
  config: {
    read(name: "settings.json" | "secrets.json"): Promise<string | null>;
    write(name: "settings.json" | "secrets.json", content: string): Promise<void>;
  };
  system: { stats(): Promise<SystemStats> };
  /** ANTHROPIC_API_KEY from the environment, if set. */
  envApiKey(): Promise<string | null>;
  /** The local Claude Code CLI (desktop only). Runs on the user's Claude plan instead of an API key. */
  /** Google News RSS (desktop only — feeds have no CORS). */
  newsRss?(query: string, lang: string, country: string, provider?: "google" | "bing"): Promise<string>;
  /** GET a text file over https (or http on the local network): the STORE's indexes and downloads. */
  netGet?(url: string): Promise<string>;
  /** Open an https link in the default browser (desktop only). */
  openUrl?(url: string): Promise<void>;
  claudeCode?: {
    detect(): Promise<string | null>;
    run(req: { id: string; prompt: string; system: string; resume?: string | null; model?: string; writes?: boolean }, onLine: (line: string) => void): Promise<{ code: number; stderr: string }>;
    cancel(id: string): Promise<void>;
  };
  /**
   * The deck account (login at start-up). Passwords are hashed with Argon2id
   * on the native side; the hash never comes back here (see account.rs).
   */
  account: {
    /** Account name, or null when there's no lock. */
    status(): Promise<string | null>;
    create(user: string, password: string): Promise<void>;
    verify(user: string, password: string): Promise<boolean>;
    change(password: string, newUser: string, newPassword: string): Promise<void>;
    remove(password: string): Promise<void>;
  };
  /**
   * What's playing on this computer and play/pause/next/volume (desktop:
   * Spotify + Music on macOS, any MPRIS player through playerctl on Linux).
   */
  media?: {
    status(): Promise<MediaStatus | null>;
    /** toggle · play · pause · next · prev · vol+ · vol- · vol:<0-100> */
    control(action: string): Promise<void>;
  };
  /** Local music player: scan a folder, play files (desktop, see audio.rs). */
  player?: {
    scan(folder: string): Promise<LocalTrack[]>;
    load(path: string, play: boolean, duration?: number): Promise<void>;
    /** play · pause · toggle · stop · seek:<seconds> · vol:<0-100> */
    control(action: string): Promise<void>;
    status(): Promise<PlayerStatus>;
  };
  /** Google account through your own OAuth client (desktop, see google.rs). */
  google?: {
    status(): Promise<{ configured: boolean; custom: boolean; connected: boolean }>;
    setup(clientId: string, clientSecret: string): Promise<void>;
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    /** Raw Calendar API v3 call; `path` is relative to /calendar/v3/. Returns the JSON text. */
    calendar(method: string, path: string, query?: string, body?: string): Promise<string>;
    /** Offline copy of Google data, kept outside the vault. No argument = read. */
    cache(content?: string): Promise<string | null>;
  };
  /** Local text-to-speech (desktop, see voice.rs): WAV bytes to play through the robot filter. */
  voice?: {
    info(): Promise<{ system: string | null; piper: boolean; piper_voices: string[] }>;
    list(engine: "piper" | "system"): Promise<{ id: string; lang: string }[]>;
    speak(text: string, engine: "piper" | "system", voice: string, rate: number): Promise<ArrayBuffer>;
    /** downloads piper + a voice ("fr", "en"…); resolves with the voice id */
    install(lang: string): Promise<string>;
  };
  /** A system notification (desktop: the OS's own, with the app's name). */
  notify?(title: string, body: string): Promise<void>;
  /** Called (debounced) when files in the vault change outside the app. */
  onVaultChange?(cb: () => void): void;
  /** The window got minimized (true) or restored (false). */
  onMinimized?(cb: (minimized: boolean) => void): Promise<void>;
  /** Your system shell in a pseudo-terminal (desktop). */
  pty?: {
    /** Starts the shell; resolves with its name ("zsh"). */
    /** `modules`: command names that win over same-named system programs (cal, todo…). */
    spawn(id: string, cols: number, rows: number, onData: (text: string) => void, modules?: string[]): Promise<string>;
    write(id: string, data: string): Promise<void>;
    resize(id: string, cols: number, rows: number): Promise<void>;
    kill(id: string): Promise<void>;
  };
  /** ICEBREAKER commands typed in the system shell arrive here (see term.rs). */
  bridge?: {
    onRun(cb: (req: { id: string; line: string; cwd: string }) => void): void;
    send(id: string, chunk: string | null, done: boolean, found: boolean): void;
  };
  /** DEV ONLY — remove before release: back to a first launch (see dev.rs). */
  dev?: { factoryReset(): Promise<string[]>; restart(): Promise<void> };
  window: {
    setFullscreen(on: boolean): Promise<void>;
    isFullscreen(): Promise<boolean>;
    quit(): Promise<void>;
  };
}

export interface LocalTrack {
  path: string;
  title: string;
  artist: string;
  album: string;
  track: number;
  disc: number;
  year: number;
  /** seconds */
  duration: number;
}

export interface PlayerStatus {
  path: string | null;
  playing: boolean;
  position: number;
  duration: number;
  volume: number;
  /** the track played to its end */
  ended: boolean;
  error: string | null;
}

export interface MediaStatus {
  player: string;
  playing: boolean;
  title: string;
  artist: string;
  album: string;
  /** seconds */
  position: number;
  /** seconds, 0 = unknown */
  duration: number;
  /** 0–100 */
  volume: number | null;
}
