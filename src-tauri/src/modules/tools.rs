// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

// Panic-lint gate: no `.unwrap()`/`.expect()` in production code here.
#![warn(clippy::unwrap_used, clippy::expect_used)]

//! Re-checking external tools Nexis wanted but could not find.
//!
//! The "N tools missing" notice is populated lazily, by whatever tried to use
//! a tool and failed (`src/lib/missingTools.ts`). That is the right trigger
//! for *raising* the notice, but a poor one for retiring it: a user who runs
//! the install command we handed them has no reason to open a Rust file again
//! just to prove it worked, so the notice outlived the problem. This is the
//! explicit re-check behind the notice's refresh button.
//!
//! Resolution rather than execution. `<binary> --version` looks like the more
//! honest probe, but several language servers here speak LSP on stdio and
//! treat an unknown flag as "wait for a request" — probing by running them
//! would hang the refresh on exactly the tools it exists to check. Whether the
//! name resolves to an executable is the question the spawn itself will ask.

use crate::modules::workspace::WorkspaceEnv;
use std::path::{Path, PathBuf};

/// Which of `binaries` resolve to something runnable right now.
///
/// `workspace` selects *where* to look, and the caller decides per tool: the
/// LSP client spawns servers on the host regardless of workspace, while git
/// follows the workspace into WSL. Probing the wrong side is CLAUDE.md pitfall
/// #20 — an answer that is true of a machine the tool will not run on.
#[tauri::command]
pub async fn tool_probe(
    binaries: Vec<String>,
    workspace: Option<WorkspaceEnv>,
) -> Result<Vec<String>, String> {
    let workspace = WorkspaceEnv::from_option(workspace);
    crate::modules::heavy(move || {
        // Git answers availability from a 60s cache. A refresh is the user
        // saying they just changed something, so the cached "not installed"
        // must not outlive it — otherwise the pill clears and the very next
        // Source Control read puts it straight back.
        crate::modules::git::invalidate_availability_cache();
        Ok(binaries
            .into_iter()
            .filter(|b| resolves(&workspace, b))
            .collect())
    })
    .await
}

fn resolves(workspace: &WorkspaceEnv, binary: &str) -> bool {
    if binary.is_empty() {
        return false;
    }
    match workspace {
        WorkspaceEnv::Local => resolves_on_host(binary),
        #[cfg(windows)]
        WorkspaceEnv::Wsl { distro } => resolves_in_wsl(distro, binary),
        // A non-Windows host has no WSL. Answering for the host instead would
        // be the wrong-machine bug this parameter exists to prevent.
        #[cfg(not(windows))]
        WorkspaceEnv::Wsl { .. } => false,
    }
}

fn resolves_on_host(binary: &str) -> bool {
    resolve_on_host(binary).is_some()
}

/// A `which`, in-process: no subprocess, so it cannot hang or flash a console.
///
/// Returns the concrete path rather than a bool because callers need both
/// answers from the same walk. `tool_probe` only wants "is it there", but a
/// spawn site needs the resolved path itself: `std::process::Command` on
/// Windows appends **only** `.exe` to a bare name — it does not consult
/// PATHEXT — so handing it `vscode-css-language-server` fails even though the
/// probe found `vscode-css-language-server.cmd` one directory over. Resolving
/// here and spawning the result is what keeps the two sides agreeing.
pub fn resolve_on_host(binary: &str) -> Option<PathBuf> {
    if binary.is_empty() {
        return None;
    }
    let path = Path::new(binary);
    // A name carrying a separator is a path, not a PATH lookup — that is what
    // the OS does when it spawns it, so match that here.
    //
    // The suffix walk still applies. A config entry or debugger-panel command
    // that names a *path* into an npm bin directory
    // (`.\node_modules\.bin\js-debug-adapter`) has the identical `.cmd`-shim
    // problem, and on Windows the extensionless sibling sitting right next to
    // the shim is a bash script — a file that exists and cannot be spawned, so
    // checking the bare spelling alone would "resolve" to a guaranteed
    // failure. On a non-Windows host the suffix list is `[""]`, which makes
    // this exactly the single exact-path check it looks like.
    if path.components().count() > 1 {
        return executable_suffixes().into_iter().find_map(|suffix| {
            let candidate = if suffix.is_empty() {
                path.to_path_buf()
            } else {
                PathBuf::from(format!("{binary}{suffix}"))
            };
            is_executable_file(&candidate).then_some(candidate)
        });
    }
    let path_var = std::env::var_os("PATH")?;
    let suffixes = executable_suffixes();
    // Suffixes inner, directories outer: the first PATH entry holding *any*
    // spawnable spelling wins, which is the order Windows itself searches.
    std::env::split_paths(&path_var)
        .filter(|dir| !dir.as_os_str().is_empty())
        .find_map(|dir| {
            suffixes.iter().find_map(|suffix| {
                let candidate = dir.join(format!("{binary}{suffix}"));
                is_executable_file(&candidate).then_some(candidate)
            })
        })
}

/// Suffixes to try for a bare name. On Windows the npm-installed servers here
/// land as `.cmd` shims rather than `.exe`, so PATHEXT is not optional.
///
/// The extensionless spelling goes **last** on Windows, and that ordering is
/// load-bearing. npm's shim writer emits three files per bin — `foo`, `foo.cmd`
/// and `foo.ps1` — where the extensionless `foo` is a *bash* script for
/// MSYS/Git Bash. `CreateProcessW` cannot run it, so preferring it would
/// resolve to a path that is guaranteed not to spawn. Trying PATHEXT first
/// picks the `.cmd`, which `Command` routes through `cmd.exe` for us.
fn executable_suffixes() -> Vec<String> {
    #[cfg(windows)]
    {
        pathext_suffixes(std::env::var("PATHEXT").ok().as_deref())
    }
    #[cfg(not(windows))]
    {
        vec![String::new()]
    }
}

/// The Windows suffix list, as a pure function of the raw `PATHEXT` value.
///
/// Deliberately **not** `#[cfg(windows)]`: the branch it feeds is, so its
/// tests would otherwise never run on the Linux CI that gates every push. Same
/// reasoning as `parse_wsl_probe` (pitfall #21) — which is also why the
/// dead-code allow is scoped to non-Windows rather than blanket: on Windows
/// this is live production code and must stay lint-visible.
#[cfg_attr(not(windows), allow(dead_code))]
fn pathext_suffixes(raw: Option<&str>) -> Vec<String> {
    const DEFAULT_PATHEXT: &str = ".COM;.EXE;.BAT;.CMD";
    fn parse(raw: &str) -> Vec<String> {
        raw.split(';')
            .map(str::trim)
            .filter(|e| e.starts_with('.'))
            .map(str::to_string)
            .collect()
    }
    // A set-but-*empty* `PATHEXT` reads back as `Some("")`, not `None`, so a
    // plain `unwrap_or` on the absent case would never fire and the list would
    // collapse to the extensionless spelling — silently disabling the whole
    // `.cmd` resolution this exists for. The second guard covers a `PATHEXT`
    // whose entries all fail the leading-dot filter (`";;"`), which lands in
    // the same place by a different road.
    let mut out = raw
        .filter(|v| !v.trim().is_empty())
        .map(parse)
        .unwrap_or_default();
    if out.is_empty() {
        out = parse(DEFAULT_PATHEXT);
    }
    out.push(String::new());
    out
}

#[cfg(unix)]
fn is_executable_file(path: &Path) -> bool {
    use std::os::unix::ffi::OsStrExt;
    // `metadata` follows symlinks, which is what an exec would do too.
    if !std::fs::metadata(path)
        .map(|m| m.is_file())
        .unwrap_or(false)
    {
        return false;
    }
    // Permission *bits* are the wrong question now that the answer is spawned
    // rather than counted. `execvp` skips a match it cannot actually run
    // (EACCES) and keeps walking PATH, so a root-owned 0700 `pylsp` early on
    // PATH must not shadow the 0755 one later — which is exactly what
    // `mode & 0o111 != 0` would do, since it accepts an exec bit belonging to
    // somebody else. `access(X_OK)` asks the kernel the question the spawn
    // will ask.
    let Ok(c_path) = std::ffi::CString::new(path.as_os_str().as_bytes()) else {
        return false;
    };
    // Safety: `c_path` outlives the call and `access` only reads it.
    unsafe { libc::access(c_path.as_ptr(), libc::X_OK) == 0 }
}

#[cfg(not(unix))]
fn is_executable_file(path: &Path) -> bool {
    std::fs::metadata(path)
        .map(|m| m.is_file())
        .unwrap_or(false)
}

/// Resolve inside the distro, through the same `wsl.exe --exec` entry point
/// the real spawn uses, so the probe sees the same PATH the spawn will.
/// `command -v` is a shell builtin, hence `sh -c`; the name goes in as `$0`
/// rather than being interpolated into the script.
#[cfg(windows)]
fn resolves_in_wsl(distro: &str, binary: &str) -> bool {
    crate::modules::workspace::wsl_exec_capture(
        distro,
        "sh",
        &["-c", "command -v -- \"$0\" >/dev/null", binary],
    )
    .is_ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_name_never_resolves() {
        assert!(!resolves(&WorkspaceEnv::Local, ""));
    }

    #[test]
    fn nonexistent_binary_does_not_resolve() {
        assert!(!resolves_on_host("nexis-definitely-not-a-real-binary-xyz"));
    }

    #[test]
    fn a_real_binary_on_path_resolves() {
        // Something guaranteed present on every CI platform we build on.
        let probe = if cfg!(windows) { "cmd" } else { "sh" };
        assert!(resolves_on_host(probe), "expected {probe} on PATH");
    }

    #[test]
    fn an_explicit_path_is_not_looked_up_on_path() {
        // Contains a separator, so it must be treated as a path and fail
        // rather than matching a same-named binary somewhere on PATH.
        assert!(!resolves_on_host("no/such/dir/sh"));
    }

    #[test]
    fn resolution_returns_a_spawnable_path_not_the_bare_name() {
        // The whole point of `resolve_on_host` over a bool: what comes back
        // must be something `Command` can spawn as-is. On Windows that means
        // a PATHEXT spelling, never the bare name a `Command::new` would fail
        // to find.
        let probe = if cfg!(windows) { "cmd" } else { "sh" };
        let resolved = resolve_on_host(probe).expect("probe binary on PATH");
        assert!(resolved.is_absolute(), "{resolved:?} is not absolute");
        assert!(
            is_executable_file(&resolved),
            "{resolved:?} is not runnable"
        );
        #[cfg(windows)]
        assert!(
            resolved.extension().is_some(),
            "{resolved:?} has no extension; CreateProcessW cannot run it"
        );
    }

    #[test]
    fn windows_tries_pathext_before_the_extensionless_name() {
        // npm writes `foo` (a bash script), `foo.cmd` and `foo.ps1` into the
        // same directory. Resolving to the extensionless bash script would be
        // a path that never spawns, so PATHEXT must come first.
        assert_eq!(
            executable_suffixes().last().map(String::as_str),
            Some(""),
            "the extensionless spelling must be the last resort"
        );
        // Asserted through the pure parser so the Windows ordering is covered
        // on every platform, not only on a Windows runner.
        let suffixes = pathext_suffixes(Some(".COM;.EXE;.BAT;.CMD"));
        assert!(
            suffixes.len() > 1 && !suffixes[0].is_empty(),
            "PATHEXT entries must precede the bare name: {suffixes:?}"
        );
        assert_eq!(suffixes.last().map(String::as_str), Some(""));
    }

    #[test]
    fn an_empty_or_unusable_pathext_still_yields_the_shim_extensions() {
        // `PATHEXT=""` reads back as `Some("")`, and `";;"` parses to nothing.
        // Either one collapsing the list to `[""]` would turn every `.cmd`
        // shim back into "not found" — the exact bug this module fixes, but
        // arrived at through the environment instead of through `Command`.
        for raw in [None, Some(""), Some("   "), Some(";;"), Some("bogus")] {
            let suffixes = pathext_suffixes(raw);
            assert!(
                suffixes.iter().any(|s| s.eq_ignore_ascii_case(".cmd")),
                "{raw:?} produced {suffixes:?}, which cannot find a .cmd shim"
            );
            assert_eq!(suffixes.last().map(String::as_str), Some(""));
        }
    }

    #[test]
    fn a_real_pathext_is_honoured_and_ordered() {
        let suffixes = pathext_suffixes(Some(".COM; .EXE ;.CMD"));
        assert_eq!(suffixes, vec![".COM", ".EXE", ".CMD", ""]);
    }

    #[cfg(unix)]
    #[test]
    fn a_file_this_user_cannot_execute_is_not_a_match() {
        // `mode & 0o111 != 0` accepted an exec bit belonging to somebody
        // else, so a 0o001 file looked runnable. That was harmless while the
        // answer was a bool, and wrong once the answer is the path we spawn:
        // `execvp` skips an EACCES match and keeps walking PATH.
        use std::os::unix::fs::PermissionsExt;
        // Root bypasses the check (any exec bit is enough), so this cannot
        // assert anything in a root container.
        // Safety: `geteuid` reads process state and cannot fail.
        if unsafe { libc::geteuid() } == 0 {
            return;
        }
        let path = std::env::temp_dir().join(format!(
            "nexis-tools-x-{}-{:?}",
            std::process::id(),
            std::thread::current().id()
        ));
        std::fs::write(&path, b"#!/bin/sh\ntrue\n").expect("write probe file");
        let set = |mode| {
            std::fs::set_permissions(&path, std::fs::Permissions::from_mode(mode))
                .expect("chmod probe file")
        };

        set(0o001); // executable by "other" only — not by us
        assert!(
            !is_executable_file(&path),
            "0o001 must not count as runnable"
        );
        set(0o644);
        assert!(!is_executable_file(&path));
        set(0o755);
        assert!(is_executable_file(&path));

        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn an_explicit_path_to_a_non_executable_file_is_not_a_match() {
        // The separator branch now walks suffixes too, so it must still reject
        // a path that exists but cannot be run rather than returning it.
        let path = std::env::temp_dir().join(format!(
            "nexis-tools-plain-{}-{:?}",
            std::process::id(),
            std::thread::current().id()
        ));
        std::fs::write(&path, b"not a program").expect("write probe file");
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o644))
                .expect("chmod probe file");
            assert!(resolve_on_host(&path.to_string_lossy()).is_none());
        }
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn an_empty_name_resolves_to_nothing() {
        // `Path::new("").components().count()` is 0, so this must be rejected
        // up front rather than falling through to a PATH walk that joins the
        // suffix onto every directory and matches the directory itself.
        assert!(resolve_on_host("").is_none());
    }

    #[test]
    fn a_directory_is_not_executable() {
        let dir = std::env::temp_dir();
        assert!(!is_executable_file(&dir));
    }
}
