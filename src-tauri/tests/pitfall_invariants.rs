//! Tripwire tests for the terminal-corruption pitfalls documented in CLAUDE.md.
//!
//! These deliberately scan the source tree: the invariants they protect are
//! lifecycle/ordering properties (ConPTY create/close serialization, console
//! creation flags, panic-free close paths) that a unit test cannot observe
//! without a live pseudoconsole, and that have historically been reintroduced
//! by refactors that looked harmless.
//!
//! If a test in this file fails: do NOT weaken or delete the test. Open
//! CLAUDE.md, read the pitfall named in the failure message, and restore the
//! invariant in the code. Every one of these guards a bug that shipped once.

use std::fs;
use std::path::{Path, PathBuf};

fn src_dir() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("src")
}

fn read_src(rel: &str) -> String {
    let path = src_dir().join(rel);
    fs::read_to_string(&path).unwrap_or_else(|e| panic!("cannot read {}: {e}", path.display()))
}

/// The file's production code: everything before the first `#[cfg(test)]`.
fn production_code(text: &str) -> &str {
    text.split("#[cfg(test)]").next().unwrap_or(text)
}

fn rust_files(dir: &Path, out: &mut Vec<PathBuf>) {
    let entries = fs::read_dir(dir).unwrap_or_else(|e| panic!("read_dir {}: {e}", dir.display()));
    for entry in entries {
        let path = entry.expect("dir entry").path();
        if path.is_dir() {
            rust_files(&path, out);
        } else if path.extension().is_some_and(|e| e == "rs") {
            out.push(path);
        }
    }
}

/// From `source`, the text from `fn_sig_start` to the first newline followed
/// by a column-0 `}` — i.e. the end of a top-level (rustfmt-formatted) fn.
fn fn_body<'a>(source: &'a str, fn_sig_start: &str, file: &str) -> &'a str {
    let start = source.find(fn_sig_start).unwrap_or_else(|| {
        panic!(
            "{file}: `{fn_sig_start}` not found — if the function was renamed, update \
             tests/pitfall_invariants.rs to track it; if it was removed, re-read the \
             matching pitfall in CLAUDE.md first"
        )
    });
    let rest = &source[start..];
    let end = rest.find("\n}").map(|i| i + 2).unwrap_or(rest.len());
    &rest[..end]
}

/// CLAUDE.md pitfalls #1D / #4 — every non-PTY subprocess must be built via
/// `crate::modules::proc::command()`, which pre-applies CREATE_NO_WINDOW.
/// A raw `Command::new` makes Windows pop a console that can corrupt an
/// active ConPTY and blank open terminal tabs. (clippy `disallowed-methods`
/// enforces this too; this test survives someone deleting the clippy config.)
#[test]
fn pitfall_1d_command_new_only_in_proc_rs() {
    let mut files = Vec::new();
    rust_files(&src_dir(), &mut files);
    let mut offenders = Vec::new();
    for file in &files {
        if file.ends_with(Path::new("modules/proc.rs")) {
            continue; // the one sanctioned constructor lives here
        }
        let text = fs::read_to_string(file).unwrap_or_else(|e| panic!("{}: {e}", file.display()));
        for (i, line) in production_code(&text).lines().enumerate() {
            if line.contains("Command::new(") {
                offenders.push(format!("  {}:{}: {}", file.display(), i + 1, line.trim()));
            }
        }
    }
    assert!(
        offenders.is_empty(),
        "raw Command::new outside modules/proc.rs — spawning without CREATE_NO_WINDOW \
         flashes a console and can corrupt an active ConPTY, blanking open terminals \
         (CLAUDE.md pitfalls #1D/#4). Build the command with \
         crate::modules::proc::command() instead:\n{}",
        offenders.join("\n")
    );
}

/// CLAUDE.md pitfall #1A — ConPTY create and close must both hold
/// CONPTY_LIFECYCLE_LOCK. An overlapping CreatePseudoConsole/ClosePseudoConsole
/// corrupts the new console so its shell never prints output.
#[test]
fn pitfall_1a_conpty_lifecycle_lock_guards_create_and_close() {
    let session = read_src("modules/pty/session.rs");
    assert!(
        session.contains("static CONPTY_LIFECYCLE_LOCK"),
        "CONPTY_LIFECYCLE_LOCK is gone from pty/session.rs — removing it reintroduces \
         the blank-terminal race (CLAUDE.md pitfall #1A)"
    );

    let spawn = fn_body(&session, "pub fn spawn(", "pty/session.rs");
    let lock_idx = spawn.find("CONPTY_LIFECYCLE_LOCK").unwrap_or_else(|| {
        panic!(
            "session::spawn() no longer takes CONPTY_LIFECYCLE_LOCK — the create side of \
             the ConPTY race is unguarded (CLAUDE.md pitfall #1A)"
        )
    });
    let openpty_idx = spawn
        .find(".openpty(")
        .expect("session::spawn() should call .openpty(); update this test if renamed");
    assert!(
        lock_idx < openpty_idx,
        "session::spawn() must acquire CONPTY_LIFECYCLE_LOCK BEFORE openpty() — \
         creating the pseudoconsole outside the lock reintroduces the blank-terminal \
         race (CLAUDE.md pitfall #1A)"
    );

    let drop_fn = fn_body(&session, "pub(super) fn drop_session", "pty/session.rs");
    assert!(
        drop_fn.contains("CONPTY_LIFECYCLE_LOCK"),
        "drop_session() no longer holds CONPTY_LIFECYCLE_LOCK — the close side of the \
         ConPTY race is unguarded (CLAUDE.md pitfall #1A)"
    );
}

/// CLAUDE.md pitfalls #1A + #9 — pty_close must (a) route the drop through
/// session::drop_session (which holds the lifecycle lock), (b) do it on a
/// detached thread (ClosePseudoConsole can block until conhost drains, which
/// would freeze the Tauri worker thread), and (c) never panic.
#[test]
fn pitfall_1a_pty_close_drops_via_detached_drop_session() {
    let module = read_src("modules/pty/mod.rs");
    let body = fn_body(&module, "pub fn pty_close(", "pty/mod.rs");
    assert!(
        body.contains("session::drop_session"),
        "pty_close must drop the session via session::drop_session so the drop holds \
         CONPTY_LIFECYCLE_LOCK — a direct drop(s) reintroduces the blank-terminal race \
         (CLAUDE.md pitfall #1A)"
    );
    assert!(
        body.contains("thread::Builder"),
        "pty_close must drop the session on a detached thread — ClosePseudoConsole can \
         block until conhost drains, freezing the Tauri worker thread (CLAUDE.md \
         pitfall #1A)"
    );
    assert!(
        !body.contains(".unwrap()") && !body.contains(".expect("),
        "pty_close runs on a Tauri worker thread: a panic there crashes the whole app \
         (CLAUDE.md pitfall #9). Handle the error instead of unwrapping."
    );
}

/// CLAUDE.md pitfall #1C — pty_open must gate the requested cwd through
/// authorize_spawn_cwd; skipping it silently yields a blank terminal for any
/// path outside the authorized workspace roots.
#[test]
fn pitfall_1c_pty_open_authorizes_spawn_cwd() {
    let module = read_src("modules/pty/mod.rs");
    let body = fn_body(&module, "pub async fn pty_open(", "pty/mod.rs");
    assert!(
        body.contains("authorize_spawn_cwd("),
        "pty_open must call authorize_spawn_cwd on the requested cwd (CLAUDE.md \
         pitfall #1C)"
    );
}

/// CLAUDE.md pitfall #1B — PowerShell must be launched with `-Command` (and
/// the profile path in NEXIS_PWSH_PROFILE), never `-File profile.ps1`. The
/// -File script→interactive transition races ConPTY output initialization and
/// silently drops the first prompt.
#[test]
fn pitfall_1b_powershell_launches_with_command_not_file() {
    let init = read_src("modules/pty/shell_init.rs");
    assert!(
        init.contains(r#"cmd.arg("-Command");"#),
        "PowerShell must be launched via -Command (CLAUDE.md pitfall #1B)"
    );
    assert!(
        init.contains(r#"cmd.env("NEXIS_PWSH_PROFILE""#),
        "the PowerShell profile path must be passed via the NEXIS_PWSH_PROFILE env var, \
         not interpolated into the command string (CLAUDE.md pitfall #1B)"
    );
    assert!(
        !init.contains(r#""-File""#),
        "PowerShell must never be launched with -File — the script-mode → interactive \
         transition races ConPTY output initialization and eats the first prompt \
         (CLAUDE.md pitfall #1B)"
    );
}

/// 1.20.6 performance sweep — Tauri runs non-`async` commands on the main
/// thread, so a sync heavy command stalls the UI event loop and every queued
/// IPC call (terminal keystrokes included) behind it. These commands were all
/// converted to `async fn` + the blocking pool in 1.20.6; a refactor that
/// quietly drops the `async` reintroduces app-wide stalls with no test
/// failure and no visible error. New heavy commands (filesystem walks,
/// subprocess probes, anything that can take >10ms) belong on this list.
#[test]
fn heavy_commands_stay_async() {
    const HEAVY_COMMANDS: &[&str] = &[
        // filesystem walks / IO
        "fs_grep",
        "fs_glob",
        "fs_search",
        "fs_list_files",
        "fs_read_dir",
        "list_subdirs",
        "fs_read_file",
        "fs_write_file",
        "fs_read_file_ai",
        "fs_delete",
        "fs_create_file",
        "fs_create_dir",
        "fs_rename",
        // process spawns / probes
        "shell_session_open",
        "shell_session_run",
        "shell_run_command",
        "shell_bg_spawn",
        "read_shell_history",
        "search_shell_history",
        "ml_detect",
        "ml_env",
        "ml_gpu_probe",
        "ml_download",
        "ml_install_local",
        "wsl_home",
        "wsl_list_distros",
        "wsl_default_distro",
        "list_crash_reports",
        // PTY spawn (ConPTY setup + shell process launch)
        "pty_open",
    ];

    let mut files = Vec::new();
    rust_files(&src_dir(), &mut files);
    let sources: Vec<(PathBuf, String)> = files
        .into_iter()
        .map(|f| {
            let text = fs::read_to_string(&f).unwrap_or_else(|e| panic!("{}: {e}", f.display()));
            (f, text)
        })
        .collect();

    for name in HEAVY_COMMANDS {
        let sync_sig = format!("pub fn {name}(");
        let async_sig = format!("pub async fn {name}(");
        let mut found = false;
        for (file, text) in &sources {
            let prod = production_code(text);
            assert!(
                !prod.contains(&sync_sig),
                "{}: `{name}` is a known-heavy command declared as a sync `pub fn` — \
                 Tauri runs it on the main thread, stalling the UI and all queued IPC \
                 (the exact class of freeze fixed in 1.20.6). Declare it `pub async fn` \
                 and run the work via modules::heavy()/spawn_blocking.",
                file.display()
            );
            if prod.contains(&async_sig) {
                found = true;
            }
        }
        assert!(
            found,
            "heavy command `{name}` not found as `pub async fn` anywhere under src/ — \
             if it was renamed, update HEAVY_COMMANDS in tests/pitfall_invariants.rs; \
             if it was removed, delete it from the list (re-read the 1.20.6 CHANGELOG \
             entry first)"
        );
    }
}

/// Hardening backlog (2026-07) — PTY input byte order. xterm.js emits
/// frontend-generated device-query replies (DA/DSR/CPR cursor reports) through
/// the same `onData` stream as user keystrokes, and every write reaches Rust
/// as an ordinary `pty_write` call. Order on the PTY therefore rests on two
/// properties of `pty_write`, both invisible to a unit test:
/// (a) it stays a **sync** command — Tauri executes sync commands on the main
///     thread in IPC arrival order, while async commands run concurrently and
///     two rapid writes could enqueue reordered;
/// (b) it only **enqueues** to `Session.write_tx` — the single per-session
///     `nexis-pty-writer` thread is what serializes bytes onto the PTY.
/// Upstream terax hit exactly this reply-vs-keystroke interleaving class in
/// July 2026 (their #1004); Nexis is immune only while both properties hold.
/// (The frontend half — `pty_write` invoked only from pty-bridge.ts — is
/// guarded in src/lib/pitfall-guards.test.ts.)
#[test]
fn pty_write_stays_sync_and_enqueue_only() {
    let module = read_src("modules/pty/mod.rs");
    assert!(
        !production_code(&module).contains("pub async fn pty_write("),
        "pty_write must stay a sync command — async commands run concurrently, so two \
         rapid writes (keystrokes, DA/DSR/CPR query replies) can reach the writer \
         channel out of order"
    );
    let body = fn_body(&module, "pub fn pty_write(", "pty/mod.rs");
    assert!(
        body.contains("write_tx.send("),
        "pty_write must enqueue to Session.write_tx — the per-session writer thread is \
         what guarantees byte order on the PTY"
    );
    // Comment lines don't count — the function's own comment explains *why*
    // spawn_blocking is banned, which must not trip the ban itself.
    let code_only: String = body
        .lines()
        .filter(|l| !l.trim_start().starts_with("//"))
        .collect::<Vec<_>>()
        .join("\n");
    for banned in ["spawn_blocking", "thread::spawn", "write_all"] {
        assert!(
            !code_only.contains(banned),
            "pty_write must not use {banned}: a direct write can block the main thread \
             (Ctrl+S flow control) and a per-write task can reorder rapid writes — \
             enqueue to the writer channel only"
        );
    }
}

/// CLAUDE.md pitfall #8 — these subsystems share mutexes/RwLocks between
/// reader threads and Tauri command handlers; a bare `.unwrap()` on a lock
/// turns one panicked thread into a permanently dead subsystem (silent
/// terminal, bricked shell tools, dead LSP/DAP) via poison cascade.
/// Production code must recover with `.unwrap_or_else(|e| e.into_inner())`.
#[test]
fn pitfall_8_no_lock_unwrap_in_shared_thread_modules() {
    const FILES: &[&str] = &[
        "modules/pty/session.rs",
        "modules/pty/mod.rs",
        "modules/shell/mod.rs",
        "modules/shell/session.rs",
        "modules/shell/background.rs",
        "modules/lsp/session.rs",
        "modules/dap/session.rs",
    ];
    const PATTERNS: &[&str] = &[".lock().unwrap()", ".read().unwrap()", ".write().unwrap()"];
    for rel in FILES {
        let text = read_src(rel);
        for (i, line) in production_code(&text).lines().enumerate() {
            for pat in PATTERNS {
                assert!(
                    !line.contains(pat),
                    "{rel}:{}: use {}_or_else(|e| e.into_inner()) — a poisoned lock in \
                     this module must be recovered, not cascaded into a permanently \
                     dead subsystem (CLAUDE.md pitfall #8)",
                    i + 1,
                    pat.trim_end_matches("()")
                );
            }
        }
    }
}

/// CLAUDE.md pitfall #16 — a NUL separator inside a git `--format`/`--pretty`
/// argument must be git's own escape (`%x00` for pretty formats, `%00` for
/// for-each-ref), never a literal `\x00` in the Rust string.
///
/// A literal NUL is an interior nul byte in a process argument, which
/// `Command::spawn` rejects with InvalidInput ("nul byte found in provided
/// data") on every platform — so git never launches at all. Both known
/// occurrences shipped: `stash list` returned a permanently empty stash list,
/// and `for-each-ref` broke branch listing and switching.
#[test]
fn pitfall_16_no_literal_nul_in_git_cli_args() {
    let mut files = Vec::new();
    rust_files(&src_dir(), &mut files);
    let mut offenders = Vec::new();
    for file in &files {
        let text = fs::read_to_string(file).unwrap_or_else(|e| panic!("{}: {e}", file.display()));
        for (i, line) in production_code(&text).lines().enumerate() {
            if line.trim_start().starts_with("//") {
                continue; // the explanatory comments next to the fixes
            }
            // `"--` marks a CLI flag string literal; the escapes below are a
            // literal NUL. Output *parsing* (`splitn(2, '\x00')`) has no `"--`
            // on the line, so it is not matched.
            let has_flag_literal = line.contains("\"--");
            let has_literal_nul = line.contains("\\x00") || line.contains("\\u{0}");
            if has_flag_literal && has_literal_nul {
                offenders.push(format!("  {}:{}: {}", file.display(), i + 1, line.trim()));
            }
        }
    }
    assert!(
        offenders.is_empty(),
        "literal NUL inside a git CLI argument — Command::spawn rejects interior nul \
         bytes, so git never runs and the feature silently returns nothing \
         (CLAUDE.md pitfall #16). Use git's escape instead: `%x00` in a \
         --format/--pretty log format, `%00` in a for-each-ref format:\n{}",
        offenders.join("\n")
    );
}
