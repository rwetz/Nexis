// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

pub mod file;
pub mod grep;
pub mod mutate;
pub mod search;
pub mod tree;

use std::path::Path;

use crate::modules::workspace::WorkspaceEnv;

/// Frontend-facing path: forward-slash on every platform, `\\?\` stripped on Windows.
pub fn to_canon(p: impl AsRef<Path>) -> String {
    let s = p.as_ref().to_string_lossy().into_owned();
    #[cfg(windows)]
    {
        // Strip the Windows extended-length path prefix (`\\?\`) before
        // forwarding to the frontend; the prefix is invisible to the user and
        // breaks comparisons, `cd`, and PowerShell prompt rendering.
        let s = s.strip_prefix(r"\\?\").unwrap_or(&s);
        s.replace('\\', "/")
    }
    #[cfg(not(windows))]
    {
        s
    }
}

/// Frontend-facing display path for a file under a (possibly WSL) workspace
/// root: relative segment appended to the root's display string, falling back
/// to the canonical path. Shared by the `search` and `grep` modules.
pub(crate) fn display_path(
    path: &Path,
    root_path: &Path,
    root_display: &str,
    workspace: &WorkspaceEnv,
) -> String {
    if workspace.is_wsl() {
        if let Ok(rel) = path.strip_prefix(root_path) {
            let rel = to_canon(rel);
            return if rel.is_empty() {
                root_display.to_string()
            } else if root_display.ends_with('/') {
                format!("{root_display}{rel}")
            } else {
                format!("{root_display}/{rel}")
            };
        }
    }
    to_canon(path)
}
