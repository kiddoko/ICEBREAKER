//! The local music player (MUSIC module): a folder of audio files, played here.
//!
//! - `audio_scan` walks a folder and reads each file's tags (title, artist,
//!   album, track, length). Cover art is never read: ICEBREAKER shows no images.
//! - Playback runs on its own thread (rodio), started the first time it's used,
//!   so the app doesn't open the sound device unless you play something.
//! - The UI polls `audio_status` and queues the next track itself.

use lofty::config::ParseOptions;
use lofty::prelude::*;
use lofty::probe::Probe;
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::sync::mpsc::{channel, Sender};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::State;

const EXTS: &[&str] = &["mp3", "m4a", "aac", "flac", "wav", "ogg", "oga", "aif", "aiff", "alac"];
const MAX_TRACKS: usize = 50_000;

#[derive(Serialize)]
pub struct Track {
    path: String,
    title: String,
    artist: String,
    album: String,
    track: u32,
    disc: u32,
    year: u32,
    /// seconds
    duration: f64,
}

#[derive(Serialize, Clone, Default)]
pub struct PlayerStatus {
    path: Option<String>,
    playing: bool,
    position: f64,
    duration: f64,
    volume: f64,
    /// the track played to its end (the UI moves on to the next one)
    ended: bool,
    error: Option<String>,
}

enum Cmd {
    Load(PathBuf, bool, f64),
    Play,
    Pause,
    Toggle,
    Stop,
    Seek(f64),
    Volume(f64),
}

#[derive(Default)]
pub struct AudioState {
    tx: Mutex<Option<Sender<Cmd>>>,
    status: Arc<Mutex<PlayerStatus>>,
}

/// "~/Music" → /Users/you/Music
fn expand(p: &str) -> PathBuf {
    match (p.strip_prefix("~/").or(if p == "~" { Some("") } else { None }), std::env::var_os("HOME").or_else(|| std::env::var_os("USERPROFILE"))) {
        (Some(rest), Some(home)) => PathBuf::from(home).join(rest),
        _ => PathBuf::from(p),
    }
}

fn is_audio(p: &Path) -> bool {
    p.extension().and_then(|e| e.to_str()).map(|e| EXTS.contains(&e.to_ascii_lowercase().as_str())).unwrap_or(false)
}

fn read_track(path: &Path) -> Track {
    let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or("?").to_string();
    let folder = |n: usize| path.ancestors().nth(n).and_then(|p| p.file_name()).and_then(|s| s.to_str()).unwrap_or("").to_string();
    let mut t = Track { path: path.to_string_lossy().into_owned(), title: stem, artist: String::new(), album: String::new(), track: 0, disc: 0, year: 0, duration: 0.0 };
    let tagged = Probe::open(path).ok().map(|p| p.options(ParseOptions::new().read_cover_art(false))).and_then(|p| p.read().ok());
    if let Some(f) = tagged {
        t.duration = f.properties().duration().as_secs_f64();
        if let Some(tag) = f.primary_tag().or_else(|| f.first_tag()) {
            if let Some(v) = tag.title() { if !v.trim().is_empty() { t.title = v.trim().to_string(); } }
            if let Some(v) = tag.artist() { t.artist = v.trim().to_string(); }
            if let Some(v) = tag.album() { t.album = v.trim().to_string(); }
            t.track = tag.track().unwrap_or(0);
            t.disc = tag.disk().unwrap_or(0);
            t.year = tag.year().unwrap_or(0);
        }
    }
    // untagged files: Artist/Album/01 Title.mp3 is the usual layout
    if t.album.is_empty() { t.album = folder(1); }
    if t.artist.is_empty() { t.artist = folder(2); }
    t
}

/// Every audio file under `folder` (hidden folders skipped), with its tags.
#[tauri::command]
pub async fn audio_scan(folder: String) -> Result<Vec<Track>, String> {
    let root = expand(&folder);
    if !root.is_dir() {
        return Err(format!("{folder}: not a folder"));
    }
    tauri::async_runtime::spawn_blocking(move || {
        let mut out = Vec::new();
        let mut stack = vec![root];
        while let Some(dir) = stack.pop() {
            let Ok(rd) = std::fs::read_dir(&dir) else { continue };
            for e in rd.flatten() {
                let p = e.path();
                if e.file_name().to_string_lossy().starts_with('.') { continue }
                let Ok(ft) = e.file_type() else { continue };
                if ft.is_dir() { stack.push(p) } else if is_audio(&p) {
                    out.push(read_track(&p));
                    if out.len() >= MAX_TRACKS { return Ok(out) }
                }
            }
        }
        Ok(out)
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Where `seek:<seconds>` goes: a time, never something Duration can't hold — `seek:inf` or
/// `seek:1e300` aborted the whole app (Duration::from_secs_f64 panics; Fable pass 24/11).
fn seek_to(sec: f64) -> Option<Duration> {
    if !sec.is_finite() {
        return None;
    }
    Some(Duration::from_secs_f64(sec.clamp(0.0, 1.0e9)))
}

fn sender(state: &AudioState) -> Result<Sender<Cmd>, String> {
    let mut tx = state.tx.lock().unwrap();
    if let Some(t) = tx.as_ref() {
        return Ok(t.clone());
    }
    let (t, rx) = channel::<Cmd>();
    let status = state.status.clone();
    std::thread::Builder::new()
        .name("audio".into())
        .spawn(move || {
            let (_stream, handle) = match rodio::OutputStream::try_default() {
                Ok(s) => s,
                Err(e) => {
                    status.lock().unwrap().error = Some(format!("no sound output: {e}"));
                    return;
                }
            };
            let mut sink: Option<rodio::Sink> = None;
            let mut volume = 0.8f32;
            status.lock().unwrap().volume = 80.0;
            loop {
                match rx.recv_timeout(Duration::from_millis(200)) {
                    Ok(Cmd::Load(path, play, duration)) => {
                        if let Some(s) = sink.take() { s.stop() }
                        let opened = std::fs::File::open(&path).map_err(|e| e.to_string()).and_then(|f| rodio::Decoder::new(std::io::BufReader::new(f)).map_err(|e| e.to_string()));
                        let mut st = status.lock().unwrap();
                        st.path = Some(path.to_string_lossy().into_owned());
                        st.ended = false;
                        st.position = 0.0;
                        match opened {
                            Ok(src) => match rodio::Sink::try_new(&handle) {
                                Ok(s) => {
                                    use rodio::Source;
                                    st.duration = src.total_duration().map(|d| d.as_secs_f64()).unwrap_or(duration);
                                    s.set_volume(volume * volume); // a curve that sounds linear
                                    s.append(src);
                                    if !play { s.pause() }
                                    st.error = None;
                                    sink = Some(s);
                                }
                                Err(e) => st.error = Some(e.to_string()),
                            },
                            Err(e) => {
                                st.error = Some(format!("can't play this file: {e}"));
                                st.ended = true; // skip it
                            }
                        }
                    }
                    Ok(Cmd::Play) => if let Some(s) = &sink { s.play() },
                    Ok(Cmd::Pause) => if let Some(s) = &sink { s.pause() },
                    Ok(Cmd::Toggle) => if let Some(s) = &sink { if s.is_paused() { s.play() } else { s.pause() } },
                    Ok(Cmd::Stop) => {
                        if let Some(s) = sink.take() { s.stop() }
                        let mut st = status.lock().unwrap();
                        st.path = None;
                        st.position = 0.0;
                        st.ended = false;
                    }
                    Ok(Cmd::Seek(sec)) => if let (Some(s), Some(at)) = (&sink, seek_to(sec)) {
                        if let Err(e) = s.try_seek(at) {
                            status.lock().unwrap().error = Some(format!("seek: {e}"));
                        }
                    },
                    Ok(Cmd::Volume(v)) => {
                        volume = (v / 100.0).clamp(0.0, 1.0) as f32;
                        if let Some(s) = &sink { s.set_volume(volume * volume) }
                        status.lock().unwrap().volume = v.clamp(0.0, 100.0);
                    }
                    Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {}
                    Err(_) => return,
                }
                let mut st = status.lock().unwrap();
                if let Some(s) = &sink {
                    st.position = s.get_pos().as_secs_f64();
                    st.playing = !s.is_paused() && !s.empty();
                    if s.empty() && st.path.is_some() && !st.ended {
                        st.ended = true;
                    }
                } else {
                    st.playing = false;
                }
            }
        })
        .map_err(|e| e.to_string())?;
    *tx = Some(t.clone());
    Ok(t)
}

/// Open a file (autoplay or paused). `duration` from the scan helps formats that don't say.
#[tauri::command]
pub fn audio_load(state: State<AudioState>, path: String, play: bool, duration: Option<f64>) -> Result<(), String> {
    let p = expand(&path);
    if !is_audio(&p) || !p.is_file() {
        return Err(format!("{path}: not an audio file"));
    }
    sender(&state)?.send(Cmd::Load(p, play, duration.unwrap_or(0.0))).map_err(|e| e.to_string())
}

/// play · pause · toggle · stop · seek:<seconds> · vol:<0-100>
#[tauri::command]
pub fn audio_control(state: State<AudioState>, action: String) -> Result<(), String> {
    let cmd = match action.as_str() {
        "play" => Cmd::Play,
        "pause" => Cmd::Pause,
        "toggle" => Cmd::Toggle,
        "stop" => Cmd::Stop,
        a if a.starts_with("seek:") => Cmd::Seek(a[5..].parse().map_err(|_| "seek:<seconds>")?),
        a if a.starts_with("vol:") => Cmd::Volume(a[4..].parse().map_err(|_| "vol:<0-100>")?),
        _ => return Err(format!("unknown action {action}")),
    };
    sender(&state)?.send(cmd).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn audio_status(state: State<AudioState>) -> PlayerStatus {
    let mut st = state.status.lock().unwrap();
    let out = st.clone();
    st.error = None; // reported once
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_seek_past_any_time_is_ignored_not_a_crash() {
        assert_eq!(seek_to(f64::INFINITY), None);
        assert_eq!(seek_to(f64::NAN), None);
        assert_eq!(seek_to(-5.0), Some(Duration::ZERO));
        assert_eq!(seek_to(1.0e300), Some(Duration::from_secs(1_000_000_000)));
        assert_eq!(seek_to(12.5), Some(Duration::from_secs_f64(12.5)));
    }
}
