// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

pub mod session;

use std::collections::HashMap;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{Arc, RwLock};

use serde_json::Value;
use tauri::AppHandle;

use session::DapSession;

pub struct DapState {
    sessions: RwLock<HashMap<u32, Arc<DapSession>>>,
    next_id: AtomicU32,
}

impl Default for DapState {
    fn default() -> Self {
        Self {
            sessions: RwLock::new(HashMap::new()),
            next_id: AtomicU32::new(1),
        }
    }
}

// ── Commands ──────────────────────────────────────────────────────────────────

/// Spawn a debug adapter and perform the initialize handshake.
#[tauri::command]
pub async fn dap_start(
    state: tauri::State<'_, DapState>,
    app: AppHandle,
    adapter_cmd: String,
    adapter_args: Vec<String>,
    adapter_id: String,
) -> Result<u32, String> {
    let session_id = state.next_id.fetch_add(1, Ordering::Relaxed);

    let session = tauri::async_runtime::spawn_blocking(move || {
        let s = DapSession::start(&adapter_cmd, &adapter_args, session_id, app)?;
        s.initialize(&adapter_id)?;
        Ok::<DapSession, String>(s)
    })
    .await
    .map_err(|e| e.to_string())??;

    state
        .sessions
        .write()
        .unwrap()
        .insert(session_id, Arc::new(session));
    Ok(session_id)
}

/// Send a DAP request and await its response body.
#[tauri::command]
pub async fn dap_request(
    state: tauri::State<'_, DapState>,
    session_id: u32,
    command: String,
    arguments: Option<Value>,
) -> Result<Value, String> {
    let session = state
        .sessions
        .read()
        .unwrap()
        .get(&session_id)
        .cloned()
        .ok_or_else(|| "no DAP session".to_string())?;

    tauri::async_runtime::spawn_blocking(move || session.request_blocking(command, arguments))
        .await
        .map_err(|e| e.to_string())?
}

/// Disconnect and remove a debug session.
#[tauri::command]
pub fn dap_stop(state: tauri::State<'_, DapState>, session_id: u32) -> Result<(), String> {
    state.sessions.write().unwrap().remove(&session_id);
    Ok(())
}

/// List active debug session IDs.
#[tauri::command]
pub fn dap_sessions(state: tauri::State<'_, DapState>) -> Vec<u32> {
    state.sessions.read().unwrap().keys().copied().collect()
}
