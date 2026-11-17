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

/// Google News RSS: top stories for a language/country, or a search (city, topic…).
#[tauri::command]
pub async fn news_rss(query: String, lang: String, country: String) -> Result<String, String> {
    let clean = |s: &str, n: usize| s.chars().filter(|c| c.is_ascii_alphanumeric() || *c == '-').take(n).collect::<String>();
    let (lang, country) = (clean(&lang, 5), clean(&country, 2).to_uppercase());
    let (lang, country) = (if lang.is_empty() { "en".into() } else { lang }, if country.is_empty() { "US".into() } else { country });
    let base = if query.trim().is_empty() {
        "https://news.google.com/rss?".to_string()
    } else {
        format!("https://news.google.com/rss/search?q={}&", encode(query.trim()))
    };
    let url = format!("{base}hl={lang}&gl={country}&ceid={country}:{lang}");
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
