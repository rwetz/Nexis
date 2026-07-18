// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

//! Editor autosave / crash recovery. While a buffer is dirty, the frontend
//! writes debounced snapshots here; on the next open of the same file, a
//! snapshot whose content differs from disk is offered for recovery. Files
//! live under `~/.cache/nexis/editor-autosave/<fnv1a64(path)>.json` and are
//! written atomically (tmp + rename). The JSON body stores the original path
//! so a hash collision can never hand back another file's content.

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

/// Buffers beyond this aren't autosaved — matches the editor's large-file
/// tier, where a crash losing edits is preferable to grinding the disk with
/// multi-MiB writes at typing cadence.
const MAX_AUTOSAVE_BYTES: usize = 4 * 1024 * 1024;

#[derive(Serialize, Deserialize)]
struct AutosaveFile {
    path: String,
    content: String,
    /// Unix seconds at write time; used by the age sweep.
    saved_at: u64,
}

fn autosave_dir() -> Result<PathBuf, String> {
    let home = dirs::home_dir().ok_or_else(|| "could not resolve home dir".to_string())?;
    let dir = home.join(".cache").join("nexis").join("editor-autosave");
    fs::create_dir_all(&dir).map_err(|e| format!("create {}: {e}", dir.display()))?;
    Ok(dir)
}

/// FNV-1a 64. Deterministic across runs and platforms (unlike
/// `DefaultHasher`, whose output may change between Rust releases — a
/// recovery file must still be findable after an app upgrade).
fn fnv1a64(s: &str) -> u64 {
    let mut hash: u64 = 0xcbf2_9ce4_8422_2325;
    for b in s.as_bytes() {
        hash ^= u64::from(*b);
        hash = hash.wrapping_mul(0x0000_0100_0000_01b3);
    }
    hash
}

fn file_for(dir: &Path, path: &str) -> PathBuf {
    dir.join(format!("{:016x}.json", fnv1a64(path)))
}

fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

fn write_in(dir: &Path, path: &str, content: &str) -> Result<(), String> {
    if content.len() > MAX_AUTOSAVE_BYTES {
        return Err(format!("autosave too large: {} bytes", content.len()));
    }
    let record = AutosaveFile {
        path: path.to_string(),
        content: content.to_string(),
        saved_at: now_secs(),
    };
    let body = serde_json::to_string(&record).map_err(|e| e.to_string())?;
    let target = file_for(dir, path);
    let tmp = target.with_extension("json.tmp");
    fs::write(&tmp, body).map_err(|e| format!("write {}: {e}", tmp.display()))?;
    fs::rename(&tmp, &target).map_err(|e| {
        let _ = fs::remove_file(&tmp);
        format!("rename {}: {e}", target.display())
    })
}

fn read_in(dir: &Path, path: &str) -> Result<Option<String>, String> {
    let target = file_for(dir, path);
    let body = match fs::read_to_string(&target) {
        Ok(b) => b,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(e) => return Err(format!("read autosave: {e}")),
    };
    let Ok(record) = serde_json::from_str::<AutosaveFile>(&body) else {
        // Corrupt (e.g. crash predating the atomic write) — drop it.
        let _ = fs::remove_file(&target);
        return Ok(None);
    };
    // Collision guard: only ever hand back content recorded for this path.
    if record.path != path {
        return Ok(None);
    }
    Ok(Some(record.content))
}

fn delete_in(dir: &Path, path: &str) -> Result<(), String> {
    match fs::remove_file(file_for(dir, path)) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(format!("delete autosave: {e}")),
    }
}

/// Remove autosaves older than `max_age_secs` (and stray tmp files). Runs
/// once per app launch so abandoned recoveries don't accumulate forever.
fn sweep_in(dir: &Path, max_age_secs: u64) -> Result<(), String> {
    let cutoff = now_secs().saturating_sub(max_age_secs);
    let entries = fs::read_dir(dir).map_err(|e| format!("read {}: {e}", dir.display()))?;
    for entry in entries.flatten() {
        let path = entry.path();
        let name = entry.file_name();
        let Some(name) = name.to_str() else { continue };
        if name.ends_with(".json.tmp") {
            let _ = fs::remove_file(&path);
            continue;
        }
        if !name.ends_with(".json") {
            continue;
        }
        let stale = match fs::read_to_string(&path) {
            Ok(body) => match serde_json::from_str::<AutosaveFile>(&body) {
                Ok(record) => record.saved_at < cutoff,
                Err(_) => true, // corrupt
            },
            Err(_) => false,
        };
        if stale {
            let _ = fs::remove_file(&path);
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn editor_autosave_write(path: String, content: String) -> Result<(), String> {
    crate::modules::heavy(move || write_in(&autosave_dir()?, &path, &content)).await
}

#[tauri::command]
pub async fn editor_autosave_read(path: String) -> Result<Option<String>, String> {
    crate::modules::heavy(move || read_in(&autosave_dir()?, &path)).await
}

#[tauri::command]
pub async fn editor_autosave_delete(path: String) -> Result<(), String> {
    crate::modules::heavy(move || delete_in(&autosave_dir()?, &path)).await
}

#[tauri::command]
pub async fn editor_autosave_sweep(max_age_secs: u64) -> Result<(), String> {
    crate::modules::heavy(move || sweep_in(&autosave_dir()?, max_age_secs)).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fnv_is_stable() {
        // Pinned values: these must never change across releases, or existing
        // recovery files become unfindable after an upgrade.
        assert_eq!(fnv1a64(""), 0xcbf2_9ce4_8422_2325);
        assert_eq!(fnv1a64("/home/me/notes.md"), fnv1a64("/home/me/notes.md"));
        assert_ne!(fnv1a64("/a"), fnv1a64("/b"));
    }

    #[test]
    fn roundtrip_and_delete() {
        let dir = tempfile::tempdir().expect("tempdir");
        let p = "/home/me/project/main.rs";
        assert_eq!(read_in(dir.path(), p).expect("read"), None);
        write_in(dir.path(), p, "fn main() {}").expect("write");
        assert_eq!(
            read_in(dir.path(), p).expect("read").as_deref(),
            Some("fn main() {}")
        );
        delete_in(dir.path(), p).expect("delete");
        assert_eq!(read_in(dir.path(), p).expect("read"), None);
        delete_in(dir.path(), p).expect("delete again");
    }

    #[test]
    fn collision_guard_rejects_other_paths() {
        let dir = tempfile::tempdir().expect("tempdir");
        let p = "/home/me/a.txt";
        write_in(dir.path(), p, "content-a").expect("write");
        // Forge a colliding filename by rewriting the stored record with a
        // different path claim — read for the original path must refuse it.
        let file = file_for(dir.path(), p);
        let forged = serde_json::to_string(&AutosaveFile {
            path: "/somewhere/else.txt".into(),
            content: "not yours".into(),
            saved_at: now_secs(),
        })
        .expect("json");
        fs::write(&file, forged).expect("forge");
        assert_eq!(read_in(dir.path(), p).expect("read"), None);
    }

    #[test]
    fn oversized_rejected() {
        let dir = tempfile::tempdir().expect("tempdir");
        let big = "x".repeat(MAX_AUTOSAVE_BYTES + 1);
        assert!(write_in(dir.path(), "/big", &big).is_err());
    }

    #[test]
    fn sweep_removes_stale_and_corrupt() {
        let dir = tempfile::tempdir().expect("tempdir");
        write_in(dir.path(), "/fresh", "new").expect("write");
        // Stale record: saved_at far in the past.
        let old = serde_json::to_string(&AutosaveFile {
            path: "/old".into(),
            content: "old".into(),
            saved_at: 1000,
        })
        .expect("json");
        fs::write(file_for(dir.path(), "/old"), old).expect("stale");
        fs::write(dir.path().join("corrupt.json"), "{not json").expect("corrupt");
        fs::write(dir.path().join("left.json.tmp"), "tmp").expect("tmp");
        sweep_in(dir.path(), 7 * 24 * 3600).expect("sweep");
        assert!(read_in(dir.path(), "/fresh").expect("read").is_some());
        assert_eq!(read_in(dir.path(), "/old").expect("read"), None);
        assert!(!dir.path().join("corrupt.json").exists());
        assert!(!dir.path().join("left.json.tmp").exists());
    }
}
