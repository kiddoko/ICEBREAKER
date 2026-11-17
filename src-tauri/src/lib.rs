//! ICEBREAKER — native side.
//!
//! The Rust part is deliberately small and boring: it only does what a web
//! page can't — touch files, read the system's vitals, store config. All the
//! UI and logic lives in TypeScript (../src). Every `#[tauri::command]` here is
//! called from src/platform/tauri.ts with `invoke("command_name", args)`.

mod config;
mod system;
mod vault;

pub fn run() {
    tauri::Builder::default()
        .manage(vault::VaultState::default())
        .manage(system::SystemState::default())
        .invoke_handler(tauri::generate_handler![
            vault::vault_default_path,
            vault::vault_mount,
            vault::vault_list,
            vault::vault_walk,
            vault::vault_read,
            vault::vault_read_many,
            vault::vault_write,
            vault::vault_mkdir,
            vault::vault_trash,
            vault::vault_rename,
            vault::vault_exists,
            config::config_read,
            config::config_write,
            config::env_api_key,
            config::app_quit,
            system::system_stats,
        ])
        .run(tauri::generate_context!())
        .expect("error while running ICEBREAKER");
}
