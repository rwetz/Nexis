/// Terminal session recording — save asciinema v2 `.cast` files to ~/nexis-recordings/.

#[tauri::command]
pub async fn save_cast_recording(content: String) -> Result<String, String> {
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
