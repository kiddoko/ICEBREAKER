//! The vault: a folder of Markdown files (compatible with Obsidian).
//!
//! The UI only ever talks in *vault-relative* paths like "journal/2026-11-17.md".
//! `resolve` turns them into real paths and refuses anything that would
//! escape the vault ("../", absolute paths, drive letters). That one function
//! is the security boundary for file access — plugins included.
//!
//! A vault is plain (Markdown files, Obsidian-compatible) or **encrypted**
//! (store.rs: one `.icebreaker-vault/` folder of encrypted blobs + an encrypted
//! index; docs/ENCRYPTION.md). Every command below works the same on both: the
//! deck never knows which one it talks to. An encrypted vault is unlocked by the
//! account's password at login ([`offer_password`]) and locked again (key and
//! index wiped from memory) by [`lock`]: lock, logout, quit.

use crate::crypto;
use crate::store::{self, Store};
use serde::Serialize;
use std::fs;
use std::path::{Component, Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager, State};
use zeroize::Zeroizing;

type CmdResult<T> = Result<T, String>;

const LOCKED: &str = "the vault is encrypted and locked: log in again (or: vault unlock)";
const BUSY: &str = "the vault is being encrypted or decrypted: wait a moment";

#[derive(Default)]
pub struct VaultState {
    root: Mutex<Option<PathBuf>>,
    /// Watches the vault folder for changes made outside the app (terminal, Obsidian, Finder…).
    watcher: Mutex<Option<notify::RecommendedWatcher>>,
    /// the unlocked encrypted vault (None: plain, or locked)
    store: Mutex<Option<Store>>,
    /// `vault encrypt` / `decrypt` / `export` running: every other command waits its turn (refused)
    busy: AtomicBool,
    /// `vault move`: the folder the vault came from (the only one `vault_move_cleanup` may empty)
    moved_from: Mutex<Option<PathBuf>>,
    /// the password of a login that happened before the vault was mounted (wiped once used, or after 2 min)
    pending: Mutex<Option<(Zeroizing<String>, Instant)>>,
    fails: AtomicU32,
}

/// Where a command goes: the plain folder, or the unlocked store.
enum Mode<'a> {
    Plain(PathBuf),
    Enc(std::sync::MutexGuard<'a, Option<Store>>),
}

fn mode(state: &VaultState) -> CmdResult<Mode<'_>> {
    prune_pending(state);
    if state.busy.load(Ordering::SeqCst) {
        return Err(BUSY.into());
    }
    let root = root(state)?;
    let g = state.store.lock().map_err(|e| e.to_string())?;
    if g.is_some() {
        return Ok(Mode::Enc(g));
    }
    if store::is_encrypted(&root) {
        return Err(LOCKED.into());
    }
    Ok(Mode::Plain(root))
}

/// ICEBREAKER's own files in the vault (account.rs): the account's card (its
/// password hash), its settings and, in an encrypted vault, its secrets. Only the
/// native side reads and writes them — never the UI, a module, ibsh or the AI —
/// so nothing can read your API key or plant settings another computer would take.
const PRIVATE: &[&str] = &[".icebreaker/account.json", ".icebreaker/settings.json", ".icebreaker/secrets.json"];

const DECK_DIR: &str = ".icebreaker";
const PRIVATE_NAMES: &[&str] = &["account.json", "settings.json", "secrets.json"];

/// Is this file name (already folded) one of ICEBREAKER's own in its folder — or a short
/// alias Windows could give one ("ACCOUN~1.JSO")?
fn private_name(folded: &str) -> bool {
    PRIVATE_NAMES.contains(&folded) || store::short_alias(folded)
}

/// Refuse ICEBREAKER's own files, and moving the folder that holds them. Compared the way
/// a disk compares names (store::fold): ".ICEBREAKER/Account.json" is the same file on a
/// Mac or on Windows, "account.json." or "account.json::$DATA" on Windows.
fn guard(rel: &str, moving: bool) -> CmdResult<()> {
    let n = store::norm(rel)?;
    let parts: Vec<String> = n.split('/').filter(|p| !p.is_empty()).map(store::fold).collect();
    let in_deck = parts.first().is_some_and(|p| p == DECK_DIR);
    if in_deck && parts.len() == 2 && private_name(&parts[1]) {
        return Err(format!("{n}: ICEBREAKER's own file (your settings: config; your account: account)"));
    }
    if moving && (parts.is_empty() || (in_deck && parts.len() == 1)) {
        return Err("ICEBREAKER's own folder can't be moved, replaced or trashed".into());
    }
    debug_assert!(PRIVATE.iter().all(|p| p.starts_with(DECK_DIR)));
    Ok(())
}

/// A plain vault's path, checked on the disk too: whatever the path looks like (a link
/// inside the vault that leads to `.icebreaker/`, another spelling the disk takes for the
/// same file), it must not BE one of ICEBREAKER's own files.
fn plain(root: &Path, rel: &str) -> CmdResult<PathBuf> {
    store::norm(rel)?;
    let abs = resolve(root, rel)?;
    let deck = root.join(DECK_DIR);
    if let (Some(dir), Some(name)) = (abs.parent(), abs.file_name()) {
        if let (Ok(a), Ok(b)) = (dir.canonicalize(), deck.canonicalize()) {
            if a == b && private_name(&store::fold(&name.to_string_lossy())) {
                return Err(format!("{rel}: ICEBREAKER's own file (your settings: config; your account: account)"));
            }
        }
    }
    // the same file under another name (a link straight to it)
    for p in PRIVATE {
        if let (Ok(a), Ok(b)) = (abs.canonicalize(), root.join(p).canonicalize()) {
            if a == b {
                return Err(format!("{rel}: ICEBREAKER's own file (your settings: config; your account: account)"));
            }
        }
    }
    Ok(abs)
}

/// A NEW file or folder can't have a name that holds control characters (an escape sequence
/// in a name repaints a terminal that lists it), characters that reverse the reading
/// direction ("\u{202e}gnp.exe" shows as "exe.png") or line breaks. Names already on the
/// disk are still read, moved and trashed.
fn new_name(rel: &str) -> CmdResult<()> {
    let bad = |c: char| c.is_control() || matches!(c as u32, 0x2028 | 0x2029 | 0x202A..=0x202E | 0x2066..=0x2069);
    if rel.chars().any(bad) {
        let shown: String = rel.chars().map(|c| if bad(c) { '\u{fffd}' } else { c }).collect();
        return Err(format!("{shown}: a name can't hold control characters, line breaks or characters that reverse the reading direction"));
    }
    Ok(())
}

/// Is this path, on the disk, ICEBREAKER's own folder (under any name or link)?
fn is_deck_dir(root: &Path, abs: &Path) -> bool {
    match (abs.canonicalize(), root.join(DECK_DIR).canonicalize()) {
        (Ok(a), Ok(b)) => a == b,
        _ => false,
    }
}

/// The plain vault's folder (checks the path can't take the encrypted store's name).
fn plain_path(root: &Path, rel: &str) -> CmdResult<PathBuf> {
    plain(root, rel)
}

/// A vault folder about to be used (mounted, opened from the login page): what an
/// interrupted `vault rekey` left is put right — never while one is running on it.
pub fn settle(state: &VaultState, path: &Path) {
    let running = state.busy.load(Ordering::SeqCst) && root(state).ok().as_deref() == Some(path);
    if !running {
        store::finish_interrupted(path);
    }
}

/// The login's password waits for the vault to be mounted for 2 minutes at most.
fn prune_pending(state: &VaultState) {
    if let Ok(mut p) = state.pending.lock() {
        if p.as_ref().is_some_and(|(_, at)| at.elapsed() >= Duration::from_secs(120)) {
            *p = None; // dropping it wipes it
        }
    }
}

/// Lock the vault: the key and the index are wiped from memory (lock, logout, quit).
pub fn lock(state: &VaultState) {
    if let Ok(mut g) = state.store.lock() {
        *g = None; // dropping the Store zeroizes its key and its index
    }
    if let Ok(mut p) = state.pending.lock() {
        *p = None;
    }
}

/// Is the mounted vault an encrypted one? (Claude Code then gets no access to the disk.)
pub fn is_encrypted(state: &VaultState) -> bool {
    root(state).map(|r| store::is_encrypted(&r)).unwrap_or(false)
}

/// Unlock the mounted vault with this password, if it's encrypted and locked. True if it opened.
/// Never while `vault encrypt / decrypt / rekey…` runs on it.
fn try_unlock(state: &VaultState, password: &str) -> bool {
    if state.busy.load(Ordering::SeqCst) {
        return false;
    }
    unlock_now(state, password)
}

/// The same, from inside an exclusive operation (it failed: the vault opens again).
fn unlock_now(state: &VaultState, password: &str) -> bool {
    let Ok(root) = root(state) else { return false };
    if !store::is_encrypted(&root) || state.store.lock().map(|g| g.is_some()).unwrap_or(true) {
        return false;
    }
    match Store::unlock(&root, password) {
        Ok(s) => {
            if let Ok(mut g) = state.store.lock() {
                *g = Some(s);
            }
            true
        }
        Err(_) => false,
    }
}

/// A login succeeded (account.rs): its password opens the vault — now if it's
/// mounted, else when it is (within 2 minutes). Never written anywhere.
pub fn offer_password(state: &VaultState, password: &str) {
    if root(state).is_ok() && is_encrypted(state) {
        try_unlock(state, password);
        return;
    }
    if let Ok(mut p) = state.pending.lock() {
        *p = Some((Zeroizing::new(password.to_string()), Instant::now()));
    }
}

/// A new account password (account.rs): the vault key is re-wrapped by it.
/// Returns the key file as it was, to put back if the account can't be saved.
pub fn rewrap(state: &VaultState, old: &str, new: &str) -> CmdResult<Option<crypto::KeyFile>> {
    let Ok(root) = root(state) else { return Ok(None) };
    if !store::is_encrypted(&root) {
        return Ok(None);
    }
    if state.store.lock().map(|g| g.is_none()).unwrap_or(true) {
        return Err("the vault is locked: it must be open to change the password".into());
    }
    let before = store::load_key_file(&root).map_err(|e| e.to_string())?;
    let key = before.unlock(old).map_err(|_| "the vault doesn't open with this password: nothing changed".to_string())?;
    let mut kf = before.clone();
    kf.change_password(&key, new).map_err(|e| e.to_string())?;
    store::save_key_file(&root, &kf)?;
    Ok(Some(before))
}

/// Put the key file back (the account change failed after [`rewrap`]).
pub fn rewrap_undo(state: &VaultState, before: &crypto::KeyFile) {
    if let Ok(root) = root(state) {
        let _ = store::save_key_file(&root, before);
    }
}

/// Tell the UI when files change on disk (debounced), so the tree, search and
/// widgets follow what you do in the terminal or another app.
fn watch(app: &AppHandle, state: &State<VaultState>, dir: &Path) {
    use notify::{EventKind, RecursiveMode, Watcher};
    let (tx, rx) = std::sync::mpsc::channel::<()>();
    let root = dir.to_path_buf();
    let w = notify::recommended_watcher(move |res: notify::Result<notify::Event>| {
        let Ok(ev) = res else { return };
        if matches!(ev.kind, EventKind::Access(_)) {
            return;
        }
        // ICEBREAKER's own bookkeeping doesn't change what you see
        let ours = |p: &PathBuf| {
            p.strip_prefix(&root).ok().and_then(|r| r.components().next()).map(|c| {
                let c = c.as_os_str().to_string_lossy();
                SKIPPED_DIRS.contains(&c.as_ref()) || c.starts_with(store::STORE_DIR)
            }).unwrap_or(false)
        };
        if !ev.paths.is_empty() && ev.paths.iter().all(ours) {
            return;
        }
        let _ = tx.send(());
    });
    let Ok(mut w) = w else { return };
    if w.watch(dir, RecursiveMode::Recursive).is_err() {
        return;
    }
    let app = app.clone();
    std::thread::spawn(move || {
        // one event once things settle for 250 ms (a `git checkout` is one refresh, not a thousand)
        while rx.recv().is_ok() {
            while rx.recv_timeout(std::time::Duration::from_millis(250)).is_ok() {}
            let _ = app.emit("vault-fs", ());
        }
    });
    // replacing the old watcher drops it, which ends its thread
    if let Ok(mut slot) = state.watcher.lock() {
        *slot = Some(w);
    }
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

/// The mounted vault folder (also used by claude_code.rs as the CLI's working directory).
pub(crate) fn vault_root(state: &State<VaultState>) -> CmdResult<PathBuf> {
    root(state)
}

fn root(state: &VaultState) -> CmdResult<PathBuf> {
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
        // a link (symlink, alias) on the way must lead back inside the vault: the deck
        // never reads or writes outside it, whatever the path looks like
        if fs::symlink_metadata(&out).map(|m| m.file_type().is_symlink()).unwrap_or(false) && !leads_inside(root, &out) {
            return Err(format!("a link leads out of the vault: {rel}"));
        }
    }
    Ok(out)
}

/// Does this path, links followed, end up inside the vault? (a dangling link: no)
fn leads_inside(root: &Path, p: &Path) -> bool {
    match (p.canonicalize(), root.canonicalize()) {
        (Ok(real), Ok(real_root)) => real.starts_with(real_root),
        _ => false,
    }
}

/// An entry to show: links that lead out of the vault are left out (they couldn't be opened).
fn shown(root: &Path, p: &Path) -> bool {
    !fs::symlink_metadata(p).map(|m| m.file_type().is_symlink()).unwrap_or(false) || leads_inside(root, p)
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

fn enc_entry(path: &str, n: &store::Node) -> Entry {
    Entry { path: path.to_string(), name: store::name(path).to_string(), is_dir: n.dir, size: n.size, modified: n.modified }
}

fn sort_entries(out: &mut [Entry]) {
    out.sort_by(|a, b| b.is_dir.cmp(&a.is_dir).then(a.name.to_lowercase().cmp(&b.name.to_lowercase())));
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

/// Use `path` as the vault (created if it doesn't exist). `~` means the home folder.
/// An encrypted vault opens with the password of the login that just happened.
#[tauri::command(async)]
pub fn vault_mount(app: AppHandle, state: State<VaultState>, path: String) -> CmdResult<String> {
    if state.busy.load(Ordering::SeqCst) {
        return Err(BUSY.into());
    }
    let path = path.trim().trim_matches('"').to_string();
    let dir = match path.strip_prefix('~') {
        Some(rest) => {
            let home = app.path().home_dir().map_err(|e| e.to_string())?;
            home.join(rest.trim_start_matches(['/', '\\']))
        }
        None => PathBuf::from(&path),
    };
    fs::create_dir_all(&dir).map_err(|e| format!("cannot create vault at {path}: {e}"))?;
    let dir = dir.canonicalize().map(strip_verbatim).unwrap_or(dir);
    let same = state.root.lock().map_err(|e| e.to_string())?.as_deref() == Some(dir.as_path());
    if !same {
        // another vault: the one that was open is locked first
        *state.store.lock().map_err(|e| e.to_string())? = None;
    }
    *state.root.lock().map_err(|e| e.to_string())? = Some(dir.clone());
    store::finish_interrupted(&dir);
    // the login's password: used once if this vault is encrypted, wiped either way
    let pending = state.pending.lock().map_err(|e| e.to_string())?.take();
    if store::is_encrypted(&dir) {
        if let Some((pw, at)) = pending {
            if at.elapsed() < Duration::from_secs(120) {
                try_unlock(&state, &pw);
            }
        }
    } else {
        crypto::sweep_temp_files(&dir);
    }
    watch(&app, &state, &dir);
    Ok(dir.to_string_lossy().into_owned())
}

#[tauri::command]
pub fn vault_list(state: State<VaultState>, path: String) -> CmdResult<Vec<Entry>> {
    let root = match mode(&state)? {
        Mode::Enc(g) => {
            let s = g.as_ref().unwrap();
            let mut out: Vec<Entry> = s.list(&store::norm(&path)?)?.iter().map(|(p, n)| enc_entry(p, n)).collect();
            sort_entries(&mut out);
            return Ok(out);
        }
        Mode::Plain(r) => r,
    };
    let dir = resolve(&root, &path)?;
    let read = fs::read_dir(&dir).map_err(|e| format!("{path}: {e}"))?;
    let mut out: Vec<Entry> = read
        .flatten()
        .filter(|d| shown(&root, &d.path()))
        .filter(|d| !(dir == root && d.file_name().to_string_lossy().starts_with(store::STORE_DIR)))
        .filter_map(|d| entry(&root, &d.path()))
        .collect();
    sort_entries(&mut out);
    Ok(out)
}

#[tauri::command]
pub fn vault_walk(state: State<VaultState>) -> CmdResult<Vec<Entry>> {
    let root = match mode(&state)? {
        Mode::Enc(g) => {
            let s = g.as_ref().unwrap();
            // like the plain walk: dot-folders and tooling folders (and what's in them) left out
            let hidden = |part: &str| part.starts_with('.') || SKIPPED_DIRS.contains(&part);
            return Ok(s
                .all()
                .filter(|(p, n)| {
                    let parts: Vec<&str> = p.split('/').collect();
                    !parts[..parts.len() - 1].iter().any(|d| hidden(d)) && !(n.dir && hidden(parts[parts.len() - 1]))
                })
                .take(MAX_WALK_ENTRIES)
                .map(|(p, n)| enc_entry(p, n))
                .collect());
        }
        Mode::Plain(r) => r,
    };
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
            if !shown(&root, &p) {
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
    guard(&path, false)?;
    match mode(&state)? {
        Mode::Enc(g) => {
            let data = g.as_ref().unwrap().read(&store::norm(&path)?)?;
            String::from_utf8(data.to_vec()).map_err(|_| format!("{path}: stream did not contain valid UTF-8"))
        }
        Mode::Plain(root) => fs::read_to_string(plain(&root, &path)?).map_err(|e| format!("{path}: {e}")),
    }
}

/// Raw bytes of a file (custom UI sounds, a module's binary files), at most 256 MB (a song's export).
#[tauri::command]
pub fn vault_read_bytes(state: State<VaultState>, path: String) -> CmdResult<tauri::ipc::Response> {
    guard(&path, false)?;
    let root = match mode(&state)? {
        Mode::Enc(g) => {
            let s = g.as_ref().unwrap();
            let rel = store::norm(&path)?;
            if s.node(&rel).is_some_and(|n| n.size > MAX_BYTES) {
                return Err(format!("{path}: larger than 256 MB"));
            }
            return Ok(tauri::ipc::Response::new(s.read(&rel)?.to_vec()));
        }
        Mode::Plain(r) => r,
    };
    let p = plain(&root, &path)?;
    let meta = fs::metadata(&p).map_err(|e| format!("{path}: {e}"))?;
    if meta.len() > MAX_BYTES {
        return Err(format!("{path}: larger than 256 MB"));
    }
    Ok(tauri::ipc::Response::new(fs::read(&p).map_err(|e| format!("{path}: {e}"))?))
}

/// Read many files in one round-trip (used by grep, search and the AI tools).
#[tauri::command]
pub fn vault_read_many(state: State<VaultState>, paths: Vec<String>) -> CmdResult<Vec<Option<String>>> {
    let root = match mode(&state)? {
        Mode::Enc(g) => {
            let s = g.as_ref().unwrap();
            return Ok(paths.iter().map(|p| guard(p, false).ok().and_then(|_| store::norm(p).ok()).and_then(|r| s.read(&r).ok()).and_then(|d| String::from_utf8(d.to_vec()).ok())).collect());
        }
        Mode::Plain(r) => r,
    };
    Ok(paths
        .iter()
        .map(|p| guard(p, false).ok().and_then(|_| plain(&root, p).ok()).and_then(|abs| fs::read_to_string(abs).ok()))
        .collect())
}

/// Atomic write (crypto::write_atomic: temp file, flushed, renamed over the old
/// one), so a crash mid-write never leaves a half-written note.
#[tauri::command]
pub fn vault_write(state: State<VaultState>, path: String, content: String) -> CmdResult<()> {
    let content = Zeroizing::new(content);
    write_data(&state, &path, content.as_bytes())
}

/// The biggest file `vault_read_bytes` / `vault_write_bytes` move in one go (a module's
/// song with its samples, a sound).
const MAX_BYTES: u64 = 256 * 1024 * 1024;

/// Raw bytes written to a file (a module's binary files: a tracker's songs). The body is
/// the bytes; the path comes in the `path` header, percent-encoded (headers are ASCII).
/// Same checks and the same atomic write as `vault_write`.
#[tauri::command]
pub fn vault_write_bytes(state: State<VaultState>, request: tauri::ipc::Request<'_>) -> CmdResult<()> {
    let raw = request.headers().get("path").ok_or("vault_write_bytes: no path")?;
    let path = percent_decode(raw.to_str().map_err(|_| "vault_write_bytes: the path isn't ASCII")?)?;
    let tauri::ipc::InvokeBody::Raw(data) = request.body() else {
        return Err("vault_write_bytes: the body must be raw bytes".into());
    };
    if data.len() as u64 > MAX_BYTES {
        return Err(format!("{path}: larger than 256 MB"));
    }
    write_data(&state, &path, data)
}

/// `%41` → `A`; the result must be UTF-8 (what `encodeURIComponent` makes).
pub(crate) fn percent_decode(s: &str) -> CmdResult<String> {
    let b = s.as_bytes();
    let mut out = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        if b[i] == b'%' {
            let hex = s.get(i + 1..i + 3).ok_or("bad %-escape in the path")?;
            out.push(u8::from_str_radix(hex, 16).map_err(|_| "bad %-escape in the path")?);
            i += 3;
        } else {
            out.push(b[i]);
            i += 1;
        }
    }
    String::from_utf8(out).map_err(|_| "the path isn't UTF-8".into())
}

fn write_data(state: &State<VaultState>, path: &str, data: &[u8]) -> CmdResult<()> {
    guard(path, false)?;
    let root = match mode(state)? {
        Mode::Enc(mut g) => {
            let s = g.as_mut().unwrap();
            let rel = store::norm(path)?;
            if !s.exists(&rel) {
                new_name(&rel)?;
            }
            return s.write(&rel, data);
        }
        Mode::Plain(r) => r,
    };
    let abs = plain_path(&root, path)?;
    if !abs.exists() {
        new_name(path)?;
    }
    if let Some(parent) = abs.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    crypto::write_atomic(&abs, data).map_err(|e| format!("{path}: {e}"))
}

#[tauri::command]
pub fn vault_mkdir(state: State<VaultState>, path: String) -> CmdResult<()> {
    guard(&path, false)?;
    new_name(&path)?;
    match mode(&state)? {
        Mode::Enc(mut g) => g.as_mut().unwrap().mkdir(&store::norm(&path)?),
        Mode::Plain(root) => fs::create_dir_all(plain_path(&root, &path)?).map_err(|e| format!("{path}: {e}")),
    }
}

/// "Delete" = move into <vault>/.trash/<timestamp>-<name>. Recoverable, always.
#[tauri::command]
pub fn vault_trash(state: State<VaultState>, path: String) -> CmdResult<String> {
    guard(&path, true)?;
    let root = match mode(&state)? {
        Mode::Enc(mut g) => return g.as_mut().unwrap().trash(&store::norm(&path)?),
        Mode::Plain(r) => r,
    };
    let abs = plain(&root, &path)?;
    if abs == root || is_deck_dir(&root, &abs) {
        return Err("refusing to trash the vault root or ICEBREAKER's own folder".into());
    }
    let name = abs.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
    let stamp = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
    let trash = root.join(".trash");
    fs::create_dir_all(&trash).map_err(|e| e.to_string())?;
    let dest = trash.join(format!("{stamp}-{name}"));
    fs::rename(&abs, &dest).map_err(|e| format!("{path}: {e}"))?;
    Ok(to_rel(&root, &dest))
}

/// Is this vault path inside `.trash` (and not `.trash` itself)?
fn in_trash(rel: &str) -> CmdResult<String> {
    let n = store::norm(rel)?;
    if !n.starts_with(".trash/") || n.len() <= ".trash/".len() {
        return Err(format!("{rel}: only what's in the trash can be deleted for good"));
    }
    Ok(n)
}

/// Delete for good something in the vault's `.trash` (the TRASH page's "delete
/// permanently", `trash purge`, `trash empty`). Nothing else can ever be deleted this way:
/// the path must be inside `.trash`, and `.trash` itself must be a real folder (a link
/// named .trash leading to your notes is refused). A link inside the trash: the link goes,
/// never what it points to.
#[tauri::command]
pub fn vault_purge(state: State<VaultState>, path: String) -> CmdResult<()> {
    let n = in_trash(&path)?;
    guard(&n, true)?;
    let root = match mode(&state)? {
        Mode::Enc(mut g) => return g.as_mut().unwrap().purge(&n),
        Mode::Plain(r) => r,
    };
    let trash = root.join(".trash");
    let meta = fs::symlink_metadata(&trash).map_err(|e| format!(".trash: {e}"))?;
    if !meta.is_dir() || meta.file_type().is_symlink() {
        return Err(".trash isn't a real folder: nothing deleted".into());
    }
    let abs = plain(&root, &n)?;
    if abs.parent().map(|p| p.starts_with(&trash)) != Some(true) {
        return Err(format!("{path}: only what's in the trash can be deleted for good"));
    }
    let m = fs::symlink_metadata(&abs).map_err(|e| format!("{path}: {e}"))?;
    if m.is_dir() && !m.file_type().is_symlink() { fs::remove_dir_all(&abs) } else { fs::remove_file(&abs) }.map_err(|e| format!("{path}: {e}"))
}

#[tauri::command]
pub fn vault_rename(state: State<VaultState>, from: String, to: String) -> CmdResult<()> {
    guard(&from, true)?;
    guard(&to, true)?;
    // back from the trash: the name it had; anywhere else: a name every screen shows as it is
    if !store::norm(&from)?.starts_with(".trash/") && !store::norm(&to)?.starts_with(".trash/") {
        new_name(&to)?;
    }
    let root = match mode(&state)? {
        Mode::Enc(mut g) => return g.as_mut().unwrap().rename(&store::norm(&from)?, &store::norm(&to)?),
        Mode::Plain(r) => r,
    };
    let dest = plain_path(&root, &to)?;
    if dest.exists() {
        return Err(format!("{to}: already exists"));
    }
    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let src = plain(&root, &from)?;
    if is_deck_dir(&root, &src) {
        return Err("ICEBREAKER's own folder can't be moved, replaced or trashed".into());
    }
    fs::rename(src, dest).map_err(|e| format!("{from}: {e}"))
}

/// Copy a file or a folder from anywhere on the computer into a vault folder
/// (drag & drop from the Finder / Explorer). Never overwrites: "a.md" becomes
/// "a copy.md", "a copy 2.md"… Returns the new vault-relative path.
#[tauri::command]
pub fn vault_import(state: State<VaultState>, src: String, dir: String) -> CmdResult<String> {
    guard(&dir, false)?;
    let from = PathBuf::from(&src);
    let meta = fs::symlink_metadata(&from).map_err(|e| format!("{src}: {e}"))?;
    let name = from.file_name().ok_or_else(|| format!("{src}: no file name"))?.to_string_lossy().into_owned();
    let (stem, ext) = match name.rfind('.') {
        Some(i) if i > 0 && !meta.is_dir() => (name[..i].to_string(), name[i..].to_string()),
        _ => (name.clone(), String::new()),
    };
    let copy_name = |n: usize| if n == 0 { name.clone() } else if n == 1 { format!("{stem} copy{ext}") } else { format!("{stem} copy {n}{ext}") };
    let root = match mode(&state)? {
        Mode::Enc(mut g) => {
            let s = g.as_mut().unwrap();
            let folder = store::norm(&dir)?;
            if let (Ok(a), Some(r)) = (from.canonicalize(), root(&state).ok().and_then(|r| r.canonicalize().ok())) {
                if r.starts_with(&a) || a.starts_with(&r) {
                    return Err(format!("{name}: can't copy the vault into itself"));
                }
            }
            let join = |n: &str| if folder.is_empty() { n.to_string() } else { format!("{folder}/{n}") };
            let dest = (0..).map(|n| join(&copy_name(n))).find(|p| !s.exists(p)).unwrap();
            guard(&dest, true)?;
            import_into_store(s, &from, &dest, 0)?;
            return Ok(dest);
        }
        Mode::Plain(r) => r,
    };
    let folder = plain_path(&root, &dir)?;
    // dropping the vault (or something inside it) into itself
    if let (Ok(a), Ok(b)) = (from.canonicalize(), folder.canonicalize()) {
        if b.starts_with(&a) {
            return Err(format!("{name}: can't copy a folder into itself"));
        }
    }
    fs::create_dir_all(&folder).map_err(|e| e.to_string())?;
    let dest = (0..).map(|n| folder.join(copy_name(n))).find(|p| !p.exists()).unwrap();
    // where it lands must not be one of ICEBREAKER's own files (a file called settings.json dropped on .icebreaker/)
    let landing = dest.strip_prefix(&root).map(|r| r.components().map(|c| c.as_os_str().to_string_lossy().into_owned()).collect::<Vec<_>>().join("/")).map_err(|e| e.to_string())?;
    guard(&landing, true)?;
    plain(&root, &landing)?;
    copy_tree(&from, &dest, 0)?;
    let rel = dest.strip_prefix(&root).map_err(|e| e.to_string())?;
    Ok(rel.components().map(|c| c.as_os_str().to_string_lossy().into_owned()).collect::<Vec<_>>().join("/"))
}

fn copy_tree(from: &Path, to: &Path, depth: usize) -> CmdResult<()> {
    if depth > 32 {
        return Err("folders too deep".into());
    }
    let meta = fs::symlink_metadata(from).map_err(|e| format!("{}: {e}", from.display()))?;
    if meta.file_type().is_symlink() {
        return Ok(()); // links stay where they are
    }
    if meta.is_dir() {
        fs::create_dir_all(to).map_err(|e| e.to_string())?;
        for e in fs::read_dir(from).map_err(|e| format!("{}: {e}", from.display()))? {
            let e = e.map_err(|e| e.to_string())?;
            copy_tree(&e.path(), &to.join(e.file_name()), depth + 1)?;
        }
        Ok(())
    } else {
        fs::copy(from, to).map(|_| ()).map_err(|e| format!("{}: {e}", from.display()))
    }
}

/// `copy_tree` into an encrypted vault: each file read from the computer, written encrypted.
fn import_into_store(s: &mut Store, from: &Path, to: &str, depth: usize) -> CmdResult<()> {
    if depth > 32 {
        return Err("folders too deep".into());
    }
    let meta = fs::symlink_metadata(from).map_err(|e| format!("{}: {e}", from.display()))?;
    if meta.file_type().is_symlink() {
        return Ok(());
    }
    if meta.is_dir() {
        s.mkdir(to)?;
        for e in fs::read_dir(from).map_err(|e| format!("{}: {e}", from.display()))? {
            let e = e.map_err(|e| e.to_string())?;
            let n = e.file_name().to_string_lossy().into_owned();
            import_into_store(s, &e.path(), &format!("{to}/{n}"), depth + 1)?;
        }
        Ok(())
    } else {
        if meta.len() > store::MAX_FILE {
            return Err(format!("{}: larger than {} MB", from.display(), store::MAX_FILE >> 20));
        }
        let data = Zeroizing::new(fs::read(from).map_err(|e| format!("{}: {e}", from.display()))?);
        s.write(to, &data)
    }
}

#[tauri::command]
pub fn vault_exists(state: State<VaultState>, path: String) -> CmdResult<bool> {
    match mode(&state)? {
        Mode::Enc(g) => Ok(g.as_ref().unwrap().exists(&store::norm(&path)?)),
        Mode::Plain(root) => Ok(resolve(&root, &path)?.exists()),
    }
}

// ── encryption: status, unlock, encrypt, decrypt, export ───────────────────

#[derive(Serialize)]
pub struct CryptStatus {
    encrypted: bool,
    unlocked: bool,
    /// a recovery key exists for it
    recovery: bool,
    busy: bool,
    /// what unlocking found and fixed (recovered files, a rebuilt index)
    notes: Vec<String>,
    /// plain files next to the encrypted vault (vault adopt)
    leftovers: usize,
}

#[tauri::command]
pub fn vault_crypt_status(state: State<VaultState>) -> CmdResult<CryptStatus> {
    let g = state.store.lock().map_err(|e| e.to_string())?;
    let recovery = root(&state).map(|r| store::has_recovery(&r)).unwrap_or(false);
    let leftovers = if is_encrypted(&state) { root(&state).map(|r| store::plain_leftovers(&r).len()).unwrap_or(0) } else { 0 };
    Ok(CryptStatus { encrypted: is_encrypted(&state), unlocked: g.is_some(), recovery, leftovers, busy: state.busy.load(Ordering::SeqCst), notes: g.as_ref().map(|s| s.notes.clone()).unwrap_or_default() })
}

/// Wait longer after each wrong password (0.25 s … 8 s), like the login.
fn throttle(state: &VaultState) {
    let f = state.fails.load(Ordering::SeqCst);
    if f > 0 {
        std::thread::sleep(Duration::from_millis((250u64 << (f - 1).min(5)).min(8000)));
    }
}

fn record(state: &VaultState, ok: bool) {
    if ok {
        state.fails.store(0, Ordering::SeqCst);
    } else {
        state.fails.fetch_add(1, Ordering::SeqCst);
    }
}

/// `vault unlock`: open the encrypted vault with the password (if the login didn't).
#[tauri::command(async)]
pub fn vault_unlock(state: State<VaultState>, password: String) -> CmdResult<()> {
    let password = Zeroizing::new(password);
    if !is_encrypted(&state) {
        return Err("this vault isn't encrypted".into());
    }
    if state.store.lock().map_err(|e| e.to_string())?.is_some() {
        return Ok(());
    }
    if state.busy.load(Ordering::SeqCst) {
        return Err(BUSY.into());
    }
    throttle(&state);
    let ok = try_unlock(&state, &password);
    record(&state, ok);
    if ok { Ok(()) } else { Err("wrong password".into()) }
}

/// `vault recovery`: a new recovery key for the mounted encrypted vault (the old
/// one stops working). `password` = the account's, already checked (account.rs).
/// Returns the 24 words, shown once.
pub fn new_recovery(state: &VaultState, password: &str) -> CmdResult<Zeroizing<String>> {
    let root = root(state)?;
    if !store::is_encrypted(&root) {
        return Err("this vault isn't encrypted: there's nothing to recover".into());
    }
    store::new_recovery(&root, password)
}

/// The recovery key opens the vault at `path`; `new_password` opens it from now on.
/// If it's the mounted vault, it's unlocked at once.
pub fn recover(state: &VaultState, path: &Path, words: &str, new_password: &str) -> CmdResult<()> {
    settle(state, path);
    if !store::is_encrypted(path) {
        return Err("this vault isn't encrypted: there's nothing to recover".into());
    }
    if state.busy.load(Ordering::SeqCst) {
        return Err(BUSY.into());
    }
    throttle(state);
    let r = store::recover(path, words, new_password);
    record(state, r.is_ok());
    let s = r?;
    if root(state).ok().as_deref() == Some(path) {
        *state.store.lock().map_err(|e| e.to_string())? = Some(s);
    }
    Ok(())
}

/// Can the mounted vault be read and written now? (mounted, not locked, not busy)
pub fn accessible(state: &VaultState) -> bool {
    mode(state).is_ok()
}

/// A file of the mounted vault, plain or encrypted (None: missing, or locked).
pub fn read_file(state: &VaultState, rel: &str) -> Option<Vec<u8>> {
    match mode(state).ok()? {
        Mode::Enc(g) => g.as_ref()?.read(rel).ok().map(|d| d.to_vec()),
        Mode::Plain(root) => fs::read(resolve(&root, rel).ok()?).ok(),
    }
}

/// Write a file of the mounted vault, plain or encrypted (atomically either way).
pub fn write_file(state: &VaultState, rel: &str, data: &[u8]) -> CmdResult<()> {
    match mode(state)? {
        Mode::Enc(mut g) => g.as_mut().ok_or(LOCKED)?.write(rel, data),
        Mode::Plain(root) => {
            // the native side's own writes (the account's card, its settings): `resolve` only
            store::norm(rel)?;
            let abs = resolve(&root, rel)?;
            if let Some(p) = abs.parent() {
                fs::create_dir_all(p).map_err(|e| e.to_string())?;
            }
            // the account's card holds its password's hash: readable by your user only
            if PRIVATE.contains(&store::norm(rel)?.as_str()) {
                crypto::write_private(&abs, data).map_err(|e| e.to_string())
            } else {
                crypto::write_atomic(&abs, data).map_err(|e| e.to_string())
            }
        }
    }
}

/// `vault move <folder>`: the whole vault copied there, every file checked, then
/// the deck uses the new place (an unlocked encrypted vault stays unlocked). The
/// old folder stays until `vault_move_cleanup` (the deck asks you). Returns the new path.
#[tauri::command(async)]
pub fn vault_move(app: AppHandle, state: State<VaultState>, dest: String) -> CmdResult<String> {
    let old = root(&state)?;
    let dest = dest.trim().trim_matches('"');
    let to = match dest.strip_prefix('~') {
        Some(rest) => app.path().home_dir().map_err(|e| e.to_string())?.join(rest.trim_start_matches(['/', '\\'])),
        None => PathBuf::from(dest),
    };
    if !to.is_absolute() {
        return Err("give the new folder's full path (or ~/…)".into());
    }
    // a folder that already holds things (Documents, a USB key…): the vault goes inside it, under its own name
    let holds_things = fs::read_dir(&to).map(|mut it| it.next().is_some()).unwrap_or(false);
    let to = if holds_things { to.join(old.file_name().unwrap_or_else(|| std::ffi::OsStr::new("Icebreaker"))) } else { to };
    exclusive(&state, || {
        store::copy_vault(&old, &to)?;
        let new_root = to.canonicalize().map(strip_verbatim).unwrap_or(to.clone());
        if let Some(s) = state.store.lock().map_err(|e| e.to_string())?.as_mut() {
            s.moved_to(&new_root);
        }
        *state.root.lock().map_err(|e| e.to_string())? = Some(new_root.clone());
        *state.moved_from.lock().map_err(|e| e.to_string())? = Some(old.clone());
        Ok(new_root.to_string_lossy().into_owned())
    })
    .inspect(|p| watch(&app, &state, Path::new(p)))
}

/// After `vault move`, once the deck uses the new place: the old folder is emptied
/// and removed — only that one, and never a home folder or a disk root.
#[tauri::command(async)]
pub fn vault_move_cleanup(state: State<VaultState>) -> CmdResult<()> {
    let old = state.moved_from.lock().map_err(|e| e.to_string())?.take().ok_or("nothing was moved")?;
    let now = root(&state)?;
    let home = std::env::var_os("HOME").or_else(|| std::env::var_os("USERPROFILE")).map(PathBuf::from);
    if old == now || old.parent().is_none() || home.as_deref() == Some(old.as_path()) || now.starts_with(&old) {
        return Err("refusing to remove that folder".into());
    }
    fs::remove_dir_all(&old).map_err(|e| format!("{}: {e} (remove it yourself)", old.display()))
}

/// `vault adopt`: plain files next to the encrypted vault go inside it.
#[tauri::command(async)]
pub fn vault_adopt(state: State<VaultState>) -> CmdResult<store::Report> {
    let root = root(&state)?;
    exclusive(&state, || {
        let mut g = state.store.lock().map_err(|e| e.to_string())?;
        let s = g.as_mut().ok_or(LOCKED)?;
        store::adopt_plain(&root, s)
    })
}

/// The mounted vault's folder (account.rs: recovering it).
pub fn mounted(state: &VaultState) -> Option<PathBuf> {
    root(state).ok()
}

/// Runs `f` with every other vault command refused meanwhile.
fn exclusive<T>(state: &VaultState, f: impl FnOnce() -> CmdResult<T>) -> CmdResult<T> {
    if state.busy.swap(true, Ordering::SeqCst) {
        return Err(BUSY.into());
    }
    let r = f();
    state.busy.store(false, Ordering::SeqCst);
    r
}

/// `vault encrypt`: the plain vault becomes an encrypted one (store::encrypt_vault:
/// a plain backup zip next to the vault first, every file checked before a plain
/// one is removed). `password` must be the logged-in account's (account.rs checks
/// it); `stamp` is the date for the backup's name.
pub fn encrypt(state: &VaultState, password: &str, stamp: &str) -> CmdResult<store::Report> {
    let root = root(state)?;
    if store::is_encrypted(&root) {
        return Err("this vault is already encrypted".into());
    }
    let parent = root.parent().ok_or("the vault has no parent folder for its backup")?;
    let vname = root.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_else(|| "vault".into());
    let stamp: String = stamp.chars().filter(|c| c.is_ascii_digit() || *c == '-').take(32).collect();
    let stamp = if stamp.is_empty() { (store::now_ms() / 1000).to_string() } else { stamp };
    let zip = (1..).map(|n| parent.join(if n == 1 { format!("{vname}-backup-{stamp}.zip") } else { format!("{vname}-backup-{stamp}-{n}.zip") })).find(|p| !p.exists()).unwrap();
    exclusive(state, || {
        let (report, s) = store::encrypt_vault(&root, password, &zip)?;
        *state.store.lock().map_err(|e| e.to_string())? = Some(s);
        Ok(report)
    })
}

/// `vault rekey`: a new vault key, every file encrypted again (store::rekey_vault).
/// `password` = the account's, already checked (account.rs). The report carries the new recovery words.
pub fn rekey(state: &VaultState, password: &str) -> CmdResult<store::Report> {
    let root = root(state)?;
    if !store::is_encrypted(&root) {
        return Err("this vault isn't encrypted: there's no key to change".into());
    }
    exclusive(state, || {
        lock(state);
        match store::rekey_vault(&root, password) {
            Ok((report, s)) => {
                *state.store.lock().map_err(|e| e.to_string())? = Some(s);
                Ok(report)
            }
            Err(e) => {
                unlock_now(state, password);
                Err(e)
            }
        }
    })
}

/// `vault decrypt`: back to plain files (every one written, read back and compared
/// before the encrypted folder is removed).
#[tauri::command(async)]
pub fn vault_decrypt(state: State<VaultState>, password: String) -> CmdResult<store::Report> {
    let password = Zeroizing::new(password);
    let root = root(&state)?;
    if !store::is_encrypted(&root) {
        return Err("this vault isn't encrypted".into());
    }
    throttle(&state);
    if let Err(e) = Store::unlock(&root, &password) {
        record(&state, false);
        return Err(e);
    }
    record(&state, true);
    exclusive(&state, || {
        lock(&state);
        let r = store::decrypt_vault(&root, &password);
        if r.is_err() {
            // still encrypted: open it again
            unlock_now(&state, &password);
        }
        r
    })
}

/// `vault export <folder>`: a plain copy of the encrypted vault in a new or empty
/// folder outside it. The vault stays encrypted. The account's password was checked
/// first (account.rs: `vault_export`) — here, not only in the interface.
pub fn export(app: &AppHandle, state: &VaultState, dest: &str) -> CmdResult<store::Report> {
    let root = root(state)?;
    let dest = dest.trim().trim_matches('"');
    let dest = match dest.strip_prefix('~') {
        Some(rest) => app.path().home_dir().map_err(|e| e.to_string())?.join(rest.trim_start_matches(['/', '\\'])),
        None => PathBuf::from(dest),
    };
    if !dest.is_absolute() {
        return Err("give the full path of the folder (or ~/…)".into());
    }
    if !store::is_encrypted(&root) {
        return Err("this vault isn't encrypted: its files are already plain".into());
    }
    exclusive(state, || {
        let s = state.store.lock().map_err(|e| e.to_string())?.take().ok_or(LOCKED)?;
        let r = store::export(&s, &root, &dest);
        *state.store.lock().map_err(|e| e.to_string())? = Some(s);
        r
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn icebreakers_own_files_are_closed_to_the_ui() {
        assert!(guard(".icebreaker/secrets.json", false).is_err());
        assert!(guard("/.icebreaker//account.json", false).is_err());
        assert!(guard(".icebreaker/settings.json", false).is_err());
        assert!(guard(".icebreaker/stats.json", false).is_ok());
        assert!(guard(".icebreaker", true).is_err());
        assert!(guard("", true).is_err());
        assert!(guard(".icebreaker/plugins/x", true).is_ok());
        // the way a Mac or Windows disk reads names: capitals, trailing dots, streams, invisible characters, short aliases
        for p in [".ICEBREAKER/account.json", ".icebreaker/Account.JSON", ".Icebreaker/SETTINGS.json", ".icebreaker/secrets.json.", ".icebreaker/account.json ", ".icebreaker/account.json::$DATA", ".icebreaker./settings.json", ".ice\u{200c}breaker/account.json", ".icebreaker/ACCOUN~1.JSO", ".icebreaker/SETTIN~1.JSO"] {
            assert!(guard(p, false).is_err(), "{p}");
        }
        assert!(guard(".ICEBREAKER", true).is_err());
        assert!(guard("ICEBRE~1/account.json", false).is_err());
        assert!(guard(".icebreaker-VAULT/x", false).is_err());
        assert!(guard("notes/account.json", false).is_ok());
        assert!(guard(".icebreaker/plugins/todo/settings.json", false).is_ok());
        assert!(guard("notes/a.md", true).is_ok());
    }

    #[test]
    fn only_the_trash_can_be_purged() {
        assert!(in_trash(".trash/123-a.md").is_ok());
        assert!(in_trash(".trash/123-folder/b.md").is_ok());
        assert!(in_trash(".trash").is_err());
        assert!(in_trash(".trash/").is_err());
        assert!(in_trash("notes/a.md").is_err());
        assert!(in_trash(".trash/../notes/a.md").is_err());
        assert!(in_trash(".trashy/a.md").is_err());
    }

    #[test]
    fn percent_decoding_the_path_of_raw_writes() {
        assert_eq!(percent_decode("songs/a%20b.med").unwrap(), "songs/a b.med");
        assert_eq!(percent_decode("%C3%A9t%C3%A9.mod").unwrap(), "été.mod");
        assert_eq!(percent_decode("%2E%2E/x").unwrap(), "../x"); // then guard + resolve refuse it, as for any path
        assert!(percent_decode("a%2").is_err());
        assert!(percent_decode("a%zz").is_err());
        assert!(percent_decode("%FF").is_err());
    }

    #[test]
    fn resolve_stays_inside_the_vault() {
        let root = Path::new("/vault");
        assert!(resolve(root, "notes/a.md").is_ok());
        assert!(resolve(root, "./notes/a.md").is_ok());
        assert!(resolve(root, "/notes/a.md").is_ok()); // leading slash = vault root
        assert!(resolve(root, "../etc/passwd").is_err());
        assert!(resolve(root, "notes/../../x").is_err());
    }

    #[cfg(unix)]
    #[test]
    fn links_out_of_the_vault_are_refused() {
        let base = std::env::temp_dir().join(format!("ib-vault-test-{}", std::process::id()));
        let vault = base.join("vault");
        let outside = base.join("outside");
        fs::create_dir_all(vault.join("notes")).unwrap();
        fs::create_dir_all(&outside).unwrap();
        fs::write(outside.join("secret.txt"), "no").unwrap();
        fs::write(vault.join("notes/a.md"), "yes").unwrap();
        std::os::unix::fs::symlink(&outside, vault.join("out")).unwrap();
        std::os::unix::fs::symlink(vault.join("notes"), vault.join("in")).unwrap();
        std::os::unix::fs::symlink(base.join("nowhere"), vault.join("dangling")).unwrap();
        assert!(resolve(&vault, "out/secret.txt").is_err());
        assert!(resolve(&vault, "out").is_err());
        assert!(resolve(&vault, "dangling").is_err());
        assert!(resolve(&vault, "in/a.md").is_ok()); // a link that stays inside is fine
        assert!(resolve(&vault, "notes/a.md").is_ok());
        assert!(!shown(&vault, &vault.join("out")));
        assert!(shown(&vault, &vault.join("in")));
        let _ = fs::remove_dir_all(&base);
    }
}
