//! Benchmark state: a registry of per-job cancellation flags.
//!
//! The `.lock()` calls recover from a poisoned mutex rather than unwrapping.
//! In the standalone app a panic here took down an app whose only job was
//! benchmarking; in Nexis the same panic would land on a Tauri worker thread
//! and take the terminal with it (pitfall #8). The guarded value is a plain
//! map of flags, so `into_inner` is always safe to keep going with.

use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, MutexGuard};

#[derive(Default)]
pub struct BenchState {
    cancels: Mutex<HashMap<String, Arc<AtomicBool>>>,
}

impl BenchState {
    fn cancels(&self) -> MutexGuard<'_, HashMap<String, Arc<AtomicBool>>> {
        self.cancels.lock().unwrap_or_else(|e| e.into_inner())
    }

    /// Register a job and return its cancellation flag.
    pub fn register(&self, job_id: &str) -> Arc<AtomicBool> {
        let flag = Arc::new(AtomicBool::new(false));
        self.cancels().insert(job_id.to_string(), flag.clone());
        flag
    }

    pub fn cancel(&self, job_id: &str) {
        if let Some(flag) = self.cancels().get(job_id) {
            flag.store(true, Ordering::Relaxed);
        }
    }

    pub fn finish(&self, job_id: &str) {
        self.cancels().remove(job_id);
    }

    /// Whether the job is still registered — i.e. started and not yet finished.
    ///
    /// A run outlives the webview: the panel can be closed, the sidebar view
    /// switched, or the frontend hot-reloaded while the engine keeps working.
    /// Without this the panel would come back believing nothing is running and
    /// offer to start a second job on top of the first.
    pub fn is_running(&self, job_id: &str) -> bool {
        self.cancels().contains_key(job_id)
    }
}
