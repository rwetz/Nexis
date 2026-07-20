// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

//! Native filesystem watching for the file explorer.
//!
//! Replaces a 3-second `tree.refresh` poll, which cost a full directory
//! re-list every tick regardless of whether anything changed, and still made
//! the user wait up to 3 s to see a file their build just produced.
//!
//! Three properties shape the design:
//!
//! 1. **Watching can legitimately fail.** A recursive watch on a large tree
//!    can exhaust Linux's `fs.inotify.max_user_watches` (commonly 8192 —
//!    a `node_modules` alone can blow that). `fs_watch_start` therefore
//!    returns whether the watch was actually established, and the frontend
//!    keeps its poll as a fallback rather than assuming success. A silent
//!    failure here would look like "the file tree stopped updating".
//!
//! 2. **Events are debounced in Rust, not the frontend.** A single `git
//!    checkout` or `cargo build` produces thousands of events in a burst;
//!    forwarding each one over IPC would flood the webview with work it would
//!    only coalesce anyway. One coalesced event per quiet period crosses the
//!    boundary instead.
//!
//! 3. **The payload is a signal, not a diff.** The frontend re-lists the
//!    visible tree, exactly as the poll did — it does not try to apply
//!    per-path deltas. Path-level patching of a lazily-expanded tree is a far
//!    larger change, and the re-list is already cheap enough that the poll
//!    did it every 3 s unconditionally.

// Panic-lint gate: no `.unwrap()`/`.expect()` in production code here.
// Tests may still panic (allow-*-in-tests in clippy.toml). CI's
// `clippy -- -D warnings` turns a new one into a build failure.
#![warn(clippy::unwrap_used, clippy::expect_used)]

use std::path::{Path, PathBuf};
use std::sync::mpsc::{channel, RecvTimeoutError};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use notify::{RecommendedWatcher, RecursiveMode, Watcher};
use tauri::{AppHandle, Emitter};

/// Event name the frontend listens on.
pub const FS_CHANGED_EVENT: &str = "nexis://fs-changed";

/// Quiet period before a burst of events is reported as one change. Long
/// enough to coalesce a `git checkout` or a build's write storm, short enough
/// that a hand-saved file feels immediate.
const DEBOUNCE: Duration = Duration::from_millis(250);

/// Directory names never worth watching. These are the trees that both
/// generate the most churn and blow the inotify watch limit; excluding them
/// is what makes a recursive watch viable on a real project at all.
const IGNORED_DIRS: &[&str] = &[
    ".git",
    "node_modules",
    "target",
    "dist",
    "build",
    ".next",
    ".venv",
    "venv",
    "__pycache__",
    ".cache",
];

fn is_ignored(path: &Path) -> bool {
    path.components().any(|c| {
        c.as_os_str()
            .to_str()
            .is_some_and(|name| IGNORED_DIRS.contains(&name))
    })
}

/// The active watch. Only one root is watched at a time — the explorer shows
/// one root, and keeping several alive would multiply the watch-descriptor
/// cost for trees nobody is looking at.
struct ActiveWatch {
    root: PathBuf,
    /// Dropping the watcher unregisters the OS-level watch.
    _watcher: RecommendedWatcher,
    /// Set to stop the debounce thread; it checks this between batches.
    stop: Arc<Mutex<bool>>,
}

fn active() -> &'static Mutex<Option<ActiveWatch>> {
    static ACTIVE: std::sync::OnceLock<Mutex<Option<ActiveWatch>>> = std::sync::OnceLock::new();
    ACTIVE.get_or_init(|| Mutex::new(None))
}

/// Tear down the current watch, if any. Idempotent.
fn stop_active() {
    let mut guard = active().lock().unwrap_or_else(|e| e.into_inner());
    if let Some(w) = guard.take() {
        if let Ok(mut stop) = w.stop.lock() {
            *stop = true;
        }
        // `w` drops here, unregistering the watcher; the debounce thread sees
        // its channel disconnect and exits.
    }
}

/// Begin watching `path` recursively.
///
/// Returns `false` when the watch could not be established (permissions,
/// watch-descriptor exhaustion, path gone). That is a normal outcome on large
/// trees, not an error — the caller falls back to polling.
#[tauri::command]
pub async fn fs_watch_start(app: AppHandle, path: String) -> Result<bool, String> {
    crate::modules::heavy(move || {
        let root = PathBuf::from(&path);
        if !root.is_dir() {
            return Ok(false);
        }

        // Re-watching the same root is a no-op rather than a churn of
        // teardown/setup — the explorer re-runs its effect on unrelated
        // re-renders.
        {
            let guard = active().lock().unwrap_or_else(|e| e.into_inner());
            if guard.as_ref().is_some_and(|w| w.root == root) {
                return Ok(true);
            }
        }
        stop_active();

        let (tx, rx) = channel();
        let mut watcher = match notify::recommended_watcher(move |res| {
            // A send failure means the debounce thread is gone; nothing to do
            // but drop the event.
            let _ = tx.send(res);
        }) {
            Ok(w) => w,
            Err(e) => {
                log::warn!("[fswatch] could not create watcher: {e}");
                return Ok(false);
            }
        };

        if let Err(e) = watcher.watch(&root, RecursiveMode::Recursive) {
            // The common real-world failure: too many watch descriptors.
            log::warn!("[fswatch] watch failed for {}: {e}", root.display());
            return Ok(false);
        }

        let stop = Arc::new(Mutex::new(false));
        let thread_stop = Arc::clone(&stop);
        std::thread::Builder::new()
            .name("nexis-fswatch".into())
            .spawn(move || {
                // Blocks until something happens; ends when the sender is
                // dropped, i.e. the watch was torn down.
                while let Ok(first) = rx.recv() {
                    let mut relevant = event_is_relevant(&first);
                    // Coalesce: keep draining until the tree goes quiet for
                    // one debounce period.
                    loop {
                        match rx.recv_timeout(DEBOUNCE) {
                            Ok(ev) => relevant |= event_is_relevant(&ev),
                            Err(RecvTimeoutError::Timeout) => break,
                            Err(RecvTimeoutError::Disconnected) => return,
                        }
                    }
                    if thread_stop.lock().is_ok_and(|s| *s) {
                        break;
                    }
                    if relevant {
                        let _ = app.emit(FS_CHANGED_EVENT, ());
                    }
                }
            })
            .map_err(|e| format!("spawn fswatch thread: {e}"))?;

        let mut guard = active().lock().unwrap_or_else(|e| e.into_inner());
        *guard = Some(ActiveWatch {
            root,
            _watcher: watcher,
            stop,
        });
        Ok(true)
    })
    .await
}

/// Stop watching. Safe to call when nothing is being watched.
#[tauri::command]
pub async fn fs_watch_stop() -> Result<(), String> {
    crate::modules::heavy(|| {
        stop_active();
        Ok(())
    })
    .await
}

/// Whether an event should wake the explorer.
///
/// Events inside ignored directories are dropped here rather than by not
/// watching them: `RecursiveMode::Recursive` gives no per-subtree exclusion,
/// so the watch covers them regardless and the filtering has to happen on the
/// event. Without this a background `cargo build` would refresh the tree
/// continuously for changes the user cannot see.
fn event_is_relevant(res: &notify::Result<notify::Event>) -> bool {
    match res {
        Ok(event) => {
            if !matches!(
                event.kind,
                notify::EventKind::Create(_)
                    | notify::EventKind::Remove(_)
                    | notify::EventKind::Modify(_)
            ) {
                return false;
            }
            event.paths.iter().any(|p| !is_ignored(p))
        }
        // An error still means "something happened we may have missed" —
        // refresh rather than risk a stale tree.
        Err(_) => true,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use notify::event::{CreateKind, ModifyKind, RemoveKind};
    use notify::{Event, EventKind};

    fn event(kind: EventKind, paths: &[&str]) -> notify::Result<Event> {
        Ok(Event {
            kind,
            paths: paths.iter().map(PathBuf::from).collect(),
            attrs: Default::default(),
        })
    }

    #[test]
    fn ignores_paths_inside_noisy_directories() {
        assert!(is_ignored(Path::new("/p/node_modules/x/index.js")));
        assert!(is_ignored(Path::new("/p/.git/HEAD")));
        assert!(is_ignored(Path::new("/p/target/debug/build.log")));
        assert!(!is_ignored(Path::new("/p/src/main.rs")));
    }

    #[test]
    fn does_not_treat_a_substring_match_as_ignored() {
        // "target" must match a whole path component, not a prefix — a real
        // source directory called `targeting/` is not build output.
        assert!(!is_ignored(Path::new("/p/targeting/main.rs")));
        assert!(!is_ignored(Path::new("/p/my_node_modules_notes.md")));
    }

    #[test]
    fn create_remove_and_modify_are_relevant() {
        for kind in [
            EventKind::Create(CreateKind::File),
            EventKind::Remove(RemoveKind::File),
            EventKind::Modify(ModifyKind::Any),
        ] {
            assert!(event_is_relevant(&event(kind, &["/p/src/main.rs"])));
        }
    }

    #[test]
    fn access_events_are_not_relevant() {
        // Reading a file must not refresh the tree — an editor or a grep
        // would otherwise keep it churning.
        assert!(!event_is_relevant(&event(
            EventKind::Access(notify::event::AccessKind::Read),
            &["/p/src/main.rs"],
        )));
    }

    #[test]
    fn events_confined_to_ignored_dirs_are_dropped() {
        assert!(!event_is_relevant(&event(
            EventKind::Modify(ModifyKind::Any),
            &["/p/target/debug/x", "/p/node_modules/y"],
        )));
    }

    #[test]
    fn a_mixed_batch_still_refreshes() {
        // One visible path among ignored ones must still wake the explorer.
        assert!(event_is_relevant(&event(
            EventKind::Modify(ModifyKind::Any),
            &["/p/target/debug/x", "/p/src/main.rs"],
        )));
    }

    #[test]
    fn watcher_errors_refresh_rather_than_risk_a_stale_tree() {
        let err: notify::Result<Event> = Err(notify::Error::generic("overflow"));
        assert!(event_is_relevant(&err));
    }

    /// End-to-end against the real OS watcher: the unit tests above only cover
    /// the filter, and a filter that is correct about events it never receives
    /// is worthless. This asserts the platform backend actually delivers a
    /// change for a file created under a watched root, and that the change
    /// survives `event_is_relevant`.
    #[test]
    fn real_file_creation_produces_a_relevant_event() {
        let dir = tempfile::tempdir().expect("tempdir");
        let (tx, rx) = channel();
        let mut watcher = notify::recommended_watcher(move |res| {
            let _ = tx.send(res);
        })
        .expect("watcher");
        watcher
            .watch(dir.path(), RecursiveMode::Recursive)
            .expect("watch tempdir");

        std::fs::write(dir.path().join("hello.txt"), b"hi").expect("write");

        // Poll until a relevant event lands or we give up. A fixed sleep would
        // be flaky on a loaded machine and slow on an idle one.
        let deadline = std::time::Instant::now() + Duration::from_secs(5);
        let mut saw_relevant = false;
        while std::time::Instant::now() < deadline {
            match rx.recv_timeout(Duration::from_millis(250)) {
                Ok(ev) => {
                    if event_is_relevant(&ev) {
                        saw_relevant = true;
                        break;
                    }
                }
                Err(RecvTimeoutError::Timeout) => continue,
                Err(RecvTimeoutError::Disconnected) => break,
            }
        }
        assert!(
            saw_relevant,
            "the OS watcher delivered no relevant event for a created file"
        );
    }

    /// A file created inside an ignored directory must NOT wake the explorer,
    /// verified against the real watcher rather than a synthetic event — this
    /// is the case that keeps a background build from refreshing the tree
    /// continuously.
    #[test]
    fn real_changes_inside_ignored_dirs_are_filtered_out() {
        let dir = tempfile::tempdir().expect("tempdir");
        let nested = dir.path().join("node_modules").join("pkg");
        std::fs::create_dir_all(&nested).expect("mkdir");

        let (tx, rx) = channel();
        let mut watcher = notify::recommended_watcher(move |res| {
            let _ = tx.send(res);
        })
        .expect("watcher");
        watcher
            .watch(dir.path(), RecursiveMode::Recursive)
            .expect("watch tempdir");

        std::fs::write(nested.join("index.js"), b"x").expect("write");

        let deadline = std::time::Instant::now() + Duration::from_secs(2);
        while std::time::Instant::now() < deadline {
            match rx.recv_timeout(Duration::from_millis(200)) {
                Ok(ev) => assert!(
                    !event_is_relevant(&ev),
                    "a node_modules write must not wake the explorer: {ev:?}"
                ),
                Err(RecvTimeoutError::Timeout) => continue,
                Err(RecvTimeoutError::Disconnected) => break,
            }
        }
    }
}
