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
//! Modeled on the LSP session (long-lived child, stdio, hidden console) with
//! the PTY reader→flusher split so a metric burst becomes one event, not
//! thousands. Lock recovery follows pitfall #8 (`unwrap_or_else(into_inner)`).

// Panic-lint gate: no `.unwrap()`/`.expect()` in production code here.
// Tests may still panic (allow-*-in-tests in clippy.toml). CI's
// `clippy -- -D warnings` turns a new one into a build failure.
#![warn(clippy::unwrap_used, clippy::expect_used)]

use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::process::{ChildStdin, Stdio};
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{mpsc, Arc, Mutex};
use std::thread;
use std::time::Duration;

use serde::Serialize;
use shared_child::SharedChild;
use tauri::{AppHandle, Emitter, Manager, State};

use crate::modules::proc;
use crate::modules::workspace::{resolve_path, WorkspaceEnv, WorkspaceRegistry};

/// Flush a batch to the frontend at most this often (~30 Hz).
const FLUSH_INTERVAL: Duration = Duration::from_millis(33);
/// ...or as soon as it holds this many lines.
const FLUSH_MAX_LINES: usize = 128;
/// Ignore protocol lines longer than this (a runaway event can't OOM us).
const MAX_LINE_BYTES: usize = 1024 * 1024;

/// Subcommands the frontend is allowed to spawn. `train` and `replay`
/// stream protocol events; `new` scaffolds a project (one-shot, watched
/// via ml:exit); `serve` is the inference playground's request/response
/// loop (driven via `ml_stdin`); `export` writes a run's HTML report
/// (one-shot). Everything else the frontend reads from disk or runs via a
/// dedicated command (`env`, `--version`).
const ALLOWED_SUBCOMMANDS: &[&str] = &["train", "replay", "new", "serve", "export"];

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

/// Lowercased final-component stem of a path, splitting on BOTH `/` and `\`
/// regardless of host OS. `Path::file_stem` is host-dependent — on Unix it
/// doesn't treat `\` as a separator — so a Windows-style candidate path like
/// `C:\venv\Scripts\nexis-ml.exe` would otherwise pass the guard on Windows
/// but fail it (and the unit tests) on the Linux/macOS CI runners.
fn exe_stem_lower(exe: &str) -> String {
    let name = exe.rsplit(['/', '\\']).next().unwrap_or(exe);
    let stem = name.rsplit_once('.').map_or(name, |(base, _ext)| base);
    stem.to_ascii_lowercase()
}

/// True if `exe` plausibly names the nexis-ml binary (and nothing else).
/// This command must not become a generic process launcher: only a file
/// whose stem is exactly `nexis-ml` may be spawned.
fn is_nexis_ml_exe(exe: &str) -> bool {
    exe_stem_lower(exe) == "nexis-ml"
}

/// Build the command that runs the engine for a given workspace.
///
/// A WSL workspace's engine lives *inside the distro*: a Linux binary the
/// host cannot exec, at a Linux path the host cannot resolve. So every use of
/// the engine — version probe, capability probe, training, pip install — has
/// to go through `wsl.exe`, exactly like the terminal does for a WSL shell.
///
/// Without this the whole ML Lab silently answered for the wrong machine.
/// Detection probed the *Windows* engine while the workspace was a distro, so
/// the panel reported "ready" (with the host's version, torch build and CUDA
/// state) for a distro that had no engine installed at all, and then failed
/// at train time on a project dir the host cannot canonicalize.
///
/// `cwd` is interpreted in the target environment: a host path for Local, a
/// Linux path for Wsl. Callers pass the user's own path string, never a
/// resolved `\\wsl.localhost\…` one — that means nothing inside the distro.
fn env_command(
    workspace: &WorkspaceEnv,
    program: &str,
    cwd: Option<&str>,
) -> Result<std::process::Command, String> {
    match workspace {
        WorkspaceEnv::Local => {
            let mut cmd = proc::command(program);
            if let Some(dir) = cwd {
                cmd.current_dir(dir);
            }
            Ok(cmd)
        }
        #[cfg(windows)]
        WorkspaceEnv::Wsl { distro } => {
            crate::modules::workspace::validate_wsl_distro_name(distro)?;
            let mut cmd = proc::command("wsl.exe");
            cmd.arg("-d").arg(distro);
            if let Some(dir) = cwd {
                if !dir.starts_with('/') {
                    return Err(format!("WSL working directory is not absolute: {dir}"));
                }
                cmd.arg("--cd").arg(dir);
            }
            cmd.arg("--exec").arg(program);
            Ok(cmd)
        }
        // A non-Windows host has no WSL; the frontend never sends this, and
        // silently running the host binary instead would be the exact
        // wrong-machine bug this function exists to prevent.
        #[cfg(not(windows))]
        WorkspaceEnv::Wsl { distro } => Err(format!("WSL workspace ({distro}) needs Windows")),
    }
}

/// `<exe> --version` in the workspace's environment, parsed. Used by
/// detection, which is the only probe that must follow the workspace — the
/// post-download verification below always checks a host binary.
///
/// Why a probe outcome is three-valued rather than `Result`: the candidate
/// list is *speculative*. It names every venv layout in the workspace and its
/// six ancestors, so all but at most one entry is expected to be absent, and
/// treating "this path does not exist" as an error meant `ml_detect` reported
/// the last candidate's ENOENT as the diagnosis. Users saw the managed
/// engine's path and `os error 3` — which reads like Nexis looking in a
/// broken place — when the truth was simply that no engine is installed.
enum Probe {
    /// Nothing at this path. Expected for nearly every candidate; never
    /// interesting enough to show anyone.
    Missing,
    /// Something is there and it did not work. This is worth reporting: a
    /// half-extracted download, a wrong-arch binary, a broken venv shim.
    Failed(String),
}

/// True when a probe failure means "there is nothing here", as opposed to
/// "there is something here and it is broken".
fn stderr_says_missing(stderr: &str) -> bool {
    let s = stderr.to_ascii_lowercase();
    s.contains("no such file")
        || s.contains("command not found")
        || s.contains("not found")
        || s.contains("cannot find")
}

fn engine_version_in(workspace: &WorkspaceEnv, exe: &str) -> Result<String, Probe> {
    // An absolute host path can be ruled out with a stat instead of a process
    // spawn. That matters: the panel re-detects on every open, and the list is
    // ~25 speculative paths, so this is the difference between 25 stats and 25
    // process creations every time the ML Lab is shown.
    if !workspace.is_wsl() && looks_absolute(exe) && !std::path::Path::new(exe).exists() {
        return Err(Probe::Missing);
    }
    let mut cmd = env_command(workspace, exe, None).map_err(Probe::Failed)?;
    cmd.arg("--version")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    let out = match cmd.output() {
        Ok(out) => out,
        // A bare name that is not on PATH, or a path that vanished between
        // the stat above and here.
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Err(Probe::Missing),
        Err(e) => return Err(Probe::Failed(e.to_string())),
    };
    if !out.status.success() {
        // Under WSL the child is `wsl.exe`, which exists no matter what, so
        // the io-error signal above never fires — the distro's own "No such
        // file or directory" on stderr is the only way to tell an absent
        // engine from a broken one.
        let stderr = String::from_utf8_lossy(&out.stderr);
        if stderr_says_missing(&stderr) {
            return Err(Probe::Missing);
        }
        let detail = stderr.trim();
        return Err(Probe::Failed(if detail.is_empty() {
            format!("exit {:?}", out.status.code())
        } else {
            detail.to_string()
        }));
    }
    let stdout = String::from_utf8_lossy(&out.stdout);
    parse_version(&stdout).ok_or(Probe::Failed("empty --version output".into()))
}

/// Absolute in either convention — a POSIX `/…` or a Windows `C:\…`. Used
/// only to decide whether a cheap `exists()` check is meaningful; a bare
/// `nexis-ml` has to be resolved by PATH, which only a spawn can do.
fn looks_absolute(path: &str) -> bool {
    path.starts_with('/')
        || path.starts_with('\\')
        || path
            .as_bytes()
            .get(1)
            .is_some_and(|&c| c == b':' && path.len() > 2)
}

/// Run `<exe> --version` and return the parsed version (the last
/// whitespace-separated token, e.g. "0.5.0" from "nexis-ml 0.5.0"). Host-only:
/// the managed engine this verifies is always a host binary.
fn engine_version(exe: &std::path::Path) -> Result<String, String> {
    let mut cmd = proc::command(exe);
    cmd.arg("--version")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    let out = cmd.output().map_err(|e| e.to_string())?;
    if !out.status.success() {
        return Err(format!("exit {:?}", out.status.code()));
    }
    let stdout = String::from_utf8_lossy(&out.stdout);
    parse_version(&stdout).ok_or_else(|| "empty --version output".to_string())
}

/// Parse the version token from `<exe> --version` output (the last
/// whitespace-separated token of "nexis-ml 0.5.0").
fn parse_version(stdout: &str) -> Option<String> {
    let v = stdout.trim().rsplit(' ').next().unwrap_or("");
    (!v.is_empty()).then(|| v.to_string())
}

/// Try `<exe> --version` for each candidate path; first success wins.
/// Probes run in the workspace's environment (see `env_command`), so a WSL
/// workspace is answered by the distro's engine or by nothing.
#[tauri::command]
pub async fn ml_detect(
    candidates: Vec<String>,
    workspace: Option<WorkspaceEnv>,
) -> Result<MlDetectResult, String> {
    let workspace = WorkspaceEnv::from_option(workspace);
    // Each probe spawns the candidate binary — a Python-based engine imports
    // torch on startup (seconds per candidate). Never on the main thread.
    crate::modules::heavy(move || {
        // Absent candidates are the normal case and say nothing; only a
        // candidate that *exists and does not work* is a diagnosis. Reporting
        // the last candidate's error made every "no engine installed" state
        // surface the managed engine's path plus `os error 3`, which reads
        // like a broken install rather than an empty one.
        let mut checked = 0usize;
        let mut failures: Vec<String> = Vec::new();
        for exe in &candidates {
            if !is_nexis_ml_exe(exe) {
                failures.push(format!("{exe}: not a nexis-ml binary"));
                continue;
            }
            checked += 1;
            match engine_version_in(&workspace, exe) {
                Ok(version) => {
                    return Ok(MlDetectResult {
                        exe: exe.clone(),
                        version,
                    })
                }
                Err(Probe::Missing) => {}
                Err(Probe::Failed(e)) => failures.push(format!("{exe}: {e}")),
            }
        }
        Err(if failures.is_empty() {
            format!("No engine installed here (checked {checked} locations).")
        } else {
            format!(
                "No usable engine (checked {checked} locations). {}",
                failures.join("; ")
            )
        })
    })
    .await
}

/// Path to the managed standalone-engine binary (under the app's local data
/// dir), whether or not it exists yet. The frontend adds it to the detection
/// candidates so a downloaded engine is found like any other; a missing path
/// just fails the `--version` probe instantly.
fn managed_engine_exe(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let name = if cfg!(windows) {
        "nexis-ml.exe"
    } else {
        "nexis-ml"
    };
    let dir = app
        .path()
        .app_local_data_dir()
        .map_err(|e| e.to_string())?
        .join("engine");
    Ok(dir.join(name)) // pure path; the dir is created lazily by ml_download
}

/// The managed engine path as a string, for the frontend's candidate list.
#[tauri::command]
pub fn ml_managed_engine_path(app: AppHandle) -> Result<String, String> {
    Ok(managed_engine_exe(&app)?.to_string_lossy().to_string())
}

// ── Pinned engine release ─────────────────────────────────────────────────────
//
// The install flow only accepts bytes matching this compiled-in pin (ROADMAP
// V3 decision: pinned SHA-256 + pinned tag, hosted on the project's GitHub
// Releases). "latest" is deliberately not used — a compromised or replaced
// release asset must fail the hash check here rather than run once with
// `--version` as its only vetting. Shipping a new engine therefore means
// bumping this pin in a Nexis release: update TAG/VERSION, download the
// assets, and paste the `sha256sum` output. The nexis-ml-rs release workflow
// should also publish a checksums.txt so the pin can be cross-checked against
// CI output instead of a local download.

/// Release tag the download URL points at.
const ENGINE_TAG: &str = "v0.8.0";
/// Version string `nexis-ml --version` must report after install.
const ENGINE_VERSION: &str = "0.8.0";

/// Per-platform pinned asset: release file name, byte size (shown in the
/// consent UI; not a security boundary), and SHA-256 of the exact bytes.
struct EngineAsset {
    name: &'static str,
    size: u64,
    sha256: &'static str,
}

/// The pinned asset for this OS/arch, or None on a platform with no prebuilt
/// binary. macOS standalone builds are deferred — the panel guides Mac users
/// to the Python engine instead of offering a download that would 404.
fn engine_asset() -> Option<&'static EngineAsset> {
    if cfg!(all(target_os = "windows", target_arch = "x86_64")) {
        Some(&EngineAsset {
            name: "nexis-ml-windows-x64.exe",
            size: 34_814_464,
            sha256: "f8d7eacd6d9517277fbf40869b0589f689efeb8c76c0425dee31e68a95357dbf",
        })
    } else if cfg!(all(target_os = "linux", target_arch = "x86_64")) {
        Some(&EngineAsset {
            name: "nexis-ml-linux-x64",
            size: 26_113_824,
            sha256: "18a4981b476e639cfd4cc6722f4eea4686612568253c59a3f3591a63ba8bc5e9",
        })
    } else {
        None
    }
}

fn engine_asset_url(asset: &EngineAsset) -> String {
    format!(
        "https://github.com/rwetz/nexis-ml-rs/releases/download/{ENGINE_TAG}/{}",
        asset.name
    )
}

/// Everything the consent dialog shows before the user agrees to download:
/// what version, from where, how big, and the hash Nexis will enforce.
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct EnginePinInfo {
    pub version: String,
    pub url: String,
    pub size_bytes: u64,
    pub sha256: String,
}

/// The pinned engine release for this platform (None = no prebuilt binary).
#[tauri::command]
pub fn ml_engine_pin() -> Option<EnginePinInfo> {
    let asset = engine_asset()?;
    Some(EnginePinInfo {
        version: ENGINE_VERSION.to_string(),
        url: engine_asset_url(asset),
        size_bytes: asset.size,
        sha256: asset.sha256.to_string(),
    })
}

fn sha256_hex(bytes: &[u8]) -> String {
    use sha2::{Digest, Sha256};
    let digest = Sha256::digest(bytes);
    let mut out = String::with_capacity(64);
    for b in digest {
        use std::fmt::Write;
        let _ = write!(out, "{b:02x}");
    }
    out
}

/// Hash-gate for every install path (download and local copy): the bytes
/// must match the pinned SHA-256 *before* they are written to the managed
/// dir or executed. Self-built engines are still usable — detection accepts
/// them from PATH/venvs — but the managed dir only ever holds pinned bytes.
fn verify_pinned_bytes(bytes: &[u8], asset: &EngineAsset) -> Result<(), String> {
    let actual = sha256_hex(bytes);
    if actual != asset.sha256 {
        return Err(format!(
            "engine integrity check failed: expected sha256 {} ({} v{}), got {} — \
             refusing to install. If you built this binary yourself, keep it on \
             PATH or in a venv instead; Nexis only manages pin-verified engines.",
            asset.sha256, asset.name, ENGINE_VERSION, actual
        ));
    }
    Ok(())
}

/// Write verified engine bytes into the managed dir (temp sibling + rename so
/// a crash never leaves a half-written binary), then confirm the binary runs
/// and reports exactly the pinned version.
fn install_verified_bytes(app: &AppHandle, bytes: &[u8]) -> Result<MlDetectResult, String> {
    let exe = managed_engine_exe(app)?;
    if let Some(parent) = exe.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("create engine dir: {e}"))?;
    }
    let tmp = exe.with_extension("download");
    // An interrupted install leaves this behind — the staging file is only
    // consumed by the rename below. It is invisible to `ml_engine_status`
    // (which stats the final path), so nothing would ever clear it, and on
    // Windows a leftover handle on it makes the next write fail. Removing it
    // first makes a retry after a failed download actually retry.
    let _ = std::fs::remove_file(&tmp);
    std::fs::write(&tmp, bytes).map_err(|e| format!("write engine: {e}"))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut perms = std::fs::metadata(&tmp)
            .map_err(|e| e.to_string())?
            .permissions();
        perms.set_mode(0o755);
        std::fs::set_permissions(&tmp, perms).map_err(|e| e.to_string())?;
    }
    std::fs::rename(&tmp, &exe).map_err(|e| {
        let _ = std::fs::remove_file(&tmp);
        format!("install engine: {e}")
    })?;

    match engine_version(&exe) {
        Ok(version) if version == ENGINE_VERSION => Ok(MlDetectResult {
            exe: exe.to_string_lossy().to_string(),
            version,
        }),
        Ok(version) => {
            let _ = std::fs::remove_file(&exe);
            Err(format!(
                "engine reported version {version}, expected {ENGINE_VERSION} — removed"
            ))
        }
        Err(e) => {
            let _ = std::fs::remove_file(&exe);
            Err(format!(
                "downloaded file is not a valid nexis-ml engine: {e}"
            ))
        }
    }
}

/// Download the pinned standalone `nexis-ml` engine release into the managed
/// engine dir. The URL is derived from the compiled-in pin — never
/// frontend-supplied — and the bytes are SHA-256-verified against the pin
/// before touching disk or being executed. The "download → verify → detect"
/// path for machines without a Python toolchain.
#[tauri::command]
pub async fn ml_download(app: AppHandle) -> Result<MlDetectResult, String> {
    let asset = engine_asset().ok_or("no prebuilt engine for this platform")?;
    let url = engine_asset_url(asset);

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(300))
        .build()
        .map_err(|e| e.to_string())?;
    let resp = client.get(&url).send().await.map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("download failed: HTTP {}", resp.status().as_u16()));
    }
    let bytes = resp.bytes().await.map_err(|e| e.to_string())?;

    // Hashing 25-35 MB + the post-install --version probe block; keep them
    // off the main thread like every other heavy command.
    crate::modules::heavy(move || {
        verify_pinned_bytes(&bytes, asset)?;
        install_verified_bytes(&app, &bytes)
    })
    .await
}

/// Install the pinned engine from a file already on disk — the offline path
/// for air-gapped machines (download the release asset elsewhere, carry it
/// over). Same SHA-256 gate as the download path: only the pinned bytes are
/// accepted into the managed dir.
#[tauri::command]
pub async fn ml_install_local(app: AppHandle, path: String) -> Result<MlDetectResult, String> {
    let asset = engine_asset().ok_or("no prebuilt engine for this platform")?;
    crate::modules::heavy(move || {
        let bytes = std::fs::read(&path).map_err(|e| format!("read {path}: {e}"))?;
        verify_pinned_bytes(&bytes, asset)?;
        install_verified_bytes(&app, &bytes)
    })
    .await
}

/// Managed-engine footprint for the settings/panel readout.
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ManagedEngineStatus {
    pub installed: bool,
    pub path: String,
    pub size_bytes: u64,
}

/// Whether the managed (downloaded) engine exists and how much disk it uses.
/// Engines detected from PATH/venvs are not Nexis's to account for.
#[tauri::command]
pub fn ml_engine_status(app: AppHandle) -> Result<ManagedEngineStatus, String> {
    let exe = managed_engine_exe(&app)?;
    let size = std::fs::metadata(&exe).map(|m| m.len()).unwrap_or(0);
    Ok(ManagedEngineStatus {
        installed: size > 0,
        path: exe.to_string_lossy().to_string(),
        size_bytes: size,
    })
}

/// Delete the managed engine binary (and its dir if now empty). Returns the
/// freed byte count. Detection falls back to PATH/venv engines afterwards.
#[tauri::command]
pub fn ml_uninstall(app: AppHandle) -> Result<u64, String> {
    let exe = managed_engine_exe(&app)?;
    let size = std::fs::metadata(&exe).map(|m| m.len()).unwrap_or(0);
    // Sweep an interrupted download's staging file too. It is the one thing
    // in the engine dir that no other code path ever removes, and leaving it
    // means "Remove" reports space freed while the disk keeps holding ~35 MB.
    let tmp = exe.with_extension("download");
    let tmp_size = std::fs::metadata(&tmp).map(|m| m.len()).unwrap_or(0);
    let _ = std::fs::remove_file(&tmp);
    match std::fs::remove_file(&exe) {
        Ok(()) => {}
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(tmp_size),
        Err(e) => return Err(format!("remove engine: {e}")),
    }
    if let Some(parent) = exe.parent() {
        let _ = std::fs::remove_dir(parent); // only succeeds if empty — fine
    }
    Ok(size + tmp_size)
}

/// Run `nexis-ml env` and return its JSON capability report (torch
/// version, CUDA availability, GPU name). Blocking — importing torch
/// takes a few seconds — so the frontend calls it fire-and-forget.
#[tauri::command]
pub async fn ml_env(exe: String, workspace: Option<WorkspaceEnv>) -> Result<String, String> {
    let workspace = WorkspaceEnv::from_option(workspace);
    crate::modules::heavy(move || {
        if !is_nexis_ml_exe(&exe) {
            return Err(format!("not a nexis-ml binary: {exe}"));
        }
        let mut cmd = env_command(&workspace, &exe, None)?;
        cmd.arg("env")
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::null());
        let out = cmd.output().map_err(|e| format!("{exe}: {e}"))?;
        if !out.status.success() {
            return Err(format!("{exe} env: exit {:?}", out.status.code()));
        }
        Ok(String::from_utf8_lossy(&out.stdout).trim().to_string())
    })
    .await
}

/// Best-effort NVIDIA GPU detection via nvidia-smi (present whenever
/// the NVIDIA driver is installed). Returns the GPU name or None —
/// used to offer the CUDA torch build even before the engine exists.
#[tauri::command]
pub async fn ml_gpu_probe() -> Option<String> {
    tauri::async_runtime::spawn_blocking(ml_gpu_probe_blocking)
        .await
        .ok()
        .flatten()
}

fn ml_gpu_probe_blocking() -> Option<String> {
    let mut cmd = proc::command("nvidia-smi");
    cmd.args(["--query-gpu=name", "--format=csv,noheader"])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
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
    workspace: Option<WorkspaceEnv>,
) -> Result<u32, String> {
    let workspace = WorkspaceEnv::from_option(workspace);
    if !is_nexis_ml_exe(&exe) {
        return Err(format!("not a nexis-ml binary: {exe}"));
    }
    let sub = args.first().map(String::as_str).unwrap_or("");
    if !ALLOWED_SUBCOMMANDS.contains(&sub) {
        return Err(format!("subcommand not allowed: {sub}"));
    }
    // The project dir is the user's explicitly-chosen folder from the ML
    // panel (a known engine binary running an allowlisted subcommand), so
    // *authorize* it — add it to the workspace registry — rather than only
    // checking against it. A check-only guard (like pty_open's, pitfall #1C)
    // fails silently when the folder was authorized under a different
    // workspace env; authorizing here can't. `authorize` canonicalizes, so a
    // missing/inaccessible dir still errors clearly.
    let trimmed = project_dir.trim();
    if trimmed.is_empty() {
        return Err("ml_spawn: empty project dir".into());
    }
    // Authorize the *host* view of the dir — under WSL that is the
    // `\\wsl.localhost\<distro>\…` share, which is what the fs commands
    // canonicalize against and the only form the registry can check.
    let resolved = registry
        .authorize(resolve_path(trimmed, &workspace))
        .map_err(|e| format!("project dir not accessible: {e}"))?;
    if !resolved.is_dir() {
        return Err(format!(
            "project dir is not a directory: {}",
            resolved.display()
        ));
    }

    // ...but the child's working directory has to be expressed in *its* own
    // environment: `wsl.exe --cd` takes the Linux path the caller gave us,
    // never the host share path, which means nothing inside the distro.
    let child_cwd = if workspace.is_wsl() {
        trimmed.to_string()
    } else {
        resolved.to_string_lossy().into_owned()
    };
    let mut cmd = env_command(&workspace, &exe, Some(&child_cwd))?;
    cmd.arg("--nexis-protocol")
        .args(&args)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

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
        let app_handle = app;
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
    let stem = exe_stem_lower(exe);
    stem == "python" || stem == "python3" || stem.starts_with("python3.")
}

/// Pip invocations the frontend may request, by name. Fixed arg sets —
/// this must not become a generic pip runner.
fn install_flavor_args(flavor: &str) -> Option<&'static [&'static str]> {
    match flavor {
        // The engine + CPU torch from PyPI (the preferred source).
        "default" => Some(&["-m", "pip", "install", "--upgrade", "nexis-ml[torch]"]),
        // GitHub fallback — installs the engine straight from the public repo
        // when it isn't on PyPI (yet). The frontend tries `default` first and
        // only falls back to this. A fixed direct-reference URL, not a
        // user-supplied one, so this stays a non-generic installer.
        "git" => Some(&[
            "-m",
            "pip",
            "install",
            "--upgrade",
            "nexis-ml[torch] @ git+https://github.com/rwetz/nexis-ml.git",
        ]),
        // CUDA torch from the PyTorch index (NVIDIA GPUs). The frontend
        // runs this first, then `default` — nexis-ml's torch requirement
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
    workspace: Option<WorkspaceEnv>,
) -> Result<u32, String> {
    let workspace = WorkspaceEnv::from_option(workspace);
    if !is_python_exe(&python) {
        return Err(format!("not a python binary: {python}"));
    }
    let args =
        install_flavor_args(&flavor).ok_or_else(|| format!("unknown install flavor: {flavor}"))?;
    // Installs follow the workspace for the same reason detection does: a pip
    // install run on the host puts the engine somewhere the distro can't see.
    let mut cmd = env_command(&workspace, &python, None)?;
    cmd.args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

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
        let app_handle = app;
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
    fn sha256_hex_matches_known_vector() {
        // NIST test vector: sha256("abc")
        assert_eq!(
            sha256_hex(b"abc"),
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
        assert_eq!(
            sha256_hex(b""),
            "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
        );
    }

    #[test]
    fn engine_pin_is_well_formed() {
        // The pin is the security boundary of the install flow — a malformed
        // hash would make every install fail (fail-closed, but still a bug).
        if let Some(asset) = engine_asset() {
            assert_eq!(asset.sha256.len(), 64, "sha256 must be 64 hex chars");
            assert!(asset.sha256.chars().all(|c| c.is_ascii_hexdigit()));
            assert!(
                asset.sha256.chars().all(|c| !c.is_ascii_uppercase()),
                "pin must be lowercase hex (sha256_hex emits lowercase)"
            );
            assert!(asset.size > 0);
            assert!(asset.name.starts_with("nexis-ml-"));
            let url = engine_asset_url(asset);
            assert!(url.starts_with("https://github.com/rwetz/nexis-ml-rs/releases/download/"));
            assert!(
                url.contains(ENGINE_TAG),
                "url must pin the exact tag, never 'latest'"
            );
        }
        assert!(ENGINE_TAG.strip_prefix('v') == Some(ENGINE_VERSION));
    }

    #[test]
    fn verify_pinned_bytes_rejects_mismatch() {
        let asset = EngineAsset {
            name: "nexis-ml-test",
            size: 3,
            sha256: "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
        };
        assert!(verify_pinned_bytes(b"abc", &asset).is_ok());
        let err = verify_pinned_bytes(b"abd", &asset).unwrap_err();
        assert!(err.contains("integrity check failed"));
    }

    #[test]
    fn looks_absolute_covers_both_conventions() {
        assert!(looks_absolute("/home/me/.venv/bin/nexis-ml"));
        assert!(looks_absolute(r"C:\proj\.venv\Scripts\nexis-ml.exe"));
        assert!(looks_absolute(r"\\wsl.localhost\Ubuntu\home\me\nexis-ml"));
        // A bare name has to be resolved by PATH, which only a spawn can do —
        // it must not be dismissed by the cheap `exists()` pre-check.
        assert!(!looks_absolute("nexis-ml"));
        assert!(!looks_absolute("nexis-ml.exe"));
        assert!(!looks_absolute("./nexis-ml"));
        assert!(!looks_absolute(""));
        assert!(!looks_absolute("C:"));
    }

    #[test]
    fn stderr_says_missing_separates_absent_from_broken() {
        // Absent: the overwhelmingly common case for a speculative candidate,
        // and never worth showing anyone.
        assert!(stderr_says_missing(
            "/usr/bin/env: 'nexis-ml': No such file or directory"
        ));
        assert!(stderr_says_missing("bash: nexis-ml: command not found"));
        assert!(stderr_says_missing(
            "The system cannot find the path specified."
        ));
        // Present but broken: this is the diagnosis worth surfacing.
        assert!(!stderr_says_missing("error while loading shared libraries"));
        assert!(!stderr_says_missing("Segmentation fault"));
        assert!(!stderr_says_missing(""));
    }

    #[test]
    fn parse_version_takes_last_token() {
        assert_eq!(parse_version("nexis-ml 0.5.0\n").as_deref(), Some("0.5.0"));
        assert_eq!(
            parse_version("  nexis-ml 1.2.3  ").as_deref(),
            Some("1.2.3")
        );
        assert_eq!(parse_version("0.1.0").as_deref(), Some("0.1.0"));
        assert_eq!(parse_version("").as_deref(), None);
        assert_eq!(parse_version("   ").as_deref(), None);
    }

    #[test]
    fn subcommand_allowlist_is_minimal() {
        assert!(ALLOWED_SUBCOMMANDS.contains(&"train"));
        assert!(ALLOWED_SUBCOMMANDS.contains(&"replay"));
        assert!(ALLOWED_SUBCOMMANDS.contains(&"new"));
        assert!(ALLOWED_SUBCOMMANDS.contains(&"serve"));
        assert!(ALLOWED_SUBCOMMANDS.contains(&"export"));
        // `runs`, `infer`, and arbitrary subcommands stay CLI-only
        assert!(!ALLOWED_SUBCOMMANDS.contains(&"runs"));
        assert!(!ALLOWED_SUBCOMMANDS.contains(&"infer"));
        assert_eq!(ALLOWED_SUBCOMMANDS.len(), 5);
    }

    #[test]
    fn install_flavors_are_a_fixed_allowlist() {
        assert!(install_flavor_args("default").is_some());
        assert!(install_flavor_args("git").is_some());
        assert!(install_flavor_args("cuda-torch").is_some());
        assert!(install_flavor_args("").is_none());
        assert!(install_flavor_args("anything-else").is_none());
        // No flavor may smuggle arbitrary packages: every arg set is
        // a compile-time constant.
        for flavor in ["default", "git", "cuda-torch"] {
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
