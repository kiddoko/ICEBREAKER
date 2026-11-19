//! App configuration files, stored in the OS config directory
//! (e.g. %APPDATA%\org.icebreaker.deck on Windows). Only three file names are
//! accepted, so the UI can't use this to write anywhere else; an account's
//! settings are read from its own folder, and only while it's unlocked.

use std::fs;
use crate::account::AccountState;
use tauri::{AppHandle, Manager, State};

/// device.json is the deck's own (who logged in last, how the login screen looks);
/// settings.json and secrets.json belong to the account unlocked (users/<id>/).
const ALLOWED: &[&str] = &["settings.json", "secrets.json", "device.json"];

fn config_path(app: &AppHandle, state: &State<AccountState>, name: &str) -> Result<Option<std::path::PathBuf>, String> {
    if !ALLOWED.contains(&name) {
        return Err(format!("unknown config file: {name}"));
    }
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    if name == "device.json" {
        return Ok(Some(dir.join(name)));
    }
    // an account's files: only while it's unlocked
    match state.session() {
        Some(id) => Ok(Some(crate::account::user_dir(app, &id)?.join(name))),
        None => Ok(None),
    }
}

#[tauri::command]
pub fn config_read(app: AppHandle, state: State<AccountState>, name: String) -> Result<Option<String>, String> {
    let Some(path) = config_path(&app, &state, &name)? else { return Ok(None) };
    match fs::read_to_string(path) {
        Ok(s) => Ok(Some(s)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn config_write(app: AppHandle, state: State<AccountState>, name: String, content: String) -> Result<(), String> {
    let path = config_path(&app, &state, &name)?.ok_or("locked: log in first")?;
    fs::write(path, content).map_err(|e| e.to_string())
}

/// Lets users keep their key in the environment instead of secrets.json.
#[tauri::command]
pub fn env_api_key() -> Option<String> {
    std::env::var("ANTHROPIC_API_KEY").ok().filter(|k| !k.trim().is_empty())
}

#[tauri::command]
pub fn app_quit(app: AppHandle) {
    app.exit(0);
}
