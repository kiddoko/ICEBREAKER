//! The graphics card, for SYSMON — best effort, read where the system says it without
//! privileges: Linux's sysfs (AMD and recent Intel: busy %, video memory), and `nvidia-smi`
//! when it is installed (NVIDIA, every system). Elsewhere (a Mac, an Intel card on Windows)
//! nothing: the page shows the card's name from WebGL and says the rest isn't available.
//! Read at most every 2 s (nvidia-smi is a program to start).

use serde::Serialize;
use std::process::Command;
use std::sync::Mutex;
use std::time::{Duration, Instant};

#[derive(Serialize, Clone, Default, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Gpu {
    pub name: String,
    /// 0..100, when the system says it
    pub busy: Option<f32>,
    /// bytes of video memory used / in all, when the system says them
    pub mem_used: Option<u64>,
    pub mem_total: Option<u64>,
    /// °C, when the system says it
    pub temp: Option<f32>,
}

#[derive(Default)]
pub struct GpuState {
    last: Mutex<Option<(Vec<Gpu>, Instant)>>,
}

#[tauri::command]
pub fn gpu_stats(state: tauri::State<GpuState>) -> Vec<Gpu> {
    let mut g = match state.last.lock() {
        Ok(g) => g,
        Err(_) => return vec![],
    };
    if let Some((list, at)) = g.as_ref() {
        if at.elapsed() < Duration::from_secs(2) {
            return list.clone();
        }
    }
    let mut list = nvidia();
    if list.is_empty() {
        list = sysfs();
    }
    *g = Some((list.clone(), Instant::now()));
    list
}

/// `nvidia-smi --query-gpu=…` → one line a card: "name, busy, used MiB, total MiB, temp"
fn nvidia() -> Vec<Gpu> {
    let mut cmd = Command::new("nvidia-smi");
    cmd.args(["--query-gpu=name,utilization.gpu,memory.used,memory.total,temperature.gpu", "--format=csv,noheader,nounits"]);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000);
    }
    match cmd.output() {
        Ok(out) if out.status.success() => parse_nvidia(&String::from_utf8_lossy(&out.stdout)),
        _ => vec![],
    }
}

pub fn parse_nvidia(text: &str) -> Vec<Gpu> {
    text.lines()
        .filter_map(|l| {
            let f: Vec<&str> = l.split(',').map(|x| x.trim()).collect();
            if f.len() < 4 || f[0].is_empty() {
                return None;
            }
            let num = |s: &str| s.parse::<f64>().ok();
            Some(Gpu {
                name: f[0].to_string(),
                busy: num(f[1]).map(|v| v as f32),
                mem_used: num(f[2]).map(|v| (v * 1024.0 * 1024.0) as u64),
                mem_total: num(f[3]).map(|v| (v * 1024.0 * 1024.0) as u64),
                temp: f.get(4).and_then(|s| num(s)).map(|v| v as f32),
            })
        })
        .collect()
}

/// Linux: /sys/class/drm/cardN/device — gpu_busy_percent, mem_info_vram_used / _total
fn sysfs() -> Vec<Gpu> {
    #[cfg(target_os = "linux")]
    {
        let mut out = vec![];
        let Ok(dir) = std::fs::read_dir("/sys/class/drm") else { return out };
        let mut cards: Vec<_> = dir.flatten().map(|e| e.path()).filter(|p| p.file_name().and_then(|n| n.to_str()).is_some_and(|n| n.starts_with("card") && !n.contains('-'))).collect();
        cards.sort();
        for card in cards {
            let dev = card.join("device");
            let read = |f: &str| std::fs::read_to_string(dev.join(f)).ok().map(|s| s.trim().to_string());
            let busy = read("gpu_busy_percent").and_then(|s| s.parse::<f32>().ok());
            let used = read("mem_info_vram_used").and_then(|s| s.parse::<u64>().ok());
            let total = read("mem_info_vram_total").and_then(|s| s.parse::<u64>().ok());
            if busy.is_none() && total.is_none() {
                continue;
            }
            let vendor = match read("vendor").as_deref() {
                Some("0x1002") => "AMD",
                Some("0x8086") => "Intel",
                Some("0x10de") => "NVIDIA",
                _ => "GPU",
            };
            let name = read("product_name").filter(|s| !s.is_empty()).unwrap_or_else(|| vendor.to_string());
            out.push(Gpu { name, busy, mem_used: used, mem_total: total, temp: None });
        }
        out
    }
    #[cfg(not(target_os = "linux"))]
    {
        vec![]
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_nvidia_smi() {
        let g = parse_nvidia("NVIDIA GeForce RTX 3060, 12, 1024, 12288, 47\n");
        assert_eq!(g.len(), 1);
        assert_eq!(g[0].name, "NVIDIA GeForce RTX 3060");
        assert_eq!(g[0].busy, Some(12.0));
        assert_eq!(g[0].mem_total, Some(12288 * 1024 * 1024));
        assert_eq!(g[0].temp, Some(47.0));
        // "[N/A]" fields: none
        let n = parse_nvidia("Tesla T4, [N/A], 0, 15360, [N/A]");
        assert_eq!(n[0].busy, None);
        assert!(parse_nvidia("").is_empty());
    }
}
