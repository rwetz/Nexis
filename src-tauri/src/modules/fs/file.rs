// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

use std::io::Write;
use std::path::Path;
use std::time::UNIX_EPOCH;

use serde::Serialize;
use tauri::Emitter;
use tempfile::NamedTempFile;

use crate::modules::workspace::{resolve_path, WorkspaceEnv};

// ─── AI agent path-safety checks ─────────────────────────────────────────────
//
// Mirrors `src/modules/ai/lib/security.ts` so the AI file-read tool can
// canonicalize AND check safety in a single IPC call instead of two.

/// Sensitive basename patterns that the AI agent must never read.
const SECRET_BASENAME_PREFIXES: &[&str] = &[
    ".env",
    ".netrc",
    "_netrc",
    ".pgpass",
    ".npmrc",
    ".pypirc",
    ".htpasswd",
    "htpasswd",
    ".known_hosts",
    "known_hosts",
    "authorized_keys",
    ".authorized_keys",
    "credentials",
];

/// Basename suffix/contains patterns checked case-insensitively.
const SECRET_BASENAME_CONTAINS: &[&str] = &[
    ".pem",
    ".key",
    ".p12",
    ".pfx",
    ".asc",
    ".gpg",
    ".keystore",
    ".jks",
];

const SECRET_BASENAME_STARTSWITH: &[&str] = &["id_rsa", "id_dsa", "id_ecdsa", "id_ed25519"];

const SECRET_BASENAME_STARTSWITH_EXT: &[&str] = &[
    "secrets.json",
    "secrets.yaml",
    "secrets.yml",
    "secrets.toml",
    "secrets.env",
    "service-account",
    "service_account",
];

/// Protected directory path segments (matched as subpath, not raw substring).
const PROTECTED_DIRS: &[&str] = &[
    "/.ssh",
    "/.gnupg",
    "/.aws",
    "/.azure",
    "/.kube",
    "/.docker",
    "/.config/gh",
    "/.config/git",
    "/.config/gcloud",
    "/.config/op",
    "/.git",
    "/.terraform.d",
    "/library/keychains",
    "/library/cookies",
    "/etc",
    "/private/etc",
    "/proc",
    "/sys",
    "/var/db",
    "/var/root",
    "/private/var/db",
    "/private/var/root",
    "/appdata/roaming/microsoft/credentials",
    "/appdata/local/microsoft/credentials",
    "/appdata/roaming/gcloud",
];

fn strip_drive(s: &str) -> &str {
    // Strip leading `C:` (or any single drive letter).
    if s.len() >= 2 && s.as_bytes()[1] == b':' {
        return &s[2..];
    }
    s
}

fn check_ai_path(path: &Path) -> Result<(), String> {
    let raw = path.to_string_lossy();
    // Normalise to forward-slash + lowercase for pattern matching only.
    let norm: String = raw.replace('\\', "/").to_lowercase();
    let cmp = strip_drive(&norm);

    // Basename checks.
    let base: String = path
        .file_name()
        .map(|n| n.to_string_lossy().to_lowercase())
        .unwrap_or_default();

    // Exact / prefix matches for well-known secret filenames.
    for &pfx in SECRET_BASENAME_PREFIXES {
        if base == pfx
            || base.starts_with(&format!("{pfx}."))
            || base.starts_with(&format!("{pfx}_"))
        {
            return Err(format!(
                "Refused: \"{base}\" matches a sensitive-file pattern."
            ));
        }
    }
    for &suffix in SECRET_BASENAME_CONTAINS {
        if base.ends_with(suffix) {
            return Err(format!(
                "Refused: \"{base}\" matches a sensitive-file pattern."
            ));
        }
    }
    for &pfx in SECRET_BASENAME_STARTSWITH {
        if base.starts_with(pfx) {
            return Err(format!(
                "Refused: \"{base}\" matches a sensitive-file pattern."
            ));
        }
    }
    for &pfx in SECRET_BASENAME_STARTSWITH_EXT {
        if base.starts_with(pfx) {
            return Err(format!(
                "Refused: \"{base}\" matches a sensitive-file pattern."
            ));
        }
    }

    // Protected-directory checks: a protected dir matches if the comparison
    // path equals it OR has it as a path-segment prefix (i.e., next char is `/`).
    let cmp_slash = format!("{cmp}/");
    for &dir in PROTECTED_DIRS {
        if cmp == dir || cmp_slash.contains(&format!("{dir}/")) {
            let label = dir.trim_start_matches('/');
            return Err(format!(
                "Refused: path is inside a protected directory ({label})."
            ));
        }
    }

    Ok(())
}

const MAX_READ_BYTES: u64 = 10 * 1024 * 1024; // 10 MB
const BINARY_SNIFF_BYTES: usize = 8 * 1024;

#[derive(Serialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum ReadResult {
    Text {
        content: String,
        size: u64,
    },
    Binary {
        size: u64,
    },
    /// File exceeds MAX_READ_BYTES. UI decides whether to offer "open anyway".
    TooLarge {
        size: u64,
        limit: u64,
    },
}

#[derive(Serialize)]
#[serde(rename_all = "lowercase")]
pub enum StatKind {
    File,
    Dir,
    Symlink,
}

#[derive(Serialize)]
pub struct FileStat {
    pub size: u64,
    pub mtime: u64,
    pub kind: StatKind,
}

#[tauri::command]
pub async fn fs_read_file(
    path: String,
    workspace: Option<WorkspaceEnv>,
) -> Result<ReadResult, String> {
    crate::modules::heavy(move || {
        let workspace = WorkspaceEnv::from_option(workspace);
        let p = resolve_path(&path, &workspace);
        let meta = std::fs::metadata(&p).map_err(|e| {
            log::debug!("fs_read_file stat({}) failed: {e}", p.display());
            e.to_string()
        })?;

        let size = meta.len();
        if size > MAX_READ_BYTES {
            return Ok(ReadResult::TooLarge {
                size,
                limit: MAX_READ_BYTES,
            });
        }

        let bytes = std::fs::read(&p).map_err(|e| {
            log::debug!("fs_read_file read({}) failed: {e}", p.display());
            e.to_string()
        })?;

        // Null-byte sniff on the first chunk. Not perfect (misses UTF-16 BOM
        // cases) but catches the common "this is a PNG" mistake cheaply.
        let sniff_len = bytes.len().min(BINARY_SNIFF_BYTES);
        if bytes[..sniff_len].contains(&0) {
            return Ok(ReadResult::Binary { size });
        }

        match String::from_utf8(bytes) {
            Ok(content) => Ok(ReadResult::Text { content, size }),
            Err(_) => Ok(ReadResult::Binary { size }),
        }
    })
    .await
}

#[derive(Serialize, Clone)]
struct FileWrittenEvent {
    path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    source: Option<String>,
}

/// Stages `content` in an O_EXCL tempfile in the target's own parent directory.
/// The random suffix is what blocks pre-staged symlink attacks; keeping the
/// staging file beside the target is what lets the commit be a plain rename.
fn stage_temp(target: &Path, content: &[u8]) -> std::io::Result<NamedTempFile> {
    let parent = target.parent().ok_or_else(|| {
        std::io::Error::new(std::io::ErrorKind::InvalidInput, "path has no parent")
    })?;
    let mut tmp = NamedTempFile::new_in(parent)?;
    tmp.as_file_mut().write_all(content)?;
    tmp.as_file_mut().sync_all()?;
    Ok(tmp)
}

/// Atomic write via staging tempfile + rename. Windows commits through
/// `write_path` instead, which needs the staging file back when the rename
/// fails so it can retry the commit inside the distro.
#[cfg(not(windows))]
fn write_atomic(target: &Path, content: &[u8]) -> std::io::Result<()> {
    stage_temp(target, content)?
        .persist(target)
        .map_err(|e| e.error)?;
    Ok(())
}

/// Linux path of a staging file that lives in `linux_target`'s directory.
///
/// The staging name is generated by `NamedTempFile`, so it is only known after
/// the fact and has to be grafted onto the target's Linux directory — the host
/// side of the path is a `\\wsl.localhost\…` UNC string that means nothing
/// inside the distro. `None` for anything that isn't a POSIX absolute path,
/// which keeps a mislabelled workspace from handing `mv` a Windows path.
#[cfg(windows)]
fn wsl_staging_path(linux_target: &str, staged_host: &Path) -> Option<String> {
    let name = staged_host.file_name()?.to_str()?;
    let normalized = linux_target.replace('\\', "/");
    if !normalized.starts_with('/') {
        return None;
    }
    let (dir, _) = normalized.rsplit_once('/')?;
    Some(format!("{dir}/{name}"))
}

/// Write backend. Committing the staging file is `MoveFileExW` on Windows, and
/// the WSL 9P redirector behind `\\wsl.localhost\<distro>\…` rejects it with
/// ERROR_NOT_SAME_DEVICE (os error 17 — *not* the Linux `EEXIST` the number
/// looks like) even though staging file and target share one directory. Every
/// editor save, AI file write, and theme/notes write of a file inside a WSL
/// distro failed on that rename. Retrying the commit through `wsl.exe` keeps it
/// on the Linux side of the share, where it is an ordinary atomic `rename(2)`.
///
/// Mirrors the `fs_rename` fallback in `mutate.rs`, including its ordering: the
/// in-process attempt runs first so a workspace rooted under `/mnt/<drive>` —
/// which `wsl_path_to_host` maps to a native Windows path — keeps the fast
/// path, and a stopped distro can't break a write that would have succeeded.
#[cfg(windows)]
fn write_path(
    workspace: &WorkspaceEnv,
    path: &str,
    target: &Path,
    content: &[u8],
) -> Result<(), String> {
    let staged = stage_temp(target, content).map_err(|e| e.to_string())?;
    // On failure `PersistError` hands the staging file back still on disk, so
    // the fallback commits the bytes already written rather than staging twice.
    let failed = match staged.persist(target) {
        Ok(_) => return Ok(()),
        Err(e) => e,
    };
    let WorkspaceEnv::Wsl { distro } = workspace else {
        return Err(failed.error.to_string());
    };
    let Some(staged_linux) = wsl_staging_path(path, failed.file.path()) else {
        return Err(failed.error.to_string());
    };
    // `keep` disarms delete-on-drop — `mv` is about to consume the file, and a
    // failed `mv` is cleaned up explicitly below. Dropping the handle first
    // avoids holding an open share handle across the rename.
    let (file, staged_host) = failed.file.keep().map_err(|e| e.error.to_string())?;
    drop(file);
    crate::modules::workspace::wsl_exec_capture(distro, "mv", &["--", staged_linux.as_str(), path])
        .map(|_| ())
        .map_err(|e| {
            let _ = std::fs::remove_file(&staged_host);
            log::debug!("fs_write_file via wsl.exe ({path}) failed: {e}");
            e
        })
}

#[cfg(not(windows))]
fn write_path(
    _workspace: &WorkspaceEnv,
    _path: &str,
    target: &Path,
    content: &[u8],
) -> Result<(), String> {
    write_atomic(target, content).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn fs_write_file(
    path: String,
    content: String,
    workspace: Option<WorkspaceEnv>,
    source: Option<String>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    crate::modules::heavy(move || {
        let workspace = WorkspaceEnv::from_option(workspace);
        let target = resolve_path(&path, &workspace);

        write_path(&workspace, &path, &target, content.as_bytes()).map_err(|e| {
            log::warn!("fs_write_file({}) failed: {e}", target.display());
            e
        })?;

        let _ = app.emit(
            "fs:file-written",
            FileWrittenEvent {
                path: path.clone(),
                source,
            },
        );

        Ok(())
    })
    .await
}

#[tauri::command]
pub async fn fs_canonicalize(
    path: String,
    workspace: Option<WorkspaceEnv>,
) -> Result<String, String> {
    crate::modules::heavy(move || {
        let workspace = WorkspaceEnv::from_option(workspace);
        let p = resolve_path(&path, &workspace);
        let canon = std::fs::canonicalize(&p).map_err(|e| e.to_string())?;
        // Strip the Windows `\\?\` extended-length prefix so the frontend's
        // path comparator sees the same form regardless of OS.
        let s = canon.to_string_lossy().to_string();
        let s = s.strip_prefix(r"\\?\").unwrap_or(&s).to_string();
        Ok(s.replace('\\', "/"))
    })
    .await
}

#[tauri::command]
pub async fn fs_stat(path: String, workspace: Option<WorkspaceEnv>) -> Result<FileStat, String> {
    crate::modules::heavy(move || {
        let workspace = WorkspaceEnv::from_option(workspace);
        let p = resolve_path(&path, &workspace);
        let meta = std::fs::metadata(&p).map_err(|e| e.to_string())?;
        // `metadata()` follows symlinks, so its file_type() can never report one;
        // only `symlink_metadata()` sees the link itself. Dir stays first so a
        // symlink-to-dir keeps reporting "dir" (callers use kind == "dir" checks).
        let kind = if meta.is_dir() {
            StatKind::Dir
        } else if std::fs::symlink_metadata(&p)
            .map(|m| m.file_type().is_symlink())
            .unwrap_or(false)
        {
            StatKind::Symlink
        } else {
            StatKind::File
        };
        let mtime = meta
            .modified()
            .ok()
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);
        Ok(FileStat {
            size: meta.len(),
            mtime,
            kind,
        })
    })
    .await
}

/// Result type for AI agent file reads — includes the canonical path so the
/// caller can update its cache without a separate `fs_canonicalize` call.
#[derive(Serialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum ReadAiResult {
    Text {
        canonical: String,
        content: String,
        size: u64,
    },
    Binary {
        canonical: String,
        size: u64,
    },
    TooLarge {
        canonical: String,
        size: u64,
        limit: u64,
    },
    /// Path exists but is outside the workspace or fails a safety check.
    Refused {
        reason: String,
    },
}

/// Combined canonicalize + AI safety check + read in a single IPC call.
///
/// Replaces the two-step `fs_canonicalize` → `fs_read_file` pattern used by
/// the AI `read_file` tool, halving the number of IPC round-trips per agent
/// file access.
///
/// Safety checks are intentionally conservative: when a path does not exist
/// yet (`canonicalize` fails) the command propagates the OS error rather than
/// returning `Refused`, so the caller can surface a meaningful ENOENT to the
/// model.
#[tauri::command]
pub async fn fs_read_file_ai(
    path: String,
    workspace: Option<WorkspaceEnv>,
) -> Result<ReadAiResult, String> {
    crate::modules::heavy(move || {
        let workspace = WorkspaceEnv::from_option(workspace);
        let p = resolve_path(&path, &workspace);

        // Phase 1: safety check on the raw (user-visible) path.
        if let Err(reason) = check_ai_path(&p) {
            return Ok(ReadAiResult::Refused { reason });
        }

        // Phase 2: canonicalize — resolves symlinks, drive-letter case, etc.
        let canon = match std::fs::canonicalize(&p) {
            Ok(c) => c,
            // Not found or permission error — surface as an OS error so the model
            // can see a real ENOENT rather than a misleading "Refused".
            Err(e) => return Err(e.to_string()),
        };

        // Phase 3: re-check the canonical path to defeat symlink traversal.
        if let Err(reason) = check_ai_path(&canon) {
            return Ok(ReadAiResult::Refused { reason });
        }

        let canonical = {
            let s = canon.to_string_lossy().to_string();
            let s = s.strip_prefix(r"\\?\").unwrap_or(&s).to_string();
            s.replace('\\', "/")
        };

        // Phase 4: read the file (same logic as fs_read_file).
        let meta = std::fs::metadata(&canon).map_err(|e| e.to_string())?;
        let size = meta.len();
        if size > MAX_READ_BYTES {
            return Ok(ReadAiResult::TooLarge {
                canonical,
                size,
                limit: MAX_READ_BYTES,
            });
        }

        let bytes = std::fs::read(&canon).map_err(|e| e.to_string())?;
        let sniff_len = bytes.len().min(BINARY_SNIFF_BYTES);
        if bytes[..sniff_len].contains(&0) {
            return Ok(ReadAiResult::Binary { canonical, size });
        }

        match String::from_utf8(bytes) {
            Ok(content) => Ok(ReadAiResult::Text {
                canonical,
                content,
                size,
            }),
            Err(_) => Ok(ReadAiResult::Binary { canonical, size }),
        }
    })
    .await
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;
    use std::os::unix::fs::symlink;

    #[test]
    fn overwrites_existing_target() {
        let dir = tempfile::tempdir().unwrap();
        let target = dir.path().join("note.txt");
        std::fs::write(&target, b"old").unwrap();
        write_atomic(&target, b"new").unwrap();
        assert_eq!(std::fs::read(&target).unwrap(), b"new");
    }

    #[test]
    fn does_not_follow_legacy_staging_symlink() {
        let dir = tempfile::tempdir().unwrap();
        let outside = dir.path().join("outside.txt");
        std::fs::write(&outside, b"untouched").unwrap();

        let target = dir.path().join("note.txt");
        // Pre-stage a symlink at the legacy deterministic staging path.
        let legacy = dir.path().join(".note.txt.nexis.tmp");
        symlink(&outside, &legacy).unwrap();

        write_atomic(&target, b"payload").unwrap();

        assert_eq!(std::fs::read(&target).unwrap(), b"payload");
        // The pre-staged symlink target must not have been written through.
        assert_eq!(std::fs::read(&outside).unwrap(), b"untouched");
    }
}

#[cfg(all(test, windows))]
mod wsl_tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn grafts_staging_name_onto_the_targets_linux_dir() {
        let staged = PathBuf::from(r"\\wsl.localhost\Ubuntu\home\me\proj\.tmpAbC123");
        assert_eq!(
            wsl_staging_path("/home/me/proj/main.rs", &staged).as_deref(),
            Some("/home/me/proj/.tmpAbC123")
        );
    }

    #[test]
    fn handles_a_file_in_the_distro_root() {
        let staged = PathBuf::from(r"\\wsl.localhost\Ubuntu\.tmpXyz");
        assert_eq!(
            wsl_staging_path("/notes.txt", &staged).as_deref(),
            Some("/.tmpXyz")
        );
    }

    #[test]
    fn rejects_a_windows_target_path() {
        // A workspace mislabelled as WSL must not hand `mv` a drive path.
        let staged = PathBuf::from(r"C:\proj\.tmpXyz");
        assert_eq!(wsl_staging_path(r"C:\proj\main.rs", &staged), None);
        assert_eq!(wsl_staging_path("relative.txt", &staged), None);
    }
}
