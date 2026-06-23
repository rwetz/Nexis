// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

// Panic-lint gate (IDEAS A1): forbid `.unwrap()`/`.expect()` in non-test code.
#![warn(clippy::unwrap_used, clippy::expect_used)]

// Terminal session recording — save asciinema v2 `.cast` files to ~/nexis-recordings/.

// Upper bound on a single saved `.cast` payload (IDEAS A5 buffer-cap sweep).
// The frontend already caps in-memory accumulation (useRecording.ts), so this
// is a defense-in-depth ceiling against an oversized IPC payload OOM-ing the
// write. 512 MiB is far above any plausible real recording.
const MAX_CAST_BYTES: usize = 512 * 1024 * 1024;

#[tauri::command]
pub async fn save_cast_recording(content: String) -> Result<String, String> {
    if content.len() > MAX_CAST_BYTES {
        return Err(format!(
            "recording too large: {} bytes (cap {} bytes)",
            content.len(),
            MAX_CAST_BYTES
        ));
    }
    let home = dirs::home_dir().ok_or_else(|| "no home directory found".to_string())?;
    let dir = home.join("nexis-recordings");
    std::fs::create_dir_all(&dir).map_err(|e| format!("create dir: {e}"))?;

    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    let filename = format!("session-{ts}.cast");
    let path = dir.join(&filename);
    std::fs::write(&path, content.as_bytes()).map_err(|e| format!("write: {e}"))?;

    // Return path with forward slashes for display consistency.
    Ok(path.to_string_lossy().replace('\\', "/"))
}
