//! The computer's files, read-only, for the deck's own file picker (importing
//! a script). Lists a folder and reads a small text file anywhere you point
//! it — modules never get these commands, only the deck's UI.

use serde::Serialize;
use std::fs;
use std::path::PathBuf;

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

/// A text file up to 2 MB (scripts, notes).
#[tauri::command]
pub fn fs_read_text(path: String) -> Result<String, String> {
    let meta = fs::metadata(&path).map_err(|e| format!("{path}: {e}"))?;
    if meta.len() > 2 * 1024 * 1024 {
        return Err(format!("{path}: bigger than 2 MB"));
    }
    let bytes = fs::read(&path).map_err(|e| format!("{path}: {e}"))?;
    Ok(String::from_utf8_lossy(&bytes).into_owned())
}
