//! An encrypted vault on disk (plan: docs/ENCRYPTION.md, step 2).
//!
//! ```text
//! <vault>/.icebreaker-vault/
//!     vault.key          the vault key, wrapped by your password (crypto::KeyFile)
//!     vault.key.copy     the same, in case one copy gets damaged
//!     index.ibx          encrypted: every path (names, folders) → its blob
//!     blobs/3f/3fa1….ibx one encrypted blob per file (random names)
//! ```
//!
//! Nothing else of the vault is on the disk: no names, no folders, no sizes in clear.
//! The deck talks in vault paths as always ("journal/2026-11-20.md"); this module
//! keeps them in the index, which stays decrypted in memory while the vault is
//! unlocked (dropping the [`Store`] wipes it and the key).
//!
//! - A write makes a **new** blob, then writes the index (atomically), then removes
//!   the old blob. A crash at any point leaves the old note or the new one.
//! - Each blob also holds the path it was written at, so blobs the index doesn't
//!   know (a crash between the two writes) come back in `.trash/recovered-…`, and a
//!   lost or damaged index is rebuilt from the blobs. Nothing is ever deleted
//!   because it looks unknown.
//! - Renames and moves only rewrite the index.
//!
//! [`encrypt_vault`] / [`decrypt_vault`] / [`export`] turn a plain vault into an
//! encrypted one and back, each with a backup or a read-back check before anything
//! is removed.

use crate::crypto::{self, CryptoError, KdfParams, KeyFile, VaultKey};
use crate::recovery;
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use unicode_normalization::UnicodeNormalization;
use zeroize::{Zeroize, Zeroizing};

/// The one folder an encrypted vault holds.
pub const STORE_DIR: &str = ".icebreaker-vault";
/// Where `vault encrypt` / `vault rekey` build it (renamed to STORE_DIR once complete).
const PARTIAL_DIR: &str = ".icebreaker-vault.partial";
/// `vault rekey`: the old store for the moment of the swap (removed right after).
const OLD_DIR: &str = ".icebreaker-vault.old";
const KEY_FILE: &str = "vault.key";
const KEY_COPY: &str = "vault.key.copy";
const INDEX_FILE: &str = "index.ibx";
const BLOBS: &str = "blobs";
const AD_INDEX: &[u8] = b"ICEBREAKER index v1";
const BLOB_MAGIC: &[u8; 4] = b"IBB1";
/// One file can't be bigger than this (it's read whole into memory).
pub const MAX_FILE: u64 = 512 * 1024 * 1024;
/// Finder's and Explorer's own files: not notes, never encrypted, removed with the plain files.
const JUNK: &[&str] = &[".DS_Store", "Thumbs.db", "desktop.ini"];
/// The index format this version writes and reads. A newer one is refused — never
/// "repaired" — so an older ICEBREAKER can't damage a vault a newer one wrote.
const INDEX_VERSION: u32 = 1;
const NEWER: &str = "this vault was written by a newer ICEBREAKER: update ICEBREAKER to open it (nothing was changed)";

type Result<T> = std::result::Result<T, String>;

fn err(e: impl std::fmt::Display) -> String {
    e.to_string()
}

pub fn now_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

/// Is the folder at `root` an encrypted vault? Only looks: it never touches the disk
/// (a `vault rekey` in progress must not be "tidied" by someone asking the status).
pub fn is_encrypted(root: &Path) -> bool {
    root.join(STORE_DIR).is_dir() || (!root.join(STORE_DIR).exists() && root.join(OLD_DIR).is_dir())
}

/// A `vault rekey` the power cut between its two renames: the old store comes
/// back (it opens with the same password); a half-built new one goes. Called when a
/// vault is mounted or opened from the login page — never while a rekey is running.
pub fn finish_interrupted(root: &Path) {
    let (store, old, partial) = (root.join(STORE_DIR), root.join(OLD_DIR), root.join(PARTIAL_DIR));
    if !store.exists() && old.is_dir() {
        let _ = fs::rename(&old, &store);
    }
    if store.is_dir() && old.is_dir() {
        // the swap was done: the old store and its key go
        let _ = fs::remove_dir_all(&old);
    }
    if store.is_dir() && partial.is_dir() {
        let _ = fs::remove_dir_all(&partial);
    }
}

/// `vault rekey`: a new vault key — every file encrypted again with it (built next
/// to the old store, every file read back and compared, then swapped in), and a new
/// recovery key. The old `vault.key`, with the old password or the old recovery key,
/// opens nothing any more. Returns the store (open) and the new recovery words.
pub fn rekey_vault(root: &Path, password: &str) -> Result<(Report, Store)> {
    rekey_vault_with(root, password, crypto::DEFAULT_KDF, &|_| Ok(()))
}

fn rekey_vault_with(root: &Path, password: &str, kdf: KdfParams, fail: &dyn Fn(Stage) -> Result<()>) -> Result<(Report, Store)> {
    let old = Store::unlock(root, password)?;
    let partial = root.join(PARTIAL_DIR);
    if partial.exists() {
        fs::remove_dir_all(&partial).map_err(err)?;
    }
    let mut report = Report::default();
    let built = (|| -> Result<()> {
        let (mut kf, key) = KeyFile::create_with(password, kdf).map_err(err)?;
        let (secret, words) = recovery::generate()?;
        kf.set_recovery(&key, &secret[..]).map_err(err)?;
        report.recovery = Some(words.to_string());
        let mut s = Store::create(partial.clone(), key)?;
        s.bulk = true;
        for (i, (path, n)) in old.all().enumerate() {
            fail(Stage::Blob(i))?;
            if n.dir {
                s.ensure_dirs(path)?;
                report.folders += 1;
            } else {
                let data = old.read(path)?;
                s.write_at(path, &data, n.modified)?;
                report.files += 1;
                report.bytes += data.len() as u64;
            }
        }
        s.save_index()?;
        save_key_file_in(&partial, &kf)?;
        // read back through the password, every file compared with the old store
        fail(Stage::BeforeVerify)?;
        let check = Store::open_dir(partial.clone(), KeyFile::load(&partial.join(KEY_FILE)).map_err(err)?.unlock(password).map_err(err)?)?;
        for (path, n) in old.all() {
            if n.dir {
                if !check.is_dir(path) {
                    return Err(format!("check: folder {path} is missing"));
                }
            } else if *check.read(path)? != *old.read(path)? {
                return Err(format!("check: {path} differs once encrypted again"));
            }
        }
        Ok(())
    })();
    if let Err(e) = built {
        let _ = fs::remove_dir_all(&partial);
        return Err(format!("{e} — stopped: the vault and its key are as they were"));
    }
    drop(old);
    // the swap: old aside, new in, old gone (an interruption: finish_interrupted)
    fs::rename(root.join(STORE_DIR), root.join(OLD_DIR)).map_err(err)?;
    if let Err(e) = fs::rename(&partial, root.join(STORE_DIR)) {
        let _ = fs::rename(root.join(OLD_DIR), root.join(STORE_DIR));
        let _ = fs::remove_dir_all(&partial);
        return Err(format!("{e} — stopped: the vault and its key are as they were"));
    }
    let _ = fs::remove_dir_all(root.join(OLD_DIR));
    let s = Store::unlock(root, password)?;
    Ok((report, s))
}

// ── vault paths ────────────────────────────────────────────────────────────

/// "/notes//./a.md" → "notes/a.md"; "" = the vault itself. Refuses "..", and the
/// store's own folder (it can't be a note's name). Unicode NFC: "é" typed on a Mac
/// (often e + ́) and on Linux or Windows (é) is the same name everywhere.
/// A name as a disk may see it. macOS and Windows hold ".ICEBREAKER" and ".icebreaker" as
/// ONE folder; Windows drops trailing dots and spaces and reads "name:stream" as "name";
/// some disks ignore invisible characters. Two names with the same fold may be the same
/// file: what must never be one of the deck's own files is compared by fold, not as typed.
pub fn fold(name: &str) -> String {
    let s: String = name.nfc().filter(|c| !matches!(*c as u32, 0x200B..=0x200F | 0x202A..=0x202E | 0x2060..=0x206F | 0xFEFF)).collect();
    let s = s.to_lowercase();
    s.split(':').next().unwrap_or("").trim_end_matches(['.', ' ']).to_string()
}

/// "ICEBRE~1", "ACCOUN~1.JSO": the short names Windows may give a file besides its own.
pub fn short_alias(folded: &str) -> bool {
    let stem = folded.split('.').next().unwrap_or("");
    match stem.rsplit_once('~') {
        Some((head, n)) => !head.is_empty() && !n.is_empty() && n.bytes().all(|b| b.is_ascii_digit()),
        None => false,
    }
}

pub fn norm(rel: &str) -> Result<String> {
    let rel: String = rel.nfc().collect();
    let rel = rel.as_str();
    let mut parts = Vec::new();
    for p in rel.split(['/', '\\']) {
        match p {
            "" | "." => {}
            ".." => return Err(format!("path escapes the vault: {rel}")),
            p if p.contains('\0') => return Err(format!("bad path: {rel}")),
            p => parts.push(p),
        }
    }
    // however it's written: on a Mac or on Windows ".ICEBREAKER-VAULT" is that same folder
    if parts.first().is_some_and(|p| {
        let f = fold(p);
        f == STORE_DIR || f == PARTIAL_DIR || f == OLD_DIR || (f.contains("icebre~") && short_alias(&f))
    }) {
        return Err(format!("{STORE_DIR} is the encrypted vault's own folder"));
    }
    Ok(parts.join("/"))
}

pub fn parent(p: &str) -> &str {
    p.rfind('/').map(|i| &p[..i]).unwrap_or("")
}

pub fn name(p: &str) -> &str {
    p.rfind('/').map(|i| &p[i + 1..]).unwrap_or(p)
}

fn under(p: &str, dir: &str) -> bool {
    dir.is_empty() || (p.len() > dir.len() && p.starts_with(dir) && p.as_bytes()[dir.len()] == b'/')
}

// ── the index ──────────────────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Node {
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub dir: bool,
    /// the blob (files only)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    #[serde(default)]
    pub size: u64,
    #[serde(default)]
    pub modified: u64,
}

impl Node {
    fn folder() -> Node {
        Node { dir: true, id: None, size: 0, modified: now_ms() }
    }
}

#[derive(Serialize, Deserialize, Clone, Default)]
struct Index {
    version: u32,
    nodes: BTreeMap<String, Node>,
}

impl Drop for Index {
    /// the names are private too: wiped, not just freed
    fn drop(&mut self) {
        for (mut k, mut n) in std::mem::take(&mut self.nodes) {
            k.zeroize();
            if let Some(id) = n.id.as_mut() {
                id.zeroize();
            }
        }
    }
}

/// What a blob holds besides the content: where it was written (for recovery).
#[derive(Serialize, Deserialize)]
struct BlobMeta {
    path: String,
    modified: u64,
}

fn frame(meta: &BlobMeta, data: &[u8]) -> Zeroizing<Vec<u8>> {
    let m = Zeroizing::new(serde_json::to_vec(meta).expect("plain struct"));
    let mut out = Zeroizing::new(Vec::with_capacity(8 + m.len() + data.len()));
    out.extend_from_slice(BLOB_MAGIC);
    out.extend_from_slice(&(m.len() as u32).to_le_bytes());
    out.extend_from_slice(&m);
    out.extend_from_slice(data);
    out
}

fn unframe(plain: &[u8]) -> Result<(BlobMeta, &[u8])> {
    let bad = || "a blob of the vault is damaged".to_string();
    if plain.len() >= 4 && plain.starts_with(b"IBB") && &plain[..4] != BLOB_MAGIC {
        return Err(NEWER.to_string());
    }
    if plain.len() < 8 || &plain[..4] != BLOB_MAGIC {
        return Err(bad());
    }
    let n = u32::from_le_bytes(plain[4..8].try_into().unwrap()) as usize;
    let meta_end = 8usize.checked_add(n).filter(|e| *e <= plain.len()).ok_or_else(bad)?;
    let meta: BlobMeta = serde_json::from_slice(&plain[8..meta_end]).map_err(|_| bad())?;
    Ok((meta, &plain[meta_end..]))
}

fn blob_ad(id: &str) -> Vec<u8> {
    format!("ICEBREAKER blob {id}").into_bytes()
}

fn new_id() -> Result<String> {
    let mut b = [0u8; 16];
    getrandom::getrandom(&mut b).map_err(|_| "the system gave no random bytes".to_string())?;
    Ok(b.iter().map(|x| format!("{x:02x}")).collect())
}

fn valid_id(id: &str) -> bool {
    id.len() == 32 && id.bytes().all(|b| b.is_ascii_hexdigit() && !b.is_ascii_uppercase())
}

// ── the key file (two copies) ──────────────────────────────────────────────

/// The vault's key file: `vault.key`, or its copy if that one is damaged.
pub fn load_key_file(root: &Path) -> std::result::Result<KeyFile, CryptoError> {
    let dir = root.join(STORE_DIR);
    match KeyFile::load(&dir.join(KEY_FILE)) {
        Ok(k) => Ok(k),
        Err(first) => KeyFile::load(&dir.join(KEY_COPY)).map_err(|_| first),
    }
}

/// Both copies, each written atomically.
pub fn save_key_file(root: &Path, kf: &KeyFile) -> Result<()> {
    save_key_file_in(&root.join(STORE_DIR), kf)
}

fn save_key_file_in(dir: &Path, kf: &KeyFile) -> Result<()> {
    kf.save(&dir.join(KEY_FILE)).map_err(err)?;
    kf.save(&dir.join(KEY_COPY)).map_err(err)
}

// ── the store ──────────────────────────────────────────────────────────────

/// An unlocked encrypted vault. Dropping it wipes the key and the index.
pub struct Store {
    dir: PathBuf,
    key: VaultKey,
    index: Index,
    /// what opening it found and fixed (recovered blobs, a rebuilt index…)
    pub notes: Vec<String>,
    /// `vault encrypt`: the index is written once at the end, not after each file
    bulk: bool,
}

impl Store {
    /// The password → the unlocked store of the vault at `root`.
    pub fn unlock(root: &Path, password: &str) -> Result<Store> {
        let kf = load_key_file(root).map_err(err)?;
        let key = kf.unlock(password).map_err(err)?;
        Store::open_dir(root.join(STORE_DIR), key)
    }

    /// A new, empty store in `dir`.
    fn create(dir: PathBuf, key: VaultKey) -> Result<Store> {
        fs::create_dir_all(dir.join(BLOBS)).map_err(err)?;
        let mut s = Store { dir, key, index: Index { version: INDEX_VERSION, nodes: BTreeMap::new() }, notes: vec![], bulk: false };
        s.save_index()?;
        Ok(s)
    }

    fn open_dir(dir: PathBuf, key: VaultKey) -> Result<Store> {
        crypto::sweep_temp_files(&dir);
        let mut s = Store { dir, key, index: Index { version: 1, nodes: BTreeMap::new() }, notes: vec![], bulk: false };
        let path = s.dir.join(INDEX_FILE);
        let mut rebuilt = false;
        match fs::read(&path) {
            Ok(data) => match crypto::open(&s.key, &data, AD_INDEX).map_err(err).and_then(|p| {
                // a newer format is refused before anything is parsed or repaired
                let v: serde_json::Value = serde_json::from_slice(&p).map_err(err)?;
                if v.get("version").and_then(|x| x.as_u64()).unwrap_or(0) > INDEX_VERSION as u64 {
                    return Err(NEWER.to_string());
                }
                serde_json::from_value::<Index>(v).map_err(err)
            }) {
                Ok(ix) => s.index = ix,
                Err(e) if e == NEWER => return Err(e),
                Err(_) => {
                    if s.no_blob_opens() {
                        return Err("this key doesn't open this vault".into());
                    }
                    // never deleted: kept next to the new one
                    let keep = s.dir.join(format!("index.damaged-{}.ibx", now_ms()));
                    fs::rename(&path, &keep).map_err(err)?;
                    s.notes.push(format!("the index was damaged (kept as {}): rebuilt from the files", keep.file_name().unwrap().to_string_lossy()));
                    rebuilt = true;
                }
            },
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
                rebuilt = true;
                s.notes.push("the index was missing: rebuilt from the files".into());
            }
            Err(e) => return Err(err(e)),
        }
        let renamed = s.renormalize();
        if s.adopt_unknown_blobs(rebuilt)? || renamed {
            s.save_index()?;
        }
        Ok(s)
    }

    /// Names written by another computer in another Unicode form (NFD on a Mac) are
    /// put in NFC, like every name the deck asks for. Returns: anything changed.
    fn renormalize(&mut self) -> bool {
        let odd: Vec<String> = self.index.nodes.keys().filter(|k| k.nfc().ne(k.chars())).cloned().collect();
        for k in &odd {
            let n = self.index.nodes.remove(k).unwrap();
            let want: String = k.nfc().collect();
            let at = self.free_name(&want);
            self.index.nodes.insert(at, n);
        }
        !odd.is_empty()
    }

    /// Blobs are there and not one of them opens with this key (so it isn't this vault's key).
    fn no_blob_opens(&self) -> bool {
        let ids = self.all_blob_ids();
        !ids.is_empty() && !ids.iter().take(64).any(|id| fs::read(self.blob_path(id)).is_ok_and(|d| crypto::open(&self.key, &d, &blob_ad(id)).is_ok()))
    }

    /// Close and open again from the disk (tests: what a restart would see).
    #[cfg(test)]
    fn reopen(self) -> Result<Store> {
        let Store { dir, key, .. } = self;
        Store::open_dir(dir, key)
    }

    fn blob_path(&self, id: &str) -> PathBuf {
        self.dir.join(BLOBS).join(&id[..2]).join(format!("{id}.ibx"))
    }

    fn all_blob_ids(&self) -> Vec<String> {
        let mut out = Vec::new();
        let Ok(subs) = fs::read_dir(self.dir.join(BLOBS)) else { return out };
        for sub in subs.flatten() {
            crypto::sweep_temp_files(&sub.path());
            let Ok(files) = fs::read_dir(sub.path()) else { continue };
            for f in files.flatten() {
                let n = f.file_name().to_string_lossy().to_string();
                if let Some(id) = n.strip_suffix(".ibx").filter(|id| valid_id(id)) {
                    out.push(id.to_string());
                }
            }
        }
        out
    }

    /// Blobs the index doesn't know: back to their path (index rebuilt) or into
    /// `.trash/recovered-<time>/` (a write the index missed). Returns: anything changed.
    fn adopt_unknown_blobs(&mut self, rebuilt: bool) -> Result<bool> {
        let known: BTreeSet<String> = self.index.nodes.values().filter_map(|n| n.id.clone()).collect();
        let stamp = now_ms();
        let mut changed = false;
        let mut damaged = 0;
        for id in self.all_blob_ids() {
            if known.contains(&id) {
                continue;
            }
            let Ok(data) = fs::read(self.blob_path(&id)) else { continue };
            let Ok(plain) = crypto::open(&self.key, &data, &blob_ad(&id)) else {
                damaged += 1;
                continue;
            };
            let Ok((meta, content)) = unframe(&plain) else {
                damaged += 1;
                continue;
            };
            let orig = norm(&meta.path).unwrap_or_default();
            let orig = if orig.is_empty() { format!("unnamed-{id}") } else { orig };
            let want = if rebuilt { orig } else { format!(".trash/recovered-{stamp}/{orig}") };
            let at = self.free_name(&want);
            if self.ensure_dirs(parent(&at)).is_err() {
                continue;
            }
            self.index.nodes.insert(at.clone(), Node { dir: false, id: Some(id), size: content.len() as u64, modified: meta.modified });
            if !rebuilt {
                self.notes.push(format!("recovered {at}"));
            }
            changed = true;
        }
        if damaged > 0 {
            self.notes.push(format!("{damaged} damaged file(s) of the vault couldn't be read (left as they are)"));
        }
        Ok(changed)
    }

    /// `p`, or "p (2)", "p (3)"… whichever is free.
    fn free_name(&self, p: &str) -> String {
        if !self.index.nodes.contains_key(p) {
            return p.to_string();
        }
        let (stem, ext) = match name(p).rfind('.') {
            Some(i) if i > 0 => (&p[..p.len() - name(p).len() + i], &name(p)[i..]),
            _ => (p, ""),
        };
        (2..).map(|n| format!("{stem} ({n}){ext}")).find(|c| !self.index.nodes.contains_key(c)).unwrap()
    }

    fn save_index(&mut self) -> Result<()> {
        let json = Zeroizing::new(serde_json::to_vec(&self.index).map_err(err)?);
        let sealed = crypto::seal(&self.key, &json, AD_INDEX).map_err(err)?;
        crypto::write_atomic(&self.dir.join(INDEX_FILE), &sealed).map_err(err)
    }

    /// Change the index; written to disk, or put back as it was if anything fails.
    fn commit<T>(&mut self, f: impl FnOnce(&mut Self) -> Result<T>) -> Result<T> {
        let before = self.index.clone();
        let r = f(self).and_then(|v| if self.bulk { Ok(v) } else { self.save_index().map(|_| v) });
        if r.is_err() {
            self.index = before;
        }
        r
    }

    /// Every folder on the way to `dir` (in the index only; refused through a file).
    fn ensure_dirs(&mut self, dir: &str) -> Result<()> {
        if dir.is_empty() {
            return Ok(());
        }
        let mut cur = String::new();
        for part in dir.split('/') {
            if !cur.is_empty() {
                cur.push('/');
            }
            cur.push_str(part);
            match self.index.nodes.get(&cur) {
                Some(n) if n.dir => {}
                Some(_) => return Err(format!("{cur} is a file, not a folder")),
                None => {
                    self.index.nodes.insert(cur.clone(), Node::folder());
                }
            }
        }
        Ok(())
    }

    pub fn node(&self, path: &str) -> Option<&Node> {
        self.index.nodes.get(path)
    }

    pub fn exists(&self, path: &str) -> bool {
        path.is_empty() || self.index.nodes.contains_key(path)
    }

    pub fn is_dir(&self, path: &str) -> bool {
        path.is_empty() || self.index.nodes.get(path).is_some_and(|n| n.dir)
    }

    /// The direct children of a folder.
    pub fn list(&self, dir: &str) -> Result<Vec<(String, Node)>> {
        if !self.is_dir(dir) {
            return Err(format!("{dir}: not a folder"));
        }
        Ok(self.index.nodes.iter().filter(|(p, _)| under(p, dir) && parent(p) == dir).map(|(p, n)| (p.clone(), n.clone())).collect())
    }

    /// Everything, in path order.
    pub fn all(&self) -> impl Iterator<Item = (&String, &Node)> {
        self.index.nodes.iter()
    }

    pub fn read(&self, path: &str) -> Result<Zeroizing<Vec<u8>>> {
        let n = self.index.nodes.get(path).ok_or_else(|| format!("{path}: No such file or directory"))?;
        let id = n.id.as_deref().ok_or_else(|| format!("{path}: is a folder"))?;
        let data = fs::read(self.blob_path(id)).map_err(|e| format!("{path}: {e}"))?;
        let plain = crypto::open(&self.key, &data, &blob_ad(id)).map_err(|e| format!("{path}: {e}"))?;
        let (_, content) = unframe(&plain).map_err(|e| format!("{path}: {e}"))?;
        Ok(Zeroizing::new(content.to_vec()))
    }

    pub fn write(&mut self, path: &str, data: &[u8]) -> Result<()> {
        self.write_at(path, data, now_ms())
    }

    fn write_at(&mut self, path: &str, data: &[u8], modified: u64) -> Result<()> {
        if path.is_empty() || self.is_dir(path) {
            return Err(format!("{path}: is a folder"));
        }
        if data.len() as u64 > MAX_FILE {
            return Err(format!("{path}: larger than {} MB", MAX_FILE >> 20));
        }
        let id = new_id()?;
        let sealed = crypto::seal(&self.key, &frame(&BlobMeta { path: path.to_string(), modified }, data), &blob_ad(&id)).map_err(err)?;
        let bp = self.blob_path(&id);
        fs::create_dir_all(bp.parent().unwrap()).map_err(err)?;
        crypto::write_atomic(&bp, &sealed).map_err(err)?;
        let size = data.len() as u64;
        let r = self.commit(|s| {
            s.ensure_dirs(parent(path))?;
            Ok(s.index.nodes.insert(path.to_string(), Node { dir: false, id: Some(id.clone()), size, modified }))
        });
        match r {
            Ok(old) => {
                if let Some(old_id) = old.and_then(|o| o.id) {
                    // if this fails the old blob comes back in .trash at the next unlock: nothing lost
                    let _ = fs::remove_file(self.blob_path(&old_id));
                }
                Ok(())
            }
            Err(e) => {
                let _ = fs::remove_file(&bp);
                Err(e)
            }
        }
    }

    pub fn mkdir(&mut self, path: &str) -> Result<()> {
        self.commit(|s| s.ensure_dirs(path))
    }

    /// Move a file or a folder (and everything in it). Only the index changes.
    pub fn rename(&mut self, from: &str, to: &str) -> Result<()> {
        if from.is_empty() || to.is_empty() {
            return Err("refusing to move the vault itself".into());
        }
        if !self.index.nodes.contains_key(from) {
            return Err(format!("{from}: No such file or directory"));
        }
        if self.index.nodes.contains_key(to) {
            return Err(format!("{to}: already exists"));
        }
        if under(to, from) {
            return Err(format!("{from}: can't move a folder into itself"));
        }
        self.commit(|s| {
            s.ensure_dirs(parent(to))?;
            let moved: Vec<String> = s.index.nodes.keys().filter(|p| *p == from || under(p, from)).cloned().collect();
            for p in moved {
                let n = s.index.nodes.remove(&p).unwrap();
                s.index.nodes.insert(format!("{to}{}", &p[from.len()..]), n);
            }
            Ok(())
        })
    }

    /// Gone for good: something in `.trash` (the TRASH page's "delete permanently",
    /// `trash purge`). Nothing outside `.trash` can be purged. Its blobs are removed too
    /// (one that can't be comes back in .trash at the next unlock: nothing half-gone).
    pub fn purge(&mut self, path: &str) -> Result<()> {
        if !under(path, ".trash") {
            return Err(format!("{path}: only what's in the trash can be deleted for good"));
        }
        if !self.index.nodes.contains_key(path) {
            return Err(format!("{path}: No such file or directory"));
        }
        let gone: Vec<String> = self.index.nodes.keys().filter(|p| *p == path || under(p, path)).cloned().collect();
        let ids = self.commit(|s| Ok(gone.iter().filter_map(|p| s.index.nodes.remove(p)).filter_map(|n| n.id.clone()).collect::<Vec<_>>()))?;
        for id in ids {
            let _ = fs::remove_file(self.blob_path(&id));
        }
        Ok(())
    }

    /// Into `.trash/<seconds>-<name>`, like the plain vault. Returns the new path.
    pub fn trash(&mut self, path: &str) -> Result<String> {
        if path.is_empty() {
            return Err("refusing to trash the vault root".into());
        }
        let stamp = now_ms() / 1000;
        let dest = self.free_name(&format!(".trash/{stamp}-{}", name(path)));
        self.rename(path, &dest)?;
        Ok(dest)
    }
}

// ── plain files on disk ────────────────────────────────────────────────────

/// A plain vault's files and folders (vault paths), the store left out.
struct PlainTree {
    files: Vec<(String, u64)>,
    dirs: Vec<String>,
    junk: Vec<String>,
}

fn rel_of(root: &Path, p: &Path) -> String {
    p.strip_prefix(root).unwrap_or(p).components().map(|c| c.as_os_str().to_string_lossy().into_owned()).collect::<Vec<_>>().join("/")
}

/// Everything a plain vault holds. Refuses what encryption can't keep safe:
/// a git history (your notes in plain, in .git), links, files too big, odd names.
fn scan_plain(root: &Path) -> Result<PlainTree> {
    let mut t = PlainTree { files: vec![], dirs: vec![], junk: vec![] };
    let mut problems = Vec::new();
    let mut stack = vec![root.to_path_buf()];
    while let Some(dir) = stack.pop() {
        for e in fs::read_dir(&dir).map_err(|e| format!("{}: {e}", dir.display()))? {
            let e = e.map_err(err)?;
            let p = e.path();
            let Some(fname) = e.file_name().to_str().map(str::to_string) else {
                problems.push(format!("{}: a name that isn't valid text", p.display()));
                continue;
            };
            let rel = rel_of(root, &p);
            if dir == root && (fname == STORE_DIR || fname == PARTIAL_DIR || fname == OLD_DIR) {
                continue;
            }
            let ft = fs::symlink_metadata(&p).map_err(err)?;
            if ft.file_type().is_symlink() {
                problems.push(format!("{rel}: a link (move or remove it first)"));
            } else if ft.is_dir() {
                if fname == ".git" {
                    problems.push(format!("{rel}: a git history holds your notes in plain (move it out of the vault first)"));
                    continue;
                }
                t.dirs.push(rel);
                stack.push(p);
            } else if JUNK.contains(&fname.as_str()) {
                t.junk.push(rel);
            } else if ft.len() > MAX_FILE {
                problems.push(format!("{rel}: larger than {} MB", MAX_FILE >> 20));
            } else {
                t.files.push((rel, ft.len()));
            }
        }
    }
    // two names that are one once written the same way on every system (é as one
    // character or as e + accent): one would hide the other
    let mut seen: BTreeMap<String, String> = BTreeMap::new();
    for rel in t.files.iter().map(|f| &f.0).chain(t.dirs.iter()) {
        match norm(rel) {
            Ok(n) => {
                if let Some(other) = seen.insert(n, rel.clone()) {
                    problems.push(format!("{rel} and {other}: the same name written two ways (rename one)"));
                }
            }
            Err(e) => problems.push(e),
        }
    }
    if !problems.is_empty() {
        problems.sort();
        return Err(format!("nothing was changed:\n  {}", problems.join("\n  ")));
    }
    t.files.sort();
    t.dirs.sort();
    Ok(t)
}

fn modified_ms(p: &Path) -> u64 {
    fs::metadata(p).and_then(|m| m.modified()).ok().and_then(|t| t.duration_since(UNIX_EPOCH).ok()).map(|d| d.as_millis() as u64).unwrap_or_else(now_ms)
}

// ── the backup ─────────────────────────────────────────────────────────────

/// A plain zip of every file, then each one read back from the zip and compared.
fn backup_zip(root: &Path, tree: &PlainTree, zip_path: &Path) -> Result<()> {
    if zip_path.exists() {
        return Err(format!("{} already exists", zip_path.display()));
    }
    let tmp = zip_path.with_extension("zip.partial");
    let made = (|| -> Result<()> {
        // your notes in plain: readable by your user only, from the first byte
        let mut o = fs::OpenOptions::new();
        o.write(true).create_new(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            o.mode(0o600);
        }
        let _ = fs::remove_file(&tmp);
        let f = o.open(&tmp).map_err(|e| format!("backup {}: {e}", tmp.display()))?;
        let mut z = zip::ZipWriter::new(f);
        let opts = zip::write::SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated).large_file(true);
        for d in &tree.dirs {
            z.add_directory(format!("{d}/"), opts).map_err(err)?;
        }
        for (rel, _) in &tree.files {
            z.start_file(rel.as_str(), opts).map_err(err)?;
            let mut src = fs::File::open(root.join(rel)).map_err(|e| format!("{rel}: {e}"))?;
            std::io::copy(&mut src, &mut z).map_err(|e| format!("{rel}: {e}"))?;
        }
        z.finish().map_err(err)?.sync_all().map_err(err)?;
        // read back: every file, byte for byte (the zip checks its CRC too)
        let mut a = zip::ZipArchive::new(fs::File::open(&tmp).map_err(err)?).map_err(err)?;
        for (rel, _) in &tree.files {
            let mut got = Vec::new();
            a.by_name(rel).map_err(|e| format!("backup check, {rel}: {e}"))?.read_to_end(&mut got).map_err(|e| format!("backup check, {rel}: {e}"))?;
            if got != fs::read(root.join(rel)).map_err(err)? {
                return Err(format!("backup check: {rel} differs in the zip"));
            }
        }
        Ok(())
    })();
    if let Err(e) = made {
        let _ = fs::remove_file(&tmp);
        return Err(e);
    }
    fs::rename(&tmp, zip_path).map_err(err)
}

// ── encrypt / decrypt / export ─────────────────────────────────────────────

#[derive(Serialize, Debug, Default)]
pub struct Report {
    pub files: usize,
    pub folders: usize,
    pub bytes: u64,
    /// the plain backup made first (encrypt)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub backup: Option<String>,
    /// plain files that couldn't be removed afterwards (encrypt)
    pub left: Vec<String>,
    /// the recovery key's 24 words (encrypt): shown once, kept nowhere
    #[serde(skip_serializing_if = "Option::is_none")]
    pub recovery: Option<String>,
}

/// Is there a recovery key for the vault at `root`?
pub fn has_recovery(root: &Path) -> bool {
    load_key_file(root).map(|k| k.has_recovery()).unwrap_or(false)
}

/// A new recovery key (the old one stops working). The password must open the vault.
/// Returns its 24 words, to show once.
pub fn new_recovery(root: &Path, password: &str) -> Result<Zeroizing<String>> {
    let mut kf = load_key_file(root).map_err(err)?;
    let key = kf.unlock(password).map_err(err)?;
    let (secret, words) = recovery::generate()?;
    kf.set_recovery(&key, &secret[..]).map_err(err)?;
    save_key_file(root, &kf)?;
    Ok(words)
}

/// Password forgotten: the recovery key opens the vault, and `new_password` becomes
/// the one that opens it from now on (the recovery key keeps working too).
pub fn recover(root: &Path, words: &str, new_password: &str) -> Result<Store> {
    let secret = recovery::parse(words)?;
    let mut kf = load_key_file(root).map_err(err)?;
    if !kf.has_recovery() {
        return Err("this vault has no recovery key".into());
    }
    let key = kf.unlock_with_recovery(&secret[..]).map_err(|_| "this recovery key doesn't open this vault".to_string())?;
    kf.change_password(&key, new_password).map_err(err)?;
    save_key_file(root, &kf)?;
    Store::open_dir(root.join(STORE_DIR), key)
}

/// The moments the tests can make fail on purpose.
#[derive(Debug, PartialEq, Clone, Copy)]
enum Stage {
    Blob(usize),
    BeforeVerify,
}

/// Plain vault → encrypted vault. In this order, stopping at the first problem:
/// 1. check it can be done (no .git, no links, sizes);
/// 2. a plain backup zip in `backup_dir`, read back and compared;
/// 3. every file encrypted into `.icebreaker-vault.partial/`, which becomes
///    `.icebreaker-vault/` only once complete (with the key file);
/// 4. the store opened again from the disk **with the password** and every file
///    compared with the plain one — any difference: the store is removed, the
///    vault is as it was;
/// 5. only then are the plain files removed.
pub fn encrypt_vault(root: &Path, password: &str, backup_zip_path: &Path) -> Result<(Report, Store)> {
    encrypt_vault_with(root, password, backup_zip_path, crypto::DEFAULT_KDF, &|_| Ok(()))
}

fn encrypt_vault_with(root: &Path, password: &str, zip_path: &Path, kdf: KdfParams, fail: &dyn Fn(Stage) -> Result<()>) -> Result<(Report, Store)> {
    if is_encrypted(root) {
        return Err("this vault is already encrypted".into());
    }
    if zip_path.starts_with(root) {
        return Err("the backup must go outside the vault".into());
    }
    let partial = root.join(PARTIAL_DIR);
    if partial.exists() {
        // what an interrupted `vault encrypt` left: the plain files were never touched
        fs::remove_dir_all(&partial).map_err(err)?;
    }
    let tree = scan_plain(root)?;
    let mut report = Report { files: tree.files.len(), folders: tree.dirs.len(), bytes: tree.files.iter().map(|f| f.1).sum(), ..Default::default() };

    // 2. the backup
    backup_zip(root, &tree, zip_path)?;
    report.backup = Some(zip_path.to_string_lossy().into_owned());

    // 3. the encrypted copy
    let built = (|| -> Result<()> {
        let report = &mut report;
        let (mut kf, key) = KeyFile::create_with(password, kdf).map_err(err)?;
        // the recovery key exists from the start: no encrypted vault without a way back
        let (secret, words) = recovery::generate()?;
        kf.set_recovery(&key, &secret[..]).map_err(err)?;
        report.recovery = Some(words.to_string());
        let mut s = Store::create(partial.clone(), key)?;
        s.bulk = true;
        // inside, every name in one Unicode form (NFC): the same on every system
        for d in &tree.dirs {
            s.ensure_dirs(&norm(d)?)?;
        }
        for (i, (rel, _)) in tree.files.iter().enumerate() {
            fail(Stage::Blob(i))?;
            let p = root.join(rel);
            let data = Zeroizing::new(fs::read(&p).map_err(|e| format!("{rel}: {e}"))?);
            s.write_at(&norm(rel)?, &data, modified_ms(&p))?;
        }
        s.save_index()?;
        save_key_file_in(&partial, &kf)?;
        Ok(())
    })();
    if let Err(e) = built {
        let _ = fs::remove_dir_all(&partial);
        return Err(format!("{e} — nothing was changed (the backup stays: {})", zip_path.display()));
    }
    fs::rename(&partial, root.join(STORE_DIR)).map_err(err)?;

    // 4. read everything back, through the password, and compare
    let checked = (|| -> Result<Store> {
        fail(Stage::BeforeVerify)?;
        let s = Store::unlock(root, password)?;
        let files = s.all().filter(|(_, n)| !n.dir).count();
        if files != tree.files.len() {
            return Err(format!("check: {files} files encrypted, {} expected", tree.files.len()));
        }
        for (rel, _) in &tree.files {
            let plain = Zeroizing::new(fs::read(root.join(rel)).map_err(|e| format!("check, {rel}: {e}"))?);
            if *s.read(&norm(rel)?)? != *plain {
                return Err(format!("check: {rel} differs once encrypted"));
            }
        }
        for d in &tree.dirs {
            if !s.is_dir(&norm(d)?) {
                return Err(format!("check: folder {d} is missing"));
            }
        }
        Ok(s)
    })();
    let store = match checked {
        Ok(s) => s,
        Err(e) => {
            let _ = fs::remove_dir_all(root.join(STORE_DIR));
            return Err(format!("{e} — stopped, nothing was deleted, the vault is still plain (backup: {})", zip_path.display()));
        }
    };

    // 5. remove the plain files, then the empty folders (deepest first)
    for (rel, _) in &tree.files {
        if fs::remove_file(root.join(rel)).is_err() {
            report.left.push(rel.clone());
        }
    }
    for rel in &tree.junk {
        let _ = fs::remove_file(root.join(rel));
    }
    let mut dirs = tree.dirs.clone();
    dirs.sort_by_key(|d| std::cmp::Reverse(d.matches('/').count()));
    for d in &dirs {
        if fs::remove_dir(root.join(d)).is_err() && !report.left.iter().any(|l| under(l, d)) {
            report.left.push(format!("{d}/"));
        }
    }
    Ok((report, store))
}

/// Write every file of `store` as plain files under `dest`, each read back and
/// compared. Refuses to overwrite anything; on any problem, what it wrote is removed.
fn write_plain(store: &Store, dest: &Path) -> Result<Report> {
    let mut made_files: Vec<PathBuf> = Vec::new();
    let mut made_dirs: Vec<PathBuf> = Vec::new();
    let mut report = Report::default();
    // names this computer can't hold (Windows: ":", "?", "CON"…): said before anything is written
    let bad: Vec<String> = store.all().filter_map(|(rel, _)| name_problem(rel).map(|why| format!("{rel}: {why}"))).collect();
    if !bad.is_empty() {
        return Err(format!("nothing was written — names this computer can't hold (rename them in ICEBREAKER first):\n  {}", bad.join("\n  ")));
    }
    let r = (|| -> Result<()> {
        for (rel, n) in store.all() {
            let p = dest.join(rel);
            if n.dir {
                if !p.exists() {
                    fs::create_dir_all(&p).map_err(|e| format!("{rel}: {e}"))?;
                    made_dirs.push(p);
                }
                report.folders += 1;
                continue;
            }
            if p.exists() {
                return Err(format!("{rel}: a file is already there (two names that only differ by capitals?)"));
            }
            if let Some(par) = p.parent() {
                if !par.exists() {
                    fs::create_dir_all(par).map_err(err)?;
                    made_dirs.push(par.to_path_buf());
                }
            }
            let data = store.read(rel)?;
            crypto::write_atomic(&p, &data).map_err(|e| format!("{rel}: {e}"))?;
            made_files.push(p.clone());
            if *Zeroizing::new(fs::read(&p).map_err(err)?) != *data {
                return Err(format!("{rel}: differs once written"));
            }
            report.files += 1;
            report.bytes += data.len() as u64;
        }
        Ok(())
    })();
    if let Err(e) = r {
        for f in made_files {
            let _ = fs::remove_file(f);
        }
        made_dirs.sort_by_key(|d| std::cmp::Reverse(d.components().count()));
        for d in made_dirs {
            let _ = fs::remove_dir(d);
        }
        return Err(e);
    }
    Ok(report)
}

/// Why this computer can't hold a file of this name (None: it can). Windows refuses
/// some characters, some names and a trailing dot or space; every system refuses
/// names longer than 255 bytes.
pub fn name_problem(rel: &str) -> Option<String> {
    for part in rel.split('/') {
        if part.len() > 255 {
            return Some("a name longer than 255 bytes".into());
        }
        if cfg!(windows) || cfg!(test) {
            if let Some(c) = part.chars().find(|c| matches!(c, '<' | '>' | ':' | '"' | '\\' | '|' | '?' | '*') || (*c as u32) < 32) {
                return Some(format!("Windows can't hold \"{c}\" in a name"));
            }
            let stem = part.split('.').next().unwrap_or("").to_ascii_uppercase();
            if ["CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8", "COM9", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9"].contains(&stem.as_str()) {
                return Some(format!("Windows reserves the name {stem}"));
            }
            if part.ends_with('.') || part.ends_with(' ') {
                return Some("Windows can't hold a name ending with a dot or a space".into());
            }
        }
    }
    None
}

/// Plain files next to an encrypted vault (an older ICEBREAKER, another app, a sync
/// wrote them): their vault paths. They're invisible in the deck until `vault adopt`.
pub fn plain_leftovers(root: &Path) -> Vec<String> {
    let mut out = Vec::new();
    let mut stack = vec![root.to_path_buf()];
    while let Some(d) = stack.pop() {
        let Ok(rd) = fs::read_dir(&d) else { continue };
        for e in rd.flatten() {
            let n = e.file_name().to_string_lossy().to_string();
            if (d == root && (n == STORE_DIR || n == PARTIAL_DIR || n == OLD_DIR)) || JUNK.contains(&n.as_str()) {
                continue;
            }
            match e.file_type() {
                Ok(t) if t.is_dir() => stack.push(e.path()),
                Ok(t) if t.is_file() => out.push(rel_of(root, &e.path())),
                _ => {}
            }
        }
    }
    out.sort();
    out
}

/// `vault adopt`: the plain files next to the encrypted vault go inside it (each
/// read back and compared before the plain one is removed). A name already taken
/// keeps the encrypted note; the plain one goes to `.trash/from-plain-<time>/`.
pub fn adopt_plain(root: &Path, s: &mut Store) -> Result<Report> {
    let tree = scan_plain(root)?;
    let stamp = now_ms();
    let mut report = Report::default();
    let mut placed: Vec<(String, String)> = Vec::new();
    for (rel, _) in &tree.files {
        let p = root.join(rel);
        let data = Zeroizing::new(fs::read(&p).map_err(|e| format!("{rel}: {e}"))?);
        let at = match norm(rel) {
            Ok(n) if !s.exists(&n) => n,
            Ok(n) if s.read(&n).map(|d| *d == *data).unwrap_or(false) => {
                // the same content is already inside: nothing to write
                placed.push((rel.clone(), n));
                continue;
            }
            _ => s.free_name(&format!(".trash/from-plain-{stamp}/{rel}")),
        };
        s.write_at(&at, &data, modified_ms(&p))?;
        placed.push((rel.clone(), at));
        report.files += 1;
        report.bytes += data.len() as u64;
    }
    for d in &tree.dirs {
        if let Ok(n) = norm(d) {
            if !s.exists(&n) {
                s.mkdir(&n)?;
            }
        }
    }
    // read back, compare, then remove the plain copy
    for (rel, at) in &placed {
        let plain = Zeroizing::new(fs::read(root.join(rel)).map_err(err)?);
        if *s.read(at)? != *plain {
            return Err(format!("{rel}: differs once encrypted — stopped, no plain file removed"));
        }
    }
    for (rel, _) in &placed {
        if fs::remove_file(root.join(rel)).is_err() {
            report.left.push(rel.clone());
        }
    }
    for j in &tree.junk {
        let _ = fs::remove_file(root.join(j));
    }
    let mut dirs = tree.dirs.clone();
    dirs.sort_by_key(|d| std::cmp::Reverse(d.matches('/').count()));
    for d in &dirs {
        let _ = fs::remove_dir(root.join(d));
    }
    Ok(report)
}

/// `vault move`: every file of the vault folder (plain or encrypted, dot-files
/// included) copied into `to` (new or empty, outside the vault), each one read
/// back and compared. Nothing is removed here: the old folder stays until the
/// deck has switched to the new one and you say it can go. A failure removes what
/// was copied.
pub fn copy_vault(from: &Path, to: &Path) -> Result<Report> {
    let real_from = from.canonicalize().map_err(err)?;
    if to.exists() {
        if fs::read_dir(to).map_err(err)?.next().is_some() {
            return Err(format!("{}: the folder isn't empty", to.display()));
        }
    }
    fs::create_dir_all(to).map_err(|e| format!("{}: {e}", to.display()))?;
    let real_to = to.canonicalize().map_err(err)?;
    if real_to.starts_with(&real_from) || real_from.starts_with(&real_to) {
        let _ = fs::remove_dir(&real_to);
        return Err("the new place must be outside the vault (and not hold it)".into());
    }
    let mut report = Report::default();
    let mut files: Vec<PathBuf> = Vec::new();
    let mut dirs: Vec<PathBuf> = Vec::new();
    let mut problems = Vec::new();
    let mut stack = vec![real_from.clone()];
    while let Some(d) = stack.pop() {
        for e in fs::read_dir(&d).map_err(|e| format!("{}: {e}", d.display()))? {
            let p = e.map_err(err)?.path();
            let rel = p.strip_prefix(&real_from).unwrap().to_path_buf();
            let m = fs::symlink_metadata(&p).map_err(err)?;
            if m.file_type().is_symlink() {
                problems.push(format!("{}: a link (move or remove it first)", rel.display()));
            } else if m.is_dir() {
                dirs.push(rel);
                stack.push(p);
            } else {
                files.push(rel);
            }
        }
    }
    if !problems.is_empty() {
        let _ = fs::remove_dir(&real_to);
        return Err(format!("nothing was moved:\n  {}", problems.join("\n  ")));
    }
    dirs.sort();
    let done = (|| -> Result<()> {
        for d in &dirs {
            fs::create_dir_all(real_to.join(d)).map_err(|e| format!("{}: {e}", d.display()))?;
            report.folders += 1;
        }
        for f in &files {
            let (a, b) = (real_from.join(f), real_to.join(f));
            fs::copy(&a, &b).map_err(|e| format!("{}: {e}", f.display()))?;
            let (x, y) = (Zeroizing::new(fs::read(&a).map_err(err)?), Zeroizing::new(fs::read(&b).map_err(err)?));
            if *x != *y {
                return Err(format!("{}: differs once copied", f.display()));
            }
            if let Ok(t) = fs::metadata(&a).and_then(|m| m.modified()) {
                let _ = fs::File::options().write(true).open(&b).and_then(|h| h.set_modified(t));
            }
            report.files += 1;
            report.bytes += x.len() as u64;
        }
        Ok(())
    })();
    if let Err(e) = done {
        let _ = fs::remove_dir_all(&real_to);
        let _ = fs::create_dir_all(&real_to);
        return Err(format!("{e} — stopped: the vault stays where it was, the copy was removed"));
    }
    Ok(report)
}

impl Store {
    /// The vault was moved (`vault move`): the same unlocked store, read from its new folder.
    pub fn moved_to(&mut self, root: &Path) {
        self.dir = root.join(STORE_DIR);
    }
}

/// Encrypted vault → plain files again. The password must open it; every file is
/// written, read back and compared before the encrypted store is removed.
pub fn decrypt_vault(root: &Path, password: &str) -> Result<Report> {
    let store = Store::unlock(root, password)?;
    let clash: Vec<String> = store.all().filter(|(p, n)| !n.dir && root.join(p).exists()).map(|(p, _)| p.clone()).collect();
    if !clash.is_empty() {
        return Err(format!("nothing was changed — plain files are already there:\n  {}", clash.join("\n  ")));
    }
    let report = write_plain(&store, root).map_err(|e| format!("{e} — stopped: the vault is still encrypted, the plain files written were removed"))?;
    drop(store);
    fs::remove_dir_all(root.join(STORE_DIR)).map_err(|e| format!("every file is plain again, but the encrypted folder couldn't be removed: {e}"))?;
    Ok(report)
}

/// A plain copy of the vault in `dest` (a new or empty folder outside the vault).
pub fn export(store: &Store, root: &Path, dest: &Path) -> Result<Report> {
    let real_root = root.canonicalize().map_err(err)?;
    fs::create_dir_all(dest).map_err(|e| format!("{}: {e}", dest.display()))?;
    let real_dest = dest.canonicalize().map_err(err)?;
    if real_dest.starts_with(&real_root) || real_root.starts_with(&real_dest) {
        return Err("the copy must go outside the vault".into());
    }
    if fs::read_dir(&real_dest).map_err(err)?.next().is_some() {
        return Err(format!("{}: the folder isn't empty", dest.display()));
    }
    write_plain(store, &real_dest)
}

#[cfg(test)]
mod tests {
    use super::*;

    const FAST: KdfParams = KdfParams { m_kib: 8, t: 1, p: 1 };

    fn scratch(name: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("ib-store-{name}-{}", new_id().unwrap()));
        fs::create_dir_all(&d).unwrap();
        d
    }

    /// A small vault that looks like a real one.
    fn sample(root: &Path) -> BTreeMap<String, Vec<u8>> {
        let mut files = BTreeMap::new();
        let mut put = |rel: &str, data: &[u8]| {
            let p = root.join(rel);
            fs::create_dir_all(p.parent().unwrap()).unwrap();
            fs::write(&p, data).unwrap();
            files.insert(rel.to_string(), data.to_vec());
        };
        put("Welcome.md", b"# Welcome\nsecret-marker-alpha\n");
        put("journal/2026-11-20.md", "Journée : très bien, \u{65e5}\u{672c}\n".as_bytes());
        put("projets/ICEBREAKER/notes-kiddko.md", b"secret-marker-beta");
        put("images/pixel.png", &[0x89, b'P', b'N', b'G', 0, 1, 2, 255]);
        put(".icebreaker/stats.json", b"{\"notes\":3}");
        put(".icebreaker/plugins/demo/main.js", b"export default {}");
        put(".trash/1700000000-old.md", b"old secret-marker-gamma");
        put("empty.md", b"");
        fs::create_dir_all(root.join("dossier vide")).unwrap();
        fs::write(root.join(".DS_Store"), b"finder").unwrap();
        files
    }

    fn physical_files(root: &Path) -> Vec<PathBuf> {
        let mut out = vec![];
        let mut st = vec![root.to_path_buf()];
        while let Some(d) = st.pop() {
            for e in fs::read_dir(d).unwrap().flatten() {
                if e.file_type().unwrap().is_dir() {
                    st.push(e.path());
                } else {
                    out.push(e.path());
                }
            }
        }
        out
    }

    fn plain_files(root: &Path) -> BTreeMap<String, Vec<u8>> {
        physical_files(root).into_iter().filter(|p| !p.ends_with(".DS_Store")).map(|p| (rel_of(root, &p), fs::read(&p).unwrap())).collect()
    }

    fn zip_for(base: &Path) -> PathBuf {
        base.join("backup.zip")
    }

    #[test]
    fn paths_are_normalised_and_guarded() {
        assert_eq!(norm("/notes//./a.md").unwrap(), "notes/a.md");
        assert_eq!(norm("notes\\a.md").unwrap(), "notes/a.md");
        assert_eq!(norm("").unwrap(), "");
        assert!(norm("../x").is_err());
        assert!(norm("a/../../x").is_err());
        assert!(norm(".icebreaker-vault/vault.key").is_err());
        assert!(norm("notes/.icebreaker-vault").is_ok());
        assert_eq!(parent("a/b/c.md"), "a/b");
        assert_eq!(name("a/b/c.md"), "c.md");
        assert!(under("a/b", "a") && !under("ab", "a") && !under("a", "a") && under("x", ""));
    }

    #[test]
    fn names_are_compared_the_way_disks_read_them() {
        for n in [".ICEBREAKER", ".Icebreaker", ".icebreaker.", ".icebreaker ", ".icebreaker::$DATA", ".ice\u{200c}breaker"] {
            assert_eq!(fold(n), ".icebreaker", "{n}");
        }
        assert!(short_alias("accoun~1.jso") && short_alias("icebre~12") && !short_alias("notes~") && !short_alias("a~b.md") && !short_alias("~1"));
        // the encrypted vault's own folder, under any spelling, is never a note's path
        for p in [".ICEBREAKER-VAULT/x", ".Icebreaker-Vault.partial/x", ".icebreaker-vault./x", ".icebreaker-vault.OLD", "ICEBRE~1/x"] {
            assert!(norm(p).is_err(), "{p}");
        }
        assert!(norm("notes/.icebreaker-vault/x").is_ok());
        // asking whether a vault is encrypted never tidies anything (a rekey may be running)
        let root = scratch("looks");
        fs::create_dir_all(root.join(STORE_DIR)).unwrap();
        fs::create_dir_all(root.join(PARTIAL_DIR)).unwrap();
        assert!(is_encrypted(&root));
        assert!(root.join(PARTIAL_DIR).is_dir(), "is_encrypted only looks");
        finish_interrupted(&root);
        assert!(!root.join(PARTIAL_DIR).exists());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn store_round_trips_and_shows_nothing_on_disk() {
        let d = scratch("roundtrip");
        let key = VaultKey::generate().unwrap();
        let mut s = Store::create(d.join(STORE_DIR), key).unwrap();
        s.write("journal/secret-name-zeta.md", b"secret-marker-delta").unwrap();
        s.write("journal/secret-name-zeta.md", b"secret-marker-delta, edited").unwrap();
        s.mkdir("an empty folder").unwrap();
        assert_eq!(&s.read("journal/secret-name-zeta.md").unwrap()[..], b"secret-marker-delta, edited");
        assert!(s.is_dir("journal") && s.is_dir("an empty folder"));
        assert_eq!(s.list("journal").unwrap().len(), 1);
        assert_eq!(s.list("").unwrap().len(), 2);
        // one blob only: the old one went
        assert_eq!(s.all_blob_ids().len(), 1);
        for p in physical_files(&d) {
            let b = fs::read(&p).unwrap();
            let name = p.to_string_lossy();
            assert!(!name.contains("secret") && !name.contains("journal"), "{name}");
            assert!(!b.windows(6).any(|w| w == b"secret" || w == b"journa"), "{name}");
        }
        fs::remove_dir_all(d).unwrap();
    }

    #[test]
    fn folders_files_and_moves() {
        let d = scratch("moves");
        let mut s = Store::create(d.join(STORE_DIR), VaultKey::generate().unwrap()).unwrap();
        s.write("a/b/c.md", b"c").unwrap();
        s.write("a/d.md", b"d").unwrap();
        assert!(s.write("a/b", b"x").is_err(), "a folder isn't a file");
        assert!(s.write("a/d.md/e.md", b"x").is_err(), "a file isn't a folder");
        assert!(s.rename("a", "a/inside").is_err());
        assert!(s.rename("a/d.md", "a/b/c.md").is_err(), "never over another file");
        s.rename("a", "z/y").unwrap();
        assert_eq!(&s.read("z/y/b/c.md").unwrap()[..], b"c");
        assert!(!s.exists("a") && !s.exists("a/b/c.md"));
        let t = s.trash("z/y/d.md").unwrap();
        assert!(t.starts_with(".trash/") && t.ends_with("-d.md"));
        assert_eq!(&s.read(&t).unwrap()[..], b"d");
        let t2 = {
            s.write("z/y/d.md", b"d2").unwrap();
            s.trash("z/y/d.md").unwrap()
        };
        assert_ne!(t, t2, "two things trashed in the same second both stay");
        // reopened from disk: the same
        let s = s.reopen().unwrap();
        assert!(s.notes.is_empty(), "{:?}", s.notes);
        assert_eq!(&s.read("z/y/b/c.md").unwrap()[..], b"c");
        fs::remove_dir_all(d).unwrap();
    }

    #[test]
    fn purge_deletes_for_good_only_in_the_trash() {
        let d = scratch("purge");
        let mut s = Store::create(d.join(STORE_DIR), VaultKey::generate().unwrap()).unwrap();
        s.write("keep.md", b"keep").unwrap();
        s.write("f/a.md", b"a").unwrap();
        s.write("f/b.md", b"b").unwrap();
        assert!(s.purge("keep.md").is_err(), "outside the trash: never");
        let t = s.trash("f").unwrap();
        assert_eq!(s.all_blob_ids().len(), 3);
        s.purge(&t).unwrap();
        assert!(!s.exists(&t) && !s.exists(&format!("{t}/a.md")));
        assert_eq!(s.all_blob_ids().len(), 1, "the trashed blobs are gone from the disk");
        assert!(s.purge(&t).is_err(), "already gone");
        let s = s.reopen().unwrap();
        assert!(s.notes.is_empty(), "nothing comes back at the next unlock: {:?}", s.notes);
        assert_eq!(&s.read("keep.md").unwrap()[..], b"keep");
        fs::remove_dir_all(d).unwrap();
    }

    #[test]
    fn a_crash_between_blob_and_index_loses_nothing() {
        let d = scratch("crash");
        let mut s = Store::create(d.join(STORE_DIR), VaultKey::generate().unwrap()).unwrap();
        s.write("note.md", b"version 1").unwrap();
        // the new blob is on disk, the power goes before the index is written
        let id = new_id().unwrap();
        let sealed = crypto::seal(&s.key, &frame(&BlobMeta { path: "note.md".into(), modified: 1 }, b"version 2"), &blob_ad(&id)).unwrap();
        let bp = s.blob_path(&id);
        fs::create_dir_all(bp.parent().unwrap()).unwrap();
        fs::write(&bp, sealed).unwrap();
        // and a half-written temp file
        fs::write(d.join(STORE_DIR).join(format!(".index.ibx{}abc", crypto::TEMP_MARK)), b"IBX1 half").unwrap();
        let s = s.reopen().unwrap();
        assert_eq!(&s.read("note.md").unwrap()[..], b"version 1");
        let rec: Vec<_> = s.all().filter(|(p, _)| p.starts_with(".trash/recovered-") && p.ends_with("/note.md")).map(|(p, _)| p.clone()).collect();
        assert_eq!(rec.len(), 1, "{:?}", s.notes);
        assert_eq!(&s.read(&rec[0]).unwrap()[..], b"version 2");
        assert!(!d.join(STORE_DIR).join(format!(".index.ibx{}abc", crypto::TEMP_MARK)).exists());
        fs::remove_dir_all(d).unwrap();
    }

    #[test]
    fn a_damaged_index_is_kept_and_rebuilt_from_the_blobs() {
        let d = scratch("index");
        let mut s = Store::create(d.join(STORE_DIR), VaultKey::generate().unwrap()).unwrap();
        s.write("journal/a.md", b"a").unwrap();
        s.write("b.md", b"b").unwrap();
        let ip = d.join(STORE_DIR).join(INDEX_FILE);
        let mut data = fs::read(&ip).unwrap();
        let last = data.len() - 1;
        data[last] ^= 1;
        fs::write(&ip, data).unwrap();
        let s = s.reopen().unwrap();
        assert_eq!(&s.read("journal/a.md").unwrap()[..], b"a");
        assert_eq!(&s.read("b.md").unwrap()[..], b"b");
        assert!(s.notes.iter().any(|n| n.contains("damaged")));
        assert!(fs::read_dir(d.join(STORE_DIR)).unwrap().flatten().any(|e| e.file_name().to_string_lossy().starts_with("index.damaged-")));
        fs::remove_dir_all(d).unwrap();
    }

    #[test]
    fn a_damaged_blob_is_refused_and_another_key_opens_nothing() {
        let d = scratch("blob");
        let mut s = Store::create(d.join(STORE_DIR), VaultKey::generate().unwrap()).unwrap();
        s.write("a.md", b"a note").unwrap();
        let id = s.node("a.md").unwrap().id.clone().unwrap();
        let bp = s.blob_path(&id);
        let mut b = fs::read(&bp).unwrap();
        b[40] ^= 1;
        fs::write(&bp, b).unwrap();
        assert!(s.read("a.md").is_err());
        drop(s);
        // another key: refused, and the index is left as it is
        let ix = fs::read(d.join(STORE_DIR).join(INDEX_FILE)).unwrap();
        assert!(Store::open_dir(d.join(STORE_DIR), VaultKey::generate().unwrap()).is_err());
        assert_eq!(fs::read(d.join(STORE_DIR).join(INDEX_FILE)).unwrap(), ix);
        fs::remove_dir_all(d).unwrap();
    }

    #[test]
    fn encrypt_then_decrypt_gives_back_the_same_vault() {
        let base = scratch("migrate");
        let root = base.join("vault");
        let orig = sample(&root);
        let (rep, s) = encrypt_vault_with(&root, "password!", &zip_for(&base), FAST, &|_| Ok(())).unwrap();
        assert_eq!(rep.files, orig.len());
        assert!(rep.left.is_empty(), "{:?}", rep.left);
        assert_eq!(rep.recovery.as_deref().unwrap().split(' ').count(), 24);
        assert!(has_recovery(&root));
        assert!(s.is_dir("dossier vide"));
        drop(s);
        // only the store on disk, no name and no content in clear
        let top: Vec<_> = fs::read_dir(&root).unwrap().flatten().map(|e| e.file_name().to_string_lossy().to_string()).collect();
        assert_eq!(top, vec![STORE_DIR.to_string()]);
        for p in physical_files(&root) {
            let b = fs::read(&p).unwrap();
            assert!(!b.windows(13).any(|w| w == b"secret-marker"), "{}", p.display());
            assert!(!p.to_string_lossy().contains("journal") && !p.to_string_lossy().contains("kiddko"));
        }
        // the backup holds every file, in plain
        let mut a = zip::ZipArchive::new(fs::File::open(zip_for(&base)).unwrap()).unwrap();
        for (rel, data) in &orig {
            let mut got = vec![];
            a.by_name(rel).unwrap().read_to_end(&mut got).unwrap();
            assert_eq!(&got, data, "{rel}");
        }
        // through the password
        assert!(Store::unlock(&root, "wrong password").is_err());
        let s = Store::unlock(&root, "password!").unwrap();
        for (rel, data) in &orig {
            assert_eq!(&s.read(rel).unwrap()[..], &data[..], "{rel}");
        }
        drop(s);
        // a wrong password changes nothing
        assert!(decrypt_vault(&root, "wrong password").is_err());
        assert!(is_encrypted(&root));
        let rep = decrypt_vault(&root, "password!").unwrap();
        assert_eq!(rep.files, orig.len());
        assert!(!is_encrypted(&root));
        assert_eq!(plain_files(&root), orig);
        assert!(root.join("dossier vide").is_dir());
        fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn a_failure_while_encrypting_changes_nothing() {
        for stage in [Stage::Blob(0), Stage::Blob(3), Stage::BeforeVerify] {
            let base = scratch("fail");
            let root = base.join("vault");
            let orig = sample(&root);
            let r = encrypt_vault_with(&root, "password!", &zip_for(&base), FAST, &|s| if s == stage { Err("power cut".into()) } else { Ok(()) });
            let e = r.err().unwrap();
            assert!(e.contains("nothing was"), "{e}");
            assert!(!is_encrypted(&root), "{stage:?}");
            assert!(!root.join(PARTIAL_DIR).exists());
            assert_eq!(plain_files(&root), orig, "{stage:?}");
            assert!(zip_for(&base).exists(), "the backup stays");
            fs::remove_dir_all(base).unwrap();
        }
    }

    #[test]
    fn a_note_changed_during_encryption_stops_it() {
        let base = scratch("changed");
        let root = base.join("vault");
        sample(&root);
        let r = encrypt_vault_with(&root, "password!", &zip_for(&base), FAST, &|s| {
            if s == Stage::BeforeVerify {
                fs::write(root.join("Welcome.md"), b"typed while it ran").unwrap();
            }
            Ok(())
        });
        assert!(r.err().unwrap().contains("differs"));
        assert!(!is_encrypted(&root));
        assert_eq!(fs::read(root.join("Welcome.md")).unwrap(), b"typed while it ran");
        fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn a_leftover_partial_store_is_cleared_and_the_vault_still_encrypts() {
        let base = scratch("partial");
        let root = base.join("vault");
        let orig = sample(&root);
        fs::create_dir_all(root.join(PARTIAL_DIR).join("blobs")).unwrap();
        let (_, s) = encrypt_vault_with(&root, "password!", &zip_for(&base), FAST, &|_| Ok(())).unwrap();
        assert_eq!(s.all().filter(|(_, n)| !n.dir).count(), orig.len());
        fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn what_cannot_be_kept_safe_is_refused_before_anything() {
        let base = scratch("refuse");
        let root = base.join("vault");
        let orig = sample(&root);
        fs::create_dir_all(root.join(".git")).unwrap();
        fs::write(root.join(".git/HEAD"), b"ref").unwrap();
        let e = encrypt_vault_with(&root, "password!", &zip_for(&base), FAST, &|_| Ok(())).err().unwrap();
        assert!(e.contains(".git") && e.contains("nothing was changed"), "{e}");
        assert!(!zip_for(&base).exists() && !is_encrypted(&root));
        fs::remove_dir_all(root.join(".git")).unwrap();
        #[cfg(unix)]
        {
            std::os::unix::fs::symlink(&base, root.join("link")).unwrap();
            let e = encrypt_vault_with(&root, "password!", &zip_for(&base), FAST, &|_| Ok(())).err().unwrap();
            assert!(e.contains("link"), "{e}");
            fs::remove_file(root.join("link")).unwrap();
        }
        // a backup already there is never overwritten
        fs::write(zip_for(&base), b"an older backup").unwrap();
        assert!(encrypt_vault_with(&root, "password!", &zip_for(&base), FAST, &|_| Ok(())).is_err());
        assert_eq!(fs::read(zip_for(&base)).unwrap(), b"an older backup");
        assert_eq!(plain_files(&root), orig);
        // and the backup can't go inside the vault
        assert!(encrypt_vault_with(&root, "password!", &root.join("b.zip"), FAST, &|_| Ok(())).is_err());
        fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn decrypt_never_overwrites_and_undoes_itself() {
        let base = scratch("clash");
        let root = base.join("vault");
        let orig = sample(&root);
        drop(encrypt_vault_with(&root, "password!", &zip_for(&base), FAST, &|_| Ok(())).unwrap());
        fs::write(root.join("Welcome.md"), b"a plain file put there since").unwrap();
        let e = decrypt_vault(&root, "password!").err().unwrap();
        assert!(e.contains("Welcome.md"), "{e}");
        assert!(is_encrypted(&root));
        assert_eq!(fs::read(root.join("Welcome.md")).unwrap(), b"a plain file put there since");
        fs::remove_file(root.join("Welcome.md")).unwrap();
        // two names that a Mac or Windows disk sees as one: undone, still encrypted
        {
            let mut s = Store::unlock(&root, "password!").unwrap();
            s.write("CASE.md", b"upper").unwrap();
            s.write("case.md", b"lower").unwrap();
        }
        let caseless = {
            fs::write(base.join("Probe"), b"").unwrap();
            let r = base.join("probe").exists();
            fs::remove_file(base.join("Probe")).unwrap();
            r
        };
        let r = decrypt_vault(&root, "password!");
        if caseless {
            assert!(r.is_err());
            assert!(is_encrypted(&root));
            let top: Vec<_> = fs::read_dir(&root).unwrap().flatten().map(|e| e.file_name().to_string_lossy().to_string()).collect();
            assert_eq!(top, vec![STORE_DIR.to_string()], "what it wrote was removed");
        } else {
            let mut want = orig.clone();
            want.insert("CASE.md".into(), b"upper".to_vec());
            want.insert("case.md".into(), b"lower".to_vec());
            assert_eq!(plain_files(&root), want);
        }
        fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn export_makes_a_plain_copy_outside_only() {
        let base = scratch("export");
        let root = base.join("vault");
        let orig = sample(&root);
        let (_, s) = encrypt_vault_with(&root, "password!", &zip_for(&base), FAST, &|_| Ok(())).unwrap();
        assert!(export(&s, &root, &root.join("inside")).is_err());
        fs::create_dir_all(base.join("full")).unwrap();
        fs::write(base.join("full/x"), b"x").unwrap();
        assert!(export(&s, &root, &base.join("full")).is_err());
        let rep = export(&s, &root, &base.join("copy")).unwrap();
        assert_eq!(rep.files, orig.len());
        assert_eq!(plain_files(&base.join("copy")), orig);
        assert!(is_encrypted(&root));
        fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn the_recovery_key_brings_a_forgotten_password_back() {
        let base = scratch("recovery");
        let root = base.join("vault");
        let orig = sample(&root);
        let (rep, s) = encrypt_vault_with(&root, "forgotten password", &zip_for(&base), FAST, &|_| Ok(())).unwrap();
        drop(s);
        let words = rep.recovery.unwrap();
        // wrong words, or another vault's: refused, nothing changed
        let (_, other) = recovery::generate().unwrap();
        let before = fs::read(root.join(STORE_DIR).join(KEY_FILE)).unwrap();
        assert!(recover(&root, &other, "new password").err().unwrap().contains("doesn't open"));
        assert!(recover(&root, "not twenty four words", "new password").is_err());
        assert_eq!(fs::read(root.join(STORE_DIR).join(KEY_FILE)).unwrap(), before);
        // the right words: a new password, the old one no longer works, the notes are all there
        let s = recover(&root, &words.to_uppercase(), "new password").unwrap();
        for (rel, data) in &orig {
            assert_eq!(&s.read(rel).unwrap()[..], &data[..], "{rel}");
        }
        drop(s);
        assert!(Store::unlock(&root, "forgotten password").is_err());
        assert!(Store::unlock(&root, "new password").is_ok());
        // a new recovery key: the old words stop working
        assert!(new_recovery(&root, "wrong password").is_err());
        let fresh = new_recovery(&root, "new password").unwrap();
        assert_ne!(*fresh, words);
        assert!(recover(&root, &words, "x password").is_err());
        assert!(recover(&root, &fresh, "newest password").is_ok());
        assert!(Store::unlock(&root, "newest password").is_ok());
        fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn encrypt_and_decrypt_again_and_again() {
        let base = scratch("cycles");
        let root = base.join("vault");
        let orig = sample(&root);
        for i in 0..3 {
            let zip = base.join(format!("backup-{i}.zip"));
            drop(encrypt_vault_with(&root, &format!("password {i}"), &zip, FAST, &|_| Ok(())).unwrap());
            assert!(is_encrypted(&root));
            decrypt_vault(&root, &format!("password {i}")).unwrap();
            assert!(!is_encrypted(&root));
            assert_eq!(plain_files(&root), orig, "cycle {i}");
        }
        fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn a_mac_name_written_with_separate_accents_encrypts_and_comes_back() {
        let base = scratch("nfdfile");
        let root = base.join("vault");
        let mut orig = sample(&root);
        // what macOS writes for a screen recording: "é" and "à" as letter + accent
        let nfd = "notes/Enregistrement de l\u{2019}e\u{301}cran a\u{300} 00.14.mov";
        fs::create_dir_all(root.join("notes")).unwrap();
        fs::write(root.join(nfd), b"movie").unwrap();
        let (_, s) = encrypt_vault_with(&root, "password!", &zip_for(&base), FAST, &|_| Ok(())).unwrap();
        let nfc = norm(nfd).unwrap();
        assert_eq!(&s.read(&nfc).unwrap()[..], b"movie");
        drop(s);
        decrypt_vault(&root, "password!").unwrap();
        // back on the disk under its one-character name (what Linux and Windows use)
        orig.insert(nfc.clone(), b"movie".to_vec());
        let back = plain_files(&root);
        assert_eq!(back.len(), orig.len());
        assert!(back.keys().any(|k| norm(k).unwrap() == nfc));
        fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn two_names_that_are_one_stop_it_before_anything() {
        let base = scratch("twonames");
        let root = base.join("vault");
        sample(&root);
        fs::write(root.join("caf\u{e9}.md"), b"one").unwrap();
        fs::write(root.join("cafe\u{301}.md"), b"two").unwrap();
        // a disk that keeps both (not every one does)
        if fs::read_dir(&root).unwrap().flatten().filter(|e| e.file_name().to_string_lossy().starts_with("caf")).count() == 2 {
            let e = encrypt_vault_with(&root, "password!", &zip_for(&base), FAST, &|_| Ok(())).err().unwrap();
            assert!(e.contains("written two ways") && e.contains("nothing was changed"), "{e}");
            assert!(!is_encrypted(&root) && !zip_for(&base).exists());
        }
        fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn names_are_the_same_on_every_system() {
        let d = scratch("nfc");
        let mut s = Store::create(d.join(STORE_DIR), VaultKey::generate().unwrap()).unwrap();
        // "é" as a Mac often writes it (e + combining accent), read back as Linux or Windows write it
        s.write(&norm("journal/e\u{301}te\u{301}.md").unwrap(), b"summer").unwrap();
        assert_eq!(&s.read(&norm("journal/\u{e9}t\u{e9}.md").unwrap()).unwrap()[..], b"summer");
        // an index written with NFD names by an older copy is put in NFC when opened
        s.index.nodes.insert("cafe\u{301}.md".into(), s.index.nodes["journal/\u{e9}t\u{e9}.md"].clone());
        s.save_index().unwrap();
        let s = s.reopen().unwrap();
        assert!(s.exists("caf\u{e9}.md"));
        fs::remove_dir_all(d).unwrap();
    }

    #[test]
    fn a_vault_from_a_newer_icebreaker_is_refused_and_left_alone() {
        let d = scratch("newer");
        let mut s = Store::create(d.join(STORE_DIR), VaultKey::generate().unwrap()).unwrap();
        s.write("a.md", b"a").unwrap();
        s.index.version = INDEX_VERSION + 1;
        s.save_index().unwrap();
        let before = fs::read(d.join(STORE_DIR).join(INDEX_FILE)).unwrap();
        let e = s.reopen().err().unwrap();
        assert!(e.contains("newer"), "{e}");
        assert_eq!(fs::read(d.join(STORE_DIR).join(INDEX_FILE)).unwrap(), before, "not repaired, not touched");
        assert_eq!(fs::read_dir(d.join(STORE_DIR)).unwrap().flatten().filter(|e| e.file_name().to_string_lossy().starts_with("index.damaged")).count(), 0);
        fs::remove_dir_all(d).unwrap();
    }

    #[test]
    fn names_windows_cant_hold_are_said_before_anything_is_written() {
        assert!(name_problem("notes/a:b.md").is_some());
        assert!(name_problem("CON.md").is_some());
        assert!(name_problem("notes/fin.").is_some());
        assert!(name_problem("notes/journée 20-11.md").is_none());
        let base = scratch("winnames");
        let root = base.join("vault");
        sample(&root);
        let (_, mut s) = encrypt_vault_with(&root, "password!", &zip_for(&base), FAST, &|_| Ok(())).unwrap();
        s.write("notes/what?.md", b"x").unwrap();
        let e = export(&s, &root, &base.join("copy")).err().unwrap();
        assert!(e.contains("what?.md") && e.contains("nothing was written"), "{e}");
        assert_eq!(fs::read_dir(base.join("copy")).unwrap().count(), 0);
        fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn plain_files_written_next_to_an_encrypted_vault_are_adopted() {
        let base = scratch("adopt");
        let root = base.join("vault");
        let orig = sample(&root);
        let (_, mut s) = encrypt_vault_with(&root, "password!", &zip_for(&base), FAST, &|_| Ok(())).unwrap();
        // an older ICEBREAKER wrote: the same Welcome, another stats.json, a new note
        fs::write(root.join("Welcome.md"), &orig["Welcome.md"]).unwrap();
        fs::create_dir_all(root.join(".icebreaker")).unwrap();
        fs::write(root.join(".icebreaker/stats.json"), b"{\"other\":1}").unwrap();
        fs::write(root.join("new.md"), b"written meanwhile").unwrap();
        assert_eq!(plain_leftovers(&root).len(), 3);
        let rep = adopt_plain(&root, &mut s).unwrap();
        assert_eq!(rep.files, 2);
        assert!(plain_leftovers(&root).is_empty());
        assert_eq!(&s.read("new.md").unwrap()[..], b"written meanwhile");
        assert_eq!(&s.read(".icebreaker/stats.json").unwrap()[..], &orig[".icebreaker/stats.json"][..], "the encrypted one stays");
        assert!(s.all().any(|(p, _)| p.starts_with(".trash/from-plain-") && p.ends_with(".icebreaker/stats.json")));
        let top: Vec<_> = fs::read_dir(&root).unwrap().flatten().map(|e| e.file_name().to_string_lossy().to_string()).collect();
        assert_eq!(top, vec![STORE_DIR.to_string()]);
        fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn moving_a_vault_copies_and_checks_everything_and_removes_nothing() {
        for encrypted in [false, true] {
            let base = scratch("move");
            let root = base.join("vault");
            let orig = sample(&root);
            if encrypted {
                drop(encrypt_vault_with(&root, "password!", &zip_for(&base), FAST, &|_| Ok(())).unwrap());
            }
            let before = plain_files(&root);
            // never into itself, never over something
            assert!(copy_vault(&root, &root.join("inside")).is_err());
            fs::create_dir_all(base.join("full")).unwrap();
            fs::write(base.join("full/x"), b"x").unwrap();
            assert!(copy_vault(&root, &base.join("full")).is_err());
            let rep = copy_vault(&root, &base.join("usb/Icebreaker")).unwrap();
            assert_eq!(rep.files, physical_files(&root).len(), "every file, Finder's too");
            assert_eq!(plain_files(&base.join("usb/Icebreaker")), before, "every file, the same");
            assert_eq!(plain_files(&root), before, "the old one is untouched");
            if encrypted {
                let s = Store::unlock(&base.join("usb/Icebreaker"), "password!").unwrap();
                assert_eq!(&s.read("Welcome.md").unwrap()[..], &orig["Welcome.md"][..]);
            }
            fs::remove_dir_all(base).unwrap();
        }
    }

    #[test]
    fn rekey_gives_a_new_key_and_the_old_one_opens_nothing() {
        let base = scratch("rekey");
        let root = base.join("vault");
        let orig = sample(&root);
        let (rep, s) = encrypt_vault_with(&root, "password!", &zip_for(&base), FAST, &|_| Ok(())).unwrap();
        drop(s);
        let old_words = rep.recovery.unwrap();
        let old_key = fs::read(root.join(STORE_DIR).join(KEY_FILE)).unwrap();
        let (rep, s) = rekey_vault_with(&root, "password!", FAST, &|_| Ok(())).unwrap();
        assert_eq!(rep.files, orig.len());
        for (rel, data) in &orig {
            assert_eq!(&s.read(rel).unwrap()[..], &data[..], "{rel}");
        }
        drop(s);
        let new_words = rep.recovery.unwrap();
        assert_ne!(new_words, old_words);
        assert!(!root.join(OLD_DIR).exists() && !root.join(PARTIAL_DIR).exists());
        // the old recovery key no longer opens it; the new one does
        assert!(recover(&root, &old_words, "x password").is_err());
        // the old key file, put back with the old password: it opens nothing of the new store
        let cur = fs::read(root.join(STORE_DIR).join(KEY_FILE)).unwrap();
        fs::write(root.join(STORE_DIR).join(KEY_FILE), &old_key).unwrap();
        fs::write(root.join(STORE_DIR).join(KEY_COPY), &old_key).unwrap();
        assert!(Store::unlock(&root, "password!").is_err(), "the old key opens nothing");
        fs::write(root.join(STORE_DIR).join(KEY_FILE), &cur).unwrap();
        fs::write(root.join(STORE_DIR).join(KEY_COPY), &cur).unwrap();
        assert!(Store::unlock(&root, "password!").is_ok());
        assert!(recover(&root, &new_words, "password!").is_ok());
        fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn an_interrupted_rekey_leaves_the_vault_as_it_was() {
        let base = scratch("rekeyfail");
        let root = base.join("vault");
        let orig = sample(&root);
        drop(encrypt_vault_with(&root, "password!", &zip_for(&base), FAST, &|_| Ok(())).unwrap());
        for stage in [Stage::Blob(2), Stage::BeforeVerify] {
            let e = rekey_vault_with(&root, "password!", FAST, &|s| if s == stage { Err("power cut".into()) } else { Ok(()) }).err().unwrap();
            assert!(e.contains("as they were"), "{e}");
            let s = Store::unlock(&root, "password!").unwrap();
            assert_eq!(&s.read("Welcome.md").unwrap()[..], &orig["Welcome.md"][..]);
        }
        // the power cut between the two renames: still seen as an encrypted vault, and the
        // old store comes back when the vault is mounted again (vault.rs calls finish_interrupted)
        fs::rename(root.join(STORE_DIR), root.join(OLD_DIR)).unwrap();
        assert!(is_encrypted(&root));
        finish_interrupted(&root);
        assert!(Store::unlock(&root, "password!").is_ok());
        fs::remove_dir_all(base).unwrap();
    }

    /// A copy of a real vault, made by hand: `IB_VAULT_COPY=/path/to/copy cargo test real_vault_copy -- --ignored`.
    /// Never the vault itself: the test refuses any folder that isn't in a temp / scratch folder.
    #[test]
    #[ignore]
    fn real_vault_copy() {
        let Ok(p) = std::env::var("IB_VAULT_COPY") else { return };
        let root = PathBuf::from(p);
        let s = root.to_string_lossy();
        assert!(s.contains("/tmp/") || s.contains("/private/") || s.contains("scratch"), "only a copy in a temp folder: {s}");
        let base = root.parent().unwrap().to_path_buf();
        let before = plain_files(&root);
        let zip = base.join(format!("backup-{}.zip", now_ms()));
        let (rep, st) = encrypt_vault(&root, "real vault copy test", &zip).unwrap();
        println!("encrypted {} files, {} folders, {} bytes", rep.files, rep.folders, rep.bytes);
        for (rel, data) in &before {
            assert_eq!(&st.read(rel).unwrap()[..], &data[..], "{rel}");
        }
        drop(st);
        for p in physical_files(&root) {
            assert!(p.starts_with(root.join(STORE_DIR)), "plain file left: {}", p.display());
        }
        decrypt_vault(&root, "real vault copy test").unwrap();
        assert_eq!(plain_files(&root), before);
    }
}
