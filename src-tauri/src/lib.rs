//! ICEBREAKER — native side.
//!
//! The Rust part is deliberately small and boring: it only does what a web
//! page can't — touch files, read the system's vitals, store config. All the
//! UI and logic lives in TypeScript (../src). Every `#[tauri::command]` here is
//! called from src/platform/tauri.ts with `invoke("command_name", args)`.

mod account;
mod appupdate;
mod audio;
mod claude_code;
mod config;
mod crypto;
mod encoders;
mod files;
mod dev; // developer tools: refuse unless built with --features dev-tools
mod google;
mod media;
mod net;
mod quit;
mod recovery;
mod screen;
mod store;
mod term;
mod system;
mod vault;
mod voice;

pub fn run() {
    let builder = tauri::Builder::default();

    // macOS always has a menu bar. Tauri's default one maps ⌘W to "close window",
    // which would kill the app when you mean "close tab", so we provide a lean one.
    #[cfg(target_os = "macos")]
    let builder = builder.menu(mac_menu).on_menu_event(|app, event| {
        // the deck's own items ("ib:…") go to the page, which maps each id to one action
        // (platform/tauri.ts onMenu → deck.ts MENU_ACTIONS); the predefined ones act by themselves
        let id = event.id().0.as_str();
        if let Some(action) = id.strip_prefix("ib:") {
            let _ = tauri::Emitter::emit(app, "menu", action.to_string());
        }
    });

    builder
        // closing the window quits: the page saves the layout first (quit.rs)
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if !quit::ask_page(tauri::Manager::app_handle(window)) {
                    api.prevent_close();
                }
            }
        })
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        // the window's size and place (not full screen: the deck's own setting decides that)
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_state_flags(tauri_plugin_window_state::StateFlags::SIZE | tauri_plugin_window_state::StateFlags::POSITION | tauri_plugin_window_state::StateFlags::MAXIMIZED)
                .build(),
        )
        .manage(appupdate::UpdateState::default())
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
            account::init(app.handle());
            #[cfg(target_os = "macos")]
            promotion::unlock(app);
            #[cfg(windows)]
            browserkeys::off(app);
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
            vault::vault_write_bytes,
            vault::vault_mkdir,
            vault::vault_trash,
            vault::vault_purge,
            files::fs_home,
            files::fs_list,
            files::fs_read_text,
            vault::vault_rename,
            vault::vault_exists,
            vault::vault_import,
            vault::vault_crypt_status,
            vault::vault_unlock,
            vault::vault_decrypt,
            account::vault_export,
            account::vault_encrypt,
            account::vault_recovery_new,
            account::vault_rekey,
            appupdate::app_update_check,
            appupdate::app_update_download,
            appupdate::app_update_install,
            account::vault_recover,
            account::account_recover,
            account::account_open_vault,
            account::account_vault_sync,
            vault::vault_adopt,
            vault::vault_move,
            vault::vault_move_cleanup,
            config::config_read,
            config::config_write,
            config::env_api_key,
            config::app_quit,
            quit::app_quit_cancelled,
            system::system_stats,
            system::power_on_battery,
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
            google::google_connect_result,
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
            encoders::encoders_info,
            encoders::encoders_install,
            encoders::encoders_remove,
            encoders::encode_audio,
            account::account_status,
            account::account_session,
            account::account_count,
            account::account_lock,
            account::account_create,
            account::account_verify,
            account::account_change,
            account::account_remove,
            screen::screen_fullscreen,
            screen::screen_is_fullscreen,
            screen::screen_notch,
            dev::dev_tools_available,
            dev::dev_factory_reset, // DEV ONLY
            dev::dev_restart,       // DEV ONLY
        ])
        .build(tauri::generate_context!())
        .expect("error while running ICEBREAKER")
        .run(|app, ev| {
            // quitting: an encrypted vault's key is wiped from memory first
            match ev {
                // ⌘Q, the Dock's Quit, logging out of the system: the page saves first (quit.rs);
                // app_quit's own exit (a code) goes through
                tauri::RunEvent::ExitRequested { code: None, api, .. } => {
                    if !quit::ask_page(app) {
                        api.prevent_exit();
                    }
                }
                tauri::RunEvent::Exit => vault::lock(&tauri::Manager::state::<vault::VaultState>(app)),
                _ => {}
            }
        });
}

/// The macOS menu bar: ICEBREAKER, File, Edit, View, Window, Help. Edit's items are the
/// system's (⌘C ⌘V ⌘X ⌘Z reach the page as clipboard / undo events, core/input.ts); the
/// deck's own items send their id to the page. Their shortcuts are shown for the record:
/// pressed on the keyboard, the page takes the key first (it keeps every ⌘ key but Q H M V),
/// so a click on the item and the key do the same thing, once.
#[cfg(target_os = "macos")]
fn mac_menu<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> tauri::Result<tauri::menu::Menu<R>> {
    use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};

    // one of the deck's items: "ib:<id>", with the shortcut it shows
    let item = |id: &str, label: &str, keys: Option<&str>| MenuItem::with_id(app, format!("ib:{id}"), label, true, keys);
    let sep = || PredefinedMenuItem::separator(app);

    let app_menu = Submenu::with_items(
        app,
        "ICEBREAKER",
        true,
        &[
            &PredefinedMenuItem::about(app, None, None)?,
            &item("whatsnew", "What's New", None)?,
            &item("update", "Check for Updates…", None)?,
            &sep()?,
            &item("settings", "Settings…", Some("CmdOrCtrl+,"))?,
            &sep()?,
            &PredefinedMenuItem::hide(app, None)?,
            &PredefinedMenuItem::hide_others(app, None)?,
            &PredefinedMenuItem::show_all(app, None)?,
            &sep()?,
            &item("logout", "Log Out", Some("CmdOrCtrl+Shift+L"))?,
            // ours, not the system's: the page saves the layout before it quits (quit.rs)
            &item("quit", "Quit ICEBREAKER", Some("CmdOrCtrl+Q"))?,
        ],
    )?;
    let file_menu = Submenu::with_items(
        app,
        "File",
        true,
        &[
            &item("note.new", "New Note", Some("CmdOrCtrl+N"))?,
            &item("folder.new", "New Folder", Some("CmdOrCtrl+Shift+N"))?,
            &item("terminal", "New Terminal Tab", None)?,
            &sep()?,
            &item("journal", "Today's Journal", Some("CmdOrCtrl+J"))?,
            &item("find", "Find a File…", None)?,
            &item("palette", "The Menu (everything)", Some("CmdOrCtrl+K"))?,
            &sep()?,
            &item("tab.close", "Close Tab", Some("CmdOrCtrl+W"))?,
        ],
    )?;
    let edit_menu = Submenu::with_items(
        app,
        "Edit",
        true,
        &[
            &PredefinedMenuItem::undo(app, None)?,
            &PredefinedMenuItem::redo(app, None)?,
            &sep()?,
            &PredefinedMenuItem::cut(app, None)?,
            &PredefinedMenuItem::copy(app, None)?,
            &PredefinedMenuItem::paste(app, None)?,
            // the deck's own: the page's hidden text box is always empty, the system's select-all had nothing to select
            &item("selectall", "Select All", Some("CmdOrCtrl+A"))?,
        ],
    )?;
    let view_menu = Submenu::with_items(
        app,
        "View",
        true,
        &[
            &item("zoom.in", "Zoom In", Some("CmdOrCtrl+="))?,
            &item("zoom.out", "Zoom Out", Some("CmdOrCtrl+-"))?,
            &item("zoom.reset", "Actual Size", Some("CmdOrCtrl+0"))?,
            &sep()?,
            &item("tree", "File Tree", Some("CmdOrCtrl+B"))?,
            &item("panel", "Side Panel", Some("CmdOrCtrl+Shift+P"))?,
            &item("shell", "Shell", Some("CmdOrCtrl+`"))?,
            &item("fx", "Effects…", Some("CmdOrCtrl+Shift+F"))?,
            &sep()?,
            &PredefinedMenuItem::fullscreen(app, None)?,
        ],
    )?;
    let window_menu = Submenu::with_items(
        app,
        "Window",
        true,
        &[
            &PredefinedMenuItem::minimize(app, None)?,
            &PredefinedMenuItem::maximize(app, None)?,
            &sep()?,
            &item("tab.next", "Next Tab", None)?,
            &item("tab.prev", "Previous Tab", None)?,
            &item("home", "HOME", None)?,
        ],
    )?;
    let help_menu = Submenu::with_items(
        app,
        "Help",
        true,
        &[
            &item("manual", "ICEBREAKER Manual (F1)", None)?,
            &item("shortcuts", "Keyboard Shortcuts", Some("CmdOrCtrl+/"))?,
            &item("tour", "Guided Tour", None)?,
        ],
    )?;
    Menu::with_items(app, &[&app_menu, &file_menu, &edit_menu, &view_menu, &window_menu, &help_menu])
}

/// ProMotion (adaptive refresh, up to 120 Hz on recent Macs): WebKit holds page
/// animations near 60 fps unless told otherwise. We turn that preference off so
/// the deck follows the screen's real rate — 120 when the Mac runs at full speed,
/// less in Low Power mode (macOS lowers the screen's rate itself). A private
/// WebKit setting: we ask first whether this WebKit knows it, and skip if not.
#[cfg(target_os = "macos")]
mod promotion {
    //! ProMotion: WebKit keeps a page's animation frames near 60 per second by
    //! default, even on a 120 Hz screen. Two ways to lift it, both tried:
    //!   1. the feature flag "PreferPageRenderingUpdatesNear60FPSEnabled" (the one
    //!      Safari shows in Develop → Feature Flags), found by name in WebKit's
    //!      list of features and switched off with `_setEnabled:forFeature:`;
    //!   2. the older private setter, when this WebKit still has it.
    //! Private API, so every step checks it exists first; nothing breaks if not.
    //! `ICEBREAKER_DEBUG_FPS=1` prints what was found (run the binary from a terminal).
    use objc2::runtime::{AnyClass, AnyObject, Bool};
    use objc2::{msg_send, sel};
    use std::ffi::CStr;
    use tauri::Manager;

    unsafe fn key_of(feature: *mut AnyObject) -> String {
        let key: *mut AnyObject = msg_send![&*feature, key];
        if key.is_null() {
            return String::new();
        }
        let utf8: *const std::os::raw::c_char = msg_send![&*key, UTF8String];
        if utf8.is_null() {
            return String::new();
        }
        CStr::from_ptr(utf8).to_string_lossy().into_owned()
    }

    pub fn unlock(app: &tauri::App) {
        let Some(win) = app.get_webview_window("main") else { return };
        let debug = std::env::var("ICEBREAKER_DEBUG_FPS").is_ok();
        let _ = win.with_webview(move |wv| unsafe {
            let wk = wv.inner() as *mut AnyObject;
            if wk.is_null() {
                return;
            }
            let config: *mut AnyObject = msg_send![&*wk, configuration];
            if config.is_null() {
                return;
            }
            let prefs: *mut AnyObject = msg_send![&*config, preferences];
            if prefs.is_null() {
                return;
            }
            // 1. the feature flag, by name
            let mut done = false;
            if let Some(cls) = AnyClass::get(c"WKPreferences") {
                for list in [sel!(_features), sel!(_experimentalFeatures), sel!(_internalDebugFeatures)] {
                    let has: Bool = msg_send![cls, respondsToSelector: list];
                    if !has.as_bool() {
                        continue;
                    }
                    let arr: *mut AnyObject = msg_send![cls, performSelector: list];
                    if arr.is_null() {
                        continue;
                    }
                    let n: usize = msg_send![&*arr, count];
                    for i in 0..n {
                        let f: *mut AnyObject = msg_send![&*arr, objectAtIndex: i];
                        if f.is_null() {
                            continue;
                        }
                        let key = key_of(f);
                        if debug && (key.contains("FPS") || key.contains("RenderingUpdate") || key.contains("FrameRate")) {
                            eprintln!("[fps] feature {key}");
                        }
                        if key == "PreferPageRenderingUpdatesNear60FPSEnabled" {
                            let can: Bool = msg_send![&*prefs, respondsToSelector: sel!(_setEnabled:forFeature:)];
                            if can.as_bool() {
                                let _: () = msg_send![&*prefs, _setEnabled: Bool::NO, forFeature: f];
                                done = true;
                            }
                        }
                    }
                }
            }
            // 2. the older setter
            let knows: Bool = msg_send![&*prefs, respondsToSelector: sel!(_setPreferPageRenderingUpdatesNear60FPSEnabled:)];
            if knows.as_bool() {
                let _: () = msg_send![&*prefs, _setPreferPageRenderingUpdatesNear60FPSEnabled: Bool::NO];
                done = true;
            }
            // the web view takes its preferences again (some only apply to a new page)
            let _: () = msg_send![&*config, setPreferences: prefs];
            if debug {
                eprintln!("[fps] 60 fps preference lifted: {done}");
            }
        });
    }
}

/// Windows: the webview's own browser keys off (ctrl+shift+M was Edge's profile menu, F5 / ctrl+R
/// reloaded the page, ctrl+P printed it…): every key reaches the deck. Copy, paste and the
/// other editing keys aren't browser keys: they keep working.
#[cfg(windows)]
mod browserkeys {
    use tauri::Manager;
    use webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2Settings3;
    use windows_core::Interface;

    pub fn off(app: &tauri::App) {
        let Some(win) = app.get_webview_window("main") else { return };
        let _ = win.with_webview(|wv| unsafe {
            let Ok(core) = wv.controller().CoreWebView2() else { return };
            let Ok(settings) = core.Settings() else { return };
            if let Ok(s3) = settings.cast::<ICoreWebView2Settings3>() {
                let _ = s3.SetAreBrowserAcceleratorKeysEnabled(false);
            }
        });
    }
}
