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
//! Text never goes through a shell. The system voices read it from a private temp file;
//! the neural engine takes it as an argument (the only way it accepts text): while it
//! speaks, other users of this computer could see that text in the list of processes.

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
    tauri::async_runtime::spawn_blocking(system_voices).await.map_err(|e| e.to_string())?
}

/// The voices the system engine offers (asks the OS: `say -v ?`, SAPI, `espeak --voices`).
fn system_voices() -> Result<Vec<VoiceName>, String> {
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
}

/// The system voices seen last (asking Windows costs a PowerShell start: once, then on a miss).
static SYSTEM_VOICES: std::sync::Mutex<Vec<String>> = std::sync::Mutex::new(Vec::new());

/// Is `voice` one the system engine lists? A voice name comes from the settings, which a
/// synced plain vault or a module could have written: only names the OS itself gave are
/// ever handed to it (Fable pass 24/11: a crafted name ran PowerShell code).
fn is_system_voice(voice: &str) -> bool {
    let known = |list: &Vec<String>| list.iter().any(|v| v == voice);
    if let Ok(list) = SYSTEM_VOICES.lock() {
        if known(&list) {
            return true;
        }
    }
    let fresh: Vec<String> = system_voices().map(|v| v.into_iter().map(|n| n.id).collect()).unwrap_or_default();
    let ok = known(&fresh);
    if let Ok(mut list) = SYSTEM_VOICES.lock() {
        *list = fresh;
    }
    ok
}

/// A voice name we may pass on at all: a name (never a path), never read as an option.
fn plausible_voice_name(voice: &str) -> bool {
    voice.chars().count() <= 128 && !voice.starts_with('-') && !voice.contains("..") && !voice.chars().any(|c| c.is_control() || c == '/' || c == '\\')
}

/// The PowerShell script SAPI runs. It holds NO value of ours: the voice, the rate and the
/// two file paths reach it through environment variables (IB_VOICE, IB_RATE, IB_OUT, IB_TXT),
/// which PowerShell reads as plain data — nothing in them can end a quote and run code.
const SAPI_SCRIPT: &str = "Add-Type -AssemblyName System.Speech; $s = New-Object System.Speech.Synthesis.SpeechSynthesizer; if ($env:IB_VOICE) { $s.SelectVoice($env:IB_VOICE) }; $s.Rate = [int]$env:IB_RATE; $s.SetOutputToWaveFile($env:IB_OUT); $s.Speak([IO.File]::ReadAllText($env:IB_TXT)); $s.Dispose()";

/// A folder only your user can open, for the voice's work files.
fn private_dir(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let d = app.path().app_cache_dir().map_err(|e| e.to_string())?.join("voice");
    std::fs::create_dir_all(&d).map_err(|e| e.to_string())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&d, std::fs::Permissions::from_mode(0o700));
    }
    // what a crash left (a note's text, its sound): wiped
    crate::crypto::sweep_work_files(&d, "voice-");
    Ok(d)
}

fn random_tag() -> String {
    let mut b = [0u8; 8];
    let _ = getrandom::getrandom(&mut b);
    b.iter().map(|x| format!("{x:02x}")).collect()
}

/// Speak `text` into a WAV (or AIFF on macOS) and return its bytes.
#[tauri::command]
pub async fn voice_speak(app: AppHandle, text: String, engine: String, voice: String, rate: f64) -> Result<tauri::ipc::Response, String> {
    // a voice is a name (a folder of models/, a system voice): never a path, never an option
    if !plausible_voice_name(&voice) {
        return Err(format!("{voice}: not a voice name"));
    }
    let text: String = text.chars().filter(|c| !c.is_control() || *c == '\n').take(4000).collect();
    // the neural engine gets the text as an argument: one starting with "-" would be read as
    // an option ("--output-filename=…" could write anywhere) — never let it look like one
    let text = if text.trim_start().starts_with('-') { format!("… {}", text.trim_start().trim_start_matches('-')) } else { text };
    if text.trim().is_empty() {
        return Err("nothing to say".into());
    }
    // the spoken text (a note's) and its sound: in the app's own cache folder (yours only),
    // random names — never the shared /tmp, where another user could plant a link
    let work = private_dir(&app)?;
    let tag = random_tag();
    let tmp = work.join(format!("voice-{tag}.wav"));
    let txt_path = work.join(format!("voice-{tag}.txt"));
    // both wiped whatever happens (an error, a `?`): crypto::WipeOnDrop
    let _wipe_wav = crate::crypto::WipeOnDrop(tmp.clone());
    let _wipe_txt = crate::crypto::WipeOnDrop(txt_path.clone());
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
            // the engine's libraries sit next to it (lib/, and bin/ on Windows)
            let root = bin.parent().and_then(|p| p.parent()).map(|p| p.to_path_buf()).unwrap_or_default();
            let mut command = Command::new(&bin);
            #[cfg(windows)]
            command.env("PATH", format!("{};{};{}", root.join("bin").display(), root.join("lib").display(), std::env::var("PATH").unwrap_or_default()));
            #[cfg(target_os = "linux")]
            command.env("LD_LIBRARY_PATH", format!("{}:{}", root.join("lib").display(), std::env::var("LD_LIBRARY_PATH").unwrap_or_default()));
            let _ = &root;
            let out = quiet(
                command
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
                // keep the whole log (voice/last-error.log) and show its most telling line
                let err = String::from_utf8_lossy(&out.stderr).to_string();
                if let Some(log) = m.parent().and_then(|p| p.parent()).map(|p| p.join("last-error.log")) {
                    let _ = std::fs::write(log, &err);
                }
                let line = err
                    .lines()
                    .filter(|l| !l.trim().is_empty() && !l.contains("Please read previous error"))
                    .rfind(|l| l.to_lowercase().contains("error") || l.to_lowercase().contains("fail") || l.contains("not "))
                    .unwrap_or("failed — see voice/last-error.log")
                    .trim()
                    .chars()
                    .take(200)
                    .collect::<String>();
                return Err(format!("neural voice \"{voice}\": {line}"));
            }
            return Ok(());
        }
        let sys = system_engine().ok_or("no system voice here (Linux: install espeak-ng) — or voice install for piper")?;
        // only a voice the OS itself lists (the name came from the settings: anyone's)
        if !voice.is_empty() && !is_system_voice(&voice) {
            return Err(format!("no system voice \"{voice}\" — voice list"));
        }
        let txt = txt_path.clone();
        // macOS and Linux: the text through stdin, never in a file. Windows' SAPI reads a
        // private file (wiped right after: _wipe_txt), PowerShell's stdin mangles accents.
        let fed = |mut c: Command| -> std::io::Result<std::process::ExitStatus> {
            c.stdin(Stdio::piped());
            let mut child = c.spawn()?;
            if let Some(mut i) = child.stdin.take() {
                use std::io::Write;
                let _ = i.write_all(text.as_bytes());
            }
            child.wait()
        };
        let status = match sys.as_str() {
            "say" => {
                let mut c = Command::new("say");
                if !voice.is_empty() {
                    c.args(["-v", &voice]);
                }
                c.args(["-r", &format!("{}", (185.0 * rate) as u32), "--file-format=WAVE", "--data-format=LEI16@22050", "-o"]).arg(&tmp2).args(["-f", "-"]);
                fed(c)
            }
            "sapi" => {
                crate::crypto::write_private(&txt, text.as_bytes()).map_err(|e| e.to_string())?;
                let mut c = Command::new("powershell");
                c.args(["-NoProfile", "-NonInteractive", "-Command", SAPI_SCRIPT])
                    .env("IB_VOICE", &voice)
                    .env("IB_RATE", (((rate - 1.0) * 6.0).round() as i32).to_string())
                    .env("IB_OUT", &tmp2)
                    .env("IB_TXT", &txt);
                quiet(&mut c).status()
            }
            other => {
                let mut c = Command::new(other);
                if !voice.is_empty() {
                    c.args(["-v", &voice]);
                }
                c.args(["-s", &format!("{}", (170.0 * rate) as u32), "-w"]).arg(&tmp2).arg("--stdin");
                fed(c)
            }
        }
        .map_err(|e| format!("{sys}: {e}"))?;
        if txt.exists() {
            let _ = crate::crypto::wipe_file(&txt);
        }
        if !status.success() {
            return Err(format!("{sys} failed (voice \"{voice}\"?)"));
        }
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())??;
    let bytes = std::fs::read(&tmp).map_err(|e| e.to_string())?;
    // (the sound file: wiped by _wipe_wav, here or on any error above)
    Ok(tauri::ipc::Response::new(bytes))
}

/// SHA-256 of a file, as lowercase hex (read in pieces: the downloads are tens of MB).
fn file_sha256(path: &std::path::Path) -> std::io::Result<String> {
    use sha2::{Digest, Sha256};
    use std::io::Read;
    let mut f = std::fs::File::open(path)?;
    let mut h = Sha256::new();
    let mut buf = vec![0u8; 1 << 16];
    loop {
        let n = f.read(&mut buf)?;
        if n == 0 {
            break;
        }
        h.update(&buf[..n]);
    }
    Ok(h.finalize().iter().map(|b| format!("{b:02x}")).collect())
}

/// Download the neural engine (once) and one voice — "fr" or "en" — into the app data dir.
#[tauri::command]
pub async fn voice_install(app: AppHandle, lang: String) -> Result<String, String> {
    crate::config::online(&app, "downloading a voice")?;
    let d = dir(&app)?;
    let has_engine = piper_bin(&app).is_some();
    tauri::async_runtime::spawn_blocking(move || {
        // What's downloaded here is a program that will run: it must be, byte for byte, the
        // file ICEBREAKER was built to expect (its SHA-256, below) — else it's deleted, unopened.
        let get = |url: &str, to: &std::path::Path, sha256: &str| -> Result<(), String> {
            let out = quiet(Command::new("curl").args(["-q", "-sSLf", "--max-time", "900", "--proto", "=https", "--proto-redir", "=https", "-o"]).arg(to).arg("--").arg(url)).output().map_err(|e| format!("curl: {e}"))?;
            if !out.status.success() {
                return Err(format!("download failed: {url}\n{}", String::from_utf8_lossy(&out.stderr).trim()));
            }
            let got = file_sha256(to).map_err(|e| format!("{}: {e}", to.display()))?;
            if got != sha256 {
                let _ = std::fs::remove_file(to);
                return Err(format!("the download isn't the file ICEBREAKER expects (it was deleted, nothing was installed): {url}\nIt may have been replaced or damaged on the way — try again later, or update ICEBREAKER."));
            }
            Ok(())
        };
        let untar = |archive: &std::path::Path, into: &std::path::Path| -> Result<(), String> {
            std::fs::create_dir_all(into).map_err(|e| e.to_string())?;
            let ok = quiet(Command::new("tar").arg("-xjf").arg(archive).arg("-C").arg(into)).status().map_err(|e| format!("tar: {e}"))?.success();
            let _ = std::fs::remove_file(archive);
            if ok { Ok(()) } else { Err("couldn't unpack the download".into()) }
        };
        // leftovers of the old (broken) piper download, and the first English voice we shipped
        let _ = std::fs::remove_dir_all(d.join("piper"));
        let _ = std::fs::remove_dir_all(d.join("models").join("vits-piper-en_US-lessac-medium"));
        if let Ok(rd) = std::fs::read_dir(&d) {
            for e in rd.flatten() {
                if e.file_name().to_string_lossy().contains(".onnx") {
                    let _ = std::fs::remove_file(e.path());
                }
            }
        }
        if !has_engine {
            const V: &str = "v2.0.1";
            // the same engine and voices everywhere (Windows: the static-CRT build, no VC++ runtime needed)
            // (the file, its SHA-256 as GitHub publishes it for release v2.0.1)
            let (asset, sum) = match (std::env::consts::OS, std::env::consts::ARCH) {
                ("macos", "aarch64") => ("osx-arm64-shared", "5e874d3c9b3d6b8c71f7c09e3a9fb9ae846c3009129d302b398d1f7aedb69f84"),
                ("macos", _) => ("osx-x64-shared", "100315fbb174de2d7fec92b67d28c4128499daf3a6f47b4da6350252680d178f"),
                ("linux", "x86_64") => ("linux-x64-shared", "2e823376987c3b6960d50726b6560155e2ad92da0b8b3886325773225ec6bdec"),
                ("linux", "aarch64") => ("linux-aarch64-shared-cpu", "a8fc9fb3940d1aa3f83136767742b05068f00253f560d53c4f5aeb75ab4cb350"),
                ("windows", "x86_64") => ("win-x64-shared-MT-Release", "dc703575a68594435f53dec93df775ff4913af851a196c0537163f21d8d2364e"),
                ("windows", "aarch64") => ("win-arm64-shared-MT-Release", "d6faf59919314d4728a2701e715ea748a8a5d846fde1f1d58a38ecd91c848011"),
                (os, arch) => return Err(format!("no neural voice build for {os}/{arch} yet — the system voice works: voice engine system")),
            };
            let name = format!("sherpa-onnx-{V}-{asset}");
            let archive = d.join(format!("{name}.tar.bz2"));
            get(&format!("https://github.com/k2-fsa/sherpa-onnx/releases/download/{V}/{name}.tar.bz2"), &archive, sum)?;
            untar(&archive, &d)?;
            let _ = std::fs::remove_dir_all(d.join("engine"));
            std::fs::rename(d.join(&name), d.join("engine")).map_err(|e| format!("install: {e}"))?;
        }
        // female voices: Jenny (British English), Amy (American English), Siwis (French)
        let (model, sum) = match lang.as_str() {
            "en" | "en-gb" => ("vits-piper-en_GB-jenny_dioco-medium", "a0888024569bafbefc05a4b48ddf8419d8dbbf3205f4af37cf7c6f1a87cc20c5"),
            "en-us" => ("vits-piper-en_US-amy-medium", "9a5d1fc497f85e8022b785bff5f8105203b1e33099ee6265203efc70b0cb0264"),
            "fr" => ("vits-piper-fr_FR-siwis-medium", "375909aa30842b3a4efa10b1beb1d761af792960ae6873b4d53889f96c66195b"),
            "ja" => return Err("Japanese speaks with the system's Japanese voice (Kyoko on macOS): nothing to download".into()),
            other => return Err(format!("no voice for \"{other}\" yet (en, en-us, fr, ja)")),
        };
        let models = d.join("models");
        let archive = d.join(format!("{model}.tar.bz2"));
        get(&format!("https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/{model}.tar.bz2"), &archive, sum)?;
        let _ = std::fs::remove_dir_all(models.join(model));
        untar(&archive, &models)?;
        Ok(model.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_sapi_script_holds_no_value_of_ours() {
        // Fable pass 24/11: a voice name with U+2019 ended PowerShell's quote and ran code.
        // The script is a constant: the name only ever travels in IB_VOICE.
        for bad in ['\'', '\u{2018}', '\u{2019}', '\u{201A}', '\u{201B}'] {
            assert!(!SAPI_SCRIPT.contains(bad), "quote {bad:?} in the script");
        }
        for var in ["$env:IB_VOICE", "$env:IB_RATE", "$env:IB_OUT", "$env:IB_TXT"] {
            assert!(SAPI_SCRIPT.contains(var));
        }
    }

    #[test]
    fn a_crafted_voice_name_is_never_a_system_voice() {
        let payload = "a\u{2019}); Set-Content (Join-Path $env:TEMP proof.txt) INJECTED; (\u{2018}b";
        assert!(!is_system_voice(payload));
        assert!(!plausible_voice_name("--output-filename=x"));
        assert!(!plausible_voice_name("../x"));
        assert!(!plausible_voice_name("a\nb"));
        assert!(plausible_voice_name("Thomas"));
        assert!(plausible_voice_name("fr_FR-siwis-medium"));
    }
}
