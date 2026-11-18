//! The deck's voice: text → a WAV file the UI plays through its "robot" effect
//! chain (src/core/voice.ts). Everything runs on this computer.
//!
//! Engines:
//! - piper  — open-source neural TTS (github.com/rhasspy/piper), small and fast,
//!            natural but clearly synthetic. `voice_install` downloads it and a
//!            voice into the app data dir (once, ~25 MB + ~60 MB per voice).
//! - system — what the OS already has: `say` on macOS, `espeak-ng` on Linux,
//!            SAPI on Windows. Works with no download.
//!
//! Text goes through stdin or a temp file, never through a shell.

use serde::Serialize;
use std::io::Write;
use std::path::PathBuf;
use std::process::{Command, Stdio};
use tauri::{AppHandle, Manager};

#[derive(Serialize)]
pub struct VoiceInfo {
    /// the system engine's name, if there is one ("say", "espeak-ng", "sapi")
    system: Option<String>,
    /// piper is installed
    piper: bool,
    /// installed piper voices (model file names without .onnx)
    piper_voices: Vec<String>,
}

#[derive(Serialize)]
pub struct VoiceName {
    id: String,
    lang: String,
}

fn dir(app: &AppHandle) -> Result<PathBuf, String> {
    let d = app.path().app_data_dir().map_err(|e| e.to_string())?.join("voice");
    std::fs::create_dir_all(&d).map_err(|e| e.to_string())?;
    Ok(d)
}

fn piper_bin(app: &AppHandle) -> Option<PathBuf> {
    let d = dir(app).ok()?.join("piper");
    let exe = if cfg!(windows) { d.join("piper.exe") } else { d.join("piper") };
    exe.is_file().then_some(exe)
}

fn piper_voices(app: &AppHandle) -> Vec<String> {
    let Ok(d) = dir(app) else { return vec![] };
    let mut v: Vec<String> = std::fs::read_dir(d)
        .map(|rd| rd.flatten().filter_map(|e| e.file_name().to_str().and_then(|n| n.strip_suffix(".onnx")).map(String::from)).collect())
        .unwrap_or_default();
    v.sort();
    v
}

fn which(cmd: &str) -> bool {
    let probe = if cfg!(windows) { "where" } else { "which" };
    Command::new(probe).arg(cmd).stdout(Stdio::null()).stderr(Stdio::null()).status().map(|s| s.success()).unwrap_or(false)
}

fn system_engine() -> Option<String> {
    if cfg!(target_os = "macos") {
        Some("say".into())
    } else if cfg!(windows) {
        Some("sapi".into())
    } else if which("espeak-ng") {
        Some("espeak-ng".into())
    } else if which("espeak") {
        Some("espeak".into())
    } else {
        None
    }
}

fn quiet(cmd: &mut Command) -> &mut Command {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000);
    }
    cmd
}

#[tauri::command]
pub fn voice_info(app: AppHandle) -> VoiceInfo {
    VoiceInfo { system: system_engine(), piper: piper_bin(&app).is_some(), piper_voices: piper_voices(&app) }
}

/// The voices an engine offers.
#[tauri::command]
pub async fn voice_list(app: AppHandle, engine: String) -> Result<Vec<VoiceName>, String> {
    if engine == "piper" {
        return Ok(piper_voices(&app).into_iter().map(|id| VoiceName { lang: id.split('-').next().unwrap_or("").to_string(), id }).collect());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let sys = system_engine().ok_or("no system voice here (Linux: install espeak-ng)")?;
        let out = match sys.as_str() {
            "say" => Command::new("say").args(["-v", "?"]).output(),
            "sapi" => quiet(Command::new("powershell").args(["-NoProfile", "-Command", "Add-Type -AssemblyName System.Speech; (New-Object System.Speech.Synthesis.SpeechSynthesizer).GetInstalledVoices() | % { $_.VoiceInfo.Name + '|' + $_.VoiceInfo.Culture }"])).output(),
            other => Command::new(other).arg("--voices").output(),
        }
        .map_err(|e| e.to_string())?;
        let text = String::from_utf8_lossy(&out.stdout);
        let mut v = vec![];
        for line in text.lines() {
            match sys.as_str() {
                // "Thomas              fr_FR    # Bonjour, je m'appelle Thomas."
                "say" => {
                    let head = line.split('#').next().unwrap_or("").trim_end();
                    if let Some(i) = head.rfind(char::is_whitespace) {
                        let (name, lang) = (head[..i].trim(), head[i..].trim());
                        if !name.is_empty() {
                            v.push(VoiceName { id: name.to_string(), lang: lang.to_string() });
                        }
                    }
                }
                "sapi" => {
                    if let Some((n, l)) = line.split_once('|') {
                        v.push(VoiceName { id: n.trim().to_string(), lang: l.trim().to_string() });
                    }
                }
                // " 5  fr-fr          --/M      French             roa/fr"
                _ => {
                    let cols: Vec<&str> = line.split_whitespace().collect();
                    if cols.len() >= 4 && cols[0].parse::<u32>().is_ok() {
                        v.push(VoiceName { id: cols[1].to_string(), lang: cols[1].to_string() });
                    }
                }
            }
        }
        Ok(v)
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Speak `text` into a WAV (or AIFF on macOS) and return its bytes.
#[tauri::command]
pub async fn voice_speak(app: AppHandle, text: String, engine: String, voice: String, rate: f64) -> Result<tauri::ipc::Response, String> {
    let text: String = text.chars().filter(|c| !c.is_control() || *c == '\n').take(4000).collect();
    if text.trim().is_empty() {
        return Err("nothing to say".into());
    }
    let tmp = std::env::temp_dir().join(format!("icebreaker-voice-{}.wav", std::process::id()));
    let piper = piper_bin(&app);
    let model = dir(&app)?.join(format!("{voice}.onnx"));
    let tmp2 = tmp.clone();
    tauri::async_runtime::spawn_blocking(move || -> Result<(), String> {
        let rate = rate.clamp(0.5, 2.0);
        if engine == "piper" {
            let bin = piper.ok_or("piper isn't installed — voice install")?;
            if !model.is_file() {
                return Err(format!("no piper voice \"{voice}\" — voice install"));
            }
            let mut child = quiet(Command::new(&bin).arg("--model").arg(&model).arg("--output_file").arg(&tmp2).arg("--length_scale").arg(format!("{:.2}", 1.0 / rate)))
                .stdin(Stdio::piped())
                .stdout(Stdio::null())
                .stderr(Stdio::piped())
                .spawn()
                .map_err(|e| format!("piper: {e}"))?;
            child.stdin.take().unwrap().write_all(text.as_bytes()).map_err(|e| e.to_string())?;
            let out = child.wait_with_output().map_err(|e| e.to_string())?;
            if !out.status.success() {
                return Err(format!("piper: {}", String::from_utf8_lossy(&out.stderr).lines().last().unwrap_or("failed")));
            }
            return Ok(());
        }
        let sys = system_engine().ok_or("no system voice here (Linux: install espeak-ng) — or voice install for piper")?;
        let txt = std::env::temp_dir().join(format!("icebreaker-voice-{}.txt", std::process::id()));
        std::fs::write(&txt, &text).map_err(|e| e.to_string())?;
        let status = match sys.as_str() {
            "say" => {
                let mut c = Command::new("say");
                if !voice.is_empty() {
                    c.args(["-v", &voice]);
                }
                c.args(["-r", &format!("{}", (185.0 * rate) as u32), "--file-format=WAVE", "--data-format=LEI16@22050", "-o"]).arg(&tmp2).arg("-f").arg(&txt).status()
            }
            "sapi" => {
                let script = format!(
                    "Add-Type -AssemblyName System.Speech; $s = New-Object System.Speech.Synthesis.SpeechSynthesizer; {} $s.Rate = {}; $s.SetOutputToWaveFile('{}'); $s.Speak([IO.File]::ReadAllText('{}')); $s.Dispose()",
                    if voice.is_empty() { String::new() } else { format!("$s.SelectVoice('{}');", voice.replace('\'', "''")) },
                    ((rate - 1.0) * 6.0).round() as i32,
                    tmp2.to_string_lossy().replace('\'', "''"),
                    txt.to_string_lossy().replace('\'', "''")
                );
                quiet(Command::new("powershell").args(["-NoProfile", "-Command", &script])).status()
            }
            other => {
                let mut c = Command::new(other);
                if !voice.is_empty() {
                    c.args(["-v", &voice]);
                }
                c.args(["-s", &format!("{}", (170.0 * rate) as u32), "-w"]).arg(&tmp2).arg("-f").arg(&txt).status()
            }
        }
        .map_err(|e| format!("{sys}: {e}"))?;
        let _ = std::fs::remove_file(&txt);
        if !status.success() {
            return Err(format!("{sys} failed (voice \"{voice}\"?)"));
        }
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())??;
    let bytes = std::fs::read(&tmp).map_err(|e| e.to_string())?;
    let _ = std::fs::remove_file(&tmp);
    Ok(tauri::ipc::Response::new(bytes))
}

/// Download piper (once) and one voice ("fr" or "en"…) into the app data dir.
#[tauri::command]
pub async fn voice_install(app: AppHandle, lang: String) -> Result<String, String> {
    let d = dir(&app)?;
    let has_piper = piper_bin(&app).is_some();
    tauri::async_runtime::spawn_blocking(move || {
        let get = |url: &str, to: &std::path::Path| -> Result<(), String> {
            let out = quiet(Command::new("curl").args(["-sSLf", "--max-time", "600", "--proto", "=https", "-o"]).arg(to).arg(url)).output().map_err(|e| format!("curl: {e}"))?;
            if !out.status.success() {
                return Err(format!("download failed: {url}\n{}", String::from_utf8_lossy(&out.stderr).trim()));
            }
            Ok(())
        };
        if !has_piper {
            let base = "https://github.com/rhasspy/piper/releases/download/2023.11.14-2/";
            let asset = match (std::env::consts::OS, std::env::consts::ARCH) {
                ("macos", "aarch64") => "piper_macos_aarch64.tar.gz",
                ("macos", _) => "piper_macos_x64.tar.gz",
                ("linux", "aarch64") => "piper_linux_aarch64.tar.gz",
                ("linux", _) => "piper_linux_x86_64.tar.gz",
                ("windows", _) => "piper_windows_amd64.zip",
                (os, arch) => return Err(format!("no piper build for {os}/{arch}")),
            };
            let archive = d.join(asset);
            get(&format!("{base}{asset}"), &archive)?;
            let ok = quiet(Command::new("tar").arg("-xf").arg(&archive).arg("-C").arg(&d)).status().map_err(|e| format!("tar: {e}"))?.success();
            let _ = std::fs::remove_file(&archive);
            if !ok {
                return Err("couldn't unpack piper".into());
            }
        }
        let model = match lang.as_str() {
            "fr" => "fr/fr_FR/siwis/medium/fr_FR-siwis-medium",
            "en" => "en/en_US/lessac/medium/en_US-lessac-medium",
            "en-gb" => "en/en_GB/alan/medium/en_GB-alan-medium",
            "de" => "de/de_DE/thorsten/medium/de_DE-thorsten-medium",
            "es" => "es/es_ES/davefx/medium/es_ES-davefx-medium",
            other => return Err(format!("no voice for \"{other}\" yet (fr, en, en-gb, de, es)")),
        };
        let name = model.rsplit('/').next().unwrap();
        let hf = format!("https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/{model}");
        get(&format!("{hf}.onnx"), &d.join(format!("{name}.onnx")))?;
        get(&format!("{hf}.onnx.json"), &d.join(format!("{name}.onnx.json")))?;
        Ok(name.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}
