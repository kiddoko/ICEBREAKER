//! "Claude Code" AI provider: instead of calling the Anthropic API with a key
//! (billed per token), ICEBREAKER runs the user's own `claude` CLI in headless
//! mode (`claude -p --output-format stream-json`). The CLI is logged in with the
//! user's Claude plan, so usage counts against that plan's limits.
//!
//! ICEBREAKER never sees or stores the login: it only starts the process, feeds
//! the prompt on stdin and streams stdout lines back to the UI through a Channel.
//! The process runs inside the vault folder with read-only tools (Read, Glob, Grep).

use std::collections::HashMap;
use std::io::{BufRead, BufReader, Read, Write};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};

use serde::{Deserialize, Serialize};
use tauri::{ipc::Channel, State};

use crate::vault::{vault_root, VaultState};

#[derive(Default)]
pub struct ClaudeCodeState {
    running: Mutex<HashMap<String, Arc<Mutex<Child>>>>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunRequest {
    id: String,
    prompt: String,
    system: String,
    /// Session id from a previous turn, to continue the same conversation.
    resume: Option<String>,
    /// Model alias ("sonnet", "opus") or full id. Empty = the CLI's default.
    model: Option<String>,
    /// Let the model create and edit notes — inside the vault only.
    #[serde(default)]
    writes: bool,
}

#[derive(Serialize)]
pub struct RunResult {
    code: i32,
    stderr: String,
}

fn home() -> Option<PathBuf> {
    std::env::var_os("HOME").or_else(|| std::env::var_os("USERPROFILE")).map(PathBuf::from)
}

/// Apps started from the Finder/Start menu don't get the shell's PATH, so we add
/// the usual install locations (native installer, Homebrew, npm, bun, volta).
fn search_path() -> std::ffi::OsString {
    let mut dirs: Vec<PathBuf> = std::env::var_os("PATH").map(|p| std::env::split_paths(&p).collect()).unwrap_or_default();
    if let Some(h) = home() {
        for rel in [".local/bin", ".claude/local", ".npm-global/bin", ".bun/bin", ".volta/bin", "AppData/Roaming/npm"] {
            dirs.push(h.join(rel));
        }
    }
    for d in ["/opt/homebrew/bin", "/usr/local/bin", "/usr/bin"] {
        dirs.push(PathBuf::from(d));
    }
    std::env::join_paths(dirs).unwrap_or_default()
}

fn find_claude() -> Option<PathBuf> {
    let names: &[&str] = if cfg!(windows) { &["claude.exe", "claude.cmd"] } else { &["claude"] };
    std::env::split_paths(&search_path())
        .flat_map(|d| names.iter().map(move |n| d.join(n)))
        .find(|p| p.is_file())
}

/// Path of the `claude` CLI, or None if it isn't installed.
#[tauri::command]
pub fn claude_code_detect() -> Option<String> {
    find_claude().map(|p| p.to_string_lossy().into_owned())
}

#[tauri::command]
pub async fn claude_code_run(
    vault: State<'_, VaultState>,
    state: State<'_, ClaudeCodeState>,
    req: RunRequest,
    on_line: Channel<String>,
) -> Result<RunResult, String> {
    let exe = find_claude().ok_or("Claude Code isn't installed (https://claude.com/claude-code)")?;
    let cwd = vault_root(&vault).map_err(|e| e.to_string())?;

    let mut cmd = Command::new(exe);
    cmd.args(["-p", "--output-format", "stream-json", "--verbose", "--include-partial-messages"])
        .args(["--system-prompt", &req.system])
        // `--` ends the variadic tool lists (the prompt itself goes through stdin).
        // Writes: `Edit(./**)` allows creating / editing files under the vault
        // only (Edit rules cover Write too); anything outside needs a permission
        // that -p mode never grants. ICEBREAKER's own folders stay off-limits.
        .args(if req.writes {
            [
                "--allowedTools",
                "Read,Glob,Grep,Edit(./**)",
                "--disallowedTools",
                "Bash,NotebookEdit,WebFetch,WebSearch,Edit(./.icebreaker/**),Edit(./.obsidian/**),Edit(./.git/**),Edit(./.trash/**)",
            ]
        } else {
            ["--allowedTools", "Read,Glob,Grep", "--disallowedTools", "Bash,Edit,Write,NotebookEdit,WebFetch,WebSearch"]
        });
    if let Some(id) = req.resume.as_deref().filter(|s| !s.is_empty()) {
        cmd.args(["--resume", id]);
    }
    if let Some(m) = req.model.as_deref().filter(|s| !s.is_empty()) {
        cmd.args(["--model", m]);
    }
    cmd.current_dir(cwd)
        .env("PATH", search_path())
        // With an API key in the environment the CLI would bill the key instead of the plan.
        .env_remove("ANTHROPIC_API_KEY")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }

    let mut child = cmd.spawn().map_err(|e| format!("couldn't start claude: {e}"))?;
    let mut stdin = child.stdin.take().ok_or("no stdin")?;
    let stdout = child.stdout.take().ok_or("no stdout")?;
    let mut stderr = child.stderr.take().ok_or("no stderr")?;
    let child = Arc::new(Mutex::new(child));
    state.running.lock().unwrap().insert(req.id.clone(), child.clone());

    let prompt = req.prompt;
    let result = tauri::async_runtime::spawn_blocking(move || -> Result<RunResult, String> {
        // Write the prompt then close stdin, so the CLI starts working.
        let _ = stdin.write_all(prompt.as_bytes());
        drop(stdin);
        let err_reader = std::thread::spawn(move || {
            let mut s = String::new();
            let _ = stderr.read_to_string(&mut s);
            s
        });
        for line in BufReader::new(stdout).lines() {
            let Ok(line) = line else { break };
            if !line.trim().is_empty() && on_line.send(line).is_err() {
                break;
            }
        }
        let status = child.lock().unwrap().wait().map_err(|e| e.to_string())?;
        let stderr = err_reader.join().unwrap_or_default();
        Ok(RunResult { code: status.code().unwrap_or(-1), stderr })
    })
    .await
    .map_err(|e| e.to_string())?;

    state.running.lock().unwrap().remove(&req.id);
    result
}

/// Stop a running request (the user pressed Esc).
#[tauri::command]
pub fn claude_code_cancel(state: State<'_, ClaudeCodeState>, id: String) {
    if let Some(child) = state.running.lock().unwrap().remove(&id) {
        let _ = child.lock().unwrap().kill();
    }
}
