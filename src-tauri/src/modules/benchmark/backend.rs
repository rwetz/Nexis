//! Backend abstraction. Each engine reports its capabilities and runs one
//! model × backend cell. Today every engine routes through the synthetic
//! generator (`simulated() == true`); real inference drops in behind this trait
//! without touching the harness, IPC, or UI.

use crate::modules::benchmark::domain::*;
use crate::modules::benchmark::ml_engine;
use crate::modules::benchmark::simulate::run_simulated;
use std::path::{Path, PathBuf};
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

// ── Axon (the home team) ─────────────────────────────────────────────────────

pub struct NexisMl {
    binary: Option<PathBuf>,
    version: Option<String>,
    device: DeviceKind,
}
impl NexisMl {
    pub fn detect(managed: Option<&Path>) -> Self {
        let binary = find_axon(managed);
        let (version, device) = match binary.as_ref() {
            Some(p) => ml_engine::probe(p),
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
            label: "Axon".into(),
            description: "Python-free burn engine (wgpu / ndarray). Real training throughput."
                .into(),
            available: self.binary.is_some() && self.version.is_some(),
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
        let bin = self.binary.as_ref().ok_or("Axon binary not found")?;
        ml_engine::run(bin, job_id, model, config, emit, cancel)
    }
    fn simulated(&self) -> bool {
        false
    }
    fn note(&self) -> Option<String> {
        Some(ml_engine::NEXIS_NOTE.to_string())
    }
}

// ── ONNX Runtime ─────────────────────────────────────────────────────────────

pub struct OnnxRuntime;
impl Engine for OnnxRuntime {
    fn id(&self) -> BackendId {
        BackendId::Onnx
    }
    fn info(&self) -> BackendInfo {
        let available = !cfg!(any(
            target_os = "linux",
            all(target_os = "macos", target_arch = "x86_64")
        ));
        BackendInfo {
            id: BackendId::Onnx,
            label: "ONNX Runtime".into(),
            description: if cfg!(target_os = "linux") {
                "Unavailable on Linux: upstream ORT requires a newer system runtime than the supported release baseline."
                    .into()
            } else if cfg!(all(target_os = "macos", target_arch = "x86_64")) {
                "Unavailable on Intel macOS: upstream ORT provides no x86_64 prebuilt runtime."
                    .into()
            } else {
                "Microsoft ONNX Runtime (via the ort crate). Real inference.".into()
            },
            available,
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
        #[cfg(not(any(target_os = "linux", all(target_os = "macos", target_arch = "x86_64"))))]
        {
            crate::modules::benchmark::onnx::run(job_id, model, config, emit, cancel)
        }
        #[cfg(any(target_os = "linux", all(target_os = "macos", target_arch = "x86_64")))]
        {
            let _ = (job_id, model, config, emit, cancel);
            Err("ONNX Runtime is unavailable on this release target".into())
        }
    }
    fn simulated(&self) -> bool {
        false
    }
    fn note(&self) -> Option<String> {
        #[cfg(not(any(target_os = "linux", all(target_os = "macos", target_arch = "x86_64"))))]
        {
            Some(crate::modules::benchmark::onnx::ONNX_NOTE.to_string())
        }
        #[cfg(any(target_os = "linux", all(target_os = "macos", target_arch = "x86_64")))]
        {
            Some("Unavailable because no compatible upstream ORT prebuilt exists for this release target.".into())
        }
    }
}

// ── llama.cpp (GGUF) ─────────────────────────────────────────────────────────

pub struct LlamaCpp {
    binary: Option<PathBuf>,
}
impl LlamaCpp {
    pub fn detect() -> Self {
        Self {
            binary: crate::modules::benchmark::llama::find_on_path(),
        }
    }
    /// Resolve a user-located path, falling back to PATH.
    pub fn resolve(path: Option<&str>) -> Self {
        Self {
            binary: crate::modules::benchmark::llama::resolve(path),
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
        crate::modules::benchmark::llama::run(bin, job_id, model, config, emit, cancel)
    }
    fn simulated(&self) -> bool {
        false
    }
    fn note(&self) -> Option<String> {
        Some(crate::modules::benchmark::llama::LLAMA_NOTE.to_string())
    }
}

// ── Registry ─────────────────────────────────────────────────────────────────

/// Build one of each engine.
///
/// `managed` is the path Nexis's own ML Lab installs the standalone engine to
/// (`ml::installed_managed_engine_exe`). It is threaded through rather than looked up
/// here because resolving it needs an `AppHandle`, and because it is the whole
/// reason this panel and ML Lab agree about what "the engine" is: an engine
/// downloaded once in ML Lab must show up here without a second install and
/// without asking the user to put it on PATH.
pub fn registry(managed: Option<&Path>) -> Vec<Box<dyn Engine>> {
    vec![
        Box::new(NexisMl::detect(managed)),
        Box::new(OnnxRuntime),
        Box::new(LlamaCpp::detect()),
        Box::new(Simulated),
    ]
}

pub fn infos(managed: Option<&Path>) -> Vec<BackendInfo> {
    registry(managed).iter().map(|e| e.info()).collect()
}

pub fn engine_for(id: BackendId, managed: Option<&Path>) -> Option<Box<dyn Engine>> {
    registry(managed).into_iter().find(|e| e.id() == id)
}

// ── Axon binary discovery ────────────────────────────────────────────────────

/// `axon`, then the pre-rename `nexis-ml`.
fn exe_names() -> [&'static str; 2] {
    if cfg!(windows) {
        ["axon.exe", "nexis-ml.exe"]
    } else {
        ["axon", "nexis-ml"]
    }
}

fn find_axon(managed: Option<&Path>) -> Option<PathBuf> {
    // 0) The engine Nexis manages itself, if it has been installed. Checked
    //    first on purpose: a deliberate install through ML Lab is a stronger
    //    statement of intent than whatever happens to be on PATH, and having
    //    the two panels disagree about which binary they are measuring would
    //    make every cross-panel comparison quietly meaningless.
    if let Some(p) = managed {
        if p.is_file() {
            return Some(p.to_path_buf());
        }
    }
    // 1) Anything on PATH (split_paths handles the per-OS separator).
    //    `ml_engine::probe` then asks it for `env`, so an unrelated `axon`
    //    reports no version rather than passing as the engine.
    if let Some(path) = std::env::var_os("PATH") {
        for dir in std::env::split_paths(&path) {
            for name in exe_names() {
                let cand = dir.join(name);
                if cand.is_file() {
                    return Some(cand);
                }
            }
        }
    }
    // 2) The sibling cargo build, if the dev tree is laid out as expected.
    for rel in [
        "../../axon/target/release",
        "../axon/target/release",
        "../../nexis-ml-rs/target/release",
        "../nexis-ml-rs/target/release",
    ] {
        for name in exe_names() {
            let cand = PathBuf::from(rel).join(name);
            if cand.is_file() {
                return std::fs::canonicalize(cand).ok();
            }
        }
    }
    None
}
