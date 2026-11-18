import { listen } from "@tauri-apps/api/event";
import { Channel, invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { LocalTrack, MediaStatus, Platform, PlayerStatus, SystemStats, VaultEntry } from "./types";

/**
 * Desktop platform: thin wrappers around the Rust commands defined in
 * src-tauri/src/*.rs. Each `invoke("name", args)` maps 1:1 to a
 * `#[tauri::command] fn name(...)` on the Rust side.
 */
export function createTauriPlatform(): Platform {
  const win = getCurrentWindow();
  return {
    kind: "desktop",
    vault: {
      mount: (absPath) => invoke<string>("vault_mount", { path: absPath }),
      defaultPath: () => invoke<string>("vault_default_path"),
      list: (dir) => invoke<VaultEntry[]>("vault_list", { path: dir }),
      walk: () => invoke<VaultEntry[]>("vault_walk"),
      read: (path) => invoke<string>("vault_read", { path }),
      readMany: (paths) => invoke<(string | null)[]>("vault_read_many", { paths }),
      write: (path, content) => invoke<void>("vault_write", { path, content }),
      mkdir: (path) => invoke<void>("vault_mkdir", { path }),
      trash: (path) => invoke<string>("vault_trash", { path }),
      rename: (from, to) => invoke<void>("vault_rename", { from, to }),
      exists: (path) => invoke<boolean>("vault_exists", { path }),
      readBytes: (path) => invoke<ArrayBuffer>("vault_read_bytes", { path }),
    },
    config: {
      read: (name) => invoke<string | null>("config_read", { name }),
      write: (name, content) => invoke<void>("config_write", { name, content }),
    },
    system: { stats: () => invoke<SystemStats>("system_stats") },
    envApiKey: () => invoke<string | null>("env_api_key"),
    newsRss: (query, lang, country, provider) => invoke<string>("news_rss", { query, lang, country, provider: provider ?? null }),
    openUrl: (url) => invoke<void>("open_url", { url }),
    claudeCode: {
      detect: () => invoke<string | null>("claude_code_detect"),
      run: (req, onLine) => {
        const ch = new Channel<string>();
        ch.onmessage = onLine;
        return invoke<{ code: number; stderr: string }>("claude_code_run", { req, onLine: ch });
      },
      cancel: (id) => invoke<void>("claude_code_cancel", { id }),
    },
    account: {
      status: () => invoke<string | null>("account_status"),
      create: (user, password) => invoke<void>("account_create", { user, password }),
      verify: (user, password) => invoke<boolean>("account_verify", { user, password }),
      change: (password, newUser, newPassword) => invoke<void>("account_change", { password, newUser, newPassword }),
      remove: (password) => invoke<void>("account_remove", { password }),
    },
    onVaultChange: (cb) => void listen("vault-fs", () => cb()),
    pty: {
      spawn: (id, cols, rows, onData, modules) => {
        const ch = new Channel<string>();
        ch.onmessage = onData;
        return invoke<string>("pty_spawn", { id, cols, rows, onData: ch, modules: modules ?? [] });
      },
      write: (id, data) => invoke<void>("pty_write", { id, data }),
      resize: (id, cols, rows) => invoke<void>("pty_resize", { id, cols, rows }),
      kill: (id) => invoke<void>("pty_kill", { id }),
    },
    bridge: {
      onRun: (cb) => void listen<{ id: string; line: string; cwd: string }>("bridge-run", (e) => cb(e.payload)),
      send: (id, chunk, done, found) => void invoke("bridge_send", { id, chunk, done, found }),
    },
    media: {
      status: () => invoke<MediaStatus | null>("media_status"),
      control: (action) => invoke<void>("media_control", { action }),
    },
    player: {
      scan: (folder) => invoke<LocalTrack[]>("audio_scan", { folder }),
      load: (path, play, duration) => invoke<void>("audio_load", { path, play, duration }),
      control: (action) => invoke<void>("audio_control", { action }),
      status: () => invoke<PlayerStatus>("audio_status"),
    },
    voice: {
      info: () => invoke("voice_info"),
      list: (engine) => invoke("voice_list", { engine }),
      speak: (text, engine, voice, rate) => invoke<ArrayBuffer>("voice_speak", { text, engine, voice, rate }),
      install: (lang) => invoke<string>("voice_install", { lang }),
    },
    google: {
      status: () => invoke<{ configured: boolean; custom: boolean; connected: boolean }>("google_status"),
      setup: (clientId, clientSecret) => invoke<void>("google_setup", { clientId, clientSecret }),
      connect: () => invoke<void>("google_connect"),
      disconnect: () => invoke<void>("google_disconnect"),
      calendar: (method, path, query, body) => invoke<string>("google_calendar", { method, path, query, body }),
      cache: (content) => invoke<string | null>("google_cache", { content: content ?? null }),
    },
    dev: {
      factoryReset: () => invoke<string[]>("dev_factory_reset"),
      restart: () => invoke<void>("dev_restart"),
    },
    window: {
      setFullscreen: (on) => win.setFullscreen(on),
      isFullscreen: () => win.isFullscreen(),
      quit: () => invoke<void>("app_quit"),
    },
  };
}
