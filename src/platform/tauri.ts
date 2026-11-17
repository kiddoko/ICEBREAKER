import { Channel, invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { Platform, SystemStats, VaultEntry } from "./types";

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
    },
    config: {
      read: (name) => invoke<string | null>("config_read", { name }),
      write: (name, content) => invoke<void>("config_write", { name, content }),
    },
    system: { stats: () => invoke<SystemStats>("system_stats") },
    envApiKey: () => invoke<string | null>("env_api_key"),
    claudeCode: {
      detect: () => invoke<string | null>("claude_code_detect"),
      run: (req, onLine) => {
        const ch = new Channel<string>();
        ch.onmessage = onLine;
        return invoke<{ code: number; stderr: string }>("claude_code_run", { req, onLine: ch });
      },
      cancel: (id) => invoke<void>("claude_code_cancel", { id }),
    },
    window: {
      setFullscreen: (on) => win.setFullscreen(on),
      isFullscreen: () => win.isFullscreen(),
      quit: () => invoke<void>("app_quit"),
    },
  };
}
