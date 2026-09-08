//! Config loading + repo discovery for the Atlas view.
//!
//! `atlas.toml` lives in Nexis's own config dir (`%APPDATA%\nexis\atlas.toml`
//! on Windows, `~/.config/nexis/atlas.toml` on Linux). Knobs: an explicit
//! `repos` list, and/or a `scan_root` that is walked (up to `scan_depth`
//! levels) for directories containing `.git`. Both are honored, deduplicated,
//! with explicit entries listed first. `max_files` caps how much of a single
//! repo is materialized into the map so one monorepo can't wedge the renderer.
//!
//! One config serves both views: the list reads the git fields, the map reads
//! the size and language fields, and both come from the same scan.
//!
//! This is deliberately a separate file rather than a set of keys inside Nexis
//! preferences. Preferences are per-user UI state written through `writePref`
//! and synced across windows (pitfall #2); this is a hand-edited machine
//! description the user is expected to open in an editor, which is why the
//! default is written with comments in it. Keeping it apart also means a
//! config written by the standalone Atlas can be adopted verbatim.

use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Config {
    #[serde(default)]
    pub repos: Vec<String>,
    #[serde(default)]
    pub scan_root: Option<String>,
    #[serde(default = "default_scan_depth")]
    pub scan_depth: usize,
    #[serde(default = "default_max_files")]
    pub max_files: usize,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            repos: Vec::new(),
            scan_root: None,
            scan_depth: default_scan_depth(),
            max_files: default_max_files(),
        }
    }
}

fn default_scan_depth() -> usize {
    3
}

fn default_max_files() -> usize {
    20_000
}

pub fn config_path() -> PathBuf {
    dirs::config_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("nexis")
        .join("atlas.toml")
}

fn default_config_contents() -> String {
    let home = dirs::home_dir().unwrap_or_else(|| PathBuf::from("~"));
    let root = if home.join("Dev").is_dir() {
        "~/Dev"
    } else if home.join("dev").is_dir() {
        "~/dev"
    } else {
        "~"
    };
    format!(
        r#"# Nexis Atlas — repo configuration
#
# Explicit repos to track (tilde is expanded). Always included.
repos = []

# Auto-discover git repos under this root, up to scan_depth levels deep.
# Hidden directories, node_modules, and Rust target dirs are skipped.
# Delete or comment out scan_root to use only the explicit list above.
scan_root = "{root}"
scan_depth = 3

# Safety valve: stop materializing a repo's file tree past this many files.
# Only the map view walks that deep; the list view never hits this.
max_files = 20000
"#
    )
}

/// Config dirs of the standalone apps this view replaces, newest first. On
/// first run we adopt whichever one exists rather than making the user
/// re-point `scan_root` at the same directory yet again -- someone who has
/// been running Atlas as its own app should see their repos the first time
/// they open the panel, not an empty scan and a config file to go write.
const LEGACY_DIRS: &[&str] = &["nexis-atlas", "nexis-imagine", "nexis-dev-dashboard"];

/// Copy a predecessor's `config.toml` into place if we have none of our own.
/// Best-effort: a failure here just means the caller writes a fresh default.
fn adopt_legacy_config(dest: &Path) -> bool {
    let Some(base) = dirs::config_dir() else {
        return false;
    };
    for legacy in LEGACY_DIRS {
        let src = base.join(legacy).join("config.toml");
        if !src.is_file() {
            continue;
        }
        // Only adopt something that still parses — a corrupt predecessor
        // config should not become a corrupt Atlas config.
        let Ok(raw) = fs::read_to_string(&src) else {
            continue;
        };
        if toml::from_str::<Config>(&raw).is_err() {
            continue;
        }
        if fs::write(dest, raw).is_ok() {
            return true;
        }
    }
    false
}

/// Load the config, writing a commented default file on first run.
pub fn load_or_init() -> Result<(Config, PathBuf), String> {
    let path = config_path();
    if !path.exists() {
        if let Some(dir) = path.parent() {
            fs::create_dir_all(dir).map_err(|e| format!("create {}: {e}", dir.display()))?;
        }
        if !adopt_legacy_config(&path) {
            fs::write(&path, default_config_contents())
                .map_err(|e| format!("write {}: {e}", path.display()))?;
        }
    }
    let raw = fs::read_to_string(&path).map_err(|e| format!("read {}: {e}", path.display()))?;
    let cfg: Config = toml::from_str(&raw).map_err(|e| format!("parse {}: {e}", path.display()))?;
    Ok((cfg, path))
}

pub fn expand_tilde(p: &str) -> PathBuf {
    if p == "~" {
        return dirs::home_dir().unwrap_or_else(|| PathBuf::from(p));
    }
    if let Some(rest) = p.strip_prefix("~/") {
        if let Some(home) = dirs::home_dir() {
            return home.join(rest);
        }
    }
    PathBuf::from(p)
}

/// Resolve the final repo list: explicit entries first, then discovery under
/// `scan_root`, deduplicated by canonical path.
pub fn resolve_repos(cfg: &Config) -> Vec<PathBuf> {
    let mut seen: HashSet<PathBuf> = HashSet::new();
    let mut out: Vec<PathBuf> = Vec::new();

    let mut push = |p: PathBuf| {
        let key = p.canonicalize().unwrap_or_else(|_| p.clone());
        if seen.insert(key) {
            out.push(p);
        }
    };

    for r in &cfg.repos {
        let p = expand_tilde(r);
        if p.is_dir() {
            push(p);
        }
    }

    if let Some(root) = &cfg.scan_root {
        let root = expand_tilde(root);
        if root.is_dir() {
            let mut found = Vec::new();
            discover(&root, cfg.scan_depth, &mut found);
            for p in found {
                push(p);
            }
        }
    }

    out
}

fn discover(dir: &Path, depth: usize, out: &mut Vec<PathBuf>) {
    // A directory containing `.git` (dir or worktree file) is a repo;
    // don't descend into it looking for nested repos.
    if dir.join(".git").exists() {
        out.push(dir.to_path_buf());
        return;
    }
    if depth == 0 {
        return;
    }
    let Ok(rd) = fs::read_dir(dir) else { return };
    for entry in rd.flatten() {
        // file_type() reports `symlink` for symlinked dirs, so cycles are skipped.
        let Ok(ft) = entry.file_type() else { continue };
        if !ft.is_dir() {
            continue;
        }
        let name = entry.file_name();
        let name = name.to_string_lossy();
        if name.starts_with('.') || crate::modules::atlas::walk::SKIP_DIRS.contains(&name.as_ref())
        {
            continue;
        }
        discover(&entry.path(), depth - 1, out);
    }
}
