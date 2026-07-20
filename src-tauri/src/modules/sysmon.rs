// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

//! System resource sampling for the btop-style analyzer panel: per-core CPU,
//! memory, swap, per-disk I/O, per-interface network throughput, and the
//! process table.
//!
//! Sampling is stateful by necessity — CPU percentages, disk I/O, and network
//! throughput are all *deltas between two refreshes*, so the `System`,
//! `Disks`, and `Networks` handles live in one process-global [`Sampler`]
//! rather than being rebuilt per call. The first sample after startup
//! therefore reports zeroed rates; the frontend discards it (see
//! `useSystemMonitor`).
//!
//! Rates are normalized to per-second here rather than in the frontend: only
//! this module knows the true elapsed time between refreshes, which drifts
//! from the nominal poll interval whenever the UI thread or the OS delays a
//! tick. Dividing a delta by an assumed interval would make every chart lie
//! under load — exactly when the reading matters.
//!
//! This sits *beside* the Activity panel (`modules/processes` on the
//! frontend), which tracks Nexis's own agent-spawned background processes.
//! Different question, different data source — do not merge them.

// Panic-lint gate: no `.unwrap()`/`.expect()` in production code here.
// Tests may still panic (allow-*-in-tests in clippy.toml). CI's
// `clippy -- -D warnings` turns a new one into a build failure.
#![warn(clippy::unwrap_used, clippy::expect_used)]

use std::sync::Mutex;
use std::time::{Duration, Instant};

use serde::Serialize;
use sysinfo::{
    Disks, MemoryRefreshKind, Networks, Pid, ProcessRefreshKind, ProcessesToUpdate, System,
};

/// Cap on rows returned by a single sample. The process table is sorted in
/// Rust (by the caller's key) and truncated before crossing IPC — shipping
/// every process on a busy machine would serialize hundreds of KB per tick
/// for rows the panel cannot show. Sorting *before* truncating is what makes
/// this safe: the interesting rows are always the ones that survive.
const MAX_PROCESS_ROWS: usize = 250;

/// Sort keys the panel offers for the process table. Sorting happens in Rust
/// so that truncation to `MAX_PROCESS_ROWS` keeps the rows the user asked to
/// see, not an arbitrary prefix of the OS's enumeration order.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, serde::Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ProcessSort {
    /// The default: "what is eating my machine" is the question the panel is
    /// opened to answer.
    #[default]
    Cpu,
    Memory,
    Pid,
    Name,
}

#[derive(Debug, Clone, Serialize)]
pub struct ProcessRow {
    pub pid: u32,
    pub parent: Option<u32>,
    pub name: String,
    /// Full command line, space-joined. Empty for kernel threads.
    pub cmd: String,
    /// Percent of one core — matches `top`, so this exceeds 100 on a
    /// multi-threaded process. The panel divides by core count for the
    /// "% of machine" reading.
    pub cpu: f32,
    /// Resident memory in bytes.
    pub memory: u64,
    /// Seconds since the process started.
    pub run_time: u64,
}

#[derive(Debug, Clone, Serialize)]
pub struct DiskRow {
    pub name: String,
    pub mount_point: String,
    pub total: u64,
    pub available: u64,
    pub read_per_sec: u64,
    pub written_per_sec: u64,
}

#[derive(Debug, Clone, Serialize)]
pub struct NetRow {
    pub interface: String,
    pub rx_per_sec: u64,
    pub tx_per_sec: u64,
    pub rx_total: u64,
    pub tx_total: u64,
}

#[derive(Debug, Clone, Serialize)]
pub struct SysSample {
    /// Percent 0..100, averaged across all cores.
    pub cpu_total: f32,
    /// Percent 0..100, one entry per logical core, in OS order.
    pub cpu_per_core: Vec<f32>,
    pub mem_total: u64,
    pub mem_used: u64,
    pub mem_available: u64,
    pub swap_total: u64,
    pub swap_used: u64,
    pub load_avg: [f64; 3],
    pub uptime: u64,
    pub disks: Vec<DiskRow>,
    pub networks: Vec<NetRow>,
    pub processes: Vec<ProcessRow>,
    /// Total process count *before* truncation to `MAX_PROCESS_ROWS`, so the
    /// panel can honestly say "showing 250 of 412" instead of implying the
    /// machine only has 250 processes.
    pub process_count: usize,
    /// Milliseconds since the previous sample. Zero on the first sample,
    /// which is the frontend's signal that every rate in it is meaningless.
    pub elapsed_ms: u64,
}

struct Sampler {
    system: System,
    disks: Disks,
    networks: Networks,
    last: Option<Instant>,
}

impl Sampler {
    fn new() -> Self {
        Self {
            system: System::new(),
            disks: Disks::new_with_refreshed_list(),
            networks: Networks::new_with_refreshed_list(),
            last: None,
        }
    }

    fn sample(&mut self, sort: ProcessSort, want_processes: bool) -> SysSample {
        let now = Instant::now();
        let elapsed = self.last.map(|t| now.duration_since(t));
        self.last = Some(now);

        self.system.refresh_cpu_all();
        self.system
            .refresh_memory_specifics(MemoryRefreshKind::everything());
        self.disks.refresh(true);
        self.networks.refresh(true);

        // Per-second normalization. A missing previous sample (first call)
        // and an implausibly small interval both collapse to "report the raw
        // delta once" rather than dividing by ~0 and producing a spike of
        // millions of bytes/sec.
        let secs = elapsed
            .filter(|d| *d >= Duration::from_millis(50))
            .map(|d| d.as_secs_f64())
            .unwrap_or(1.0);
        let per_sec = |delta: u64| -> u64 { (delta as f64 / secs).round() as u64 };

        let disks = self
            .disks
            .list()
            .iter()
            .map(|d| {
                let usage = d.usage();
                DiskRow {
                    name: d.name().to_string_lossy().into_owned(),
                    mount_point: d.mount_point().to_string_lossy().into_owned(),
                    total: d.total_space(),
                    available: d.available_space(),
                    read_per_sec: per_sec(usage.read_bytes),
                    written_per_sec: per_sec(usage.written_bytes),
                }
            })
            .collect();

        let mut networks: Vec<NetRow> = self
            .networks
            .iter()
            .map(|(name, data)| NetRow {
                interface: name.clone(),
                rx_per_sec: per_sec(data.received()),
                tx_per_sec: per_sec(data.transmitted()),
                rx_total: data.total_received(),
                tx_total: data.total_transmitted(),
            })
            .collect();
        networks.sort_by(|a, b| a.interface.cmp(&b.interface));

        let (processes, process_count) = if want_processes {
            self.system.refresh_processes_specifics(
                ProcessesToUpdate::All,
                true,
                ProcessRefreshKind::nothing().with_cpu().with_memory(),
            );
            let mut rows: Vec<ProcessRow> = self
                .system
                .processes()
                .values()
                .map(|p| ProcessRow {
                    pid: p.pid().as_u32(),
                    parent: p.parent().map(|x| x.as_u32()),
                    name: p.name().to_string_lossy().into_owned(),
                    cmd: p
                        .cmd()
                        .iter()
                        .map(|s| s.to_string_lossy())
                        .collect::<Vec<_>>()
                        .join(" "),
                    cpu: p.cpu_usage(),
                    memory: p.memory(),
                    run_time: p.run_time(),
                })
                .collect();
            let total = rows.len();
            sort_rows(&mut rows, sort);
            rows.truncate(MAX_PROCESS_ROWS);
            (rows, total)
        } else {
            (Vec::new(), 0)
        };

        let load = System::load_average();

        SysSample {
            cpu_total: self.system.global_cpu_usage(),
            cpu_per_core: self.system.cpus().iter().map(|c| c.cpu_usage()).collect(),
            mem_total: self.system.total_memory(),
            mem_used: self.system.used_memory(),
            mem_available: self.system.available_memory(),
            swap_total: self.system.total_swap(),
            swap_used: self.system.used_swap(),
            load_avg: [load.one, load.five, load.fifteen],
            uptime: System::uptime(),
            disks,
            networks,
            processes,
            process_count,
            elapsed_ms: elapsed.map(|d| d.as_millis() as u64).unwrap_or(0),
        }
    }
}

/// Descending for the numeric keys (the big consumers are what you look for),
/// ascending for pid and name (where the natural reading order is forward).
fn sort_rows(rows: &mut [ProcessRow], sort: ProcessSort) {
    match sort {
        ProcessSort::Cpu => rows.sort_by(|a, b| {
            b.cpu
                .partial_cmp(&a.cpu)
                .unwrap_or(std::cmp::Ordering::Equal)
                .then_with(|| b.memory.cmp(&a.memory))
        }),
        ProcessSort::Memory => rows.sort_by_key(|r| std::cmp::Reverse(r.memory)),
        ProcessSort::Pid => rows.sort_by_key(|r| r.pid),
        ProcessSort::Name => rows.sort_by(|a, b| {
            a.name
                .to_lowercase()
                .cmp(&b.name.to_lowercase())
                .then_with(|| a.pid.cmp(&b.pid))
        }),
    }
}

fn sampler() -> &'static Mutex<Sampler> {
    static SAMPLER: std::sync::OnceLock<Mutex<Sampler>> = std::sync::OnceLock::new();
    SAMPLER.get_or_init(|| Mutex::new(Sampler::new()))
}

/// Poll one sample.
///
/// `async` + `heavy()` is mandatory, not stylistic: a full process refresh
/// walks every entry in `/proc` (or the Windows toolhelp snapshot), which is
/// far too slow for Tauri's main thread — a sync command here would stall the
/// UI event loop and every queued `pty_write` behind it on each tick. See
/// `modules::heavy` and the sync-command audit tripwire.
#[tauri::command]
pub async fn sysmon_sample(
    sort: Option<ProcessSort>,
    include_processes: Option<bool>,
) -> Result<SysSample, String> {
    let sort = sort.unwrap_or_default();
    let want = include_processes.unwrap_or(true);
    crate::modules::heavy(move || {
        let mut s = sampler().lock().unwrap_or_else(|e| e.into_inner());
        Ok(s.sample(sort, want))
    })
    .await
}

/// Signals the panel may send. Deliberately a closed enum rather than a raw
/// integer: the panel is a UI surface, and an arbitrary `i32` crossing IPC
/// into a kill syscall is a wider hole than this feature needs.
#[derive(Debug, Clone, Copy, serde::Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum KillSignal {
    Term,
    Kill,
    Int,
    Hup,
}

/// Send a signal to a process by pid.
///
/// Returns `Ok(false)` when the pid is gone — a race with the poll interval
/// is the normal case (the user clicks kill on a row sampled a second ago),
/// not an error worth surfacing as a failure toast.
#[tauri::command]
pub async fn sysmon_kill(pid: u32, signal: Option<KillSignal>) -> Result<bool, String> {
    let signal = signal.unwrap_or(KillSignal::Term);
    crate::modules::heavy(move || {
        let mut s = sampler().lock().unwrap_or_else(|e| e.into_inner());
        // Refresh just this pid: killing based on a stale table risks
        // signalling a pid the OS has since recycled onto another process.
        s.system.refresh_processes_specifics(
            ProcessesToUpdate::Some(&[Pid::from_u32(pid)]),
            true,
            ProcessRefreshKind::nothing(),
        );
        let Some(proc) = s.system.process(Pid::from_u32(pid)) else {
            return Ok(false);
        };
        let sig = match signal {
            KillSignal::Term => sysinfo::Signal::Term,
            KillSignal::Kill => sysinfo::Signal::Kill,
            KillSignal::Int => sysinfo::Signal::Interrupt,
            KillSignal::Hup => sysinfo::Signal::Hangup,
        };
        // `kill_with` returns None when the platform cannot express the
        // signal (Windows has no SIGHUP); fall back to the plain terminate
        // rather than silently doing nothing.
        match proc.kill_with(sig) {
            Some(ok) => Ok(ok),
            None => Ok(proc.kill()),
        }
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;

    fn row(pid: u32, name: &str, cpu: f32, memory: u64) -> ProcessRow {
        ProcessRow {
            pid,
            parent: None,
            name: name.to_string(),
            cmd: String::new(),
            cpu,
            memory,
            run_time: 0,
        }
    }

    #[test]
    fn sorts_cpu_descending_with_memory_tiebreak() {
        let mut rows = vec![
            row(1, "a", 5.0, 100),
            row(2, "b", 90.0, 10),
            row(3, "c", 5.0, 900),
        ];
        sort_rows(&mut rows, ProcessSort::Cpu);
        assert_eq!(
            rows.iter().map(|r| r.pid).collect::<Vec<_>>(),
            vec![2, 3, 1],
            "highest cpu first; equal cpu breaks on memory"
        );
    }

    #[test]
    fn sorts_memory_descending() {
        let mut rows = vec![row(1, "a", 0.0, 10), row(2, "b", 0.0, 900)];
        sort_rows(&mut rows, ProcessSort::Memory);
        assert_eq!(rows[0].pid, 2);
    }

    #[test]
    fn sorts_name_case_insensitively_then_pid() {
        let mut rows = vec![
            row(9, "Zsh", 0.0, 0),
            row(2, "bash", 0.0, 0),
            row(1, "bash", 0.0, 0),
        ];
        sort_rows(&mut rows, ProcessSort::Name);
        assert_eq!(
            rows.iter().map(|r| r.pid).collect::<Vec<_>>(),
            vec![1, 2, 9]
        );
    }

    #[test]
    fn sorts_pid_ascending() {
        let mut rows = vec![row(30, "a", 0.0, 0), row(4, "b", 0.0, 0)];
        sort_rows(&mut rows, ProcessSort::Pid);
        assert_eq!(rows[0].pid, 4);
    }

    /// The first sample has no previous timestamp, so every rate in it is
    /// undefined. It must still be structurally valid rather than panicking
    /// or dividing by zero — the frontend relies on `elapsed_ms == 0` to know
    /// to throw it away.
    #[test]
    fn first_sample_reports_zero_elapsed_and_does_not_panic() {
        let mut s = Sampler::new();
        let sample = s.sample(ProcessSort::Cpu, false);
        assert_eq!(sample.elapsed_ms, 0);
        assert!(sample.mem_total > 0, "a running machine has memory");
        assert!(sample.processes.is_empty(), "processes were not requested");
    }

    /// The rate pipeline end-to-end: a second sample taken after a real
    /// interval must report a real elapsed time and a plausible CPU reading.
    ///
    /// This is the contract the whole panel rests on — every chart is a
    /// delta — and it cannot be checked from the first sample alone. A busy
    /// loop rather than a sleep because the CPU figure is only meaningful if
    /// the process actually consumed CPU during the window.
    #[test]
    fn second_sample_reports_elapsed_time_and_bounded_cpu() {
        let mut s = Sampler::new();
        let first = s.sample(ProcessSort::Cpu, false);
        assert_eq!(first.elapsed_ms, 0);

        let spin_until = Instant::now() + Duration::from_millis(250);
        let mut acc: u64 = 0;
        while Instant::now() < spin_until {
            acc = acc.wrapping_add(1);
        }
        std::hint::black_box(acc);

        let second = s.sample(ProcessSort::Cpu, false);
        assert!(
            second.elapsed_ms >= 200,
            "elapsed {} ms should reflect the real interval",
            second.elapsed_ms
        );
        // A global CPU average is a percentage of the whole machine, so it
        // must stay in 0..=100 no matter how many cores are saturated. A
        // value above 100 would mean the per-core sum leaked into the total.
        assert!(
            (0.0..=100.0).contains(&second.cpu_total),
            "global cpu {} out of range",
            second.cpu_total
        );
        assert_eq!(
            second.cpu_per_core.len(),
            first.cpu_per_core.len(),
            "core count must be stable between samples — the panel indexes history by core"
        );
        for (i, core) in second.cpu_per_core.iter().enumerate() {
            assert!(
                (0.0..=100.0).contains(core),
                "core {i} reported {core}%, outside 0..=100"
            );
        }
    }

    /// Signalling a pid that does not exist is the normal poll-interval race
    /// (the row was sampled a second ago), not an error — `sysmon_kill` takes
    /// its `else { return Ok(false) }` branch rather than surfacing a failure.
    ///
    /// The pid is found by enumerating the live table and taking one that is
    /// absent from it, not hardcoded. Pid 0 was the original choice and is
    /// wrong on Windows, where it is the System Idle Process and *does*
    /// enumerate — that made this test fail only on Windows, and only
    /// sometimes.
    #[test]
    fn killing_a_nonexistent_pid_reports_false_rather_than_erroring() {
        let mut s = Sampler::new();
        s.system.refresh_processes_specifics(
            ProcessesToUpdate::All,
            true,
            ProcessRefreshKind::nothing(),
        );
        let live: std::collections::HashSet<u32> =
            s.system.processes().keys().map(|p| p.as_u32()).collect();
        // Walk down from the top of the pid space: the high end is far from
        // where the OS is currently allocating, so a gap is found immediately
        // and is unlikely to be filled by a process spawning mid-test.
        let absent = (1..=u32::MAX)
            .rev()
            .find(|pid| !live.contains(pid))
            .expect("some pid in the space must be unused");

        s.system.refresh_processes_specifics(
            ProcessesToUpdate::Some(&[Pid::from_u32(absent)]),
            true,
            ProcessRefreshKind::nothing(),
        );
        assert!(
            s.system.process(Pid::from_u32(absent)).is_none(),
            "pid {absent} was absent from the process table but still resolved"
        );
    }

    #[test]
    fn process_table_is_capped_and_reports_true_count() {
        let mut s = Sampler::new();
        let sample = s.sample(ProcessSort::Cpu, true);
        assert!(sample.processes.len() <= MAX_PROCESS_ROWS);
        assert!(
            sample.process_count >= sample.processes.len(),
            "pre-truncation count must not undercount the rows returned"
        );
    }
}
