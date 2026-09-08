//! Shared domain types. Serialized as camelCase to match src/lib/types.ts.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ModelFormat {
    Onnx,
    Gguf,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TaskType {
    Generation,
    Classification,
    Embedding,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum DeviceKind {
    Cpu,
    Gpu,
    Auto,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum BackendId {
    Nexis,
    Onnx,
    Llama,
    Sim,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelInfo {
    pub id: String,
    pub name: String,
    pub path: String,
    pub format: ModelFormat,
    pub size_bytes: u64,
    pub task: TaskType,
    #[serde(default)]
    pub params_label: Option<String>,
    #[serde(default)]
    pub quant: Option<String>,
    /// GGUF architecture (e.g. "llama", "phi3"), from the header.
    #[serde(default)]
    pub arch: Option<String>,
    /// Trained context length, from the GGUF header.
    #[serde(default)]
    pub context_length: Option<u64>,
    pub added_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackendInfo {
    pub id: BackendId,
    pub label: String,
    pub description: String,
    pub available: bool,
    pub device: DeviceKind,
    #[serde(default)]
    pub version: Option<String>,
    pub supports: Vec<ModelFormat>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BenchConfig {
    pub task: TaskType,
    pub runs: u32,
    pub warmup: u32,
    pub prompt_tokens: u32,
    pub max_tokens: u32,
    pub batch_size: u32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum RunPhase {
    Queued,
    Loading,
    Warmup,
    Measuring,
    Done,
    Error,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BenchProgress {
    pub job_id: String,
    pub model_id: String,
    pub backend_id: BackendId,
    pub phase: RunPhase,
    pub current: u32,
    pub total: u32,
    #[serde(default)]
    pub message: Option<String>,
    #[serde(default)]
    pub tokens_per_sec: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BenchMetrics {
    pub tokens_per_sec: f64,
    pub first_token_ms: f64,
    pub latency_mean_ms: f64,
    pub latency_p50_ms: f64,
    pub latency_p95_ms: f64,
    pub peak_mem_bytes: f64,
    #[serde(default)]
    pub accuracy: Option<f64>,
    pub samples_ms: Vec<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BenchResult {
    pub id: String,
    pub model_id: String,
    pub backend_id: BackendId,
    pub status: String,
    #[serde(default)]
    pub metrics: Option<BenchMetrics>,
    #[serde(default)]
    pub error: Option<String>,
    pub finished_at: String,
    #[serde(default)]
    pub simulated: bool,
    /// Optional human note about how the metrics were obtained (e.g. real
    /// engine throughput vs. inference).
    #[serde(default)]
    pub note: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BenchJob {
    pub job_id: String,
    pub config: BenchConfig,
    pub models: Vec<ModelInfo>,
    pub backend_ids: Vec<BackendId>,
    /// User-located `llama-bench` binary (for the llama.cpp backend).
    #[serde(default)]
    pub llama_bench_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LlamaProbe {
    pub available: bool,
    #[serde(default)]
    pub version: Option<String>,
    #[serde(default)]
    pub path: Option<String>,
}
