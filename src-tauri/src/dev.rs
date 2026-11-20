//! DEVELOPER TOOLS — only in builds made with `--features dev-tools` (`npm run app:mac`,
//! for testing). In a release they answer "not in this build" and do nothing.
//!
//! Brings ICEBREAKER back to a first launch, for testing: the vault folder and
//! the config folder (settings, secrets, login) are *renamed* with a
//! "-backup-<timestamp>" suffix (nothing is deleted), then the app restarts.

use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager, State};

use crate::vault::{vault_root, VaultState};

/// What this build is, written in the binary: scripts/release-update.mjs reads it and
/// refuses to publish a build that carries the developer tools.
#[used]
static BUILD_KIND: &str = if cfg!(feature = "dev-tools") { "ICEBREAKER-BUILD:dev-tools" } else { "ICEBREAKER-BUILD:release" };

fn backup_name(p: &Path, stamp: u64) -> PathBuf {
    let name = p.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_else(|| "icebreaker".into());
    p.with_file_name(format!("{name}-backup-{stamp}"))
}

/// Returns where things were moved (shown before the restart). The logged-in
/// account's password first: nothing moves your vault and your accounts aside unasked.
#[tauri::command(async)]
pub fn dev_factory_reset(app: AppHandle, vault: State<VaultState>, account: State<crate::account::AccountState>, password: String) -> Result<Vec<String>, String> {
    if !cfg!(feature = "dev-tools") {
        return Err("factory-reset is a developer tool: it isn't in this build".into());
    }
    let password = zeroize::Zeroizing::new(password);
    crate::account::check_session(&app, &account, &password)?;
    let stamp = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
    let mut moved = Vec::new();
    for dir in [vault_root(&vault).ok(), app.path().app_config_dir().ok()].into_iter().flatten() {
        if !dir.exists() {
            continue;
        }
        let to = backup_name(&dir, stamp);
        fs::rename(&dir, &to).map_err(|e| format!("{}: {e}", dir.display()))?;
        moved.push(to.display().to_string());
    }
    Ok(moved)
}

/// Restart the app (after the reset).
#[tauri::command]
pub fn dev_restart(app: AppHandle) {
    if !cfg!(feature = "dev-tools") {
        return;
    }
    app.restart();
}
