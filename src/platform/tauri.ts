import { listen } from "@tauri-apps/api/event";
import { Channel, invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { getCurrentWebview } from "@tauri-apps/api/webview";
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
      destroy: (confirm) => invoke<number>("vault_destroy", { confirm }),
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
    notify: async (title, body) => {
      const n = await import("@tauri-apps/plugin-notification");
      if (!(await n.isPermissionGranted()) && (await n.requestPermission()) !== "granted") throw new Error("notifications aren't allowed (system settings)");
      n.sendNotification({ title, body });
    },
    netGet: (url) => invoke<string>("net_get", { url }),
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
      session: () => invoke<{ id: string; user: string } | null>("account_session"),
      count: () => invoke<number>("account_count"),
      create: (user, password, approver, approverPassword) => invoke<{ id: string; user: string }>("account_create", { user, password, approver: approver ?? null, approverPassword: approverPassword ?? null }),
      verify: (user, password) => invoke<boolean>("account_verify", { user, password }),
      lock: () => invoke<void>("account_lock"),
      change: (password, newUser, newPassword) => invoke<void>("account_change", { password, newUser, newPassword }),
      remove: (password) => invoke<void>("account_remove", { password }),
    },
    onVaultChange: (cb) => void listen("vault-fs", () => cb()),
    files: {
      home: () => invoke<string>("fs_home"),
      list: (path) => invoke("fs_list", { path }),
      readText: (path) => invoke<string>("fs_read_text", { path }),
      importInto: (src, dir) => invoke<string>("vault_import", { src, dir }),
      onDragDrop: (cb) => {
        let paths: string[] = [];
        void getCurrentWebview().onDragDropEvent((ev) => {
          const p = ev.payload;
          const dpr = window.devicePixelRatio || 1;
          const at = "position" in p ? { x: p.position.x / dpr, y: p.position.y / dpr } : { x: 0, y: 0 };
          if (p.type === "enter") paths = p.paths;
          if (p.type === "enter" || p.type === "over") cb({ type: "over", paths, ...at });
          else if (p.type === "drop") cb({ type: "drop", paths: p.paths, ...at });
          else cb({ type: "leave", paths: [], x: 0, y: 0 });
        });
      },
    },
    onMinimized: async (cb) => {
      let was = false;
      await win.onResized(async () => {
        const min = await win.isMinimized().catch(() => false);
        if (min !== was) cb((was = min));
      });
    },
    pty: {
      spawn: (id, cols, rows, onData, modules, prompt) => {
        const ch = new Channel<string>();
        ch.onmessage = onData;
        return invoke<string>("pty_spawn", { id, cols, rows, onData: ch, modules: modules ?? [], prompt: prompt ?? "icebreaker" });
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
      // the deck's full screen covers the whole display (src-tauri/src/screen.rs)
      setFullscreen: (on) => invoke<void>("screen_fullscreen", { on }),
      isFullscreen: () => invoke<boolean>("screen_is_fullscreen"),
      notch: () => invoke<number>("screen_notch").catch(() => 0),
      quit: () => invoke<void>("app_quit"),
    },
  };
}
