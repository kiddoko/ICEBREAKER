//! The encoder pack: a small ffmpeg, built by ICEBREAKER's own CI (scripts/encoders/,
//! .github/workflows/encoders.yml) under the LGPL, that only turns raw sound into
//! MP3, M4A (AAC), OGG (Vorbis) and Opus. Modules use it through `ib.audio.encode`
//! (a tracker exporting a song).
//!
//! - `encoders_install` downloads it once (~3 MB) from the `encoders-v1` release into the
//!   app data folder. The archive must be, byte for byte, the one this build of
//!   ICEBREAKER expects (its SHA-256, below): else it's deleted, never unpacked or run.
//! - `encode_audio` runs it as a separate program (never linked): raw floats on its
//!   stdin, the encoded file written in a private temp folder, read back, deleted.
//!   Its arguments are built here from a short whitelist (format, quality, rate,
//!   channels, a cleaned-up title): a module never passes text of its own to ffmpeg.
//!   The program itself was built without any network code (`--disable-network`).

use serde::Serialize;
use std::ffi::OsString;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager};

/// The release the pack comes from, and its archives' SHA-256 (as the CI published them).
const RELEASE: &str = "encoders-v1";
const REPO: &str = "https://github.com/kiddoko/ICEBREAKER/releases/download";

/// This computer's archive: (file name, SHA-256, folder inside it).
fn asset() -> Option<(&'static str, &'static str, &'static str)> {
    match (std::env::consts::OS, std::env::consts::ARCH) {
        // one universal binary (arm64 + x86_64)
        ("macos", _) => Some(("icebreaker-encoders-macos-universal.tar.gz", "c08cac82db0a80a5a9f86811d1b868f98cda0d46b5f799572ee066c8f3053562", "icebreaker-encoders-macos-universal")),
        // Windows on ARM runs the x64 build
        ("windows", _) => Some(("icebreaker-encoders-windows-x64.zip", "1701e754fe85a8349e5e6681bd152bd939529adad3e003bd83917818f43b513f", "icebreaker-encoders-windows-x64")),
        ("linux", "x86_64") => Some(("icebreaker-encoders-linux-x64.tar.gz", "8d54ecf061c7a3a31135cef7ff22e6b6b0a81a466405737ed6c23d6c8164a447", "icebreaker-encoders-linux-x64")),
        _ => None,
    }
}

/// The formats, in the order `encoders` lists them.
pub const FORMATS: [&str; 4] = ["mp3", "m4a", "ogg", "opus"];

/// The most raw sound `encode_audio` takes (like a module's binary files), and the
/// biggest file it gives back.
const MAX_IN: usize = 256 * 1024 * 1024;
const MAX_OUT: u64 = 256 * 1024 * 1024;
/// An encode that takes longer is stopped (3 minutes of a song take a few seconds).
const TIMEOUT: Duration = Duration::from_secs(600);

#[derive(Serialize)]
pub struct EncodersInfo {
    /// the pack is installed and runnable
    installed: bool,
    /// which release it came from ("encoders-v1")
    version: Option<String>,
    /// what it encodes to
    formats: Vec<&'static str>,
    /// there's a build of the pack for this computer
    supported: bool,
}

fn dir(app: &AppHandle) -> Result<PathBuf, String> {
    let d = app.path().app_data_dir().map_err(|e| e.to_string())?.join("encoders");
    std::fs::create_dir_all(&d).map_err(|e| e.to_string())?;
    Ok(d)
}

fn bin(app: &AppHandle) -> Option<PathBuf> {
    let exe = dir(app).ok()?.join("pack").join(if cfg!(windows) { "ffmpeg.exe" } else { "ffmpeg" });
    exe.is_file().then_some(exe)
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
pub fn encoders_info(app: AppHandle) -> EncodersInfo {
    let installed = bin(&app).is_some();
    let version = installed
        .then(|| dir(&app).ok().and_then(|d| std::fs::read_to_string(d.join("pack").join("version.txt")).ok()).map(|v| v.trim().to_string()))
        .flatten();
    EncodersInfo { installed, version, formats: FORMATS.to_vec(), supported: asset().is_some() }
}

/// SHA-256 of a file, as lowercase hex.
fn file_sha256(path: &Path) -> std::io::Result<String> {
    use sha2::{Digest, Sha256};
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

fn random_tag() -> String {
    let mut b = [0u8; 8];
    let _ = getrandom::getrandom(&mut b);
    b.iter().map(|x| format!("{x:02x}")).collect()
}

/// Download the pack (once) and unpack it into <app data>/encoders/pack/. Resolves with
/// the release's name.
#[tauri::command]
pub async fn encoders_install(app: AppHandle) -> Result<String, String> {
    crate::config::online(&app, "downloading the encoder pack")?;
    let d = dir(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
        let (name, sum, folder) = asset().ok_or_else(|| format!("no encoder pack for {}/{} yet (macOS, Windows, Linux x64)", std::env::consts::OS, std::env::consts::ARCH))?;
        let url = format!("{REPO}/{RELEASE}/{name}");
        let archive = d.join(name);
        let out = quiet(Command::new("curl").args(["-q", "-sSLf", "--max-time", "600", "--proto", "=https", "--proto-redir", "=https", "-o"]).arg(&archive).arg("--").arg(&url))
            .output()
            .map_err(|e| format!("curl: {e}"))?;
        if !out.status.success() {
            let _ = std::fs::remove_file(&archive);
            return Err(format!("download failed: {url}\n{}", String::from_utf8_lossy(&out.stderr).trim()));
        }
        // a program that will run: exactly the file this build expects, or nothing
        let got = file_sha256(&archive).map_err(|e| format!("{}: {e}", archive.display()))?;
        if got != sum {
            let _ = std::fs::remove_file(&archive);
            return Err(format!("the download isn't the file ICEBREAKER expects (it was deleted, nothing was installed): {url}\nIt may have been replaced or damaged on the way — try again later, or update ICEBREAKER."));
        }
        // unpacked aside first, then moved in place: a failed install leaves the old pack
        let work = d.join(format!("unpack-{}", random_tag()));
        std::fs::create_dir_all(&work).map_err(|e| e.to_string())?;
        // tar reads .tar.gz everywhere, and .zip on Windows (its tar is bsdtar)
        let ok = quiet(Command::new("tar").arg("-xf").arg(&archive).arg("-C").arg(&work)).status().map_err(|e| format!("tar: {e}"))?.success();
        let _ = std::fs::remove_file(&archive);
        let unpacked = work.join(folder);
        let exe = unpacked.join(if cfg!(windows) { "ffmpeg.exe" } else { "ffmpeg" });
        if !ok || !exe.is_file() {
            let _ = std::fs::remove_dir_all(&work);
            return Err("couldn't unpack the encoder pack".into());
        }
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let _ = std::fs::set_permissions(&exe, std::fs::Permissions::from_mode(0o755));
        }
        let _ = std::fs::write(unpacked.join("version.txt"), RELEASE);
        let pack = d.join("pack");
        let _ = std::fs::remove_dir_all(&pack);
        let moved = std::fs::rename(&unpacked, &pack).map_err(|e| format!("install: {e}"));
        let _ = std::fs::remove_dir_all(&work);
        moved?;
        Ok(RELEASE.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Delete the pack. Resolves with whether there was one.
#[tauri::command]
pub fn encoders_remove(app: AppHandle) -> Result<bool, String> {
    let d = dir(&app)?;
    let had = d.join("pack").exists();
    std::fs::remove_dir_all(&d).map_err(|e| e.to_string())?;
    Ok(had)
}

/// A title as ffmpeg gets it: printable characters only, at most 100.
fn clean_title(t: &str) -> String {
    t.chars().filter(|c| !c.is_control()).take(100).collect::<String>().trim().to_string()
}

/// What a format is: its file extension, and the encoder / muxer arguments for a quality.
/// `quality` "" is the default (MP3 V0, M4A 256 kbps, OGG q6, Opus 128 kbps).
/// Anything not in this list is refused.
fn codec_args(format: &str, quality: &str) -> Result<(&'static str, Vec<&'static str>), String> {
    let q = quality.to_ascii_lowercase();
    let bad = |choices: &str| Err(format!("{format}: quality \"{quality}\"? ({choices})"));
    Ok(match format {
        "mp3" => {
            let rate: &[&'static str] = match q.as_str() {
                "" | "v0" => &["-q:a", "0"],
                "v2" => &["-q:a", "2"],
                "128" => &["-b:a", "128k"],
                "192" => &["-b:a", "192k"],
                "256" => &["-b:a", "256k"],
                "320" => &["-b:a", "320k"],
                _ => return bad("v0, v2, 128, 192, 256, 320"),
            };
            ("mp3", [&["-c:a", "libmp3lame"], rate, &["-f", "mp3"]].concat())
        }
        "m4a" => {
            let rate = match q.as_str() {
                "128" => "128k",
                "192" => "192k",
                "" | "256" => "256k",
                _ => return bad("128, 192, 256"),
            };
            ("m4a", vec!["-c:a", "aac", "-b:a", rate, "-movflags", "+faststart", "-f", "ipod"])
        }
        "ogg" => {
            let level = match q.as_str() {
                "q4" | "4" => "4",
                "" | "q6" | "6" => "6",
                "q8" | "8" => "8",
                _ => return bad("q4, q6, q8"),
            };
            ("ogg", vec!["-c:a", "libvorbis", "-q:a", level, "-f", "ogg"])
        }
        "opus" => {
            let rate = match q.as_str() {
                "96" => "96k",
                "" | "128" => "128k",
                "160" => "160k",
                _ => return bad("96, 128, 160"),
            };
            ("opus", vec!["-c:a", "libopus", "-b:a", rate, "-f", "opus"])
        }
        other => return Err(format!("\"{other}\": not a format the encoder pack makes (mp3, m4a, ogg, opus)")),
    })
}

/// ffmpeg's whole command line for one encode: raw f32 on stdin → `out`.
fn ffmpeg_args(format: &str, quality: &str, rate: u32, channels: u32, title: &str, out: &Path) -> Result<Vec<OsString>, String> {
    if !(8000..=192_000).contains(&rate) {
        return Err(format!("encode: a rate of {rate} Hz? (8000–192000)"));
    }
    if !(1..=2).contains(&channels) {
        return Err(format!("encode: {channels} channels? (1 or 2)"));
    }
    let (_, codec) = codec_args(format, quality)?;
    let mut a: Vec<OsString> = ["-hide_banner", "-nostdin", "-loglevel", "error", "-y", "-f", "f32le", "-ar"].iter().map(OsString::from).collect();
    a.push(rate.to_string().into());
    a.push("-ac".into());
    a.push(channels.to_string().into());
    a.extend(["-i", "pipe:0", "-map_metadata", "-1"].iter().map(OsString::from));
    let title = clean_title(title);
    if !title.is_empty() {
        a.push("-metadata".into());
        a.push(format!("title={title}").into());
    }
    a.extend(codec.iter().map(OsString::from));
    a.push(out.as_os_str().to_os_string());
    Ok(a)
}

/// A folder only your user can open, for the encodes' temp files.
fn private_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let d = app.path().app_cache_dir().map_err(|e| e.to_string())?.join("encoders");
    std::fs::create_dir_all(&d).map_err(|e| e.to_string())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&d, std::fs::Permissions::from_mode(0o700));
    }
    // an encode a crash cut short left its file (a module's sound): wiped
    crate::crypto::sweep_work_files(&d, "enc-");
    Ok(d)
}

fn header<'a>(request: &'a tauri::ipc::Request<'_>, name: &str) -> &'a str {
    request.headers().get(name).and_then(|v| v.to_str().ok()).unwrap_or("")
}

/// Raw sound (f32 little-endian, interleaved) → an MP3 / M4A / OGG / Opus file's bytes.
/// The body is the sound; `format`, `quality`, `rate`, `channels` and `title`
/// (percent-encoded) come in headers.
#[tauri::command]
pub async fn encode_audio(app: AppHandle, request: tauri::ipc::Request<'_>) -> Result<tauri::ipc::Response, String> {
    let tauri::ipc::InvokeBody::Raw(pcm) = request.body() else {
        return Err("encode: the body must be raw bytes".into());
    };
    let rate: u32 = header(&request, "rate").parse().map_err(|_| "encode: no rate")?;
    let channels: u32 = header(&request, "channels").parse().map_err(|_| "encode: no channels")?;
    let format = header(&request, "format").to_string();
    let quality = header(&request, "quality").to_string();
    let title = crate::vault::percent_decode(header(&request, "title"))?;
    if pcm.is_empty() || pcm.len() > MAX_IN || pcm.len() % (4 * channels.max(1) as usize) != 0 {
        return Err("encode: the sound must be whole frames of 32-bit floats, at most 256 MB".into());
    }
    let exe = bin(&app).ok_or("the encoder pack isn't installed — encoders install")?;
    let work = private_dir(&app)?;
    let (ext, _) = codec_args(&format, &quality)?;
    let out = work.join(format!("enc-{}.{ext}", random_tag()));
    let args = ffmpeg_args(&format, &quality, rate, channels, &title, &out)?;
    let pcm = pcm.clone();
    let out2 = out.clone();
    let result = tauri::async_runtime::spawn_blocking(move || run(&exe, &work, &args, pcm, &out2)).await.map_err(|e| e.to_string())?;
    let bytes = result.and_then(|()| {
        let size = std::fs::metadata(&out).map_err(|e| e.to_string())?.len();
        if size > MAX_OUT {
            return Err("encode: the file came out larger than 256 MB".to_string());
        }
        std::fs::read(&out).map_err(|e| e.to_string())
    });
    let _ = std::fs::remove_file(&out);
    Ok(tauri::ipc::Response::new(bytes?))
}

/// Run ffmpeg: no shell, an empty environment, its own cwd, stdin fed from a thread,
/// killed if it outlasts TIMEOUT.
fn run(exe: &Path, cwd: &Path, args: &[OsString], pcm: Vec<u8>, out: &Path) -> Result<(), String> {
    let mut cmd = Command::new(exe);
    cmd.args(args).env_clear().current_dir(cwd).stdin(Stdio::piped()).stdout(Stdio::null()).stderr(Stdio::piped());
    // Windows' own libraries want to know where Windows is
    #[cfg(windows)]
    if let Some(root) = std::env::var_os("SystemRoot") {
        cmd.env("SystemRoot", root);
    }
    let mut child = quiet(&mut cmd)
        .spawn()
        .map_err(|e| format!("the encoder pack: {e} (encoders install again?)"))?;
    let mut stdin = child.stdin.take().ok_or("encode: no stdin")?;
    let feeder = std::thread::spawn(move || {
        // a broken pipe means ffmpeg stopped early: its own message says why
        let _ = stdin.write_all(&pcm);
    });
    let mut stderr = child.stderr.take().ok_or("encode: no stderr")?;
    let reader = std::thread::spawn(move || {
        let mut s = Vec::new();
        let _ = (&mut stderr).take(64 * 1024).read_to_end(&mut s);
        s
    });
    let start = Instant::now();
    let status = loop {
        if let Some(s) = child.try_wait().map_err(|e| e.to_string())? {
            break s;
        }
        if start.elapsed() > TIMEOUT {
            let _ = child.kill();
            let _ = child.wait();
            let _ = std::fs::remove_file(out);
            return Err("encode: stopped after 10 minutes".into());
        }
        std::thread::sleep(Duration::from_millis(20));
    };
    let _ = feeder.join();
    let err = reader.join().unwrap_or_default();
    if !status.success() || !out.is_file() {
        let _ = std::fs::remove_file(out);
        let line = String::from_utf8_lossy(&err).lines().rfind(|l| !l.trim().is_empty()).unwrap_or("failed").trim().chars().take(200).collect::<String>();
        return Err(format!("encode: {line}"));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn line(format: &str, quality: &str) -> Result<String, String> {
        ffmpeg_args(format, quality, 48000, 2, "", Path::new("out.x")).map(|a| a.iter().map(|x| x.to_string_lossy().into_owned()).collect::<Vec<_>>().join(" "))
    }

    #[test]
    fn defaults_are_the_good_ones() {
        assert!(line("mp3", "").unwrap().contains("-c:a libmp3lame -q:a 0 -f mp3"));
        assert!(line("m4a", "").unwrap().contains("-c:a aac -b:a 256k -movflags +faststart -f ipod"));
        assert!(line("ogg", "").unwrap().contains("-c:a libvorbis -q:a 6 -f ogg"));
        assert!(line("opus", "").unwrap().contains("-c:a libopus -b:a 128k -f opus"));
        let l = line("mp3", "320").unwrap();
        assert!(l.starts_with("-hide_banner -nostdin -loglevel error -y -f f32le -ar 48000 -ac 2 -i pipe:0 -map_metadata -1 "), "{l}");
        assert!(l.ends_with("-b:a 320k -f mp3 out.x"), "{l}");
    }

    #[test]
    fn only_the_whitelist() {
        assert!(line("wav", "").is_err());
        assert!(line("mp3", "999").is_err());
        assert!(line("mp3", "-f null").is_err());
        assert!(line("ogg", "q10").is_err());
        assert!(line("opus", "64").is_err());
        assert!(line("../mp3", "").is_err());
        assert!(ffmpeg_args("mp3", "", 7999, 2, "", Path::new("o")).is_err());
        assert!(ffmpeg_args("mp3", "", 48000, 3, "", Path::new("o")).is_err());
        assert!(ffmpeg_args("mp3", "", 48000, 0, "", Path::new("o")).is_err());
        assert_eq!(codec_args("OGG", "Q8").map(|x| x.0).ok(), None, "the format is lower case");
        assert_eq!(codec_args("ogg", "Q8").map(|x| x.1.join(" ")).unwrap(), "-c:a libvorbis -q:a 8 -f ogg");
    }

    #[test]
    fn the_title_is_one_cleaned_argument() {
        let a = ffmpeg_args("mp3", "", 44100, 2, "My song\n-f null -\u{7}", Path::new("o")).unwrap();
        let i = a.iter().position(|x| x == "-metadata").unwrap();
        assert_eq!(a[i + 1], "title=My song-f null -");
        let long: String = "x".repeat(300);
        assert_eq!(clean_title(&long).len(), 100);
        assert!(!ffmpeg_args("mp3", "", 44100, 2, "  ", Path::new("o")).unwrap().iter().any(|x| x == "-metadata"));
    }

    #[test]
    fn every_os_has_its_pinned_archive() {
        let (name, sum, folder) = asset().expect("a pack for the machine running the tests");
        assert!(name.starts_with(folder));
        assert_eq!(sum.len(), 64);
        assert!(sum.chars().all(|c| c.is_ascii_hexdigit() && !c.is_ascii_uppercase()));
    }

    #[test]
    fn a_wrong_file_has_a_different_hash() {
        let p = std::env::temp_dir().join(format!("ib-enc-test-{}", random_tag()));
        std::fs::write(&p, b"not the pack").unwrap();
        let h = file_sha256(&p).unwrap();
        let _ = std::fs::remove_file(&p);
        assert_ne!(Some(h.as_str()), asset().map(|a| a.1));
        assert_eq!(h.len(), 64);
    }
}
