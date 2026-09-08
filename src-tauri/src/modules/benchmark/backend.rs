//! Backend abstraction. Each engine reports its capabilities and runs one
//! model × backend cell. Today every engine routes through the synthetic
//! generator (`simulated() == true`); real inference drops in behind this trait
//! without touching the harness, IPC, or UI.

use crate::domain::*;
use crate::nexis;
use crate::simulate::run_simulated;
use std::path::PathBuf;
use std::sync::atomic::AtomicBool;

pub trait Engine: Send + Sync {
    fn id(&self) -> BackendId;
    fn info(&self) -> BackendInfo;
    fn run(
        &self,
        job_id: &str,
        model: &ModelInfo,
        config: &BenchConfig,
        emit: &dyn Fn(BenchProgress),
        cancel: &AtomicBool,
    ) -> Result<BenchMetrics, String>;
    /// Whether the metrics this engine produces are synthetic.
    fn simulated(&self) -> bool {
        true
    }
    /// Optional note about how this backend's metrics are obtained.
    fn note(&self) -> Option<String> {
        None
    }
}

// ── Simulated ────────────────────────────────────────────────────────────────

pub struct Simulated;
impl Engine for Simulated {
    fn id(&self) -> BackendId {
        BackendId::Sim
    }
    fn info(&self) -> BackendInfo {
        BackendInfo {
            id: BackendId::Sim,
            label: "Simulated".into(),
            description: "Deterministic synthetic backend for UI / protocol testing.".into(),
            available: true,
            device: DeviceKind::Cpu,
            version: Some("1.0".into()),
            supports: vec![ModelFormat::Onnx, ModelFormat::Gguf],
        }
    }
    fn run(
        &self,
        job_id: &str,
        model: &ModelInfo,
        config: &BenchConfig,
        emit: &dyn Fn(BenchProgress),
        cancel: &AtomicBool,
    ) -> Result<BenchMetrics, String> {
        run_simulated(job_id, model, BackendId::Sim, config, emit, cancel)
    }
}

// ── nexis-ml-rs (the home team) ──────────────────────────────────────────────

pub struct NexisMl {
    binary: Option<PathBuf>,
    version: Option<String>,
    device: DeviceKind,
}
impl NexisMl {
    pub fn detect() -> Self {
        let binary = find_nexis_ml();
        let (version, device) = match binary.as_ref() {
            Some(p) => nexis::probe(p),
            None => (None, DeviceKind::Cpu),
        };
        NexisMl {
            binary,
            version,
            device,
        }
    }
}
impl Engine for NexisMl {
    fn id(&self) -> BackendId {
        BackendId::Nexis
    }
    fn info(&self) -> BackendInfo {
        BackendInfo {
            id: BackendId::Nexis,
            label: "nexis-ml-rs".into(),
            description: "Python-free burn engine (wgpu / ndarray). Real training throughput."
                .into(),
            available: self.binary.is_some(),
            device: self.device,
            version: self.version.clone(),
            // The engine trains a synthetic workload; it doesn't load the model
            // file, but the comparison is framed per task so we accept both.
            supports: vec![ModelFormat::Onnx, ModelFormat::Gguf],
        }
    }
    fn run(
        &self,
        job_id: &str,
        model: &ModelInfo,
        config: &BenchConfig,
        emit: &dyn Fn(BenchProgress),
        cancel: &AtomicBool,
    ) -> Result<BenchMetrics, String> {
        let bin = self.binary.as_ref().ok_or("nexis-ml binary not found")?;
        nexis::run(bin, job_id, model, config, emit, cancel)
    }
    fn simulated(&self) -> bool {
        false
    }
    fn note(&self) -> Option<String> {
        Some(nexis::NEXIS_NOTE.to_string())
    }
}

// ── ONNX Runtime ─────────────────────────────────────────────────────────────

pub struct OnnxRuntime;
impl Engine for OnnxRuntime {
    fn id(&self) -> BackendId {
        BackendId::Onnx
    }
    fn info(&self) -> BackendInfo {
        BackendInfo {
            id: BackendId::Onnx,
            label: "ONNX Runtime".into(),
            description: "Microsoft ONNX Runtime (via the ort crate). Real inference.".into(),
            available: true,
            device: DeviceKind::Cpu,
            version: None,
            supports: vec![ModelFormat::Onnx],
        }
    }
    fn run(
        &self,
        job_id: &str,
        model: &ModelInfo,
        config: &BenchConfig,
        emit: &dyn Fn(BenchProgress),
        cancel: &AtomicBool,
    ) -> Result<BenchMetrics, String> {
        crate::onnx::run(job_id, model, config, emit, cancel)
    }
    fn simulated(&self) -> bool {
        false
    }
    fn note(&self) -> Option<String> {
        Some(crate::onnx::ONNX_NOTE.to_string())
    }
}

// ── llama.cpp (GGUF) ─────────────────────────────────────────────────────────

pub struct LlamaCpp {
    binary: Option<PathBuf>,
}
impl LlamaCpp {
    pub fn detect() -> Self {
        Self {
            binary: crate::llama::find_on_path(),
        }
    }
    /// Resolve a user-located path, falling back to PATH.
    pub fn resolve(path: Option<&str>) -> Self {
        Self {
            binary: crate::llama::resolve(path),
        }
    }
}
impl Engine for LlamaCpp {
    fn id(&self) -> BackendId {
        BackendId::Llama
    }
    fn info(&self) -> BackendInfo {
        BackendInfo {
            id: BackendId::Llama,
            label: "llama.cpp".into(),
            description: "GGUF inference via llama-bench (no cmake — locate the prebuilt binary)."
                .into(),
            available: self.binary.is_some(),
            device: DeviceKind::Auto,
            version: None,
            supports: vec![ModelFormat::Gguf],
        }
    }
    fn run(
        &self,
        job_id: &str,
        model: &ModelInfo,
        config: &BenchConfig,
        emit: &dyn Fn(BenchProgress),
        cancel: &AtomicBool,
    ) -> Result<BenchMetrics, String> {
        let bin = self
            .binary
            .as_ref()
            .ok_or("llama-bench not found — locate it in the Backends panel")?;
        crate::llama::run(bin, job_id, model, config, emit, cancel)
    }
    fn simulated(&self) -> bool {
        false
    }
    fn note(&self) -> Option<String> {
        Some(crate::llama::LLAMA_NOTE.to_string())
    }
}

// ── Registry ─────────────────────────────────────────────────────────────────

pub fn registry() -> Vec<Box<dyn Engine>> {
    vec![
        Box::new(NexisMl::detect()),
        Box::new(OnnxRuntime),
        Box::new(LlamaCpp::detect()),
        Box::new(Simulated),
    ]
}

pub fn infos() -> Vec<BackendInfo> {
    registry().iter().map(|e| e.info()).collect()
}

pub fn engine_for(id: BackendId) -> Option<Box<dyn Engine>> {
    registry().into_iter().find(|e| e.id() == id)
}

// ── nexis-ml binary discovery ────────────────────────────────────────────────

fn exe_name() -> &'static str {
    if cfg!(windows) {
        "nexis-ml.exe"
    } else {
        "nexis-ml"
    }
}

fn find_nexis_ml() -> Option<PathBuf> {
    // 1) Anything on PATH (split_paths handles the per-OS separator).
    if let Some(path) = std::env::var_os("PATH") {
        for dir in std::env::split_paths(&path) {
            let cand = dir.join(exe_name());
            if cand.is_file() {
                return Some(cand);
            }
        }
    }
    // 2) The sibling cargo build, if the dev tree is laid out as expected.
    for rel in [
        "../../nexis-ml-rs/target/release",
        "../nexis-ml-rs/target/release",
    ] {
        let cand = PathBuf::from(rel).join(exe_name());
        if cand.is_file() {
            return std::fs::canonicalize(cand).ok();
        }
    }
    None
}
