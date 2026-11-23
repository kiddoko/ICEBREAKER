//! The shells this computer has, for the shell panel's « + » menu and `term new <shell>`.
//!
//! Unix (macOS, Linux): the login shell ($SHELL) first, then /etc/shells — the list the
//! system itself trusts as login shells (`chsh` reads it) — one per name, existing files
//! only. Windows: PowerShell 7 (pwsh), Windows PowerShell, cmd and WSL, when they're there.
//!
//! A terminal only ever starts a shell from this list (`pty_spawn` checks): a page can't
//! ask the deck to run an arbitrary program as a "shell".

use serde::Serialize;
use std::path::PathBuf;

#[derive(Serialize, Clone, Debug, PartialEq)]
pub struct ShellInfo {
    /// what the tab and the menu say: "zsh", "bash", "pwsh", "cmd", "wsl"
    pub name: String,
    /// what is started
    pub path: String,
}

/// The name a shell goes by: the file's name, lowercase, without ".exe".
pub fn shell_name(path: &str) -> String {
    let file = path.rsplit(['/', '\\']).next().unwrap_or(path);
    let lower = file.to_lowercase();
    lower.strip_suffix(".exe").unwrap_or(&lower).to_string()
}

/// Programs listed in /etc/shells that aren't shells you'd type in.
const NOT_SHELLS: [&str; 4] = ["nologin", "false", "git-shell", "true"];

/// /etc/shells → the shells, login shell first, one per name, in a friendly order
/// (zsh, bash, fish first, then the rest as listed). `exists` says whether a path is a file.
#[cfg_attr(windows, allow(dead_code))]
pub fn parse_etc_shells(text: &str, login: Option<&str>, exists: impl Fn(&str) -> bool) -> Vec<ShellInfo> {
    let mut paths: Vec<String> = Vec::new();
    if let Some(l) = login.filter(|l| !l.is_empty()) {
        paths.push(l.to_string());
    }
    for line in text.lines() {
        let l = line.trim();
        if l.is_empty() || l.starts_with('#') || !l.starts_with('/') {
            continue;
        }
        paths.push(l.to_string());
    }
    let mut out: Vec<ShellInfo> = Vec::new();
    for p in paths {
        let name = shell_name(&p);
        if NOT_SHELLS.contains(&name.as_str()) || !exists(&p) || out.iter().any(|s| s.name == name) {
            continue;
        }
        out.push(ShellInfo { name, path: p });
    }
    // the login shell stays first; then the common ones, then the rest in their order
    let rank = |n: &str| ["zsh", "bash", "fish"].iter().position(|x| *x == n).unwrap_or(3);
    let first = login.filter(|l| !l.is_empty()).map(shell_name);
    let (head, mut tail): (Vec<ShellInfo>, Vec<ShellInfo>) = out.into_iter().partition(|s| Some(&s.name) == first.as_ref());
    tail.sort_by_key(|s| rank(&s.name));
    head.into_iter().chain(tail).collect()
}

/// Windows: the shells found, in this order. `find` gives a program's full path (PATH, then
/// System32), or None.
#[cfg_attr(not(windows), allow(dead_code))]
pub fn windows_shells(find: impl Fn(&str) -> Option<PathBuf>) -> Vec<ShellInfo> {
    ["pwsh.exe", "powershell.exe", "cmd.exe", "wsl.exe"]
        .iter()
        .filter_map(|exe| find(exe).map(|p| ShellInfo { name: shell_name(exe), path: p.to_string_lossy().into_owned() }))
        .collect()
}

/// `wsl -l -q` → at least one Linux installed? (it writes UTF-16; with none, nothing or a sentence
/// on stderr and a non-zero exit). WSL without a distro only says how to install one: not a shell.
#[cfg_attr(not(windows), allow(dead_code))]
pub fn wsl_has_distro(stdout: &[u8], ok: bool) -> bool {
    if !ok {
        return false;
    }
    let text = if stdout.len() >= 2 && stdout.iter().skip(1).step_by(2).take(8).all(|b| *b == 0) {
        let units: Vec<u16> = stdout.chunks_exact(2).map(|c| u16::from_le_bytes([c[0], c[1]])).collect();
        String::from_utf16_lossy(&units)
    } else {
        String::from_utf8_lossy(stdout).into_owned()
    };
    text.lines().any(|l| !l.trim_matches(|c: char| c.is_whitespace() || c == '\u{feff}' || c == '\0').is_empty())
}

#[cfg(windows)]
fn wsl_ready(path: &std::path::Path) -> bool {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    std::process::Command::new(path)
        .args(["-l", "-q"])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map(|o| wsl_has_distro(&o.stdout, o.status.success()))
        .unwrap_or(false)
}

#[cfg(windows)]
fn find_windows(exe: &str) -> Option<PathBuf> {
    let in_path = std::env::var_os("PATH").and_then(|p| std::env::split_paths(&p).map(|d| d.join(exe)).find(|f| f.is_file()));
    in_path.or_else(|| {
        let root = std::env::var_os("SystemRoot").map(PathBuf::from).unwrap_or_else(|| PathBuf::from(r"C:\Windows"));
        [root.join("System32").join(exe), root.join("System32").join("WindowsPowerShell").join("v1.0").join(exe)].into_iter().find(|f| f.is_file())
    })
}

/// The shells of this computer (cached: they don't change while the deck runs).
pub fn shells() -> Vec<ShellInfo> {
    static CACHE: std::sync::OnceLock<Vec<ShellInfo>> = std::sync::OnceLock::new();
    CACHE
        .get_or_init(|| {
            #[cfg(windows)]
            {
                // WSL only with a Linux installed (it was offered with none: Windows bench)
                windows_shells(|exe| find_windows(exe).filter(|p| exe != "wsl.exe" || wsl_ready(p)))
            }
            #[cfg(not(windows))]
            {
                let text = std::fs::read_to_string("/etc/shells").unwrap_or_default();
                let login = std::env::var("SHELL").ok();
                parse_etc_shells(&text, login.as_deref(), |p| std::path::Path::new(p).is_file())
            }
        })
        .clone()
}

/// A shell asked for by name or path → its path, only if it's one of this computer's shells.
pub fn resolve(want: &str, list: &[ShellInfo]) -> Option<String> {
    let w = want.trim();
    if w.is_empty() {
        return None;
    }
    list.iter().find(|s| s.path == w || s.name == shell_name(w)).map(|s| s.path.clone())
}

/// `pty_shells`: what the « + » menu lists.
#[tauri::command]
pub fn pty_shells() -> Vec<ShellInfo> {
    shells()
}

#[cfg(test)]
mod tests {
    use super::*;

    const ETC: &str = "# List of acceptable shells for chpass(1).\n/bin/bash\n/bin/csh\n/bin/dash\n/bin/ksh\n/bin/sh\n/bin/tcsh\n/bin/zsh\n/opt/homebrew/bin/fish\n/usr/sbin/nologin\n/bin/false\n\n";

    #[test]
    fn etc_shells_login_first_then_common_ones() {
        let list = parse_etc_shells(ETC, Some("/bin/zsh"), |_| true);
        let names: Vec<&str> = list.iter().map(|s| s.name.as_str()).collect();
        assert_eq!(&names[..3], &["zsh", "bash", "fish"]);
        assert!(!names.contains(&"nologin") && !names.contains(&"false"));
        assert_eq!(list[2].path, "/opt/homebrew/bin/fish");
    }

    #[test]
    fn etc_shells_one_per_name_existing_only() {
        let text = "/bin/bash\n/usr/local/bin/bash\n/bin/zsh\n";
        let list = parse_etc_shells(text, Some("/usr/local/bin/bash"), |p| p != "/bin/zsh");
        assert_eq!(list, vec![ShellInfo { name: "bash".into(), path: "/usr/local/bin/bash".into() }]);
    }

    #[test]
    fn etc_shells_empty_file_keeps_the_login_shell() {
        let list = parse_etc_shells("", Some("/bin/bash"), |_| true);
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].name, "bash");
    }

    #[test]
    fn windows_shells_in_order_when_present() {
        let list = windows_shells(|exe| if exe == "wsl.exe" { None } else { Some(PathBuf::from(format!(r"C:\Windows\System32\{exe}"))) });
        let names: Vec<&str> = list.iter().map(|s| s.name.as_str()).collect();
        assert_eq!(names, vec!["pwsh", "powershell", "cmd"]);
        assert!(list[2].path.ends_with("cmd.exe"));
    }

    #[test]
    fn wsl_counts_only_with_a_distro() {
        let utf16 = |s: &str| s.encode_utf16().flat_map(|u| u.to_le_bytes()).collect::<Vec<u8>>();
        assert!(wsl_has_distro(&utf16("Ubuntu\r\n"), true));
        assert!(!wsl_has_distro(&utf16("\r\n"), true));
        assert!(!wsl_has_distro(b"", true));
        assert!(!wsl_has_distro(&utf16("Ubuntu\r\n"), false));
        assert!(wsl_has_distro(b"Debian\n", true));
    }

    #[test]
    fn names_and_resolving() {
        assert_eq!(shell_name(r"C:\Program Files\PowerShell\7\pwsh.EXE"), "pwsh");
        assert_eq!(shell_name("/opt/homebrew/bin/fish"), "fish");
        let list = parse_etc_shells(ETC, Some("/bin/zsh"), |_| true);
        assert_eq!(resolve("bash", &list).as_deref(), Some("/bin/bash"));
        assert_eq!(resolve("/bin/zsh", &list).as_deref(), Some("/bin/zsh"));
        // never a program that isn't a listed shell
        assert_eq!(resolve("/usr/bin/python3", &list), None);
        assert_eq!(resolve("", &list), None);
    }
}
