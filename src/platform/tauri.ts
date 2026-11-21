import { listen } from "@tauri-apps/api/event";
import { Channel, invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import type { AppUpdateInfo, LocalTrack, MediaStatus, Platform, PlayerStatus, SystemStats, VaultCryptReport, VaultCryptStatus, VaultEntry } from "./types";

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
      purge: (path) => invoke<void>("vault_purge", { path }),
      rename: (from, to) => invoke<void>("vault_rename", { from, to }),
      exists: (path) => invoke<boolean>("vault_exists", { path }),
      readBytes: (path) => invoke<ArrayBuffer>("vault_read_bytes", { path }),
      move: (dest) => invoke<string>("vault_move", { dest }),
      moveCleanup: () => invoke<void>("vault_move_cleanup"),
      crypt: {
        status: () => invoke<VaultCryptStatus>("vault_crypt_status"),
        encrypt: (password, stamp) => invoke<VaultCryptReport>("vault_encrypt", { password, stamp }),
        decrypt: (password) => invoke<VaultCryptReport>("vault_decrypt", { password }),
        export: (dest, password) => invoke<VaultCryptReport>("vault_export", { dest, password }),
        unlock: (password) => invoke<void>("vault_unlock", { password }),
        newRecovery: (password) => invoke<string>("vault_recovery_new", { password }),
        recover: (words, password) => invoke<void>("vault_recover", { words, password }),
        adopt: () => invoke<VaultCryptReport>("vault_adopt"),
        rekey: (password) => invoke<VaultCryptReport>("vault_rekey", { password }),
      },
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
    appUpdate: {
      check: (endpoint) => invoke<AppUpdateInfo | null>("app_update_check", { endpoint: endpoint || null }),
      download: async (onProgress) => {
        const off = onProgress ? await listen<{ done: number; total: number | null }>("app-update-progress", (e) => onProgress(e.payload.done, e.payload.total)) : null;
        try {
          return await invoke<AppUpdateInfo>("app_update_download");
        } finally {
          off?.();
        }
      },
      install: (restart = true) => invoke<void>("app_update_install", { restart }),
    },
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
      recover: (user, words, newPassword, path, approver, approverPassword) =>
        invoke<{ id: string; user: string }>("account_recover", { user, words, newPassword, path: path ?? null, approver: approver ?? null, approverPassword: approverPassword ?? null }),
      openVault: (path, user, password, approver, approverPassword) =>
        invoke<{ id: string; user: string }>("account_open_vault", { path, user, password, approver: approver ?? null, approverPassword: approverPassword ?? null }),
      syncVault: (accept) => invoke<"none" | "ask" | "taken">("account_vault_sync", { accept: accept ?? null }),
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
      send: (id, chunk, done, found, status) => void invoke("bridge_send", { id, chunk, done, found, status: status ?? null }),
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
      // google_connect opens the browser and returns at once; the sign-in goes on in a thread
      // that we ask every second (one IPC call waiting minutes is what got lost on Windows)
      connect: async (onPhase) => {
        const id = await invoke<number>("google_connect");
        let seen = "";
        for (;;) {
          await new Promise((r) => setTimeout(r, 1000));
          const f = await invoke<{ id: number; phase: string; error: string | null }>("google_connect_result");
          if (f.id !== id) throw new Error("google: another sign-in started");
          if (f.phase !== seen) onPhase?.((seen = f.phase));
          if (f.phase === "done") return;
          if (f.phase === "failed") throw new Error(f.error ?? "google: the sign-in failed");
        }
      },
      disconnect: () => invoke<void>("google_disconnect"),
      calendar: (method, path, query, body) => invoke<string>("google_calendar", { method, path, query, body }),
      cache: (content) => invoke<string | null>("google_cache", { content: content ?? null }),
    },
    dev: {
      available: () => invoke<boolean>("dev_tools_available"),
      factoryReset: (password) => invoke<string[]>("dev_factory_reset", { password }),
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
