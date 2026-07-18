// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

pub mod autosave;
pub mod crash;
pub mod dap;
pub mod diagnostics;
pub mod fs;
pub mod git;
pub mod http_share;
pub mod lsp;
pub mod ml;
pub mod net;
pub mod proc;
pub mod pty;
pub mod python;
pub mod recording;
pub mod secrets;
pub mod shell;
pub mod snapshots;
pub mod workspace;

/// Run a blocking closure on the blocking thread pool and await it.
///
/// Tauri executes non-`async` commands **on the main thread** — while one
/// runs, the UI event loop and every queued IPC call (including `pty_write`)
/// stall behind it. Any command that walks directories, reads/writes files,
/// or spawns processes must be `async` and route its body through this (or an
/// equivalent `spawn_blocking`, as git/commands.rs does with its
/// registry-aware variant). Commands that only lock a map and return are fine
/// to stay sync.
pub async fn heavy<T, F>(f: F) -> Result<T, String>
where
    F: FnOnce() -> Result<T, String> + Send + 'static,
    T: Send + 'static,
{
    tauri::async_runtime::spawn_blocking(f)
        .await
        .map_err(|e| e.to_string())?
}
