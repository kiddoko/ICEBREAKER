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
  /** Moves to <vault>/.trash — the only way the deck deletes something. */
  trash(path: string): Promise<string>;
  /**
   * Deletes for good something already in <vault>/.trash (TRASH → delete permanently,
   * `trash purge`). Refused for any path outside .trash (vault.rs vault_purge).
   */
  purge(path: string): Promise<void>;
  rename(from: string, to: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  /** Raw bytes of a file, at most 256 MB. */
  readBytes?(path: string): Promise<ArrayBuffer>;
  /** Write raw bytes (atomic, like `write`), at most 256 MB. */
  writeBytes?(path: string, data: ArrayBuffer | Uint8Array): Promise<void>;
  /** Vault encryption (desktop only; src-tauri/src/store.rs, docs/ENCRYPTION.md). */
  crypt?: VaultCrypt;
  /** Move the whole vault to a new or empty folder (every file copied and checked; the deck switches to it). Returns the new path. */
  move?(dest: string): Promise<string>;
  /** After move: remove the old folder (only the one the vault came from). */
  moveCleanup?(): Promise<void>;
  /** The vault open before the last mount of another folder is removed if it holds only what the deck wrote in it (true: removed). */
  discardSeed?(): Promise<boolean>;
}

export interface VaultCryptStatus {
  encrypted: boolean;
  /** an encrypted vault opened by the login's password (its key in the native side's memory only) */
  unlocked: boolean;
  /** it has a recovery key */
  recovery: boolean;
  /** encrypt / decrypt / export running */
  busy: boolean;
  /** what unlocking found and fixed (files recovered into .trash, a rebuilt index) */
  notes: string[];
  /** plain files next to the encrypted vault (an older ICEBREAKER or another app wrote them): vault adopt */
  leftovers: number;
}

export interface VaultCryptReport {
  files: number;
  folders: number;
  bytes: number;
  /** the plain backup zip made first (encrypt) */
  backup?: string;
  /** plain files that couldn't be removed afterwards (encrypt) */
  left: string[];
  /** the recovery key's 24 words (encrypt): shown once, kept nowhere */
  recovery?: string;
}

export interface VaultCrypt {
  status(): Promise<VaultCryptStatus>;
  /** `password` = the logged-in account's; `stamp` names the backup zip (local date). */
  encrypt(password: string, stamp: string): Promise<VaultCryptReport>;
  decrypt(password: string): Promise<VaultCryptReport>;
  /** A plain copy in `dest` (a new or empty folder outside the vault). */
  /** `password`: the logged-in account's, checked by the native side */
  export(dest: string, password: string): Promise<VaultCryptReport>;
  unlock(password: string): Promise<void>;
  /** A new recovery key (the old one stops working); `password` = the account's. Returns its 24 words. */
  newRecovery(password: string): Promise<string>;
  /** The recovery key opens the mounted vault; the account's `password` opens it from now on. */
  recover(words: string, password: string): Promise<void>;
  /** A new vault key: everything encrypted again, a new recovery key (its words in the report). */
  rekey(password: string): Promise<VaultCryptReport>;
  /** The plain files next to the encrypted vault go inside it. */
  adopt(): Promise<VaultCryptReport>;
}

/** a graphics card (src-tauri/src/gpu.rs): its name, and what the system tells of it */
export interface GpuStats {
  name: string;
  /** 0..100 */
  busy?: number | null;
  memUsed?: number | null;
  memTotal?: number | null;
  temp?: number | null;
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
  /** the busiest processes, by cpu (cpu in % of ONE core); absent from older builds */
  top?: { name: string; cpu: number; mem: number }[];
  /** the disks: mount point, name, bytes */
  disks?: { mount: string; name: string; total: number; available: number; removable: boolean }[];
  /** bytes received / sent since the computer started (the rate is the difference over time) */
  netRx?: number;
  netTx?: number;
  /** load average over 1, 5, 15 minutes (0 where there's none: Windows) */
  load?: [number, number, number];
}

export interface Platform {
  kind: "desktop" | "web";
  vault: VaultBackend;
  /** App config files (settings.json, secrets.json). */
  config: {
    /** settings.json, secrets.json, access.json (the access journal): the unlocked account's (nothing while locked) · device.json: the deck's own */
    read(name: "settings.json" | "secrets.json" | "device.json" | "access.json"): Promise<string | null>;
    write(name: "settings.json" | "secrets.json" | "device.json" | "access.json", content: string): Promise<void>;
  };
  system: {
    stats(): Promise<SystemStats>;
    /** the graphics cards, as far as the system says without privileges (none: [] — the page uses WebGL's name) */
    gpu?(): Promise<GpuStats[]>;
    /** on battery (true), on the mains (false), can't tell (null): the smoothness setting */
    onBattery?(): Promise<boolean | null>;
  };
  /** ANTHROPIC_API_KEY from the environment, if set. */
  envApiKey(): Promise<string | null>;
  /** The local Claude Code CLI (desktop only). Runs on the user's Claude plan instead of an API key. */
  /** Google News RSS (desktop only — feeds have no CORS). */
  newsRss?(query: string, lang: string, country: string, provider?: "google" | "bing"): Promise<string>;
  /**
   * ICEBREAKER updating itself (desktop): check (`endpoint`: where the releases are, empty =
   * the official place), download (progress: done / total bytes), install (then it restarts).
   * Every update is signed; an unsigned one is refused by the native side.
   */
  appUpdate?: {
    check(endpoint?: string): Promise<AppUpdateInfo | null>;
    download(onProgress?: (done: number, total: number | null) => void): Promise<AppUpdateInfo>;
    /** restart: start the new version at once (default); false: the next launch will */
    install(restart?: boolean): Promise<void>;
  };
  /** GET a text file over https (or http on the local network): the STORE's indexes and downloads. */
  netGet?(url: string): Promise<string>;
  /** Open an https link in the default browser (desktop only). */
  openUrl?(url: string): Promise<void>;
  claudeCode?: {
    detect(): Promise<string | null>;
    run(req: { id: string; prompt: string; system: string; resume?: string | null; model?: string; writes?: boolean; reads?: "nothing" | "given" | "all" }, onLine: (line: string) => void): Promise<{ code: number; stderr: string }>;
    cancel(id: string): Promise<void>;
  };
  /**
   * The deck account (login at start-up). Passwords are hashed with Argon2id
   * on the native side; the hash never comes back here (see account.rs).
   */
  account: {
    /** The unlocked account's name (null: locked). */
    status(): Promise<string | null>;
    /** The account unlocked in this run of the app (survives a page reload), or null. */
    session(): Promise<{ id: string; user: string } | null>;
    /** How many accounts there are (0: the first one is made on the login screen). */
    count(): Promise<number>;
    /** A new account, unlocked at once. Every account after the first needs an existing one's name + password. */
    create(user: string, password: string, approver?: string, approverPassword?: string): Promise<{ id: string; user: string }>;
    /** Right name + password → that account is unlocked (its settings are the ones read and written). */
    verify(user: string, password: string): Promise<boolean>;
    /** Right name + password of an account of this deck? Checked only: nothing is unlocked. */
    check(user: string, password: string): Promise<boolean>;
    /** No account unlocked any more. */
    lock(): Promise<void>;
    change(password: string, newUser: string, newPassword: string): Promise<void>;
    /** Delete the unlocked account and its settings (its vault stays). */
    remove(password: string): Promise<void>;
    /**
     * Forgot password (desktop): the account's encrypted vault's recovery key sets a new password for both; the
     * account is unlocked. With `path`: a vault from another computer (the account is made here if needed, approved).
     */
    recover?(user: string, words: string, newPassword: string, path?: string, approver?: string, approverPassword?: string): Promise<{ id: string; user: string }>;
    /** Open a vault (a USB key, another computer's): its account's name + password → that account here, its settings with it. */
    openVault?(path: string, user: string, password: string, approver?: string, approverPassword?: string): Promise<{ id: string; user: string }>;
    /** After mounting: true if the vault brought newer settings (changed on another computer) → reload the deck. */
    /** "taken": newer settings came from the vault (reload) · "ask": a plain vault brings newer ones, call again with your answer */
    syncVault?(accept?: boolean): Promise<"none" | "ask" | "taken">;
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
    /**
     * Sign in in the browser. Resolves once the token is saved (up to 5 minutes);
     * `onPhase` hears "browser" (waiting for you there) then "token" (Google answered).
     */
    connect(onPhase?: (phase: string) => void): Promise<void>;
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
  /**
   * The encoder pack (desktop, see encoders.rs): a small LGPL ffmpeg downloaded on request
   * (`encoders install`) that turns raw sound into MP3, M4A, OGG or Opus.
   */
  encoders?: {
    info(): Promise<EncodersInfo>;
    /** downloads and checks the pack; resolves with its release ("encoders-v1") */
    install(): Promise<string>;
    /** resolves with whether there was one */
    remove(): Promise<boolean>;
    /** f32 interleaved sound → the file's bytes */
    encode(pcm: Float32Array, opts: EncodeOptions): Promise<Uint8Array>;
  };
  /** A system notification (desktop: the OS's own, with the app's name). */
  notify?(title: string, body: string): Promise<void>;
  /** Called (debounced) when files in the vault change outside the app. */
  onVaultChange?(cb: () => void): void;
  /** A deck item of the macOS menu bar was clicked: its id (workspace/macmenu.ts). */
  onMenu?(cb: (id: string) => void): void;
  /** The window got minimized (true) or restored (false). */
  onMinimized?(cb: (minimized: boolean) => void): Promise<void>;
  /** The whole computer, read-only, for the deck's own file picker (desktop). */
  files?: {
    home(): Promise<string>;
    list(path: string): Promise<{ name: string; path: string; isDir: boolean; size: number }[]>;
    readText(path: string): Promise<string>;
    /** a sound or a picture (64 MB at most), for a module's import of a file the user chose */
    readBytes?(path: string): Promise<ArrayBuffer>;
    /** Copy a file / folder from the computer into a vault folder (never overwrites). Returns its vault path. */
    importInto(src: string, dir: string): Promise<string>;
    /**
     * Files dragged from the Finder / Explorer over the window: "over" while
     * they move (x, y in CSS pixels), "drop" with their paths, "leave".
     */
    onDragDrop(cb: (e: { type: "over" | "drop" | "leave"; paths: string[]; x: number; y: number }) => void): void;
  };
  /** Your system shell in a pseudo-terminal (desktop). */
  pty?: {
    /** Starts the shell; resolves with its name ("zsh"). */
    /** `modules`: command names that win over same-named system programs (cal, todo…). */
    spawn(id: string, cols: number, rows: number, onData: (text: string) => void, modules?: string[], prompt?: "icebreaker" | "mine"): Promise<string>;
    write(id: string, data: string): Promise<void>;
    resize(id: string, cols: number, rows: number): Promise<void>;
    kill(id: string): Promise<void>;
  };
  /** ICEBREAKER commands typed in the system shell arrive here (see term.rs). */
  bridge?: {
    onRun(cb: (req: { id: string; line: string; cwd: string }) => void): void;
    /** `status`, with `done`: the command's exit code (the shell's $? and its prompt's ✕) */
    send(id: string, chunk: string | null, done: boolean, found: boolean, status?: number): void;
  };
  /**
   * Developer tools (src-tauri/src/dev.rs): back to a first launch. Only a build made with
   * `--features dev-tools` (npm run app:mac) has them — `available()` says so, and the deck
   * registers `factory-reset` only then (deck.ts registerCore).
   */
  dev?: { available(): Promise<boolean>; factoryReset(password: string): Promise<string[]>; restart(): Promise<void> };
  window: {
    setFullscreen(on: boolean): Promise<void>;
    isFullscreen(): Promise<boolean>;
    /** how tall the screen's camera notch is, in CSS pixels (0 without one; desktop macOS only) */
    notch?(): Promise<number>;
    quit(): Promise<void>;
    /**
     * Quitting was asked from outside the page (⌘Q, the close button, the Dock): `cb` saves
     * what must be saved, then calls quit() — or quitCancelled() when a page kept it open.
     */
    onQuitRequested?(cb: () => void): void;
    quitCancelled?(): Promise<void>;
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

/** A newer ICEBREAKER (platform.appUpdate). */
export interface AppUpdateInfo {
  version: string;
  current: string;
  notes: string;
  date: string;
  downloaded: boolean;
}

export interface EncodersInfo {
  installed: boolean;
  version: string | null;
  formats: string[];
  /** there's a pack for this computer (macOS, Windows, Linux x64) */
  supported: boolean;
}

export interface EncodeOptions {
  format: "mp3" | "m4a" | "ogg" | "opus";
  /** mp3 v0 | v2 | 128 | 192 | 256 | 320 · m4a 128 | 192 | 256 · ogg q4 | q6 | q8 · opus 96 | 128 | 160; "" = the default */
  quality?: string;
  rate: number;
  channels: 1 | 2;
  title?: string;
}
