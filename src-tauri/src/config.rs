//! App configuration files, stored in the OS config directory
//! (e.g. %APPDATA%\org.icebreaker.deck on Windows). Only four file names are
//! accepted, so the UI can't use this to write anywhere else; an account's
//! settings are read from its own folder, and only while it's unlocked.

use std::fs;
use crate::account::AccountState;
use tauri::{AppHandle, Manager, State};

/// device.json is the deck's own (who logged in last, how the login screen looks);
/// settings.json and secrets.json belong to the account unlocked (users/<id>/); so does
/// access.json (the journal of who used which permission: it stays on this computer, it
/// never goes into the vault).
/// (settings.json.broken: a settings file that couldn't be read, kept as it was before the
/// defaults are written over it — core/settings.ts)
const ALLOWED: &[&str] = &["settings.json", "secrets.json", "device.json", "access.json", "settings.json.broken"];

/// Stealth mode (`privacy.stealth`), read here from the unlocked account's own settings:
/// the native side checks it by itself before anything goes online, whatever the page says.
/// Nobody logged in: nothing of an account goes online anyway.
pub fn stealth(app: &AppHandle) -> bool {
    let state = app.state::<AccountState>();
    let Some(id) = state.session() else { return false };
    let Ok(dir) = crate::account::user_dir(app, &id) else { return false };
    let Ok(text) = fs::read_to_string(dir.join("settings.json")) else { return false };
    serde_json::from_str::<serde_json::Value>(&text)
        .ok()
        .and_then(|v| v.pointer("/privacy/stealth").and_then(|b| b.as_bool()))
        .unwrap_or(false)
}

/// What the AI may read by itself (`ai.reads`: "nothing" · "given" · "all"), from the unlocked
/// account's settings; None when the file doesn't say (an account from before 0.6, not saved yet).
pub fn ai_reads(app: &AppHandle) -> Option<String> {
    let state = app.state::<AccountState>();
    let id = state.session()?;
    let dir = crate::account::user_dir(app, &id).ok()?;
    let text = fs::read_to_string(dir.join("settings.json")).ok()?;
    let v = serde_json::from_str::<serde_json::Value>(&text).ok()?;
    v.pointer("/ai/reads").and_then(|x| x.as_str()).filter(|s| ["nothing", "given", "all"].contains(s)).map(str::to_string)
}

/// Refuse to go online in stealth mode (`what` names the feature in the error).
pub fn online(app: &AppHandle, what: &str) -> Result<(), String> {
    if stealth(app) {
        return Err(format!("stealth mode: {what} needs the internet (stealth off to allow it)"));
    }
    Ok(())
}

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

/// An account's settings.json and secrets.json also go into its vault (account.rs:
/// the vault carries its account to another computer).
#[tauri::command]
pub fn config_write(app: AppHandle, state: State<AccountState>, vault: State<crate::vault::VaultState>, name: String, content: String) -> Result<(), String> {
    let path = config_path(&app, &state, &name)?.ok_or("locked: log in first")?;
    // (the access journal stays on this computer: never a copy in the vault)
    let content = if name == "device.json" || name == "access.json" { content } else { crate::account::mirror_to_vault(&app, &state, &vault, &name, &content) };
    // settings and secrets (your API key): readable by your user only, written whole or not at all
    crate::crypto::write_private(&path, content.as_bytes()).map_err(|e| e.to_string())
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
