//! The computer's files, read-only, for the deck's own file picker (importing
//! a script). Lists a folder and reads a small text file anywhere you point
//! it — modules never get these commands, only the deck's UI.

use serde::Serialize;
use std::fs;
use std::path::PathBuf;

#[cfg(test)]
mod tests {
    use super::{readable, readable_media};
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
        // an import's text: events, a sheet
        assert!(readable("/Users/neo/Downloads/agenda.csv").is_ok());
        assert!(readable("/Users/neo/Downloads/agenda.ics").is_ok());
    }

    #[test]
    fn media_outside_hidden_and_system_places() {
        assert!(readable_media("/Users/neo/Music/kick.wav").is_ok());
        assert!(readable_media("C:/Users/neo/Desktop/snare.FLAC").is_ok());
        assert!(readable_media("/Users/neo/notes/todo.md").is_err());
        assert!(readable_media("/Users/neo/.ssh/id.wav").is_err());
        assert!(readable_media("/Library/Audio/x.wav").is_err());
        assert!(readable_media("/Users/neo/a/../.config/x.wav").is_err());
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
    // scripts, text, and what a module imports from a file you chose (events, a sheet)
    const EXTS: &[&str] = &["sh", "bash", "zsh", "fish", "py", "js", "mjs", "rb", "pl", "ps1", "lua", "ibsh", "txt", "md", "csv", "tsv", "ics"];
    allowed(path, EXTS, "only scripts and text files")
}

/// Sounds and pictures a module imports from a file you chose (a tracker's sample): see `allowed`.
fn readable_media(path: &str) -> Result<(), String> {
    const EXTS: &[&str] = &["wav", "wave", "aif", "aiff", "flac", "mp3", "ogg", "oga", "opus", "m4a", "mid", "midi", "png", "jpg", "jpeg", "gif", "webp"];
    allowed(path, EXTS, "only sounds and pictures")
}

/// one of `exts`, never a hidden file or folder, never the system's places nor your Library / AppData
fn allowed(path: &str, exts: &[&str], what: &str) -> Result<(), String> {
    let p = std::path::Path::new(path);
    let ext = p.extension().map(|e| e.to_string_lossy().to_lowercase()).unwrap_or_default();
    if !exts.contains(&ext.as_str()) {
        return Err(format!("{path}: {what} ({})", exts.join(" ")));
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

/// A sound or a picture up to 64 MB, as bytes (a module's import of a file you chose), see
/// `readable_media`. Async (a big file never freezes the window), a regular file only (never a
/// pipe), the link followed and checked again where it really points (a picture that is a link to
/// a key), and never more than the cap, even if the file grows meanwhile.
#[tauri::command(async)]
pub fn fs_read_bytes(path: String) -> Result<tauri::ipc::Response, String> {
    use std::io::Read;
    const CAP: u64 = 64 * 1024 * 1024;
    readable_media(&path)?;
    let real = fs::canonicalize(&path).map_err(|e| format!("{path}: {e}"))?;
    // (Windows writes the real path \\?\C:\…: checked as C:\…, the way the rules name places)
    let shown = real.to_string_lossy();
    readable_media(shown.strip_prefix(r"\\?\").unwrap_or(&shown))?;
    let meta = fs::metadata(&real).map_err(|e| format!("{path}: {e}"))?;
    if !meta.is_file() {
        return Err(format!("{path}: not a file"));
    }
    if meta.len() > CAP {
        return Err(format!("{path}: bigger than 64 MB"));
    }
    let mut buf = Vec::with_capacity(meta.len() as usize);
    fs::File::open(&real).and_then(|f| f.take(CAP + 1).read_to_end(&mut buf)).map_err(|e| format!("{path}: {e}"))?;
    if buf.len() as u64 > CAP {
        return Err(format!("{path}: bigger than 64 MB"));
    }
    Ok(tauri::ipc::Response::new(buf))
}
