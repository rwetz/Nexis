// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

//! Atlas — every git repo on the machine, scanned once and shown two ways.
//!
//! Absorbed from the standalone `nexis-atlas` app (which was itself Imagine
//! and Dev Dashboard merged). The scanning half arrives unchanged: `config`
//! resolves which repos to look at, `scan` summarizes each one with libgit2
//! plus a parallel file walk, `tree` builds the per-repo city the map drills
//! into, and `detail` answers the list view's drill-in.
//!
//! What changed on the way in:
//!
//! - The commands are namespaced `atlas_*` and go through [`super::heavy`],
//!   because a Tauri command that walks the filesystem must not run on the
//!   main thread (see the note on `heavy`).
//! - `open_in_nexis` / `has_nexis` are gone. Atlas used to locate an installed
//!   Nexis and spawn it at a repo; inside Nexis that is just opening a
//!   workspace, which the frontend does directly.
//! - `open_path` / `open_in_terminal` are gone for the same reason: the
//!   explorer already reveals a path through `@tauri-apps/plugin-opener`, and
//!   "open a terminal here" is a Nexis tab, not a foreign emulator.
//!
//! ## Scope: this scans the host, always
//!
//! Atlas answers "what is on this machine", and it answers it about the host
//! even when the active workspace is a WSL distro. That is a deliberate
//! exception to pitfall #20 rather than an oversight of it: the panel is not
//! reporting a capability *on behalf of* the workspace, it is a machine-wide
//! inventory, and silently re-rooting it at `\\wsl.localhost\...` when the
//! user switches a terminal tab would make the map jump for reasons that have
//! nothing to do with the map. Pitfall #20's actual requirement -- do not let
//! a host-scoped answer masquerade as a workspace-scoped one -- is met by
//! saying so in the UI. Scanning inside a distro is a real feature and is
//! tracked in ROADMAP; it is not this change.

pub mod config;
pub mod detail;
pub mod lang;
pub mod scan;
pub mod tree;
pub mod walk;

#[cfg(test)]
pub mod testutil;

use rayon::prelude::*;
use serde::Serialize;
use std::time::Instant;

#[derive(Serialize)]
pub struct AtlasResult {
    repos: Vec<scan::RepoSummary>,
    elapsed_ms: u64,
    config_path: String,
    scan_root: Option<String>,
}

/// Re-reads `atlas.toml` on every scan so edits are picked up by a plain
/// refresh, then fans the per-repo walk out across rayon's pool.
///
/// One scan, both views: the list renders the git half of every summary and
/// the map builds an island out of the size half. Running it once is the whole
/// point of the two views being one panel.
#[tauri::command]
pub async fn atlas_scan_repos() -> Result<AtlasResult, String> {
    super::heavy(|| {
        let started = Instant::now();
        let (cfg, path) = config::load_or_init()?;
        let paths = config::resolve_repos(&cfg);
        let mut repos: Vec<scan::RepoSummary> = paths
            .par_iter()
            .map(|p| scan::summarize(p, cfg.max_files))
            .collect();
        // Biggest first: the squarified treemap in `layoutAtlas` requires
        // descending weight, and a stable order keeps islands from hopping
        // between refreshes. The list view sorts its own rows by name.
        repos.sort_by(|a, b| {
            b.bytes
                .cmp(&a.bytes)
                .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
        });
        Ok(AtlasResult {
            repos,
            elapsed_ms: started.elapsed().as_millis() as u64,
            config_path: path.display().to_string(),
            scan_root: cfg.scan_root,
        })
    })
    .await
}

/// The full file tree for one repo — the city the map drills into.
#[tauri::command]
pub async fn atlas_repo_city(path: String) -> Result<tree::RepoCity, String> {
    super::heavy(move || {
        let limit = config::load_or_init()
            .map(|(cfg, _)| cfg.max_files)
            .unwrap_or(20_000);
        tree::build(std::path::Path::new(&path), limit)
    })
    .await
}

/// Which files are dirty and what is stashed — the list view's drill-in.
/// Returns only what the summary could not carry; see `detail.rs`.
#[tauri::command]
pub async fn atlas_repo_detail(path: String) -> Result<detail::RepoDetail, String> {
    super::heavy(move || detail::repo_detail(std::path::Path::new(&path))).await
}

/// Absolute path of `atlas.toml`, creating it with the commented default on
/// first call. The panel opens it in a Nexis editor tab rather than handing it
/// to the OS — the standalone app had nowhere better to send it, this one does.
#[tauri::command]
pub async fn atlas_config_path() -> Result<String, String> {
    super::heavy(|| config::load_or_init().map(|(_, path)| path.display().to_string())).await
}
