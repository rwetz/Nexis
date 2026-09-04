pub mod config;
pub mod lang;
pub mod scan;
pub mod tree;
pub mod walk;

use rayon::prelude::*;
use serde::Serialize;
use std::time::Instant;

#[derive(Serialize)]
struct AtlasResult {
    repos: Vec<scan::RepoSummary>,
    elapsed_ms: u64,
    config_path: String,
    scan_root: Option<String>,
}

/// Re-reads config.toml on every scan so edits are picked up by a plain
/// refresh, then fans the per-repo walk out across rayon's pool. This is the
/// atlas: one island per repo.
#[tauri::command]
async fn scan_repos() -> Result<AtlasResult, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let started = Instant::now();
        let (cfg, path) = config::load_or_init()?;
        let paths = config::resolve_repos(&cfg);
        let mut repos: Vec<scan::RepoSummary> = paths
            .par_iter()
            .map(|p| scan::summarize(p, cfg.max_files))
            .collect();
        // Biggest first so the atlas treemap is stable across refreshes.
        repos.sort_by(|a, b| {
            b.bytes
                .cmp(&a.bytes)
                .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
        });
        Ok(AtlasResult {
            repos,
            elapsed_ms: started.elapsed().as_millis() as u64,
            config_path: path.display().to_string(),
            scan_root: cfg.scan_root.clone(),
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

/// The full file tree for one repo — the city you drill into.
#[tauri::command]
async fn repo_city(path: String) -> Result<tree::RepoCity, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let limit = config::load_or_init()
            .map(|(cfg, _)| cfg.max_files)
            .unwrap_or(20_000);
        tree::build(std::path::Path::new(&path), limit)
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Open a repo directory (or a file inside it) with the system handler.
#[tauri::command]
fn open_path(path: String) -> Result<(), String> {
    tauri_plugin_opener::open_path(path, None::<&str>).map_err(|e| e.to_string())
}

/// Open the user's terminal emulator with its working directory at `path`.
#[tauri::command]
fn open_in_terminal(path: String) -> Result<String, String> {
    spawn_terminal(&path)
}

#[cfg(target_os = "linux")]
fn spawn_terminal(path: &str) -> Result<String, String> {
    let mut candidates: Vec<String> = Vec::new();
    if let Ok(t) = std::env::var("TERMINAL") {
        if !t.is_empty() {
            candidates.push(t);
        }
    }
    for c in [
        "ghostty",
        "kitty",
        "alacritty",
        "wezterm",
        "foot",
        "konsole",
        "gnome-terminal",
        "xfce4-terminal",
        "xterm",
    ] {
        candidates.push(c.into());
    }
    for term in candidates {
        if std::process::Command::new(&term)
            .current_dir(path)
            .spawn()
            .is_ok()
        {
            return Ok(term);
        }
    }
    Err("no terminal emulator found — set $TERMINAL".into())
}

#[cfg(target_os = "macos")]
fn spawn_terminal(path: &str) -> Result<String, String> {
    std::process::Command::new("open")
        .args(["-a", "Terminal", path])
        .spawn()
        .map(|_| "Terminal".to_string())
        .map_err(|e| e.to_string())
}

#[cfg(target_os = "windows")]
fn spawn_terminal(path: &str) -> Result<String, String> {
    // Windows Terminal if present, else a plain cmd window.
    if std::process::Command::new("wt")
        .args(["-d", path])
        .spawn()
        .is_ok()
    {
        return Ok("wt".into());
    }
    std::process::Command::new("cmd")
        .args(["/C", "start", "cmd"])
        .current_dir(path)
        .spawn()
        .map(|_| "cmd".to_string())
        .map_err(|e| e.to_string())
}

/// Open config.toml in the default editor (creating it first if needed).
#[tauri::command]
fn open_config() -> Result<(), String> {
    let (_, path) = config::load_or_init()?;
    tauri_plugin_opener::open_path(path.display().to_string(), None::<&str>)
        .map_err(|e| e.to_string())
}

#[cfg(target_os = "linux")]
fn is_nvidia() -> bool {
    std::path::Path::new("/proc/driver/nvidia/version").exists()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // NVIDIA + Wayland + WebKitGTK >= 2.48: the web process's DMA-BUF export
    // kills the app with `Gdk Error 71 (Protocol error)` at first paint.
    // The usual WEBKIT_DISABLE_DMABUF_RENDERER=1 workaround avoids the crash
    // but loses window alpha (black behind the rounded borderless corners),
    // and hardware-acceleration-policy=Never paints nothing at all on 2.52.
    // Forcing Mesa's EGL for this process is the one combination verified
    // stable AND alpha-correct on NVIDIA; skip via IMAGINE_KEEP_HW_ACCEL=1.
    #[cfg(target_os = "linux")]
    if is_nvidia() && std::env::var_os("IMAGINE_KEEP_HW_ACCEL").is_none() {
        const MESA: &str = "/usr/share/glvnd/egl_vendor.d/50_mesa.json";
        if std::env::var_os("__EGL_VENDOR_LIBRARY_FILENAMES").is_none()
            && std::path::Path::new(MESA).exists()
        {
            std::env::set_var("__EGL_VENDOR_LIBRARY_FILENAMES", MESA);
        } else if std::env::var_os("__EGL_VENDOR_LIBRARY_FILENAMES").is_none() {
            // No Mesa ICD to fall back to — at least keep the app alive.
            std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
        }
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            scan_repos,
            repo_city,
            open_path,
            open_in_terminal,
            open_config
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
