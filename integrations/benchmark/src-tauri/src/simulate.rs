//! Deterministic synthetic benchmark generator + the streamed run loop used by
//! the Simulated backend (and, for now, the not-yet-wired real backends). Real
//! engines replace `run` with actual inference timing behind the same trait.

use crate::domain::*;
use std::sync::atomic::{AtomicBool, Ordering};
use std::thread::sleep;
use std::time::Duration;

fn fnv1a(s: &str) -> u32 {
    let mut h: u32 = 2166136261;
    for b in s.bytes() {
        h ^= b as u32;
        h = h.wrapping_mul(16777619);
    }
    h
}

/// Small linear-congruential RNG so results are stable per (model, backend).
struct Lcg(u32);
impl Lcg {
    fn next_f(&mut self) -> f64 {
        self.0 = self.0.wrapping_mul(1664525).wrapping_add(1013904223);
        self.0 as f64 / u32::MAX as f64
    }
}

fn backend_factor(b: BackendId) -> f64 {
    match b {
        BackendId::Nexis => 1.18, // the hero engine
        BackendId::Onnx => 1.0,
        BackendId::Llama => 0.92,
        BackendId::Sim => 0.80,
    }
}

fn percentile(sorted: &[f64], p: f64) -> f64 {
    if sorted.is_empty() {
        return 0.0;
    }
    let idx = ((p * sorted.len() as f64) as usize).min(sorted.len() - 1);
    sorted[idx]
}

pub fn simulate_metrics(
    model: &ModelInfo,
    backend: BackendId,
    config: &BenchConfig,
) -> BenchMetrics {
    let key = format!("{}{:?}{:?}", model.id, backend, config.task);
    let mut rng = Lcg(fnv1a(&key));

    let size_mb = (model.size_bytes as f64 / 1e6).max(8.0);
    let base_tps = (9000.0 / size_mb.sqrt()).clamp(14.0, 2400.0);
    let factor = backend_factor(backend);
    let noise = 0.9 + rng.next_f() * 0.2;
    let tokens_per_sec = base_tps * factor * noise;

    let first_token_ms = 18.0 + size_mb * 0.22 * (1.0 / factor) + rng.next_f() * 20.0;
    let per_token_ms = 1000.0 / tokens_per_sec;

    let mean_latency = match config.task {
        TaskType::Generation => first_token_ms + per_token_ms * config.max_tokens as f64,
        _ => per_token_ms * (config.prompt_tokens.max(8) as f64) * config.batch_size as f64 / 4.0,
    };

    let mut samples: Vec<f64> = (0..config.runs.max(1))
        .map(|_| mean_latency * (1.0 + (rng.next_f() - 0.5) * 0.12))
        .collect();
    let mean = samples.iter().sum::<f64>() / samples.len() as f64;
    let mut sorted = samples.clone();
    sorted.sort_by(|a, b| a.partial_cmp(b).unwrap());

    let peak_mem_bytes = model.size_bytes as f64 * (1.15 + rng.next_f() * 0.5) + 180e6;
    let accuracy = match config.task {
        TaskType::Classification => Some(
            0.78 + rng.next_f() * 0.19
                + if backend == BackendId::Nexis {
                    0.01
                } else {
                    0.0
                },
        ),
        _ => None,
    };

    // Round samples lightly to keep payloads tidy.
    for s in samples.iter_mut() {
        *s = (*s * 100.0).round() / 100.0;
    }

    BenchMetrics {
        tokens_per_sec,
        first_token_ms,
        latency_mean_ms: mean,
        latency_p50_ms: percentile(&sorted, 0.5),
        latency_p95_ms: percentile(&sorted, 0.95),
        peak_mem_bytes,
        accuracy,
        samples_ms: samples,
    }
}

/// Drive one model × backend cell through the benchmark lifecycle, emitting
/// progress and respecting cancellation. Returns the metrics, or an error
/// string (e.g. "cancelled").
pub fn run_simulated(
    job_id: &str,
    model: &ModelInfo,
    backend: BackendId,
    config: &BenchConfig,
    emit: &dyn Fn(BenchProgress),
    cancel: &AtomicBool,
) -> Result<BenchMetrics, String> {
    let mk = |phase: RunPhase, current: u32, tps: Option<f64>| BenchProgress {
        job_id: job_id.to_string(),
        model_id: model.id.clone(),
        backend_id: backend,
        phase,
        current,
        total: config.runs,
        message: None,
        tokens_per_sec: tps,
    };
    let check = || {
        if cancel.load(Ordering::Relaxed) {
            Err("cancelled".to_string())
        } else {
            Ok(())
        }
    };

    emit(mk(RunPhase::Loading, 0, None));
    sleep(Duration::from_millis(200));
    check()?;

    for _ in 0..config.warmup {
        check()?;
        emit(mk(RunPhase::Warmup, 0, None));
        sleep(Duration::from_millis(120));
    }

    let metrics = simulate_metrics(model, backend, config);
    for i in 0..config.runs {
        check()?;
        emit(mk(RunPhase::Measuring, i + 1, Some(metrics.tokens_per_sec)));
        sleep(Duration::from_millis(90));
    }

    emit(mk(RunPhase::Done, config.runs, None));
    Ok(metrics)
}
