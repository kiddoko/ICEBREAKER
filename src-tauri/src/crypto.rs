//! Vault encryption: the keys and the file format (plan: docs/ENCRYPTION.md).
//!
//! ```text
//! account password ──Argon2id (random salt, 64 MiB, 3 passes)──► KEK
//! random 256-bit vault key (DEK) ── wrapped by the KEK ──► .icebreaker/vault.key
//!                                ── wrapped by the recovery key (optional)
//! DEK ── XChaCha20-Poly1305, a new random nonce per write ──► every file
//! ```
//!
//! - A file on disk: `IBX1` · nonce (24 bytes) · ciphertext · tag (16 bytes).
//!   The magic is authenticated with the rest, and each file can be bound to a
//!   name (the "associated data", e.g. its blob number): a changed, damaged,
//!   truncated or swapped file is refused, never shown half-wrong.
//! - The vault key never changes: a new password only re-wraps it.
//! - Keys live only here, in Rust memory, and are wiped (`zeroize`) when dropped
//!   (locking the vault drops its `store::Store`). The UI never sees them.
//! - [`write_atomic`]: temp file in the same folder → flushed to disk → renamed
//!   over the old one. A crash leaves either the old file or the new one, never
//!   half of one; [`sweep_temp_files`] removes the leftovers.
//!
//! Used by store.rs (the encrypted vault on disk).

use argon2::{Algorithm, Argon2, Params, Version};
use chacha20poly1305::aead::{Aead, KeyInit, Payload};
use chacha20poly1305::{XChaCha20Poly1305, XNonce};
use serde::{Deserialize, Serialize};
use std::fmt;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use zeroize::{Zeroize, ZeroizeOnDrop, Zeroizing};

/// The first 4 bytes of every encrypted file.
pub const MAGIC: &[u8; 4] = b"IBX1";
pub const NONCE_LEN: usize = 24;
pub const TAG_LEN: usize = 16;
pub const KEY_LEN: usize = 32;
const SALT_LEN: usize = 16;
/// The extension of a half-written file (`.<name>.ibtmp-<random>`).
pub const TEMP_MARK: &str = ".ibtmp-";

/// What can go wrong. None of these ever carries a key or a password.
#[derive(Debug, PartialEq, Eq)]
pub enum CryptoError {
    /// the password or recovery key doesn't open this vault
    WrongPassword,
    /// the file was changed, damaged or cut short — or it was sealed with another vault's key
    Damaged,
    /// not an ICEBREAKER encrypted file (no `IBX1` at the start)
    NotEncrypted,
    /// vault.key can't be read (damaged, or made by a newer version)
    BadKeyFile(String),
    /// the system gave no random bytes
    Random,
    Io(String),
}

impl fmt::Display for CryptoError {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        match self {
            CryptoError::WrongPassword => write!(f, "wrong password"),
            CryptoError::Damaged => write!(f, "this file is damaged, or it was encrypted with another vault's key"),
            CryptoError::NotEncrypted => write!(f, "this file isn't encrypted"),
            CryptoError::BadKeyFile(e) => write!(f, "the vault key file can't be read: {e}"),
            CryptoError::Random => write!(f, "the system gave no random bytes"),
            CryptoError::Io(e) => write!(f, "{e}"),
        }
    }
}

impl From<CryptoError> for String {
    fn from(e: CryptoError) -> String {
        e.to_string()
    }
}

impl From<std::io::Error> for CryptoError {
    fn from(e: std::io::Error) -> Self {
        CryptoError::Io(e.to_string())
    }
}

type Result<T> = std::result::Result<T, CryptoError>;

fn random(buf: &mut [u8]) -> Result<()> {
    getrandom::getrandom(buf).map_err(|_| CryptoError::Random)
}

// ── the vault key ──────────────────────────────────────────────────────────

/// The vault key (DEK): 32 random bytes, on the heap so it's never copied
/// around, wiped when dropped. Not `Clone`, not `Debug`, not `Serialize`.
#[derive(Zeroize, ZeroizeOnDrop)]
pub struct VaultKey(Box<[u8; KEY_LEN]>);

impl VaultKey {
    pub fn generate() -> Result<Self> {
        let mut k = VaultKey(Box::new([0u8; KEY_LEN]));
        random(&mut k.0[..])?;
        Ok(k)
    }

    fn from_slice(b: &[u8]) -> Result<Self> {
        if b.len() != KEY_LEN {
            return Err(CryptoError::Damaged);
        }
        let mut k = VaultKey(Box::new([0u8; KEY_LEN]));
        k.0.copy_from_slice(b);
        Ok(k)
    }

    fn cipher(&self) -> XChaCha20Poly1305 {
        XChaCha20Poly1305::new_from_slice(&self.0[..]).expect("32-byte key")
    }

    /// Same key? (tests)
    #[cfg(test)]
    pub fn same_as(&self, other: &VaultKey) -> bool {
        // constant time is not needed here: both are ours, nothing is compared to an attacker's guess
        self.0[..] == other.0[..]
    }
}

impl fmt::Debug for VaultKey {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        write!(f, "VaultKey(…)")
    }
}

// ── the file format ────────────────────────────────────────────────────────

/// Does this look like an encrypted file? (the magic only — [`open`] checks the rest)
#[cfg(test)]
pub fn is_sealed(data: &[u8]) -> bool {
    data.len() >= MAGIC.len() + NONCE_LEN + TAG_LEN && &data[..MAGIC.len()] == MAGIC
}

/// The magic is authenticated too, then the caller's own binding (blob number…).
fn full_aad(aad: &[u8]) -> Vec<u8> {
    let mut v = Vec::with_capacity(MAGIC.len() + aad.len());
    v.extend_from_slice(MAGIC);
    v.extend_from_slice(aad);
    v
}

/// Encrypt: `IBX1` · nonce · ciphertext · tag. `aad` binds the file to a name
/// (it must be given again, the same, to [`open`] it); it isn't stored.
pub fn seal(key: &VaultKey, plain: &[u8], aad: &[u8]) -> Result<Vec<u8>> {
    let mut nonce = [0u8; NONCE_LEN];
    random(&mut nonce)?;
    let ad = full_aad(aad);
    let ct = key.cipher().encrypt(XNonce::from_slice(&nonce), Payload { msg: plain, aad: &ad }).map_err(|_| CryptoError::Damaged)?;
    let mut out = Vec::with_capacity(MAGIC.len() + NONCE_LEN + ct.len());
    out.extend_from_slice(MAGIC);
    out.extend_from_slice(&nonce);
    out.extend_from_slice(&ct);
    Ok(out)
}

/// Decrypt what [`seal`] made. Any change to any byte, a cut, another key or
/// another `aad` → `Damaged`, and nothing of the content comes out.
/// The plain text is wiped from memory when the returned buffer is dropped.
pub fn open(key: &VaultKey, data: &[u8], aad: &[u8]) -> Result<Zeroizing<Vec<u8>>> {
    if data.len() < MAGIC.len() || &data[..MAGIC.len()] != MAGIC {
        return Err(CryptoError::NotEncrypted);
    }
    if data.len() < MAGIC.len() + NONCE_LEN + TAG_LEN {
        return Err(CryptoError::Damaged);
    }
    let nonce = XNonce::from_slice(&data[MAGIC.len()..MAGIC.len() + NONCE_LEN]);
    let ad = full_aad(aad);
    key.cipher()
        .decrypt(nonce, Payload { msg: &data[MAGIC.len() + NONCE_LEN..], aad: &ad })
        .map(Zeroizing::new)
        .map_err(|_| CryptoError::Damaged)
}

// ── the key file (.icebreaker/vault.key) ───────────────────────────────────

/// Argon2id cost. Stored in the key file so it can be raised later
/// without breaking older vaults.
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub struct KdfParams {
    /// memory, in KiB
    pub m_kib: u32,
    /// passes
    pub t: u32,
    /// lanes
    pub p: u32,
}

/// 64 MiB, 3 passes, 1 lane (docs/ENCRYPTION.md): about half a second on a laptop.
pub const DEFAULT_KDF: KdfParams = KdfParams { m_kib: 64 * 1024, t: 3, p: 1 };

impl KdfParams {
    /// Refuse costs a damaged or forged key file could use to freeze the app
    /// (4 GiB of memory…) or to make guessing cheap.
    fn check(&self) -> Result<()> {
        let min_m = if cfg!(test) { 8 } else { 19 * 1024 };
        if self.m_kib < min_m || self.m_kib > 1024 * 1024 || self.t == 0 || self.t > 16 || self.p == 0 || self.p > 8 {
            return Err(CryptoError::BadKeyFile(format!("unexpected key-derivation cost ({} KiB, {} passes, {} lanes)", self.m_kib, self.t, self.p)));
        }
        Ok(())
    }
}

/// One way to open the vault key: a salt, a cost, and the vault key
/// encrypted by the key derived from a secret (the password, or the recovery key).
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Slot {
    salt: String,
    kdf: KdfParams,
    /// nonce · encrypted vault key · tag (hex)
    wrapped: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct KeyFile {
    format: String,
    version: u32,
    password: Slot,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    recovery: Option<Slot>,
}

const KEYFILE_FORMAT: &str = "ICEBREAKER vault key";
const KEYFILE_VERSION: u32 = 1;
const AD_PASSWORD: &[u8] = b"ICEBREAKER vault key v1 / password";
const AD_RECOVERY: &[u8] = b"ICEBREAKER vault key v1 / recovery";

/// The key-encryption key from a secret: Argon2id, wiped when dropped.
fn derive(secret: &[u8], salt: &[u8], kdf: KdfParams) -> Result<Zeroizing<[u8; KEY_LEN]>> {
    kdf.check()?;
    let params = Params::new(kdf.m_kib, kdf.t, kdf.p, Some(KEY_LEN)).map_err(|e| CryptoError::BadKeyFile(e.to_string()))?;
    let mut out = Zeroizing::new([0u8; KEY_LEN]);
    Argon2::new(Algorithm::Argon2id, Version::V0x13, params).hash_password_into(secret, salt, &mut out[..]).map_err(|e| CryptoError::BadKeyFile(e.to_string()))?;
    Ok(out)
}

fn make_slot(key: &VaultKey, secret: &[u8], kdf: KdfParams, ad: &[u8]) -> Result<Slot> {
    let mut salt = [0u8; SALT_LEN];
    random(&mut salt)?;
    let kek = VaultKey::from_slice(&derive(secret, &salt, kdf)?[..])?;
    // the same sealed format as files (magic dropped: the slot says what it is)
    let sealed = seal(&kek, &key.0[..], ad)?;
    Ok(Slot { salt: hex(&salt), kdf, wrapped: hex(&sealed[MAGIC.len()..]) })
}

fn open_slot(slot: &Slot, secret: &[u8], ad: &[u8]) -> Result<VaultKey> {
    let salt = unhex(&slot.salt)?;
    if salt.len() < 8 {
        return Err(CryptoError::BadKeyFile("salt too short".into()));
    }
    let mut sealed = MAGIC.to_vec();
    sealed.extend_from_slice(&unhex(&slot.wrapped)?);
    let kek = VaultKey::from_slice(&derive(secret, &salt, slot.kdf)?[..])?;
    match open(&kek, &sealed, ad) {
        Ok(plain) => VaultKey::from_slice(&plain),
        Err(_) => Err(CryptoError::WrongPassword),
    }
}

impl KeyFile {
    /// A new vault: a fresh random vault key, wrapped by the password (cost: [`DEFAULT_KDF`]).
    pub(crate) fn create_with(password: &str, kdf: KdfParams) -> Result<(KeyFile, VaultKey)> {
        let key = VaultKey::generate()?;
        let slot = make_slot(&key, password.as_bytes(), kdf, AD_PASSWORD)?;
        Ok((KeyFile { format: KEYFILE_FORMAT.into(), version: KEYFILE_VERSION, password: slot, recovery: None }, key))
    }

    /// The password → the vault key (or `WrongPassword`).
    pub fn unlock(&self, password: &str) -> Result<VaultKey> {
        open_slot(&self.password, password.as_bytes(), AD_PASSWORD)
    }

    /// A new password: the same vault key re-wrapped (nothing else is re-encrypted).
    pub fn change_password(&mut self, key: &VaultKey, new_password: &str) -> Result<()> {
        self.password = make_slot(key, new_password.as_bytes(), self.password.kdf, AD_PASSWORD)?;
        Ok(())
    }

    /// Keep (or replace) a second way in: the recovery key. The old one stops working.
    pub fn set_recovery(&mut self, key: &VaultKey, recovery: &[u8]) -> Result<()> {
        self.recovery = Some(make_slot(key, recovery, self.password.kdf, AD_RECOVERY)?);
        Ok(())
    }

    pub fn has_recovery(&self) -> bool {
        self.recovery.is_some()
    }

    /// The recovery key → the vault key (then [`change_password`](Self::change_password) to pick a new password).
    pub fn unlock_with_recovery(&self, recovery: &[u8]) -> Result<VaultKey> {
        let slot = self.recovery.as_ref().ok_or(CryptoError::WrongPassword)?;
        open_slot(slot, recovery, AD_RECOVERY)
    }

    pub fn to_json(&self) -> String {
        serde_json::to_string_pretty(self).expect("plain struct")
    }

    pub fn from_json(text: &str) -> Result<KeyFile> {
        let kf: KeyFile = serde_json::from_str(text).map_err(|e| CryptoError::BadKeyFile(e.to_string()))?;
        if kf.format != KEYFILE_FORMAT {
            return Err(CryptoError::BadKeyFile("not a vault key file".into()));
        }
        if kf.version > KEYFILE_VERSION {
            return Err(CryptoError::BadKeyFile(format!("made by a newer ICEBREAKER (version {})", kf.version)));
        }
        kf.password.kdf.check()?;
        if let Some(r) = &kf.recovery {
            r.kdf.check()?;
        }
        Ok(kf)
    }

    pub fn load(path: &Path) -> Result<KeyFile> {
        let text = fs::read_to_string(path)?;
        Self::from_json(&text)
    }

    /// Written atomically and readable by your user only.
    pub fn save(&self, path: &Path) -> Result<()> {
        write_private(path, self.to_json().as_bytes())
    }
}

// ── atomic writes ──────────────────────────────────────────────────────────

fn temp_path(path: &Path) -> Result<PathBuf> {
    let dir = path.parent().ok_or_else(|| CryptoError::Io("no folder".into()))?;
    let name = path.file_name().ok_or_else(|| CryptoError::Io("no file name".into()))?.to_string_lossy();
    let mut r = [0u8; 6];
    random(&mut r)?;
    Ok(dir.join(format!(".{name}{TEMP_MARK}{}", hex(&r))))
}

/// Write a whole file or nothing: temp file in the same folder, flushed to the
/// disk, renamed over the old one, then the folder itself flushed (Unix).
pub fn write_atomic(path: &Path, data: &[u8]) -> Result<()> {
    write_atomic_inner(path, data, false, |_| Ok(()))
}

/// The same, readable by your user only from the first byte (keys, secrets,
/// settings, accounts): never a moment where another user could read it.
pub fn write_private(path: &Path, data: &[u8]) -> Result<()> {
    write_atomic_inner(path, data, true, |_| Ok(()))
}

/// `before_rename` lets the tests cut the power at the worst moment.
fn write_atomic_inner(path: &Path, data: &[u8], private: bool, before_rename: impl FnOnce(&Path) -> Result<()>) -> Result<()> {
    let tmp = temp_path(path)?;
    let done = (|| {
        let mut opts = fs::OpenOptions::new();
        opts.write(true).create_new(true);
        #[cfg(unix)]
        if private {
            use std::os::unix::fs::OpenOptionsExt;
            opts.mode(0o600);
        }
        #[cfg(not(unix))]
        let _ = private;
        let mut f = opts.open(&tmp)?;
        f.write_all(data)?;
        f.sync_all()?;
        drop(f);
        before_rename(&tmp)?;
        fs::rename(&tmp, path)?;
        Ok(())
    })();
    if done.is_err() {
        let _ = fs::remove_file(&tmp);
        return done;
    }
    #[cfg(unix)]
    if let Some(dir) = path.parent() {
        if let Ok(d) = fs::File::open(dir) {
            let _ = d.sync_all();
        }
    }
    Ok(())
}

/// Remove the temp files a crash left in `dir` (not in sub-folders). How many went.
pub fn sweep_temp_files(dir: &Path) -> usize {
    let Ok(rd) = fs::read_dir(dir) else { return 0 };
    rd.flatten()
        .filter(|e| {
            let n = e.file_name().to_string_lossy().to_string();
            n.starts_with('.') && n.contains(TEMP_MARK) && e.file_type().map(|t| t.is_file()).unwrap_or(false)
        })
        .filter(|e| fs::remove_file(e.path()).is_ok())
        .count()
}

// ── wiping a file ──────────────────────────────────────────────────────────

/// Overwrite a file with zeros, flush that to the disk, then remove it: the plain backup
/// zip after `vault encrypt`, the voice's work files. A link is refused (it would wipe
/// what it points to). **Best effort**: on an SSD, APFS, Btrfs or anything copy-on-write
/// the old blocks can survive somewhere the system doesn't show, and copies made before
/// (Time Machine, iCloud / Dropbox / OneDrive, the Trash) aren't touched — the disk's own
/// encryption (FileVault, BitLocker, LUKS) is what really covers that.
pub fn wipe_file(path: &Path) -> std::io::Result<()> {
    let meta = fs::symlink_metadata(path)?;
    if !meta.file_type().is_file() {
        return Err(std::io::Error::new(std::io::ErrorKind::InvalidInput, "not a plain file"));
    }
    {
        let mut f = fs::OpenOptions::new().write(true).open(path)?;
        let zeros = vec![0u8; 1 << 20];
        let mut left = meta.len();
        while left > 0 {
            let n = left.min(zeros.len() as u64) as usize;
            f.write_all(&zeros[..n])?;
            left -= n as u64;
        }
        f.sync_all()?;
    }
    fs::remove_file(path)
}

/// Wipes its file when dropped, whatever path the code took out (an error, a `?`):
/// for work files that hold a note's text or sound.
pub struct WipeOnDrop(pub PathBuf);

impl Drop for WipeOnDrop {
    fn drop(&mut self) {
        if fs::symlink_metadata(&self.0).is_ok() {
            let _ = wipe_file(&self.0).or_else(|_| fs::remove_file(&self.0));
        }
    }
}

/// Wipe the work files (names starting with `prefix`) older than ten minutes in a folder
/// of ours: what a crash or a kill left behind (voice.rs, encoders.rs). How many went.
pub fn sweep_work_files(dir: &Path, prefix: &str) -> usize {
    let Ok(rd) = fs::read_dir(dir) else { return 0 };
    let old = |e: &fs::DirEntry| e.metadata().and_then(|m| m.modified()).ok().and_then(|t| t.elapsed().ok()).is_some_and(|age| age.as_secs() >= 600);
    rd.flatten()
        .filter(|e| e.file_name().to_string_lossy().starts_with(prefix) && e.file_type().map(|t| t.is_file()).unwrap_or(false) && old(e))
        .filter(|e| wipe_file(&e.path()).is_ok())
        .count()
}

// ── hex ────────────────────────────────────────────────────────────────────

fn hex(b: &[u8]) -> String {
    b.iter().map(|x| format!("{x:02x}")).collect()
}

fn unhex(s: &str) -> Result<Vec<u8>> {
    let bad = || CryptoError::BadKeyFile("bad hex".into());
    if s.len() % 2 != 0 {
        return Err(bad());
    }
    (0..s.len()).step_by(2).map(|i| s.get(i..i + 2).and_then(|h| u8::from_str_radix(h, 16).ok()).ok_or_else(bad)).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    /// small and fast for the tests (the real cost is tested once, in `real_cost_works`)
    const FAST: KdfParams = KdfParams { m_kib: 8, t: 1, p: 1 };

    fn scratch(name: &str) -> PathBuf {
        let mut r = [0u8; 4];
        random(&mut r).unwrap();
        let d = std::env::temp_dir().join(format!("ib-crypto-{name}-{}", hex(&r)));
        fs::create_dir_all(&d).unwrap();
        d
    }

    #[test]
    fn wipe_overwrites_then_removes() {
        let d = scratch("wipe");
        let p = d.join("plain.zip");
        fs::write(&p, b"my secret notes, in plain").unwrap();
        // a second name for the same bytes: what the wipe wrote is what's left there
        #[cfg(unix)]
        {
            let twin = d.join("twin");
            fs::hard_link(&p, &twin).unwrap();
            wipe_file(&p).unwrap();
            assert!(!p.exists());
            let left = fs::read(&twin).unwrap();
            assert_eq!(left.len(), 25);
            assert!(left.iter().all(|b| *b == 0), "overwritten before it was removed");
        }
        #[cfg(not(unix))]
        {
            wipe_file(&p).unwrap();
            assert!(!p.exists());
        }
        // a link is refused, its target untouched
        #[cfg(unix)]
        {
            let target = d.join("target");
            fs::write(&target, b"keep me").unwrap();
            std::os::unix::fs::symlink(&target, d.join("link")).unwrap();
            assert!(wipe_file(&d.join("link")).is_err());
            assert_eq!(fs::read(&target).unwrap(), b"keep me");
        }
        // the guard wipes on every way out
        let w = d.join("work.txt");
        fs::write(&w, b"a note read aloud").unwrap();
        {
            let _g = WipeOnDrop(w.clone());
        }
        assert!(!w.exists());
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn round_trips() {
        let k = VaultKey::generate().unwrap();
        for plain in [&b""[..], b"x", "# Note\n\nUne ligne accentu\u{e9}e, \u{65e5}\u{672c}\n".as_bytes(), &vec![7u8; 1 << 20]] {
            let s = seal(&k, plain, b"blob 42").unwrap();
            assert!(is_sealed(&s));
            assert_eq!(s.len(), 4 + NONCE_LEN + plain.len() + TAG_LEN);
            assert_eq!(&open(&k, &s, b"blob 42").unwrap()[..], plain);
        }
    }

    #[test]
    fn the_plain_text_never_shows_and_each_write_differs() {
        let k = VaultKey::generate().unwrap();
        let plain = b"secret secret secret secret secret";
        let a = seal(&k, plain, b"").unwrap();
        let b = seal(&k, plain, b"").unwrap();
        assert_ne!(a, b, "a new nonce per write");
        assert!(!a.windows(6).any(|w| w == b"secret"));
    }

    #[test]
    fn every_damaged_byte_is_refused() {
        let k = VaultKey::generate().unwrap();
        let s = seal(&k, b"une note", b"7").unwrap();
        for i in 0..s.len() {
            let mut d = s.clone();
            d[i] ^= 0x01;
            let r = open(&k, &d, b"7");
            assert!(r == Err(CryptoError::Damaged) || (i < 4 && r == Err(CryptoError::NotEncrypted)), "byte {i}");
        }
    }

    #[test]
    fn cut_short_or_grown_is_refused() {
        let k = VaultKey::generate().unwrap();
        let s = seal(&k, b"une note un peu longue", b"").unwrap();
        for n in 0..s.len() {
            assert!(open(&k, &s[..n], b"").is_err(), "cut at {n}");
        }
        let mut longer = s.clone();
        longer.push(0);
        assert_eq!(open(&k, &longer, b""), Err(CryptoError::Damaged));
    }

    #[test]
    fn another_key_or_another_name_is_refused() {
        let k = VaultKey::generate().unwrap();
        let other = VaultKey::generate().unwrap();
        let s = seal(&k, b"note", b"blob 1").unwrap();
        assert_eq!(open(&other, &s, b"blob 1"), Err(CryptoError::Damaged));
        // a file moved to another blob's place is refused too
        assert_eq!(open(&k, &s, b"blob 2"), Err(CryptoError::Damaged));
    }

    #[test]
    fn plain_files_are_not_mistaken_for_encrypted_ones() {
        let k = VaultKey::generate().unwrap();
        assert!(!is_sealed(b"# hello"));
        assert!(!is_sealed(b"IBX1 short"));
        assert_eq!(open(&k, b"# hello", b""), Err(CryptoError::NotEncrypted));
    }

    #[test]
    fn password_opens_the_key_and_a_wrong_one_does_not() {
        let (kf, key) = KeyFile::create_with("correct horse battery", FAST).unwrap();
        let back = KeyFile::from_json(&kf.to_json()).unwrap();
        assert!(back.unlock("correct horse battery").unwrap().same_as(&key));
        assert_eq!(back.unlock("correct horse batterY").unwrap_err(), CryptoError::WrongPassword);
        assert_eq!(back.unlock("").unwrap_err(), CryptoError::WrongPassword);
    }

    #[test]
    fn the_key_file_holds_no_key_and_no_password() {
        let (kf, key) = KeyFile::create_with("correct horse battery", FAST).unwrap();
        let json = kf.to_json();
        assert!(!json.contains(&hex(&key.0[..])));
        assert!(!json.contains("correct horse"));
        assert_eq!(format!("{key:?}"), "VaultKey(…)");
    }

    #[test]
    fn a_new_password_keeps_the_same_vault_key() {
        let (mut kf, key) = KeyFile::create_with("old password", FAST).unwrap();
        let note = seal(&key, b"written before", b"").unwrap();
        kf.change_password(&key, "new password").unwrap();
        assert_eq!(kf.unlock("old password").unwrap_err(), CryptoError::WrongPassword);
        let k2 = kf.unlock("new password").unwrap();
        assert_eq!(&open(&k2, &note, b"").unwrap()[..], b"written before");
    }

    #[test]
    fn recovery_key_opens_the_same_vault_and_a_new_one_replaces_it() {
        let (mut kf, key) = KeyFile::create_with("password!", FAST).unwrap();
        assert!(!kf.has_recovery());
        assert_eq!(kf.unlock_with_recovery(b"anything").unwrap_err(), CryptoError::WrongPassword);
        kf.set_recovery(&key, b"first recovery secret").unwrap();
        let kf = {
            let mut back = KeyFile::from_json(&kf.to_json()).unwrap();
            assert!(back.unlock_with_recovery(b"first recovery secret").unwrap().same_as(&key));
            assert_eq!(back.unlock_with_recovery(b"password!").unwrap_err(), CryptoError::WrongPassword);
            back.set_recovery(&key, b"second recovery secret").unwrap();
            back
        };
        assert_eq!(kf.unlock_with_recovery(b"first recovery secret").unwrap_err(), CryptoError::WrongPassword);
        assert!(kf.unlock_with_recovery(b"second recovery secret").unwrap().same_as(&key));
        // the recovery key isn't the password, and the password still works
        assert!(kf.unlock("password!").unwrap().same_as(&key));
    }

    #[test]
    fn a_damaged_key_file_is_refused_not_a_crash() {
        let (kf, _) = KeyFile::create_with("password!", FAST).unwrap();
        let json = kf.to_json();
        assert!(matches!(KeyFile::from_json("{"), Err(CryptoError::BadKeyFile(_))));
        assert!(matches!(KeyFile::from_json(&json.replace(KEYFILE_FORMAT, "something else")), Err(CryptoError::BadKeyFile(_))));
        assert!(matches!(KeyFile::from_json(&json.replace("\"version\": 1", "\"version\": 99")), Err(CryptoError::BadKeyFile(_))));
        // a forged cost that would eat 4 GiB of memory
        assert!(matches!(KeyFile::from_json(&json.replace("\"m_kib\": 8", "\"m_kib\": 4194304")), Err(CryptoError::BadKeyFile(_))));
        // one changed character in the wrapped key: the password no longer opens it
        let mut v: serde_json::Value = serde_json::from_str(&json).unwrap();
        let w = v["password"]["wrapped"].as_str().unwrap().to_string();
        let flipped = format!("{}{}", if w.starts_with('0') { '1' } else { '0' }, &w[1..]);
        v["password"]["wrapped"] = serde_json::Value::String(flipped);
        assert_eq!(KeyFile::from_json(&v.to_string()).unwrap().unlock("password!").unwrap_err(), CryptoError::WrongPassword);
        v["password"]["wrapped"] = serde_json::Value::String("zz".into());
        assert!(matches!(KeyFile::from_json(&v.to_string()).unwrap().unlock("password!"), Err(CryptoError::BadKeyFile(_))));
    }

    #[test]
    fn real_cost_works() {
        let (kf, key) = KeyFile::create_with("correct horse battery", DEFAULT_KDF).unwrap();
        assert_eq!(kf.password.kdf, DEFAULT_KDF);
        assert!(KeyFile::from_json(&kf.to_json()).unwrap().unlock("correct horse battery").unwrap().same_as(&key));
    }

    #[test]
    fn key_file_save_and_load() {
        let d = scratch("keyfile");
        let p = d.join("vault.key");
        let (kf, key) = KeyFile::create_with("password!", FAST).unwrap();
        kf.save(&p).unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            assert_eq!(fs::metadata(&p).unwrap().permissions().mode() & 0o777, 0o600);
        }
        assert!(KeyFile::load(&p).unwrap().unlock("password!").unwrap().same_as(&key));
        fs::remove_dir_all(d).unwrap();
    }

    #[test]
    fn atomic_write_replaces_whole_files() {
        let d = scratch("atomic");
        let p = d.join("note.md");
        write_atomic(&p, b"first").unwrap();
        write_atomic(&p, b"second, longer").unwrap();
        assert_eq!(fs::read(&p).unwrap(), b"second, longer");
        assert_eq!(fs::read_dir(&d).unwrap().count(), 1, "no temp file left");
        fs::remove_dir_all(d).unwrap();
    }

    #[test]
    fn an_interrupted_write_keeps_the_old_file() {
        let d = scratch("interrupted");
        let p = d.join("note.md");
        let k = VaultKey::generate().unwrap();
        write_atomic(&p, &seal(&k, b"the old note", b"").unwrap()).unwrap();
        // the power goes after the new content is on disk, before the rename
        let r = write_atomic_inner(&p, &seal(&k, b"the new note", b"").unwrap(), false, |_| Err(CryptoError::Io("power cut".into())));
        assert!(r.is_err());
        assert_eq!(&open(&k, &fs::read(&p).unwrap(), b"").unwrap()[..], b"the old note");
        assert_eq!(fs::read_dir(&d).unwrap().count(), 1, "the failed write cleaned up after itself");
        // a real crash can't clean up: its temp file is left, the old note still reads, the sweep removes it
        let tmp = temp_path(&p).unwrap();
        fs::write(&tmp, b"IBX1 half writ").unwrap();
        assert_eq!(&open(&k, &fs::read(&p).unwrap(), b"").unwrap()[..], b"the old note");
        assert_eq!(sweep_temp_files(&d), 1);
        assert!(!tmp.exists() && p.exists());
        // a half-written encrypted file, read on its own, is refused
        assert!(open(&k, b"IBX1 half writ", b"").is_err());
        fs::remove_dir_all(d).unwrap();
    }

    #[test]
    fn sweep_leaves_real_files_alone() {
        let d = scratch("sweep");
        fs::write(d.join("note.ibtmp-.md"), b"a note with an odd name").unwrap();
        fs::write(d.join(".hidden"), b"x").unwrap();
        fs::write(d.join(format!(".note.md{TEMP_MARK}abcdef")), b"x").unwrap();
        assert_eq!(sweep_temp_files(&d), 1);
        assert_eq!(fs::read_dir(&d).unwrap().count(), 2);
        fs::remove_dir_all(d).unwrap();
    }

    #[test]
    fn zeroize_empties_the_key_bytes() {
        let mut k = VaultKey::generate().unwrap();
        k.0[0] |= 1; // never all zero
        k.zeroize();
        assert!(k.0.iter().all(|b| *b == 0));
    }

    #[test]
    fn hex_round_trip() {
        let b = [0u8, 1, 0x7f, 0x80, 0xff];
        assert_eq!(unhex(&hex(&b)).unwrap(), b);
        assert!(unhex("abc").is_err());
        assert!(unhex("zz").is_err());
        assert!(unhex("é1").is_err());
    }
}
