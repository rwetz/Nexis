// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

// Panic-lint gate: no `.unwrap()`/`.expect()` in production code here.
// Tests may still panic (allow-*-in-tests in clippy.toml). CI's
// `clippy -- -D warnings` turns a new one into a build failure.
#![warn(clippy::unwrap_used, clippy::expect_used)]

use std::collections::HashMap;
use std::ffi::{OsStr, OsString};
use std::io::Read;
use std::path::Path;
use std::process::{Command, Stdio};
use std::sync::mpsc;
use std::sync::{Arc, Mutex, OnceLock};
use std::thread;
use std::time::{Duration, Instant};

use shared_child::SharedChild;

use crate::modules::git::errors::{GitError, Result};
use crate::modules::git::types::{
    GitOutput, TextSource, DEFAULT_TIMEOUT_SECS, MAX_FILE_BYTES, MAX_OUTPUT_BYTES,
    MAX_TIMEOUT_SECS, MIN_GIT_VERSION,
};
#[cfg(windows)]
use crate::modules::workspace::validate_wsl_distro_name;
use crate::modules::workspace::WorkspaceEnv;

#[derive(Clone)]
enum Availability {
    Ok,
    NotInstalled,
    TooOld(String),
}

const AVAILABILITY_TTL: Duration = Duration::from_secs(60);

struct AvailabilityCache {
    value: Availability,
    checked_at: Instant,
}

static GIT_AVAILABILITY: OnceLock<Mutex<HashMap<String, AvailabilityCache>>> = OnceLock::new();

fn availability_cell() -> &'static Mutex<HashMap<String, AvailabilityCache>> {
    GIT_AVAILABILITY.get_or_init(|| Mutex::new(HashMap::new()))
}

fn prune_expired_availability_entries(cache: &mut HashMap<String, AvailabilityCache>) {
    cache.retain(|_, entry| entry.checked_at.elapsed() < AVAILABILITY_TTL);
}

fn workspace_cache_key(workspace: &WorkspaceEnv) -> String {
    match workspace {
        WorkspaceEnv::Local => "local".into(),
        WorkspaceEnv::Wsl { distro } => format!("wsl:{distro}"),
    }
}

/// Drop every cached availability answer, so the next `ensure_git_available`
/// re-probes instead of replaying a result from up to `AVAILABILITY_TTL` ago.
///
/// Called by the missing-tools refresh (`modules::tools`): the user pressing
/// it means they just changed the environment, and a stale "not installed"
/// would put the notice back the moment the Source Control panel reloads.
pub(crate) fn invalidate_availability_cache() {
    availability_cell()
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .clear();
}

pub fn ensure_git_available(workspace: &WorkspaceEnv) -> Result<()> {
    let cache_key = workspace_cache_key(workspace);
    let cached = {
        let mut guard = availability_cell()
            .lock()
            .unwrap_or_else(|e| e.into_inner());
        prune_expired_availability_entries(&mut guard);
        guard
            .get(&cache_key)
            .filter(|entry| entry.checked_at.elapsed() < AVAILABILITY_TTL)
            .map(|entry| entry.value.clone())
    };
    let value = match cached {
        Some(v) => v,
        None => {
            let fresh = check_git_availability(workspace);
            let mut guard = availability_cell()
                .lock()
                .unwrap_or_else(|e| e.into_inner());
            prune_expired_availability_entries(&mut guard);
            guard.insert(
                cache_key,
                AvailabilityCache {
                    value: fresh.clone(),
                    checked_at: Instant::now(),
                },
            );
            fresh
        }
    };
    match value {
        Availability::Ok => Ok(()),
        Availability::NotInstalled => Err(GitError::NotInstalled),
        Availability::TooOld(v) => Err(GitError::TooOld {
            found: v,
            required: MIN_GIT_VERSION,
        }),
    }
}

fn check_git_availability(workspace: &WorkspaceEnv) -> Availability {
    let output = match run_git_uncached(workspace, None, ["--version"], 10) {
        Ok(o) => o,
        Err(_) => return Availability::NotInstalled,
    };
    if output.timed_out || output.exit_code != Some(0) {
        return Availability::NotInstalled;
    }
    let stdout = String::from_utf8_lossy(&output.stdout);
    let version = parse_git_version(stdout.trim()).unwrap_or_else(|| "unknown".into());
    if !version_meets_minimum(&version, MIN_GIT_VERSION) {
        return Availability::TooOld(version);
    }
    Availability::Ok
}

fn parse_git_version(line: &str) -> Option<String> {
    line.split_whitespace()
        .find(|tok| tok.chars().next().is_some_and(|c| c.is_ascii_digit()))
        .map(|s| s.split('.').take(3).collect::<Vec<_>>().join("."))
}

fn version_meets_minimum(found: &str, required: &str) -> bool {
    let parse = |s: &str| -> Vec<u32> {
        s.split('.')
            .map(|p| p.parse::<u32>().unwrap_or(0))
            .collect()
    };
    let f = parse(found);
    let r = parse(required);
    for (i, &b) in r.iter().enumerate() {
        let a = f.get(i).copied().unwrap_or(0);
        if a > b {
            return true;
        }
        if a < b {
            return false;
        }
    }
    true
}

pub fn git_show_text(workspace: &WorkspaceEnv, repo_root: &str, spec: &str) -> Result<TextSource> {
    let output = run_git(
        workspace,
        Some(repo_root),
        [
            OsStr::new("show"),
            OsStr::new("--no-textconv"),
            OsStr::new(spec),
        ],
        DEFAULT_TIMEOUT_SECS,
    )?;
    if output.timed_out {
        return Err(GitError::TimedOut("git show"));
    }
    if output.exit_code != Some(0) {
        return Ok(TextSource::Missing);
    }
    Ok(decode_text(output.stdout))
}

pub fn git_stdout_line_opt<I, S>(
    workspace: &WorkspaceEnv,
    cwd: &str,
    args: I,
) -> Result<Option<String>>
where
    I: IntoIterator<Item = S>,
    S: AsRef<OsStr>,
{
    let output = run_git(workspace, Some(cwd), args, DEFAULT_TIMEOUT_SECS)?;
    if output.timed_out {
        return Err(GitError::TimedOut("git command"));
    }
    if output.exit_code != Some(0) {
        return Ok(None);
    }
    let stdout = String::from_utf8_lossy(&output.stdout);
    let line = stdout.lines().next().unwrap_or("").trim();
    if line.is_empty() {
        Ok(None)
    } else {
        Ok(Some(line.to_string()))
    }
}

/// Run git, returning multiple stdout lines (UTF-8). Empty trailing lines stripped.
pub fn git_stdout_lines<I, S>(workspace: &WorkspaceEnv, cwd: &str, args: I) -> Result<Vec<String>>
where
    I: IntoIterator<Item = S>,
    S: AsRef<OsStr>,
{
    let output = run_git(workspace, Some(cwd), args, DEFAULT_TIMEOUT_SECS)?;
    if output.timed_out {
        return Err(GitError::TimedOut("git command"));
    }
    if output.exit_code != Some(0) {
        return Ok(Vec::new());
    }
    let stdout = String::from_utf8_lossy(&output.stdout);
    Ok(stdout
        .lines()
        .map(|line| line.trim_end_matches('\r').to_string())
        .collect())
}

pub fn read_text_file(path: &Path) -> Result<TextSource> {
    let meta = match std::fs::symlink_metadata(path) {
        Ok(m) => m,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(TextSource::Missing),
        Err(e) => return Err(GitError::Io(e)),
    };
    if meta.file_type().is_symlink() {
        return Err(GitError::SymlinkRejected(path.to_path_buf()));
    }
    if !meta.is_file() {
        return Ok(TextSource::Missing);
    }
    let size = meta.len();
    if size > MAX_FILE_BYTES {
        return Err(GitError::FileTooLarge {
            path: path.to_path_buf(),
            size,
            max: MAX_FILE_BYTES,
        });
    }
    let bytes = std::fs::read(path)?;
    Ok(decode_text(bytes))
}

pub fn run_git<I, S>(
    workspace: &WorkspaceEnv,
    cwd: Option<&str>,
    args: I,
    timeout_secs: u64,
) -> Result<GitOutput>
where
    I: IntoIterator<Item = S>,
    S: AsRef<OsStr>,
{
    run_git_uncached(workspace, cwd, args, timeout_secs)
}

fn run_git_uncached<I, S>(
    workspace: &WorkspaceEnv,
    cwd: Option<&str>,
    args: I,
    timeout_secs: u64,
) -> Result<GitOutput>
where
    I: IntoIterator<Item = S>,
    S: AsRef<OsStr>,
{
    let dur = Duration::from_secs(timeout_secs.clamp(1, MAX_TIMEOUT_SECS));
    let args: Vec<OsString> = args
        .into_iter()
        .map(|arg| arg.as_ref().to_os_string())
        .collect();
    let mut cmd = build_git_command(workspace, cwd, &args)?;
    cmd.env("GIT_TERMINAL_PROMPT", "0")
        .env("GIT_ASKPASS", "")
        .env("SSH_ASKPASS", "")
        .env("GIT_OPTIONAL_LOCKS", "0")
        .env("GCM_INTERACTIVE", "Never")
        .env("GCM_PROVIDER", "")
        .env("LC_ALL", "C")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let child = Arc::new(SharedChild::spawn(&mut cmd).map_err(|e| GitError::Spawn(e.to_string()))?);
    let mut stdout_pipe = child
        .take_stdout()
        .ok_or_else(|| GitError::Spawn("no stdout pipe".into()))?;
    let mut stderr_pipe = child
        .take_stderr()
        .ok_or_else(|| GitError::Spawn("no stderr pipe".into()))?;

    let stdout_handle = thread::spawn(move || drain(&mut stdout_pipe, 64 * 1024));
    let stderr_handle = thread::spawn(move || drain(&mut stderr_pipe, 4 * 1024));

    let (tx, rx) = mpsc::channel();
    let waiter = Arc::clone(&child);
    thread::spawn(move || {
        let _ = tx.send(waiter.wait());
    });

    let (exit_code, timed_out) = match rx.recv_timeout(dur) {
        Ok(Ok(status)) => (status.code(), false),
        Ok(Err(e)) => return Err(GitError::Io(e)),
        Err(mpsc::RecvTimeoutError::Timeout) => {
            let _ = child.kill();
            let _ = child.wait();
            (None, true)
        }
        Err(mpsc::RecvTimeoutError::Disconnected) => {
            return Err(GitError::Spawn("git wait thread disconnected".into()));
        }
    };

    let (stdout, stdout_truncated) = stdout_handle.join().unwrap_or((Vec::new(), false));
    let (stderr, _stderr_truncated) = stderr_handle.join().unwrap_or((Vec::new(), false));

    Ok(GitOutput {
        stdout,
        stderr,
        exit_code,
        timed_out,
        truncated: stdout_truncated,
    })
}

fn build_git_command(
    _workspace: &WorkspaceEnv,
    cwd: Option<&str>,
    args: &[OsString],
) -> Result<Command> {
    #[cfg(windows)]
    if let WorkspaceEnv::Wsl { distro } = _workspace {
        validate_wsl_distro_name(distro)
            .map_err(|_| GitError::command("unsafe WSL distro name", distro.clone()))?;
        let mut cmd = crate::modules::proc::command("wsl.exe");
        cmd.arg("-d").arg(distro);
        if let Some(cwd) = cwd.filter(|s| !s.is_empty()) {
            cmd.arg("--cd").arg(cwd);
        }
        cmd.arg("--exec").arg("git");
        cmd.args(args);
        return Ok(cmd);
    }

    let mut cmd = crate::modules::proc::command("git");
    cmd.args(args);
    if let Some(dir) = cwd.filter(|s| !s.is_empty()) {
        cmd.current_dir(Path::new(dir));
    }
    Ok(cmd)
}

pub fn ensure_success(output: &GitOutput, context: &'static str) -> Result<()> {
    if output.timed_out {
        return Err(GitError::TimedOut(context));
    }
    if output.exit_code == Some(0) {
        return Ok(());
    }
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if let Some(err) = classify_auth_error(&stderr) {
        return Err(err);
    }
    if is_identity_error(&stderr) {
        return Err(GitError::IdentityUnknown);
    }
    let detail = if !stderr.is_empty() {
        stderr
    } else if !stdout.is_empty() {
        stdout
    } else {
        "unknown git error".into()
    };
    Err(GitError::CommandFailed { context, detail })
}

fn classify_auth_error(stderr: &str) -> Option<GitError> {
    let lower = stderr.to_ascii_lowercase();
    if lower.contains("could not read username")
        || lower.contains("could not read password")
        || lower.contains("authentication failed")
        || lower.contains("permission denied (publickey)")
        || lower.contains("invalid credentials")
    {
        return Some(GitError::AuthRequired(
            stderr.lines().next().unwrap_or(stderr).to_string(),
        ));
    }
    if lower.contains("host key verification failed") {
        return Some(GitError::HostKeyUnverified);
    }
    None
}

/// Does this stderr mean "git has no author identity"?
///
/// This is classified here, next to the auth errors, because `ensure_success`
/// is the one funnel every git command passes through — `commit` is only the
/// most common way to hit it, and `stash`, `merge`, `revert` and
/// `cherry-pick` all write a commit object and fail identically.
///
/// Left unclassified it arrives as a `CommandFailed` carrying git's whole
/// 12-line block, which the panel renders on a single truncated line: the
/// user gets "Author identity unknown…" and the two commands that would fix
/// it are clipped off the end.
///
/// The markers are matched rather than the exact phrasing because git emits
/// several variants of the same condition — nothing configured and
/// auto-detection failing, auto-detection disabled by
/// `user.useConfigOnly`, or a name/email configured as an empty string.
fn is_identity_error(stderr: &str) -> bool {
    let lower = stderr.to_ascii_lowercase();
    lower.contains("please tell me who you are")
        || lower.contains("unable to auto-detect email address")
        || lower.contains("empty ident name")
        || lower.contains("no name was given and auto-detection is disabled")
        || lower.contains("no email was given and auto-detection is disabled")
}

fn decode_text(bytes: Vec<u8>) -> TextSource {
    let sniff_len = bytes.len().min(8192);
    if bytes[..sniff_len].contains(&0) {
        return TextSource::Binary;
    }
    match String::from_utf8(bytes) {
        Ok(text) => TextSource::Text(text),
        Err(e) => TextSource::Text(String::from_utf8_lossy(&e.into_bytes()).into_owned()),
    }
}

fn drain<R: Read>(reader: &mut R, prealloc: usize) -> (Vec<u8>, bool) {
    let mut out: Vec<u8> = Vec::with_capacity(prealloc.min(MAX_OUTPUT_BYTES));
    let mut buf = [0u8; 16 * 1024];
    let mut truncated = false;
    loop {
        match reader.read(&mut buf) {
            Ok(0) => break,
            Ok(n) => {
                if out.len() >= MAX_OUTPUT_BYTES {
                    truncated = true;
                    continue;
                }
                let take = (MAX_OUTPUT_BYTES - out.len()).min(n);
                out.extend_from_slice(&buf[..take]);
                if take < n {
                    truncated = true;
                }
            }
            Err(_) => break,
        }
    }
    (out, truncated)
}

#[cfg(test)]
mod tests {
    #[cfg(windows)]
    use super::build_git_command;
    use super::{
        decode_text, is_identity_error, parse_git_version, prune_expired_availability_entries,
        version_meets_minimum, Availability, AvailabilityCache, AVAILABILITY_TTL,
    };
    use crate::modules::git::types::TextSource;
    #[cfg(windows)]
    use crate::modules::workspace::WorkspaceEnv;
    use std::collections::HashMap;
    #[cfg(windows)]
    use std::ffi::OsString;
    use std::time::{Duration, Instant};

    // Verbatim from git 2.51, `git commit` with nothing configured. The
    // remedy is in the middle of the block, which is why the panel's
    // single-line truncation loses it and why this is classified instead.
    const IDENTITY_UNSET: &str = "Author identity unknown\n\n\
*** Please tell me who you are.\n\n\
Run\n\n  \
git config --global user.email \"you@example.com\"\n  \
git config --global user.name \"Your Name\"\n\n\
to set your account's default identity.\n\
Omit --global to set the identity only in this repository.\n\n\
fatal: unable to auto-detect email address (got 'ryan@DESKTOP.(none)')";

    #[test]
    fn identity_error_recognised_in_its_variants() {
        assert!(is_identity_error(IDENTITY_UNSET));
        // user.useConfigOnly=true, so git refuses to guess rather than
        // guessing badly. Different wording, same condition.
        assert!(is_identity_error(
            "fatal: no email was given and auto-detection is disabled"
        ));
        assert!(is_identity_error(
            "fatal: no name was given and auto-detection is disabled"
        ));
        // Configured, but to an empty string.
        assert!(is_identity_error(
            "fatal: empty ident name (for <ryan@example.com>) not allowed"
        ));
        // Case is not load-bearing: the match lowercases first.
        assert!(is_identity_error("*** PLEASE TELL ME WHO YOU ARE."));
    }

    #[test]
    fn ordinary_git_failures_are_not_identity_errors() {
        assert!(!is_identity_error("nothing to commit, working tree clean"));
        assert!(!is_identity_error(
            "fatal: not a git repository (or any of the parent directories): .git"
        ));
        assert!(!is_identity_error(
            "error: pathspec 'nope' did not match any file(s) known to git"
        ));
        // An auth failure is classified by classify_auth_error before this
        // runs; it must not also read as an identity problem.
        assert!(!is_identity_error(
            "fatal: Authentication failed for 'https://github.com/rwetz/Nexis.git/'"
        ));
        assert!(!is_identity_error(""));
    }

    #[test]
    fn identity_error_message_names_both_commands_and_the_wsl_trap() {
        // The whole point of the typed error is that the user can act on it
        // without going and finding git's own output.
        let rendered = crate::modules::git::errors::GitError::IdentityUnknown.to_string();
        assert!(rendered.contains("git config --global user.name"));
        assert!(rendered.contains("git config --global user.email"));
        // Issue #47 was reported from a WSL workspace, where setting the
        // identity on the Windows side changes nothing.
        assert!(rendered.contains("WSL"));
    }

    #[test]
    fn extracts_simple_version() {
        assert_eq!(
            parse_git_version("git version 2.42.0"),
            Some("2.42.0".into())
        );
    }

    #[test]
    fn extracts_apple_version() {
        assert_eq!(
            parse_git_version("git version 2.39.3 (Apple Git-145)"),
            Some("2.39.3".into())
        );
    }

    #[test]
    fn version_compare() {
        assert!(version_meets_minimum("2.23.0", "2.23"));
        assert!(version_meets_minimum("2.40.1", "2.23"));
        assert!(version_meets_minimum("3.0.0", "2.23"));
        assert!(!version_meets_minimum("2.22.0", "2.23"));
        assert!(!version_meets_minimum("1.9.5", "2.23"));
        // patch component must not regress the comparison
        assert!(version_meets_minimum("2.23.5", "2.23.4"));
        assert!(!version_meets_minimum("2.23.3", "2.23.4"));
    }

    #[test]
    fn prunes_expired_workspace_availability_entries() {
        let mut cache = HashMap::from([
            (
                "local".to_string(),
                AvailabilityCache {
                    value: Availability::Ok,
                    checked_at: Instant::now(),
                },
            ),
            (
                "wsl:Ubuntu".to_string(),
                AvailabilityCache {
                    value: Availability::NotInstalled,
                    checked_at: Instant::now() - AVAILABILITY_TTL - Duration::from_secs(1),
                },
            ),
        ]);

        prune_expired_availability_entries(&mut cache);

        assert!(cache.contains_key("local"));
        assert!(!cache.contains_key("wsl:Ubuntu"));
    }

    #[cfg(windows)]
    #[test]
    fn builds_wsl_git_command_with_cd_and_exec() {
        let cmd = build_git_command(
            &WorkspaceEnv::Wsl {
                distro: "Ubuntu".into(),
            },
            Some("/home/vinicios/Nova pasta/repo"),
            &[OsString::from("status"), OsString::from("--short")],
        )
        .expect("valid WSL distro");
        let program = cmd.get_program().to_string_lossy().into_owned();
        let args: Vec<String> = cmd
            .get_args()
            .map(|arg| arg.to_string_lossy().into_owned())
            .collect();
        assert_eq!(program, "wsl.exe");
        assert_eq!(
            args,
            vec![
                "-d",
                "Ubuntu",
                "--cd",
                "/home/vinicios/Nova pasta/repo",
                "--exec",
                "git",
                "status",
                "--short",
            ]
        );
    }

    #[cfg(windows)]
    #[test]
    fn rejects_unsafe_wsl_distro_name_for_git_command() {
        let err = build_git_command(
            &WorkspaceEnv::Wsl {
                distro: "../Ubuntu".into(),
            },
            None,
            &[],
        )
        .unwrap_err();
        assert!(err.to_string().contains("unsafe WSL distro name"));
    }

    // Pitfall 13 regression: the old code used `from_utf8(...).unwrap_or("")`
    // which silently discarded all output when bytes were not valid UTF-8 (e.g.
    // Latin-1 encoded commit messages). The fix switches to `from_utf8_lossy`,
    // which replaces invalid bytes with U+FFFD instead of returning empty.

    #[test]
    fn decode_text_with_latin1_bytes_returns_text_with_replacement_chars() {
        // 0xE9 is 'é' in Latin-1 but is not a valid UTF-8 sequence on its own.
        let bytes = vec![b'h', b'i', b' ', 0xE9, b'!'];
        match decode_text(bytes) {
            TextSource::Text(s) => {
                assert!(
                    !s.is_empty(),
                    "output must not be empty for non-UTF-8 input"
                );
                assert!(s.starts_with("hi "), "valid ASCII prefix must be preserved");
                // The invalid byte becomes U+FFFD rather than causing data loss.
                assert!(s.contains('\u{FFFD}'), "replacement char expected for 0xE9");
            }
            other => panic!("expected TextSource::Text, got {other:?}"),
        }
    }

    #[test]
    fn decode_text_with_valid_utf8_returns_text_unchanged() {
        let bytes = "hello, world".as_bytes().to_vec();
        match decode_text(bytes) {
            TextSource::Text(s) => assert_eq!(s, "hello, world"),
            other => panic!("expected TextSource::Text, got {other:?}"),
        }
    }

    #[test]
    fn decode_text_with_null_byte_returns_binary() {
        let bytes = vec![b'h', b'i', 0x00, b'!'];
        assert!(
            matches!(decode_text(bytes), TextSource::Binary),
            "bytes containing NUL must be treated as binary"
        );
    }

    #[test]
    fn from_utf8_lossy_does_not_discard_non_utf8_output() {
        // Documents the invariant behind pitfall 13: from_utf8_lossy must be
        // used (not from_utf8(...).unwrap_or("")) wherever git stdout is decoded.
        let latin1: Vec<u8> = vec![b'r', b'e', b'f', b':', b' ', 0xE9, 0xE0];
        let decoded = String::from_utf8_lossy(&latin1);
        assert!(
            !decoded.is_empty(),
            "from_utf8_lossy must never discard non-UTF-8 bytes"
        );
        assert!(
            decoded.starts_with("ref: "),
            "valid prefix must survive lossy decode"
        );
    }
}
