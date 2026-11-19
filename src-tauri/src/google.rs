//! Google account (for the CALENDAR module): OAuth 2.0 for desktop apps.
//!
//! - Official builds carry ICEBREAKER's own OAuth client (baked in by build.rs
//!   from the git-ignored google-client.json). Anyone can still use their own
//!   client instead (`google_setup`), and builds without one require it.
//! - `google_connect` opens Google's consent page in your browser and waits for
//!   it to come back on http://127.0.0.1:<random port> (loopback + PKCE).
//! - The refresh token stays here, in the app config dir (google.json, never in
//!   the vault). The UI never sees it: it calls `google_calendar`, which only
//!   reaches https://www.googleapis.com/calendar/v3/ with a fresh access token.
//! - HTTP goes through the system `curl` (like net.rs). Secrets are passed on
//!   curl's stdin (`-K -`), never on its command line.

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::io::Write;
use std::process::{Command, Stdio};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager, State};

const SCOPES: &str = "https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/calendar.events";

#[derive(Default, Serialize, Deserialize, Clone)]
struct Creds {
    client_id: String,
    client_secret: String,
    #[serde(default)]
    refresh_token: Option<String>,
}

/// ICEBREAKER's client, when this build has one (see build.rs).
fn builtin() -> Option<(String, String)> {
    match (option_env!("IB_GOOGLE_CLIENT_ID"), option_env!("IB_GOOGLE_CLIENT_SECRET")) {
        (Some(id), Some(secret)) => Some((id.to_string(), secret.to_string())),
        _ => None,
    }
}

impl Creds {
    /// Your own client if you saved one, else the built-in one.
    fn client(&self) -> Result<(String, String), String> {
        if !self.client_id.is_empty() {
            return Ok((self.client_id.clone(), self.client_secret.clone()));
        }
        builtin().ok_or_else(|| "google: this build has no ICEBREAKER client — use your own: cal google setup (see man cal)".to_string())
    }
}

#[derive(Default)]
pub struct GoogleState {
    token: Mutex<Option<(String, Instant)>>,
}

#[derive(Serialize)]
pub struct GoogleStatus {
    /// an OAuth client is available (yours or the built-in one)
    configured: bool,
    /// you saved your own client (instead of ICEBREAKER's)
    custom: bool,
    /// we hold a refresh token
    connected: bool,
}

/// Each account has its own Google connection (users/<id>/google.json): only while it's unlocked.
fn creds_path(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    use tauri::Manager;
    let id = app.state::<crate::account::AccountState>().session().ok_or("locked: log in first")?;
    let dir = crate::account::user_dir(app, &id)?;
    // a Google connection from before accounts goes to the first account that uses it
    let root = app.path().app_config_dir().map_err(|e| e.to_string())?;
    for name in ["google.json", "google-cache.json"] {
        if root.join(name).exists() && !dir.join(name).exists() {
            let _ = std::fs::rename(root.join(name), dir.join(name));
        }
    }
    Ok(dir.join("google.json"))
}

fn load(app: &AppHandle) -> Result<Option<Creds>, String> {
    match std::fs::read_to_string(creds_path(app)?) {
        Ok(s) => serde_json::from_str(&s).map(Some).map_err(|e| e.to_string()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

fn save(app: &AppHandle, c: &Creds) -> Result<(), String> {
    let path = creds_path(app)?;
    std::fs::write(&path, serde_json::to_string_pretty(c).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600));
    }
    Ok(())
}

/// A string for curl's config syntax: "…" with \ and " escaped.
fn q(s: &str) -> String {
    let mut out = String::from("\"");
    for ch in s.chars() {
        match ch {
            '\\' => out.push_str("\\\\"),
            '"' => out.push_str("\\\""),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            c => out.push(c),
        }
    }
    out.push('"');
    out
}

fn enc(s: &str) -> String {
    s.bytes()
        .map(|b| match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => (b as char).to_string(),
            _ => format!("%{b:02X}"),
        })
        .collect()
}

/// Runs curl with a config fed on stdin. Returns (HTTP status, body).
fn curl(config: String) -> Result<(u16, String), String> {
    let mut cmd = Command::new("curl");
    cmd.args(["-sS", "--max-time", "20", "--proto", "=https", "-K", "-", "-w", "\n%{http_code}"]);
    cmd.stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000);
    }
    let mut child = cmd.spawn().map_err(|e| format!("curl: {e}"))?;
    child.stdin.take().unwrap().write_all(config.as_bytes()).map_err(|e| e.to_string())?;
    let out = child.wait_with_output().map_err(|e| e.to_string())?;
    if !out.status.success() {
        return Err(format!("network: {}", String::from_utf8_lossy(&out.stderr).trim()));
    }
    let text = String::from_utf8_lossy(&out.stdout).into_owned();
    let (body, code) = text.rsplit_once('\n').unwrap_or(("", &text));
    Ok((code.trim().parse().unwrap_or(0), body.to_string()))
}

fn google_error(body: &str) -> String {
    let v: serde_json::Value = serde_json::from_str(body).unwrap_or_default();
    v["error_description"].as_str()
        .or(v["error"]["message"].as_str())
        .or(v["error"].as_str())
        .unwrap_or(body)
        .chars()
        .take(300)
        .collect()
}

/// Exchange a code or a refresh token at Google's token endpoint.
fn token_request(fields: &[(&str, &str)]) -> Result<serde_json::Value, String> {
    let mut cfg = String::from("url = \"https://oauth2.googleapis.com/token\"\n");
    for (k, v) in fields {
        cfg.push_str(&format!("data-urlencode = {}\n", q(&format!("{k}={v}"))));
    }
    let (code, body) = curl(cfg)?;
    if code != 200 {
        return Err(format!("google: {}", google_error(&body)));
    }
    serde_json::from_str(&body).map_err(|e| e.to_string())
}

fn access_token(app: &AppHandle, state: &GoogleState, force: bool) -> Result<String, String> {
    if !force {
        if let Some((t, until)) = state.token.lock().unwrap().as_ref() {
            if Instant::now() < *until {
                return Ok(t.clone());
            }
        }
    }
    let c = load(app)?.ok_or("google: not connected (cal google connect)")?;
    let rt = c.refresh_token.clone().ok_or("google: not connected (cal google connect)")?;
    let (id, secret) = c.client()?;
    let v = token_request(&[("client_id", &id), ("client_secret", &secret), ("refresh_token", &rt), ("grant_type", "refresh_token")])
        .map_err(|e| if e.contains("invalid_grant") || e.contains("expired") || e.contains("revoked") { "google: access was revoked or expired — run: cal google connect".to_string() } else { e })?;
    let t = v["access_token"].as_str().ok_or("google: no access token")?.to_string();
    let ttl = v["expires_in"].as_u64().unwrap_or(3600).saturating_sub(120);
    *state.token.lock().unwrap() = Some((t.clone(), Instant::now() + Duration::from_secs(ttl)));
    Ok(t)
}

#[tauri::command]
pub fn google_status(app: AppHandle) -> Result<GoogleStatus, String> {
    let c = load(&app)?.unwrap_or_default();
    Ok(GoogleStatus { configured: c.client().is_ok(), custom: !c.client_id.is_empty(), connected: c.refresh_token.is_some() })
}

#[tauri::command]
pub fn google_setup(app: AppHandle, state: State<GoogleState>, client_id: String, client_secret: String) -> Result<(), String> {
    let (id, secret) = (client_id.trim().to_string(), client_secret.trim().to_string());
    *state.token.lock().unwrap() = None;
    if id.is_empty() {
        // back to ICEBREAKER's client (you sign in again)
        return save(&app, &Creds::default());
    }
    if !id.ends_with(".apps.googleusercontent.com") {
        return Err("that doesn't look like an OAuth client ID (…apps.googleusercontent.com)".into());
    }
    if secret.is_empty() {
        return Err("the client secret is empty".into());
    }
    *state.token.lock().unwrap() = None;
    save(&app, &Creds { client_id: id, client_secret: secret, refresh_token: None })
}

/// Browser consent → loopback redirect → refresh token. Waits up to 5 minutes.
#[tauri::command]
pub async fn google_connect(app: AppHandle) -> Result<(), String> {
    let c = load(&app)?.unwrap_or_default();
    let (client_id, client_secret) = c.client()?;
    let app2 = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let mut rnd = [0u8; 64];
        getrandom::getrandom(&mut rnd).map_err(|e| e.to_string())?;
        let verifier: String = rnd.iter().map(|b| b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~"[(*b as usize) % 66] as char).collect();
        let challenge = b64url(&Sha256::digest(verifier.as_bytes()));
        let st: String = verifier.chars().rev().take(24).collect();

        let server = tiny_http::Server::http("127.0.0.1:0").map_err(|e| e.to_string())?;
        let port = server.server_addr().to_ip().map(|a| a.port()).ok_or("no port")?;
        let redirect = format!("http://127.0.0.1:{port}");
        let url = format!(
            "https://accounts.google.com/o/oauth2/v2/auth?client_id={}&redirect_uri={}&response_type=code&scope={}&code_challenge={}&code_challenge_method=S256&access_type=offline&prompt=consent&state={}",
            enc(&client_id), enc(&redirect), enc(SCOPES), challenge, enc(&st)
        );
        crate::net::open_url(url)?;

        let deadline = Instant::now() + Duration::from_secs(300);
        let code = loop {
            let left = deadline.checked_duration_since(Instant::now()).ok_or("google: no answer from the browser after 5 minutes")?;
            let Some(req) = server.recv_timeout(left).map_err(|e| e.to_string())? else { continue };
            let query = req.url().split_once('?').map(|(_, q)| q.to_string()).unwrap_or_default();
            let get = |k: &str| query.split('&').find_map(|kv| kv.strip_prefix(&format!("{k}="))).map(|v| v.to_string());
            if get("code").is_none() && get("error").is_none() {
                let _ = req.respond(tiny_http::Response::empty(404)); // favicon…
                continue;
            }
            let ok = get("code").is_some() && get("state").as_deref() == Some(st.as_str());
            let page = format!(
                "<!doctype html><meta charset=utf-8><title>ICEBREAKER</title><body style=\"background:#0b0b12;color:#cdd6f4;font:16px monospace;display:grid;place-items:center;height:90vh\"><div>{}</div>",
                if ok { "◆ ICEBREAKER is linked to your Google calendar.<br><br>You can close this tab." } else { "✕ Google didn't give access. Back in ICEBREAKER: cal google connect" }
            );
            let header = tiny_http::Header::from_bytes("Content-Type", "text/html; charset=utf-8").unwrap();
            let _ = req.respond(tiny_http::Response::from_string(page).with_header(header));
            if !ok {
                return Err(format!("google: {}", get("error").unwrap_or_else(|| "state mismatch".into())));
            }
            break get("code").unwrap();
        };
        let code = percent_decode(&code);
        let v = token_request(&[
            ("client_id", &client_id),
            ("client_secret", &client_secret),
            ("code", &code),
            ("code_verifier", &verifier),
            ("redirect_uri", &redirect),
            ("grant_type", "authorization_code"),
        ])?;
        let rt = v["refresh_token"].as_str().ok_or("google: no refresh token in the answer")?.to_string();
        let mut c2 = c.clone();
        c2.refresh_token = Some(rt);
        save(&app2, &c2)?;
        if let (Some(t), Some(state)) = (v["access_token"].as_str(), app2.try_state::<GoogleState>()) {
            let ttl = v["expires_in"].as_u64().unwrap_or(3600).saturating_sub(120);
            *state.token.lock().unwrap() = Some((t.to_string(), Instant::now() + Duration::from_secs(ttl)));
        }
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// The CALENDAR module's offline copy of your Google calendars. It lives in the
/// app config dir, NOT in the vault, so nothing that reads the vault (the AI
/// assistant, sync tools) ever sees Google data. `content` = None reads it.
#[tauri::command]
pub fn google_cache(app: AppHandle, content: Option<String>) -> Result<Option<String>, String> {
    let path = creds_path(&app)?.with_file_name("google-cache.json");
    match content {
        Some(c) => {
            std::fs::write(&path, c).map_err(|e| e.to_string())?;
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                let _ = std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600));
            }
            Ok(None)
        }
        None => match std::fs::read_to_string(&path) {
            Ok(s) => Ok(Some(s)),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
            Err(e) => Err(e.to_string()),
        },
    }
}

/// Revoke access at Google, forget the token and delete the cache (the OAuth client stays).
#[tauri::command]
pub async fn google_disconnect(app: AppHandle, state: State<'_, GoogleState>) -> Result<(), String> {
    *state.token.lock().unwrap() = None;
    let _ = std::fs::remove_file(creds_path(&app)?.with_file_name("google-cache.json"));
    let Some(mut c) = load(&app)? else { return Ok(()) };
    if let Some(rt) = c.refresh_token.take() {
        let cfg = format!("url = \"https://oauth2.googleapis.com/revoke\"\ndata-urlencode = {}\n", q(&format!("token={rt}")));
        let _ = tauri::async_runtime::spawn_blocking(move || curl(cfg)).await;
    }
    save(&app, &c)
}

/// One Calendar API call: `path` is under /calendar/v3/ (e.g. "users/me/calendarList").
#[tauri::command]
pub async fn google_calendar(app: AppHandle, method: String, path: String, query: Option<String>, body: Option<String>) -> Result<String, String> {
    let method = method.to_uppercase();
    if !["GET", "POST", "PATCH", "PUT", "DELETE"].contains(&method.as_str()) {
        return Err("bad method".into());
    }
    let safe = |s: &str| s.chars().all(|c| c.is_ascii_alphanumeric() || "/_-.%@~".contains(c));
    let query = query.unwrap_or_default();
    if !safe(&path) || path.contains("..") || query.chars().any(|c| c.is_whitespace() || c == '"' || c == '#') {
        return Err("bad path".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<GoogleState>();
        let url = format!("https://www.googleapis.com/calendar/v3/{path}{}{query}", if query.is_empty() { "" } else { "?" });
        let call = |token: &str| {
            let mut cfg = format!("url = {}\nrequest = {}\nheader = {}\n", q(&url), q(&method), q(&format!("Authorization: Bearer {token}")));
            if let Some(b) = &body {
                cfg.push_str(&format!("header = \"Content-Type: application/json\"\ndata-binary = {}\n", q(b)));
            }
            curl(cfg)
        };
        let mut res = call(&access_token(&app, &state, false)?)?;
        if res.0 == 401 {
            res = call(&access_token(&app, &state, true)?)?;
        }
        match res.0 {
            200..=299 => Ok(res.1),
            code => Err(format!("google ({code}): {}", google_error(&res.1))),
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

fn b64url(bytes: &[u8]) -> String {
    const A: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    let mut out = String::new();
    for chunk in bytes.chunks(3) {
        let n = chunk.iter().enumerate().fold(0u32, |n, (i, b)| n | (*b as u32) << (16 - 8 * i));
        for i in 0..=chunk.len() {
            out.push(A[((n >> (18 - 6 * i)) & 63) as usize] as char);
        }
    }
    out
}

fn percent_decode(s: &str) -> String {
    let b = s.as_bytes();
    let mut out = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        if b[i] == b'%' && i + 2 < b.len() {
            if let Ok(v) = u8::from_str_radix(&s[i + 1..i + 3], 16) {
                out.push(v);
                i += 3;
                continue;
            }
        }
        out.push(if b[i] == b'+' { b' ' } else { b[i] });
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}
