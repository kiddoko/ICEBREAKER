//! The system terminal inside ICEBREAKER, and the bridge that gives it
//! ICEBREAKER's commands.
//!
//! PTY: your login shell (zsh / bash; PowerShell on Windows) runs in a real
//! pseudo-terminal, in the vault folder. Bytes go to the UI through a Channel
//! (decoded as UTF-8 without splitting characters); keys come back with
//! `pty_write`.
//!
//! Bridge: a tiny HTTP server on 127.0.0.1 (random port, random token, both
//! only given to the shells we start). The shells get a `command_not_found`
//! hook and an `ib` function: an unknown command like `todo add "pain"` is
//! POSTed here, the UI runs it with ibsh and streams the output back. Your own
//! ~/.zshrc / ~/.bashrc are loaded first and never modified.

use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use serde::Serialize;
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::mpsc::{channel, Receiver, Sender};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::ipc::Channel;
use tauri::{AppHandle, Emitter, Manager, State};

use crate::vault::{vault_root, VaultState};

// ── PTY ────────────────────────────────────────────────────────────────────

struct Session {
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    child: Box<dyn Child + Send + Sync>,
}

#[derive(Default)]
pub struct PtyState {
    sessions: Mutex<HashMap<String, Session>>,
}

/// Sent after the shell exits (an OSC sequence terminals ignore).
const EXIT_MARK: &str = "\u{1b}]ib-exit\u{7}";

fn default_shell() -> String {
    #[cfg(windows)]
    return "powershell.exe".into();
    #[cfg(not(windows))]
    std::env::var("SHELL").ok().filter(|s| !s.is_empty()).unwrap_or_else(|| if cfg!(target_os = "macos") { "/bin/zsh".into() } else { "/bin/bash".into() })
}

/// Write the rc files that load the user's config, then add our hook.
fn shell_init(app: &AppHandle, shell: &str, cmd: &mut CommandBuilder) -> Result<(), String> {
    let dir = app.path().app_cache_dir().map_err(|e| e.to_string())?.join("shell");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let name = std::path::Path::new(shell).file_name().map(|s| s.to_string_lossy().into_owned()).unwrap_or_default();
    // the hook, shared by zsh and bash
    let hook = r#"
# ── ICEBREAKER: its commands in your shell (unknown commands are asked to the deck) ──
__ib_run() {
  printf '%s\0' "$@" | command curl -sNf -X POST -H "X-IB-Token: $ICEBREAKER_TOKEN" -H "X-IB-Cwd: $PWD" --data-binary @- "http://127.0.0.1:$ICEBREAKER_PORT/run"
}
ib() { if [ $# -eq 0 ]; then echo "ib <command>: run an ICEBREAKER command (ib help lists them)"; else __ib_run "$@"; fi; }
# module commands win over system programs of the same name (`command cal` still runs macOS's cal)
for __ib_c in $(printf '%s' "$ICEBREAKER_MODULES"); do
  alias "$__ib_c" >/dev/null 2>&1 && continue   # your own aliases stay yours
  eval "$__ib_c() { __ib_run $__ib_c \"\$@\"; }"
done
unset __ib_c
"#;
    if name.contains("zsh") {
        let zd = dir.join("zdotdir");
        std::fs::create_dir_all(&zd).map_err(|e| e.to_string())?;
        let write = |f: &str, body: String| std::fs::write(zd.join(f), body).map_err(|e| e.to_string());
        write(".zshenv", "[ -f \"$HOME/.zshenv\" ] && source \"$HOME/.zshenv\"\n".into())?;
        write(".zprofile", "[ -f \"$HOME/.zprofile\" ] && source \"$HOME/.zprofile\"\n".into())?;
        // after .zshrc, zsh reads .zlogin from $ZDOTDIR: pointing it back at $HOME uses yours
        write(
            ".zshrc",
            format!(
                "ZDOTDIR=\"$HOME\"\n[ -f \"$HOME/.zshrc\" ] && source \"$HOME/.zshrc\"\n{hook}\ncommand_not_found_handler() {{\n  __ib_run \"$@\" && return 0\n  print -u2 \"zsh: command not found: $1\"; return 127\n}}\n"
            ),
        )?;
        cmd.env("ZDOTDIR", zd.to_string_lossy().as_ref());
        cmd.args(["-l", "-i"]);
    } else if name.contains("bash") {
        let rc = dir.join("bashrc");
        std::fs::write(
            &rc,
            format!(
                "for f in \"$HOME/.bash_profile\" \"$HOME/.bashrc\"; do [ -f \"$f\" ] && . \"$f\" && break; done\n{hook}\ncommand_not_found_handle() {{\n  __ib_run \"$@\" && return 0\n  echo \"bash: $1: command not found\" >&2; return 127\n}}\n"
            ),
        )
        .map_err(|e| e.to_string())?;
        cmd.args(["--rcfile", &rc.to_string_lossy(), "-i"]);
    }
    // other shells (fish, PowerShell…) start plain; `ib` comes later for them
    Ok(())
}

/// Start a shell. Returns its name ("zsh", "bash"…).
#[tauri::command]
pub fn pty_spawn(
    app: AppHandle,
    vault: State<VaultState>,
    ptys: State<PtyState>,
    bridge: State<BridgeState>,
    id: String,
    cols: u16,
    rows: u16,
    on_data: Channel<String>,
    modules: Option<Vec<String>>,
) -> Result<String, String> {
    let pair = native_pty_system()
        .openpty(PtySize { rows: rows.max(2), cols: cols.max(10), pixel_width: 0, pixel_height: 0 })
        .map_err(|e| e.to_string())?;
    let shell = default_shell();
    let mut cmd = CommandBuilder::new(&shell);
    if let Ok(root) = vault_root(&vault) {
        cmd.cwd(root);
    }
    cmd.env("TERM", "xterm-256color");
    cmd.env("COLORTERM", "truecolor");
    cmd.env("TERM_PROGRAM", "ICEBREAKER");
    // with an API key in the environment, `claude` would bill it instead of the plan
    cmd.env_remove("ANTHROPIC_API_KEY");
    let (port, token) = bridge.endpoint();
    cmd.env("ICEBREAKER_PORT", port.to_string());
    cmd.env("ICEBREAKER_TOKEN", token);
    let modules: Vec<String> = modules
        .unwrap_or_default()
        .into_iter()
        .filter(|n| !n.is_empty() && n.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-' || c == '_'))
        .collect();
    cmd.env("ICEBREAKER_MODULES", modules.join(" "));
    shell_init(&app, &shell, &mut cmd)?;

    let child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;
    drop(pair.slave);
    let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
    let writer = pair.master.take_writer().map_err(|e| e.to_string())?;
    ptys.sessions.lock().unwrap().insert(id, Session { master: pair.master, writer, child });

    std::thread::spawn(move || {
        let mut buf = [0u8; 16384];
        let mut pending: Vec<u8> = Vec::new();
        loop {
            match reader.read(&mut buf) {
                Ok(0) | Err(_) => break,
                Ok(n) => {
                    pending.extend_from_slice(&buf[..n]);
                    // send whole UTF-8 characters only; keep an incomplete tail for next time
                    let cut = match std::str::from_utf8(&pending) {
                        Ok(_) => pending.len(),
                        Err(e) if e.error_len().is_none() => e.valid_up_to(),
                        Err(_) => pending.len(),
                    };
                    let text = String::from_utf8_lossy(&pending[..cut]).into_owned();
                    pending.drain(..cut);
                    if !text.is_empty() && on_data.send(text).is_err() {
                        break;
                    }
                }
            }
        }
        let _ = on_data.send(EXIT_MARK.into());
    });
    Ok(std::path::Path::new(&shell).file_name().map(|s| s.to_string_lossy().into_owned()).unwrap_or(shell))
}

#[tauri::command]
pub fn pty_write(ptys: State<PtyState>, id: String, data: String) -> Result<(), String> {
    let mut map = ptys.sessions.lock().unwrap();
    let s = map.get_mut(&id).ok_or("no such terminal")?;
    s.writer.write_all(data.as_bytes()).map_err(|e| e.to_string())?;
    s.writer.flush().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn pty_resize(ptys: State<PtyState>, id: String, cols: u16, rows: u16) -> Result<(), String> {
    let map = ptys.sessions.lock().unwrap();
    let s = map.get(&id).ok_or("no such terminal")?;
    s.master.resize(PtySize { rows: rows.max(2), cols: cols.max(10), pixel_width: 0, pixel_height: 0 }).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn pty_kill(ptys: State<PtyState>, id: String) {
    if let Some(mut s) = ptys.sessions.lock().unwrap().remove(&id) {
        let _ = s.child.kill();
    }
}

// ── bridge ─────────────────────────────────────────────────────────────────

enum Msg {
    NotFound,
    Chunk(String),
    Done,
}

#[derive(Default)]
pub struct BridgeState {
    port: Mutex<u16>,
    token: Mutex<String>,
    pending: Arc<Mutex<HashMap<String, Sender<Msg>>>>,
}

impl BridgeState {
    fn endpoint(&self) -> (u16, String) {
        (*self.port.lock().unwrap(), self.token.lock().unwrap().clone())
    }
}

#[derive(Serialize, Clone)]
struct RunEvent {
    id: String,
    line: String,
    cwd: String,
}

/// The response body: whatever the UI sends, until it says it's done.
struct Stream {
    rx: Receiver<Msg>,
    buf: Vec<u8>,
    done: bool,
}

impl Read for Stream {
    fn read(&mut self, out: &mut [u8]) -> std::io::Result<usize> {
        while self.buf.is_empty() && !self.done {
            match self.rx.recv_timeout(Duration::from_secs(600)) {
                Ok(Msg::Chunk(s)) => self.buf.extend_from_slice(s.as_bytes()),
                _ => self.done = true,
            }
        }
        let n = out.len().min(self.buf.len());
        out[..n].copy_from_slice(&self.buf[..n]);
        self.buf.drain(..n);
        Ok(n)
    }
}

fn random_token() -> String {
    use argon2::password_hash::rand_core::{OsRng, RngCore};
    let mut b = [0u8; 24];
    OsRng.fill_bytes(&mut b);
    b.iter().map(|x| format!("{x:02x}")).collect()
}

/// Start the bridge server (once, at app start).
pub fn start_bridge(app: &AppHandle) {
    let Ok(server) = tiny_http::Server::http("127.0.0.1:0") else { return };
    let port = server.server_addr().to_ip().map(|a| a.port()).unwrap_or(0);
    let state = app.state::<BridgeState>();
    *state.port.lock().unwrap() = port;
    let token = random_token();
    *state.token.lock().unwrap() = token.clone();
    let pending = state.pending.clone();
    let app = app.clone();
    std::thread::spawn(move || {
        let mut n: u64 = 0;
        for mut req in server.incoming_requests() {
            let ok = req.headers().iter().any(|h| h.field.equiv("X-IB-Token") && h.value.as_str() == token);
            if !ok || req.url() != "/run" {
                let _ = req.respond(tiny_http::Response::empty(403));
                continue;
            }
            let cwd = req.headers().iter().find(|h| h.field.equiv("X-IB-Cwd")).map(|h| h.value.to_string()).unwrap_or_default();
            let mut line = String::new();
            let _ = req.as_reader().take(64 * 1024).read_to_string(&mut line);
            n += 1;
            let id = format!("b{n}");
            let (tx, rx) = channel();
            pending.lock().unwrap().insert(id.clone(), tx);
            let _ = app.emit("bridge-run", RunEvent { id: id.clone(), line, cwd });
            let pending = pending.clone();
            std::thread::spawn(move || {
                // the first message decides: unknown command (404) or output (200, streamed)
                let first = rx.recv_timeout(Duration::from_secs(15)).unwrap_or(Msg::NotFound);
                match first {
                    Msg::NotFound => {
                        let _ = req.respond(tiny_http::Response::empty(404));
                    }
                    first => {
                        let (buf, done) = match first {
                            Msg::Chunk(s) => (s.into_bytes(), false),
                            _ => (Vec::new(), true),
                        };
                        let body = Stream { rx, buf, done };
                        let header = tiny_http::Header::from_bytes(&b"Content-Type"[..], &b"text/plain; charset=utf-8"[..]).unwrap();
                        let _ = req.respond(tiny_http::Response::new(200.into(), vec![header], body, None, None));
                    }
                }
                pending.lock().unwrap().remove(&id);
            });
        }
    });
}

/// From the UI: output for a bridged command (`found: false` = not an ICEBREAKER command).
#[tauri::command]
pub fn bridge_send(bridge: State<BridgeState>, id: String, chunk: Option<String>, done: bool, found: bool) {
    let map = bridge.pending.lock().unwrap();
    let Some(tx) = map.get(&id) else { return };
    if !found {
        let _ = tx.send(Msg::NotFound);
        return;
    }
    if let Some(c) = chunk {
        let _ = tx.send(Msg::Chunk(c));
    }
    if done {
        let _ = tx.send(Msg::Done);
    }
}
