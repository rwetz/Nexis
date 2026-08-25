// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

pub(crate) mod da_filter;
mod session;
pub(crate) mod shell_init;
mod watchdog;

use std::collections::HashMap;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{Arc, RwLock};
use std::thread;

use portable_pty::PtySize;
use tauri::ipc::{Channel, Response};

use crate::modules::workspace::{authorize_spawn_cwd, WorkspaceEnv, WorkspaceRegistry};
use session::Session;

pub struct PtyState {
    sessions: RwLock<HashMap<u32, Arc<Session>>>,
    // Starts at 1 so freshly-handed-out ids are never 0, which the frontend
    // sometimes treats as "unset". Increments monotonically; never reused.
    next_id: AtomicU32,
}

impl Default for PtyState {
    fn default() -> Self {
        Self {
            sessions: RwLock::new(HashMap::new()),
            next_id: AtomicU32::new(1),
        }
    }
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn pty_open(
    state: tauri::State<'_, PtyState>,
    registry: tauri::State<'_, WorkspaceRegistry>,
    cols: u16,
    rows: u16,
    cwd: Option<String>,
    workspace: Option<WorkspaceEnv>,
    extra_env: Option<HashMap<String, String>>,
    shell: Option<String>,
    on_data: Channel<Response>,
    on_exit: Channel<i32>,
) -> Result<u32, String> {
    let workspace = WorkspaceEnv::from_option(workspace);
    let authorized_cwd =
        authorize_spawn_cwd(&registry, cwd.as_deref(), &workspace).map_err(|e| {
            log::warn!("pty_open: cwd rejected: {e}");
            e
        })?;
    // Spawn in the *authorized* path, not the raw input. authorize_spawn_cwd
    // resolves the workspace-relative form, heals a mangled verbatim prefix
    // (pitfall #19) and canonicalizes symlinks; forwarding the raw string
    // would throw that away and leave the shell starting wherever
    // apply_common's is_dir fallback lands instead of where was authorized.
    let spawn_cwd = authorized_cwd.map(|p| p.to_string_lossy().into_owned());
    let extra_env = extra_env.unwrap_or_default();
    let session = tauri::async_runtime::spawn_blocking(move || {
        session::spawn(
            cols, rows, spawn_cwd, workspace, extra_env, shell, on_data, on_exit,
        )
        .map(|(s, _)| s)
    })
    .await
    .map_err(|e| {
        log::error!("pty_open join failed: {e}");
        e.to_string()
    })?
    .map_err(|e| {
        log::error!("pty_open failed: {e}");
        e
    })?;
    let id = state.next_id.fetch_add(1, Ordering::Relaxed);
    state
        .sessions
        .write()
        .unwrap_or_else(|e| e.into_inner())
        .insert(id, session);
    log::info!("pty opened id={id} cols={cols} rows={rows}");
    Ok(id)
}

#[tauri::command]
pub fn pty_write(state: tauri::State<PtyState>, id: u32, data: String) -> Result<(), String> {
    let session = state
        .sessions
        .read()
        .unwrap_or_else(|e| e.into_inner())
        .get(&id)
        .cloned()
        .ok_or_else(|| {
            log::warn!("pty_write: unknown id={id}");
            "no session".to_string()
        })?;
    // Enqueue to the session's writer thread instead of writing here. The
    // direct write could block the main thread: if the child stops reading
    // (Ctrl+S flow control, stopped process) the kernel pipe buffer fills and
    // `write_all` stalls the whole app. The FIFO channel keeps byte order =
    // IPC arrival order (a spawn_blocking per write would not).
    session.write_tx.send(data.into_bytes()).map_err(|_| {
        // Writer thread gone — child exited and the pipe closed (EPIPE-like).
        log::debug!("pty_write id={id}: writer thread closed");
        "pty writer closed".to_string()
    })
}

#[tauri::command]
pub fn pty_resize(
    state: tauri::State<PtyState>,
    id: u32,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    let session = state
        .sessions
        .read()
        .unwrap_or_else(|e| e.into_inner())
        .get(&id)
        .cloned()
        .ok_or_else(|| {
            log::warn!("pty_resize: unknown id={id}");
            "no session".to_string()
        })?;
    let result = session
        .master
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .resize(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| {
            log::warn!("pty_resize id={id} failed: {e}");
            e.to_string()
        });
    result
}

/// Best-effort real cwd of the session's shell process, for cwd tracking
/// when shell integration never delivers OSC 7 (custom shells, stripped
/// rc files). Linux only — /proc/<pid>/cwd readlink; other platforms return
/// None and the frontend simply keeps whatever cwd it last knew.
#[tauri::command]
pub fn pty_cwd(state: tauri::State<PtyState>, id: u32) -> Result<Option<String>, String> {
    let session = state
        .sessions
        .read()
        .unwrap_or_else(|e| e.into_inner())
        .get(&id)
        .cloned()
        .ok_or_else(|| "no session".to_string())?;
    #[cfg(target_os = "linux")]
    {
        let Some(pid) = session.child_pid else {
            return Ok(None);
        };
        match std::fs::read_link(format!("/proc/{pid}/cwd")) {
            Ok(p) => Ok(Some(p.to_string_lossy().into_owned())),
            // Process exited or unreadable — not an error worth surfacing.
            Err(_) => Ok(None),
        }
    }
    #[cfg(not(target_os = "linux"))]
    {
        let _ = session;
        Ok(None)
    }
}

#[tauri::command]
pub fn pty_close(state: tauri::State<PtyState>, id: u32) -> Result<(), String> {
    let session = state
        .sessions
        .write()
        .unwrap_or_else(|e| e.into_inner())
        .remove(&id);
    if let Some(s) = session {
        if let Ok(mut k) = s.killer.lock() {
            if let Err(e) = k.kill() {
                // Non-fatal: the child may already have exited on its own (e.g. the
                // user ran `exit`). Log so this isn't invisible during debugging.
                log::debug!("pty_close: kill id={id} returned {e}");
            }
        }
        log::info!("pty closed id={id}");
        // Detached: on Windows `ClosePseudoConsole` can block until conhost
        // drains, which would freeze this Tauri worker thread and stall IPC.
        thread::Builder::new()
            .name(format!("nexis-pty-drop-{id}"))
            .spawn(move || {
                let t0 = std::time::Instant::now();
                session::drop_session(s);
                log::info!(
                    "pty session id={id} dropped in {}ms",
                    t0.elapsed().as_millis()
                );
            })
            .map_err(|e| {
                log::error!("pty_close: failed to spawn drop thread for id={id}: {e}");
                format!("spawn pty drop thread: {e}")
            })?;
    } else {
        log::debug!("pty_close: unknown id={id}");
    }
    Ok(())
}
