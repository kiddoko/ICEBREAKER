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
  /** Open an https link in the default browser (desktop only). */
  openUrl?(url: string): Promise<void>;
  claudeCode?: {
    detect(): Promise<string | null>;
    run(req: { id: string; prompt: string; system: string; resume?: string | null; model?: string }, onLine: (line: string) => void): Promise<{ code: number; stderr: string }>;
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
  window: {
    setFullscreen(on: boolean): Promise<void>;
    isFullscreen(): Promise<boolean>;
    quit(): Promise<void>;
  };
}
