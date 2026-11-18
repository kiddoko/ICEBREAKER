//! The deck's voice: text → a WAV file the UI plays through its "robot" effect
//! chain (src/core/voice.ts). Everything runs on this computer.
//!
//! Engines:
//! - piper  — open-source neural voices (github.com/rhasspy/piper), run by
//!            sherpa-onnx's offline TTS (github.com/k2-fsa/sherpa-onnx, Apache-2).
//!            `voice_install` downloads both into the app data dir (once,
//!            ~20 MB + ~65 MB per voice). Natural, clearly synthetic, fast.
//! - system — what the OS already has: `say` on macOS, `espeak-ng` on Linux,
//!            SAPI on Windows. Works with no download.
//!
//! Text goes through stdin or a temp file, never through a shell.

use serde::Serialize;
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

/// The neural engine: sherpa-onnx's offline TTS, which runs piper voices.
/// (piper's own 2023 macOS builds are broken: x86-only, missing libraries.)
fn piper_bin(app: &AppHandle) -> Option<PathBuf> {
    let exe = dir(app).ok()?.join("engine").join("bin").join(if cfg!(windows) { "sherpa-onnx-offline-tts.exe" } else { "sherpa-onnx-offline-tts" });
    exe.is_file().then_some(exe)
}

/// Installed voices: folders voice/models/<name>/ holding <name>.onnx, tokens.txt, espeak-ng-data/.
fn piper_voices(app: &AppHandle) -> Vec<String> {
    let Ok(d) = dir(app) else { return vec![] };
    let mut v: Vec<String> = std::fs::read_dir(d.join("models"))
        .map(|rd| rd.flatten().filter(|e| e.path().is_dir()).filter_map(|e| e.file_name().to_str().map(String::from)).collect())
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
    let model_dir = dir(&app)?.join("models").join(&voice);
    let tmp2 = tmp.clone();
    tauri::async_runtime::spawn_blocking(move || -> Result<(), String> {
        let rate = rate.clamp(0.5, 2.0);
        if engine == "piper" {
            let bin = piper.ok_or("the neural voice isn't installed — voice install")?;
            let m = model_dir.clone();
            let onnx = std::fs::read_dir(&m)
                .ok()
                .and_then(|rd| rd.flatten().map(|e| e.path()).find(|p| p.extension().is_some_and(|x| x == "onnx")))
                .ok_or(format!("no voice \"{voice}\" — voice install"))?;
            let out = quiet(
                Command::new(&bin)
                    .arg(format!("--vits-model={}", onnx.display()))
                    .arg(format!("--vits-tokens={}", m.join("tokens.txt").display()))
                    .arg(format!("--vits-data-dir={}", m.join("espeak-ng-data").display()))
                    .arg(format!("--vits-length-scale={:.2}", 1.0 / rate))
                    .arg("--num-threads=2")
                    .arg(format!("--output-filename={}", tmp2.display()))
                    .arg(&text),
            )
            .stdout(Stdio::null())
            .output()
            .map_err(|e| format!("neural voice: {e}"))?;
            if !out.status.success() || !tmp2.is_file() {
                return Err(format!("neural voice: {}", String::from_utf8_lossy(&out.stderr).lines().filter(|l| !l.trim().is_empty()).last().unwrap_or("failed")));
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

/// Download the neural engine (once) and one voice — "fr" or "en" — into the app data dir.
#[tauri::command]
pub async fn voice_install(app: AppHandle, lang: String) -> Result<String, String> {
    let d = dir(&app)?;
    let has_engine = piper_bin(&app).is_some();
    tauri::async_runtime::spawn_blocking(move || {
        let get = |url: &str, to: &std::path::Path| -> Result<(), String> {
            let out = quiet(Command::new("curl").args(["-sSLf", "--max-time", "900", "--proto", "=https", "-o"]).arg(to).arg(url)).output().map_err(|e| format!("curl: {e}"))?;
            if !out.status.success() {
                return Err(format!("download failed: {url}\n{}", String::from_utf8_lossy(&out.stderr).trim()));
            }
            Ok(())
        };
        let untar = |archive: &std::path::Path, into: &std::path::Path| -> Result<(), String> {
            std::fs::create_dir_all(into).map_err(|e| e.to_string())?;
            let ok = quiet(Command::new("tar").arg("-xjf").arg(archive).arg("-C").arg(into)).status().map_err(|e| format!("tar: {e}"))?.success();
            let _ = std::fs::remove_file(archive);
            if ok { Ok(()) } else { Err("couldn't unpack the download".into()) }
        };
        // leftovers of the old (broken) piper download
        let _ = std::fs::remove_dir_all(d.join("piper"));
        if let Ok(rd) = std::fs::read_dir(&d) {
            for e in rd.flatten() {
                if e.file_name().to_string_lossy().contains(".onnx") {
                    let _ = std::fs::remove_file(e.path());
                }
            }
        }
        if !has_engine {
            const V: &str = "v2.0.1";
            let asset = match (std::env::consts::OS, std::env::consts::ARCH) {
                ("macos", "aarch64") => "osx-arm64",
                ("macos", _) => "osx-x64",
                ("linux", "x86_64") => "linux-x64",
                (os, arch) => return Err(format!("no neural voice build for {os}/{arch} yet — the system voice works: voice engine system")),
            };
            let name = format!("sherpa-onnx-{V}-{asset}-shared");
            let archive = d.join(format!("{name}.tar.bz2"));
            get(&format!("https://github.com/k2-fsa/sherpa-onnx/releases/download/{V}/{name}.tar.bz2"), &archive)?;
            untar(&archive, &d)?;
            let _ = std::fs::remove_dir_all(d.join("engine"));
            std::fs::rename(d.join(&name), d.join("engine")).map_err(|e| format!("install: {e}"))?;
        }
        // female voices: Jenny (British English), Amy (American English), Siwis (French)
        let model = match lang.as_str() {
            "en" | "en-gb" => "vits-piper-en_GB-jenny_dioco-medium",
            "en-us" => "vits-piper-en_US-amy-medium",
            "fr" => "vits-piper-fr_FR-siwis-medium",
            "ja" => return Err("Japanese speaks with the system's Japanese voice (Kyoko on macOS): nothing to download".into()),
            other => return Err(format!("no voice for \"{other}\" yet (en, en-us, fr, ja)")),
        };
        let models = d.join("models");
        let archive = d.join(format!("{model}.tar.bz2"));
        get(&format!("https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/{model}.tar.bz2"), &archive)?;
        let _ = std::fs::remove_dir_all(models.join(model));
        untar(&archive, &models)?;
        Ok(model.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}
