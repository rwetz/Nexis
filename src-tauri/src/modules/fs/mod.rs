pub mod file;
pub mod grep;
pub mod mutate;
pub mod search;
pub mod tree;

use std::path::Path;

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
