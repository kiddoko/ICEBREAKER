//! ICEBREAKER updating itself (tauri-plugin-updater): check, download, install —
//! three steps the deck can take apart (Settings → UPDATES: check by itself, download
//! by itself, ask before installing). Every update is signed: the public key is in
//! tauri.conf.json, the private one only on the machine that builds releases
//! (docs/UPDATES.md). An update that isn't signed by it is refused here.

use std::sync::Mutex;

use serde::Serialize;
use tauri::{AppHandle, Emitter, State};
use tauri_plugin_updater::{Update, UpdaterExt};

#[derive(Default)]
pub struct UpdateState {
    /// the update found by the last check, and its bytes once downloaded
    found: Mutex<Option<(Update, Option<Vec<u8>>)>>,
}

#[derive(Serialize, Clone)]
pub struct UpdateInfo {
    version: String,
    current: String,
    notes: String,
    date: String,
    downloaded: bool,
}

#[derive(Serialize, Clone)]
struct Progress {
    done: u64,
    total: Option<u64>,
}

fn info(u: &Update, downloaded: bool) -> UpdateInfo {
    UpdateInfo {
        version: u.version.clone(),
        current: u.current_version.clone(),
        notes: u.body.clone().unwrap_or_default(),
        date: u.date.map(|d| d.to_string()).unwrap_or_default(),
        downloaded,
    }
}

/// Is there a newer ICEBREAKER? `endpoint`: where to look (Settings → UPDATES; empty = tauri.conf.json's).
#[tauri::command]
pub async fn app_update_check(app: AppHandle, state: State<'_, UpdateState>, endpoint: Option<String>) -> Result<Option<UpdateInfo>, String> {
    crate::config::online(&app, "looking for updates")?;
    let mut b = app.updater_builder();
    if let Some(e) = endpoint.filter(|e| !e.trim().is_empty()) {
        let url = e.trim().parse().map_err(|_| format!("{e}: not a URL"))?;
        if !e.trim().starts_with("https://") {
            return Err("updates come over https only".into());
        }
        b = b.endpoints(vec![url]).map_err(|e| e.to_string())?;
    }
    let found = b.build().map_err(|e| e.to_string())?.check().await.map_err(|e| e.to_string())?;
    let out = found.as_ref().map(|u| info(u, false));
    *state.found.lock().map_err(|e| e.to_string())? = found.map(|u| (u, None));
    Ok(out)
}

/// Download the update found (progress: the "app-update-progress" event). Nothing is installed.
#[tauri::command]
pub async fn app_update_download(app: AppHandle, state: State<'_, UpdateState>) -> Result<UpdateInfo, String> {
    crate::config::online(&app, "downloading an update")?;
    let update = {
        let g = state.found.lock().map_err(|e| e.to_string())?;
        match g.as_ref() {
            Some((u, Some(_))) => return Ok(info(u, true)),
            Some((u, None)) => u.clone(),
            None => return Err("no update found yet (update check)".into()),
        }
    };
    let mut done = 0u64;
    let bytes = update
        .download(
            |chunk, total| {
                done += chunk as u64;
                let _ = app.emit("app-update-progress", Progress { done, total });
            },
            || {},
        )
        .await
        .map_err(|e| e.to_string())?;
    let out = info(&update, true);
    *state.found.lock().map_err(|e| e.to_string())? = Some((update, Some(bytes)));
    Ok(out)
}

/// Install what was downloaded (its signature checked), then start the new version —
/// or not (`restart` false: on quit, the next launch is the new one).
#[tauri::command]
pub fn app_update_install(app: AppHandle, state: State<'_, UpdateState>, restart: bool) -> Result<(), String> {
    // the downloaded update stays here until it's really installed: a failed install (a bad
    // archive, a full disk…) can be tried again without checking and downloading again
    let mut g = state.found.lock().map_err(|e| e.to_string())?;
    match g.as_ref() {
        Some((update, Some(bytes))) => update.install(bytes).map_err(|e| e.to_string())?,
        _ => return Err("nothing downloaded (update download)".into()),
    }
    *g = None;
    drop(g);
    if restart {
        app.restart();
    }
    Ok(())
}
