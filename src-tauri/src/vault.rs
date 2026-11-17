//! The vault: a folder of Markdown files (compatible with Obsidian).
//!
//! The UI only ever talks in *vault-relative* paths like "journal/2026-11-17.md".
//! `resolve` turns them into real paths and refuses anything that would
//! escape the vault ("../", absolute paths, drive letters). That one function
//! is the security boundary for file access — plugins included.

use serde::Serialize;
use std::fs;
use std::path::{Component, Path, PathBuf};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager, State};

type CmdResult<T> = Result<T, String>;

#[derive(Default)]
pub struct VaultState {
    root: Mutex<Option<PathBuf>>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Entry {
    path: String,
    name: String,
    is_dir: bool,
    size: u64,
    modified: u64,
}

/// Folders never shown in the tree / search (they're tooling, not notes).
const SKIPPED_DIRS: &[&str] = &[".git", ".obsidian", ".icebreaker", ".trash", "node_modules"];
const MAX_WALK_ENTRIES: usize = 50_000;

fn root(state: &State<VaultState>) -> CmdResult<PathBuf> {
    state
        .root
        .lock()
        .map_err(|e| e.to_string())?
        .clone()
        .ok_or_else(|| "no vault mounted".to_string())
}

/// Vault-relative path → absolute path, refusing anything outside the vault.
fn resolve(root: &Path, rel: &str) -> CmdResult<PathBuf> {
    let mut out = root.to_path_buf();
    for comp in Path::new(rel.trim_start_matches('/')).components() {
        match comp {
            Component::Normal(part) => out.push(part),
            Component::CurDir => {}
            _ => return Err(format!("path escapes the vault: {rel}")),
        }
    }
    Ok(out)
}

/// On Windows, `canonicalize` returns `\\?\C:\…` paths: drop that prefix so the
/// path stays readable in settings and in the UI.
fn strip_verbatim(p: PathBuf) -> PathBuf {
    match p.to_str().and_then(|s| s.strip_prefix(r"\\?\")) {
        Some(rest) if !rest.starts_with("UNC") => PathBuf::from(rest),
        _ => p,
    }
}

/// Absolute path → vault-relative path with forward slashes.
fn to_rel(root: &Path, abs: &Path) -> String {
    abs.strip_prefix(root)
        .unwrap_or(abs)
        .components()
        .map(|c| c.as_os_str().to_string_lossy().into_owned())
        .collect::<Vec<_>>()
        .join("/")
}

fn entry(root: &Path, abs: &Path) -> Option<Entry> {
    let meta = fs::metadata(abs).ok()?;
    let modified = meta
        .modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);
    Some(Entry {
        path: to_rel(root, abs),
        name: abs.file_name()?.to_string_lossy().into_owned(),
        is_dir: meta.is_dir(),
        size: meta.len(),
        modified,
    })
}

#[tauri::command]
pub fn vault_default_path(app: AppHandle) -> CmdResult<String> {
    let docs = app
        .path()
        .document_dir()
        .or_else(|_| app.path().home_dir())
        .map_err(|e| e.to_string())?;
    Ok(docs.join("Icebreaker").to_string_lossy().into_owned())
}

/// Use `path` as the vault (created if it doesn't exist).
#[tauri::command]
pub fn vault_mount(state: State<VaultState>, path: String) -> CmdResult<String> {
    let dir = PathBuf::from(&path);
    fs::create_dir_all(&dir).map_err(|e| format!("cannot create vault at {path}: {e}"))?;
    let dir = dir.canonicalize().map(strip_verbatim).unwrap_or(dir);
    *state.root.lock().map_err(|e| e.to_string())? = Some(dir.clone());
    Ok(dir.to_string_lossy().into_owned())
}

#[tauri::command]
pub fn vault_list(state: State<VaultState>, path: String) -> CmdResult<Vec<Entry>> {
    let root = root(&state)?;
    let dir = resolve(&root, &path)?;
    let read = fs::read_dir(&dir).map_err(|e| format!("{path}: {e}"))?;
    let mut out: Vec<Entry> = read.flatten().filter_map(|d| entry(&root, &d.path())).collect();
    out.sort_by(|a, b| b.is_dir.cmp(&a.is_dir).then(a.name.to_lowercase().cmp(&b.name.to_lowercase())));
    Ok(out)
}

#[tauri::command]
pub fn vault_walk(state: State<VaultState>) -> CmdResult<Vec<Entry>> {
    let root = root(&state)?;
    let mut out = Vec::new();
    let mut stack = vec![root.clone()];
    while let Some(dir) = stack.pop() {
        let Ok(read) = fs::read_dir(&dir) else { continue };
        for item in read.flatten() {
            let p = item.path();
            let name = item.file_name().to_string_lossy().into_owned();
            let is_dir = item.file_type().map(|t| t.is_dir()).unwrap_or(false);
            if is_dir && (SKIPPED_DIRS.contains(&name.as_str()) || name.starts_with('.')) {
                continue;
            }
            if let Some(e) = entry(&root, &p) {
                out.push(e);
            }
            if is_dir {
                stack.push(p);
            }
            if out.len() >= MAX_WALK_ENTRIES {
                return Ok(out);
            }
        }
    }
    Ok(out)
}

#[tauri::command]
pub fn vault_read(state: State<VaultState>, path: String) -> CmdResult<String> {
    let root = root(&state)?;
    fs::read_to_string(resolve(&root, &path)?).map_err(|e| format!("{path}: {e}"))
}

/// Read many files in one round-trip (used by grep, search and the AI tools).
#[tauri::command]
pub fn vault_read_many(state: State<VaultState>, paths: Vec<String>) -> CmdResult<Vec<Option<String>>> {
    let root = root(&state)?;
    Ok(paths
        .iter()
        .map(|p| resolve(&root, p).ok().and_then(|abs| fs::read_to_string(abs).ok()))
        .collect())
}

/// Atomic write: write a temp file next to the target, then rename over it,
/// so a crash mid-write never leaves a half-written note.
#[tauri::command]
pub fn vault_write(state: State<VaultState>, path: String, content: String) -> CmdResult<()> {
    let root = root(&state)?;
    let abs = resolve(&root, &path)?;
    if let Some(parent) = abs.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let tmp = abs.with_extension(format!(
        "{}.ib-tmp",
        abs.extension().map(|e| e.to_string_lossy().into_owned()).unwrap_or_default()
    ));
    fs::write(&tmp, content).map_err(|e| format!("{path}: {e}"))?;
    fs::rename(&tmp, &abs).map_err(|e| format!("{path}: {e}"))
}

#[tauri::command]
pub fn vault_mkdir(state: State<VaultState>, path: String) -> CmdResult<()> {
    let root = root(&state)?;
    fs::create_dir_all(resolve(&root, &path)?).map_err(|e| format!("{path}: {e}"))
}

/// "Delete" = move into <vault>/.trash/<timestamp>-<name>. Recoverable, always.
#[tauri::command]
pub fn vault_trash(state: State<VaultState>, path: String) -> CmdResult<String> {
    let root = root(&state)?;
    let abs = resolve(&root, &path)?;
    if abs == root {
        return Err("refusing to trash the vault root".into());
    }
    let name = abs.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
    let stamp = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
    let trash = root.join(".trash");
    fs::create_dir_all(&trash).map_err(|e| e.to_string())?;
    let dest = trash.join(format!("{stamp}-{name}"));
    fs::rename(&abs, &dest).map_err(|e| format!("{path}: {e}"))?;
    Ok(to_rel(&root, &dest))
}

#[tauri::command]
pub fn vault_rename(state: State<VaultState>, from: String, to: String) -> CmdResult<()> {
    let root = root(&state)?;
    let dest = resolve(&root, &to)?;
    if dest.exists() {
        return Err(format!("{to}: already exists"));
    }
    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::rename(resolve(&root, &from)?, dest).map_err(|e| format!("{from}: {e}"))
}

#[tauri::command]
pub fn vault_exists(state: State<VaultState>, path: String) -> CmdResult<bool> {
    let root = root(&state)?;
    Ok(resolve(&root, &path)?.exists())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolve_stays_inside_the_vault() {
        let root = Path::new("/vault");
        assert!(resolve(root, "notes/a.md").is_ok());
        assert!(resolve(root, "./notes/a.md").is_ok());
        assert!(resolve(root, "/notes/a.md").is_ok()); // leading slash = vault root
        assert!(resolve(root, "../etc/passwd").is_err());
        assert!(resolve(root, "notes/../../x").is_err());
    }
}
