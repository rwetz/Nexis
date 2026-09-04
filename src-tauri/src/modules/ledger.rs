// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

//! The command ledger's store: an append-only NDJSON log plus separate output
//! blobs, one directory per workspace.
//!
//! Implements the decision record at `docs/vault/decisions/command-ledger.md`.
//! Read it before changing anything here — several shapes that look arbitrary
//! are load-bearing, and the record says why. The short version:
//!
//! - **Two stores, split by deletion cost, not by speed.** Metadata is small
//!   and worth keeping; output is large and cheap to lose. Inlining output
//!   would make per-entry deletion a rewrite of everything and would make one
//!   byte cap evict both.
//! - **No SQLite.** There is no in-process database in this repo, and every
//!   gated feature except the output archive is a filter or an aggregate over
//!   ~200-byte records. A scan is milliseconds.
//! - **"Forget" compacts; it never tombstones.** A tombstoned secret is still
//!   on disk until a compaction nobody can promise ran. If the contract says
//!   forget, the bytes go now.
//! - **The store lives in host app-data, never in the workspace tree.** That
//!   keeps it out of git's way and off the WSL 9P share, where every rename
//!   would need pitfall #17's `wsl.exe --exec mv` fallback.
//!
//! Redaction and the private-terminal exclusion are deliberately **not** here.
//! They happen frontend-side before the IPC call, because `redactSensitive()`
//! is TypeScript with no Rust counterpart and two copies of a security-critical
//! pattern list drift. Tripwires in `src/lib/pitfall-guards.test.ts` enforce
//! that; this module must never become the place that "also" redacts, because
//! a second implementation is how the first one stops being maintained.

// Panic-lint gate: no `.unwrap()`/`.expect()` in production code here. This
// module writes durable user data and runs on a Tauri worker thread.
#![warn(clippy::unwrap_used, clippy::expect_used)]

use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

/// One metadata record is ~200 bytes. A line far beyond that is a bug or an
/// attempt to use the log as a blob store, which is what the blobs are for.
const MAX_RECORD_BYTES: usize = 64 * 1024;

/// Output blobs are capped per file as well as in aggregate: a single runaway
/// command should not consume the whole workspace budget in one go.
const MAX_BLOB_BYTES: usize = 8 * 1024 * 1024;

const LOG_FILE: &str = "log.ndjson";
const BLOBS_DIR: &str = "blobs";

fn ledger_root() -> Result<PathBuf, String> {
    let home = dirs::home_dir().ok_or_else(|| "could not resolve home dir".to_string())?;
    Ok(home.join(".cache").join("nexis").join("command-ledger"))
}

/// Ids arrive from the webview, which is not a trust boundary this leans on.
/// Restricting the charset makes path traversal impossible regardless of what
/// is sent — the same guard, and the same reasoning, as `snapshots.rs`.
fn validate_id(id: &str) -> Result<(), String> {
    let ok = !id.is_empty()
        && id.len() <= 64
        && id.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-');
    if ok {
        Ok(())
    } else {
        Err("invalid ledger id".to_string())
    }
}

fn workspace_dir(workspace_id: &str) -> Result<PathBuf, String> {
    validate_id(workspace_id)?;
    let dir = ledger_root()?.join(workspace_id);
    fs::create_dir_all(&dir).map_err(|e| format!("create {}: {e}", dir.display()))?;
    Ok(dir)
}

fn blobs_dir(workspace_id: &str) -> Result<PathBuf, String> {
    let dir = workspace_dir(workspace_id)?.join(BLOBS_DIR);
    fs::create_dir_all(&dir).map_err(|e| format!("create {}: {e}", dir.display()))?;
    Ok(dir)
}

/// Append one already-redacted NDJSON record.
///
/// The record arrives as a JSON string rather than a typed struct on purpose:
/// the frontend owns the schema, and every field it writes has already been
/// through `redactSensitive`. Parsing and re-serializing here would create a
/// second definition of the record shape that could disagree with the first.
///
/// What *is* checked is that the line is a single line of plausible JSON — an
/// embedded newline would silently split one record into two, and the reader
/// treats each line as a record.
fn append_in(dir: &Path, record: &str) -> Result<(), String> {
    let trimmed = record.trim();
    if trimmed.len() > MAX_RECORD_BYTES {
        return Err(format!("ledger record too large: {} bytes", trimmed.len()));
    }
    if !trimmed.starts_with('{') || !trimmed.ends_with('}') {
        return Err("ledger record must be a JSON object".to_string());
    }
    if trimmed.contains('\n') || trimmed.contains('\r') {
        return Err("ledger record must be a single line".to_string());
    }

    let path = dir.join(LOG_FILE);
    let mut file = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .map_err(|e| format!("open {}: {e}", path.display()))?;
    // One write call per record: `append` on a single line under the pipe-buffer
    // size is atomic enough that two windows cannot interleave a half-line.
    writeln!(file, "{trimmed}").map_err(|e| format!("write {}: {e}", path.display()))
}

fn read_log(dir: &Path) -> Result<Vec<String>, String> {
    let path = dir.join(LOG_FILE);
    match fs::read_to_string(&path) {
        Ok(text) => Ok(text
            .lines()
            .map(str::trim)
            .filter(|l| !l.is_empty())
            .map(str::to_string)
            .collect()),
        // No log yet is the ordinary empty case, not an error.
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(Vec::new()),
        Err(e) => Err(format!("read {}: {e}", path.display())),
    }
}

/// Rewrite the log atomically. Used by every compaction path.
fn write_log(dir: &Path, lines: &[String]) -> Result<(), String> {
    let path = dir.join(LOG_FILE);
    let tmp = dir.join(format!("{LOG_FILE}.tmp"));
    let mut body = lines.join("\n");
    if !body.is_empty() {
        body.push('\n');
    }
    fs::write(&tmp, body).map_err(|e| format!("write {}: {e}", tmp.display()))?;
    fs::rename(&tmp, &path).map_err(|e| {
        let _ = fs::remove_file(&tmp);
        format!("rename {}: {e}", path.display())
    })
}

/// Whether an NDJSON line carries `"id":"<id>"`.
///
/// A substring test rather than a parse, and the quoting is what makes it
/// sound: ids are charset-restricted to alphanumerics and hyphens, so the
/// needle cannot appear inside another string value by accident, and a record
/// that happened to contain the text elsewhere would still need the exact
/// `"id":"…"` framing.
fn line_has_id(line: &str, id: &str) -> bool {
    line.contains(&format!("\"id\":\"{id}\""))
}

/// Extract `"outputId":"…"`, so forgetting an entry also unlinks its blob.
fn line_output_id(line: &str) -> Option<String> {
    let key = "\"outputId\":\"";
    let start = line.find(key)? + key.len();
    let rest = &line[start..];
    let end = rest.find('"')?;
    let id = &rest[..end];
    validate_id(id).ok().map(|()| id.to_string())
}

// ── Commands ────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn ledger_append(workspace_id: String, record: String) -> Result<(), String> {
    crate::modules::heavy(move || {
        let dir = workspace_dir(&workspace_id)?;
        append_in(&dir, &record)
    })
    .await
}

#[tauri::command]
pub async fn ledger_write_output(
    workspace_id: String,
    output_id: String,
    content: String,
) -> Result<(), String> {
    crate::modules::heavy(move || {
        validate_id(&output_id)?;
        if content.len() > MAX_BLOB_BYTES {
            return Err(format!("ledger output too large: {} bytes", content.len()));
        }
        let dir = blobs_dir(&workspace_id)?;
        let path = dir.join(&output_id);
        fs::write(&path, content).map_err(|e| format!("write {}: {e}", path.display()))
    })
    .await
}

#[tauri::command]
pub async fn ledger_read_output(
    workspace_id: String,
    output_id: String,
) -> Result<Option<String>, String> {
    crate::modules::heavy(move || {
        validate_id(&output_id)?;
        let path = blobs_dir(&workspace_id)?.join(&output_id);
        match fs::read_to_string(&path) {
            Ok(s) => Ok(Some(s)),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
            Err(e) => Err(format!("read {}: {e}", path.display())),
        }
    })
    .await
}

/// The most recent `limit` records, newest last.
#[tauri::command]
pub async fn ledger_read(workspace_id: String, limit: usize) -> Result<Vec<String>, String> {
    crate::modules::heavy(move || {
        let dir = workspace_dir(&workspace_id)?;
        let lines = read_log(&dir)?;
        let start = lines.len().saturating_sub(limit);
        Ok(lines[start..].to_vec())
    })
    .await
}

/// What the ledger currently holds for one workspace.
///
/// This exists because every gesture on the privacy surface is otherwise
/// blind: "forget everything for this workspace" with no indication of what is
/// there is a button nobody can evaluate before pressing, and a retention cap
/// is meaningless without the number it is capping. Metadata and output are
/// counted separately, because §7 caps them separately.
#[derive(serde::Serialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct LedgerStats {
    pub records: usize,
    pub log_bytes: u64,
    pub blob_count: usize,
    pub blob_bytes: u64,
    /// `startedAt` of the oldest and newest surviving record, or null on an
    /// empty ledger. The log is append-ordered, but a record with no parsable
    /// timestamp is skipped rather than assumed, so these are a min/max.
    pub oldest_ms: Option<i64>,
    pub newest_ms: Option<i64>,
}

fn stats_in(dir: &Path, blobs: &Path) -> Result<LedgerStats, String> {
    let lines = read_log(dir)?;
    let mut stats = LedgerStats {
        records: lines.len(),
        log_bytes: fs::metadata(dir.join(LOG_FILE))
            .map(|m| m.len())
            .unwrap_or(0),
        ..LedgerStats::default()
    };
    for line in &lines {
        let Some(t) = line_started_at(line) else {
            continue;
        };
        stats.oldest_ms = Some(stats.oldest_ms.map_or(t, |o: i64| o.min(t)));
        stats.newest_ms = Some(stats.newest_ms.map_or(t, |n: i64| n.max(t)));
    }
    if let Ok(entries) = fs::read_dir(blobs) {
        for entry in entries.flatten() {
            let Ok(meta) = entry.metadata() else { continue };
            if meta.is_file() {
                stats.blob_count += 1;
                stats.blob_bytes += meta.len();
            }
        }
    }
    Ok(stats)
}

/// Counts for the privacy surface. Never fails on an absent ledger: a
/// workspace that has recorded nothing reports zeroes, which is the truth.
#[tauri::command]
pub async fn ledger_stats(workspace_id: String) -> Result<LedgerStats, String> {
    crate::modules::heavy(move || {
        let dir = workspace_dir(&workspace_id)?;
        let blobs = blobs_dir(&workspace_id)?;
        stats_in(&dir, &blobs)
    })
    .await
}

/// Forget one entry: rewrite the log without it and unlink its blob.
///
/// Compaction, never a tombstone — §5 of the decision record. A tombstoned
/// secret is still on disk until a compaction nobody can promise ran.
#[tauri::command]
pub async fn ledger_forget_entry(workspace_id: String, id: String) -> Result<(), String> {
    crate::modules::heavy(move || {
        validate_id(&id)?;
        let dir = workspace_dir(&workspace_id)?;
        let lines = read_log(&dir)?;
        let (dropped, kept): (Vec<String>, Vec<String>) =
            lines.into_iter().partition(|l| line_has_id(l, &id));
        if dropped.is_empty() {
            return Ok(());
        }
        for line in &dropped {
            if let Some(output_id) = line_output_id(line) {
                let _ = fs::remove_file(blobs_dir(&workspace_id)?.join(output_id));
            }
        }
        write_log(&dir, &kept)
    })
    .await
}

/// Forget everything recorded in a window of time.
///
/// The escape hatch for a redaction miss. Redaction is a pattern list; it will
/// miss something, and when it does the user needs one gesture rather than a
/// hunt for every affected entry. Records are matched on the `startedAt`
/// field the frontend writes as epoch milliseconds.
#[tauri::command]
pub async fn ledger_forget_since(workspace_id: String, since_ms: i64) -> Result<usize, String> {
    crate::modules::heavy(move || {
        let dir = workspace_dir(&workspace_id)?;
        let lines = read_log(&dir)?;
        let (dropped, kept): (Vec<String>, Vec<String>) = lines
            .into_iter()
            .partition(|l| line_started_at(l).is_some_and(|t| t >= since_ms));
        for line in &dropped {
            if let Some(output_id) = line_output_id(line) {
                let _ = fs::remove_file(blobs_dir(&workspace_id)?.join(output_id));
            }
        }
        let count = dropped.len();
        write_log(&dir, &kept)?;
        Ok(count)
    })
    .await
}

/// Forget an entire workspace: the log, every blob, the directory.
#[tauri::command]
pub async fn ledger_forget_workspace(workspace_id: String) -> Result<(), String> {
    crate::modules::heavy(move || {
        validate_id(&workspace_id)?;
        let dir = ledger_root()?.join(&workspace_id);
        match fs::remove_dir_all(&dir) {
            Ok(()) => Ok(()),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(e) => Err(format!("remove {}: {e}", dir.display())),
        }
    })
    .await
}

/// Extract `"startedAt":<number>`, for the time-window forget.
fn line_started_at(line: &str) -> Option<i64> {
    let key = "\"startedAt\":";
    let start = line.find(key)? + key.len();
    let rest = line[start..].trim_start();
    let end = rest
        .find(|c: char| !c.is_ascii_digit() && c != '-')
        .unwrap_or(rest.len());
    rest[..end].parse::<i64>().ok()
}

/// Apply the two retention caps. Runs on workspace open.
///
/// The caps are independent because blobs dominate the footprint and are the
/// least valuable per byte: losing old output while keeping the timings and
/// exit codes that build-time trends and the work journal need is the right
/// trade, and one shared cap could not express it.
#[tauri::command]
pub async fn ledger_prune(
    workspace_id: String,
    max_records: usize,
    max_age_days: i64,
    max_blob_bytes: u64,
    now_ms: i64,
) -> Result<(), String> {
    crate::modules::heavy(move || {
        let dir = workspace_dir(&workspace_id)?;
        let lines = read_log(&dir)?;

        // Metadata: whichever of age or count binds first.
        let cutoff = now_ms - max_age_days.saturating_mul(24 * 60 * 60 * 1000);
        let by_age: Vec<String> = lines
            .into_iter()
            .filter(|l| line_started_at(l).is_none_or(|t| t >= cutoff))
            .collect();
        let start = by_age.len().saturating_sub(max_records);
        let kept = by_age[start..].to_vec();
        write_log(&dir, &kept)?;

        // Blobs: a byte cap, oldest evicted first. Any blob no longer named by
        // a surviving record goes too — otherwise pruning metadata would orphan
        // output that nothing can ever reach again.
        let referenced: Vec<String> = kept.iter().filter_map(|l| line_output_id(l)).collect();
        let blobs = blobs_dir(&workspace_id)?;
        let mut files: Vec<(PathBuf, u64, std::time::SystemTime)> = Vec::new();
        if let Ok(entries) = fs::read_dir(&blobs) {
            for entry in entries.flatten() {
                let Ok(meta) = entry.metadata() else { continue };
                if !meta.is_file() {
                    continue;
                }
                let name = entry.file_name();
                let Some(name) = name.to_str() else { continue };
                if !referenced.iter().any(|r| r == name) {
                    let _ = fs::remove_file(entry.path());
                    continue;
                }
                let modified = meta.modified().unwrap_or(std::time::UNIX_EPOCH);
                files.push((entry.path(), meta.len(), modified));
            }
        }

        let total: u64 = files.iter().map(|(_, len, _)| len).sum();
        if total > max_blob_bytes {
            files.sort_by_key(|(_, _, modified)| *modified);
            let mut over = total - max_blob_bytes;
            for (path, len, _) in files {
                if over == 0 {
                    break;
                }
                let _ = fs::remove_file(&path);
                over = over.saturating_sub(len);
            }
        }
        Ok(())
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("nexis-ledger-test-{name}"));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).expect("create temp dir");
        dir
    }

    #[test]
    fn validate_id_blocks_traversal_and_separators() {
        assert!(validate_id("workspace-abc123").is_ok());
        assert!(validate_id("").is_err());
        assert!(validate_id("../evil").is_err());
        assert!(validate_id("a/b").is_err());
        assert!(validate_id("a\\b").is_err());
        assert!(validate_id("a.b").is_err());
        assert!(validate_id(&"x".repeat(65)).is_err());
    }

    #[test]
    fn appends_one_record_per_line() {
        let dir = temp_dir("append");
        append_in(&dir, r#"{"id":"a","startedAt":1}"#).expect("append a");
        append_in(&dir, r#"{"id":"b","startedAt":2}"#).expect("append b");
        assert_eq!(read_log(&dir).expect("read").len(), 2);
    }

    /// An embedded newline would silently split one record into two, and the
    /// reader treats every line as a record.
    #[test]
    fn rejects_a_record_that_would_split_into_two_lines() {
        let dir = temp_dir("newline");
        assert!(append_in(&dir, "{\"id\":\"a\"}\n{\"id\":\"b\"}").is_err());
        assert!(read_log(&dir).expect("read").is_empty());
    }

    #[test]
    fn rejects_a_record_that_is_not_a_json_object() {
        let dir = temp_dir("shape");
        assert!(append_in(&dir, "not json").is_err());
        assert!(append_in(&dir, "[1,2,3]").is_err());
    }

    #[test]
    fn reads_an_absent_log_as_empty_rather_than_failing() {
        let dir = temp_dir("absent");
        assert!(read_log(&dir).expect("read").is_empty());
    }

    #[test]
    fn matches_an_id_only_in_its_own_field() {
        assert!(line_has_id(r#"{"id":"abc","argv":"ls"}"#, "abc"));
        // The id appears, but not as the record's own id.
        assert!(!line_has_id(r#"{"id":"xyz","argv":"echo abc"}"#, "abc"));
    }

    #[test]
    fn extracts_the_output_id_and_the_timestamp() {
        let line = r#"{"id":"a","startedAt":1700000000000,"outputId":"blob-1"}"#;
        assert_eq!(line_output_id(line).as_deref(), Some("blob-1"));
        assert_eq!(line_started_at(line), Some(1_700_000_000_000));
        assert_eq!(line_output_id(r#"{"id":"a"}"#), None);
        assert_eq!(line_started_at(r#"{"id":"a"}"#), None);
    }

    /// A blob id that would escape the blobs directory is refused rather than
    /// unlinked — the same guard as every other id on this path.
    #[test]
    fn refuses_an_output_id_that_could_traverse() {
        assert_eq!(
            line_output_id(r#"{"id":"a","outputId":"../../etc/passwd"}"#),
            None
        );
    }

    #[test]
    fn compaction_rewrites_the_log_without_the_dropped_line() {
        let dir = temp_dir("compact");
        append_in(&dir, r#"{"id":"keep-1","startedAt":1}"#).expect("append");
        append_in(&dir, r#"{"id":"drop","startedAt":2}"#).expect("append");
        append_in(&dir, r#"{"id":"keep-2","startedAt":3}"#).expect("append");

        let lines = read_log(&dir).expect("read");
        let kept: Vec<String> = lines
            .into_iter()
            .filter(|l| !line_has_id(l, "drop"))
            .collect();
        write_log(&dir, &kept).expect("write");

        let after = read_log(&dir).expect("read");
        assert_eq!(after.len(), 2);
        // The bytes are gone, not tombstoned — that is the whole point of §5.
        assert!(!after.iter().any(|l| l.contains("drop")));
    }

    #[test]
    fn stats_count_metadata_and_output_separately() {
        let dir = temp_dir("stats");
        let blobs = dir.join(BLOBS_DIR);
        fs::create_dir_all(&blobs).expect("create blobs");
        append_in(&dir, r#"{"id":"a","startedAt":300,"outputId":"out-a"}"#).expect("append");
        append_in(&dir, r#"{"id":"b","startedAt":100}"#).expect("append");
        fs::write(blobs.join("out-a"), "hello").expect("write blob");

        let stats = stats_in(&dir, &blobs).expect("stats");
        assert_eq!(stats.records, 2);
        assert_eq!(stats.blob_count, 1);
        assert_eq!(stats.blob_bytes, 5);
        assert!(stats.log_bytes > 0);
        // Min/max rather than first/last: a record with no parsable timestamp
        // must not be able to claim either end.
        assert_eq!(stats.oldest_ms, Some(100));
        assert_eq!(stats.newest_ms, Some(300));
    }

    #[test]
    fn stats_report_zeroes_for_a_workspace_that_recorded_nothing() {
        let dir = temp_dir("stats-empty");
        let blobs = dir.join(BLOBS_DIR);
        let stats = stats_in(&dir, &blobs).expect("stats");
        assert_eq!(stats.records, 0);
        assert_eq!(stats.blob_count, 0);
        assert_eq!(stats.log_bytes, 0);
        assert_eq!(stats.oldest_ms, None);
    }

    #[test]
    fn writing_an_empty_log_leaves_a_readable_empty_file() {
        let dir = temp_dir("empty");
        append_in(&dir, r#"{"id":"a","startedAt":1}"#).expect("append");
        write_log(&dir, &[]).expect("write empty");
        assert!(read_log(&dir).expect("read").is_empty());
    }
}
