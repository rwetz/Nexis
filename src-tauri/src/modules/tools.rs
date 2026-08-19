// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

// Panic-lint gate: no `.unwrap()`/`.expect()` in production code here.
#![warn(clippy::unwrap_used, clippy::expect_used)]

//! Re-checking external tools Nexis wanted but could not find.
//!
//! The "N tools missing" notice is populated lazily, by whatever tried to use
//! a tool and failed (`src/lib/missingTools.ts`). That is the right trigger
//! for *raising* the notice, but a poor one for retiring it: a user who runs
//! the install command we handed them has no reason to open a Rust file again
//! just to prove it worked, so the notice outlived the problem. This is the
//! explicit re-check behind the notice's refresh button.
//!
//! Resolution rather than execution. `<binary> --version` looks like the more
//! honest probe, but several language servers here speak LSP on stdio and
//! treat an unknown flag as "wait for a request" — probing by running them
//! would hang the refresh on exactly the tools it exists to check. Whether the
//! name resolves to an executable is the question the spawn itself will ask.

use crate::modules::workspace::WorkspaceEnv;
use std::path::Path;

/// Which of `binaries` resolve to something runnable right now.
///
/// `workspace` selects *where* to look, and the caller decides per tool: the
/// LSP client spawns servers on the host regardless of workspace, while git
/// follows the workspace into WSL. Probing the wrong side is CLAUDE.md pitfall
/// #20 — an answer that is true of a machine the tool will not run on.
#[tauri::command]
pub async fn tool_probe(
    binaries: Vec<String>,
    workspace: Option<WorkspaceEnv>,
) -> Result<Vec<String>, String> {
    let workspace = WorkspaceEnv::from_option(workspace);
    crate::modules::heavy(move || {
        // Git answers availability from a 60s cache. A refresh is the user
        // saying they just changed something, so the cached "not installed"
        // must not outlive it — otherwise the pill clears and the very next
        // Source Control read puts it straight back.
        crate::modules::git::invalidate_availability_cache();
        Ok(binaries
            .into_iter()
            .filter(|b| resolves(&workspace, b))
            .collect())
    })
    .await
}

fn resolves(workspace: &WorkspaceEnv, binary: &str) -> bool {
    if binary.is_empty() {
        return false;
    }
    match workspace {
        WorkspaceEnv::Local => resolves_on_host(binary),
        #[cfg(windows)]
        WorkspaceEnv::Wsl { distro } => resolves_in_wsl(distro, binary),
        // A non-Windows host has no WSL. Answering for the host instead would
        // be the wrong-machine bug this parameter exists to prevent.
        #[cfg(not(windows))]
        WorkspaceEnv::Wsl { .. } => false,
    }
}

/// A `which`, in-process: no subprocess, so it cannot hang or flash a console.
fn resolves_on_host(binary: &str) -> bool {
    let path = Path::new(binary);
    // A name carrying a separator is a path, not a PATH lookup — that is what
    // the OS does when it spawns it, so match that here.
    if path.components().count() > 1 {
        return is_executable_file(path);
    }
    let Some(path_var) = std::env::var_os("PATH") else {
        return false;
    };
    std::env::split_paths(&path_var)
        .filter(|dir| !dir.as_os_str().is_empty())
        .any(|dir| {
            executable_suffixes()
                .iter()
                .any(|suffix| is_executable_file(&dir.join(format!("{binary}{suffix}"))))
        })
}

/// Suffixes to try for a bare name. On Windows the npm-installed servers here
/// land as `.cmd` shims rather than `.exe`, so PATHEXT is not optional.
fn executable_suffixes() -> Vec<String> {
    #[cfg(windows)]
    {
        let mut out = vec![String::new()];
        let raw = std::env::var("PATHEXT").unwrap_or_else(|_| ".COM;.EXE;.BAT;.CMD".to_string());
        out.extend(
            raw.split(';')
                .map(str::trim)
                .filter(|e| e.starts_with('.'))
                .map(str::to_string),
        );
        out
    }
    #[cfg(not(windows))]
    {
        vec![String::new()]
    }
}

#[cfg(unix)]
fn is_executable_file(path: &Path) -> bool {
    use std::os::unix::fs::PermissionsExt;
    // `metadata` follows symlinks, which is what an exec would do too.
    std::fs::metadata(path)
        .map(|m| m.is_file() && m.permissions().mode() & 0o111 != 0)
        .unwrap_or(false)
}

#[cfg(not(unix))]
fn is_executable_file(path: &Path) -> bool {
    std::fs::metadata(path)
        .map(|m| m.is_file())
        .unwrap_or(false)
}

/// Resolve inside the distro, through the same `wsl.exe --exec` entry point
/// the real spawn uses, so the probe sees the same PATH the spawn will.
/// `command -v` is a shell builtin, hence `sh -c`; the name goes in as `$0`
/// rather than being interpolated into the script.
#[cfg(windows)]
fn resolves_in_wsl(distro: &str, binary: &str) -> bool {
    crate::modules::workspace::wsl_exec_capture(
        distro,
        "sh",
        &["-c", "command -v -- \"$0\" >/dev/null", binary],
    )
    .is_ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_name_never_resolves() {
        assert!(!resolves(&WorkspaceEnv::Local, ""));
    }

    #[test]
    fn nonexistent_binary_does_not_resolve() {
        assert!(!resolves_on_host("nexis-definitely-not-a-real-binary-xyz"));
    }

    #[test]
    fn a_real_binary_on_path_resolves() {
        // Something guaranteed present on every CI platform we build on.
        let probe = if cfg!(windows) { "cmd" } else { "sh" };
        assert!(resolves_on_host(probe), "expected {probe} on PATH");
    }

    #[test]
    fn an_explicit_path_is_not_looked_up_on_path() {
        // Contains a separator, so it must be treated as a path and fail
        // rather than matching a same-named binary somewhere on PATH.
        assert!(!resolves_on_host("no/such/dir/sh"));
    }

    #[test]
    fn a_directory_is_not_executable() {
        let dir = std::env::temp_dir();
        assert!(!is_executable_file(&dir));
    }
}
