//! llama.cpp / GGUF backend via the prebuilt `llama-bench` binary. We shell out
//! (no cmake / source build) with `-o json` and parse the result — the same
//! spawn-and-parse pattern as the nexis-ml backend. Real GGUF inference numbers.

use crate::domain::*;
use serde_json::Value;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

pub const LLAMA_NOTE: &str =
    "Real GGUF inference via llama.cpp's llama-bench. Throughput is token generation (tg); first-token latency is the prompt-processing (pp) time.";

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

fn exe_name() -> &'static str {
    if cfg!(windows) {
        "llama-bench.exe"
    } else {
        "llama-bench"
    }
}

/// Look for `llama-bench` on PATH.
pub fn find_on_path() -> Option<PathBuf> {
    let path = std::env::var_os("PATH")?;
    for dir in std::env::split_paths(&path) {
        let cand = dir.join(exe_name());
        if cand.is_file() {
            return Some(cand);
        }
    }
    None
}

/// Resolve a user-supplied path (if it's a real file) or fall back to PATH.
pub fn resolve(path: Option<&str>) -> Option<PathBuf> {
    match path {
        Some(p) if !p.is_empty() && Path::new(p).is_file() => Some(PathBuf::from(p)),
        _ => find_on_path(),
    }
}

pub fn probe(path: Option<&str>) -> LlamaProbe {
    let resolved = resolve(path);
    LlamaProbe {
        available: resolved.is_some(),
        version: None,
        path: resolved.map(|p| p.to_string_lossy().into_owned()),
    }
}

fn percentile(sorted: &[f64], p: f64) -> f64 {
    if sorted.is_empty() {
        return 0.0;
    }
    let idx = ((p * sorted.len() as f64) as usize).min(sorted.len() - 1);
    sorted[idx]
}

/// Parse `llama-bench -o json` output into our metrics. `llama-bench` reports a
/// separate object per test: prompt-processing (`n_gen == 0`) and token
/// generation (`n_prompt == 0`).
fn parse_json(out: &str, peak_mem_bytes: f64) -> Result<BenchMetrics, String> {
    let arr: Vec<Value> =
        serde_json::from_str(out.trim()).map_err(|e| format!("parse llama-bench json: {e}"))?;
    if arr.is_empty() {
        return Err("llama-bench returned no results".into());
    }

    let u = |o: &Value, k: &str| o.get(k).and_then(|v| v.as_u64()).unwrap_or(0);
    let gen = arr.iter().find(|o| u(o, "n_gen") > 0);
    let prompt = arr
        .iter()
        .find(|o| u(o, "n_prompt") > 0 && u(o, "n_gen") == 0);
    let primary = gen.or_else(|| arr.first()).unwrap();

    let tokens_per_sec = primary
        .get("avg_ts")
        .and_then(|v| v.as_f64())
        .unwrap_or(0.0);
    if tokens_per_sec <= 0.0 {
        return Err("llama-bench output missing throughput (avg_ts)".into());
    }

    let mut samples_ms: Vec<f64> = primary
        .get("samples_ns")
        .and_then(|v| v.as_array())
        .map(|a| {
            a.iter()
                .filter_map(|x| x.as_f64())
                .map(|ns| ns / 1.0e6)
                .collect()
        })
        .unwrap_or_default();
    if samples_ms.is_empty() {
        // Fall back to the average if per-sample timings aren't present.
        if let Some(avg_ns) = primary.get("avg_ns").and_then(|v| v.as_f64()) {
            samples_ms.push(avg_ns / 1.0e6);
        }
    }
    samples_ms.sort_by(|a, b| a.partial_cmp(b).unwrap());
    let mean = if samples_ms.is_empty() {
        0.0
    } else {
        samples_ms.iter().sum::<f64>() / samples_ms.len() as f64
    };

    // First-token latency ≈ time to process the prompt.
    let first_token_ms = prompt
        .and_then(|o| o.get("avg_ns").and_then(|v| v.as_f64()))
        .map(|ns| ns / 1.0e6)
        .unwrap_or_else(|| samples_ms.first().copied().unwrap_or(mean));

    Ok(BenchMetrics {
        tokens_per_sec,
        first_token_ms,
        latency_mean_ms: mean,
        latency_p50_ms: percentile(&samples_ms, 0.5),
        latency_p95_ms: percentile(&samples_ms, 0.95),
        peak_mem_bytes,
        accuracy: None,
        samples_ms,
    })
}

pub fn run(
    binary: &Path,
    job_id: &str,
    model: &ModelInfo,
    config: &BenchConfig,
    emit: &dyn Fn(BenchProgress),
    cancel: &AtomicBool,
) -> Result<BenchMetrics, String> {
    let mk = |phase: RunPhase, current: u32, tps: Option<f64>| BenchProgress {
        job_id: job_id.to_string(),
        model_id: model.id.clone(),
        backend_id: BackendId::Llama,
        phase,
        current,
        total: config.runs.max(1),
        message: None,
        tokens_per_sec: tps,
    };

    emit(mk(RunPhase::Loading, 0, None));

    let mut cmd = Command::new(binary);
    cmd.arg("-m")
        .arg(&model.path)
        .arg("-o")
        .arg("json")
        .arg("-p")
        .arg(config.prompt_tokens.max(1).to_string())
        .arg("-n")
        .arg(config.max_tokens.max(1).to_string())
        .arg("-r")
        .arg(config.runs.max(1).to_string())
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    configure(&mut cmd);

    let mut child = cmd.spawn().map_err(|e| format!("spawn llama-bench: {e}"))?;
    let pid = child.id();

    // Track child RSS as a real memory figure.
    let stop = Arc::new(AtomicBool::new(false));
    let peak = Arc::new(Mutex::new(0u64));
    {
        let stop = stop.clone();
        let peak = peak.clone();
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
                let mut total = sys.process(target).map(|p| p.memory()).unwrap_or(0);
                for p in sys.processes().values() {
                    if p.parent() == Some(target) {
                        total += p.memory();
                    }
                }
                if let Ok(mut g) = peak.lock() {
                    *g = (*g).max(total);
                }
                std::thread::sleep(Duration::from_millis(50));
            }
        });
    }

    // llama-bench writes JSON only at the end; poll so we can honor cancel.
    emit(mk(RunPhase::Measuring, 0, None));
    loop {
        if cancel.load(Ordering::Relaxed) {
            stop.store(true, Ordering::Relaxed);
            kill_tree(pid);
            let _ = child.wait();
            return Err("cancelled".into());
        }
        match child.try_wait() {
            Ok(Some(status)) => {
                stop.store(true, Ordering::Relaxed);
                let mut out = String::new();
                if let Some(mut so) = child.stdout.take() {
                    let _ = so.read_to_string(&mut out);
                }
                if !status.success() {
                    let mut err = String::new();
                    if let Some(mut se) = child.stderr.take() {
                        let _ = se.read_to_string(&mut err);
                    }
                    let tail = err.lines().rev().take(3).collect::<Vec<_>>().join(" ");
                    return Err(format!("llama-bench failed: {tail}"));
                }
                let peak_mem = *peak.lock().unwrap() as f64;
                let metrics = parse_json(&out, peak_mem)?;
                emit(mk(
                    RunPhase::Done,
                    config.runs.max(1),
                    Some(metrics.tokens_per_sec),
                ));
                return Ok(metrics);
            }
            Ok(None) => std::thread::sleep(Duration::from_millis(120)),
            Err(e) => {
                stop.store(true, Ordering::Relaxed);
                return Err(format!("llama-bench wait: {e}"));
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_llama_bench_json() {
        // Trimmed but realistic two-test output (pp512 + tg128).
        let out = r#"[
          {"model_filename":"m.gguf","model_size":3825065984,"model_n_params":6738415616,
           "n_prompt":512,"n_gen":0,"avg_ns":250000000,"avg_ts":2048.0,
           "samples_ns":[250000000,251000000],"samples_ts":[2048.0,2040.0]},
          {"model_filename":"m.gguf","model_size":3825065984,"model_n_params":6738415616,
           "n_prompt":0,"n_gen":128,"avg_ns":2560000000,"avg_ts":50.0,
           "samples_ns":[2560000000,2600000000],"samples_ts":[50.0,49.2]}
        ]"#;
        let m = parse_json(out, 4.2e9).expect("parse");
        assert!((m.tokens_per_sec - 50.0).abs() < 1e-6); // generation throughput
        assert!((m.first_token_ms - 250.0).abs() < 1e-6); // prompt eval = 250 ms
        assert_eq!(m.samples_ms.len(), 2);
        assert!((m.latency_mean_ms - 2580.0).abs() < 1.0);
        assert_eq!(m.peak_mem_bytes, 4.2e9);
    }
}
