//! Quitting goes through the page first (⌘Q, the window's close button, the Dock's Quit,
//! alt+F4): it saves the layout and the settings, lets a page ask "save?", then calls
//! `app_quit` itself (deck.ts quit). Before 0.6.3 the app closed at once and what had
//! changed in the last moments (the tabs, the frames) never reached the disk.
//!
//! A page that doesn't answer never keeps the app open: asked again within a few
//! seconds, it quits anyway.

use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

/// when the page was last asked (ms since 1970; 0 = not asked, or it answered)
static ASKED: AtomicU64 = AtomicU64::new(0);
/// asked again within this time: the page is stuck, quit anyway
const STUCK_MS: u64 = 4000;

fn now_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

/// Should a quit asked at `now` (the page last asked at `last`) go ahead at once?
fn quit_now(last: u64, now: u64) -> bool {
    last != 0 && now.saturating_sub(last) < STUCK_MS
}

/// A quit was asked (not by the page itself): true = let it happen now, false = the page
/// was told ("quit-requested") and quits when it's ready.
pub fn ask_page<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> bool {
    let now = now_ms();
    if quit_now(ASKED.swap(now, Ordering::SeqCst), now) {
        return true;
    }
    tauri::Emitter::emit(app, "quit-requested", ()).is_err()
}

/// The page kept the app open ("save?" → cancel): the next close asks it again.
#[tauri::command]
pub fn app_quit_cancelled() {
    ASKED.store(0, Ordering::SeqCst);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_first_ask_goes_to_the_page() {
        assert!(!quit_now(0, 10_000));
    }

    #[test]
    fn asked_again_quickly_quits_anyway() {
        assert!(quit_now(10_000, 11_000));
    }

    #[test]
    fn asked_again_much_later_asks_the_page_again() {
        assert!(!quit_now(10_000, 10_000 + STUCK_MS));
    }
}
