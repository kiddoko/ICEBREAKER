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
        cmd.args(["-q", "-g", "-sSL", "--max-time", "12", "--max-filesize", "8388608", "--proto", "=https", "--", &url]);
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

/// The STORE reads module/theme indexes and files from any https host (GitHub,
/// your own server) — and from plain http only on your local network (a NAS, a
/// home server). Text only, 4 MB at most.
#[tauri::command]
pub async fn net_get(url: String) -> Result<String, String> {
    let u = url.trim().to_string();
    // the host as curl will read it: what's between "://" and the first / ? or #, a port
    // dropped. An address with "user@" in it is refused ("http://10.0.0.1@evil.example" is
    // evil.example), and a local address is four numbers, not a name that starts like one.
    let authority = u.split("://").nth(1).unwrap_or("").split(['/', '?', '#']).next().unwrap_or("");
    let host = authority.rsplit_once(':').filter(|(_, p)| p.bytes().all(|b| b.is_ascii_digit())).map(|(h, _)| h).unwrap_or(authority).to_lowercase();
    let ip: Vec<u8> = host.split('.').filter_map(|x| x.parse::<u8>().ok()).collect();
    let is_ip = ip.len() == 4 && host.split('.').count() == 4;
    let local = host == "localhost"
        || host.ends_with(".local")
        || host.ends_with(".lan")
        || (is_ip && (ip[0] == 127 || ip[0] == 10 || (ip[0] == 192 && ip[1] == 168) || (ip[0] == 172 && (16..=31).contains(&ip[1]))));
    let odd = authority.is_empty() || authority.contains('@') || authority.contains('\\') || u.chars().any(|c| c.is_whitespace() || c.is_control() || matches!(c, '"' | '{' | '}' | '[' | ']'));
    if odd || !(u.starts_with("https://") || (u.starts_with("http://") && local)) {
        return Err("only https:// (or http:// on your local network)".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let mut cmd = Command::new("curl");
        // a redirect may only go to https (never from an https address to your network or your machine)
        // -q: your ~/.curlrc isn't read · -g: no {a,b} / [1-9] expansion of the address
        cmd.args(["-q", "-g", "-sSLf", "--max-time", "30", "--max-filesize", "4194304", "--max-redirs", "5", "--proto", "=https,http", "--proto-redir", "=https", "--", &u]);
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x0800_0000);
        }
        let out = cmd.output().map_err(|e| format!("curl: {e}"))?;
        if !out.status.success() {
            return Err(format!("{u}: {}", String::from_utf8_lossy(&out.stderr).trim()));
        }
        // --max-filesize only works when the server says the size first: counted again here
        if out.stdout.len() > 4 * 1024 * 1024 {
            return Err(format!("{u}: larger than 4 MB"));
        }
        String::from_utf8(out.stdout).map_err(|_| format!("{u}: not text"))
    })
    .await
    .map_err(|e| e.to_string())?
}
