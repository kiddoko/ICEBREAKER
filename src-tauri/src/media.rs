//! What's playing on this computer, and play / pause / next / volume.
//!
//! macOS: Spotify and Apple Music through AppleScript (osascript). Only apps
//! that are already running are asked, so nothing gets launched and there's
//! no "where is Spotify?" dialog. The first time, macOS asks whether
//! ICEBREAKER may control them (System Settings → Privacy → Automation).
//! Linux: playerctl (MPRIS: Spotify, VLC, browsers, mpv…).
//! Windows: the system media controls (whatever shows in the volume flyout:
//! Spotify, browsers, the Media Player…) through Windows PowerShell + WinRT.

use serde::Serialize;
use std::process::Command;

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct MediaStatus {
    player: String,
    playing: bool,
    title: String,
    artist: String,
    album: String,
    /// seconds
    position: f64,
    /// seconds (0 = unknown)
    duration: f64,
    /// 0–100, if the player says
    volume: Option<f64>,
}

fn num(s: &str) -> f64 {
    s.trim().replace(',', ".").parse().unwrap_or(0.0)
}

fn run(cmd: &mut Command) -> Result<String, String> {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000);
    }
    let out = cmd.output().map_err(|e| e.to_string())?;
    if !out.status.success() {
        return Err(String::from_utf8_lossy(&out.stderr).trim().to_string());
    }
    Ok(String::from_utf8_lossy(&out.stdout).into_owned())
}

#[cfg(target_os = "macos")]
const MAC_PLAYERS: &[(&str, &str)] = &[
    // (app / process name, duration expression in seconds)
    ("Spotify", "((duration of current track) / 1000)"),
    ("Music", "(duration of current track)"),
];

#[cfg(target_os = "macos")]
fn mac_running(app: &str) -> bool {
    Command::new("pgrep").args(["-x", app]).output().map(|o| o.status.success()).unwrap_or(false)
}

#[cfg(target_os = "macos")]
fn mac_status() -> Result<Option<MediaStatus>, String> {
    let mut found: Vec<MediaStatus> = Vec::new();
    for (app, dur) in MAC_PLAYERS {
        if !mac_running(app) {
            continue;
        }
        let script = format!(
            r#"tell application "{app}"
  if player state is stopped then return "stopped"
  set t to current track
  return (player state as text) & tab & (name of t) & tab & (artist of t) & tab & (album of t) & tab & (player position as text) & tab & ({dur} as text) & tab & (sound volume as text)
end tell"#
        );
        let Ok(out) = run(Command::new("osascript").args(["-e", &script])) else { continue };
        let f: Vec<&str> = out.trim_end_matches('\n').split('\t').collect();
        if f.len() < 7 {
            continue;
        }
        found.push(MediaStatus {
            player: app.to_string(),
            playing: f[0] == "playing",
            title: f[1].into(),
            artist: f[2].into(),
            album: f[3].into(),
            position: num(f[4]),
            duration: num(f[5]),
            volume: Some(num(f[6])),
        });
    }
    // the one that's playing, else the first paused one
    Ok(found.iter().find(|s| s.playing).cloned().or_else(|| found.into_iter().next()))
}

#[cfg(target_os = "macos")]
fn mac_control(action: &str) -> Result<(), String> {
    let target = mac_status()?.map(|s| s.player).or_else(|| MAC_PLAYERS.iter().map(|(a, _)| a.to_string()).find(|a| mac_running(a)));
    let Some(app) = target else { return Err("nothing to control: open Spotify or Music".into()) };
    let verb = match action {
        "toggle" => "playpause".to_string(),
        "play" => "play".into(),
        "pause" => "pause".into(),
        "next" => "next track".into(),
        "prev" => "previous track".into(),
        "vol+" => "set sound volume to (sound volume + 10)".into(),
        "vol-" => "set sound volume to (sound volume - 10)".into(),
        v if v.starts_with("vol:") => format!("set sound volume to {}", num(&v[4..]).clamp(0.0, 100.0) as i64),
        _ => return Err(format!("unknown action {action}")),
    };
    run(Command::new("osascript").args(["-e", &format!("tell application \"{app}\" to {verb}")])).map(|_| ())
}

#[cfg(target_os = "linux")]
fn linux_status() -> Result<Option<MediaStatus>, String> {
    let fmt = "{{playerName}}\t{{status}}\t{{title}}\t{{artist}}\t{{album}}\t{{position}}\t{{mpris:length}}\t{{volume}}";
    let out = match run(Command::new("playerctl").args(["metadata", "--format", fmt])) {
        Ok(o) => o,
        Err(e) if e.contains("No player") => return Ok(None),
        Err(e) if e.contains("No such file") || e.contains("not found") => return Err("install playerctl to control music".into()),
        Err(e) => return Err(e),
    };
    let f: Vec<&str> = out.trim_end_matches('\n').split('\t').collect();
    if f.len() < 8 {
        return Ok(None);
    }
    Ok(Some(MediaStatus {
        player: f[0].into(),
        playing: f[1] == "Playing",
        title: f[2].into(),
        artist: f[3].into(),
        album: f[4].into(),
        position: num(f[5]) / 1e6,
        duration: num(f[6]) / 1e6,
        volume: if f[7].trim().is_empty() { None } else { Some(num(f[7]) * 100.0) },
    }))
}

#[cfg(target_os = "linux")]
fn linux_control(action: &str) -> Result<(), String> {
    let args: Vec<String> = match action {
        "toggle" => vec!["play-pause".into()],
        "play" => vec!["play".into()],
        "pause" => vec!["pause".into()],
        "next" => vec!["next".into()],
        "prev" => vec!["previous".into()],
        "vol+" => vec!["volume".into(), "0.1+".into()],
        "vol-" => vec!["volume".into(), "0.1-".into()],
        v if v.starts_with("vol:") => vec!["volume".into(), format!("{:.2}", num(&v[4..]).clamp(0.0, 100.0) / 100.0)],
        _ => return Err(format!("unknown action {action}")),
    };
    run(Command::new("playerctl").args(&args)).map(|_| ())
}

#[tauri::command(async)]
pub fn media_status() -> Result<Option<MediaStatus>, String> {
    #[cfg(target_os = "macos")]
    return mac_status();
    #[cfg(target_os = "linux")]
    return linux_status();
    #[cfg(windows)]
    return win_status();
    #[cfg(not(any(target_os = "macos", target_os = "linux", windows)))]
    Err("music control isn't available on this system yet".into())
}

// ── Windows: GlobalSystemMediaTransportControlsSessionManager (WinRT), from
//    Windows PowerShell 5.1 (pwsh 7 has no WinRT projection) ──
#[cfg(windows)]
const WIN_PRELUDE: &str = r#"
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]
function Await($op, $type) { $t = $asTask.MakeGenericMethod($type).Invoke($null, @($op)); $t.Wait(-1) | Out-Null; $t.Result }
[void][Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime]
$mgr = Await ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
$s = $mgr.GetCurrentSession()
"#;

#[cfg(windows)]
fn win_ps(script: &str) -> Result<String, String> {
    run(Command::new("powershell.exe").args(["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", &format!("{WIN_PRELUDE}\n{script}")]))
}

#[cfg(windows)]
fn win_status() -> Result<Option<MediaStatus>, String> {
    let out = win_ps(r#"
if (-not $s) { 'none'; exit }
$p = Await ($s.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
$i = $s.GetPlaybackInfo(); $tl = $s.GetTimelineProperties()
"$($s.SourceAppUserModelId)`t$($i.PlaybackStatus -eq 'Playing')`t$($p.Title)`t$($p.Artist)`t$($p.AlbumTitle)`t$($tl.Position.TotalSeconds)`t$($tl.EndTime.TotalSeconds)"
"#)?;
    let line = out.trim();
    if line.is_empty() || line == "none" {
        return Ok(None);
    }
    let f: Vec<&str> = line.split('\t').collect();
    if f.len() < 7 {
        return Ok(None);
    }
    let player = f[0].split(['!', '.']).find(|x| !x.is_empty() && !x.chars().all(|c| c.is_ascii_hexdigit())).unwrap_or(f[0]).to_string();
    Ok(Some(MediaStatus { player, playing: f[1].eq_ignore_ascii_case("true"), title: f[2].into(), artist: f[3].into(), album: f[4].into(), position: num(f[5]), duration: num(f[6]), volume: None }))
}

#[cfg(windows)]
fn win_control(action: &str) -> Result<(), String> {
    // volume: the system's own volume keys (VK_VOLUME_UP / DOWN)
    if action == "vol+" || action == "vol-" {
        let key = if action == "vol+" { 175 } else { 174 };
        run(Command::new("powershell.exe").args(["-NoProfile", "-Command", &format!("$w = New-Object -ComObject WScript.Shell; 1..5 | ForEach-Object {{ $w.SendKeys([char]{key}) }}")]))?;
        return Ok(());
    }
    let call = match action {
        "toggle" => "TryTogglePlayPauseAsync",
        "play" => "TryPlayAsync",
        "pause" => "TryPauseAsync",
        "next" => "TrySkipNextAsync",
        "prev" => "TrySkipPreviousAsync",
        a if a.starts_with("vol:") => return Err("on Windows: music vol + / - (the system volume)".into()),
        other => return Err(format!("unknown action {other}")),
    };
    win_ps(&format!("if (-not $s) {{ exit }}\n[void](Await ($s.{call}()) ([bool]))"))?;
    Ok(())
}

/// toggle · play · pause · next · prev · vol+ · vol- · vol:<0-100>
#[tauri::command(async)]
pub fn media_control(action: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    return mac_control(&action);
    #[cfg(target_os = "linux")]
    return linux_control(&action);
    #[cfg(windows)]
    return win_control(&action);
    #[cfg(not(any(target_os = "macos", target_os = "linux", windows)))]
    {
        let _ = action;
        Err("music control isn't available on this system yet".into())
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn numbers_with_a_comma() {
        assert_eq!(super::num("12,5"), 12.5);
        assert_eq!(super::num(" 3.25\n"), 3.25);
        assert_eq!(super::num("x"), 0.0);
    }
}
