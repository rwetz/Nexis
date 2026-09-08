//! Tauri command surface exposed to the React app.

use crate::backend;
use crate::bench;
use crate::domain::*;
use crate::scan;
use crate::state::AppState;
use tauri::{AppHandle, State};

#[tauri::command]
pub fn list_backends() -> Vec<BackendInfo> {
    backend::infos()
}

#[tauri::command]
pub fn scan_models(paths: Vec<String>) -> Vec<ModelInfo> {
    scan::scan_paths(paths)
}

#[tauri::command]
pub fn run_benchmark(app: AppHandle, state: State<AppState>, job: BenchJob) -> Result<(), String> {
    if job.models.is_empty() || job.backend_ids.is_empty() {
        return Err("nothing to benchmark".into());
    }
    let cancel = state.register(&job.job_id);
    bench::start(app, job, cancel);
    Ok(())
}

#[tauri::command]
pub fn cancel_benchmark(state: State<AppState>, job_id: String) {
    state.cancel(&job_id);
}

#[tauri::command]
pub fn write_text_file(path: String, contents: String) -> Result<(), String> {
    std::fs::write(&path, contents).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn probe_llama(path: Option<String>) -> LlamaProbe {
    crate::llama::probe(path.as_deref())
}
