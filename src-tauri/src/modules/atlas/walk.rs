//! One filesystem walk shared by the atlas (aggregate stats per repo) and the
//! city (the full tree). Keeping a single implementation means a repo's tower
//! in the atlas and its skyline after drill-in are computed from exactly the
//! same set of files.

use crate::lang;
use git2::Repository;
use std::fs;
use std::path::Path;

/// Never descended into. `.git` and dotfiles are handled separately.
pub const SKIP_DIRS: &[&str] = &[
    "node_modules",
    "target",
    "vendor",
    "__pycache__",
    "dist",
    "build",
    ".venv",
    "venv",
];

pub struct FileEntry {
    /// Repo-relative, always `/`-separated (the frontend splits on it).
    pub rel: String,
    pub bytes: u64,
    pub lang: &'static str,
}

#[derive(Default)]
pub struct WalkResult {
    pub files: Vec<FileEntry>,
    pub dirs: usize,
    /// True when `limit` cut the walk short — the frontend says so out loud
    /// rather than quietly rendering a partial city.
    pub truncated: bool,
}

/// Walk `root`, collecting every non-ignored file. When `repo` is supplied,
/// `.gitignore` is honored via libgit2's own matcher, so what you see is what
/// `git status` would consider part of the project.
pub fn walk_repo(root: &Path, repo: Option<&Repository>, limit: usize) -> WalkResult {
    let mut out = WalkResult::default();
    descend(root, root, repo, limit, &mut out);
    out
}

fn descend(root: &Path, dir: &Path, repo: Option<&Repository>, limit: usize, out: &mut WalkResult) {
    if out.truncated {
        return;
    }
    let Ok(rd) = fs::read_dir(dir) else { return };
    for entry in rd.flatten() {
        if out.files.len() >= limit {
            out.truncated = true;
            return;
        }
        // file_type() reports `symlink` for symlinked dirs, so cycles are skipped.
        let Ok(ft) = entry.file_type() else { continue };
        let name = entry.file_name();
        let name = name.to_string_lossy();
        let path = entry.path();

        if ft.is_dir() {
            if name.starts_with('.') || SKIP_DIRS.contains(&name.as_ref()) {
                continue;
            }
            if is_ignored(repo, &path, true) {
                continue;
            }
            out.dirs += 1;
            descend(root, &path, repo, limit, out);
            if out.truncated {
                return;
            }
            continue;
        }
        if !ft.is_file() || name.starts_with('.') {
            continue;
        }
        if is_ignored(repo, &path, false) {
            continue;
        }
        let Ok(meta) = entry.metadata() else { continue };
        let Some(rel) = relative(root, &path) else {
            continue;
        };
        out.files.push(FileEntry {
            rel,
            bytes: meta.len(),
            lang: lang::lang_for(name.as_ref()),
        });
    }
}

fn is_ignored(repo: Option<&Repository>, path: &Path, is_dir: bool) -> bool {
    let Some(repo) = repo else { return false };
    // libgit2 wants a trailing separator to treat the path as a directory.
    let probe = if is_dir {
        path.join("")
    } else {
        path.to_path_buf()
    };
    repo.status_should_ignore(&probe).unwrap_or(false)
}

fn relative(root: &Path, path: &Path) -> Option<String> {
    let rel = path.strip_prefix(root).ok()?;
    let mut s = String::new();
    for c in rel.components() {
        if !s.is_empty() {
            s.push('/');
        }
        s.push_str(&c.as_os_str().to_string_lossy());
    }
    (!s.is_empty()).then_some(s)
}
