//! ICEBREAKER updating itself (tauri-plugin-updater): check, download, install —
//! three steps the deck can take apart (Settings → UPDATES: check by itself, download
//! by itself, ask before installing). Every update is signed: the public key is in
//! tauri.conf.json, the private one only on the machine that builds releases
//! (docs/UPDATES.md). An update that isn't signed by it is refused here.

use std::path::Path;
use std::sync::Mutex;
use std::time::{Duration, SystemTime};

use serde::Serialize;
use tauri::{AppHandle, Emitter, State};
use tauri_plugin_updater::{Update, UpdaterExt};

/// What an update leaves in the system's temp folder: tauri-plugin-updater unpacks
/// each installer (Windows) into `<app>-<version>-updater-<random>/` and never removes
/// it (≈ 7 MB each). At start, the ones older than 10 minutes go (a younger one may be
/// the installer that is still finishing). Only folders of exactly that name.
pub fn clean_leftovers(app: &AppHandle) {
    let name = app.package_info().name.clone();
    std::thread::spawn(move || {
        let n = clean_leftovers_in(&std::env::temp_dir(), &name, Duration::from_secs(600));
        if n > 0 {
            eprintln!("[update] removed {n} old installer folder(s) from the temp folder");
        }
    });
}

/// Is `file` a folder name the updater gives (`ICEBREAKER-0.8.0-updater-AbC123`)?
fn is_leftover(file: &str, app: &str) -> bool {
    let Some(rest) = file.strip_prefix(app).and_then(|r| r.strip_prefix('-')) else { return false };
    let Some((version, tail)) = rest.split_once("-updater-") else { return false };
    !version.is_empty() && version.chars().all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '-' || c == '+') && !tail.is_empty() && tail.chars().all(|c| c.is_ascii_alphanumeric())
}

/// Removes the leftovers in `temp` older than `age`. Returns how many went.
fn clean_leftovers_in(temp: &Path, app: &str, age: Duration) -> usize {
    let Ok(rd) = std::fs::read_dir(temp) else { return 0 };
    let now = SystemTime::now();
    let mut n = 0;
    for e in rd.flatten() {
        // a folder, not a link to one
        let Ok(meta) = std::fs::symlink_metadata(e.path()) else { continue };
        if !meta.is_dir() || !is_leftover(&e.file_name().to_string_lossy(), app) {
            continue;
        }
        let old = meta.modified().ok().and_then(|m| now.duration_since(m).ok()).is_some_and(|d| d >= age);
        if old && std::fs::remove_dir_all(e.path()).is_ok() {
            n += 1;
        }
    }
    n
}

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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn old_installer_folders_go_and_nothing_else() {
        let t = std::env::temp_dir().join(format!("ib-upd-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&t);
        for d in ["ICEBREAKER-0.7.2-updater-Ab12Cd", "ICEBREAKER-0.8.0-updater-x9", "ICEBREAKER-notes", "OTHER-0.8.0-updater-x9", "ICEBREAKER-0.8.0-updater-"] {
            std::fs::create_dir_all(t.join(d)).unwrap();
            std::fs::write(t.join(d).join("setup.exe"), b"MZ").unwrap();
        }
        std::fs::write(t.join("ICEBREAKER-0.6.0-updater-file"), b"a file").unwrap();
        // too young: kept (the installer may still be running)
        assert_eq!(clean_leftovers_in(&t, "ICEBREAKER", Duration::from_secs(600)), 0);
        assert_eq!(clean_leftovers_in(&t, "ICEBREAKER", Duration::ZERO), 2);
        let mut left: Vec<String> = std::fs::read_dir(&t).unwrap().flatten().map(|e| e.file_name().to_string_lossy().into_owned()).collect();
        left.sort();
        assert_eq!(left, vec!["ICEBREAKER-0.6.0-updater-file", "ICEBREAKER-0.8.0-updater-", "ICEBREAKER-notes", "OTHER-0.8.0-updater-x9"]);
        std::fs::remove_dir_all(t).unwrap();
    }
}
