// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

// Panic-lint gate: no `.unwrap()`/`.expect()` in production code here.
// Tests may still panic (allow-*-in-tests in clippy.toml). CI's
// `clippy -- -D warnings` turns a new one into a build failure.
#![warn(clippy::unwrap_used, clippy::expect_used)]

use crate::modules::heavy;
use crate::modules::workspace::{resolve_path, WorkspaceEnv};

/// Creates a new empty file. Fails if the file already exists.
#[tauri::command]
pub async fn fs_create_file(path: String, workspace: Option<WorkspaceEnv>) -> Result<(), String> {
    heavy(move || {
        let workspace = WorkspaceEnv::from_option(workspace);
        let p = resolve_path(&path, &workspace);
        if p.exists() {
            return Err(format!("already exists: {}", p.display()));
        }
        std::fs::write(&p, "").map_err(|e| {
            log::debug!("fs_create_file({}) failed: {e}", p.display());
            e.to_string()
        })
    })
    .await
}

/// Creates a new directory. Fails if the directory already exists.
/// Parents are created as needed — matches the common "new folder" UX
/// where typing "a/b/c" creates the full chain.
#[tauri::command]
pub async fn fs_create_dir(path: String, workspace: Option<WorkspaceEnv>) -> Result<(), String> {
    heavy(move || {
        let workspace = WorkspaceEnv::from_option(workspace);
        let p = resolve_path(&path, &workspace);
        if p.exists() {
            return Err(format!("already exists: {}", p.display()));
        }
        std::fs::create_dir_all(&p).map_err(|e| {
            log::debug!("fs_create_dir({}) failed: {e}", p.display());
            e.to_string()
        })
    })
    .await
}

/// Renames (or moves) a path. Refuses to overwrite an existing target.
#[tauri::command]
pub async fn fs_rename(
    from: String,
    to: String,
    workspace: Option<WorkspaceEnv>,
) -> Result<(), String> {
    heavy(move || {
        let workspace = WorkspaceEnv::from_option(workspace);
        let from_p = resolve_path(&from, &workspace);
        let to_p = resolve_path(&to, &workspace);
        if !from_p.exists() {
            return Err(format!("not found: {}", from_p.display()));
        }
        if to_p.exists() {
            return Err(format!("already exists: {}", to_p.display()));
        }
        rename_path(&workspace, &from, &to, &from_p, &to_p)
    })
    .await
}

/// Rename backend. Split out of `fs_rename` so the WSL fallback below has a
/// single place to retry through.
fn rename_local(from_p: &std::path::Path, to_p: &std::path::Path) -> Result<(), String> {
    std::fs::rename(from_p, to_p).map_err(|e| {
        log::debug!(
            "fs_rename({} -> {}) failed: {e}",
            from_p.display(),
            to_p.display()
        );
        e.to_string()
    })
}

/// `std::fs::rename` is `MoveFileExW` on Windows, and the WSL 9P redirector
/// behind `\\wsl.localhost\<distro>\...` rejects it with ERROR_NOT_SAME_DEVICE
/// (os error 17 — *not* the Linux `EEXIST` the number looks like) even when
/// both paths sit in one directory. Retrying through `wsl.exe` keeps the
/// operation on the Linux side of the share, where it is an ordinary atomic
/// `rename(2)`.
///
/// The local attempt comes first so a WSL workspace rooted under `/mnt/<drive>`
/// — which `wsl_path_to_host` maps to a native Windows path — still takes the
/// fast in-process path, and so a stopped distro can't break a rename that
/// would otherwise have succeeded.
#[cfg(windows)]
fn rename_path(
    workspace: &WorkspaceEnv,
    from: &str,
    to: &str,
    from_p: &std::path::Path,
    to_p: &std::path::Path,
) -> Result<(), String> {
    let local_err = match rename_local(from_p, to_p) {
        Ok(()) => return Ok(()),
        Err(e) => e,
    };
    let WorkspaceEnv::Wsl { distro } = workspace else {
        return Err(local_err);
    };
    // `from`/`to` are the caller's Linux paths, which is what `mv` needs. The
    // caller already rejected an existing target, so a plain `mv` is enough —
    // `-T` would be more precise but is not in busybox `mv` (Alpine distros).
    crate::modules::workspace::wsl_exec_capture(distro, "mv", &["--", from, to])
        .map(|_| ())
        .map_err(|e| {
            log::debug!("fs_rename via wsl.exe ({from} -> {to}) failed: {e}");
            e
        })
}

#[cfg(not(windows))]
fn rename_path(
    _workspace: &WorkspaceEnv,
    _from: &str,
    _to: &str,
    from_p: &std::path::Path,
    to_p: &std::path::Path,
) -> Result<(), String> {
    rename_local(from_p, to_p)
}

/// Deletes a file or directory (recursively for dirs). Callers are
/// responsible for confirming destructive operations with the user.
#[tauri::command]
pub async fn fs_delete(path: String, workspace: Option<WorkspaceEnv>) -> Result<(), String> {
    heavy(move || {
        let workspace = WorkspaceEnv::from_option(workspace);
        let p = resolve_path(&path, &workspace);
        let meta = std::fs::symlink_metadata(&p).map_err(|e| {
            log::debug!("fs_delete stat({}) failed: {e}", p.display());
            e.to_string()
        })?;

        let result = if meta.is_dir() {
            std::fs::remove_dir_all(&p)
        } else {
            std::fs::remove_file(&p)
        };

        result.map_err(|e| {
            log::warn!("fs_delete({}) failed: {e}", p.display());
            e.to_string()
        })
    })
    .await
}
