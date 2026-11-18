//! ICEBREAKER — native side.
//!
//! The Rust part is deliberately small and boring: it only does what a web
//! page can't — touch files, read the system's vitals, store config. All the
//! UI and logic lives in TypeScript (../src). Every `#[tauri::command]` here is
//! called from src/platform/tauri.ts with `invoke("command_name", args)`.

mod account;
mod audio;
mod claude_code;
mod config;
mod dev; // DEV ONLY — remove before release
mod google;
mod media;
mod net;
mod term;
mod system;
mod vault;
mod voice;

pub fn run() {
    let builder = tauri::Builder::default();

    // macOS always has a menu bar. Tauri's default one maps ⌘W to "close window",
    // which would kill the app when you mean "close tab", so we provide a lean one.
    #[cfg(target_os = "macos")]
    let builder = builder.menu(mac_menu);

    builder
        .plugin(tauri_plugin_notification::init())
        .manage(vault::VaultState::default())
        .manage(system::SystemState::default())
        .manage(claude_code::ClaudeCodeState::default())
        .manage(account::AccountState::default())
        .manage(term::PtyState::default())
        .manage(term::BridgeState::default())
        .manage(google::GoogleState::default())
        .manage(audio::AudioState::default())
        .setup(|app| {
            term::start_bridge(app.handle());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            vault::vault_default_path,
            vault::vault_mount,
            vault::vault_list,
            vault::vault_walk,
            vault::vault_read,
            vault::vault_read_many,
            vault::vault_read_bytes,
            vault::vault_write,
            vault::vault_mkdir,
            vault::vault_trash,
            vault::vault_destroy,
            vault::vault_rename,
            vault::vault_exists,
            config::config_read,
            config::config_write,
            config::env_api_key,
            config::app_quit,
            system::system_stats,
            claude_code::claude_code_detect,
            claude_code::claude_code_run,
            claude_code::claude_code_cancel,
            net::news_rss,
            net::open_url,
            net::net_get,
            media::media_status,
            term::pty_spawn,
            term::pty_write,
            term::pty_resize,
            term::pty_kill,
            term::bridge_send,
            media::media_control,
            google::google_status,
            google::google_setup,
            google::google_connect,
            google::google_disconnect,
            google::google_calendar,
            google::google_cache,
            audio::audio_scan,
            audio::audio_load,
            audio::audio_control,
            audio::audio_status,
            voice::voice_info,
            voice::voice_list,
            voice::voice_speak,
            voice::voice_install,
            account::account_status,
            account::account_create,
            account::account_verify,
            account::account_change,
            account::account_remove,
            dev::dev_factory_reset, // DEV ONLY
            dev::dev_restart,       // DEV ONLY
        ])
        .run(tauri::generate_context!())
        .expect("error while running ICEBREAKER");
}

/// App menu (About, Hide, Quit) + Edit (so ⌘C ⌘V ⌘X ⌘Z ⌘A reach the webview) + fullscreen.
#[cfg(target_os = "macos")]
fn mac_menu<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> tauri::Result<tauri::menu::Menu<R>> {
    use tauri::menu::{Menu, PredefinedMenuItem, Submenu};

    let app_menu = Submenu::with_items(
        app,
        "ICEBREAKER",
        true,
        &[
            &PredefinedMenuItem::about(app, None, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::hide(app, None)?,
            &PredefinedMenuItem::hide_others(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::quit(app, None)?,
        ],
    )?;
    let edit_menu = Submenu::with_items(
        app,
        "Edit",
        true,
        &[
            &PredefinedMenuItem::undo(app, None)?,
            &PredefinedMenuItem::redo(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::cut(app, None)?,
            &PredefinedMenuItem::copy(app, None)?,
            &PredefinedMenuItem::paste(app, None)?,
            &PredefinedMenuItem::select_all(app, None)?,
        ],
    )?;
    let view_menu = Submenu::with_items(app, "View", true, &[&PredefinedMenuItem::fullscreen(app, None)?])?;
    let window_menu = Submenu::with_items(
        app,
        "Window",
        true,
        &[&PredefinedMenuItem::minimize(app, None)?, &PredefinedMenuItem::maximize(app, None)?],
    )?;
    Menu::with_items(app, &[&app_menu, &edit_menu, &view_menu, &window_menu])
}
