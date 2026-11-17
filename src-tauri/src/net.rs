//! The few network reads the UI can't do itself (no CORS on RSS feeds).
//! The URL is built here from a query, so this can't be used as a generic
//! proxy to arbitrary hosts. Uses the system `curl` (shipped with macOS,
//! Windows 10+ and every Linux) to avoid pulling an HTTP stack into the binary.

use std::process::Command;

fn encode(s: &str) -> String {
    s.bytes()
        .map(|b| match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => (b as char).to_string(),
            _ => format!("%{b:02X}"),
        })
        .collect()
}

/// News RSS: Google News (top stories, or a search) or Bing News (a search,
/// with a short summary per article and the direct link).
#[tauri::command]
pub async fn news_rss(query: String, lang: String, country: String, provider: Option<String>) -> Result<String, String> {
    let clean = |s: &str, n: usize| s.chars().filter(|c| c.is_ascii_alphanumeric() || *c == '-').take(n).collect::<String>();
    let (lang, country) = (clean(&lang, 5), clean(&country, 2).to_uppercase());
    let (lang, country) = (if lang.is_empty() { "en".into() } else { lang }, if country.is_empty() { "US".into() } else { country });
    let bing = provider.as_deref() == Some("bing") && !query.trim().is_empty();
    let base = if bing {
        format!("https://www.bing.com/news/search?q={}&format=rss&", encode(query.trim()))
    } else if query.trim().is_empty() {
        "https://news.google.com/rss?".to_string()
    } else {
        format!("https://news.google.com/rss/search?q={}&", encode(query.trim()))
    };
    let url = if bing {
        format!("{base}setlang={lang}&cc={country}")
    } else {
        format!("{base}hl={lang}&gl={country}&ceid={country}:{lang}")
    };
    tauri::async_runtime::spawn_blocking(move || {
        let mut cmd = Command::new("curl");
        cmd.args(["-sSL", "--max-time", "12", "--proto", "=https", &url]);
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x0800_0000);
        }
        let out = cmd.output().map_err(|e| format!("curl: {e}"))?;
        if !out.status.success() {
            return Err(String::from_utf8_lossy(&out.stderr).trim().to_string());
        }
        Ok(String::from_utf8_lossy(&out.stdout).into_owned())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Open an https link in the default browser (news articles).
#[tauri::command]
pub fn open_url(url: String) -> Result<(), String> {
    if !url.starts_with("https://") || url.chars().any(|c| c.is_whitespace() || c == '"') {
        return Err("only https links".into());
    }
    #[cfg(target_os = "macos")]
    let mut cmd = Command::new("open");
    #[cfg(target_os = "windows")]
    let mut cmd = {
        let mut c = Command::new("rundll32");
        c.arg("url.dll,FileProtocolHandler");
        c
    };
    #[cfg(all(unix, not(target_os = "macos")))]
    let mut cmd = Command::new("xdg-open");
    cmd.arg(&url).spawn().map(|_| ()).map_err(|e| e.to_string())
}
