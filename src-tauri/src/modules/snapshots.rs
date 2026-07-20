// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

//! Per-session scrollback snapshots for "restore scrollback on relaunch"
//! (persistent-sessions Milestone A). Files live under
//! `~/.cache/nexis/session-snapshots/<id>.snap`, keyed by the stable
//! snapshot id each terminal tab carries in its persisted state. Writes are
//! atomic (tmp + rename) so a crash mid-write never leaves a half snapshot
//! for the next launch to replay.

// Panic-lint gate: no `.unwrap()`/`.expect()` in production code here.
// Tests may still panic (allow-*-in-tests in clippy.toml). CI's
// `clippy -- -D warnings` turns a new one into a build failure.
#![warn(clippy::unwrap_used, clippy::expect_used)]

use std::fs;
use std::path::{Path, PathBuf};

/// The frontend caps serialized scrollback at 4M UTF-16 units before saving;
/// worst-case UTF-8 expansion of that is ~12 MiB. Anything larger indicates a
/// bug — reject rather than let a runaway buffer fill the disk.
const MAX_SNAPSHOT_BYTES: usize = 12 * 1024 * 1024;

fn snapshots_dir() -> Result<PathBuf, String> {
    let home = dirs::home_dir().ok_or_else(|| "could not resolve home dir".to_string())?;
    let dir = home.join(".cache").join("nexis").join("session-snapshots");
    fs::create_dir_all(&dir).map_err(|e| format!("create {}: {e}", dir.display()))?;
    Ok(dir)
}

/// Snapshot ids are frontend-minted UUIDs, but the webview is not a trust
/// boundary we lean on: restricting the charset here makes path traversal
/// impossible regardless of what arrives over IPC.
fn validate_id(id: &str) -> Result<(), String> {
    let ok = !id.is_empty()
        && id.len() <= 64
        && id.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-');
    if ok {
        Ok(())
    } else {
        Err("invalid snapshot id".to_string())
    }
}

fn snapshot_path(dir: &Path, id: &str) -> PathBuf {
    dir.join(format!("{id}.snap"))
}

fn save_in(dir: &Path, id: &str, data: &str) -> Result<(), String> {
    validate_id(id)?;
    if data.len() > MAX_SNAPSHOT_BYTES {
        return Err(format!("snapshot too large: {} bytes", data.len()));
    }
    let path = snapshot_path(dir, id);
    let tmp = dir.join(format!("{id}.snap.tmp"));
    fs::write(&tmp, data).map_err(|e| format!("write {}: {e}", tmp.display()))?;
    fs::rename(&tmp, &path).map_err(|e| {
        let _ = fs::remove_file(&tmp);
        format!("rename {}: {e}", path.display())
    })
}

fn load_in(dir: &Path, id: &str) -> Result<Option<String>, String> {
    validate_id(id)?;
    match fs::read_to_string(snapshot_path(dir, id)) {
        Ok(s) => Ok(Some(s)),
        // Missing file is the common "nothing to restore" case, not an error.
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(format!("read snapshot {id}: {e}")),
    }
}

fn delete_in(dir: &Path, id: &str) -> Result<(), String> {
    validate_id(id)?;
    match fs::remove_file(snapshot_path(dir, id)) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(format!("delete snapshot {id}: {e}")),
    }
}

/// Delete every `.snap` (and stray `.snap.tmp`) not in `keep`. Runs on every
/// clean exit with the ids of the tabs that were just saved, so files for
/// closed tabs — or all files, when the restore setting is off — never
/// accumulate.
fn gc_in(dir: &Path, keep: &[String]) -> Result<(), String> {
    let entries = fs::read_dir(dir).map_err(|e| format!("read {}: {e}", dir.display()))?;
    for entry in entries.flatten() {
        let path = entry.path();
        let name = entry.file_name();
        let Some(name) = name.to_str() else { continue };
        let stem = if let Some(s) = name.strip_suffix(".snap.tmp") {
            s
        } else if let Some(s) = name.strip_suffix(".snap") {
            s
        } else {
            continue;
        };
        if !keep.iter().any(|k| k == stem) {
            let _ = fs::remove_file(&path);
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn session_snapshot_save(id: String, data: String) -> Result<(), String> {
    crate::modules::heavy(move || save_in(&snapshots_dir()?, &id, &data)).await
}

#[tauri::command]
pub async fn session_snapshot_load(id: String) -> Result<Option<String>, String> {
    crate::modules::heavy(move || load_in(&snapshots_dir()?, &id)).await
}

#[tauri::command]
pub async fn session_snapshot_delete(id: String) -> Result<(), String> {
    crate::modules::heavy(move || delete_in(&snapshots_dir()?, &id)).await
}

#[tauri::command]
pub async fn session_snapshot_gc(keep: Vec<String>) -> Result<(), String> {
    crate::modules::heavy(move || gc_in(&snapshots_dir()?, &keep)).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn id_validation_blocks_traversal() {
        assert!(validate_id("0b0e58f1-9c1a-4a3e-8f52-1c2d3e4f5a6b").is_ok());
        assert!(validate_id("simple-id-42").is_ok());
        assert!(validate_id("").is_err());
        assert!(validate_id("../evil").is_err());
        assert!(validate_id("a/b").is_err());
        assert!(validate_id("a\\b").is_err());
        assert!(validate_id("a.snap").is_err());
        assert!(validate_id(&"x".repeat(65)).is_err());
    }

    #[test]
    fn save_load_delete_roundtrip() {
        let dir = tempfile::tempdir().expect("tempdir");
        let id = "roundtrip-1";
        assert_eq!(load_in(dir.path(), id).expect("load"), None);
        save_in(dir.path(), id, "hello \x1b[31mworld\x1b[0m").expect("save");
        assert_eq!(
            load_in(dir.path(), id).expect("load").as_deref(),
            Some("hello \x1b[31mworld\x1b[0m")
        );
        // Overwrite goes through the same atomic path.
        save_in(dir.path(), id, "second").expect("save2");
        assert_eq!(
            load_in(dir.path(), id).expect("load").as_deref(),
            Some("second")
        );
        delete_in(dir.path(), id).expect("delete");
        assert_eq!(load_in(dir.path(), id).expect("load"), None);
        // Deleting a missing snapshot is not an error.
        delete_in(dir.path(), id).expect("delete again");
        // No .tmp leftovers.
        assert_eq!(fs::read_dir(dir.path()).unwrap().count(), 0);
    }

    #[test]
    fn save_rejects_oversized() {
        let dir = tempfile::tempdir().expect("tempdir");
        let big = "x".repeat(MAX_SNAPSHOT_BYTES + 1);
        assert!(save_in(dir.path(), "big", &big).is_err());
        assert_eq!(fs::read_dir(dir.path()).unwrap().count(), 0);
    }

    #[test]
    fn gc_keeps_only_listed_ids() {
        let dir = tempfile::tempdir().expect("tempdir");
        save_in(dir.path(), "keep-me", "a").expect("save");
        save_in(dir.path(), "drop-me", "b").expect("save");
        fs::write(dir.path().join("stray.snap.tmp"), "c").expect("stray");
        fs::write(dir.path().join("unrelated.txt"), "d").expect("unrelated");
        gc_in(dir.path(), &["keep-me".to_string()]).expect("gc");
        assert!(load_in(dir.path(), "keep-me").expect("load").is_some());
        assert!(load_in(dir.path(), "drop-me").expect("load").is_none());
        assert!(!dir.path().join("stray.snap.tmp").exists());
        // Non-snapshot files are left alone.
        assert!(dir.path().join("unrelated.txt").exists());
    }
}
