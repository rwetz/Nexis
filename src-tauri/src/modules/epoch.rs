//! Opening Nexis Epoch, the standalone data-and-experiments app, on a project,
//! a run or a dataset (`nexis-epoch://open?...`).
//!
//! Epoch is its own app (github.com/rwetz/nexis-epoch), not a Nexis window.
//! A running Epoch gets the link over the family's loopback channel
//! (modules/links.rs); otherwise Nexis launches it with `--link <url>`.

use super::links;
use super::proc::command;
use std::path::{Path, PathBuf};
use std::process::Stdio;

const EPOCH_SCHEME: &str = "nexis-epoch";

fn exe_name() -> &'static str {
    if cfg!(windows) {
        "nexis-epoch.exe"
    } else {
        "nexis-epoch"
    }
}

/// Only ever launch a binary that is actually called nexis-epoch, whatever a
/// saved preference says.
fn is_epoch_exe(path: &Path) -> bool {
    path.file_stem()
        .and_then(|s| s.to_str())
        .is_some_and(|s| s.eq_ignore_ascii_case("nexis-epoch"))
        && path.is_file()
}

/// Where the installers put Epoch, most specific first.
fn default_locations() -> Vec<PathBuf> {
    let mut out = Vec::new();
    if let Ok(p) = std::env::var("NEXIS_EPOCH") {
        out.push(PathBuf::from(p));
    }
    if cfg!(windows) {
        // NSIS per-user install, then the MSI per-machine install.
        if let Some(local) = dirs::data_local_dir() {
            out.push(local.join("Nexis Epoch").join(exe_name()));
            out.push(local.join("Programs").join("Nexis Epoch").join(exe_name()));
        }
        for var in ["ProgramFiles", "ProgramFiles(x86)"] {
            if let Ok(pf) = std::env::var(var) {
                out.push(PathBuf::from(pf).join("Nexis Epoch").join(exe_name()));
            }
        }
    } else if cfg!(target_os = "macos") {
        out.push(PathBuf::from(
            "/Applications/Nexis Epoch.app/Contents/MacOS/nexis-epoch",
        ));
        if let Some(home) = dirs::home_dir() {
            out.push(home.join("Applications/Nexis Epoch.app/Contents/MacOS/nexis-epoch"));
        }
    } else {
        out.push(PathBuf::from("/usr/bin/nexis-epoch"));
        out.push(PathBuf::from("/usr/local/bin/nexis-epoch"));
    }
    // Anything named nexis-epoch on PATH (an AppImage symlink, a dev build).
    if let Some(path) = std::env::var_os("PATH") {
        for dir in std::env::split_paths(&path) {
            out.push(dir.join(exe_name()));
        }
    }
    out
}

fn locate(custom: Option<&str>) -> Option<PathBuf> {
    custom
        .map(PathBuf::from)
        .into_iter()
        .chain(default_locations())
        .find(|p| is_epoch_exe(p))
}

/// Build `nexis-epoch://open?project=...&run=...&dataset=...`.
fn epoch_url(project: &str, run: Option<&str>, dataset: Option<&str>) -> Result<String, String> {
    let mut url =
        tauri::Url::parse(&format!("{EPOCH_SCHEME}://open")).map_err(|e| e.to_string())?;
    {
        let mut q = url.query_pairs_mut();
        q.append_pair("project", project);
        if let Some(run) = run {
            q.append_pair("run", run);
        }
        if let Some(dataset) = dataset {
            q.append_pair("dataset", dataset);
        }
    }
    Ok(url.to_string())
}

/// The Epoch binary Nexis would launch, or null. `custom` is the user's saved
/// location (Settings), tried first.
#[tauri::command]
pub async fn epoch_locate(custom: Option<String>) -> Result<Option<String>, String> {
    super::heavy(move || Ok(locate(custom.as_deref()).map(|p| p.to_string_lossy().into_owned())))
        .await
}

/// Show `project` (and optionally one run or dataset in it) in Epoch.
/// Returns "sent" when a running Epoch took the link, "launched" when Nexis
/// started Epoch, and the error "not-found" when there is no Epoch to start.
#[tauri::command]
pub async fn epoch_open(
    project: String,
    run: Option<String>,
    dataset: Option<String>,
    custom: Option<String>,
) -> Result<String, String> {
    super::heavy(move || {
        let dir = Path::new(&project);
        if !dir.is_absolute() || !dir.is_dir() {
            return Err(format!("not a project folder: {project}"));
        }
        let url = epoch_url(&project, run.as_deref(), dataset.as_deref())?;
        if links::send("epoch", &url).is_ok() {
            return Ok("sent".into());
        }
        let exe = locate(custom.as_deref()).ok_or_else(|| "not-found".to_string())?;
        command(&exe)
            .arg("--link")
            .arg(&url)
            .current_dir(dir)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|e| format!("could not start {}: {e}", exe.display()))?;
        Ok("launched".into())
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builds_an_encoded_epoch_url() {
        let url = epoch_url("C:\\work\\plant doctor", Some("run-1"), None).unwrap();
        assert!(url.starts_with("nexis-epoch://open?project="));
        assert!(url.contains("run=run-1"));
        assert!(!url.contains(' '));
        let parsed = tauri::Url::parse(&url).unwrap();
        let project = parsed
            .query_pairs()
            .find(|(k, _)| k == "project")
            .unwrap()
            .1;
        assert_eq!(project, "C:\\work\\plant doctor");
    }

    #[test]
    fn refuses_binaries_with_other_names() {
        let dir = tempfile::tempdir().unwrap();
        let other = dir
            .path()
            .join(if cfg!(windows) { "calc.exe" } else { "calc" });
        std::fs::write(&other, b"").unwrap();
        assert!(!is_epoch_exe(&other));
        let epoch = dir.path().join(exe_name());
        std::fs::write(&epoch, b"").unwrap();
        assert!(is_epoch_exe(&epoch));
        assert_eq!(
            locate(Some(other.to_str().unwrap())).as_deref(),
            locate(None).as_deref()
        );
    }
}
