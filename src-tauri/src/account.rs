//! The deck's accounts: each one a name + password, its own settings (users/<id>/)
//! and its own vault. The login screen unlocks one; that one's settings are
//! the only ones the app reads and writes until it's locked again.
//!
//! The password is never stored. `accounts.json` (in the OS config folder,
//! readable by your user only) holds each account's name and an Argon2id hash
//! (19 MiB, 2 passes: the OWASP recommendation) with a random salt, as a
//! standard PHC string. The hash never goes back to the UI: the UI can only
//! ask "is this the right password?", and every wrong answer makes the next
//! try wait longer (up to 8 s), so guessing is slow even for a plugin.
//!
//! This locks the deck, it does not encrypt the vault: the notes stay plain
//! Markdown files on disk (that's what keeps them Obsidian-compatible).
//! Forgot the password? Quit the app and remove that account from accounts.json
//! (its settings stay in users/<id>/).

use argon2::password_hash::{rand_core::OsRng, PasswordHash, PasswordHasher, PasswordVerifier, SaltString};
use argon2::Argon2;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager, State};

#[derive(Serialize, Deserialize, Clone)]
struct Account {
    /// the folder name of its settings (users/<id>/): never changes, even when the name does
    #[serde(default)]
    id: String,
    user: String,
    /// PHC string: $argon2id$v=19$m=19456,t=2,p=1$<salt>$<hash>
    hash: String,
    created: u64,
}

#[derive(Serialize, Deserialize, Default)]
struct Accounts {
    accounts: Vec<Account>,
}

/// What the UI may know about an account: its id and name (never the hash).
#[derive(Serialize, Clone)]
pub struct AccountInfo {
    id: String,
    user: String,
}

#[derive(Default)]
pub struct AccountState {
    fails: Mutex<u32>,
    /// the account unlocked in this run of the app (its id): its settings are the ones read and written
    session: Mutex<Option<String>>,
}

impl AccountState {
    /// The unlocked account's id, if any (config.rs reads the settings of that one only).
    pub fn session(&self) -> Option<String> {
        self.session.lock().ok().and_then(|s| s.clone())
    }
}

fn config_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

/// users/<id>/: an account's own settings.json and secrets.json.
pub fn user_dir(app: &AppHandle, id: &str) -> Result<PathBuf, String> {
    if id.is_empty() || !id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-') {
        return Err("bad account id".into());
    }
    let dir = config_dir(app)?.join("users").join(id);
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn write_private(p: &Path, text: &str) -> Result<(), String> {
    fs::write(p, text).map_err(|e| e.to_string())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = fs::set_permissions(p, fs::Permissions::from_mode(0o600));
    }
    Ok(())
}

/// Every account. The single account.json of older versions becomes the first one,
/// and takes the settings that were there (settings.json, secrets.json → users/<id>/).
fn load(app: &AppHandle) -> Result<Accounts, String> {
    let dir = config_dir(app)?;
    let list_path = dir.join("accounts.json");
    match fs::read_to_string(&list_path) {
        Ok(s) => return serde_json::from_str(&s).map_err(|e| format!("accounts.json is damaged: {e}")),
        Err(e) if e.kind() != std::io::ErrorKind::NotFound => return Err(e.to_string()),
        Err(_) => {}
    }
    let old = dir.join("account.json");
    let Ok(s) = fs::read_to_string(&old) else { return Ok(Accounts::default()) };
    let mut acc: Account = serde_json::from_str(&s).map_err(|e| format!("account.json is damaged: {e}"))?;
    acc.id = slug(&acc.user, &[]);
    adopt_root_settings(app, &acc.id)?;
    let all = Accounts { accounts: vec![acc] };
    save(app, &all)?;
    let _ = fs::remove_file(old);
    Ok(all)
}

fn save(app: &AppHandle, all: &Accounts) -> Result<(), String> {
    let json = serde_json::to_string_pretty(all).map_err(|e| e.to_string())?;
    write_private(&config_dir(app)?.join("accounts.json"), &json)
}

/// The settings of a deck from before accounts move into the first account's folder.
fn adopt_root_settings(app: &AppHandle, id: &str) -> Result<(), String> {
    let dir = config_dir(app)?;
    let to = user_dir(app, id)?;
    for name in ["settings.json", "secrets.json"] {
        let from = dir.join(name);
        if from.exists() && !to.join(name).exists() {
            fs::rename(&from, to.join(name)).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

fn norm(user: &str) -> String {
    user.trim().to_lowercase()
}

/// "Neo Anderson" → "neo-anderson" (unique among `taken`).
fn slug(user: &str, taken: &[&str]) -> String {
    let mut base: String = norm(user).chars().map(|c| if c.is_ascii_alphanumeric() { c } else { '-' }).collect();
    base = base.trim_matches('-').chars().take(32).collect();
    if base.is_empty() {
        base = "user".into();
    }
    let mut id = base.clone();
    let mut n = 2;
    while taken.contains(&id.as_str()) {
        id = format!("{base}-{n}");
        n += 1;
    }
    id
}

fn hash(password: &str) -> Result<String, String> {
    let salt = SaltString::generate(&mut OsRng);
    Argon2::default().hash_password(password.as_bytes(), &salt).map(|h| h.to_string()).map_err(|e| e.to_string())
}

fn check(acc: &Account, user: &str, password: &str) -> bool {
    let ok_hash = PasswordHash::new(&acc.hash).map(|h| Argon2::default().verify_password(password.as_bytes(), &h).is_ok()).unwrap_or(false);
    // always run the hash (same timing for a wrong name and a wrong password)
    ok_hash && norm(&acc.user) == norm(user)
}

/// Which account a name + password open (the hash runs even for an unknown name).
fn find(all: &Accounts, user: &str, password: &str) -> Option<Account> {
    match all.accounts.iter().find(|a| norm(&a.user) == norm(user)) {
        Some(a) => check(a, user, password).then(|| a.clone()),
        None => {
            let _ = hash(password); // same time as a real check
            None
        }
    }
}

/// Wait longer after each failure: 0.25 s, 0.5 s, 1 s … 8 s.
fn throttle(state: &State<AccountState>) {
    let fails = *state.fails.lock().unwrap();
    if fails > 0 {
        std::thread::sleep(Duration::from_millis((250u64 << (fails - 1).min(5)).min(8000)));
    }
}

fn record(state: &State<AccountState>, ok: bool) {
    let mut f = state.fails.lock().unwrap();
    *f = if ok { 0 } else { f.saturating_add(1) };
}

fn open_session(state: &State<AccountState>, id: &str) {
    *state.session.lock().unwrap() = Some(id.to_string());
}

/// The unlocked account's name (null: locked, or no account yet).
#[tauri::command]
pub fn account_status(app: AppHandle, state: State<AccountState>) -> Result<Option<String>, String> {
    let all = load(&app)?;
    Ok(state.session().and_then(|id| all.accounts.iter().find(|a| a.id == id).map(|a| a.user.clone())))
}

/// The account unlocked in this run of the app (it survives a reload of the page).
#[tauri::command]
pub fn account_session(app: AppHandle, state: State<AccountState>) -> Result<Option<AccountInfo>, String> {
    let all = load(&app)?;
    Ok(state.session().and_then(|id| all.accounts.iter().find(|a| a.id == id).map(|a| AccountInfo { id: a.id.clone(), user: a.user.clone() })))
}

/// How many accounts there are (the login screen: 0 = make the first one). Names stay private.
#[tauri::command]
pub fn account_count(app: AppHandle) -> Result<usize, String> {
    Ok(load(&app)?.accounts.len())
}

/// A new account. The first one is free; every other one must be approved by an
/// account of this deck (its name + password): they all run as the same computer
/// user, so a new account could otherwise open a terminal on a locked deck.
/// The new account is unlocked at once (its setup runs next).
#[tauri::command(async)]
pub fn account_create(app: AppHandle, state: State<AccountState>, user: String, password: String, approver: Option<String>, approver_password: Option<String>) -> Result<AccountInfo, String> {
    let mut all = load(&app)?;
    if !all.accounts.is_empty() {
        throttle(&state);
        let ok = find(&all, approver.as_deref().unwrap_or(""), approver_password.as_deref().unwrap_or("")).is_some();
        record(&state, ok);
        if !ok {
            return Err("an account of this deck must approve it (its name and password)".into());
        }
    }
    validate(&user, &password)?;
    if all.accounts.iter().any(|a| norm(&a.user) == norm(&user)) {
        return Err("there's already an account with that name".into());
    }
    let taken: Vec<&str> = all.accounts.iter().map(|a| a.id.as_str()).collect();
    let id = slug(&user, &taken);
    let first = all.accounts.is_empty();
    let created = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
    all.accounts.push(Account { id: id.clone(), user: user.trim().to_string(), hash: hash(&password)?, created });
    save(&app, &all)?;
    if first {
        // a deck used without a login keeps everything: its settings become this account's
        adopt_root_settings(&app, &id)?;
    }
    user_dir(&app, &id)?;
    open_session(&state, &id);
    Ok(AccountInfo { id, user: user.trim().to_string() })
}

/// Name + password: right → that account is unlocked (its settings are the ones used).
#[tauri::command(async)]
pub fn account_verify(app: AppHandle, state: State<AccountState>, user: String, password: String) -> Result<bool, String> {
    throttle(&state);
    let all = load(&app)?;
    let found = find(&all, &user, &password);
    record(&state, found.is_some());
    if let Some(a) = &found {
        open_session(&state, &a.id);
    }
    Ok(found.is_some())
}

/// Lock: no account is unlocked any more (the login screen comes back).
#[tauri::command]
pub fn account_lock(state: State<AccountState>) {
    *state.session.lock().unwrap() = None;
}

/// New name and/or password for the unlocked account, after proving its current password.
#[tauri::command(async)]
pub fn account_change(app: AppHandle, state: State<AccountState>, password: String, new_user: String, new_password: String) -> Result<(), String> {
    throttle(&state);
    let mut all = load(&app)?;
    let id = state.session().ok_or("locked")?;
    let i = all.accounts.iter().position(|a| a.id == id).ok_or("no account")?;
    let ok = check(&all.accounts[i], &all.accounts[i].user.clone(), &password);
    record(&state, ok);
    if !ok {
        return Err("wrong password".into());
    }
    validate(&new_user, &new_password)?;
    if all.accounts.iter().enumerate().any(|(j, a)| j != i && norm(&a.user) == norm(&new_user)) {
        return Err("there's already an account with that name".into());
    }
    all.accounts[i].user = new_user.trim().to_string();
    all.accounts[i].hash = hash(&new_password)?;
    save(&app, &all)
}

/// Delete the unlocked account and its settings (its vault, a folder of notes, stays), after proving its password.
#[tauri::command(async)]
pub fn account_remove(app: AppHandle, state: State<AccountState>, password: String) -> Result<(), String> {
    throttle(&state);
    let mut all = load(&app)?;
    let id = state.session().ok_or("locked")?;
    let i = all.accounts.iter().position(|a| a.id == id).ok_or("no account")?;
    let ok = check(&all.accounts[i], &all.accounts[i].user.clone(), &password);
    record(&state, ok);
    if !ok {
        return Err("wrong password".into());
    }
    all.accounts.remove(i);
    save(&app, &all)?;
    let _ = fs::remove_dir_all(config_dir(&app)?.join("users").join(&id));
    *state.session.lock().unwrap() = None;
    Ok(())
}

fn validate(user: &str, password: &str) -> Result<(), String> {
    if user.trim().is_empty() || user.trim().chars().count() > 64 {
        return Err("the account name must be 1–64 characters".into());
    }
    if password.chars().count() < 8 {
        return Err("the password must be at least 8 characters".into());
    }
    if password.len() > 1024 {
        return Err("that password is too long".into());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hash_roundtrip_and_never_plain() {
        let h = hash("correct horse battery").unwrap();
        assert!(h.starts_with("$argon2id$"));
        assert!(!h.contains("correct horse"));
        let acc = Account { id: "neo".into(), user: "Neo".into(), hash: h, created: 0 };
        assert!(check(&acc, " neo ", "correct horse battery"));
        assert!(!check(&acc, "neo", "correct horse batterY"));
        assert!(!check(&acc, "trinity", "correct horse battery"));
    }

    #[test]
    fn ids_are_folder_safe_and_unique() {
        assert_eq!(slug("Neo Anderson", &[]), "neo-anderson");
        assert_eq!(slug("neo", &["neo"]), "neo-2");
        assert_eq!(slug("../../etc", &[]), "etc");
        assert_eq!(slug("日本", &[]), "user");
    }

    #[test]
    fn validation() {
        assert!(validate("neo", "short").is_err());
        assert!(validate("  ", "long enough pass").is_err());
        assert!(validate("neo", "long enough pass").is_ok());
    }
}
