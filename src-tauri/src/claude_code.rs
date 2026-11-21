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
    /// What the AI may read by itself (`ai.reads`), as the page knows it: used only when the
    /// account's settings file doesn't say yet (it's read here first).
    #[serde(default)]
    reads: Option<String>,
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
    app: tauri::AppHandle,
    vault: State<'_, VaultState>,
    state: State<'_, ClaudeCodeState>,
    req: RunRequest,
    on_line: Channel<String>,
) -> Result<RunResult, String> {
    // stealth mode: no cloud AI (checked here too, not only in the page)
    crate::config::online(&app, "Claude Code")?;
    let exe = find_claude().ok_or("Claude Code isn't installed (https://claude.com/claude-code)")?;
    // an encrypted vault: Claude Code can't read its files (only noise on disk) and
    // must never write plain ones into it — it gets an empty folder and no file tools;
    // it only gets what you type (or pipe to `ask`): the LINK page says so
    let encrypted = crate::vault::is_encrypted(&vault);
    // `ai.reads` (Settings → PERMISSIONS): unless it's "all", Claude Code gets no file tool
    // and an empty folder, as for an encrypted vault — the deck hands it the notes you gave
    let reads = crate::config::ai_reads(&app).or(req.reads.clone()).unwrap_or_else(|| "given".into());
    let encrypted = encrypted || reads != "all";
    let cwd = if encrypted {
        // an empty folder of ours (the app's cache, yours only) — never a shared /tmp one
        // another user could fill with a CLAUDE.md
        use tauri::Manager;
        let d = app.path().app_cache_dir().map_err(|e| e.to_string())?.join("claude-empty");
        let _ = std::fs::remove_dir_all(&d);
        std::fs::create_dir_all(&d).map_err(|e| e.to_string())?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let _ = std::fs::set_permissions(&d, std::fs::Permissions::from_mode(0o700));
        }
        d
    } else {
        vault_root(&vault).map_err(|e| e.to_string())?
    };

    let mut cmd = Command::new(exe);
    // `-p` skips Claude Code's "do you trust this folder?" question — and a vault can come
    // from anywhere (a USB key, a shared folder). So nothing of the folder's own Claude Code
    // set-up is loaded: only YOUR user settings (`--setting-sources user`: no project
    // .claude/settings.json, so none of its hooks — programs it would run — or permissions)
    // and no MCP server from the folder or anywhere (`--strict-mcp-config`).
    cmd.args(["-p", "--output-format", "stream-json", "--verbose", "--include-partial-messages", "--setting-sources", "user", "--strict-mcp-config"])
        .args(["--system-prompt", &req.system])
        // `--` ends the variadic tool lists (the prompt itself goes through stdin).
        // Writes: `Edit(./**)` allows creating / editing files under the vault
        // only (Edit rules cover Write too); anything outside needs a permission
        // that -p mode never grants. ICEBREAKER's own folders stay off-limits.
        .args(if encrypted {
            &["--disallowedTools", "Read,Glob,Grep,LS,Bash,Edit,Write,NotebookEdit,WebFetch,WebSearch"][..]
        } else if req.writes {
            &[
                "--allowedTools",
                "Read,Glob,Grep,Edit(./**)",
                "--disallowedTools",
                // never Claude Code's own set-up in the vault either: a note that talks the model
                // into writing .claude/settings.json would plant a hook for the next run
                "Bash,NotebookEdit,WebFetch,WebSearch,Read(./.icebreaker/**),Edit(./.icebreaker/**),Edit(./.obsidian/**),Edit(./.git/**),Edit(./.trash/**),Edit(./.claude/**),Edit(./CLAUDE.md),Edit(./CLAUDE.local.md),Edit(./.mcp.json),Edit(./.icebreaker-vault/**)",
            ][..]
        } else {
            &["--allowedTools", "Read,Glob,Grep", "--disallowedTools", "Bash,Edit,Write,NotebookEdit,WebFetch,WebSearch,Read(./.icebreaker/**)"][..]
        });
    // a session id and a model are names: never something Claude Code would read as an
    // option ("--dangerously-skip-permissions" as a model would switch every check off)
    let plain = |s: &&str| !s.is_empty() && !s.starts_with('-') && s.chars().all(|c| c.is_ascii_alphanumeric() || "._:-[]".contains(c));
    if let Some(id) = req.resume.as_deref().filter(plain) {
        cmd.args(["--resume", id]);
    }
    if let Some(m) = req.model.as_deref().filter(plain) {
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
