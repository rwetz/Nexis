// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

// Panic-lint gate: no `.unwrap()`/`.expect()` in production code here.
// Tests may still panic (allow-*-in-tests in clippy.toml). CI's
// `clippy -- -D warnings` turns a new one into a build failure.
#![warn(clippy::unwrap_used, clippy::expect_used)]

use std::ffi::OsStr;
use std::process::Command;

/// The only sanctioned constructor for non-PTY subprocesses.
///
/// Returns a `Command` with the Windows `CREATE_NO_WINDOW` creation flag
/// already applied. A raw `std::process::Command::new` in a GUI app makes
/// Windows create a temporary console for the child: it flashes on screen
/// and — if a terminal tab is open — races ConPTY I/O and can silence the
/// active pseudoconsole (CLAUDE.md pitfalls #1D / #4). Constructing through
/// this function makes that mistake unrepresentable; clippy's
/// `disallowed-methods` (clippy.toml) rejects direct `Command::new` calls.
///
/// PTY sessions are exempt: they go through `portable_pty`, which sets the
/// flag internally — do not route them through here.
pub fn command(program: impl AsRef<OsStr>) -> Command {
    #[allow(clippy::disallowed_methods)] // the one sanctioned Command::new
    let mut cmd = Command::new(program);
    hide_console(&mut cmd);
    cmd
}

#[cfg(windows)]
fn hide_console(cmd: &mut Command) {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    cmd.creation_flags(CREATE_NO_WINDOW);
}

#[cfg(not(windows))]
#[inline]
fn hide_console(_cmd: &mut Command) {}
