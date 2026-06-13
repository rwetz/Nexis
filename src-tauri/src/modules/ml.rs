// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

//! ML engine bridge — spawns the external `nexis-ml` tool (the engine half
//! of the ML Suite, see ML_SUITE.md) and streams its NDJSON protocol events
//! to the frontend as Tauri events:
//!
//!   ml:proto  { sid, lines: Vec<String> }  — batched stdout protocol lines
//!   ml:stderr { sid, line }                — human-readable progress
//!   ml:exit   { sid, code: Option<i32> }   — process ended
//!
//! Modeled on the LSP session (long-lived child, stdio, hide_console) with
//! the PTY reader→flusher split so a metric burst becomes one event, not
//! thousands. Lock recovery follows pitfall #8 (`unwrap_or_else(into_inner)`).

use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::process::{ChildStdin, Command, Stdio};
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{mpsc, Arc, Mutex};
use std::thread;
use std::time::Duration;

use serde::Serialize;
use shared_child::SharedChild;
use tauri::{AppHandle, Emitter, Manager, State};

use crate::modules::proc::hide_console;
use crate::modules::workspace::{authorize_spawn_cwd, WorkspaceEnv, WorkspaceRegistry};

/// Flush a batch to the frontend at most this often (~30 Hz).
const FLUSH_INTERVAL: Duration = Duration::from_millis(33);
/// ...or as soon as it holds this many lines.
const FLUSH_MAX_LINES: usize = 128;
/// Ignore protocol lines longer than this (a runaway event can't OOM us).
const MAX_LINE_BYTES: usize = 1024 * 1024;

/// Subcommands the frontend is allowed to spawn. `train` and `replay`
/// stream protocol events; `new` scaffolds a project (one-shot, watched
/// via ml:exit); `serve` is the inference playground's request/response
/// loop (driven via `ml_stdin`). Everything else the frontend reads from
/// disk or runs via a dedicated command (`env`, `--version`).
const ALLOWED_SUBCOMMANDS: &[&str] = &["train", "replay", "new", "serve"];

pub struct MlSession {
    child: Arc<SharedChild>,
    stdin: Mutex<Option<ChildStdin>>,
}

impl MlSession {
    fn kill(&self) {
        let _ = self.child.kill();
    }
}

impl Drop for MlSession {
    fn drop(&mut self) {
        self.kill();
    }
}

#[derive(Default)]
pub struct MlState {
    sessions: Mutex<HashMap<u32, Arc<MlSession>>>,
    next_sid: AtomicU32,
}

fn lock_sessions(state: &MlState) -> std::sync::MutexGuard<'_, HashMap<u32, Arc<MlSession>>> {
    state.sessions.lock().unwrap_or_else(|e| e.into_inner())
}

#[derive(Serialize, Clone)]
pub struct MlDetectResult {
    pub exe: String,
    pub version: String,
}

#[derive(Serialize, Clone)]
struct ProtoPayload {
    sid: u32,
    lines: Vec<String>,
}

#[derive(Serialize, Clone)]
struct StderrPayload {
    sid: u32,
    line: String,
}

#[derive(Serialize, Clone)]
struct ExitPayload {
    sid: u32,
    code: Option<i32>,
}

/// True if `exe` plausibly names the nexis-ml binary (and nothing else).
/// This command must not become a generic process launcher: only a file
/// whose stem is exactly `nexis-ml` may be spawned.
fn is_nexis_ml_exe(exe: &str) -> bool {
    let stem = std::path::Path::new(exe)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("");
    stem.eq_ignore_ascii_case("nexis-ml")
}

/// Try `<exe> --version` for each candidate path; first success wins.
#[tauri::command]
pub fn ml_detect(candidates: Vec<String>) -> Result<MlDetectResult, String> {
    let mut last_err = String::from("no candidates given");
    for exe in &candidates {
        if !is_nexis_ml_exe(exe) {
            last_err = format!("not a nexis-ml binary: {exe}");
            continue;
        }
        let mut cmd = Command::new(exe);
        cmd.arg("--version")
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::null());
        hide_console(&mut cmd);
        match cmd.output() {
            Ok(out) if out.status.success() => {
                let stdout = String::from_utf8_lossy(&out.stdout);
                let version = stdout.trim().rsplit(' ').next().unwrap_or("").to_string();
                if version.is_empty() {
                    last_err = format!("{exe}: empty --version output");
                    continue;
                }
                return Ok(MlDetectResult {
                    exe: exe.clone(),
                    version,
                });
            }
            Ok(out) => {
                last_err = format!("{exe}: exit {:?}", out.status.code());
            }
            Err(e) => {
                last_err = format!("{exe}: {e}");
            }
        }
    }
    Err(last_err)
}

/// Run `nexis-ml env` and return its JSON capability report (torch
/// version, CUDA availability, GPU name). Blocking — importing torch
/// takes a few seconds — so the frontend calls it fire-and-forget.
#[tauri::command]
pub fn ml_env(exe: String) -> Result<String, String> {
    if !is_nexis_ml_exe(&exe) {
        return Err(format!("not a nexis-ml binary: {exe}"));
    }
    let mut cmd = Command::new(&exe);
    cmd.arg("env")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    hide_console(&mut cmd);
    let out = cmd.output().map_err(|e| format!("{exe}: {e}"))?;
    if !out.status.success() {
        return Err(format!("{exe} env: exit {:?}", out.status.code()));
    }
    Ok(String::from_utf8_lossy(&out.stdout).trim().to_string())
}

/// Best-effort NVIDIA GPU detection via nvidia-smi (present whenever
/// the NVIDIA driver is installed). Returns the GPU name or None —
/// used to offer the CUDA torch build even before the engine exists.
#[tauri::command]
pub fn ml_gpu_probe() -> Option<String> {
    let mut cmd = Command::new("nvidia-smi");
    cmd.args(["--query-gpu=name", "--format=csv,noheader"])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    hide_console(&mut cmd);
    let out = cmd.output().ok()?;
    if !out.status.success() {
        return None;
    }
    let name = String::from_utf8_lossy(&out.stdout)
        .lines()
        .next()
        .unwrap_or("")
        .trim()
        .to_string();
    if name.is_empty() {
        None
    } else {
        Some(name)
    }
}

/// Spawn `nexis-ml --nexis-protocol <subcommand> ...` rooted at
/// `project_dir` and stream its events. Returns a session id.
#[tauri::command]
pub fn ml_spawn(
    app: AppHandle,
    state: State<'_, MlState>,
    registry: State<'_, WorkspaceRegistry>,
    exe: String,
    args: Vec<String>,
    project_dir: String,
) -> Result<u32, String> {
    if !is_nexis_ml_exe(&exe) {
        return Err(format!("not a nexis-ml binary: {exe}"));
    }
    let sub = args.first().map(String::as_str).unwrap_or("");
    if !ALLOWED_SUBCOMMANDS.contains(&sub) {
        return Err(format!("subcommand not allowed: {sub}"));
    }
    // Same guard as pty_open (pitfall #1C): the project dir must be under
    // an authorized workspace root. The frontend calls workspace_authorize
    // first, exactly like pty-bridge does.
    let resolved = authorize_spawn_cwd(&registry, Some(&project_dir), &WorkspaceEnv::Local)?
        .ok_or("ml_spawn: empty project dir")?;

    let mut cmd = Command::new(&exe);
    cmd.arg("--nexis-protocol")
        .args(&args)
        .current_dir(&resolved)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    // Pitfall #4/#1D: a visible console flash can corrupt an active ConPTY.
    hide_console(&mut cmd);

    let shared = Arc::new(SharedChild::spawn(&mut cmd).map_err(|e| e.to_string())?);
    let stdin = shared.take_stdin();
    let stdout = shared.take_stdout().ok_or_else(|| {
        let _ = shared.kill();
        "ml_spawn: no stdout pipe".to_string()
    })?;
    let stderr = shared.take_stderr().ok_or_else(|| {
        let _ = shared.kill();
        "ml_spawn: no stderr pipe".to_string()
    })?;

    let sid = state.next_sid.fetch_add(1, Ordering::Relaxed) + 1;
    let session = Arc::new(MlSession {
        child: shared,
        stdin: Mutex::new(stdin),
    });
    lock_sessions(&state).insert(sid, session.clone());

    // Reader: stdout lines → channel. Flusher: channel → batched ml:proto.
    let (tx, rx) = mpsc::channel::<String>();
    {
        let mut reader = BufReader::new(stdout);
        thread::Builder::new()
            .name(format!("nexis-ml-reader-{sid}"))
            .spawn(move || {
                let mut line = String::new();
                loop {
                    line.clear();
                    match reader.read_line(&mut line) {
                        Ok(0) | Err(_) => break,
                        Ok(_) => {
                            let trimmed = line.trim_end();
                            if trimmed.is_empty() || trimmed.len() > MAX_LINE_BYTES {
                                continue;
                            }
                            if tx.send(trimmed.to_string()).is_err() {
                                break;
                            }
                        }
                    }
                }
            })
            .map_err(|e| format!("ml_spawn: reader thread: {e}"))?;
    }
    {
        let app = app.clone();
        thread::Builder::new()
            .name(format!("nexis-ml-flusher-{sid}"))
            .spawn(move || {
                let mut batch: Vec<String> = Vec::new();
                loop {
                    match rx.recv_timeout(FLUSH_INTERVAL) {
                        Ok(line) => {
                            batch.push(line);
                            if batch.len() >= FLUSH_MAX_LINES {
                                let _ = app.emit(
                                    "ml:proto",
                                    ProtoPayload {
                                        sid,
                                        lines: std::mem::take(&mut batch),
                                    },
                                );
                            }
                        }
                        Err(mpsc::RecvTimeoutError::Timeout) => {
                            if !batch.is_empty() {
                                let _ = app.emit(
                                    "ml:proto",
                                    ProtoPayload {
                                        sid,
                                        lines: std::mem::take(&mut batch),
                                    },
                                );
                            }
                        }
                        Err(mpsc::RecvTimeoutError::Disconnected) => {
                            if !batch.is_empty() {
                                let _ = app.emit("ml:proto", ProtoPayload { sid, lines: batch });
                            }
                            break;
                        }
                    }
                }
            })
            .map_err(|e| format!("ml_spawn: flusher thread: {e}"))?;
    }
    spawn_line_streamer(app.clone(), sid, stderr, "stderr")?;
    {
        // Waiter: emit ml:exit and drop the session from the map. The emit
        // happens after reader EOF in practice, but even if it races, the
        // frontend treats ml:exit as authoritative only when no
        // run.finished arrived.
        let child = session.child.clone();
        let app_handle = app.clone();
        thread::Builder::new()
            .name(format!("nexis-ml-waiter-{sid}"))
            .spawn(move || {
                let code = match child.wait() {
                    Ok(status) => status.code(),
                    Err(_) => None,
                };
                if let Some(state) = app_handle.try_state::<MlState>() {
                    lock_sessions(&state).remove(&sid);
                }
                let _ = app_handle.emit("ml:exit", ExitPayload { sid, code });
            })
            .map_err(|e| format!("ml_spawn: waiter thread: {e}"))?;
    }

    Ok(sid)
}

/// Ask the engine to stop gracefully (it checkpoints, emits
/// run.finished "cancelled", and exits).
#[tauri::command]
pub fn ml_cancel(state: State<'_, MlState>, sid: u32) -> Result<(), String> {
    let session = lock_sessions(&state)
        .get(&sid)
        .cloned()
        .ok_or("ml_cancel: no such session")?;
    let mut stdin = session.stdin.lock().unwrap_or_else(|e| e.into_inner());
    let Some(pipe) = stdin.as_mut() else {
        return Err("ml_cancel: stdin closed".into());
    };
    pipe.write_all(b"{\"cmd\":\"cancel\"}\n")
        .and_then(|_| pipe.flush())
        .map_err(|e| format!("ml_cancel: {e}"))
}

/// Write one request line to a session's stdin. The inference playground
/// (`nexis-ml serve`) reads one JSON request per line, so the frontend
/// sends each request through here. A trailing newline is appended (and
/// any the caller included is stripped first) so the engine always gets
/// exactly one complete line.
#[tauri::command]
pub fn ml_stdin(state: State<'_, MlState>, sid: u32, line: String) -> Result<(), String> {
    let session = lock_sessions(&state)
        .get(&sid)
        .cloned()
        .ok_or("ml_stdin: no such session")?;
    let mut stdin = session.stdin.lock().unwrap_or_else(|e| e.into_inner());
    let Some(pipe) = stdin.as_mut() else {
        return Err("ml_stdin: stdin closed".into());
    };
    let mut bytes = line.trim_end_matches(['\r', '\n']).as_bytes().to_vec();
    bytes.push(b'\n');
    pipe.write_all(&bytes)
        .and_then(|_| pipe.flush())
        .map_err(|e| format!("ml_stdin: {e}"))
}

/// Hard-kill the engine process (used if cancel doesn't take).
#[tauri::command]
pub fn ml_kill(state: State<'_, MlState>, sid: u32) -> Result<(), String> {
    let session = lock_sessions(&state).remove(&sid);
    if let Some(s) = session {
        s.kill();
    }
    Ok(())
}

/// True only for a plain CPython launcher (python / python3 / python3.x).
/// Same rationale as `is_nexis_ml_exe`: ml_install must not become a
/// generic process launcher.
fn is_python_exe(exe: &str) -> bool {
    let stem = std::path::Path::new(exe)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    stem == "python" || stem == "python3" || stem.starts_with("python3.")
}

/// Pip invocations the frontend may request, by name. Fixed arg sets —
/// this must not become a generic pip runner.
fn install_flavor_args(flavor: &str) -> Option<&'static [&'static str]> {
    match flavor {
        // The engine + CPU torch (the default everywhere)
        "default" => Some(&["-m", "pip", "install", "--upgrade", "nexis-ml[torch]"]),
        // CUDA torch from the PyTorch index (NVIDIA GPUs). The frontend
        // runs this first, then "default" — nexis-ml's torch requirement
        // is then already satisfied by the CUDA build.
        //
        // --force-reinstall is required: pip ignores the +cpu/+cuXXX
        // local-version suffix when deciding "already satisfied", so a
        // plain install would leave the CPU build in place.
        "cuda-torch" => Some(&[
            "-m",
            "pip",
            "install",
            "torch",
            "--index-url",
            "https://download.pytorch.org/whl/cu130",
            "--force-reinstall",
        ]),
        _ => None,
    }
}

/// Install the engine (or a torch variant) into the given Python
/// environment. Output streams as ml:stderr lines and completion as
/// ml:exit, reusing the channel the panel already renders. Spawned
/// directly (no shell) so paths with spaces need no quoting games.
#[tauri::command]
pub fn ml_install(
    app: AppHandle,
    state: State<'_, MlState>,
    python: String,
    flavor: String,
) -> Result<u32, String> {
    if !is_python_exe(&python) {
        return Err(format!("not a python binary: {python}"));
    }
    let args =
        install_flavor_args(&flavor).ok_or_else(|| format!("unknown install flavor: {flavor}"))?;
    let mut cmd = Command::new(&python);
    cmd.args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    // Pitfall #4/#1D: no console flash while a terminal may be live.
    hide_console(&mut cmd);

    let shared = Arc::new(SharedChild::spawn(&mut cmd).map_err(|e| e.to_string())?);
    let stdout = shared.take_stdout().ok_or_else(|| {
        let _ = shared.kill();
        "ml_install: no stdout pipe".to_string()
    })?;
    let stderr = shared.take_stderr().ok_or_else(|| {
        let _ = shared.kill();
        "ml_install: no stderr pipe".to_string()
    })?;

    let sid = state.next_sid.fetch_add(1, Ordering::Relaxed) + 1;
    let session = Arc::new(MlSession {
        child: shared,
        stdin: Mutex::new(None),
    });
    lock_sessions(&state).insert(sid, session.clone());

    spawn_line_streamer(app.clone(), sid, stdout, "pip-out")?;
    spawn_line_streamer(app.clone(), sid, stderr, "pip-err")?;
    {
        let child = session.child.clone();
        let app_handle = app.clone();
        thread::Builder::new()
            .name(format!("nexis-ml-pip-waiter-{sid}"))
            .spawn(move || {
                let code = match child.wait() {
                    Ok(status) => status.code(),
                    Err(_) => None,
                };
                if let Some(state) = app_handle.try_state::<MlState>() {
                    lock_sessions(&state).remove(&sid);
                }
                let _ = app_handle.emit("ml:exit", ExitPayload { sid, code });
            })
            .map_err(|e| format!("ml_install: waiter thread: {e}"))?;
    }

    Ok(sid)
}

/// Stream a child pipe line-by-line as ml:stderr events. Used for the
/// engine's human-readable stderr and for pip install output — both are
/// low-volume next to the metric stream, so per-line emits are fine.
fn spawn_line_streamer<R: std::io::Read + Send + 'static>(
    app: AppHandle,
    sid: u32,
    pipe: R,
    label: &str,
) -> Result<(), String> {
    let mut reader = BufReader::new(pipe);
    thread::Builder::new()
        .name(format!("nexis-ml-{label}-{sid}"))
        .spawn(move || {
            let mut line = String::new();
            loop {
                line.clear();
                match reader.read_line(&mut line) {
                    Ok(0) | Err(_) => break,
                    Ok(_) => {
                        let trimmed = line.trim_end();
                        if trimmed.is_empty() {
                            continue;
                        }
                        let _ = app.emit(
                            "ml:stderr",
                            StderrPayload {
                                sid,
                                line: trimmed.to_string(),
                            },
                        );
                    }
                }
            }
        })
        .map_err(|e| format!("ml line streamer ({label}): {e}"))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn exe_name_guard_accepts_nexis_ml_forms() {
        assert!(is_nexis_ml_exe("nexis-ml"));
        assert!(is_nexis_ml_exe("nexis-ml.exe"));
        assert!(is_nexis_ml_exe("NEXIS-ML.EXE"));
        assert!(is_nexis_ml_exe(r"C:\venv\Scripts\nexis-ml.exe"));
        assert!(is_nexis_ml_exe("/home/u/.venv/bin/nexis-ml"));
    }

    #[test]
    fn exe_name_guard_rejects_other_binaries() {
        assert!(!is_nexis_ml_exe("powershell.exe"));
        assert!(!is_nexis_ml_exe(r"C:\evil\nexis-ml-extra.exe"));
        assert!(!is_nexis_ml_exe("nexis_ml"));
        assert!(!is_nexis_ml_exe(""));
        // Path tricks must not slip through the stem check
        assert!(!is_nexis_ml_exe(r"cmd.exe /c nexis-ml"));
    }

    #[test]
    fn subcommand_allowlist_is_minimal() {
        assert!(ALLOWED_SUBCOMMANDS.contains(&"train"));
        assert!(ALLOWED_SUBCOMMANDS.contains(&"replay"));
        assert!(ALLOWED_SUBCOMMANDS.contains(&"new"));
        assert!(ALLOWED_SUBCOMMANDS.contains(&"serve"));
        // `runs`, `infer`, and arbitrary subcommands stay CLI-only
        assert!(!ALLOWED_SUBCOMMANDS.contains(&"runs"));
        assert!(!ALLOWED_SUBCOMMANDS.contains(&"infer"));
        assert_eq!(ALLOWED_SUBCOMMANDS.len(), 4);
    }

    #[test]
    fn install_flavors_are_a_fixed_allowlist() {
        assert!(install_flavor_args("default").is_some());
        assert!(install_flavor_args("cuda-torch").is_some());
        assert!(install_flavor_args("").is_none());
        assert!(install_flavor_args("anything-else").is_none());
        // No flavor may smuggle arbitrary packages: every arg set is
        // a compile-time constant.
        for flavor in ["default", "cuda-torch"] {
            let args = install_flavor_args(flavor).unwrap();
            assert_eq!(args[0], "-m");
            assert_eq!(args[1], "pip");
            assert_eq!(args[2], "install");
        }
    }

    #[test]
    fn python_guard_accepts_cpython_launchers_only() {
        assert!(is_python_exe(r"C:\proj\.venv\Scripts\python.exe"));
        assert!(is_python_exe("/usr/bin/python3"));
        assert!(is_python_exe("/usr/bin/python3.12"));
        assert!(!is_python_exe("pythonw.exe"));
        assert!(!is_python_exe(r"C:\evil\python-fake-thing.exe"));
        assert!(!is_python_exe("powershell.exe"));
        assert!(!is_python_exe(""));
    }
}
