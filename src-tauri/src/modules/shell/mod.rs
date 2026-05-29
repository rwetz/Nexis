pub mod background;
pub mod ringbuffer;
pub mod session;

use std::collections::HashMap;
use std::io::Read;
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{mpsc, Arc, RwLock};
use std::thread;
use std::time::Duration;

use serde::Serialize;
use shared_child::SharedChild;

use crate::modules::workspace::{authorize_spawn_cwd, WorkspaceEnv, WorkspaceRegistry};
#[cfg(windows)]
use crate::modules::workspace::validate_wsl_distro_name;

use background::{BackgroundLogResponse, BackgroundProc, BackgroundProcInfo};
use session::{SessionRunOutput, ShellSession};

const DEFAULT_TIMEOUT_SECS: u64 = 30;
const MAX_TIMEOUT_SECS: u64 = 300;
const MAX_OUTPUT_BYTES: usize = 256 * 1024;

#[derive(Serialize)]
pub struct CommandOutput {
    pub stdout: String,
    pub stderr: String,
    pub exit_code: Option<i32>,
    pub timed_out: bool,
    pub truncated: bool,
}

/// Runs a one-shot command via the user's login shell. Output is capped and
/// the process is force-killed on timeout. We deliberately do NOT pipe into
/// the user's interactive PTY — that would fight their input. AI tool calls
/// are presented in chat as their own structured result.
#[tauri::command]
pub async fn shell_run_command(
    command: String,
    cwd: Option<String>,
    timeout_secs: Option<u64>,
    workspace: Option<WorkspaceEnv>,
    registry: tauri::State<'_, WorkspaceRegistry>,
) -> Result<CommandOutput, String> {
    let trimmed = command.trim().to_string();
    if trimmed.is_empty() {
        return Err("empty command".into());
    }

    let workspace = WorkspaceEnv::from_option(workspace);
    authorize_spawn_cwd(&registry, cwd.as_deref(), &workspace)?;
    let cwd_path = cwd
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string);

    let dur = Duration::from_secs(
        timeout_secs
            .unwrap_or(DEFAULT_TIMEOUT_SECS)
            .clamp(1, MAX_TIMEOUT_SECS),
    );

    // The blocking spawn + wait runs on a worker thread so the Tauri async
    // runtime stays unblocked.
    let (tx, rx) = mpsc::channel::<Result<CommandOutput, String>>();
    thread::spawn(move || {
        let _ = tx.send(run_blocking(trimmed, cwd_path, workspace, dur));
    });

    rx.recv().map_err(|e| e.to_string())?
}

pub(crate) fn run_blocking_inner(
    command: String,
    cwd: Option<String>,
    workspace: WorkspaceEnv,
    dur: Duration,
) -> Result<CommandOutput, String> {
    run_blocking(command, cwd, workspace, dur)
}

fn run_blocking(
    command: String,
    cwd: Option<String>,
    workspace: WorkspaceEnv,
    dur: Duration,
) -> Result<CommandOutput, String> {
    let mut cmd = build_oneshot_command(&command, &workspace, cwd.as_deref())?;
    if let (WorkspaceEnv::Local, Some(dir)) = (&workspace, cwd) {
        cmd.current_dir(dir);
    }
    cmd.stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    crate::modules::proc::hide_console(&mut cmd);

    let child = Arc::new(SharedChild::spawn(&mut cmd).map_err(|e| {
        log::warn!("shell_run_command spawn failed: {e}");
        e.to_string()
    })?);
    let mut stdout_pipe = child.take_stdout().ok_or_else(|| {
        let _ = child.kill();
        "no stdout pipe".to_string()
    })?;
    let mut stderr_pipe = child.take_stderr().ok_or_else(|| {
        let _ = child.kill();
        "no stderr pipe".to_string()
    })?;

    let stdout_handle = thread::spawn(move || drain(&mut stdout_pipe));
    let stderr_handle = thread::spawn(move || drain(&mut stderr_pipe));

    let (tx, rx) = mpsc::channel();
    let waiter = Arc::clone(&child);
    thread::spawn(move || {
        let _ = tx.send(waiter.wait());
    });

    let (exit_code, timed_out) = match rx.recv_timeout(dur) {
        Ok(Ok(status)) => (status.code(), false),
        Ok(Err(e)) => return Err(e.to_string()),
        Err(mpsc::RecvTimeoutError::Timeout) => {
            let _ = child.kill();
            let _ = child.wait();
            (None, true)
        }
        Err(mpsc::RecvTimeoutError::Disconnected) => {
            return Err("shell wait thread disconnected".into());
        }
    };

    let (stdout_bytes, stdout_truncated) = stdout_handle.join().unwrap_or((Vec::new(), false));
    let (stderr_bytes, stderr_truncated) = stderr_handle.join().unwrap_or((Vec::new(), false));

    Ok(CommandOutput {
        stdout: String::from_utf8_lossy(&stdout_bytes).into_owned(),
        stderr: String::from_utf8_lossy(&stderr_bytes).into_owned(),
        exit_code,
        timed_out,
        truncated: stdout_truncated || stderr_truncated,
    })
}

// ──────────────────────────────────────────────────────────────────────────
// Persistent agent shell state + background process state.
// ──────────────────────────────────────────────────────────────────────────

pub struct ShellState {
    sessions: RwLock<HashMap<u32, Arc<ShellSession>>>,
    bg: RwLock<HashMap<u32, Arc<BackgroundProc>>>,
    next_session_id: AtomicU32,
    next_bg_id: AtomicU32,
}

impl Default for ShellState {
    fn default() -> Self {
        Self {
            sessions: RwLock::new(HashMap::new()),
            bg: RwLock::new(HashMap::new()),
            next_session_id: AtomicU32::new(1),
            next_bg_id: AtomicU32::new(1),
        }
    }
}

#[tauri::command]
pub fn shell_session_open(
    state: tauri::State<ShellState>,
    registry: tauri::State<WorkspaceRegistry>,
    cwd: Option<String>,
    workspace: Option<WorkspaceEnv>,
) -> Result<u32, String> {
    let workspace = WorkspaceEnv::from_option(workspace);
    authorize_spawn_cwd(&registry, cwd.as_deref(), &workspace)?;
    let initial = match cwd.as_deref().filter(|s| !s.is_empty()) {
        Some(c) => c.to_string(),
        None => {
            if let WorkspaceEnv::Wsl { distro } = &workspace {
                crate::modules::workspace::wsl_home(distro.clone())?
            } else {
                crate::modules::fs::to_canon(dirs::home_dir().unwrap_or_else(|| PathBuf::from("/")))
            }
        }
    };
    let session = Arc::new(ShellSession::new(initial, workspace));
    let id = state.next_session_id.fetch_add(1, Ordering::Relaxed);
    state.sessions.write().unwrap().insert(id, session);
    Ok(id)
}

#[tauri::command]
pub async fn shell_session_run(
    state: tauri::State<'_, ShellState>,
    registry: tauri::State<'_, WorkspaceRegistry>,
    id: u32,
    command: String,
    cwd: Option<String>,
    timeout_secs: Option<u64>,
    workspace: Option<WorkspaceEnv>,
) -> Result<SessionRunOutput, String> {
    let session = state
        .sessions
        .read()
        .unwrap()
        .get(&id)
        .cloned()
        .ok_or_else(|| "no shell session".to_string())?;
    let effective_workspace = workspace.clone().unwrap_or_else(|| session.workspace.clone());
    authorize_spawn_cwd(&registry, cwd.as_deref(), &effective_workspace)?;
    let dur = Duration::from_secs(
        timeout_secs
            .unwrap_or(DEFAULT_TIMEOUT_SECS)
            .clamp(1, MAX_TIMEOUT_SECS),
    );
    let (tx, rx) = mpsc::channel();
    thread::spawn(move || {
        let _ = tx.send(session.run(command, cwd, workspace, dur));
    });
    rx.recv().map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn shell_session_close(state: tauri::State<ShellState>, id: u32) -> Result<(), String> {
    state.sessions.write().unwrap().remove(&id);
    Ok(())
}

#[tauri::command]
pub fn shell_bg_spawn(
    state: tauri::State<ShellState>,
    registry: tauri::State<WorkspaceRegistry>,
    command: String,
    cwd: Option<String>,
    workspace: Option<WorkspaceEnv>,
) -> Result<u32, String> {
    let workspace = WorkspaceEnv::from_option(workspace);
    authorize_spawn_cwd(&registry, cwd.as_deref(), &workspace)?;
    let proc = background::spawn(command, cwd, workspace)?;
    let id = state.next_bg_id.fetch_add(1, Ordering::Relaxed);
    state.bg.write().unwrap().insert(id, proc);
    Ok(id)
}

#[tauri::command]
pub fn shell_bg_logs(
    state: tauri::State<ShellState>,
    handle: u32,
    since_offset: Option<u64>,
) -> Result<BackgroundLogResponse, String> {
    let proc = state
        .bg
        .read()
        .unwrap()
        .get(&handle)
        .cloned()
        .ok_or_else(|| "no background handle".to_string())?;
    Ok(proc.read_logs(since_offset.unwrap_or(0)))
}

#[tauri::command]
pub fn shell_bg_kill(state: tauri::State<ShellState>, handle: u32) -> Result<(), String> {
    if let Some(proc) = state.bg.read().unwrap().get(&handle).cloned() {
        proc.kill();
    }
    Ok(())
}

#[tauri::command]
pub fn shell_bg_list(state: tauri::State<ShellState>) -> Result<Vec<BackgroundProcInfo>, String> {
    let map = state.bg.read().unwrap();
    let mut out = Vec::with_capacity(map.len());
    for (id, p) in map.iter() {
        out.push(p.info(*id));
    }
    out.sort_by_key(|i| i.handle);
    Ok(out)
}

pub(crate) fn build_oneshot_command(
    command: &str,
    #[cfg_attr(not(windows), allow(unused_variables))] workspace: &WorkspaceEnv,
    #[cfg_attr(not(windows), allow(unused_variables))] cwd: Option<&str>,
) -> Result<Command, String> {
    #[cfg(windows)]
    if let WorkspaceEnv::Wsl { distro } = workspace {
        validate_wsl_distro_name(distro)?;
        let mut cmd = Command::new("wsl.exe");
        cmd.arg("-d").arg(distro);
        if let Some(cwd) = cwd.filter(|s| !s.is_empty()) {
            cmd.arg("--cd").arg(cwd);
        }
        cmd.arg("--exec").arg("sh").arg("-lc").arg(command);
        return Ok(cmd);
    }
    #[cfg(unix)]
    {
        let mut cmd = Command::new("/bin/sh");
        cmd.arg("-c").arg(command);
        Ok(cmd)
    }
    #[cfg(windows)]
    {
        let shell = crate::modules::pty::shell_init::windows_shell_path();
        let mut cmd = Command::new(&shell);
        let is_cmd = shell
            .file_name()
            .and_then(|s| s.to_str())
            .map(|s| s.eq_ignore_ascii_case("cmd.exe"))
            .unwrap_or(false);
        if is_cmd {
            cmd.arg("/C").arg(command);
        } else {
            cmd.arg("-NoProfile").arg("-Command").arg(command);
        }
        Ok(cmd)
    }
}

// ──────────────────────────────────────────────────────────────────────────
// Shell history reader
// ──────────────────────────────────────────────────────────────────────────

/// Reads the user's shell history file and returns deduplicated entries,
/// newest first. Handles zsh, bash, fish, and PowerShell history formats.
// ── Shell history helpers ─────────────────────────────────────────────────────

/// Collect all history file paths to try, in priority order.
fn history_file_candidates() -> Vec<PathBuf> {
    let mut candidates: Vec<PathBuf> = Vec::new();
    let Some(home) = dirs::home_dir() else {
        return candidates;
    };

    // zsh (extended history format: `: timestamp:elapsed;cmd`)
    candidates.push(home.join(".zsh_history"));
    // bash (one command per line)
    candidates.push(home.join(".bash_history"));
    // fish (`- cmd: ...` lines)
    candidates.push(home.join(".local/share/fish/fish_history"));
    // PowerShell on Windows (one command per line)
    #[cfg(windows)]
    if let Some(appdata) = std::env::var_os("APPDATA") {
        candidates.push(
            PathBuf::from(appdata)
                .join("Microsoft/Windows/PowerShell/PSReadLine/ConsoleHost_history.txt"),
        );
    }

    candidates
}

/// Parse one history file and append its commands to `out`.
fn parse_history_file(path: &PathBuf, out: &mut Vec<String>) {
    if !path.is_file() {
        return;
    }
    let content = match std::fs::read(path) {
        Ok(b) => String::from_utf8_lossy(&b).into_owned(),
        Err(_) => return,
    };

    let name = path.file_name().and_then(|s| s.to_str()).unwrap_or("");
    let ext = path.extension().and_then(|s| s.to_str()).unwrap_or("");

    if name == "fish_history" {
        // Fish format: `- cmd: <command>` entries, optionally followed by
        // continuation lines (indented) for multi-line commands, and
        // `  when: <timestamp>` metadata lines.
        //
        // Example:
        //   - cmd: for i in (seq 3)
        //       echo $i
        //     end
        //     when: 1716900000
        //
        // We collect the first line after `- cmd: ` and append any
        // non-metadata continuation lines to it.
        let mut last_idx: Option<usize> = None;
        for line in content.lines() {
            // Top-level entry: `- cmd: …`
            if let Some(cmd) = line.trim_start().strip_prefix("- cmd: ") {
                out.push(cmd.to_string());
                last_idx = Some(out.len() - 1);
            } else if let Some(idx) = last_idx {
                let t = line.trim_start();
                // Skip metadata lines (`when:`, `paths:`) and blank lines.
                if !t.is_empty() && !t.starts_with("when:") && !t.starts_with("paths:") {
                    out[idx].push('\n');
                    out[idx].push_str(t);
                }
            }
        }
    } else if name.ends_with("zsh_history") || ext.is_empty() {
        // zsh extended format `": timestamp:elapsed;cmd"` OR plain `"cmd"`.
        for line in content.lines() {
            if let Some(rest) = line.strip_prefix(": ") {
                if let Some((_, cmd)) = rest.split_once(';') {
                    out.push(cmd.to_string());
                }
            } else if !line.is_empty() {
                out.push(line.to_string());
            }
        }
    } else {
        // bash / PowerShell: one command per line.
        for line in content.lines() {
            if !line.is_empty() {
                out.push(line.to_string());
            }
        }
    }
}

/// Load all shell history, deduplicated (most-recent occurrence wins),
/// newest first.  Hard cap at `cap` entries to bound memory usage.
fn load_history(cap: usize) -> Vec<String> {
    let mut all: Vec<String> = Vec::new();
    for path in history_file_candidates() {
        parse_history_file(&path, &mut all);
    }

    // Dedup: iterate newest-to-oldest (rev) so the first occurrence we keep
    // is always the most-recent one.  The resulting Vec is already newest-first
    // after collect() — no second reverse needed.
    let mut seen = std::collections::HashSet::<String>::new();
    all.into_iter()
        .rev()
        .filter(|cmd| {
            let t = cmd.trim().to_string();
            !t.is_empty() && seen.insert(t)
        })
        .take(cap)
        .collect()
}

// ── Public commands ───────────────────────────────────────────────────────────

const HISTORY_HARD_CAP: usize = 10_000;
const SEARCH_DEFAULT_LIMIT: usize = 100;
const SEARCH_MAX_LIMIT: usize = 500;

/// Return the full deduplicated history (up to 10 000 entries, newest first).
/// Used by the inline terminal suggestion engine which needs all entries loaded
/// in JS for synchronous keystroke-level filtering.
///
/// Returns an empty list on any error (missing file, permission denied, etc.).
#[tauri::command]
pub fn read_shell_history() -> Vec<String> {
    load_history(HISTORY_HARD_CAP)
}

/// Search history in Rust and return only matching entries.
///
/// Unlike `read_shell_history` (which dumps everything to JS), this command
/// does the filtering server-side so the IPC payload stays small regardless
/// of history size.
///
/// - `query`: case-insensitive substring to match.  Empty string matches
///   everything (returns the most-recent `limit` commands).
/// - `limit`: maximum number of results to return (default 100, cap 500).
///
/// Returns entries newest-first.
#[tauri::command]
pub fn search_shell_history(query: String, limit: Option<usize>) -> Vec<String> {
    let cap = limit
        .unwrap_or(SEARCH_DEFAULT_LIMIT)
        .clamp(1, SEARCH_MAX_LIMIT);

    let history = load_history(HISTORY_HARD_CAP);

    if query.is_empty() {
        return history.into_iter().take(cap).collect();
    }

    let q = query.to_lowercase();
    history
        .into_iter()
        .filter(|cmd| cmd.to_lowercase().contains(&q))
        .take(cap)
        .collect()
}

fn drain<R: Read>(reader: &mut R) -> (Vec<u8>, bool) {
    let mut out = Vec::new();
    let mut buf = [0u8; 8192];
    let mut truncated = false;
    loop {
        match reader.read(&mut buf) {
            Ok(0) => break,
            Ok(n) => {
                if out.len() >= MAX_OUTPUT_BYTES {
                    truncated = true;
                    continue;
                }
                let take = (MAX_OUTPUT_BYTES - out.len()).min(n);
                out.extend_from_slice(&buf[..take]);
                if take < n {
                    truncated = true;
                }
            }
            Err(_) => break,
        }
    }
    (out, truncated)
}
