//! Tauri command surface for the Benchmark panel.
//!
//! Namespaced `bench_*` so nothing here can collide with a Nexis command, and
//! anything that touches the filesystem or spawns a process is `async` through
//! `modules::heavy` -- a sync Tauri command runs on the main thread, where it
//! stalls the event loop and every queued `pty_write` behind it.
//!
//! The standalone app also shipped a `write_text_file` command for its CSV /
//! JSON export. It is gone: it was a second, unaudited write path that skipped
//! the atomic staging and the WSL rename fallback in `fs::file` (pitfall #17).
//! The panel exports through `fs_write_file` like everything else in Nexis.

use crate::modules::benchmark::backend;
use crate::modules::benchmark::bench;
use crate::modules::benchmark::domain::*;
use crate::modules::benchmark::scan;
use crate::modules::benchmark::state::BenchState;
use tauri::{AppHandle, Manager, State};

/// Which engines are compiled in and which of them can actually run here.
///
/// Probing is why this is `heavy`: resolving llama-bench walks `PATH` and the
/// nexis-ml probe spawns the engine to ask its version.
#[tauri::command]
pub async fn bench_list_backends(app: AppHandle) -> Result<Vec<BackendInfo>, String> {
    // Resolved on the caller's thread because it needs the AppHandle, then
    // moved into the blocking closure -- see `backend::registry`.
    let managed = crate::modules::ml::managed_engine_exe(&app).ok();
    crate::modules::heavy(move || Ok(backend::infos(managed.as_deref()))).await
}

/// Resolve dropped or picked file paths into model entries. Reads GGUF headers,
/// so it is filesystem work.
#[tauri::command]
pub async fn bench_scan_models(paths: Vec<String>) -> Result<Vec<ModelInfo>, String> {
    crate::modules::heavy(move || Ok(scan::scan_paths(paths))).await
}

/// Start a run. Returns as soon as the job is registered -- `bench::start`
/// owns its own thread and streams progress over `bench://progress`.
#[tauri::command]
pub fn bench_run(app: AppHandle, state: State<BenchState>, job: BenchJob) -> Result<(), String> {
    if job.models.is_empty() || job.backend_ids.is_empty() {
        return Err("nothing to benchmark".into());
    }
    let cancel = state.register(&job.job_id);
    bench::start(app, job, cancel);
    Ok(())
}

/// Flip a running job's cancellation flag. Only locks a map, so it stays sync.
#[tauri::command]
pub fn bench_cancel(state: State<BenchState>, job_id: String) {
    state.cancel(&job_id);
}

/// Validate a llama-bench binary, or auto-detect one on `PATH` when `path` is
/// null. Spawns the binary to read its version, hence `heavy`.
#[tauri::command]
pub async fn bench_probe_llama(path: Option<String>) -> Result<LlamaProbe, String> {
    crate::modules::heavy(move || {
        Ok(crate::modules::benchmark::llama::probe(path.as_deref()))
    })
    .await
}

/// Whether a cancellable job is still registered -- used by the panel to
/// reconcile its own state after a reload, since a run outlives the webview.
#[tauri::command]
pub fn bench_is_running(app: AppHandle, job_id: String) -> bool {
    app.state::<BenchState>().is_running(&job_id)
}
