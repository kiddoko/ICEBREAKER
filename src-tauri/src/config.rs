//! App configuration files, stored in the OS config directory
//! (e.g. %APPDATA%\org.icebreaker.deck on Windows). Only two file names are
//! accepted, so the UI can't use this to write anywhere else.

use std::fs;
use tauri::{AppHandle, Manager};

const ALLOWED: &[&str] = &["settings.json", "secrets.json"];

fn config_path(app: &AppHandle, name: &str) -> Result<std::path::PathBuf, String> {
    if !ALLOWED.contains(&name) {
        return Err(format!("unknown config file: {name}"));
    }
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join(name))
}

#[tauri::command]
pub fn config_read(app: AppHandle, name: String) -> Result<Option<String>, String> {
    let path = config_path(&app, &name)?;
    match fs::read_to_string(path) {
        Ok(s) => Ok(Some(s)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn config_write(app: AppHandle, name: String, content: String) -> Result<(), String> {
    fs::write(config_path(&app, &name)?, content).map_err(|e| e.to_string())
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
