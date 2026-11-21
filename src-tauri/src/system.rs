//! Real system vitals for `neofetch` and the SYSMON app (via the `sysinfo` crate):
//! cpu, memory, the busiest processes, the disks, the network's byte counters, the load.
//! Nothing leaves the computer: the numbers go to the deck's own window only.

use serde::Serialize;
use std::sync::Mutex;
use std::time::{Duration, Instant};
use sysinfo::{Disks, Networks, ProcessRefreshKind, ProcessesToUpdate, System};

/// Created on first use (sysinfo's constructor can fail on exotic systems,
/// and we'd rather show an error in SYSMON than crash at startup).
#[derive(Default)]
pub struct SystemState {
    sys: Mutex<Option<System>>,
    /// the disks, listed again every 10 s (their space barely moves)
    disks: Mutex<Option<(Disks, Instant)>>,
    nets: Mutex<Option<Networks>>,
}

/// One of the busiest processes.
#[derive(Serialize)]
pub struct Proc {
    name: String,
    /// its cpu, in % of ONE core (a busy program on 4 cores can say 400)
    cpu: f32,
    /// bytes
    mem: u64,
}

/// One disk (its mount point, its space).
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiskInfo {
    mount: String,
    name: String,
    total: u64,
    available: u64,
    removable: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Stats {
    cpu: f32,
    cores: Vec<f32>,
    mem_used: u64,
    mem_total: u64,
    swap_used: u64,
    swap_total: u64,
    uptime: u64,
    host: String,
    os: String,
    kernel: String,
    cpu_brand: String,
    processes: usize,
    arch: String,
    /// the busiest processes, by cpu (then memory)
    top: Vec<Proc>,
    disks: Vec<DiskInfo>,
    /// bytes received / sent since the computer started (all interfaces): the deck computes the rate
    net_rx: u64,
    net_tx: u64,
    /// the load average over 1, 5 and 15 minutes (0 where the system has none: Windows)
    load: [f64; 3],
}

/// CPU usage is measured between two refreshes, so the first call reports ~0%:
/// the UI simply polls this once per second.
#[tauri::command]
pub fn system_stats(state: tauri::State<SystemState>) -> Result<Stats, String> {
    let mut guard = state.sys.lock().map_err(|e| e.to_string())?;
    if guard.is_none() {
        *guard = Some(System::new().map_err(|e| e.to_string())?);
    }
    let sys = guard.as_mut().expect("initialized above");
    sys.refresh_cpu_usage();
    sys.refresh_memory();
    // only what the list shows (name, cpu, memory): reading every process's whole record each
    // second kept the native side at 3–6 % of a core
    sys.refresh_processes_specifics(ProcessesToUpdate::All, true, ProcessRefreshKind::nothing().with_cpu().with_memory());

    // the busiest ten (by cpu, then memory)
    let mut top: Vec<Proc> = sys
        .processes()
        .values()
        .map(|p| Proc { name: p.name().to_string_lossy().into_owned(), cpu: p.cpu_usage(), mem: p.memory() })
        .collect();
    top.sort_by(|a, b| b.cpu.partial_cmp(&a.cpu).unwrap_or(std::cmp::Ordering::Equal).then(b.mem.cmp(&a.mem)));
    top.truncate(10);

    let disks = {
        let mut g = state.disks.lock().map_err(|e| e.to_string())?;
        let stale = g.as_ref().map_or(true, |(_, at)| at.elapsed() > Duration::from_secs(10));
        if stale {
            *g = Disks::new_with_refreshed_list().ok().map(|d| (d, Instant::now()));
        }
        g.as_ref()
            .map(|(d, _)| {
                d.iter()
                    .filter(|k| k.total_space() > 0)
                    .map(|k| DiskInfo {
                        mount: k.mount_point().to_string_lossy().into_owned(),
                        name: k.name().to_string_lossy().into_owned(),
                        total: k.total_space(),
                        available: k.available_space(),
                        removable: k.is_removable(),
                    })
                    .collect()
            })
            .unwrap_or_default()
    };

    let (net_rx, net_tx) = {
        let mut g = state.nets.lock().map_err(|e| e.to_string())?;
        if g.is_none() {
            *g = Networks::new_with_refreshed_list().ok();
        } else if let Some(n) = g.as_mut() {
            n.refresh(true);
        }
        g.as_ref()
            .map(|n| n.iter().fold((0u64, 0u64), |(r, t), (_, d)| (r + d.total_received(), t + d.total_transmitted())))
            .unwrap_or((0, 0))
    };

    let load = System::load_average().map(|l| [l.one, l.five, l.fifteen]).unwrap_or([0.0; 3]);

    Ok(Stats {
        cpu: sys.global_cpu_usage(),
        cores: sys.cpus().iter().map(|c| c.usage()).collect(),
        mem_used: sys.used_memory(),
        mem_total: sys.total_memory(),
        swap_used: sys.used_swap(),
        swap_total: sys.total_swap(),
        uptime: System::uptime().unwrap_or(0),
        host: System::host_name().unwrap_or_else(|_| "deck".into()),
        os: System::long_os_version().unwrap_or_else(|_| std::env::consts::OS.into()),
        kernel: System::kernel_version().unwrap_or_default(),
        cpu_brand: sys.cpus().first().map(|c| c.brand().trim().to_string()).unwrap_or_default(),
        processes: sys.processes().len(),
        arch: std::env::consts::ARCH.into(),
        top,
        disks,
        net_rx,
        net_tx,
        load,
    })
}

/// Is the computer running on its battery? `None` where it can't tell (a desktop, Windows: the
/// page asks navigator.getBattery there). For the "smoothness" setting: 60 frames a second on
/// battery, 120 on the mains.
#[tauri::command]
pub fn power_on_battery() -> Option<bool> {
    #[cfg(target_os = "macos")]
    {
        let out = std::process::Command::new("pmset").args(["-g", "batt"]).output().ok()?;
        let text = String::from_utf8_lossy(&out.stdout);
        if text.contains("'Battery Power'") {
            return Some(true);
        }
        if text.contains("'AC Power'") {
            return Some(false);
        }
        None
    }
    #[cfg(target_os = "linux")]
    {
        // a mains supply that says whether it's plugged in
        for e in std::fs::read_dir("/sys/class/power_supply").ok()?.flatten() {
            let p = e.path();
            if std::fs::read_to_string(p.join("type")).map(|t| t.trim() == "Mains").unwrap_or(false) {
                return std::fs::read_to_string(p.join("online")).ok().map(|v| v.trim() == "0");
            }
        }
        None
    }
    #[cfg(not(any(target_os = "macos", target_os = "linux")))]
    {
        None
    }
}
