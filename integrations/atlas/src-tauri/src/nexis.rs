//! Handing a repo to Nexis.
//!
//! The other direction of the family link. Nexis has accepted a directory as a
//! launch argument for a long time (`parse_launch_dir` in its `lib.rs`), so
//! opening a repo there needs no cooperation from it and no new protocol —
//! find the binary, run it with the path.
//!
//! It deliberately does *not* go through a `nexis://` URL. Nexis does not
//! register a scheme today, so a URL would hand the link to the OS, which would
//! either do nothing or offer to search the web for it. When Nexis does
//! register one, this becomes a one-line change and the discovery below can go.

use std::path::{Path, PathBuf};

/// Where a Nexis install puts its binary, most specific first. `NEXIS_BIN`
/// wins so a dev build or an unusual install can be pointed at explicitly.
fn candidates() -> Vec<PathBuf> {
    let mut out = Vec::new();

    if let Some(explicit) = std::env::var_os("NEXIS_BIN") {
        out.push(PathBuf::from(explicit));
    }

    #[cfg(target_os = "windows")]
    {
        // The NSIS bundle installs per-user by default (`installMode:
        // currentUser`), so LOCALAPPDATA is the common case, not Program Files.
        for (var, rest) in [
            ("LOCALAPPDATA", r"Programs\Nexis\Nexis.exe"),
            ("PROGRAMFILES", r"Nexis\Nexis.exe"),
            ("ProgramFiles(x86)", r"Nexis\Nexis.exe"),
        ] {
            if let Some(base) = std::env::var_os(var) {
                out.push(Path::new(&base).join(rest));
            }
        }
    }

    #[cfg(target_os = "macos")]
    {
        out.push(PathBuf::from(
            "/Applications/Nexis.app/Contents/MacOS/Nexis",
        ));
        if let Some(home) = dirs::home_dir() {
            out.push(home.join("Applications/Nexis.app/Contents/MacOS/Nexis"));
        }
    }

    #[cfg(target_os = "linux")]
    {
        out.push(PathBuf::from("/usr/bin/nexis"));
        out.push(PathBuf::from("/usr/local/bin/nexis"));
        if let Some(home) = dirs::home_dir() {
            out.push(home.join(".local/bin/nexis"));
        }
    }

    out
}

/// The binary name to try against `PATH`.
#[cfg(windows)]
const ON_PATH: &str = "nexis.exe";
#[cfg(not(windows))]
const ON_PATH: &str = "nexis";

/// Walk `PATH` ourselves rather than shelling out to `where`/`which` — one
/// fewer subprocess, and on Windows it avoids a console window flashing up.
fn on_path() -> Option<PathBuf> {
    let path = std::env::var_os("PATH")?;
    std::env::split_paths(&path)
        .map(|dir| dir.join(ON_PATH))
        .find(|p| p.is_file())
}

/// Locate an installed Nexis, or `None` if there isn't one.
pub fn locate() -> Option<PathBuf> {
    candidates()
        .into_iter()
        .find(|p| p.is_file())
        .or_else(on_path)
}

/// Launch Nexis with `dir` as its workspace.
///
/// Note this starts a *new* Nexis rather than talking to a running one: Nexis
/// has no `tauri-plugin-single-instance` yet (its own roadmap tracks this), so
/// a second invocation is a second app. That is Nexis's call to make, not
/// something Atlas can paper over from this side.
pub fn open_dir(dir: &str) -> Result<PathBuf, String> {
    let target = Path::new(dir);
    if !target.is_dir() {
        return Err(format!("not a directory: {dir}"));
    }

    let bin = locate().ok_or_else(|| {
        "could not find Nexis — install it, put `nexis` on your PATH, \
         or set NEXIS_BIN to the binary"
            .to_string()
    })?;

    let mut cmd = std::process::Command::new(&bin);
    cmd.arg(target);

    // Without this a GUI app spawning a child briefly creates a console window
    // on Windows. Harmless here, but it flashes, and the family's other apps
    // have been bitten by exactly this.
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

    cmd.spawn()
        .map_err(|e| format!("could not launch {}: {e}", bin.display()))?;
    Ok(bin)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_a_path_that_is_not_a_directory() {
        let f = std::env::temp_dir().join(format!("atlas-nexis-{}.txt", std::process::id()));
        std::fs::write(&f, "x").unwrap();
        let err = open_dir(&f.display().to_string()).unwrap_err();
        assert!(err.contains("not a directory"), "got: {err}");
        let _ = std::fs::remove_file(&f);
    }

    #[test]
    fn explicit_override_is_preferred() {
        // Set NEXIS_BIN to this test binary, which definitely exists, and check
        // it is the first thing considered.
        let me = std::env::current_exe().expect("current exe");
        // SAFETY-ish: single-threaded assertion on process-global state; the
        // var is removed again before the test returns.
        std::env::set_var("NEXIS_BIN", &me);
        let first = candidates().into_iter().next();
        std::env::remove_var("NEXIS_BIN");
        assert_eq!(first.as_deref(), Some(me.as_path()));
    }
}
