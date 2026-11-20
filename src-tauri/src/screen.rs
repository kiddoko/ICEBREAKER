//! Full screen that uses the whole display.
//!
//! macOS's own full screen (the green button, ⌃⌘F) puts the window in its own
//! Space and, on a MacBook with a notch, keeps it under the camera: a black band
//! across the top, and the app doesn't get the screen's real 16:10. The deck's
//! full screen (F11, `fullscreen`) is the "simple" kind instead: the window
//! covers the whole display, menu bar and Dock hidden. `screen_notch` tells the
//! interface how tall the camera housing is, so nothing important sits under it.
//! Elsewhere (Windows, Linux) it's the ordinary full screen and there's no notch.

/// Turn the deck's full screen on or off.
#[tauri::command]
pub fn screen_fullscreen(window: tauri::WebviewWindow, on: bool) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        // already in macOS's own full screen (green button): leave that one first
        if window.is_fullscreen().unwrap_or(false) {
            window.set_fullscreen(false).map_err(|e| e.to_string())?;
            if on {
                return Ok(());
            }
        }
        window.set_simple_fullscreen(on).map_err(|e| e.to_string())
    }
    #[cfg(not(target_os = "macos"))]
    {
        window.set_fullscreen(on).map_err(|e| e.to_string())
    }
}

/// Is the deck in its full screen (or the system's)?
#[tauri::command]
pub fn screen_is_fullscreen(window: tauri::WebviewWindow) -> bool {
    if window.is_fullscreen().unwrap_or(false) {
        return true;
    }
    #[cfg(target_os = "macos")]
    {
        // simple full screen: the window is exactly the screen's size
        if let (Ok(Some(m)), Ok(size), Ok(pos)) = (window.current_monitor(), window.outer_size(), window.outer_position()) {
            let ms = m.size();
            let mp = m.position();
            return size.width == ms.width && size.height == ms.height && pos.x == mp.x && pos.y == mp.y;
        }
    }
    false
}

/// How tall the camera housing (the notch) of the window's screen is, in points; 0 without one.
#[tauri::command]
pub fn screen_notch(window: tauri::WebviewWindow) -> f64 {
    #[cfg(target_os = "macos")]
    {
        notch_of(&window).unwrap_or(0.0)
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = window;
        0.0
    }
}

#[cfg(target_os = "macos")]
fn notch_of(window: &tauri::WebviewWindow) -> Option<f64> {
    use objc2::encode::{Encode, Encoding};
    use objc2::runtime::{AnyObject, Bool};
    use objc2::{msg_send, sel};

    #[repr(C)]
    #[derive(Clone, Copy)]
    struct NSEdgeInsets {
        top: f64,
        left: f64,
        bottom: f64,
        right: f64,
    }
    unsafe impl Encode for NSEdgeInsets {
        const ENCODING: Encoding = Encoding::Struct("NSEdgeInsets", &[f64::ENCODING, f64::ENCODING, f64::ENCODING, f64::ENCODING]);
    }

    #[repr(C)]
    #[derive(Clone, Copy)]
    struct CGPoint {
        x: f64,
        y: f64,
    }
    #[repr(C)]
    #[derive(Clone, Copy)]
    struct CGSize {
        width: f64,
        height: f64,
    }
    #[repr(C)]
    #[derive(Clone, Copy)]
    struct CGRect {
        origin: CGPoint,
        size: CGSize,
    }
    unsafe impl Encode for CGPoint {
        const ENCODING: Encoding = Encoding::Struct("CGPoint", &[f64::ENCODING, f64::ENCODING]);
    }
    unsafe impl Encode for CGSize {
        const ENCODING: Encoding = Encoding::Struct("CGSize", &[f64::ENCODING, f64::ENCODING]);
    }
    unsafe impl Encode for CGRect {
        const ENCODING: Encoding = Encoding::Struct("CGRect", &[CGPoint::ENCODING, CGSize::ENCODING]);
    }

    let ns = window.ns_window().ok()? as *mut AnyObject;
    if ns.is_null() {
        return None;
    }
    unsafe {
        let screen: *mut AnyObject = msg_send![&*ns, screen];
        if screen.is_null() {
            return None;
        }
        // safeAreaInsets: macOS 12 and later
        let has: Bool = msg_send![&*screen, respondsToSelector: sel!(safeAreaInsets)];
        if !has.as_bool() {
            return None;
        }
        let insets: NSEdgeInsets = msg_send![&*screen, safeAreaInsets];
        // only when the window really covers the top of the screen (the deck's full
        // screen): macOS's own keeps the window under the camera, nothing hides there
        let win: CGRect = msg_send![&*ns, frame];
        let scr: CGRect = msg_send![&*screen, frame];
        let covers_top = (win.origin.y + win.size.height) >= (scr.origin.y + scr.size.height) - 0.5;
        Some(if covers_top { insets.top.max(0.0) } else { 0.0 })
    }
}
