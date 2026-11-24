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
//! POSTed here (`/run`), the UI runs it with ibsh and streams the output back
//! (errors in red). The shell then asks `/status/<id>` for its exit code, so
//! `$?` and the prompt's ✕ say when it failed. Your own ~/.zshrc / ~/.bashrc
//! are loaded first and never modified.

use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use serde::Serialize;
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::mpsc::{channel, Receiver, Sender};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
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
    /// which start this is: a terminal restarted keeps its id, its old watcher must let go
    serial: u64,
}

/// one number per shell started (see `Session::serial`)
static SERIAL: AtomicU64 = AtomicU64::new(1);

#[derive(Default)]
pub struct PtyState {
    sessions: Mutex<HashMap<String, Session>>,
}

/// Sent after the shell exits (an OSC sequence terminals ignore).
const EXIT_MARK: &str = "\u{1b}]ib-exit\u{7}";

fn default_shell() -> String {
    // Windows: PowerShell 7 (pwsh) when it's installed, else Windows PowerShell. Looked up
    // in PATH once (it used to start `where.exe` for every new terminal: a console window
    // flashing by, and time lost before the shell even started)
    #[cfg(windows)]
    {
        static SHELL: std::sync::OnceLock<String> = std::sync::OnceLock::new();
        return SHELL
            .get_or_init(|| {
                let pwsh = std::env::var_os("PATH").map(|p| std::env::split_paths(&p).any(|d| d.join("pwsh.exe").is_file())).unwrap_or(false);
                if pwsh { "pwsh.exe".into() } else { "powershell.exe".into() }
            })
            .clone();
    }
    #[cfg(not(windows))]
    std::env::var("SHELL").ok().filter(|s| !s.is_empty()).unwrap_or_else(|| if cfg!(target_os = "macos") { "/bin/zsh".into() } else { "/bin/bash".into() })
}

/// PowerShell: the same bridge. Unknown commands go to the deck
/// (CommandNotFoundAction), module commands become functions, `ib` forces one.
/// A script as PowerShell's -EncodedCommand takes it: UTF-16LE, then base64.
fn encoded_command(script: &str) -> String {
    const B64: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let bytes: Vec<u8> = script.encode_utf16().flat_map(|u| u.to_le_bytes()).collect();
    let mut out = String::with_capacity(bytes.len().div_ceil(3) * 4);
    for chunk in bytes.chunks(3) {
        let n = (chunk[0] as u32) << 16 | (*chunk.get(1).unwrap_or(&0) as u32) << 8 | *chunk.get(2).unwrap_or(&0) as u32;
        for i in 0..4 {
            out.push(if i <= chunk.len() { B64[(n >> (18 - 6 * i) & 63) as usize] as char } else { '=' });
        }
    }
    out
}

const POWERSHELL_HOOK: &str = r#"
# ── ICEBREAKER: its commands in your shell (unknown commands are asked to the deck) ──
# UTF-8 both ways (Windows PowerShell 5.1 defaults to the old OEM code page: ◆ came out as â—†)
try { [Console]::OutputEncoding = [Text.UTF8Encoding]::new($false); [Console]::InputEncoding = [Text.UTF8Encoding]::new($false); $global:OutputEncoding = [Text.UTF8Encoding]::new($false) } catch {}
# Runs a deck command: its output goes straight to the screen (Out-Host: in a function, a
# program's output would otherwise become the function's return value, and vanish when
# discarded), then its exit code lands in $LASTEXITCODE (and the prompt's ✕).
# $__ib_unknown: the deck has no such command.
function global:__ib_run {
  $global:__ib_unknown = $false
  $tmp = [IO.Path]::GetTempFileName()
  [IO.File]::WriteAllText($tmp, (($args | ForEach-Object { "$_" }) -join [char]0) + [char]0)
  $id = 'ib' + [guid]::NewGuid().ToString('N')
  $token = "X-IB-Token: $env:ICEBREAKER_TOKEN"
  curl.exe -sNf -X POST -H $token -H "X-IB-Cwd: $PWD" -H "X-IB-Id: $id" --data-binary "@$tmp" "http://127.0.0.1:$env:ICEBREAKER_PORT/run" | Out-Host
  $found = $LASTEXITCODE -eq 0
  Remove-Item $tmp -ErrorAction SilentlyContinue
  $code = 127
  if ($found) {
    $s = curl.exe -sf -H $token "http://127.0.0.1:$env:ICEBREAKER_PORT/status/$id"
    $code = if ("$s" -match '^\d+$') { [int]"$s" } else { 0 }
  } else { $global:__ib_unknown = $true }
  $global:LASTEXITCODE = $code
  $global:__ib_code = $code
}
function global:__ib_cmd {
  __ib_run @args
  if ($global:__ib_unknown) { Write-Host "ib: $($args[0]): not an ICEBREAKER command (ib help lists them)" -ForegroundColor Red }
}
function global:ib { if ($args.Count -eq 0) { "ib <command>: run an ICEBREAKER command (ib help lists them)" } else { __ib_cmd @args } }
$ExecutionContext.InvokeCommand.CommandNotFoundAction = {
  param($name, $e)
  if ($name -like 'get-*' -or $name -match '[\/:]') { return }
  $e.CommandScriptBlock = { __ib_run $name @args; if ($global:__ib_unknown) { Write-Error "${name}: command not found" } }.GetNewClosure()
  $e.StopSearch = $true
}
# module commands win over programs of the same name (your aliases stay yours)
foreach ($n in ("$env:ICEBREAKER_MODULES" -split ' ' | Where-Object { $_ })) {
  if (-not (Get-Alias $n -ErrorAction SilentlyContinue)) { Set-Item "function:global:$n" ([scriptblock]::Create("__ib_cmd $n @args")) }
}
# ICEBREAKER's prompt (Settings → terminal prompt → mine keeps oh-my-posh & co.)
if ($env:ICEBREAKER_PROMPT -ne 'mine') {
  function global:prompt {
    $ok = $?
    $code = ''
    # an ICEBREAKER command just ran: its exit code decides (a function's $? can't say it)
    if ($null -ne $global:__ib_code) { $ok = $global:__ib_code -eq 0; if (-not $ok) { $code = "$global:__ib_code" }; $global:__ib_code = $null }
    $e = [char]27
    # the glyphs by code: the same on every code page
    $dot = [char]0x25C6; $cross = [char]0x2715; $arrow = [char]0x276F
    $p = $PWD.Path
    if ($p.StartsWith($HOME)) { $p = '~' + $p.Substring($HOME.Length) }
    $err = if ($ok) { '' } else { " $e[31m$cross$code$e[0m" }
    "$e[95m$dot$e[0m $e[35m$p$e[0m$err $e[95m$arrow$e[0m "
  }
}
"#;

/// fish: the same bridge.
const FISH_HOOK: &str = r#"
# ── ICEBREAKER: its commands in your shell ──
# runs a deck command, returns its exit code ($__ib_unknown: the deck has no such command)
function __ib_run
  set -g __ib_unknown
  set -l id ib(random)(random)(random)
  string join0 -- $argv | command curl -sNf -X POST -H "X-IB-Token: $ICEBREAKER_TOKEN" -H "X-IB-Cwd: $PWD" -H "X-IB-Id: $id" --data-binary @- "http://127.0.0.1:$ICEBREAKER_PORT/run"
  or begin
    set -g __ib_unknown 1
    return 127
  end
  set -l s (command curl -sf -H "X-IB-Token: $ICEBREAKER_TOKEN" "http://127.0.0.1:$ICEBREAKER_PORT/status/$id")
  string match -qr '^[0-9]+$' -- "$s"; or set s 0
  return $s
end
function __ib_cmd
  __ib_run $argv
  set -l s $status
  test -n "$__ib_unknown"; and echo "ib: $argv[1]: not an ICEBREAKER command (ib help lists them)" >&2
  return $s
end
function ib
  if test (count $argv) -eq 0
    echo "ib <command>: run an ICEBREAKER command (ib help lists them)"
  else
    __ib_cmd $argv
  end
end
function fish_command_not_found
  __ib_run $argv
  set -l s $status
  test -n "$__ib_unknown"; and __fish_default_command_not_found_handler $argv
  return $s
end
for __ib_c in (string split ' ' -- $ICEBREAKER_MODULES)
  test -n "$__ib_c"; or continue
  functions -q $__ib_c; and continue
  function $__ib_c --inherit-variable __ib_c
    __ib_cmd $__ib_c $argv
  end
end
# ICEBREAKER's prompt (Settings → terminal prompt → mine keeps yours)
if test "$ICEBREAKER_PROMPT" != mine
  function fish_prompt
    set -l s $status
    set_color brmagenta; echo -n '◆ '
    set_color magenta; echo -n (prompt_pwd)
    if test $s -ne 0; set_color red; echo -n " ✕$s"; end
    set_color brmagenta; echo -n ' ❯ '
    set_color normal
  end
  functions -e fish_right_prompt
end
"#;

/// Write the rc files that load the user's config, then add our hook.
fn shell_init(app: &AppHandle, shell: &str, cmd: &mut CommandBuilder) -> Result<(), String> {
    let dir = app.path().app_cache_dir().map_err(|e| e.to_string())?.join("shell");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let name = std::path::Path::new(shell).file_name().map(|s| s.to_string_lossy().into_owned()).unwrap_or_default();
    // the hook, shared by zsh and bash
    let hook = r#"
# ── ICEBREAKER: its commands in your shell (unknown commands are asked to the deck) ──
# runs a deck command and returns its exit code; __ib_unknown=1: the deck has no such command
__ib_run() {
  __ib_unknown=
  local __ib_id="ib$$${RANDOM}${RANDOM}${RANDOM}" __ib_s
  printf '%s\0' "$@" | command curl -sNf -X POST -H "X-IB-Token: $ICEBREAKER_TOKEN" -H "X-IB-Cwd: $PWD" -H "X-IB-Id: $__ib_id" --data-binary @- "http://127.0.0.1:$ICEBREAKER_PORT/run" || { __ib_unknown=1; return 127; }
  __ib_s=$(command curl -sf -H "X-IB-Token: $ICEBREAKER_TOKEN" "http://127.0.0.1:$ICEBREAKER_PORT/status/$__ib_id")
  case "$__ib_s" in ''|*[!0-9]*) __ib_s=0 ;; esac
  return "$__ib_s"
}
__ib_cmd() {
  __ib_run "$@"; local __ib_s=$?
  [ -n "$__ib_unknown" ] && echo "ib: $1: not an ICEBREAKER command (ib help lists them)" >&2
  return $__ib_s
}
ib() { if [ $# -eq 0 ]; then echo "ib <command>: run an ICEBREAKER command (ib help lists them)"; else __ib_cmd "$@"; fi; }
# module commands win over system programs of the same name (`command cal` still runs macOS's cal)
for __ib_c in $(printf '%s' "$ICEBREAKER_MODULES"); do
  alias "$__ib_c" >/dev/null 2>&1 && continue   # your own aliases stay yours
  eval "$__ib_c() { __ib_cmd $__ib_c \"\$@\"; }"
done
unset __ib_c
# ICEBREAKER's prompt — the same for everyone (Settings → terminal prompt → mine keeps yours)
if [ "$ICEBREAKER_PROMPT" != "mine" ]; then
  if [ -n "$ZSH_VERSION" ]; then
    # powerlevel10k redraws its own prompt after ours: take it out of this session cleanly
    # (its own teardown; `mine` in the settings keeps it)
    (( ${+functions[prompt_powerlevel10k_teardown]} )) && prompt_powerlevel10k_teardown
    # before every prompt: if p10k came back (a `source ~/.zshrc`, a plugin), out again,
    # and this hook stays the last one so its PROMPT wins
    __ib_prompt() {
      (( ${precmd_functions[(I)_p9k_precmd]} )) && (( ${+functions[prompt_powerlevel10k_teardown]} )) && prompt_powerlevel10k_teardown
      [[ ${precmd_functions[-1]} == __ib_prompt ]] || precmd_functions=(${precmd_functions:#__ib_prompt} __ib_prompt)
      PROMPT='%F{13}◆%f %F{5}%~%f%(?.. %F{1}✕%?%f) %F{13}❯%f '; RPROMPT='%F{8}%*%f';
    }
    precmd_functions+=(__ib_prompt)
    __ib_prompt
  else
    __ib_ps1() { local e=$?; PS1="\[\e[95m\]◆\[\e[0m\] \[\e[35m\]\w\[\e[0m\]$( [ $e != 0 ] && printf ' \[\e[31m\]✕%s\[\e[0m\]' $e ) \[\e[95m\]❯\[\e[0m\] "; }
    PROMPT_COMMAND="${PROMPT_COMMAND:+$PROMPT_COMMAND;}__ib_ps1"
  fi
fi
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
                "ZDOTDIR=\"$HOME\"\n# powerlevel10k: no instant prompt in the deck's terminals (it fights our start-up resize: prompt_cr errors)\ntypeset -gi __p9k_instant_prompt_disabled=1\ntypeset -g POWERLEVEL9K_INSTANT_PROMPT=off\n[ -f \"$HOME/.zshrc\" ] && source \"$HOME/.zshrc\"\n# ~/.p10k.zsh may have turned it back on: off again, before p10k finalize reads it\ntypeset -g POWERLEVEL9K_INSTANT_PROMPT=off\n# powerlevel10k: its instant prompt wants this once the config is read (it can't tell here)\n(( ! ${{+functions[p10k]}} )) || p10k finalize\n# …and prompt_cr must stay off for it: something read later (.zlogin…) can turn it back on, so unset it right before each prompt, ahead of p10k's own hook\nif (( ${{+functions[p10k]}} )); then __ib_nocr() {{ unsetopt prompt_cr prompt_sp; }}; precmd_functions=(__ib_nocr $precmd_functions); unsetopt prompt_cr prompt_sp; fi\n{hook}\ncommand_not_found_handler() {{\n  __ib_run \"$@\"; local s=$?\n  [ -z \"$__ib_unknown\" ] && return $s\n  print -u2 \"zsh: command not found: $1\"; return 127\n}}\n"
            ),
        )?;
        cmd.env("ZDOTDIR", zd.to_string_lossy().as_ref());
        cmd.args(["-l", "-i"]);
    } else if name.contains("bash") {
        let rc = dir.join("bashrc");
        std::fs::write(
            &rc,
            format!(
                "for f in \"$HOME/.bash_profile\" \"$HOME/.bashrc\"; do [ -f \"$f\" ] && . \"$f\" && break; done\n{hook}\ncommand_not_found_handle() {{\n  __ib_run \"$@\"; local s=$?\n  [ -z \"$__ib_unknown\" ] && return $s\n  echo \"bash: $1: command not found\" >&2; return 127\n}}\n"
            ),
        )
        .map_err(|e| e.to_string())?;
        cmd.args(["--rcfile", &rc.to_string_lossy(), "-i"]);
    } else if name.contains("pwsh") || name.contains("powershell") {
        // PowerShell (Windows, or pwsh anywhere): your $PROFILE loads as usual
        // (oh-my-posh, modules…), then this script adds ICEBREAKER's commands. It goes as
        // -EncodedCommand (UTF-16, so accents survive 5.1): a command isn't a script file, so no
        // execution policy has to be switched off for it — the tab keeps YOUR policy (it used to
        // start with -ExecutionPolicy Bypass: any script you ran there skipped its check, Fable pass 24/11)
        cmd.args(["-NoLogo", "-NoExit", "-EncodedCommand", &encoded_command(POWERSHELL_HOOK)]);
    } else if name.contains("fish") {
        // fish reads its config, then this (-C runs after the config)
        let f = dir.join("icebreaker.fish");
        std::fs::write(&f, FISH_HOOK).map_err(|e| e.to_string())?;
        cmd.args(["-i", "-C", &format!("source '{}'", f.to_string_lossy().replace('\'', "\\'"))]);
    }
    // other shells start plain (`ib` isn't there)
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
    prompt: Option<String>,
    shell: Option<String>,
) -> Result<String, String> {
    // a shell asked for by name or path: only one of this computer's shells (shells.rs), else refused
    let shell = match shell.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
        Some(want) => crate::shells::resolve(want, &crate::shells::shells()).ok_or_else(|| format!("{want}: not a shell of this computer (term shells lists them)"))?,
        None => default_shell(),
    };
    let pair = native_pty_system()
        .openpty(PtySize { rows: rows.max(2), cols: cols.max(10), pixel_width: 0, pixel_height: 0 })
        .map_err(|e| e.to_string())?;
    let mut cmd = CommandBuilder::new(&shell);
    if let Ok(root) = vault_root(&vault) {
        cmd.cwd(root);
    }
    cmd.env("TERM", "xterm-256color");
    cmd.env("COLORTERM", "truecolor");
    cmd.env("TERM_PROGRAM", "ICEBREAKER");
    // "icebreaker": the deck's own prompt in every shell · "mine": yours
    cmd.env("ICEBREAKER_PROMPT", prompt.as_deref().unwrap_or("icebreaker"));
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
    let serial = SERIAL.fetch_add(1, Ordering::SeqCst);
    ptys.sessions.lock().unwrap().insert(id.clone(), Session { master: pair.master, writer, child, serial });

    // The shell ended (`exit`): on Windows, ConPTY keeps its output pipe open after the shell
    // is gone, so the reader below never hears the end — the tab stayed dead, without its
    // "process exited" line. A watcher sees the shell end and closes the pseudo-console
    // (dropping the session), which ends the reader; if even that doesn't, it says so itself.
    let read_done = Arc::new(AtomicBool::new(false));
    {
        let (app, id, done, on_data) = (app.clone(), id.clone(), read_done.clone(), on_data.clone());
        std::thread::spawn(move || loop {
            std::thread::sleep(Duration::from_millis(300));
            let state = app.state::<PtyState>();
            let ended = {
                let mut map = state.sessions.lock().unwrap();
                match map.get_mut(&id) {
                    // killed or restarted: not ours any more
                    Some(s) if s.serial == serial => match s.child.try_wait() {
                        Ok(Some(_)) => {
                            map.remove(&id);
                            true
                        }
                        Ok(None) => false,
                        Err(_) => break,
                    },
                    _ => break,
                }
            };
            if ended {
                std::thread::sleep(Duration::from_millis(1500));
                if !done.swap(true, Ordering::SeqCst) {
                    let _ = on_data.send(EXIT_MARK.into());
                }
                break;
            }
        });
    }

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
        if !read_done.swap(true, Ordering::SeqCst) {
            let _ = on_data.send(EXIT_MARK.into());
        }
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
    /// exit codes of the commands that finished, until their shell asks (`/status/<id>`)
    statuses: Arc<Mutex<HashMap<String, i32>>>,
}

/// An id a shell gave its request (X-IB-Id): letters and digits only, so it can't clash with ours ("b12").
fn client_id(v: &str) -> Option<String> {
    (v.len() >= 8 && v.len() <= 64 && v.starts_with("ib") && v.chars().all(|c| c.is_ascii_alphanumeric())).then(|| v.to_string())
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

fn same(a: &[u8], b: &[u8]) -> bool {
    a.len() == b.len() && a.iter().zip(b).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0
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
    let statuses = state.statuses.clone();
    let app = app.clone();
    std::thread::spawn(move || {
        let mut n: u64 = 0;
        for mut req in server.incoming_requests() {
            // compared in constant time: the timing says nothing about the token
            let ok = req.headers().iter().any(|h| h.field.equiv("X-IB-Token") && same(h.value.as_str().as_bytes(), token.as_bytes()));
            if !ok {
                let _ = req.respond(tiny_http::Response::empty(403));
                continue;
            }
            // the exit code of a command that just finished (asked once, right after its output)
            if let Some(asked) = req.url().strip_prefix("/status/").and_then(client_id) {
                let code = statuses.lock().unwrap().remove(&asked);
                let _ = match code {
                    Some(c) => req.respond(tiny_http::Response::from_string(c.to_string())),
                    None => req.respond(tiny_http::Response::empty(404)),
                };
                continue;
            }
            if req.url() != "/run" {
                let _ = req.respond(tiny_http::Response::empty(403));
                continue;
            }
            let cwd = req.headers().iter().find(|h| h.field.equiv("X-IB-Cwd")).map(|h| h.value.to_string()).unwrap_or_default();
            let given = req.headers().iter().find(|h| h.field.equiv("X-IB-Id")).and_then(|h| client_id(h.value.as_str()));
            let mut line = String::new();
            let _ = req.as_reader().take(64 * 1024).read_to_string(&mut line);
            n += 1;
            let id = given.filter(|g| !pending.lock().unwrap().contains_key(g)).unwrap_or_else(|| format!("b{n}"));
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
/// With `done`, `status` is its exit code: kept for the shell's `/status/<id>`.
#[tauri::command]
pub fn bridge_send(bridge: State<BridgeState>, id: String, chunk: Option<String>, done: bool, found: bool, status: Option<i32>) {
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
        // stored before the output ends: when curl returns, the shell finds it
        if client_id(&id).is_some() {
            let mut st = bridge.statuses.lock().unwrap();
            if st.len() > 256 {
                st.clear(); // codes nobody asked for (a shell killed mid-command)
            }
            st.insert(id.clone(), status.unwrap_or(0));
        }
        let _ = tx.send(Msg::Done);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn powershell_gets_the_hook_as_an_encoded_command() {
        // (checked against Python's base64 of the UTF-16LE text)
        assert_eq!(encoded_command("dir; é ✓"), "ZABpAHIAOwAgAOkAIAATJw==");
        assert_eq!(encoded_command("a"), "YQA=");
        assert_eq!(encoded_command(""), "");
        // the whole hook fits Windows' command line (32 767 characters)
        assert!(encoded_command(POWERSHELL_HOOK).len() < 30_000);
    }
}
