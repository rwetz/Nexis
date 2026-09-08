//! Real ONNX Runtime integration via the `ort` crate. Loads the dropped `.onnx`
//! model, introspects its input signature, synthesizes valid inputs (the model
//! is arbitrary, so we fabricate tensors matching each input's dtype/shape),
//! and times warm-up + measured forward passes. Every latency here is real.

use crate::domain::*;
use ort::session::builder::GraphOptimizationLevel;
use ort::session::{Session, SessionInputValue};
use ort::value::{Tensor, TensorElementType, ValueType};
use std::borrow::Cow;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Instant;
use sysinfo::{Pid, ProcessRefreshKind, ProcessesToUpdate, System};

pub const ONNX_NOTE: &str =
    "Real ONNX Runtime inference on the dropped model. Inputs are synthesized to match the model's signature (so there's no accuracy figure); latency and throughput are measured forward passes.";

/// One resolved input: name, element type, and a concrete (non-symbolic) shape.
struct InSpec {
    name: String,
    ty: TensorElementType,
    shape: Vec<i64>,
}

fn numel(shape: &[i64]) -> usize {
    shape
        .iter()
        .map(|&d| d.max(0) as usize)
        .product::<usize>()
        .max(1)
}

/// Resolve a model's input signature into concrete specs, substituting dynamic
/// dimensions: the first dynamic dim → batch, the next → sequence length.
fn build_specs(session: &Session, config: &BenchConfig) -> Result<Vec<InSpec>, String> {
    let batch = config.batch_size.max(1) as i64;
    let seq = config.prompt_tokens.max(1) as i64;
    let mut specs = Vec::new();
    for input in session.inputs() {
        let ValueType::Tensor { ty, shape, .. } = input.dtype() else {
            return Err(format!(
                "input '{}' is not a tensor (unsupported)",
                input.name()
            ));
        };
        let mut dyn_seen = 0;
        let resolved: Vec<i64> = shape
            .iter()
            .map(|&d| {
                if d < 0 {
                    let v = if dyn_seen == 0 { batch } else { seq };
                    dyn_seen += 1;
                    v
                } else {
                    d.max(1)
                }
            })
            .collect();
        if numel(&resolved) > 16_000_000 {
            return Err(format!(
                "input '{}' resolves too large to benchmark",
                input.name()
            ));
        }
        specs.push(InSpec {
            name: input.name().to_string(),
            ty: *ty,
            shape: resolved,
        });
    }
    if specs.is_empty() {
        return Err("model has no inputs".into());
    }
    Ok(specs)
}

/// A small, valid integer fill for a given input name (token ids = 1, attention
/// mask = 1, token-type ids = 0).
fn int_fill(name: &str) -> i64 {
    let l = name.to_lowercase();
    if l.contains("type") {
        0
    } else {
        1
    }
}

/// Build a fresh inputs vector (each `run` consumes its inputs).
fn make_inputs(
    specs: &[InSpec],
) -> Result<Vec<(Cow<'static, str>, SessionInputValue<'static>)>, String> {
    let mut out = Vec::with_capacity(specs.len());
    for s in specs {
        let n = numel(&s.shape);
        let shape = s.shape.clone();
        let em = |e: String| format!("input '{}': {e}", s.name);
        let value: SessionInputValue<'static> = match s.ty {
            TensorElementType::Int64 => {
                let data = vec![int_fill(&s.name); n];
                SessionInputValue::from(
                    Tensor::from_array((shape, data)).map_err(|e| em(e.to_string()))?,
                )
            }
            TensorElementType::Int32 => {
                let data = vec![int_fill(&s.name) as i32; n];
                SessionInputValue::from(
                    Tensor::from_array((shape, data)).map_err(|e| em(e.to_string()))?,
                )
            }
            TensorElementType::Float32 => {
                let data = vec![0.0f32; n];
                SessionInputValue::from(
                    Tensor::from_array((shape, data)).map_err(|e| em(e.to_string()))?,
                )
            }
            TensorElementType::Float64 => {
                let data = vec![0.0f64; n];
                SessionInputValue::from(
                    Tensor::from_array((shape, data)).map_err(|e| em(e.to_string()))?,
                )
            }
            TensorElementType::Bool => {
                let v = s.name.to_lowercase().contains("mask");
                let data = vec![v; n];
                SessionInputValue::from(
                    Tensor::from_array((shape, data)).map_err(|e| em(e.to_string()))?,
                )
            }
            TensorElementType::Uint8 => {
                let data = vec![0u8; n];
                SessionInputValue::from(
                    Tensor::from_array((shape, data)).map_err(|e| em(e.to_string()))?,
                )
            }
            other => {
                return Err(format!(
                    "input '{}' has unsupported dtype {other:?}",
                    s.name
                ))
            }
        };
        out.push((Cow::Owned(s.name.clone()), value));
    }
    Ok(out)
}

fn percentile(sorted: &[f64], p: f64) -> f64 {
    if sorted.is_empty() {
        return 0.0;
    }
    let idx = ((p * sorted.len() as f64) as usize).min(sorted.len() - 1);
    sorted[idx]
}

/// tokens/pass ≈ batch × sequence for rank-≥2 inputs, else batch.
fn tokens_per_pass(specs: &[InSpec]) -> f64 {
    if let Some(s) = specs.iter().find(|s| s.shape.len() >= 2) {
        (s.shape[0].max(1) * s.shape[1].max(1)) as f64
    } else {
        specs
            .first()
            .and_then(|s| s.shape.first())
            .map(|d| d.max(&1))
            .copied()
            .unwrap_or(1) as f64
    }
}

pub fn run(
    job_id: &str,
    model: &ModelInfo,
    config: &BenchConfig,
    emit: &dyn Fn(BenchProgress),
    cancel: &AtomicBool,
) -> Result<BenchMetrics, String> {
    let mk = |phase: RunPhase, current: u32, tps: Option<f64>| BenchProgress {
        job_id: job_id.to_string(),
        model_id: model.id.clone(),
        backend_id: BackendId::Onnx,
        phase,
        current,
        total: config.runs.max(1),
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

    let pid = Pid::from_u32(std::process::id());
    let mut sys = System::new();
    let read_rss = |sys: &mut System| -> u64 {
        sys.refresh_processes_specifics(
            ProcessesToUpdate::Some(&[pid]),
            true,
            ProcessRefreshKind::nothing().with_memory(),
        );
        sys.process(pid).map(|p| p.memory()).unwrap_or(0)
    };
    let baseline_rss = read_rss(&mut sys);

    let mut session = Session::builder()
        .map_err(|e| format!("ort init: {e}"))?
        .with_optimization_level(GraphOptimizationLevel::Level3)
        .map_err(|e| format!("ort options: {e}"))?
        .commit_from_file(&model.path)
        .map_err(|e| format!("load '{}': {e}", model.name))?;

    let specs = build_specs(&session, config)?;
    let tok_per_pass = tokens_per_pass(&specs);

    // Warm-up (discarded).
    for _ in 0..config.warmup {
        check()?;
        emit(mk(RunPhase::Warmup, 0, None));
        let inputs = make_inputs(&specs)?;
        session
            .run(inputs)
            .map_err(|e| format!("warm-up inference: {e}"))?;
    }

    // Measured.
    let mut peak_rss = baseline_rss;
    let mut samples_ms: Vec<f64> = Vec::with_capacity(config.runs.max(1) as usize);
    for i in 0..config.runs.max(1) {
        check()?;
        let inputs = make_inputs(&specs)?;
        let t = Instant::now();
        session.run(inputs).map_err(|e| format!("inference: {e}"))?;
        let dt = t.elapsed().as_secs_f64() * 1000.0;
        samples_ms.push(dt);
        peak_rss = peak_rss.max(read_rss(&mut sys));
        let tps = tok_per_pass / (dt / 1000.0).max(1e-6);
        emit(mk(RunPhase::Measuring, i + 1, Some(tps)));
    }

    let mean = samples_ms.iter().sum::<f64>() / samples_ms.len() as f64;
    let mut sorted = samples_ms.clone();
    sorted.sort_by(|a, b| a.partial_cmp(b).unwrap());

    let tokens_per_sec = tok_per_pass / (mean / 1000.0).max(1e-6);
    let peak_mem_bytes = peak_rss.saturating_sub(baseline_rss) as f64;

    emit(mk(RunPhase::Done, config.runs.max(1), Some(tokens_per_sec)));

    Ok(BenchMetrics {
        tokens_per_sec,
        first_token_ms: sorted.first().copied().unwrap_or(mean),
        latency_mean_ms: mean,
        latency_p50_ms: percentile(&sorted, 0.5),
        latency_p95_ms: percentile(&sorted, 0.95),
        peak_mem_bytes,
        accuracy: None,
        samples_ms: sorted,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Real load+inference smoke test. Gated on an env var so plain `cargo test`
    /// skips it: `ONNX_SMOKE_MODEL=/path/model.onnx cargo test onnx_smoke -- --nocapture`.
    #[test]
    fn onnx_smoke() {
        let Ok(path) = std::env::var("ONNX_SMOKE_MODEL") else {
            eprintln!("skip onnx_smoke: set ONNX_SMOKE_MODEL to a .onnx file");
            return;
        };
        let model = ModelInfo {
            id: "smoke".into(),
            name: "smoke.onnx".into(),
            path,
            format: ModelFormat::Onnx,
            size_bytes: 0,
            task: TaskType::Classification,
            params_label: None,
            quant: None,
            arch: None,
            context_length: None,
            added_at: String::new(),
        };
        let config = BenchConfig {
            task: TaskType::Classification,
            runs: 5,
            warmup: 1,
            prompt_tokens: 8,
            max_tokens: 0,
            batch_size: 4,
        };
        let cancel = AtomicBool::new(false);
        let m = run("job", &model, &config, &|_p| {}, &cancel).expect("onnx run failed");
        eprintln!(
            "onnx_smoke: tok/s={:.1} first={:.3}ms mean={:.3}ms p95={:.3}ms mem={}B samples={:?}",
            m.tokens_per_sec,
            m.first_token_ms,
            m.latency_mean_ms,
            m.latency_p95_ms,
            m.peak_mem_bytes,
            m.samples_ms
        );
        assert_eq!(m.samples_ms.len(), 5);
        assert!(m.latency_mean_ms > 0.0);
        assert!(m.tokens_per_sec.is_finite() && m.tokens_per_sec > 0.0);
    }
}
