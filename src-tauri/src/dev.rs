//! DEVELOPER TOOLS — only in builds made with `--features dev-tools` (`npm run app:mac`,
//! for testing). In a release `dev_tools_available` says no, so the UI doesn't even
//! register `factory-reset`, and the two commands below aren't compiled at all (nor
//! registered: lib.rs) — no page can call them. `tests::release_has_no_dev_commands` checks it.
//!
//! Brings ICEBREAKER back to a first launch, for testing: the vault folder and
//! the config folder (settings, secrets, login) are *renamed* with a
//! "-backup-<timestamp>" suffix (nothing is deleted), then the app restarts.

#[cfg(feature = "dev-tools")]
use std::fs;
#[cfg(feature = "dev-tools")]
use std::path::{Path, PathBuf};
#[cfg(feature = "dev-tools")]
use std::time::{SystemTime, UNIX_EPOCH};
#[cfg(feature = "dev-tools")]
use tauri::{AppHandle, Manager, State};

#[cfg(feature = "dev-tools")]
use crate::vault::{vault_root, VaultState};

/// What this build is, written in the binary: scripts/release-update.mjs reads it and
/// refuses to publish a build that carries the developer tools.
#[used]
static BUILD_KIND: &str = if cfg!(feature = "dev-tools") { "ICEBREAKER-BUILD:dev-tools" } else { "ICEBREAKER-BUILD:release" };

#[cfg(feature = "dev-tools")]
fn backup_name(p: &Path, stamp: u64) -> PathBuf {
    let name = p.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_else(|| "icebreaker".into());
    p.with_file_name(format!("{name}-backup-{stamp}"))
}

/// Does this build carry the developer tools? (the UI registers `factory-reset` only then)
#[tauri::command]
pub fn dev_tools_available() -> bool {
    cfg!(feature = "dev-tools")
}

/// Returns where things were moved (shown before the restart). The logged-in
/// account's password first: nothing moves your vault and your accounts aside unasked.
#[cfg(feature = "dev-tools")]
#[tauri::command(async)]
pub fn dev_factory_reset(app: AppHandle, vault: State<VaultState>, account: State<crate::account::AccountState>, password: String) -> Result<Vec<String>, String> {
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
#[cfg(feature = "dev-tools")]
#[tauri::command]
pub fn dev_restart(app: AppHandle) {
    app.restart();
}

#[cfg(test)]
mod tests {
    /// A release build has neither command: compiled out here, and their names in
    /// lib.rs's handler list each carry the same `cfg` (a forgotten one wouldn't build
    /// with the feature off — but one moved out of the cfg would ship).
    #[test]
    fn release_has_no_dev_commands() {
        let lib = include_str!("lib.rs");
        for name in ["dev::dev_factory_reset", "dev::dev_restart"] {
            let at = lib.find(&format!("{name},")).unwrap_or_else(|| panic!("{name} not in lib.rs"));
            let before = lib[..at].trim_end().lines().last().unwrap_or("");
            assert_eq!(before.trim(), "#[cfg(feature = \"dev-tools\")]", "{name} must be registered only with dev-tools");
        }
        let me = include_str!("dev.rs");
        for f in ["pub fn dev_factory_reset", "pub fn dev_restart"] {
            let at = me.find(f).unwrap();
            assert!(me[..at].rsplit("\n\n").next().unwrap().contains("#[cfg(feature = \"dev-tools\")]"), "{f} must be compiled only with dev-tools");
        }
    }
}
