// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

//! Append-only audit log of every shell command the AI agent runs (or is
//! blocked from running). One JSON object per line, appended to
//! `{data}/nexis/ai-command-audit.log` — the data dir, not cache, because
//! this is a record the user may want to review long after the fact. The
//! file is never rewritten or truncated by the app; rotation is the user's
//! call (it grows ~200 bytes per agent command).

use std::fs::OpenOptions;
use std::io::Write;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

/// A single audit entry is capped so a pathological command line can't bloat
/// the log; anything longer is truncated with a marker.
const MAX_ENTRY_BYTES: usize = 8 * 1024;

fn audit_path() -> Result<PathBuf, String> {
    let data = dirs::data_dir().ok_or_else(|| "could not resolve data dir".to_string())?;
    let dir = data.join("nexis");
    std::fs::create_dir_all(&dir).map_err(|e| format!("create {}: {e}", dir.display()))?;
    Ok(dir.join("ai-command-audit.log"))
}

fn append_line(path: &PathBuf, entry: &serde_json::Value) -> Result<(), String> {
    let mut line = serde_json::json!({
        "ts": SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0),
    });
    if let (Some(obj), Some(extra)) = (line.as_object_mut(), entry.as_object()) {
        for (k, v) in extra {
            obj.insert(k.clone(), v.clone());
        }
    }
    let mut body = serde_json::to_string(&line).map_err(|e| e.to_string())?;
    if body.len() > MAX_ENTRY_BYTES {
        body.truncate(MAX_ENTRY_BYTES);
        body.push_str("…[truncated]");
    }
    body.push('\n');
    let mut f = OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .map_err(|e| format!("open {}: {e}", path.display()))?;
    f.write_all(body.as_bytes())
        .map_err(|e| format!("append audit: {e}"))
}

/// Append one audit entry. The frontend passes a JSON object (kind, command,
/// cwd, exit_code, …); a `ts` unix-seconds field is stamped server-side so
/// entries are ordered even if webview clocks drift.
#[tauri::command]
pub async fn ai_audit_append(entry: serde_json::Value) -> Result<(), String> {
    crate::modules::heavy(move || append_line(&audit_path()?, &entry)).await
}

/// Absolute path of the audit log, for the settings row's reveal button.
/// Creates the parent dir (not the file) so reveal works before first use.
#[tauri::command]
pub async fn ai_audit_log_path() -> Result<String, String> {
    crate::modules::heavy(move || Ok(audit_path()?.to_string_lossy().into_owned())).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn appends_json_lines_with_timestamp() {
        let dir = tempfile::tempdir().expect("tempdir");
        let path = dir.path().join("audit.log");
        append_line(&path, &serde_json::json!({"kind": "run", "command": "ls"})).expect("append");
        append_line(
            &path,
            &serde_json::json!({"kind": "blocked", "command": "rm -rf /"}),
        )
        .expect("append 2");
        let body = std::fs::read_to_string(&path).expect("read");
        let lines: Vec<&str> = body.lines().collect();
        assert_eq!(lines.len(), 2);
        for line in &lines {
            let v: serde_json::Value = serde_json::from_str(line).expect("valid json line");
            assert!(v.get("ts").and_then(|t| t.as_u64()).is_some());
        }
        assert!(lines[0].contains("\"kind\":\"run\""));
        assert!(lines[1].contains("blocked"));
        // Append-only: the first line is still intact after the second write.
        assert!(lines[0].contains("\"command\":\"ls\""));
    }

    #[test]
    fn oversized_entries_are_truncated_not_refused() {
        let dir = tempfile::tempdir().expect("tempdir");
        let path = dir.path().join("audit.log");
        let huge = "x".repeat(MAX_ENTRY_BYTES * 2);
        append_line(&path, &serde_json::json!({"command": huge})).expect("append");
        let body = std::fs::read_to_string(&path).expect("read");
        assert!(body.len() < MAX_ENTRY_BYTES + 64);
        assert!(body.contains("[truncated]"));
    }
}
