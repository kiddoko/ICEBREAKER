//! The wait after a wrong password, counted per account (its name, folded).
//!
//! Each wrong password makes that account's next try wait longer: 0.25 s, 0.5 s,
//! 1 s … 8 s at most, counted from the moment of the failure (time spent typing
//! counts: a right password typed 8 s later doesn't wait at all). A right password
//! — a login, the recovery key, a vault password — puts that account back to 0.
//! Other accounts never wait for it. The counts survive a restart (`login-delay`
//! in the app's config folder: the accounts' names folded, counts and times, nothing
//! else — account.rs counts every name that isn't an account under one key, "").

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

/// The longest wait (ms).
pub const MAX_MS: u64 = 8000;

#[derive(Default, Clone, Copy, PartialEq, Debug, serde::Serialize, serde::Deserialize)]
pub struct Entry {
    pub fails: u32,
    /// when the last wrong password was given (ms since 1970)
    pub at: u64,
}

#[derive(Default)]
pub struct Delays {
    map: BTreeMap<String, Entry>,
    file: Option<PathBuf>,
}

pub fn now_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

/// How long after the `fails`-th wrong password the next try waits (ms).
pub fn wait_for(fails: u32) -> u64 {
    if fails == 0 { 0 } else { (250u64 << (fails - 1).min(5)).min(MAX_MS) }
}

impl Delays {
    /// The counts kept in `file` (an older single number, or anything unreadable: none).
    pub fn load(file: &Path) -> Delays {
        let map = std::fs::read_to_string(file).ok().and_then(|t| serde_json::from_str::<BTreeMap<String, Entry>>(&t).ok()).unwrap_or_default();
        Delays { map, file: Some(file.to_path_buf()) }
    }

    /// Keeps only the keys `keep` says yes to (saved at once).
    pub fn retain(&mut self, keep: impl Fn(&str) -> bool) {
        let before = self.map.len();
        self.map.retain(|k, _| keep(k));
        if self.map.len() != before {
            self.save();
        }
    }

    fn save(&self) {
        if let Some(p) = &self.file {
            let _ = crate::crypto::write_private(p, serde_json::to_string(&self.map).unwrap_or_default().as_bytes());
        }
    }

    /// What is left to wait for `key` at `now` (ms).
    pub fn remaining(&self, key: &str, now: u64) -> u64 {
        self.map.get(key).map(|e| wait_for(e.fails).saturating_sub(now.saturating_sub(e.at))).unwrap_or(0).min(MAX_MS)
    }

    /// A try for `key` gave this answer at `now`.
    pub fn record(&mut self, key: &str, ok: bool, now: u64) {
        if ok {
            if self.map.remove(key).is_none() {
                return;
            }
        } else {
            let e = self.map.entry(key.to_string()).or_default();
            e.fails = e.fails.saturating_add(1).min(32);
            e.at = now;
        }
        // a day without trying: forgotten (the file doesn't grow with every name ever typed)
        self.map.retain(|_, e| now.saturating_sub(e.at) < 24 * 3600 * 1000);
        self.save();
    }
}

/// Sleep what's left for `key` (the lock on `d` is not held while sleeping).
pub fn wait(d: &std::sync::Mutex<Delays>, key: &str) {
    let ms = d.lock().map(|g| g.remaining(key, now_ms())).unwrap_or(0);
    if ms > 0 {
        std::thread::sleep(Duration::from_millis(ms));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn each_account_waits_for_its_own_failures_only() {
        let mut d = Delays::default();
        for _ in 0..8 {
            d.record("test2", false, 1000);
        }
        assert_eq!(d.remaining("test2", 1000), MAX_MS);
        // another account doesn't wait
        assert_eq!(d.remaining("kiddko", 1000), 0);
        // the time typing counts: 3 s later, 5 s are left; 8 s later, none
        assert_eq!(d.remaining("test2", 4000), 5000);
        assert_eq!(d.remaining("test2", 9000), 0);
    }

    #[test]
    fn a_right_password_resets_it() {
        let mut d = Delays::default();
        d.record("test2", false, 0);
        d.record("test2", false, 0);
        assert_eq!(d.remaining("test2", 0), 500);
        d.record("test2", true, 0);
        assert_eq!(d.remaining("test2", 0), 0);
        d.record("test2", false, 0);
        assert_eq!(d.remaining("test2", 0), 250);
    }

    #[test]
    fn retain_drops_what_isnt_kept_and_saves() {
        let dir = std::env::temp_dir().join(format!("ib-delay-r-{}", now_ms()));
        std::fs::create_dir_all(&dir).unwrap();
        let f = dir.join("login-delay");
        let mut d = Delays::load(&f);
        for k in ["test2", "nobody", "nobody2", ""] {
            d.record(k, false, now_ms());
        }
        d.retain(|k| k.is_empty() || k == "test2");
        let text = std::fs::read_to_string(&f).unwrap();
        assert!(text.contains("test2") && !text.contains("nobody"), "{text}");
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn it_grows_then_stops_at_8_s_and_survives_a_restart() {
        assert_eq!((1..=7).map(wait_for).collect::<Vec<_>>(), vec![250, 500, 1000, 2000, 4000, 8000, 8000]);
        let dir = std::env::temp_dir().join(format!("ib-delay-{}", now_ms()));
        std::fs::create_dir_all(&dir).unwrap();
        let f = dir.join("login-delay");
        // the old format (one number for the whole deck) is dropped
        std::fs::write(&f, "8").unwrap();
        let mut d = Delays::load(&f);
        assert_eq!(d.remaining("test2", now_ms()), 0);
        let now = now_ms();
        d.record("test2", false, now);
        d.record("test2", false, now);
        assert_eq!(Delays::load(&f).remaining("test2", now), 500);
        std::fs::remove_dir_all(dir).unwrap();
    }
}
