//! Real `nexis-ml-rs` integration. The engine trains/exports (it has no
//! arbitrary-model inference path), so we benchmark what it genuinely does:
//! **training throughput** on a standardized synthetic workload, streamed over
//! the NDJSON protocol (`--nexis-protocol train`). Every number here is real —
//! real wgpu/ndarray compute, real `mem/gpu_mb`, real validation accuracy.

use crate::domain::*;
use serde_json::Value;
use std::io::{BufRead, BufReader, Write};
use std::path::Path;
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

/// Standardized engine micro-benchmark workload (independent of the dropped
/// model file — the engine can't load it). Tuned so each epoch does real,
/// stable GPU/CPU work without taking long.
const WORKLOAD_SAMPLES: u32 = 4096;
const WORKLOAD_HIDDEN: &str = "[128, 128]";

pub const NEXIS_NOTE: &str =
    "Real engine throughput — nexis-ml-rs trains a standardized workload on its wgpu/ndarray backend. It does not run inference on the dropped model (the engine has no such path yet).";

#[cfg(windows)]
fn configure(cmd: &mut Command) {
    use std::os::windows::process::CommandExt;
    const CREATE_NEW_PROCESS_GROUP: u32 = 0x0000_0200;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    cmd.creation_flags(CREATE_NEW_PROCESS_GROUP | CREATE_NO_WINDOW);
}
#[cfg(not(windows))]
fn configure(_cmd: &mut Command) {}

fn kill_tree(pid: u32) {
    #[cfg(windows)]
    {
        let _ = Command::new("taskkill")
            .args(["/PID", &pid.to_string(), "/T", "/F"])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
    }
    #[cfg(not(windows))]
    {
        let _ = Command::new("kill")
            .args(["-TERM", &pid.to_string()])
            .status();
    }
}

/// Run `nexis-ml env` and return (version, device).
pub fn probe(binary: &Path) -> (Option<String>, DeviceKind) {
    let mut cmd = Command::new(binary);
    cmd.arg("env").stdout(Stdio::piped()).stderr(Stdio::null());
    configure(&mut cmd);
    let Ok(out) = cmd.output() else {
        return (None, DeviceKind::Cpu);
    };
    let text = String::from_utf8_lossy(&out.stdout);
    let v: Value = serde_json::from_str(text.trim()).unwrap_or(Value::Null);
    let version = v.get("nexisMl").and_then(|x| x.as_str()).map(String::from);
    let device = match v.get("backend").and_then(|x| x.as_str()) {
        Some("wgpu") | Some("cuda") | Some("gpu") => DeviceKind::Gpu,
        _ => DeviceKind::Cpu,
    };
    (version, device)
}

fn write_train_toml(dir: &Path, config: &BenchConfig) -> std::io::Result<()> {
    let epochs = config.warmup + config.runs.max(1);
    let batch = config.batch_size.max(8);
    let toml = format!(
        "[train]\n\
         epochs = {epochs}\n\
         batch_size = {batch}\n\
         lr = 0.2\n\
         val_split = 0.2\n\
         seed = 42\n\
         samples = {WORKLOAD_SAMPLES}\n\
         device = \"auto\"\n\
         \n\
         [model]\n\
         hidden = {WORKLOAD_HIDDEN}\n"
    );
    std::fs::write(dir.join("train.toml"), toml)
}

/// Background sampler: track peak RSS of the child process tree.
fn spawn_mem_sampler(pid: u32, stop: Arc<AtomicBool>, peak: Arc<Mutex<u64>>) {
    std::thread::spawn(move || {
        use sysinfo::{Pid, ProcessRefreshKind, ProcessesToUpdate, System};
        let mut sys = System::new();
        let target = Pid::from_u32(pid);
        while !stop.load(Ordering::Relaxed) {
            sys.refresh_processes_specifics(
                ProcessesToUpdate::All,
                true,
                ProcessRefreshKind::nothing().with_memory(),
            );
            // Sum the process and any children sharing our pid as parent.
            let mut total: u64 = sys.process(target).map(|p| p.memory()).unwrap_or(0);
            for p in sys.processes().values() {
                if p.parent() == Some(target) {
                    total += p.memory();
                }
            }
            if let Ok(mut g) = peak.lock() {
                if total > *g {
                    *g = total;
                }
            }
            std::thread::sleep(Duration::from_millis(40));
        }
    });
}

fn percentile(sorted: &[f64], p: f64) -> f64 {
    if sorted.is_empty() {
        return 0.0;
    }
    let idx = ((p * sorted.len() as f64) as usize).min(sorted.len() - 1);
    sorted[idx]
}

pub fn run(
    binary: &Path,
    job_id: &str,
    model: &ModelInfo,
    config: &BenchConfig,
    emit: &dyn Fn(BenchProgress),
    cancel: &AtomicBool,
) -> Result<BenchMetrics, String> {
    let total = config.warmup + config.runs.max(1);
    let mk = |phase: RunPhase, current: u32, tps: Option<f64>| BenchProgress {
        job_id: job_id.to_string(),
        model_id: model.id.clone(),
        backend_id: BackendId::Nexis,
        phase,
        current,
        total: config.runs.max(1),
        message: None,
        tokens_per_sec: tps,
    };

    // Isolated temp run directory.
    let run_dir = std::env::temp_dir()
        .join("nexis-benchmark")
        .join(uuid::Uuid::new_v4().to_string());
    std::fs::create_dir_all(&run_dir).map_err(|e| format!("temp dir: {e}"))?;
    write_train_toml(&run_dir, config).map_err(|e| format!("train.toml: {e}"))?;

    emit(mk(RunPhase::Loading, 0, None));

    let mut cmd = Command::new(binary);
    cmd.arg("--nexis-protocol")
        .arg("train")
        .arg(&run_dir)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    configure(&mut cmd);
    let mut child = cmd.spawn().map_err(|e| format!("spawn nexis-ml: {e}"))?;
    let pid = child.id();

    let stop_mem = Arc::new(AtomicBool::new(false));
    let peak_rss = Arc::new(Mutex::new(0u64));
    spawn_mem_sampler(pid, stop_mem.clone(), peak_rss.clone());

    let stdout = child.stdout.take().ok_or("no stdout")?;
    let mut stdin = child.stdin.take();
    let reader = BufReader::new(stdout);

    let t0 = Instant::now();
    let mut epoch_times: Vec<Instant> = Vec::with_capacity(total as usize);
    let mut first_epoch_ms: Option<f64> = None;
    let mut gpu_mem_peak_mb: f64 = 0.0;
    let mut acc_val: Option<f64> = None;
    let mut cancelled = false;
    let mut finished = false;

    for line in reader.lines() {
        if cancel.load(Ordering::Relaxed) {
            cancelled = true;
            break;
        }
        let Ok(line) = line else { break };
        let Ok(v) = serde_json::from_str::<Value>(&line) else {
            continue; // forward-compat: ignore non-JSON / unknown lines
        };
        match v.get("ev").and_then(|e| e.as_str()) {
            Some("epoch") => {
                let now = Instant::now();
                if first_epoch_ms.is_none() {
                    first_epoch_ms = Some(t0.elapsed().as_secs_f64() * 1000.0);
                }
                epoch_times.push(now);
                let e = v.get("epoch").and_then(|x| x.as_u64()).unwrap_or(0) as u32;
                let measured = e.saturating_sub(config.warmup);
                let phase = if e <= config.warmup {
                    RunPhase::Warmup
                } else {
                    RunPhase::Measuring
                };
                emit(mk(phase, measured.min(config.runs), None));
            }
            Some("metric") => {
                let name = v.get("name").and_then(|x| x.as_str()).unwrap_or("");
                let value = v.get("value").and_then(|x| x.as_f64()).unwrap_or(0.0);
                match name {
                    "mem/gpu_mb" => gpu_mem_peak_mb = gpu_mem_peak_mb.max(value),
                    "acc/val" => acc_val = Some(value),
                    _ => {}
                }
            }
            Some("run.finished") => {
                finished = true;
                break;
            }
            _ => {}
        }
    }

    let end = Instant::now();
    stop_mem.store(true, Ordering::Relaxed);

    if cancelled {
        // Ask politely over the protocol, then ensure the tree is gone.
        if let Some(mut sin) = stdin.take() {
            let _ = sin.write_all(b"{\"cmd\":\"cancel\"}\n");
            let _ = sin.flush();
        }
        std::thread::sleep(Duration::from_millis(150));
        kill_tree(pid);
        let _ = child.wait();
        return Err("cancelled".into());
    }
    let _ = child.wait();

    if epoch_times.is_empty() {
        return Err(if finished {
            "nexis-ml produced no epochs".into()
        } else {
            "nexis-ml exited before reporting (check the binary/build)".into()
        });
    }

    // Per-epoch durations: gap between consecutive epoch events; the final
    // epoch runs until the process finished.
    let mut durations_ms: Vec<f64> = Vec::with_capacity(epoch_times.len());
    for i in 0..epoch_times.len() {
        let next = epoch_times.get(i + 1).copied().unwrap_or(end);
        durations_ms.push(next.duration_since(epoch_times[i]).as_secs_f64() * 1000.0);
    }

    // Keep only measured epochs (discard warm-up).
    let measured: Vec<f64> = durations_ms
        .iter()
        .skip(config.warmup as usize)
        .copied()
        .collect();
    let samples_ms: Vec<f64> = if measured.is_empty() {
        durations_ms.clone()
    } else {
        measured
    };

    let mean = samples_ms.iter().sum::<f64>() / samples_ms.len() as f64;
    let mut sorted = samples_ms.clone();
    sorted.sort_by(|a, b| a.partial_cmp(b).unwrap());

    // Throughput = training samples processed per second (real items/sec).
    let mean_s = (mean / 1000.0).max(1e-6);
    let tokens_per_sec = WORKLOAD_SAMPLES as f64 / mean_s;

    let peak_rss_bytes = *peak_rss.lock().unwrap() as f64;
    let peak_mem_bytes = (gpu_mem_peak_mb * 1.0e6).max(peak_rss_bytes);

    emit(mk(RunPhase::Done, config.runs.max(1), Some(tokens_per_sec)));

    // Best-effort cleanup of the temp run.
    let _ = std::fs::remove_dir_all(&run_dir);

    Ok(BenchMetrics {
        tokens_per_sec,
        first_token_ms: first_epoch_ms.unwrap_or(mean),
        latency_mean_ms: mean,
        latency_p50_ms: percentile(&sorted, 0.5),
        latency_p95_ms: percentile(&sorted, 0.95),
        peak_mem_bytes,
        accuracy: acc_val,
        samples_ms: sorted,
    })
}
