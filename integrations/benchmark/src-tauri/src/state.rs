//! App-wide state: a registry of per-job cancellation flags.

use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

#[derive(Default)]
pub struct AppState {
    cancels: Mutex<HashMap<String, Arc<AtomicBool>>>,
}

impl AppState {
    /// Register a job and return its cancellation flag.
    pub fn register(&self, job_id: &str) -> Arc<AtomicBool> {
        let flag = Arc::new(AtomicBool::new(false));
        self.cancels
            .lock()
            .unwrap()
            .insert(job_id.to_string(), flag.clone());
        flag
    }

    pub fn cancel(&self, job_id: &str) {
        if let Some(flag) = self.cancels.lock().unwrap().get(job_id) {
            flag.store(true, Ordering::Relaxed);
        }
    }

    pub fn finish(&self, job_id: &str) {
        self.cancels.lock().unwrap().remove(job_id);
    }
}
