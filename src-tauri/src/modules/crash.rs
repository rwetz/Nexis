// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

//! Crash diagnostics.
//!
//! The release profile sets `panic = "abort"`, so a panic on any thread tears
//! the whole process down with no unwinding and no recovery. Without a hook
//! that death is invisible — the user just sees the window vanish. This module
//! installs a global panic hook that writes a structured report to
//! `{cache}/nexis/crash/` before the abort, and exposes a command so the
//! frontend can surface "Nexis recovered from a crash" on the next launch.

// Panic-lint gate: no `.unwrap()`/`.expect()` in production code here.
// Tests may still panic (allow-*-in-tests in clippy.toml). CI's
// `clippy -- -D warnings` turns a new one into a build failure.
#![warn(clippy::unwrap_used, clippy::expect_used)]

use std::backtrace::Backtrace;
use std::fs;
use std::io::Write;
use std::panic::PanicHookInfo;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::Serialize;

const APP_VERSION: &str = env!("CARGO_PKG_VERSION");
const MAX_REPORTS_RETURNED: usize = 10;
const MAX_BODY_BYTES: usize = 64 * 1024;

/// Directory where crash reports are written: `{cache}/nexis/crash/`.
pub fn crash_dir() -> Option<PathBuf> {
    dirs::cache_dir().map(|d| d.join("nexis").join("crash"))
}

fn now_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// Pull the human-readable message out of a panic payload.
fn panic_message(info: &PanicHookInfo<'_>) -> String {
    let payload = info.payload();
    if let Some(s) = payload.downcast_ref::<&str>() {
        (*s).to_string()
    } else if let Some(s) = payload.downcast_ref::<String>() {
        s.clone()
    } else {
        "<non-string panic payload>".to_string()
    }
}

/// Sanitize a thread name for use inside a filename (Windows forbids
/// `<>:"/\|?*`, so keep it to a conservative alphanumeric set).
fn sanitize_for_filename(s: &str) -> String {
    s.chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '-' || c == '_' {
                c
            } else {
                '_'
            }
        })
        .collect()
}

/// Build the report body. Pure so it can be unit-tested without panicking.
fn format_report(
    message: &str,
    location: Option<String>,
    thread: &str,
    when_ms: u64,
    backtrace: &str,
) -> String {
    format!(
        "Nexis crash report\n\
         ==================\n\
         version:   {APP_VERSION}\n\
         when (ms): {when_ms}\n\
         thread:    {thread}\n\
         location:  {}\n\
         message:   {message}\n\
         \n\
         backtrace:\n{backtrace}\n",
        location.as_deref().unwrap_or("<unknown>")
    )
}

/// Best-effort: write a crash report. Must never panic (it runs *inside* the
/// panic hook), so every fallible step is swallowed.
fn write_report(info: &PanicHookInfo<'_>) {
    let Some(dir) = crash_dir() else { return };
    if fs::create_dir_all(&dir).is_err() {
        return;
    }

    let thread_name = std::thread::current()
        .name()
        .unwrap_or("unnamed")
        .to_string();
    let location = info
        .location()
        .map(|l| format!("{}:{}:{}", l.file(), l.line(), l.column()));
    let when = now_millis();
    let backtrace = Backtrace::force_capture().to_string();
    let body = format_report(
        &panic_message(info),
        location,
        &thread_name,
        when,
        &backtrace,
    );

    let filename = format!("crash-{when}-{}.log", sanitize_for_filename(&thread_name));
    let path = dir.join(filename);
    if let Ok(mut file) = fs::File::create(&path) {
        let _ = file.write_all(body.as_bytes());
    }
    log::error!("nexis panic captured to {}", path.display());
}

/// Install the global panic hook. Call once, early in `run()`. Chains to the
/// previous hook so the default stderr message is preserved.
pub fn install_panic_hook() {
    let previous = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        write_report(info);
        previous(info);
    }));
}

#[derive(Serialize)]
pub struct CrashReport {
    path: String,
    when_ms: u64,
    body: String,
}

/// List recent crash reports, most recent first, for the frontend to surface.
/// Reads only our own crash directory — no user-supplied paths involved.
#[tauri::command]
pub async fn list_crash_reports() -> Vec<CrashReport> {
    tauri::async_runtime::spawn_blocking(list_crash_reports_blocking)
        .await
        .unwrap_or_default()
}

fn list_crash_reports_blocking() -> Vec<CrashReport> {
    let Some(dir) = crash_dir() else {
        return Vec::new();
    };
    let Ok(entries) = fs::read_dir(&dir) else {
        return Vec::new();
    };

    let mut found: Vec<(u64, PathBuf)> = entries
        .flatten()
        .map(|e| e.path())
        .filter(|p| p.extension().is_some_and(|ext| ext == "log"))
        .map(|p| {
            let mtime = fs::metadata(&p)
                .and_then(|m| m.modified())
                .ok()
                .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                .map(|d| d.as_millis() as u64)
                .unwrap_or(0);
            (mtime, p)
        })
        .collect();
    found.sort_by_key(|(when, _)| std::cmp::Reverse(*when));

    found
        .into_iter()
        .take(MAX_REPORTS_RETURNED)
        .map(|(when_ms, path)| {
            let mut body = fs::read_to_string(&path).unwrap_or_default();
            if body.len() > MAX_BODY_BYTES {
                // Truncate on a char boundary so this never panics.
                let mut end = MAX_BODY_BYTES;
                while end > 0 && !body.is_char_boundary(end) {
                    end -= 1;
                }
                body.truncate(end);
            }
            CrashReport {
                path: path.to_string_lossy().to_string(),
                when_ms,
                body,
            }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn format_report_includes_key_fields() {
        let body = format_report(
            "something broke",
            Some("src/foo.rs:10:5".to_string()),
            "nexis-pty-reader",
            1_700_000_000_000,
            "0: foo\n1: bar",
        );
        assert!(body.contains("something broke"));
        assert!(body.contains("src/foo.rs:10:5"));
        assert!(body.contains("nexis-pty-reader"));
        assert!(body.contains("1700000000000"));
        assert!(body.contains(APP_VERSION));
        assert!(body.contains("backtrace:"));
    }

    #[test]
    fn format_report_handles_unknown_location() {
        let body = format_report("msg", None, "main", 0, "");
        assert!(body.contains("location:  <unknown>"));
    }

    #[test]
    fn sanitize_strips_filename_hostile_chars() {
        assert_eq!(
            sanitize_for_filename("tokio-runtime-worker"),
            "tokio-runtime-worker"
        );
        assert_eq!(sanitize_for_filename("<unnamed>"), "_unnamed_");
        assert_eq!(sanitize_for_filename("a/b\\c:d"), "a_b_c_d");
    }

    #[test]
    fn crash_dir_ends_with_expected_segments() {
        if let Some(dir) = crash_dir() {
            assert!(dir.ends_with("nexis/crash") || dir.ends_with("nexis\\crash"));
        }
    }
}
