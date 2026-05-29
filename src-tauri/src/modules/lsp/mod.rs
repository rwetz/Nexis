pub mod session;

use std::collections::HashMap;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{Arc, RwLock};

use serde_json::Value;
use tauri::AppHandle;

use session::LspSession;

pub struct LspState {
    sessions: RwLock<HashMap<u32, Arc<LspSession>>>,
    next_id: AtomicU32,
}

impl Default for LspState {
    fn default() -> Self {
        Self {
            sessions: RwLock::new(HashMap::new()),
            next_id: AtomicU32::new(1),
        }
    }
}

// ── Commands ──────────────────────────────────────────────────────────────────

/// Start an LSP server subprocess and return a session handle.
/// Performs the initialize/initialized handshake before returning.
#[tauri::command]
pub async fn lsp_start(
    state: tauri::State<'_, LspState>,
    app: AppHandle,
    server_cmd: String,
    server_args: Vec<String>,
    workspace_root: String,
    initialization_options: Option<Value>,
) -> Result<u32, String> {
    let result = tauri::async_runtime::spawn_blocking(move || {
        LspSession::start(
            &server_cmd,
            &server_args,
            &workspace_root,
            initialization_options,
            app,
        )
    })
    .await
    .map_err(|e| e.to_string())??;

    let id = state.next_id.fetch_add(1, Ordering::Relaxed);
    state
        .sessions
        .write()
        .unwrap()
        .insert(id, Arc::new(result));
    Ok(id)
}

/// Send a JSON-RPC request to the LSP server and await the response.
#[tauri::command]
pub async fn lsp_request(
    state: tauri::State<'_, LspState>,
    session_id: u32,
    method: String,
    params: Option<Value>,
) -> Result<Value, String> {
    let session = state
        .sessions
        .read()
        .unwrap()
        .get(&session_id)
        .cloned()
        .ok_or_else(|| "no LSP session".to_string())?;

    tauri::async_runtime::spawn_blocking(move || session.request_blocking(method, params))
        .await
        .map_err(|e| e.to_string())?
}

/// Send a JSON-RPC notification (fire-and-forget) to the LSP server.
#[tauri::command]
pub fn lsp_notify(
    state: tauri::State<'_, LspState>,
    session_id: u32,
    method: String,
    params: Option<Value>,
) -> Result<(), String> {
    state
        .sessions
        .read()
        .unwrap()
        .get(&session_id)
        .cloned()
        .ok_or_else(|| "no LSP session".to_string())?
        .notify(method, params)
}

/// Stop and remove an LSP session (kills the server process).
#[tauri::command]
pub fn lsp_stop(state: tauri::State<'_, LspState>, session_id: u32) -> Result<(), String> {
    state.sessions.write().unwrap().remove(&session_id);
    Ok(())
}
