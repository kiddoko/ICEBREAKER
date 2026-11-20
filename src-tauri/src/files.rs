//! The computer's files, read-only, for the deck's own file picker (importing
//! a script). Lists a folder and reads a small text file anywhere you point
//! it — modules never get these commands, only the deck's UI.

use serde::Serialize;
use std::fs;
use std::path::PathBuf;

#[cfg(test)]
mod tests {
    use super::readable;
    #[test]
    fn only_scripts_and_text_outside_hidden_and_system_places() {
        assert!(readable("/Users/neo/Downloads/backup.sh").is_ok());
        assert!(readable("/Users/neo/notes/todo.md").is_ok());
        assert!(readable("/Users/neo/.ssh/id_ed25519").is_err());
        assert!(readable("/Users/neo/.ssh/config.txt").is_err());
        assert!(readable("/Users/neo/project/.env").is_err());
        assert!(readable("/Users/neo/Library/Keychains/x.txt").is_err());
        assert!(readable("/etc/passwd").is_err());
        assert!(readable("/Users/neo/a/../.aws/creds.txt").is_err());
        assert!(readable("/Users/neo/photo.jpg").is_err());
        assert!(readable("C:/Users/neo/AppData/Roaming/x.txt").is_err());
        // a folder of yours called "library" is fine
        assert!(readable("/Users/neo/Documents/library/notes.md").is_ok());
    }
}

#[derive(Serialize)]
pub struct FsEntry {
    name: String,
    path: String,
    #[serde(rename = "isDir")]
    is_dir: bool,
    size: u64,
}

#[tauri::command]
pub fn fs_home() -> String {
    std::env::var_os("HOME").or_else(|| std::env::var_os("USERPROFILE")).map(|h| PathBuf::from(h).to_string_lossy().into_owned()).unwrap_or_else(|| "/".into())
}

#[tauri::command]
pub fn fs_list(path: String) -> Result<Vec<FsEntry>, String> {
    let mut out = Vec::new();
    for e in fs::read_dir(&path).map_err(|e| format!("{path}: {e}"))? {
        let Ok(e) = e else { continue };
        let name = e.file_name().to_string_lossy().into_owned();
        if name.starts_with('.') {
            continue;
        }
        let meta = e.metadata().ok();
        out.push(FsEntry { name, path: e.path().to_string_lossy().into_owned(), is_dir: meta.as_ref().map(|m| m.is_dir()).unwrap_or(false), size: meta.map(|m| m.len()).unwrap_or(0) });
    }
    out.sort_by(|a, b| b.is_dir.cmp(&a.is_dir).then(a.name.to_lowercase().cmp(&b.name.to_lowercase())));
    Ok(out)
}

/// What the deck may read from the computer: scripts and text you import — never
/// a hidden file or folder (~/.ssh, ~/.aws, .env…) nor the system's or apps' own places.
fn readable(path: &str) -> Result<(), String> {
    let p = std::path::Path::new(path);
    let ext = p.extension().map(|e| e.to_string_lossy().to_lowercase()).unwrap_or_default();
    const EXTS: &[&str] = &["sh", "bash", "zsh", "fish", "py", "js", "mjs", "rb", "pl", "ps1", "lua", "ibsh", "txt", "md"];
    if !EXTS.contains(&ext.as_str()) {
        return Err(format!("{path}: only scripts and text files ({})", EXTS.join(" ")));
    }
    let hidden = p.components().any(|c| matches!(c, std::path::Component::Normal(n) if n.to_string_lossy().starts_with('.')) || matches!(c, std::path::Component::ParentDir));
    let lower = path.replace('\\', "/").to_lowercase();
    // the system's own places, and your user's Library (macOS) / AppData (Windows): apps' data, keychains
    let roots = ["/library/", "/etc/", "/private/", "/system/", "/var/", "/proc/", "/sys/", "/root/", "c:/windows/", "c:/program files", "c:/programdata/"];
    let home_lib = lower.split('/').collect::<Vec<_>>().windows(3).any(|w| (w[0] == "users" || w[0] == "home") && (w[2] == "library" || w[2] == "appdata"));
    let system = roots.iter().any(|r| lower.starts_with(r)) || home_lib;
    if hidden || system {
        return Err(format!("{path}: hidden and system files aren't read"));
    }
    Ok(())
}

/// A text file up to 2 MB (scripts, notes), see `readable`.
#[tauri::command]
pub fn fs_read_text(path: String) -> Result<String, String> {
    readable(&path)?;
    let meta = fs::metadata(&path).map_err(|e| format!("{path}: {e}"))?;
    if meta.len() > 2 * 1024 * 1024 {
        return Err(format!("{path}: bigger than 2 MB"));
    }
    let bytes = fs::read(&path).map_err(|e| format!("{path}: {e}"))?;
    Ok(String::from_utf8_lossy(&bytes).into_owned())
}
