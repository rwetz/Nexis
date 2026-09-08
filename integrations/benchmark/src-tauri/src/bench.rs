//! Benchmark runner. Executes a job's model × backend matrix on a worker
//! thread, streaming `bench://progress` and `bench://result` events.

use crate::backend::engine_for;
use crate::domain::*;
use crate::state::AppState;
use chrono::Utc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager};

pub fn start(app: AppHandle, job: BenchJob, cancel: Arc<AtomicBool>) {
    std::thread::spawn(move || {
        run(&app, &job, &cancel);
        app.state::<AppState>().finish(&job.job_id);
    });
}

fn run(app: &AppHandle, job: &BenchJob, cancel: &AtomicBool) {
    'outer: for model in &job.models {
        for &backend_id in &job.backend_ids {
            if cancel.load(Ordering::Relaxed) {
                break 'outer;
            }
            // The llama.cpp backend uses the user-located binary from the job;
            // everything else builds from the static registry.
            let engine: Box<dyn crate::backend::Engine> = match backend_id {
                BackendId::Llama => Box::new(crate::backend::LlamaCpp::resolve(
                    job.llama_bench_path.as_deref(),
                )),
                other => match engine_for(other) {
                    Some(e) => e,
                    None => continue,
                },
            };
            let info = engine.info();
            // Defensive: the UI already filters, but never run an unsupported cell.
            if !info.available || !info.supports.contains(&model.format) {
                continue;
            }

            let app_emit = app.clone();
            let emit = move |p: BenchProgress| {
                let _ = app_emit.emit("bench://progress", &p);
            };

            let note = engine.note();
            let result = match engine.run(&job.job_id, model, &job.config, &emit, cancel) {
                Ok(metrics) => BenchResult {
                    id: result_id(&job.job_id, &model.id, backend_id),
                    model_id: model.id.clone(),
                    backend_id,
                    status: "done".into(),
                    metrics: Some(metrics),
                    error: None,
                    finished_at: Utc::now().to_rfc3339(),
                    simulated: engine.simulated(),
                    note,
                },
                Err(e) if e == "cancelled" => break 'outer,
                Err(e) => BenchResult {
                    id: result_id(&job.job_id, &model.id, backend_id),
                    model_id: model.id.clone(),
                    backend_id,
                    status: "error".into(),
                    metrics: None,
                    error: Some(e),
                    finished_at: Utc::now().to_rfc3339(),
                    simulated: engine.simulated(),
                    note,
                },
            };
            let _ = app.emit("bench://result", &result);
        }
    }
}

fn result_id(job_id: &str, model_id: &str, backend: BackendId) -> String {
    format!("{job_id}::{model_id}::{backend:?}")
}
