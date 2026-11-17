//! The deck account: a name + password that unlock the app at start-up.
//!
//! The password is never stored. `account.json` (in the OS config folder,
//! readable by your user only) holds the account name and an Argon2id hash
//! (19 MiB, 2 passes: the OWASP recommendation) with a random salt, as a
//! standard PHC string. The hash never goes back to the UI: the UI can only
//! ask "is this the right password?", and every wrong answer makes the next
//! try wait longer (up to 8 s), so guessing is slow even for a plugin.
//!
//! This locks the deck, it does not encrypt the vault: the notes stay plain
//! Markdown files on disk (that's what keeps them Obsidian-compatible).
//! Forgot the password? Quit the app and delete account.json.

use argon2::password_hash::{rand_core::OsRng, PasswordHash, PasswordHasher, PasswordVerifier, SaltString};
use argon2::Argon2;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager, State};

#[derive(Serialize, Deserialize)]
struct Account {
    user: String,
    /// PHC string: $argon2id$v=19$m=19456,t=2,p=1$<salt>$<hash>
    hash: String,
    created: u64,
}

#[derive(Default)]
pub struct AccountState {
    fails: Mutex<u32>,
}

fn path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("account.json"))
}

fn load(app: &AppHandle) -> Result<Option<Account>, String> {
    match fs::read_to_string(path(app)?) {
        Ok(s) => serde_json::from_str(&s).map(Some).map_err(|e| format!("account.json is damaged: {e}")),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

fn save(app: &AppHandle, acc: &Account) -> Result<(), String> {
    let p = path(app)?;
    let json = serde_json::to_string_pretty(acc).map_err(|e| e.to_string())?;
    fs::write(&p, json).map_err(|e| e.to_string())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = fs::set_permissions(&p, fs::Permissions::from_mode(0o600));
    }
    Ok(())
}

fn norm(user: &str) -> String {
    user.trim().to_lowercase()
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

/// The account name, if an account exists.
#[tauri::command]
pub fn account_status(app: AppHandle) -> Result<Option<String>, String> {
    Ok(load(&app)?.map(|a| a.user))
}

/// Create the account (only when there is none: changing it needs the old password).
#[tauri::command(async)]
pub fn account_create(app: AppHandle, user: String, password: String) -> Result<(), String> {
    if load(&app)?.is_some() {
        return Err("an account already exists".into());
    }
    validate(&user, &password)?;
    let created = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
    save(&app, &Account { user: user.trim().to_string(), hash: hash(&password)?, created })
}

#[tauri::command(async)]
pub fn account_verify(app: AppHandle, state: State<AccountState>, user: String, password: String) -> Result<bool, String> {
    throttle(&state);
    let Some(acc) = load(&app)? else { return Ok(true) };
    let ok = check(&acc, &user, &password);
    record(&state, ok);
    Ok(ok)
}

/// New name and/or password, after proving the current password.
#[tauri::command(async)]
pub fn account_change(app: AppHandle, state: State<AccountState>, password: String, new_user: String, new_password: String) -> Result<(), String> {
    throttle(&state);
    let acc = load(&app)?.ok_or("no account")?;
    let ok = check(&acc, &acc.user, &password);
    record(&state, ok);
    if !ok {
        return Err("wrong password".into());
    }
    validate(&new_user, &new_password)?;
    save(&app, &Account { user: new_user.trim().to_string(), hash: hash(&new_password)?, created: acc.created })
}

/// Remove the lock, after proving the current password.
#[tauri::command(async)]
pub fn account_remove(app: AppHandle, state: State<AccountState>, password: String) -> Result<(), String> {
    throttle(&state);
    let acc = load(&app)?.ok_or("no account")?;
    let ok = check(&acc, &acc.user, &password);
    record(&state, ok);
    if !ok {
        return Err("wrong password".into());
    }
    fs::remove_file(path(&app)?).map_err(|e| e.to_string())
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
        let acc = Account { user: "Neo".into(), hash: h, created: 0 };
        assert!(check(&acc, " neo ", "correct horse battery"));
        assert!(!check(&acc, "neo", "correct horse batterY"));
        assert!(!check(&acc, "trinity", "correct horse battery"));
    }

    #[test]
    fn validation() {
        assert!(validate("neo", "short").is_err());
        assert!(validate("  ", "long enough pass").is_err());
        assert!(validate("neo", "long enough pass").is_ok());
    }
}
