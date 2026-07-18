// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

//! Diagnostics bundle export: one command that gathers logs, versions, the
//! sanitized config (redacted frontend-side before it crosses IPC), recent
//! crash reports, and the newest terminal recording into a single zip the
//! user attaches to a bug report themselves. Everything stays local.
//!
//! The zip is written by a ~100-line store-only (no compression) writer
//! rather than a zip crate — logs and JSON are small, and the <10 MB
//! release-binary budget outweighs smaller bundles.

use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use tauri::Manager;

const APP_VERSION: &str = env!("CARGO_PKG_VERSION");
/// Per-file tail cap — a runaway log must not produce a gigabyte bundle.
const MAX_FILE_BYTES: usize = 512 * 1024;
/// Recordings are bigger but bounded (64 MiB recorder cap); take at most this.
const MAX_RECORDING_BYTES: usize = 4 * 1024 * 1024;
const MAX_FILES_PER_DIR: usize = 5;

// ─── Store-only zip writer ─────────────────────────────────────────────────

struct ZipEntry {
    name: String,
    crc: u32,
    size: u32,
    offset: u32,
}

#[derive(Default)]
struct ZipWriter {
    buf: Vec<u8>,
    entries: Vec<ZipEntry>,
}

fn crc32(data: &[u8]) -> u32 {
    let mut crc: u32 = 0xffff_ffff;
    for &b in data {
        crc ^= u32::from(b);
        for _ in 0..8 {
            let mask = 0u32.wrapping_sub(crc & 1);
            crc = (crc >> 1) ^ (0xedb8_8320 & mask);
        }
    }
    !crc
}

impl ZipWriter {
    fn add_file(&mut self, name: &str, data: &[u8]) {
        let offset = self.buf.len() as u32;
        let crc = crc32(data);
        let size = data.len() as u32;
        // Local file header, store method, zeroed DOS timestamp.
        self.buf.extend_from_slice(&0x0403_4b50u32.to_le_bytes());
        self.buf.extend_from_slice(&20u16.to_le_bytes()); // version needed
        self.buf.extend_from_slice(&0u16.to_le_bytes()); // flags
        self.buf.extend_from_slice(&0u16.to_le_bytes()); // method: store
        self.buf.extend_from_slice(&0u32.to_le_bytes()); // mod time+date
        self.buf.extend_from_slice(&crc.to_le_bytes());
        self.buf.extend_from_slice(&size.to_le_bytes()); // compressed
        self.buf.extend_from_slice(&size.to_le_bytes()); // uncompressed
        self.buf
            .extend_from_slice(&(name.len() as u16).to_le_bytes());
        self.buf.extend_from_slice(&0u16.to_le_bytes()); // extra len
        self.buf.extend_from_slice(name.as_bytes());
        self.buf.extend_from_slice(data);
        self.entries.push(ZipEntry {
            name: name.to_string(),
            crc,
            size,
            offset,
        });
    }

    fn finish(mut self) -> Vec<u8> {
        let cd_start = self.buf.len() as u32;
        for e in &self.entries {
            self.buf.extend_from_slice(&0x0201_4b50u32.to_le_bytes());
            self.buf.extend_from_slice(&20u16.to_le_bytes()); // made by
            self.buf.extend_from_slice(&20u16.to_le_bytes()); // needed
            self.buf.extend_from_slice(&0u16.to_le_bytes()); // flags
            self.buf.extend_from_slice(&0u16.to_le_bytes()); // method
            self.buf.extend_from_slice(&0u32.to_le_bytes()); // time+date
            self.buf.extend_from_slice(&e.crc.to_le_bytes());
            self.buf.extend_from_slice(&e.size.to_le_bytes());
            self.buf.extend_from_slice(&e.size.to_le_bytes());
            self.buf
                .extend_from_slice(&(e.name.len() as u16).to_le_bytes());
            self.buf.extend_from_slice(&[0u8; 12]); // extra/comment/disk/attrs(int)
            self.buf.extend_from_slice(&0u32.to_le_bytes()); // ext attrs
            self.buf.extend_from_slice(&e.offset.to_le_bytes());
            self.buf.extend_from_slice(e.name.as_bytes());
        }
        let cd_size = self.buf.len() as u32 - cd_start;
        let count = self.entries.len() as u16;
        self.buf.extend_from_slice(&0x0605_4b50u32.to_le_bytes());
        self.buf.extend_from_slice(&[0u8; 4]); // disk numbers
        self.buf.extend_from_slice(&count.to_le_bytes());
        self.buf.extend_from_slice(&count.to_le_bytes());
        self.buf.extend_from_slice(&cd_size.to_le_bytes());
        self.buf.extend_from_slice(&cd_start.to_le_bytes());
        self.buf.extend_from_slice(&0u16.to_le_bytes()); // comment len
        self.buf
    }
}

// ─── Collection ────────────────────────────────────────────────────────────

/// Newest-first listing of plain files in `dir`, by mtime.
fn newest_files(dir: &Path, limit: usize) -> Vec<PathBuf> {
    let Ok(entries) = fs::read_dir(dir) else {
        return Vec::new();
    };
    let mut files: Vec<(SystemTime, PathBuf)> = entries
        .flatten()
        .filter_map(|e| {
            let meta = e.metadata().ok()?;
            if !meta.is_file() {
                return None;
            }
            Some((meta.modified().ok()?, e.path()))
        })
        .collect();
    files.sort_by_key(|(mtime, _)| std::cmp::Reverse(*mtime));
    files.into_iter().take(limit).map(|(_, p)| p).collect()
}

/// Read at most the last `cap` bytes of a file (tail — the recent part is
/// the diagnostic part), snapped forward to a UTF-8 boundary best-effort.
fn read_tail(path: &Path, cap: usize) -> Option<Vec<u8>> {
    let data = fs::read(path).ok()?;
    if data.len() <= cap {
        return Some(data);
    }
    let mut start = data.len() - cap;
    while start < data.len() && (data[start] & 0b1100_0000) == 0b1000_0000 {
        start += 1;
    }
    Some(data[start..].to_vec())
}

fn add_dir_tail(zip: &mut ZipWriter, dir: Option<&Path>, prefix: &str, cap: usize) {
    let Some(dir) = dir else { return };
    for path in newest_files(dir, MAX_FILES_PER_DIR) {
        let Some(name) = path.file_name().and_then(|n| n.to_str()) else {
            continue;
        };
        if let Some(data) = read_tail(&path, cap) {
            zip.add_file(&format!("{prefix}/{name}"), &data);
        }
    }
}

fn build_bundle(
    sanitized_config: &str,
    log_dir: Option<&Path>,
    crash_dir: Option<&Path>,
    recordings_dir: Option<&Path>,
) -> Vec<u8> {
    let mut zip = ZipWriter::default();
    let versions = format!(
        "nexis {APP_VERSION}\nos: {} {}\nexported_at_unix: {}\n",
        std::env::consts::OS,
        std::env::consts::ARCH,
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0),
    );
    zip.add_file("versions.txt", versions.as_bytes());
    zip.add_file("config.json", sanitized_config.as_bytes());
    add_dir_tail(&mut zip, log_dir, "logs", MAX_FILE_BYTES);
    add_dir_tail(&mut zip, crash_dir, "crash", MAX_FILE_BYTES);
    if let Some(dir) = recordings_dir {
        if let Some(newest) = newest_files(dir, 1).first() {
            if let Some(data) = read_tail(newest, MAX_RECORDING_BYTES) {
                let name = newest
                    .file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or("recording.cast");
                zip.add_file(&format!("recording/{name}"), &data);
            }
        }
    }
    zip.finish()
}

/// Export a diagnostics bundle to `~/nexis-diagnostics-<unix>.zip` and
/// return its path. `sanitized_config` is the preferences JSON, already
/// passed through `redactSensitive()` frontend-side — this command never
/// reads the raw settings store.
#[tauri::command]
pub async fn diagnostics_export(
    app: tauri::AppHandle,
    sanitized_config: String,
) -> Result<String, String> {
    let log_dir = app.path().app_log_dir().ok();
    crate::modules::heavy(move || {
        let home = dirs::home_dir().ok_or_else(|| "could not resolve home dir".to_string())?;
        let crash = super::crash::crash_dir();
        let recordings = home.join("nexis-recordings");
        let bundle = build_bundle(
            &sanitized_config,
            log_dir.as_deref(),
            crash.as_deref(),
            Some(&recordings),
        );
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);
        let target = home.join(format!("nexis-diagnostics-{stamp}.zip"));
        let tmp = target.with_extension("zip.tmp");
        fs::write(&tmp, &bundle).map_err(|e| format!("write {}: {e}", tmp.display()))?;
        fs::rename(&tmp, &target).map_err(|e| {
            let _ = fs::remove_file(&tmp);
            format!("rename {}: {e}", target.display())
        })?;
        Ok(target.to_string_lossy().into_owned())
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn crc32_known_vector() {
        // The canonical CRC-32 check value.
        assert_eq!(crc32(b"123456789"), 0xcbf4_3926);
        assert_eq!(crc32(b""), 0);
    }

    #[test]
    fn zip_structure_is_valid() {
        let mut zip = ZipWriter::default();
        zip.add_file("a.txt", b"hello");
        zip.add_file("dir/b.txt", b"world!");
        let bytes = zip.finish();
        // Local header signatures for both entries.
        assert_eq!(&bytes[0..4], &0x0403_4b50u32.to_le_bytes());
        // End-of-central-directory record present, with entry count 2.
        let eocd = bytes.len() - 22;
        assert_eq!(&bytes[eocd..eocd + 4], &0x0605_4b50u32.to_le_bytes());
        assert_eq!(
            u16::from_le_bytes([bytes[eocd + 10], bytes[eocd + 11]]),
            2,
            "central directory must list both entries"
        );
        // Stored data is present verbatim (store method, no compression).
        let hay = bytes.windows(5).any(|w| w == b"hello");
        assert!(hay, "stored entry data must appear uncompressed");
    }

    #[test]
    fn read_tail_caps_and_respects_utf8() {
        let dir = tempfile::tempdir().expect("tempdir");
        let p = dir.path().join("log.txt");
        // 3-byte UTF-8 char straddling the cap boundary must not be split.
        let content = format!("{}✓tail", "x".repeat(100));
        fs::write(&p, &content).expect("write");
        let tail = read_tail(&p, 7).expect("tail");
        let s = String::from_utf8(tail).expect("tail must be valid utf-8");
        assert_eq!(s, "✓tail");
    }

    #[test]
    fn bundle_contains_versions_and_config() {
        let bytes = build_bundle("{\"a\":1}", None, None, None);
        let hay = |needle: &[u8]| bytes.windows(needle.len()).any(|w| w == needle);
        assert!(hay(b"versions.txt"));
        assert!(hay(b"config.json"));
        assert!(hay(b"{\"a\":1}"));
        assert!(hay(APP_VERSION.as_bytes()));
    }
}
