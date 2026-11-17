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
  claudeCode?: {
    detect(): Promise<string | null>;
    run(req: { id: string; prompt: string; system: string; resume?: string | null; model?: string }, onLine: (line: string) => void): Promise<{ code: number; stderr: string }>;
    cancel(id: string): Promise<void>;
  };
  window: {
    setFullscreen(on: boolean): Promise<void>;
    isFullscreen(): Promise<boolean>;
    quit(): Promise<void>;
  };
}
