//! Real system vitals for `neofetch` and the SYSMON app (via the `sysinfo` crate).

use serde::Serialize;
use std::sync::Mutex;
use sysinfo::{ProcessesToUpdate, System};

/// Created on first use (sysinfo's constructor can fail on exotic systems,
/// and we'd rather show an error in SYSMON than crash at startup).
#[derive(Default)]
pub struct SystemState {
    sys: Mutex<Option<System>>,
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
    sys.refresh_processes(ProcessesToUpdate::All, true);

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
    })
}
